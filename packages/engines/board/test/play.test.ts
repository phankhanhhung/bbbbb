import { describe, expect, it } from 'vitest';
import type { Scene } from '@combviz/schema';
import {
  createPlay,
  playMove,
  replayPlay,
  toDraftSteps,
  type PlayPlayer,
  type PlaySession,
} from '@combviz/editor';
import { boardCommands, boardPlayRules, checkBoardPlay } from '../src/index.js';

/**
 * **Chomp** (GM-01, M78.3) — họ luật đầu tiên mà thế cờ không phải một đa tập số.
 *
 * Mục này hỏi hai chuyện khác nhau, và chuyện thứ hai mới là chuyện lớn:
 *
 *  1. Luật có đúng không — ăn một ô thì mất cả góc phần tư, ô độc xoá cả bàn.
 *  2. **Lớp ván có tổng quát thật không.** M78.1 đặt cược rằng hợp đồng `Move` đủ cho
 *     mọi substrate; bốc đống không phản bác được lời ấy vì shell được dựng khi nim đã
 *     có. Bàn cờ thì có.
 */

const rules = boardPlayRules('chomp')!;

const board = (rows: number, cols: number, holes: [number, number][] = []): Scene =>
  ({
    engine: 'board',
    config: { rows, cols, ...(holes.length > 0 ? { holes } : {}) },
    elements: [],
  }) as never;

const play = (rows: number, cols: number, first: PlayPlayer = 'left') =>
  createPlay(board(rows, cols), rules, { misere: true, first });

const holesOf = (s: Scene): [number, number][] =>
  ((s.config as { holes?: [number, number][] }).holes ?? []);

const go = (session: PlaySession, ...ids: string[]): PlaySession => {
  let cur = session;
  for (const id of ids) {
    const out = playMove(cur, id, rules, boardCommands);
    expect(out.refusal, id).toBeNull();
    cur = out.session;
  }
  return cur;
};

/**
 * Ai thắng thế này, **duyệt vét cạn qua chính lớp ván**.
 *
 * Cố ý không hỏi solver của engine: bài học "vẽ đúng cái đã kiểm" có mặt trái của nó —
 * nếu luật và phép kiểm cùng đi qua một hàm thì chúng sai cùng nhau mà vẫn khớp. Ở đây
 * phép duyệt đi qua `createPlay`/`playMove` thật, tức nó kiểm luôn cả lớp ván: quy ước
 * misère, đổi lượt, và phép áp nước bằng lệnh.
 */
function winnerOf(session: PlaySession, seen = new Map<string, PlayPlayer>()): PlayPlayer {
  if (session.over) return session.winner as PlayPlayer;
  const key = `${JSON.stringify(holesOf(session.scene))}|${session.toMove}`;
  const hit = seen.get(key);
  if (hit) return hit;

  let result: PlayPlayer = session.toMove === 'left' ? 'right' : 'left';
  for (const move of session.moves) {
    const next = playMove(session, move.id, rules, boardCommands);
    expect(next.refusal, move.id).toBeNull();
    // Bên đang đi thắng nếu **có một** nước dẫn tới thế mà mình thắng.
    if (winnerOf(next.session, seen) === session.toMove) {
      result = session.toMove;
      break;
    }
  }
  seen.set(key, result);
  return result;
}

describe('luật: ăn một ô là ăn cả góc phần tư', () => {
  it('ăn $(1,1)$ trên bàn $3\\times3$ xoá đúng bốn ô', () => {
    const s = go(play(3, 3), 'bite-1-1');
    expect(holesOf(s.scene)).toEqual([
      [1, 1],
      [1, 2],
      [2, 1],
      [2, 2],
    ]);
  });

  it('ăn ô độc $(0,0)$ xoá **cả bàn** ⇒ ván xong ngay', () => {
    const s = go(play(2, 3), 'bite-0-0');
    expect(holesOf(s.scene)).toHaveLength(6);
    expect(s.over).toBe(true);
    // Misère: người ăn ô độc là người đi nước cuối, nên người **kia** thắng.
    expect(s.winner).toBe('right');
  });

  it('ô đã ăn không ăn lại được, và nước ấy **không còn trong danh sách**', () => {
    const s = go(play(3, 3), 'bite-1-1');
    expect(s.moves.map((m) => m.id)).not.toContain('bite-1-1');
    expect(s.moves.map((m) => m.id)).not.toContain('bite-2-2');
    // Và đi thẳng vào nó thì bị từ chối có lời, không im.
    expect(playMove(s, 'bite-2-2', rules, boardCommands).refusal).toContain('không có nước đi');
  });

  it('`holes` giữ **thứ tự ổn định** — cùng thế thì cùng một byte', () => {
    // `holes` là một tập, còn file là một mảng; hai thứ tự cho cùng một trạng thái là
    // hai diff git khác nhau (DAT-03), và replay/golden dựa vào chỗ này.
    const a = replayPlay(board(3, 3), ['bite-2-0', 'bite-0-2'], rules, boardCommands, {
      misere: true,
    });
    const b = replayPlay(board(3, 3), ['bite-0-2', 'bite-2-0'], rules, boardCommands, {
      misere: true,
    });
    expect(a.refusal).toBeNull();
    expect(b.refusal).toBeNull();
    // Hai thứ tự ăn khác nhau, cùng một thế ⇒ cùng một chuỗi byte.
    expect(JSON.stringify(a.session.scene)).toBe(JSON.stringify(b.session.scene));
  });

  it('nước trỏ vào **ô được chạm**, không phải cả góc bị ăn', () => {
    // `targets` trả lời "chạm đâu thì được nước này". Nhét cả góc vào thì chạm một ô sẽ
    // ra mọi nước có góc phủ nó, và bảng nước đi hoá vô dụng đúng ở bàn to.
    const s = play(3, 3);
    for (const move of s.moves) expect(move.targets).toHaveLength(1);
    expect(s.moves.find((m) => m.id === 'bite-0-0')?.targets).toEqual(['cell-0-0']);
  });
});

describe('sự thật kinh điển — duyệt vét cạn, không phải lời', () => {
  it('bàn $1\\times1$: người đi trước **thua** (chỉ còn ô độc)', () => {
    // Ca cơ sở, và cũng là ca mà "thế mở màn đã hết nước" của M78.1 suýt bỏ sót.
    expect(winnerOf(play(1, 1))).toBe('right');
  });

  it('mọi bàn $m\\times n \\ne 1\\times1$: người đi trước **thắng**', () => {
    // Định lý trộm chiến lược. Không chứng minh được bằng cách chỉ ra nước thắng — lời
    // giải kinh điển là phi kiến thiết — nên duyệt vét cạn đúng là cách kiểm nó.
    for (const [rows, cols] of [
      [1, 2],
      [2, 1],
      [1, 5],
      [2, 2],
      [2, 3],
      [3, 2],
      [3, 3],
    ] as [number, number][]) {
      expect(winnerOf(play(rows, cols)), `${rows}×${cols}`).toBe('left');
    }
  });

  it('bên đi trước đổi thì **người thắng đổi theo** — không phải "Left luôn thắng"', () => {
    // Nếu chốt canh trên xanh mà chốt canh này đỏ thì thứ đang được kiểm là một hằng số,
    // không phải một ván cờ.
    expect(winnerOf(play(3, 3, 'right'))).toBe('right');
    expect(winnerOf(play(1, 1, 'right'))).toBe('left');
  });

  it('$2\\times2$: nước thắng duy nhất là ăn $(1,1)$', () => {
    // Ăn ô chéo để lại hình chữ L đối xứng; sau đó cứ chép nước đối thủ. Đây là ca nhỏ
    // nhất mà chiến lược **kiến thiết được**, nên nó kiểm được cả tập nước thắng.
    const start = play(2, 2);
    const winning = start.moves.filter(
      (m) => winnerOf(playMove(start, m.id, rules, boardCommands).session) === 'left',
    );
    expect(winning.map((m) => m.id)).toEqual(['bite-1-1']);
  });
});

describe('ghi ván và tất định', () => {
  it('cùng dãy nước ⇒ scene **byte-identical**', () => {
    const ids = ['bite-2-1', 'bite-1-2', 'bite-0-1'];
    const a = replayPlay(board(3, 3), ids, rules, boardCommands, { misere: true });
    const b = replayPlay(board(3, 3), ids, rules, boardCommands, { misere: true });
    expect(a.refusal).toBeNull();
    expect(JSON.stringify(a.session.scene)).toBe(JSON.stringify(b.session.scene));
  });

  it('ghi ván ra draft: mỗi step là một **scene board hợp lệ**', () => {
    const s = go(play(3, 3), 'bite-2-2', 'bite-1-1');
    const steps = toDraftSteps(s);

    expect(steps).toHaveLength(2);
    expect(steps.map((d) => holesOf(d.scene).length)).toEqual([1, 4]);
    for (const d of steps) expect(d.scene.engine).toBe('board');
    expect(steps[0]!.narrative).toBe('Người 1: Ăn từ (2, 2)');
    expect(steps[1]!.narrative).toBe('Người 2: Ăn từ (1, 1)');
  });
});

describe('khai báo với tầng schema', () => {
  const cfg = (over: Record<string, unknown>): Scene =>
    ({ engine: 'board', config: { rows: 3, cols: 3, ...over }, elements: [] }) as never;

  it('họ luật khác thì `boardPlayRules` trả `null`, không đoán', () => {
    expect(boardPlayRules('nim')).toBeNull();
  });

  it('Chomp **phải** khai `misere: true`', () => {
    // Normal play đảo ngược người thắng, tức bài dạy ngược lời giải của chính nó. Lỗi
    // chứ không cảnh báo.
    expect(checkBoardPlay(cfg({}), { rule: 'chomp', misere: true }, '/p')).toEqual([]);
    const issues = checkBoardPlay(cfg({}), { rule: 'chomp' }, '/p');
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('play/chomp-is-misere');
    expect(issues[0]?.severity).toBe('error');
  });

  it('lưới phi vuông bị từ chối — và **không nước nào** được phát ra ở đó', () => {
    // Hai chốt canh một cặp: nếu chỉ có validate mà `legalMoves` vẫn sinh nước thì
    // sandbox vẫn chơi được một trò vô nghĩa; nếu chỉ có `legalMoves` rỗng mà validate
    // im thì bài xuất bản được và mở ra đã "kết thúc".
    const tri = cfg({ lattice: 'triangular', misere: true });
    expect(
      checkBoardPlay(tri, { rule: 'chomp', misere: true }, '/p').map((i) => i.code),
    ).toEqual(['play/chomp-needs-square']);
    expect(rules.legalMoves(tri, 'left')).toEqual([]);
  });
});
