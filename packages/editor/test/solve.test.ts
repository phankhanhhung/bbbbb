import { describe, expect, it } from 'vitest';
import type { Scene } from '@combviz/schema';
import {
  createPlay,
  defineCommand,
  playMove,
  solveGame,
  SOLVER_STATES,
  SOLVER_STATES_MAX,
  type CommandRegistry,
  type PlayPlayer,
  type PlayRules,
  type SolveResult,
} from '../src/index.js';

/**
 * Solver tổng quát (GM-03, M78.5).
 *
 * Game giả: **Nim một đống**, bốc $1..k$. Nhỏ đủ để đối chiếu với công thức đã biết
 * (thế thua là bội của $k+1$), mà vẫn đi qua đúng bộ máy duyệt lùi thật.
 */

const scene = (count: number): Scene =>
  ({ engine: 'game', config: {}, elements: [{ id: 'p', type: 'pile', count }] }) as never;

const countOf = (s: Scene): number => (s.elements[0] as unknown as { count: number }).count;
const withCount = (s: Scene, n: number): Scene =>
  ({ ...s, elements: [{ id: 'p', type: 'pile', count: n }] }) as never;

const take = defineCommand<{ n: number }>({
  type: 'test/take',
  label: (p) => `Bốc ${p.n}`,
  apply: (s, p) => (countOf(s) - p.n < 0 ? null : withCount(s, countOf(s) - p.n)),
});
const registry: CommandRegistry = { 'test/take': take };

/** Bốc $1..k$. */
const nim = (k: number): PlayRules => ({
  legalMoves: (s) =>
    Array.from({ length: k }, (_, i) => i + 1)
      .filter((n) => n <= countOf(s))
      .map((n) => ({
        id: `take-${n}`,
        label: `Bốc ${n}`,
        command: { type: 'test/take', params: { n } },
        targets: ['p'],
      })),
});

describe('duyệt lùi trả đúng câu trả lời đã biết', () => {
  it('bốc $1..3$: thế thua đúng là **bội của $4$**', () => {
    // Công thức kinh điển, và nó độc lập với bộ máy duyệt — nên chúng khớp là một
    // khẳng định thật, không phải một phép so cái gương với chính nó.
    for (let n = 0; n <= 12; n += 1) {
      const out = solveGame(scene(n), 'left', nim(3), registry);
      expect(out.refused, `n=${n}`).toBeNull();
      expect(out.winner, `n=${n}`).toBe(n % 4 === 0 ? 'right' : 'left');
    }
  });

  it('bốc $1..2$: thế thua là bội của $3$ — trần đổi thì lời giải đổi', () => {
    for (let n = 0; n <= 9; n += 1) {
      expect(solveGame(scene(n), 'left', nim(2), registry).winner, `n=${n}`).toBe(
        n % 3 === 0 ? 'right' : 'left',
      );
    }
  });

  it('misère đảo người thắng ở đúng chỗ nó phải đảo', () => {
    // $n=0$: normal thì bên sắp đi thua, misère thì thắng. Và $n=1$ thì ngược lại —
    // "misère đảo mọi thứ" là câu sai, nó chỉ đảo giá trị ở **thế cụt**.
    expect(solveGame(scene(0), 'left', nim(3), registry).winner).toBe('right');
    expect(solveGame(scene(0), 'left', nim(3), registry, { misere: true }).winner).toBe('left');
    expect(solveGame(scene(1), 'left', nim(3), registry, { misere: true }).winner).toBe('right');
  });

  it('nước thắng là **mọi** nước đưa đối thủ vào thế thua, không phải một nước', () => {
    // $n=6$, bốc $1..3$: chỉ nước bốc $2$ đưa về bội của $4$.
    expect(solveGame(scene(6), 'left', nim(3), registry).winningMoves).toEqual(['take-2']);
    // $n=4$ đang thua ⇒ không nước nào thắng, và danh sách rỗng chứ không phải "chưa biết".
    const losing = solveGame(scene(4), 'left', nim(3), registry);
    expect(losing.winner).toBe('right');
    expect(losing.winningMoves).toEqual([]);
  });

  it('bên sắp đi đổi thì người thắng đổi theo', () => {
    expect(solveGame(scene(6), 'right', nim(3), registry).winner).toBe('right');
    expect(solveGame(scene(4), 'right', nim(3), registry).winner).toBe('left');
  });
});

describe('solver và ván **đồng ý** với nhau', () => {
  it('đi theo nước solver chỉ thì thắng thật — chơi hết ván', () => {
    // Đây là chốt canh nối hai bộ máy: một bên tính, một bên chơi. Chúng đi qua cùng
    // `legalMoves`, nên nếu chúng lệch nhau thì lệch ở phép suy luận, không ở luật.
    let session = createPlay(scene(9), nim(3), {});
    while (!session.over) {
      const out = solveGame(session.scene, session.toMove, nim(3), registry);
      // Bên đang thắng đi nước thắng; bên đang thua đi bừa nước đầu tiên.
      const id = out.winningMoves[0] ?? (session.moves[0]?.id as string);
      session = playMove(session, id, nim(3), registry).session;
    }
    // Left mở màn ở $9$ (không phải bội của $4$) nên Left thắng nếu đi đúng.
    expect(session.winner).toBe('left');
  });
});

describe('trần là **số thế**, và nó đếm được', () => {
  it('`states` là phép **đo**, không phải ước lượng', () => {
    // Nim một đống $n$ có đúng $n+1$ thế (mỗi bên đi ở một thế khác nhau thì key khác
    // nhau, nhưng ở đây lượt suy từ số nước nên mỗi số viên chỉ ứng một lượt).
    const out = solveGame(scene(6), 'left', nim(3), registry);
    expect(out.states).toBeGreaterThan(0);
    expect(out.states).toBeLessThanOrEqual(14);
  });

  it('chạm trần thì **từ chối có lời**, không treo', () => {
    const out = solveGame(scene(50), 'left', nim(3), registry, { bound: 5 });
    expect(out.winner).toBeNull();
    expect(out.refused).toContain('vượt trần 5 thế');
  });

  it('trần nâng lên vẫn bị **kẹp** — thứ treo máy là số thế thật, không phải con số tác giả gõ', () => {
    const rules: PlayRules = { ...nim(3), solverBound: 8 };
    expect(solveGame(scene(50), 'left', rules, registry, { bound: 10_000 }).refused).toContain(
      'vượt trần 8',
    );
    expect(SOLVER_STATES).toBeLessThan(SOLVER_STATES_MAX);
  });

  it('trần **cạnh** chặn thứ mà trần thế không thấy: nhánh rộng', () => {
    // Một thế có hai trăm nước vẫn là *một* thế. Họ luật dưới đây có đúng sáu thế — qua
    // trần thế thoải mái — mà công phải làm thì gấp hai trăm lần. Không có trần thứ hai
    // thì "trần 5000 thế" là một lời hứa không nói gì về thời gian.
    const wide: PlayRules = {
      legalMoves: (s) =>
        countOf(s) === 0
          ? []
          : Array.from({ length: 200 }, (_, i) => ({
              id: `w-${i}`,
              label: `w${i}`,
              command: { type: 'test/take', params: { n: 1 } },
              targets: [],
            })),
    };
    const out = solveGame(scene(5), 'left', wide, registry, { bound: 20 });
    expect(out.winner).toBeNull();
    expect(out.refused).toContain('nước phải duyệt');
    // Và nó dừng vì **cạnh**, không vì thế: số thế đếm được còn dưới trần.
    expect(out.states).toBeLessThanOrEqual(20);
  });

  it('trần **không** đo bằng thời gian — cùng vào thì cùng ra', () => {
    // Đây là chỗ đi khác kế hoạch, và cố ý: trần thời gian làm solver không tất định,
    // và thế thì chốt canh, golden và lời hứa CHO-08 đều mất nghĩa.
    const a = solveGame(scene(30), 'left', nim(3), registry);
    const b = solveGame(scene(30), 'left', nim(3), registry);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('luật hỏng thì solver **chẩn đoán**, không đoán bừa', () => {
  it('luật cho đi vòng mãi ⇒ nói đúng chuyện ấy', () => {
    // Đệ quy có nhớ sẽ treo hoặc trả bừa ở đây. Duyệt lùi nói được câu thứ ba:
    // "không ai thắng được, hai bên đi vòng mãi" — chẩn đoán cho một họ luật hỏng.
    const spin: PlayRules = {
      legalMoves: () => [{ id: 'nop', label: 'không đổi gì', targets: [] }],
      applyMove: (s) => s,
    };
    const out = solveGame(scene(1), 'left', spin, registry);
    expect(out.winner).toBeNull();
    expect(out.refused).toContain('đi vòng mãi');
  });

  it('nước phát ra mà không đi được ⇒ **nói ra**, không lặng lẽ bỏ qua', () => {
    // Bỏ qua thì solver trả lời đúng cho một trò khác với trò người ta đang chơi.
    const broken: PlayRules = {
      legalMoves: (s) =>
        countOf(s) === 0
          ? []
          : [{ id: 'x', label: 'x', command: { type: 'test/take', params: { n: 99 } }, targets: [] }],
    };
    const out = solveGame(scene(3), 'left', broken, registry);
    expect(out.refused).toContain('phát ra nhưng không đi được');
  });
});

describe('đường tắt của họ luật', () => {
  it('họ luật tự trả lời được thì solver chung **không duyệt thế nào**', () => {
    let asked = 0;
    const answer: SolveResult = { winner: 'right', winningMoves: [], states: 0, refused: null };
    const shortcut: PlayRules = {
      legalMoves: (s) => {
        asked += 1;
        return nim(3).legalMoves(s, 'left');
      },
      solve: () => answer,
    };
    expect(solveGame(scene(9), 'left', shortcut, registry)).toEqual(answer);
    // `createPlay` gọi `legalMoves` một lần cho thế mở màn; đường tắt cắt trước cả đó.
    expect(asked).toBe(0);
  });

  it('`null` nghĩa là "ca này tôi không biết" ⇒ solver chung duyệt như thường', () => {
    // Nhờ vậy một họ luật có công thức cho **một phần** các thế vẫn khai được.
    const partial: PlayRules = {
      ...nim(3),
      solve: (s: Scene): SolveResult | null =>
        countOf(s) > 100
          ? { winner: 'left', winningMoves: [], states: 0, refused: null }
          : null,
    };
    expect(solveGame(scene(6), 'left', partial, registry).winner).toBe('left');
    expect(solveGame(scene(6), 'left', partial, registry).states).toBeGreaterThan(0);
  });

  it('đường tắt **cũng biết nói không** — lời từ chối đi thẳng ra, không bị thử lại', () => {
    // Thử lại bằng solver chung là đúng cái sẽ treo máy: họ luật vừa nói không gian thế
    // quá lớn xong.
    const refusing: PlayRules = {
      ...nim(3),
      solve: () => ({ winner: null, winningMoves: [], states: 0, refused: 'quá lớn' }),
    };
    const out = solveGame(scene(6), 'left', refusing, registry);
    expect(out.refused).toBe('quá lớn');
    expect(out.states).toBe(0);
  });
});

describe('thế cụt', () => {
  it('thế mở màn đã hết nước vẫn giải được', () => {
    const out = solveGame(scene(0), 'left', nim(3), registry);
    expect(out.refused).toBeNull();
    expect(out.states).toBe(1);
    expect(out.winner).toBe('right');
  });

  it('`first` của phiên **không** lái solver — solver nhận thẳng bên sắp đi', () => {
    // Nếu solver phải suy lượt từ `first` + số nước thì nó không giải được một thế
    // giữa ván, mà giữa ván mới là chỗ người ta hỏi.
    const players: PlayPlayer[] = ['left', 'right'];
    for (const p of players) {
      expect(solveGame(scene(4), p, nim(3), registry).winner).toBe(
        p === 'left' ? 'right' : 'left',
      );
    }
  });
});
