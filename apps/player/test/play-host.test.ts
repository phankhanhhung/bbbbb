import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Scene } from '@combviz/schema';
import {
  PlayHost,
  PLAY_SCRIPT_MS,
  PLAY_SOLVE_MS,
  type PlayRequest,
  type PlayResponse,
  type PlayWorkerLike,
} from '../src/play-host.js';

/**
 * Đồng hồ **ngoài** tiến trình (NFR-S2, M78.6).
 *
 * Câu hỏi ở đây không phải "gửi thông điệp đi được không" mà là **giết được mã không
 * chịu dừng không** — và câu ấy chỉ hỏi được bằng một worker cố tình không bao giờ trả
 * lời. Trần trong tiến trình của `interpreter.ts` không trả lời được nó: nó soát hạn mỗi
 * $2048$ bước, nên một builtin duyệt cấu trúc khổng lồ *trong một bước* không bao giờ
 * chạm tới chỗ soát.
 */

const scene = { engine: 'board', config: { rows: 2, cols: 2 }, elements: [] } as unknown as Scene;

const MOVES: Omit<Extract<PlayRequest, { kind: 'moves' }>, 'id'> = {
  kind: 'moves',
  engine: 'board',
  script: 'moves { for c in cells : move board/chomp-bite(at: c) }',
  scene,
  player: 'left',
};

const SOLVE: Omit<Extract<PlayRequest, { kind: 'solve' }>, 'id'> = {
  kind: 'solve',
  engine: 'board',
  rule: 'chomp',
  scene,
  toMove: 'left',
  misere: true,
};

/** Worker giả: trả lời khi được bảo, và **đếm số lần bị giết**. */
class Fake implements PlayWorkerLike {
  onmessage: ((event: { data: PlayResponse }) => void) | null = null;
  readonly sent: PlayRequest[] = [];
  killed = 0;

  postMessage(message: PlayRequest): void {
    this.sent.push(message);
  }
  terminate(): void {
    this.killed += 1;
  }
  /** Giả vờ worker trả lời cho yêu cầu thứ `index`. */
  reply(index: number, response: Omit<PlayResponse, 'id'>): void {
    const request = this.sent[index];
    if (!request) throw new Error(`chưa có yêu cầu thứ ${index}`);
    this.onmessage?.({ data: { ...response, id: request.id } });
  }
}

let made: Fake[] = [];
const host = () => new PlayHost(() => {
  const fake = new Fake();
  made.push(fake);
  return fake;
});

beforeEach(() => {
  made = [];
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('đường thẳng', () => {
  it('trả lời tới thì hạn giờ **không** nổ nữa', async () => {
    const h = host();
    const promise = h.request(MOVES);
    made[0]!.reply(0, { ok: true, result: [] });
    await expect(promise).resolves.toMatchObject({ ok: true });

    // Đi quá hạn rồi mà worker vẫn sống: dọn hạn giờ là một phần của việc trả lời, không
    // phải một tối ưu. Không dọn thì mọi yêu cầu *đã xong* vẫn giết worker sau 100ms.
    vi.advanceTimersByTime(PLAY_SCRIPT_MS * 10);
    expect(made[0]!.killed).toBe(0);
    expect(made).toHaveLength(1);
  });

  it('nhiều yêu cầu dùng chung một worker, và mỗi cái về đúng chỗ của nó', async () => {
    const h = host();
    const a = h.request(MOVES);
    const b = h.request(MOVES);
    made[0]!.reply(1, { ok: true, error: undefined, result: [] });
    made[0]!.reply(0, { ok: false, error: 'lỗi của a' });
    await expect(a).resolves.toMatchObject({ ok: false, error: 'lỗi của a' });
    await expect(b).resolves.toMatchObject({ ok: true });
    expect(made).toHaveLength(1);
  });

  it('trả lời cho một yêu cầu đã bỏ thì **bỏ qua**, không ném', () => {
    const h = host();
    void h.request(MOVES);
    expect(() => made[0]!.onmessage?.({ data: { id: 999, ok: true } })).not.toThrow();
  });
});

describe('mã không chịu dừng thì **bị giết**, và có chữ', () => {
  it(`script quá ${PLAY_SCRIPT_MS}ms ⇒ terminate + lời báo`, async () => {
    const h = host();
    const promise = h.request(MOVES);
    vi.advanceTimersByTime(PLAY_SCRIPT_MS + 1);

    const out = await promise;
    expect(out.ok).toBe(false);
    expect(out.error).toContain(`${PLAY_SCRIPT_MS}ms`);
    expect(made[0]!.killed).toBe(1);
  });

  it('sau khi giết thì yêu cầu sau **dựng worker mới**, không gửi vào xác', async () => {
    // Không dựng lại thì bảng chơi chết hẳn sau một script hỏng, và người học phải tải
    // lại trang — một lỗi tạm biến thành một lỗi vĩnh viễn.
    const h = host();
    const dead = h.request(MOVES);
    vi.advanceTimersByTime(PLAY_SCRIPT_MS + 1);
    await dead;

    const next = h.request(MOVES);
    expect(made).toHaveLength(2);
    made[1]!.reply(0, { ok: true, result: [] });
    await expect(next).resolves.toMatchObject({ ok: true });
  });

  it('giết worker thì **mọi** yêu cầu đang chờ được đóng, không chỉ cái quá hạn', async () => {
    // Chỗ này dễ sai theo hướng im lặng: chỉ báo lỗi cho cái hết giờ thì những cái còn
    // lại đợi một tiến trình không còn tồn tại — spinner quay mãi mà không có lỗi nào,
    // tức đúng cái NFR-S2 bắt phải tránh.
    const h = host();
    const first = h.request(MOVES);
    vi.advanceTimersByTime(PLAY_SCRIPT_MS - 10);
    const second = h.request(MOVES);
    vi.advanceTimersByTime(11);

    await expect(first).resolves.toMatchObject({ ok: false });
    const late = await second;
    expect(late.ok).toBe(false);
    expect(late.error).not.toBeUndefined();
  });

  it('`dispose` cũng đóng mọi yêu cầu — đóng bảng không để lại lời hứa treo', async () => {
    const h = host();
    const promise = h.request(SOLVE);
    h.dispose();
    await expect(promise).resolves.toMatchObject({ ok: false });
    expect(made[0]!.killed).toBe(1);
  });
});

describe('hai loại việc, **hai** cái hạn', () => {
  it('solver không bị trần script giết — nó được phép chạy vài giây', async () => {
    // Chomp 6×6 mất 0,83s. Áp 100ms vào đây là giết đúng thứ M78.5 vừa xây, và triệu
    // chứng sẽ là "solver không bao giờ trả lời" chứ không phải một lỗi đọc được.
    const h = host();
    const promise = h.request(SOLVE);
    vi.advanceTimersByTime(PLAY_SCRIPT_MS * 20);
    expect(made[0]!.killed).toBe(0);

    made[0]!.reply(0, { ok: true, result: { winner: 'left', winningMoves: [], states: 1846, refused: null } });
    await expect(promise).resolves.toMatchObject({ ok: true });
  });

  it('nhưng solver **cũng** có lưới cuối, không chạy vô hạn', async () => {
    const h = host();
    const promise = h.request(SOLVE);
    vi.advanceTimersByTime(PLAY_SOLVE_MS + 1);
    const out = await promise;
    expect(out.ok).toBe(false);
    expect(out.error).toContain(`${PLAY_SOLVE_MS}ms`);
    expect(made[0]!.killed).toBe(1);
  });

  it('trần script **chặt hơn** trần giải — hai con số, không phải một', () => {
    expect(PLAY_SCRIPT_MS).toBeLessThan(PLAY_SOLVE_MS);
  });
});
