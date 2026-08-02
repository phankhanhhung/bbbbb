import { describe, expect, it } from 'vitest';
import type { Scene } from '@combviz/schema';
import {
  createPlay,
  playMove,
  replayPlay,
  toDraftSteps,
  type PlaySession,
} from '@combviz/editor';
import {
  gameCommands,
  gamePlayRules,
  checkGamePlay,
  GAME_PLAY_RULES,
  analyzeGame,
  allMoves,
  type GameRule,
} from '../src/index.js';

/**
 * **Bốc đống chạy trên lớp ván** (GM-01/02, M78.2).
 *
 * Mục này không thêm luật nào. Nó hỏi đúng một câu: hợp đồng `Move` của M78.1 có nuốt
 * được thứ **đã chạy** không — tám họ luật, một solver có răng, chín bài đã xuất bản —
 * trước khi có Chomp và Hackenbush đứng lên nó.
 */

const scene = (counts: readonly number[], rule: GameRule, extra: Record<string, unknown> = {}): Scene =>
  ({
    engine: 'game',
    config: { rule, ...extra },
    elements: counts.map((count, i) => ({ id: `p${i}`, type: 'pile', count })),
  }) as never;

const NIM: GameRule = { type: 'subtract', min: 1 };
const rules = gamePlayRules();

const countsOf = (s: Scene): number[] =>
  s.elements.filter((e) => e.type === 'pile').map((e) => (e as unknown as { count: number }).count);

const go = (session: PlaySession, ...ids: string[]): PlaySession => {
  let cur = session;
  for (const id of ids) {
    const out = playMove(cur, id, rules, gameCommands);
    expect(out.refusal, id).toBeNull();
    cur = out.session;
  }
  return cur;
};

describe('nước hợp lệ đi qua **đúng** nguồn sự thật cũ', () => {
  it('số nước của lớp ván bằng số nước của `allMoves` — không nhiều hơn, không ít hơn', () => {
    // Viết lại phép sinh nước ở tầng play là dựng nguồn sự thật thứ hai. Chốt canh này
    // là thứ giữ cho chuyện ấy không xảy ra lặng lẽ.
    for (const [counts, rule] of [
      [[3, 5], NIM],
      [[7], { type: 'subtract', min: 1, max: 3 }],
      [[10], { type: 'subtract-fraction', denominator: 2 }],
      [[6], { type: 'split-unequal' }],
      [[4, 7], { type: 'subtract-equal-pair' }],
      [[5, 3], { type: 'subtract-multiple-of-other' }],
      [[6], { type: 'union', of: [{ type: 'subtract', min: 1 }, { type: 'split-any' }] }],
    ] as [number[], GameRule][]) {
      const s = scene(counts, rule);
      expect(rules.legalMoves(s, 'left'), JSON.stringify(rule)).toHaveLength(
        allMoves(counts, rule).length,
      );
    }
  });

  it('mọi nước phát ra đều **đi được thật** — không nước nào là lời hứa suông', () => {
    // Một nước bày ra mà lệnh từ chối là đúng thứ mà lớp lệnh tự kiểm luật sinh ra để
    // chặn: người học bấm một nút có vẻ dùng được rồi nhận lại im lặng.
    for (const [counts, rule] of [
      [[3, 5], NIM],
      [[6], { type: 'split-unequal' }],
      [[4, 7], { type: 'subtract-equal-pair' }],
    ] as [number[], GameRule][]) {
      const s = createPlay(scene(counts, rule), rules);
      for (const move of s.moves) {
        expect(playMove(s, move.id, rules, gameCommands).refusal, move.id).toBeNull();
      }
    }
  });

  it('id nước **phân biệt được nhau** trong cùng một thế', () => {
    // Ghi ván lại đi theo id; hai nước cùng id nghĩa là replay đi nhầm nước.
    const s = createPlay(scene([4, 7], { type: 'subtract-equal-pair' }), rules);
    expect(new Set(s.moves.map((m) => m.id)).size).toBe(s.moves.length);
  });

  it('mỗi nước trỏ vào **đống có thật** — nền của chọn nước trên hình', () => {
    const s = scene([3, 5], NIM);
    const ids = new Set(s.elements.map((e) => e.id));
    for (const move of rules.legalMoves(s, 'left')) {
      expect(move.targets.length).toBeGreaterThan(0);
      for (const t of move.targets) expect(ids.has(t), t).toBe(true);
    }
  });
});

describe('ván bốc đống chạy hết', () => {
  it('Nim $(1,2)$: chơi tới hết và **người thắng khớp solver**', () => {
    // Solver nói thế mở màn thắng hay thua; ván chơi tối ưu phải ra đúng người ấy.
    // Hai đường tính khác hẳn nhau — một bên XOR Grundy, một bên đi từng nước — nên
    // chúng khớp là một khẳng định thật.
    const start = scene([1, 2], NIM);
    expect(analyzeGame([1, 2], NIM).winning).toBe(true);

    // Left bốc 1 ở đống 2 viên ⇒ $(1,1)$, XOR = 0, Right vào thế thua.
    let s = createPlay(start, rules);
    s = go(s, 'take-p1-1');
    expect(analyzeGame(countsOf(s.scene), NIM).winning).toBe(false);
    s = go(s, 'take-p0-1', 'take-p1-1');
    expect(s.over).toBe(true);
    expect(s.winner).toBe('left');
  });

  it('misère đảo người thắng trên **cùng một dãy nước**', () => {
    const ids = ['take-p0-1', 'take-p1-1', 'take-p1-1'];
    const normal = replayPlay(scene([1, 2], NIM), ids, rules, gameCommands);
    const misere = replayPlay(scene([1, 2], NIM, { misere: true }), ids, rules, gameCommands, {
      misere: true,
    });

    expect(normal.refusal).toBeNull();
    expect(misere.refusal).toBeNull();
    expect(normal.session.winner).toBe('left');
    expect(misere.session.winner).toBe('right');
  });

  it('đống về $0$ thì **biến mất**, và nước sau đó vẫn hợp lệ', () => {
    // `game/take` xoá đống rỗng, nên tập id đổi giữa ván. Nước đi mang id đống, nên
    // đây là chỗ một hợp đồng nước đi hời hợt sẽ vỡ.
    const s = go(createPlay(scene([1, 2], NIM), rules), 'take-p0-1');
    expect(countsOf(s.scene)).toEqual([0, 2]);
    expect(s.moves.map((m) => m.id)).toEqual(['take-p1-1', 'take-p1-2']);
  });

  it('luật đọc lịch sử: cận nước sau **đổi theo nước trước** (Nim Fibonacci)', () => {
    // `last_take` là một phần của thế. Nếu lớp ván đánh rơi nó thì mọi nước sau đều
    // được đi như nước mở màn — tức sandbox cho người học thắng bằng nước luật cấm.
    const rule: GameRule = { type: 'subtract-at-most-multiple', multiplier: 2 };
    let s = createPlay(scene([20], rule), rules);
    expect(s.moves.length).toBeGreaterThan(2);

    s = go(s, 'take-p0-1');
    // Vừa bốc 1 ⇒ nước sau tối đa 2.
    expect(s.moves.map((m) => m.id)).toEqual(['take-p0-1', 'take-p0-2']);
  });
});

describe('chia đống — nước sinh ra một element mới', () => {
  it('chia rồi thì có **hai** đống, và ván đi tiếp bình thường', () => {
    // `game/split` chèn một element mới với id suy ra được (`p0-b`). Lệnh không tự
    // sinh id ngẫu nhiên — đó là điều kiện replay được của ENG-01, và ván dựa vào nó.
    const s = go(createPlay(scene([6], { type: 'split-unequal' }), rules), 'split-p0-1');
    expect(countsOf(s.scene)).toEqual([1, 5]);
    expect(s.scene.elements.map((e) => e.id)).toEqual(['p0', 'p0-b']);
  });
});

describe('tất định và ghi ván', () => {
  it('cùng dãy nước ⇒ scene **byte-identical**', () => {
    const ids = ['take-p1-2', 'take-p0-1', 'take-p1-3'];
    const a = replayPlay(scene([3, 5], NIM), ids, rules, gameCommands);
    const b = replayPlay(scene([3, 5], NIM), ids, rules, gameCommands);
    expect(a.refusal).toBeNull();
    expect(JSON.stringify(a.session.scene)).toBe(JSON.stringify(b.session.scene));
  });

  it('ghi ván ra draft: mỗi step là một scene **hợp lệ của chính engine này**', () => {
    const s = go(createPlay(scene([3, 5], NIM), rules), 'take-p1-2', 'take-p0-3');
    const steps = toDraftSteps(s);

    expect(steps).toHaveLength(2);
    expect(steps.map((d) => countsOf(d.scene))).toEqual([[3, 3], [0, 3]]);
    // Scene ghi ra phải đọc lại được bằng chính engine — nếu không thì "draft" là một
    // tệp không mở được.
    for (const d of steps) expect(d.scene.engine).toBe('game');
    expect(steps[0]!.narrative).toBe('Người 1: Bốc 2');
    expect(steps[1]!.narrative).toBe('Người 2: Bốc 3');
  });
});

describe('khai báo với tầng schema', () => {
  it('engine khai **một** họ luật, tên `piles`', () => {
    // Tám thành viên `GameRule` là tham số của cùng một cách chơi, không phải tám họ.
    // Khai tám tên là bắt tác giả gõ cùng một thứ hai lần, ở hai chỗ có thể lệch nhau.
    expect([...GAME_PLAY_RULES]).toEqual(['piles']);
  });

  it('quy ước ván lệch quy ước phân tích ⇒ **lỗi**, không phải cảnh báo', () => {
    // Không có ca nào lệch mà đúng: hình vẽ phổ của một trò trong khi cho chơi trò khác.
    const normal = scene([5], NIM);
    expect(checkGamePlay(normal, { rule: 'piles' }, '/p')).toEqual([]);
    expect(checkGamePlay(normal, { rule: 'piles', misere: true }, '/p')).toHaveLength(1);
    expect(checkGamePlay(normal, { rule: 'piles', misere: true }, '/p')[0]?.severity).toBe('error');

    const mis = scene([5], NIM, { misere: true });
    expect(checkGamePlay(mis, { rule: 'piles', misere: true }, '/p')).toEqual([]);
    expect(checkGamePlay(mis, { rule: 'piles' }, '/p')).toHaveLength(1);
  });
});
