import { GAME_LIMITS, type GameRule, type GameRuleAtom } from './schema.js';

/** Các thành viên của một luật. Hợp thì trả cả danh sách, đơn thì trả một phần tử. */
export function ruleAtoms(rule: GameRule): readonly GameRuleAtom[] {
  return rule.type === 'union' ? rule.of : [rule];
}

/**
 * Thành viên này có **cục bộ** không — tập nước của một đống chỉ phụ thuộc đống ấy?
 *
 * Đây là ranh giới quan trọng nhất của engine, và nó không phải chuyện hình thức:
 *
 *   - **Cục bộ** ⇒ ván là *tổng* các trò con độc lập ⇒ Sprague–Grundy áp dụng,
 *     nên giải bằng một bảng Grundy $O(n)$ và XOR. Đó là toàn bộ nội dung sư phạm
 *     của Nim và họ hàng.
 *   - **Toàn cục** ⇒ định lý ấy **không** áp dụng. Wythoff và trò Euclid nằm ở đây.
 *     Tính XOR các "giá trị Grundy từng đống" trong hai trò ấy sẽ ra một con số
 *     trông rất thuyết phục và **sai**. Nên solver không tính nó, và DSL không
 *     bày `xor` ra nữa (xem `dsl.ts`).
 */
export function isLocalAtom(atom: GameRuleAtom): boolean {
  return atom.type !== 'subtract-equal-pair' && atom.type !== 'subtract-multiple-of-other';
}

export function isLocalRule(rule: GameRule): boolean {
  return ruleAtoms(rule).every(isLocalAtom);
}

/**
 * View `spectrum` đọc được luật này không?
 *
 * Phổ là bảng **một chiều** của thế một đống, nên nó chỉ có nghĩa khi mọi nước
 * biến một đống thành **đúng một** đống, và không đọc gì bên ngoài đống ấy. Chia
 * đống sinh ra tổng hai trò con; Wythoff và Euclid cần từ hai đống trở lên.
 */
export function spectrumReadable(rule: GameRule): boolean {
  return ruleAtoms(rule).every(
    (atom) =>
      atom.type === 'subtract' ||
      atom.type === 'subtract-set' ||
      atom.type === 'subtract-fraction',
  );
}

/**
 * Các nước đi hợp lệ từ **một** đống cỡ `n`, xét riêng các thành viên **cục bộ**.
 *
 * Trả về danh sách đống-sau-khi-đi: một phần tử cho luật bốc, hai phần tử cho
 * luật chia. Thành viên toàn cục không góp gì vào đây — theo định nghĩa, nước của
 * chúng không đọc được từ một đống rời — nên hàm này chỉ dùng cho bảng Grundy và
 * cho phổ. Chỗ **duy nhất** biết đủ luật là `allMoves`.
 */
export function movesFromPile(
  n: number,
  rule: GameRule,
): readonly (readonly number[])[] {
  const atoms = ruleAtoms(rule);
  const out: number[][] = [];
  for (const atom of atoms) collectLocal(n, atom, out);
  // Chỉ hợp mới sinh nước trùng (bốc $1$ có mặt ở cả hai thành viên chẳng hạn).
  // Với luật đơn thì bỏ hẳn bước này: hàm nằm trong vòng trong cùng của solver.
  return atoms.length === 1 ? out : dedupeParts(out);
}

function collectLocal(n: number, atom: GameRuleAtom, out: number[][]): void {
  if (atom.type === 'subtract') {
    const max = Math.min(atom.max ?? n, n);
    for (let take = atom.min; take <= max; take += 1) out.push([n - take]);
    return;
  }

  if (atom.type === 'subtract-set') {
    for (const take of atom.allowed) {
      if (take <= n) out.push([n - take]);
    }
    return;
  }

  if (atom.type === 'subtract-fraction') {
    // Cận đọc từ **thế hiện tại**, không phải hằng số. Đống $1$ viên hết nước —
    // $\lfloor 1/2 \rfloor = 0$ — nên nó là thế cuối, đúng như luật gốc.
    const max = Math.floor(n / atom.denominator);
    for (let take = 1; take <= max; take += 1) out.push([n - take]);
    return;
  }

  if (atom.type === 'split-unequal') {
    for (let a = 1; a < n - a; a += 1) out.push([a, n - a]);
    return;
  }

  if (atom.type === 'split-any') {
    for (let a = 1; a <= n - a; a += 1) out.push([a, n - a]);
    return;
  }

  // Thành viên toàn cục: không góp nước nào ở mức một đống.
}

/**
 * Một nước đi.
 *
 * `piles` là **danh sách** chỉ số, không phải một chỉ số. Đổi kiểu này là toàn bộ
 * chi phí thật của GM-05: trước đó `Move` là "một đống biến thành mấy đống", nên
 * nước chéo của Wythoff — bốc bằng nhau ở *hai* đống — không có cách nào diễn đạt.
 * Solver thì gần như không phải sửa.
 */
export interface Move {
  /** Chỉ số các đống bị đụng, tăng dần. */
  readonly piles: readonly number[];
  /** Đống `piles[i]` trở thành `becomes[i]`; đống về $0$ thì biến mất. */
  readonly becomes: readonly (readonly number[])[];
}

export interface GameAnalysis {
  /**
   * Giá trị Grundy từng đống.
   *
   * Rỗng khi lý thuyết ấy **không** áp dụng: misère, hoặc luật toàn cục. Rỗng là
   * cố ý — trả một mảng số cho Wythoff sẽ là một câu trả lời tự tin và sai.
   */
  readonly grundy: readonly number[];
  /** XOR các giá trị Grundy. Chỉ có nghĩa khi `grundy` không rỗng. */
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

/**
 * Giá trị Grundy của một đống cỡ `n`, luật chơi thường (ai không đi được thì thua).
 *
 * `mex` của tập giá trị các thế đi tới được. Với luật chia, thế đi tới là **hai**
 * đống nên giá trị của nó là XOR của hai — đó chính là định lý Sprague–Grundy
 * áp cho tổng của hai trò con. Chỉ gọi được với luật cục bộ.
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

  const local = isLocalRule(rule);

  // Từ chối **theo ước lượng**, trước khi sinh nước nào.
  //
  // Trần `maxStates` bên trong `retrograde` cũng chặn được, nhưng nó chỉ chặn sau
  // khi đã duyệt hai trăm nghìn thế — với sáu đống hai trăm viên, mỗi thế có hàng
  // nghìn nước, nên "chặn" ấy mất vài phút. Ước lượng thì tính trong sáu phép nhân.
  if (!local && stateSpaceEstimate(piles) > GAME_LIMITS.maxStates) {
    return {
      ...EMPTY,
      refused: `Không gian thế vượt trần ${GAME_LIMITS.maxStates} nên không giải được`,
    };
  }

  const all = allMoves(piles, rule);

  if (local && !misere) {
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

  // Misère, hoặc luật toàn cục: XOR không áp dụng được, phải duyệt lùi toàn bộ
  // không gian thế.
  const solved = retrograde(piles, rule, misere);
  if (solved === null) {
    return {
      ...EMPTY,
      totalMoves: all.length,
      refused: `Không gian thế vượt trần ${GAME_LIMITS.maxStates} nên không giải được`,
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

/**
 * Mọi nước đi từ một thế — **nguồn sự thật duy nhất** về luật.
 *
 * Solver, lệnh sandbox, thanh công cụ và validator đều gọi vào đây, nên không có
 * đường nào để thanh công cụ bày ra một nước mà solver coi là phạm luật.
 */
export function allMoves(piles: readonly number[], rule: GameRule): Move[] {
  const atoms = ruleAtoms(rule);
  const out: Move[] = [];

  for (const atom of atoms) {
    if (isLocalAtom(atom)) {
      piles.forEach((n, index) => {
        const parts: number[][] = [];
        collectLocal(n, atom, parts);
        for (const becomes of parts) out.push({ piles: [index], becomes: [becomes] });
      });
      continue;
    }

    if (atom.type === 'subtract-equal-pair') {
      // Cùng một số viên, hai đống khác nhau. Cặp không thứ tự — $\{i,j\}$ và
      // $\{j,i\}$ là một nước.
      for (let i = 0; i < piles.length; i += 1) {
        for (let j = i + 1; j < piles.length; j += 1) {
          const max = Math.min(piles[i] as number, piles[j] as number);
          for (let take = 1; take <= max; take += 1) {
            out.push({
              piles: [i, j],
              becomes: [[(piles[i] as number) - take], [(piles[j] as number) - take]],
            });
          }
        }
      }
      continue;
    }

    // subtract-multiple-of-other: cặp **có** thứ tự — bốc khỏi $i$ theo cỡ của $j$.
    for (let i = 0; i < piles.length; i += 1) {
      for (let j = 0; j < piles.length; j += 1) {
        const other = piles[j] as number;
        // Đống rỗng không sinh nước: bội của $0$ là $0$, và một nước không đổi gì
        // là một vòng lặp vô tận trong lúc duyệt lùi.
        if (i === j || other === 0) continue;
        for (let take = other; take <= (piles[i] as number); take += other) {
          out.push({ piles: [i], becomes: [[(piles[i] as number) - take]] });
        }
      }
    }
  }

  // Cùng lý do với `movesFromPile`: luật đơn không sinh nước trùng, và hàm này
  // chạy ở mọi nút của phép duyệt lùi.
  return atoms.length === 1 ? out : dedupeMoves(out);
}

export function apply(piles: readonly number[], move: Move): number[] {
  const next: number[] = [];
  piles.forEach((n, index) => {
    const at = move.piles.indexOf(index);
    if (at === -1) next.push(n);
    else next.push(...(move.becomes[at] as readonly number[]));
  });
  return next.filter((n) => n > 0);
}

/**
 * Ước lượng **trần trên** cỡ không gian thế, dùng cho check lúc soạn.
 *
 * Chỉ cần cho luật toàn cục: luật cục bộ giải bằng bảng Grundy $O(n)$ nên không
 * bao giờ đụng trần. Tích $\prod (n_i + 1)$ đếm nhiều hơn thực tế (chuẩn hoá đa
 * tập gộp bớt), và đó là hướng sai đúng: từ chối sớm một bài *có thể* giải được
 * thì tác giả sửa được ngay, còn cho qua rồi treo trình duyệt người học thì không.
 */
export function stateSpaceEstimate(piles: readonly number[]): number {
  let product = 1;
  for (const n of piles) {
    product *= n + 1;
    if (product > GAME_LIMITS.maxStates) return product;
  }
  return product;
}

function xorAfter(piles: readonly number[], move: Move, g: readonly number[]): number {
  return apply(piles, move).reduce((x, n) => x ^ (g[n] as number), 0);
}

/** Khoá của một nước, để hợp hai thành viên không sinh ra nước trùng. */
function moveKey(move: Move): string {
  return `${move.piles.join(',')}|${move.becomes.map((b) => b.join('+')).join(',')}`;
}

function dedupeMoves(moves: readonly Move[]): Move[] {
  const seen = new Set<string>();
  const out: Move[] = [];
  for (const move of moves) {
    const k = moveKey(move);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(move);
  }
  return out;
}

function dedupeParts(parts: readonly (readonly number[])[]): number[][] {
  const seen = new Set<string>();
  const out: number[][] = [];
  for (const part of parts) {
    const k = part.join('+');
    if (seen.has(k)) continue;
    seen.add(k);
    out.push([...part]);
  }
  return out;
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
 * Duyệt lùi: thế nào thắng, thế nào thua.
 *
 * Định nghĩa đệ quy chuẩn — một thế **thắng** khi có nước đi tới thế thua. Chỗ
 * khác duy nhất giữa misère và luật thường nằm ở thế **cuối**: hết nước đi thì
 * luật thường là thua, misère là thắng.
 *
 * Đường này chạy cho hai trường hợp, và chúng khác nhau về lý do: misère vì
 * Sprague–Grundy không áp dụng cho quy ước thắng ấy, luật toàn cục vì ván không
 * phải tổng của các trò con độc lập.
 *
 * Trả `null` khi vượt trần thay vì chạy tiếp: một bài lỡ khai đống lớn sẽ treo
 * trình duyệt của người học, không phải của tác giả (NFR-P4).
 */
function retrograde(
  start: readonly number[],
  rule: GameRule,
  terminalWins: boolean,
): { win: Map<string, boolean> } | null {
  const win = new Map<string, boolean>();
  const visiting = new Set<string>();

  const solve = (piles: readonly number[]): boolean | null => {
    const k = key(piles);
    const known = win.get(k);
    if (known !== undefined) return known;
    if (win.size >= GAME_LIMITS.maxStates) return null;
    // Mọi luật hiện có làm tổng số viên giảm hoặc giữ nguyên rồi tách, nên không
    // có chu trình. Vòng canh này là chốt an toàn cho luật thêm về sau.
    if (visiting.has(k)) return null;
    visiting.add(k);

    const moves = allMoves(piles, rule);
    // Hết nước: luật thường thì người sắp đi **thua**, misère thì **thắng**.
    let result = moves.length === 0 && terminalWins;
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
 * câu để tin, nó là một vệt sọc hiện ra trên màn hình. Chỉ gọi được khi
 * `spectrumReadable(rule)`.
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
