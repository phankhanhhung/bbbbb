import { describe, expect, it } from 'vitest';
import type { Scene } from '@combviz/schema';
import {
  createPlay,
  defineCommand,
  playMove,
  replayPlay,
  resetPlay,
  toDraftSteps,
  undoMove,
  PLAY_LIMIT,
  type CommandRegistry,
  type Move,
  type PlayPlayer,
  type PlayRules,
} from '../src/index.js';

/**
 * Ván chơi luân phiên (GM-01/02/04, M78).
 *
 * Game giả ở đây là **Nim một đống**: thế là một `count`, nước là bốc $1..3$. Nhỏ đủ
 * để mọi khẳng định đọc được bằng mắt, mà vẫn có đủ ba thứ đáng canh — luân phiên, kết
 * thúc theo quy ước, và người thắng.
 */

const scene = (count: number): Scene =>
  ({
    engine: 'game',
    config: {},
    elements: [{ id: 'p', type: 'pile', count }],
  }) as never;

const countOf = (s: Scene): number =>
  (s.elements[0] as unknown as { count: number }).count;

/** Cùng scene, đống còn `n` viên. */
const withCount = (s: Scene, n: number): Scene =>
  ({ ...s, elements: [{ id: 'p', type: 'pile', count: n }] }) as never;

const take = defineCommand<{ n: number }>({
  type: 'test/take',
  label: (p) => `Bốc ${p.n}`,
  apply(s, p) {
    const left = countOf(s) - p.n;
    if (left < 0) return null;
    return withCount(s, left);
  },
});

const registry: CommandRegistry = { 'test/take': take };

/** Bốc $1..3$; hai bên cùng luật. */
const nim: PlayRules = {
  legalMoves(s) {
    const n = countOf(s);
    return [1, 2, 3]
      .filter((k) => k <= n)
      .map((k) => ({
        id: `take-${k}`,
        label: `Bốc ${k}`,
        command: { type: 'test/take', params: { n: k } },
        targets: ['p'],
      }));
  },
};

const play = (session: ReturnType<typeof createPlay>, ...ids: string[]) => {
  let cur = session;
  for (const id of ids) {
    const out = playMove(cur, id, nim, registry);
    expect(out.refusal, id).toBeNull();
    cur = out.session;
  }
  return cur;
};

describe('lượt đi', () => {
  it('luân phiên, và suy từ số nước — **không** nằm trong scene', () => {
    // Nhét lượt vào scene nghĩa là schema của board và graph mọc thêm một trường chỉ
    // có nghĩa khi bài ấy là game. Suy ra thì nó tất định và không bẩn ai.
    let s = createPlay(scene(9), nim);
    expect(s.toMove).toBe('left');
    s = play(s, 'take-1');
    expect(s.toMove).toBe('right');
    s = play(s, 'take-1');
    expect(s.toMove).toBe('left');

    expect(JSON.stringify(s.scene)).not.toContain('toMove');
  });

  it('`first` đổi được — bên đi trước không phải lúc nào cũng là Left', () => {
    const s = createPlay(scene(9), nim, { first: 'right' });
    expect(s.toMove).toBe('right');
    expect(play(s, 'take-1').toMove).toBe('left');
  });
});

describe('kết thúc và người thắng', () => {
  it('normal play: hết nước thì **thua**', () => {
    const s = play(createPlay(scene(3), nim), 'take-3');
    expect(s.over).toBe(true);
    // Left vừa bốc hết; Right hết nước nên Right thua.
    expect(s.winner).toBe('left');
    expect(s.ended).toBe('hết nước đi');
    expect(s.moves).toEqual([]);
  });

  it('misère: hết nước thì **thắng** — và đó là cả một lời giải khác', () => {
    const s = play(createPlay(scene(3), nim, { misere: true }), 'take-3');
    expect(s.over).toBe(true);
    expect(s.winner).toBe('right');
  });

  it('thế mở màn **đã** hết nước vẫn là một ván hợp lệ', () => {
    // Bàn Chomp $1\times1$ là ca thật của chuyện này. Bỏ qua chỗ này thì nó hiện ra
    // như một ván đang chờ người đi, mà không ai đi được.
    const s = createPlay(scene(0), nim);
    expect(s.over).toBe(true);
    expect(s.winner).toBe('right');
  });

  it('ván xong thì không đi thêm được, và **nói ra**', () => {
    const s = play(createPlay(scene(3), nim), 'take-3');
    expect(playMove(s, 'take-1', nim, registry).refusal).toBe('ván đã kết thúc');
  });
});

describe('nước hợp lệ', () => {
  it('đi theo **id trong danh sách** — nước tự bịa thì từ chối', () => {
    // Nhận một `Move` do phía gọi dựng là mở đúng đường để giao diện "thắng" bằng một
    // nước luật cấm; nhận id thì nước ấy phải do chính phiên này vừa phát ra.
    const s = createPlay(scene(2), nim);
    expect(s.moves.map((m) => m.id)).toEqual(['take-1', 'take-2']);
    expect(playMove(s, 'take-3', nim, registry).refusal).toContain('không có nước đi');
  });

  it('lệnh không có trong registry ⇒ từ chối có lời, không im', () => {
    const bad: PlayRules = {
      legalMoves: () => [
        { id: 'x', label: 'x', command: { type: 'không/có', params: {} }, targets: [] },
      ],
    };
    const s = createPlay(scene(3), bad);
    expect(playMove(s, 'x', bad, registry).refusal).toContain('không có lệnh');
  });
});

describe('tất định — nền của replay, golden và ghi ván', () => {
  it('cùng dãy nước ⇒ scene **byte-identical**', () => {
    const ids = ['take-2', 'take-1', 'take-3'];
    const a = replayPlay(scene(9), ids, nim, registry);
    const b = replayPlay(scene(9), ids, nim, registry);
    expect(a.refusal).toBeNull();
    expect(JSON.stringify(a.session.scene)).toBe(JSON.stringify(b.session.scene));
  });

  it('replay nói **nước thứ mấy** hỏng, không chỉ nói hỏng', () => {
    const out = replayPlay(scene(2), ['take-1', 'take-3'], nim, registry);
    expect(out.refusal).toContain('nước 2');
  });
});

describe('lối B — script tự trả scene', () => {
  const scripted = (impl: (s: Scene, m: Move) => Scene | null): PlayRules => ({
    legalMoves: (s) => (countOf(s) > 0 ? [{ id: 'one', label: 'Bốc 1', targets: ['p'] }] : []),
    applyMove: impl,
  });

  it('áp được khi script tất định', () => {
    const rules = scripted((s) => withCount(s, countOf(s) - 1));
    const s = createPlay(scene(2), rules);
    const out = playMove(s, 'one', rules, registry);
    expect(out.refusal).toBeNull();
    expect(countOf(out.session.scene)).toBe(1);
  });

  it('script **không tất định** ⇒ chặn ngay ở nước ấy', () => {
    // Bắt tại đây thì nó hỏng đúng một nước và nói ra vì sao. Thả qua thì nó hỏng
    // replay, golden và ghi ván — về sau, ở một chỗ không ai nối lại được với nguyên nhân.
    let tick = 0;
    const rules = scripted((s) => {
      tick += 1;
      return withCount(s, tick);
    });
    const out = playMove(createPlay(scene(2), rules), 'one', rules, registry);
    expect(out.refusal).toContain('không tất định');
    expect(out.session.history).toEqual([]);
  });

  it('script đổi engine ⇒ từ chối', () => {
    const rules = scripted((s) => ({ ...s, engine: 'board' }) as never);
    expect(playMove(createPlay(scene(2), rules), 'one', rules, registry).refusal).toContain(
      'đổi engine',
    );
  });

  it('nước không có lệnh mà luật cũng không có `applyMove` ⇒ nói rõ cả hai chỗ thiếu', () => {
    const rules: PlayRules = {
      legalMoves: () => [{ id: 'one', label: 'x', targets: [] }],
    };
    expect(playMove(createPlay(scene(2), rules), 'one', rules, registry).refusal).toContain(
      'không mang lệnh',
    );
  });
});

describe('lùi, đặt lại, ghi ván', () => {
  it('lùi một nước trả cả **lượt** về, không chỉ trả thế', () => {
    let s = play(createPlay(scene(9), nim), 'take-1', 'take-2');
    expect(s.toMove).toBe('left');
    s = undoMove(s, nim) as never;
    expect(countOf(s.scene)).toBe(8);
    expect(s.toMove).toBe('right');
    expect(undoMove(undoMove(s, nim) as never, nim)).toBeNull();
  });

  it('đặt lại về thế mở màn, nhưng **vết chân giữ nguyên**', () => {
    // Đã tới đâu thì vẫn là đã tới — đó là cả điểm của SBX-06.
    const s = play(createPlay(scene(9), nim), 'take-1', 'take-2');
    const seen = s.trail.nodes.size;
    const back = resetPlay(s, nim);
    expect(countOf(back.scene)).toBe(9);
    expect(back.history).toEqual([]);
    expect(back.toMove).toBe('left');
    expect(back.trail.nodes.size).toBe(seen);
  });

  it('ghi ván ra draft: mỗi nước một step, và scene của step **là** thế sau nước ấy', () => {
    const s = play(createPlay(scene(9), nim), 'take-2', 'take-1');
    const steps = toDraftSteps(s);
    expect(steps).toHaveLength(2);
    expect(steps.map((d) => countOf(d.scene))).toEqual([7, 6]);
    expect(steps[0]!.narrative).toBe('Người 1: Bốc 2');
    expect(steps[1]!.narrative).toBe('Người 2: Bốc 1');
  });

  it('ghi ván chạy được **cả lối B** — bản ghi mang sẵn scene', () => {
    const rules: PlayRules = {
      legalMoves: (s) => (countOf(s) > 0 ? [{ id: 'one', label: 'Bốc 1', targets: [] }] : []),
      applyMove: (s) => withCount(s, countOf(s) - 1),
    };
    const out = playMove(createPlay(scene(2), rules), 'one', rules, registry);
    expect(toDraftSteps(out.session).map((d) => countOf(d.scene))).toEqual([1]);
  });
});

describe('trần ván', () => {
  it('luật không đóng lại thì ván **dừng và nói ra**, không quay vô hạn', () => {
    // Hàng rào cho luật hỏng, không phải hàng rào kỹ thuật: một họ luật sinh ra nước
    // không giảm thế sẽ cho hai bên đi qua lại mãi, và người học chỉ thấy một ván
    // không bao giờ kết thúc mà không ai nói vì sao.
    const spin: PlayRules = {
      legalMoves: () => [{ id: 'nop', label: 'không đổi gì', targets: [] }],
      applyMove: (s) => s,
    };
    let s = createPlay(scene(1), spin);
    for (let i = 0; i < PLAY_LIMIT; i += 1) s = playMove(s, 'nop', spin, registry).session;

    const out = playMove(s, 'nop', spin, registry);
    expect(out.refusal).toContain(`quá ${PLAY_LIMIT} nước`);
    expect(out.session.over).toBe(true);
    expect(out.session.ended).toContain('luật không đóng lại');
  });
});

describe('partizan — `player` không phải trang trí', () => {
  it('hai bên có **tập nước khác nhau**, và phiên chơi hỏi đúng bên đang đi', () => {
    // Chốt canh này đứng ở đây từ M78.1, trước cả Hackenbush: chữ ký mang `player` từ
    // ngày đầu thì không có ngày nào phải sửa mọi chỗ gọi để thêm nó.
    const partizan: PlayRules = {
      legalMoves: (s, player: PlayPlayer) =>
        countOf(s) === 0
          ? []
          : [{ id: player === 'left' ? 'L' : 'R', label: player, targets: [] }],
      applyMove: (s) => withCount(s, countOf(s) - 1),
    };
    let s = createPlay(scene(3), partizan);
    expect(s.moves.map((m) => m.id)).toEqual(['L']);
    s = playMove(s, 'L', partizan, registry).session;
    expect(s.moves.map((m) => m.id)).toEqual(['R']);
    // Và nước của bên kia **không** đi được ở lượt này.
    expect(playMove(s, 'L', partizan, registry).refusal).toContain('không có nước đi');
  });
});
