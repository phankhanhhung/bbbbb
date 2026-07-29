import { GAME_LIMITS, type GameRule } from './schema.js';

/**
 * Các nước đi hợp lệ từ **một** đống cỡ `n`.
 *
 * Trả về danh sách đống-sau-khi-đi: một phần tử cho luật bốc, hai phần tử cho
 * luật chia. Đây là chỗ **duy nhất** biết luật; solver, sinh nước và validator
 * đều gọi vào đây, nên không có đường nào để hai chỗ hiểu luật khác nhau.
 */
export function movesFromPile(n: number, rule: GameRule): readonly (readonly number[])[] {
  const out: number[][] = [];

  if (rule.type === 'subtract') {
    const max = Math.min(rule.max ?? n, n);
    for (let take = rule.min; take <= max; take += 1) out.push([n - take]);
    return out;
  }

  if (rule.type === 'subtract-set') {
    for (const take of rule.allowed) {
      if (take <= n) out.push([n - take]);
    }
    return out;
  }

  // split-unequal: hai phần khác rỗng và **khác nhau**.
  for (let a = 1; a < n - a; a += 1) out.push([a, n - a]);
  return out;
}

/**
 * Giá trị Grundy của một đống cỡ `n`, luật chơi thường (ai không đi được thì thua).
 *
 * `mex` của tập giá trị các thế đi tới được. Với luật chia, thế đi tới là **hai**
 * đống nên giá trị của nó là XOR của hai — đó chính là định lý Sprague–Grundy
 * áp cho tổng của hai trò con.
 */
export function grundyTable(upTo: number, rule: GameRule): number[] {
  const g: number[] = [];
  for (let n = 0; n <= upTo; n += 1) {
    const seen = new Set<number>();
    for (const after of movesFromPile(n, rule)) {
      seen.add(after.reduce((x, part) => x ^ (g[part] as number), 0));
    }
    let mex = 0;
    while (seen.has(mex)) mex += 1;
    g[n] = mex;
  }
  return g;
}

export interface Move {
  /** Chỉ số đống bị đụng tới. */
  readonly pile: number;
  /** Đống ấy trở thành những đống nào (rỗng thì biến mất). */
  readonly becomes: readonly number[];
}

export interface GameAnalysis {
  /** Giá trị Grundy từng đống. Rỗng ở chế độ misère — lý thuyết đó không áp dụng. */
  readonly grundy: readonly number[];
  /** XOR các giá trị Grundy. Chỉ có nghĩa ở luật chơi thường. */
  readonly xor: number;
  /** Người **sắp đi** có thắng không, nếu cả hai chơi tối ưu. */
  readonly winning: boolean;
  /** Các nước đưa đối thủ vào thế thua. Rỗng khi thế hiện tại đã thua. */
  readonly winningMoves: readonly Move[];
  readonly totalMoves: number;
  /** Vượt trần thì từ chối kèm lý do, không chạy rồi treo. */
  readonly refused?: string;
}

const EMPTY: GameAnalysis = {
  grundy: [],
  xor: 0,
  winning: false,
  winningMoves: [],
  totalMoves: 0,
};

export function analyzeGame(
  piles: readonly number[],
  rule: GameRule,
  misere = false,
): GameAnalysis {
  if (piles.length === 0) return EMPTY;
  if (piles.length > GAME_LIMITS.maxPiles) {
    return { ...EMPTY, refused: `${piles.length} đống, vượt trần ${GAME_LIMITS.maxPiles}` };
  }
  const largest = Math.max(...piles);
  if (largest > GAME_LIMITS.maxPerPile) {
    return { ...EMPTY, refused: `Đống ${largest} viên, vượt trần ${GAME_LIMITS.maxPerPile}` };
  }

  const all = allMoves(piles, rule);

  if (!misere) {
    const g = grundyTable(largest, rule);
    const grundy = piles.map((n) => g[n] as number);
    const xor = grundy.reduce((a, b) => a ^ b, 0);

    return {
      grundy,
      xor,
      winning: xor !== 0,
      // Nước thắng: nước đưa XOR về 0. Đó **là** chiến lược, không phải gợi ý.
      winningMoves: all.filter((move) => xorAfter(piles, move, g) === 0),
      totalMoves: all.length,
    };
  }

  // Misère: XOR không áp dụng được, phải duyệt lùi toàn bộ không gian thế.
  const solved = retrograde(piles, rule);
  if (solved === null) {
    return {
      ...EMPTY,
      totalMoves: all.length,
      refused: `Không gian thế vượt trần ${GAME_LIMITS.maxStates} nên không giải misère được`,
    };
  }

  return {
    grundy: [],
    xor: 0,
    winning: solved.win.get(key(piles)) === true,
    winningMoves: all.filter((move) => solved.win.get(key(apply(piles, move))) === false),
    totalMoves: all.length,
  };
}

/** Mọi nước đi từ một thế. */
export function allMoves(piles: readonly number[], rule: GameRule): Move[] {
  const out: Move[] = [];
  piles.forEach((n, pile) => {
    for (const becomes of movesFromPile(n, rule)) out.push({ pile, becomes });
  });
  return out;
}

export function apply(piles: readonly number[], move: Move): number[] {
  const next = piles.slice();
  next.splice(move.pile, 1, ...move.becomes);
  return next.filter((n) => n > 0);
}

function xorAfter(piles: readonly number[], move: Move, g: readonly number[]): number {
  return apply(piles, move).reduce((x, n) => x ^ (g[n] as number), 0);
}

/**
 * Khoá chuẩn tắc của một thế: **đa tập** đống, đã sắp.
 *
 * Thứ tự đống không mang nghĩa, nên $\{3,1\}$ và $\{1,3\}$ là một thế. Không
 * chuẩn hoá thì không gian trạng thái phình lên giai thừa lần và bộ nhớ đếm sai
 * chính thứ mà trần `maxStates` canh.
 */
function key(piles: readonly number[]): string {
  return [...piles].filter((n) => n > 0).sort((a, b) => a - b).join(',');
}

/**
 * Duyệt lùi cho misère: thế nào thắng, thế nào thua.
 *
 * Định nghĩa đệ quy chuẩn — một thế **thắng** khi có nước đi tới thế thua. Chỗ
 * khác duy nhất giữa misère và luật thường nằm ở thế **cuối**: hết nước đi thì
 * luật thường là thua, misère là thắng.
 *
 * Trả `null` khi vượt trần thay vì chạy tiếp: một bài lỡ khai đống lớn sẽ treo
 * trình duyệt của người học, không phải của tác giả (NFR-P4).
 */
function retrograde(
  start: readonly number[],
  rule: GameRule,
): { win: Map<string, boolean> } | null {
  const win = new Map<string, boolean>();
  const visiting = new Set<string>();

  const solve = (piles: readonly number[]): boolean | null => {
    const k = key(piles);
    const known = win.get(k);
    if (known !== undefined) return known;
    if (win.size >= GAME_LIMITS.maxStates) return null;
    // Luật ở đây luôn làm tổng số viên giảm, nên không có chu trình. Vòng canh
    // này là chốt an toàn cho luật thêm về sau, không phải cho ba luật hiện có.
    if (visiting.has(k)) return null;
    visiting.add(k);

    const moves = allMoves(piles, rule);
    // Hết nước: luật thường thì người sắp đi **thua**, misère thì **thắng**.
    let result = moves.length === 0;
    for (const move of moves) {
      const after = solve(apply(piles, move));
      if (after === null) {
        visiting.delete(k);
        return null;
      }
      if (!after) {
        result = true;
        break;
      }
    }

    visiting.delete(k);
    win.set(k, result);
    return result;
  };

  return solve(start) === null ? null : { win };
}

/**
 * Thế một đống nào là thế thua, với $n$ chạy từ $0$ tới `upTo`.
 *
 * Đây là bảng mà view `spectrum` vẽ ra, và nó là **toàn bộ nội dung sư phạm**
 * của họ bài bốc sỏi: quy luật "thua đúng khi $n$ chia hết cho $k+1$" không phải
 * câu để tin, nó là một vệt sọc hiện ra trên màn hình.
 */
export function losingSpectrum(
  upTo: number,
  rule: GameRule,
  misere = false,
): boolean[] {
  if (!misere) {
    const g = grundyTable(upTo, rule);
    return g.map((value) => value === 0);
  }

  const lose: boolean[] = [];
  for (let n = 0; n <= upTo; n += 1) {
    const moves = movesFromPile(n, rule);
    // Một đống chia đôi thành hai đống — misère trên tổng hai trò con không đọc
    // được từ bảng một chiều này, nên `spectrum` chỉ dùng cho luật bốc.
    let result = moves.length === 0 ? false : true;
    for (const after of moves) {
      if (after.length === 1 && lose[after[0] as number] === true) {
        result = false;
        break;
      }
    }
    lose[n] = result;
  }
  return lose;
}
