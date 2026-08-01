import { type Expr } from './expr.js';

/**
 * Tập nghiệm **đọc ra từ cấu trúc** — nền của trục số (AL-15).
 *
 * ## Không giải bất phương trình
 *
 * Engine này không có bộ giải và mục này không mở một cái. Nó chỉ nhận **dạng chuẩn**
 * mà M60 đã dựng ra: một vế là biến trần, vế kia là hằng. Đó chính là dạng mà
 * `interval_from_factors` và `merge_intervals` trả về, và cũng là dạng mà người học vừa
 * biến đổi tới. Gặp dạng khác thì **không vẽ gì**, im lặng.
 *
 * Im lặng chứ không phải một dòng cảnh báo: trục số là một món quà, không phải một
 * nghĩa vụ. Bài nào chưa về dạng chuẩn thì vẫn là một bài đúng, và bày một lời than ở
 * đó là biến một tính năng thành một lời trách.
 *
 * Hệ quả đo được: `abs_to_interval` cho ra $(x-1) > -3$ — **không** phải dạng chuẩn, nên
 * bài `absolute-value-interval` không có trục số. Đó là một khoảng trống thật, ghi ra ở
 * đây thay vì lấp bằng một phép biến đổi ngầm: dịch $x-1$ thành $x$ là *giải* một bước,
 * và một bước giải mà người học không thấy là đúng thứ §4 cấm.
 *
 * ## Vì sao là **danh sách** khoảng
 *
 * `x < 1` **hoặc** `x > 2` là hai tia rời nhau, và vẽ nó thành một khoảng là nói dối.
 * Hội thì giao lại thành một khoảng; tuyển thì giữ nguyên nhiều mảnh.
 */

/** Một mảnh của tập nghiệm. `null` là vô cực. */
export interface Piece {
  readonly lo: number | null;
  readonly hi: number | null;
  /** Đầu mút có **thuộc** tập không — vẽ chấm đặc hay chấm rỗng. */
  readonly loClosed: boolean;
  readonly hiClosed: boolean;
}

export interface SolutionSet {
  readonly name: string;
  readonly pieces: readonly Piece[];
}

/** Hằng số hữu tỉ, hoặc `null`. */
function constOf(e: Expr): number | null {
  if (e.k === 'int') return e.v;
  if (e.k === 'rat') return e.p / e.q;
  // Một tích với $-1$ là cách engine viết số âm sau chuẩn hoá.
  if (e.k === 'mul' && e.args.length === 2) {
    const a = constOf(e.args[0] as Expr);
    const b = constOf(e.args[1] as Expr);
    return a !== null && b !== null ? a * b : null;
  }
  return null;
}

/** `x < 3` hoặc `3 > x` — cả hai đều là "một biến so với một hằng". */
function pieceOf(e: Expr): { name: string; piece: Piece } | null {
  if (e.k !== 'rel') return null;

  let op = e.op;
  let varSide = e.lhs;
  let constSide = e.rhs;
  if (varSide.k !== 'var') {
    // Đảo hai vế thì phải **lật dấu** — chỗ này là cái bẫy kinh điển, và nó đã cắn
    // engine một lần rồi ở `mul_both_sides` (§6).
    [varSide, constSide] = [e.rhs, e.lhs];
    op = op === '<' ? '>' : op === '>' ? '<' : op === '<=' ? '>=' : op === '>=' ? '<=' : op;
  }
  if (varSide.k !== 'var') return null;

  const at = constOf(constSide);
  if (at === null) return null;

  const name = varSide.name;
  switch (op) {
    case '<':
      return { name, piece: { lo: null, hi: at, loClosed: false, hiClosed: false } };
    case '<=':
      return { name, piece: { lo: null, hi: at, loClosed: false, hiClosed: true } };
    case '>':
      return { name, piece: { lo: at, hi: null, loClosed: false, hiClosed: false } };
    case '>=':
      return { name, piece: { lo: at, hi: null, loClosed: true, hiClosed: false } };
    case '=':
      // Một điểm. Vẽ được, và vẽ ra thì nó nói đúng thứ nó là.
      return { name, piece: { lo: at, hi: at, loClosed: true, hiClosed: true } };
    default:
      return null;
  }
}

/** Giao hai mảnh; `null` khi rỗng. */
function meet(a: Piece, b: Piece): Piece | null {
  const lo =
    a.lo === null ? b : b.lo === null ? a : a.lo > b.lo ? a : b.lo > a.lo ? b : { ...a, loClosed: a.loClosed && b.loClosed };
  const hi =
    a.hi === null ? b : b.hi === null ? a : a.hi < b.hi ? a : b.hi < a.hi ? b : { ...a, hiClosed: a.hiClosed && b.hiClosed };

  const out: Piece = {
    lo: lo.lo,
    hi: hi.hi,
    loClosed: lo.loClosed,
    hiClosed: hi.hiClosed,
  };
  if (out.lo !== null && out.hi !== null) {
    if (out.lo > out.hi) return null;
    if (out.lo === out.hi && !(out.loClosed && out.hiClosed)) return null;
  }
  return out;
}

/**
 * Tập nghiệm của một dòng, hoặc `null` khi dòng ấy không ở dạng vẽ được.
 *
 * Một biến duy nhất: hai biến thì "trục số" là mặt phẳng, và đó là một mục khác.
 */
export function solutionSetOf(e: Expr): SolutionSet | null {
  if (e.k === 'rel') {
    const one = pieceOf(e);
    return one === null ? null : { name: one.name, pieces: [one.piece] };
  }
  if (e.k !== 'sys') return null;

  const parts = e.rels.map(pieceOf);
  if (parts.some((p) => p === null)) return null;
  const found = parts as { name: string; piece: Piece }[];
  if (found.length === 0) return null;

  const name = found[0]!.name;
  if (found.some((p) => p.name !== name)) return null;

  if (e.join === 'or') return { name, pieces: found.map((p) => p.piece) };

  let acc: Piece | null = found[0]!.piece;
  for (const p of found.slice(1)) {
    if (acc === null) break;
    acc = meet(acc, p.piece);
  }
  return { name, pieces: acc === null ? [] : [acc] };
}

/** Mọi mốc hữu hạn của một tập — chỗ cần vạch và cần ghi số. */
export function boundsOf(set: SolutionSet): number[] {
  const out: number[] = [];
  for (const p of set.pieces) {
    if (p.lo !== null) out.push(p.lo);
    if (p.hi !== null && p.hi !== p.lo) out.push(p.hi);
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

/** Điểm này có thuộc tập không — dùng để **đối chiếu** với `evalRelation`. */
export function contains(set: SolutionSet, x: number): boolean {
  return set.pieces.some((p) => {
    if (p.lo !== null && (x < p.lo || (x === p.lo && !p.loClosed))) return false;
    if (p.hi !== null && (x > p.hi || (x === p.hi && !p.hiClosed))) return false;
    return true;
  });
}
