import { describe, expect, it } from 'vitest';
import {
  createPlay,
  playMove,
  replayPlay,
  solveGame,
  toDraftSteps,
  type PlayPlayer,
  type PlaySession,
} from '@combviz/editor';
import type { Scene } from '@combviz/schema';
import {
  checkGraphPlay,
  graphCommands,
  graphPlayRules,
  HACKENBUSH_LEFT,
  HACKENBUSH_RIGHT,
} from '../src/index.js';

/**
 * **Hai ván trên đồ thị** (GM-01, M78.4).
 *
 * Mục "hai bên, hai tập nước" ở dưới là chốt canh mà cả M78 chờ: nim, Chomp và geography
 * đều impartial, nên cả ba **bỏ qua** tham số `player`. Một tham số đi qua bốn tầng
 * (`createPlay` → `settle` → `playMove` → `solveGame`) mà không ai đọc thì nó có thể đã
 * bị nối sai từ tầng đầu và mọi chốt canh vẫn xanh — M78.6 vừa gặp đúng chuyện ấy ở một
 * chỗ khác. Từ đây nó có răng.
 */

const V = (id: string, x: number, y: number) => ({ id, type: 'vertex', pos: [x, y], label: id });
const E = (id: string, u: string, v: string, color?: number) => ({
  id,
  type: 'edge',
  u,
  v,
  ...(color === undefined ? {} : { color_class: color }),
});

const scene = (config: Record<string, unknown>, elements: unknown[]): Scene =>
  ({ engine: 'graph', config, elements }) as never;

/* ------------------------------------------------------------- geography */

const geo = graphPlayRules('geography')!;

/** Đường thẳng $v_0 - v_1 - \dots - v_{n-1}$, quân đứng ở $v_0$. */
const path = (n: number, at = 'v0'): Scene =>
  scene(
    { token: at },
    [
      ...Array.from({ length: n }, (_, i) => V(`v${i}`, i * 10, 0)),
      ...Array.from({ length: n - 1 }, (_, i) => E(`e${i}`, `v${i}`, `v${i + 1}`)),
    ],
  );

const vertexIds = (s: Scene): string[] => s.elements.filter((e) => e.type === 'vertex').map((e) => e.id);
const tokenOf = (s: Scene): string | undefined => (s.config as { token?: string }).token;

describe('geography: quân đi, và đỉnh vừa rời **biến mất**', () => {
  it('đi một nước thì đỉnh cũ và cạnh kề nó cùng đi theo', () => {
    const start = createPlay(path(4), geo, {});
    const after = playMove(start, 'to-v1', geo, graphCommands);

    expect(after.refusal).toBeNull();
    expect(tokenOf(after.session.scene)).toBe('v1');
    expect(vertexIds(after.session.scene)).toEqual(['v1', 'v2', 'v3']);
    // Cạnh $v_0v_1$ phải đi cùng $v_0$: để lại nó là để lại một cạnh trỏ vào hư vô —
    // hợp lệ về schema, vô nghĩa về đồ thị.
    expect(after.session.scene.elements.some((e) => e.id === 'e0')).toBe(false);
  });

  it('**không cần** danh sách "đã thăm": đỉnh đã thăm không còn trên đồ thị', () => {
    // Một danh sách `visited` song song là trạng thái thứ hai để lệch với đồ thị thật.
    // Ở đây luật "chỉ đi tới đỉnh chưa thăm" tự lo được, và chốt canh này nói đúng chuyện
    // ấy: quay đầu là chuyện không xảy ra được, không phải chuyện bị cấm.
    let s = createPlay(path(4), geo, {});
    s = playMove(s, 'to-v1', geo, graphCommands).session;
    expect(s.moves.map((m) => m.id)).toEqual(['to-v2']);
    expect(playMove(s, 'to-v0', geo, graphCommands).refusal).toContain('không có nước đi');
  });

  it('đường thẳng $n$ đỉnh: người đi trước thắng **khi và chỉ khi** $n$ chẵn', () => {
    // Sự thật kinh điển, và nó độc lập với bộ máy: trên một đường thẳng ván đi hết
    // $n-1$ nước, nên người đi trước thắng ⇔ $n-1$ lẻ ⇔ $n$ chẵn.
    for (let n = 1; n <= 7; n += 1) {
      const out = solveGame(path(n), 'left', geo, graphCommands);
      expect(out.refused, `n=${n}`).toBeNull();
      expect(out.winner, `n=${n}`).toBe(n % 2 === 0 ? 'left' : 'right');
    }
  });

  it('quân ở đỉnh cô lập ⇒ ván **mở ra đã xong**, và nói ra người thắng', () => {
    const lonely = scene({ token: 'v0' }, [V('v0', 0, 0), V('v1', 10, 0)]);
    const s = createPlay(lonely, geo, {});
    expect(s.over).toBe(true);
    // Normal play: hết nước thì bên sắp đi thua.
    expect(s.winner).toBe('right');
  });

  it('cạnh song song cho **một** nước, không phải hai dòng cùng id', () => {
    // Hai dòng cùng id thì dòng sau bấm không được — một dòng chết trong bảng nước đi.
    const multi = scene({ token: 'a' }, [
      V('a', 0, 0),
      V('b', 10, 0),
      E('e1', 'a', 'b'),
      { ...E('e2', 'a', 'b'), multi_index: 1 },
    ]);
    expect(createPlay(multi, geo, {}).moves.map((m) => m.id)).toEqual(['to-b']);
  });

  it('khuyên **không** là một nước: đi tới chính mình không phải đi', () => {
    const loop = scene({ token: 'a' }, [V('a', 0, 0), E('e', 'a', 'a')]);
    expect(createPlay(loop, geo, {}).moves).toEqual([]);
  });
});

/* ----------------------------------------------------------- hackenbush */

const hb = graphPlayRules('hackenbush')!;

/**
 * Một "cây" Hackenbush: đất `g`, rồi một chuỗi cạnh đi lên.
 *
 * `colors[i]` là màu của cạnh thứ $i$ tính từ đất.
 */
const stalk = (colors: number[]): Scene =>
  scene({ ground: 'g' }, [
    V('g', 0, 0),
    ...colors.map((_, i) => V(`v${i}`, 0, (i + 1) * 10)),
    ...colors.map((c, i) => E(`e${i}`, i === 0 ? 'g' : `v${i - 1}`, `v${i}`, c)),
  ]);

const L = HACKENBUSH_LEFT;
const R = HACKENBUSH_RIGHT;

describe('hai bên, **hai tập nước** — chỗ `player` thôi là trang trí', () => {
  it('cùng một thế, Left và Right thấy **những nước khác nhau**', () => {
    // Đây là khẳng định mà nim, Chomp và geography đều không đưa ra được, vì cả ba
    // impartial. Không có nó thì `player` đi hết bốn tầng mà không ai đọc, và một chỗ
    // nối sai ở tầng đầu vẫn cho mọi chốt canh xanh.
    const s = stalk([L, R, L]);
    const left = hb.legalMoves(s, 'left').map((m) => m.targets[0]);
    const right = hb.legalMoves(s, 'right').map((m) => m.targets[0]);

    expect(left).toEqual(['e0', 'e2']);
    expect(right).toEqual(['e1']);
    expect(left).not.toEqual(right);
  });

  it('phiên chơi phát ra nước **của đúng bên đang tới lượt**', () => {
    // Tập nước đúng ở tầng luật mà lượt nối sai ở tầng phiên thì người chơi vẫn thấy
    // một bảng hợp lệ — của người kia.
    const s = createPlay(stalk([L, R, L]), hb, { first: 'right' });
    expect(s.toMove).toBe('right');
    expect(s.moves.map((m) => m.targets[0])).toEqual(['e1']);
  });

  it('bên hết cạnh màu mình thì **thua**, dù đồ thị còn đầy cạnh', () => {
    // Đây là điều khiến partizan khác impartial ở chỗ đau nhất: "hết nước" không còn
    // nghĩa là "hết hình". Một `settle` đọc số element thay vì đọc `legalMoves` sẽ
    // xanh ở mọi ván impartial và sai ở đúng đây.
    const s = createPlay(stalk([L, L]), hb, { first: 'right' });
    expect(s.scene.elements).toHaveLength(5);
    expect(s.over).toBe(true);
    expect(s.winner).toBe('left');
  });
});

describe('hackenbush: gỡ một cạnh thì phần rời đất **rụng**', () => {
  it('gỡ cạnh dưới cùng làm cả nhánh trên rụng theo', () => {
    const s = createPlay(stalk([L, R, L]), hb, {});
    const after = playMove(s, 'cut-e0', hb, graphCommands);

    expect(after.refusal).toBeNull();
    // Chỉ còn mỗi đất.
    expect(after.session.scene.elements.map((e) => e.id)).toEqual(['g']);
  });

  it('gỡ cạnh trên cùng chỉ mất đúng cạnh ấy và đỉnh treo trên nó', () => {
    const after = playMove(createPlay(stalk([L, R, L]), hb, {}), 'cut-e2', hb, graphCommands);
    expect(after.session.scene.elements.map((e) => e.id)).toEqual(['g', 'v0', 'v1', 'e0', 'e1']);
  });

  it('phần nối đất bằng **đường khác** thì không rụng', () => {
    // Chốt canh cho phép "rụng": nó phải hỏi liên thông, không phải đếm chiều cao hay
    // xoá mọi thứ phía trên. Ở đây có một vòng, nên gỡ một cạnh không cắt rời ai cả.
    const cycle = scene({ ground: 'g' }, [
      V('g', 0, 0),
      V('a', 10, 0),
      V('b', 5, 10),
      E('e0', 'g', 'a', L),
      E('e1', 'a', 'b', L),
      E('e2', 'b', 'g', L),
    ]);
    const after = playMove(createPlay(cycle, hb, {}), 'cut-e1', hb, graphCommands);
    expect(after.session.scene.elements.map((e) => e.id)).toEqual(['g', 'a', 'b', 'e0', 'e2']);
  });

  it('một cạnh xanh thì Left thắng; một cạnh cam thì Right thắng', () => {
    // Giá trị Hackenbush của một cạnh đơn là $+1$ và $-1$ — và ở mức này "giá trị" chỉ
    // có nghĩa là ai đi trước cũng thắng, nên hai dòng dưới kiểm cả hai bên mở màn.
    for (const first of ['left', 'right'] as PlayPlayer[]) {
      expect(solveGame(stalk([L]), first, hb, graphCommands).winner).toBe('left');
      expect(solveGame(stalk([R]), first, hb, graphCommands).winner).toBe('right');
    }
  });

  it('cây xanh–cam đối xứng: **bên đi sau thắng**', () => {
    // Hai cành rời nhau, một xanh một cam: tổng bằng $0$, nên ai đi trước cũng thua.
    // Đây là ca nhỏ nhất mà câu trả lời **không** suy được từ việc đếm cạnh.
    const zero = scene({ ground: 'g' }, [
      V('g', 0, 0),
      V('a', -10, 10),
      V('b', 10, 10),
      E('eL', 'g', 'a', L),
      E('eR', 'g', 'b', R),
    ]);
    expect(solveGame(zero, 'left', hb, graphCommands).winner).toBe('right');
    expect(solveGame(zero, 'right', hb, graphCommands).winner).toBe('left');
  });
});

describe('ghi ván và tất định', () => {
  it('cùng dãy nước ⇒ scene **byte-identical**', () => {
    const ids = ['cut-e2', 'cut-e1'];
    const a = replayPlay(stalk([L, R, L]), ids, hb, graphCommands, {});
    const b = replayPlay(stalk([L, R, L]), ids, hb, graphCommands, {});
    expect(a.refusal).toBeNull();
    expect(JSON.stringify(a.session.scene)).toBe(JSON.stringify(b.session.scene));
  });

  it('geography ghi ván ra draft: mỗi step là một scene graph hợp lệ', () => {
    let s: PlaySession = createPlay(path(4), geo, {});
    s = playMove(s, 'to-v1', geo, graphCommands).session;
    s = playMove(s, 'to-v2', geo, graphCommands).session;

    const steps = toDraftSteps(s);
    expect(steps).toHaveLength(2);
    expect(steps.map((d) => vertexIds(d.scene).length)).toEqual([3, 2]);
    expect(steps[0]!.narrative).toBe('Người 1: Đi tới v1');
    expect(steps[1]!.narrative).toBe('Người 2: Đi tới v2');
  });
});

describe('khai báo với tầng schema', () => {
  it('họ luật lạ thì `graphPlayRules` trả `null`, không đoán', () => {
    expect(graphPlayRules('chomp')).toBeNull();
    // `script` có tên trong danh sách nhưng thân đến từ bài, không từ engine.
    expect(graphPlayRules('script')).toBeNull();
  });

  it('geography không có quân ⇒ **lỗi**, vì bài mở ra đã kết thúc', () => {
    const noToken = scene({}, [V('a', 0, 0), V('b', 10, 0), E('e', 'a', 'b')]);
    const codes = checkGraphPlay(noToken, { rule: 'geography' }, '/p').map((i) => i.code);
    expect(codes).toContain('play/geography-needs-token');
    // Và hai chốt canh một cặp: `legalMoves` cũng không phát ra nước nào.
    expect(geo.legalMoves(noToken, 'left')).toEqual([]);
  });

  it('quân trỏ vào đỉnh không tồn tại ⇒ lỗi có tên đỉnh', () => {
    const ghost = scene({ token: 'khong-co' }, [V('a', 0, 0)]);
    const issue = checkGraphPlay(ghost, { rule: 'geography' }, '/p')[0];
    expect(issue?.code).toBe('play/geography-token-missing');
    expect(issue?.message).toContain('khong-co');
  });

  it('geography khai misère ⇒ lỗi: nó là ván thường', () => {
    expect(
      checkGraphPlay(path(3), { rule: 'geography', misere: true }, '/p').map((i) => i.code),
    ).toContain('play/geography-is-normal');
    expect(checkGraphPlay(path(3), { rule: 'geography' }, '/p')).toEqual([]);
  });

  it('hackenbush không có đất ⇒ lỗi, vì "rụng" không định nghĩa được', () => {
    const noGround = scene({}, [V('g', 0, 0), V('a', 0, 10), E('e', 'g', 'a', L)]);
    expect(checkGraphPlay(noGround, { rule: 'hackenbush' }, '/p').map((i) => i.code)).toContain(
      'play/hackenbush-needs-ground',
    );
    expect(hb.legalMoves(noGround, 'left')).toEqual([]);
  });

  it('cạnh không màu ⇒ lỗi, và **chỉ ra cạnh đầu tiên**', () => {
    // Cạnh không thuộc bên nào là cạnh không ai gỡ được; nếu nó là cầu thì cả nhánh
    // treo trên nó không bao giờ rụng, và trò chơi thôi là Hackenbush.
    const grey = scene({ ground: 'g' }, [
      V('g', 0, 0),
      V('a', 0, 10),
      E('e-xam', 'g', 'a'),
    ]);
    const issue = checkGraphPlay(grey, { rule: 'hackenbush' }, '/p').find(
      (i) => i.code === 'play/hackenbush-colourless-edge',
    );
    expect(issue?.severity).toBe('error');
    expect(issue?.hint).toContain('e-xam');
  });

  it('bàn hợp lệ thì **im lặng** cho cả hai họ luật', () => {
    expect(checkGraphPlay(stalk([L, R]), { rule: 'hackenbush' }, '/p')).toEqual([]);
    expect(checkGraphPlay(path(4), { rule: 'geography' }, '/p')).toEqual([]);
  });
});
