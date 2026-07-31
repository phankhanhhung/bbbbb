/**
 * Cây biểu thức — **vật thể trung tâm** của engine này.
 *
 * Khác `derivation` ở đúng một chỗ, và chỗ ấy quyết định mọi thứ còn lại: ở đó một
 * hạng tử là một chuỗi LaTeX mờ, ở đây nó là một cây máy đọc được. Nhờ vậy engine
 * áp được luật, kiểm được tính đúng, và biết hạng tử nào đi đâu qua mỗi bước — ba
 * việc mà một engine sắp chữ không làm được cái nào.
 *
 * Xem `docs/ENGINE-ALGEBRA.md` §3 để biết vì sao không có nút `neg` và `sub`.
 */

/** Danh tính bền của một nút: cấp lúc ra đời, đi theo nút qua mọi bước biến đổi. */
export type TermId = string;

export type RelOp = '=' | '<' | '<=' | '!=';

interface WithId {
  readonly id: TermId;
}

export type Expr =
  | ({ readonly k: 'int'; readonly v: number } & WithId)
  | ({ readonly k: 'rat'; readonly p: number; readonly q: number } & WithId)
  | ({ readonly k: 'var'; readonly name: string } & WithId)
  | ({ readonly k: 'add'; readonly args: readonly Expr[] } & WithId)
  | ({ readonly k: 'mul'; readonly args: readonly Expr[] } & WithId)
  | ({ readonly k: 'pow'; readonly base: Expr; readonly exp: number } & WithId)
  | ({ readonly k: 'div'; readonly num: Expr; readonly den: Expr } & WithId)
  | ({ readonly k: 'rel'; readonly op: RelOp; readonly lhs: Expr; readonly rhs: Expr } & WithId);

/**
 * Cấp phát danh tính.
 *
 * Một bộ đếm chạy suốt một scene, **không** reset giữa các dòng: `e7` ở dòng ba
 * phải là đúng nút `e7` của dòng một thì diff mới cho ra chuyển động thay vì một
 * cặp xoá–thêm (DAT-11/12).
 */
export class Minter {
  private n = 0;
  next(): TermId {
    this.n += 1;
    return `e${this.n}`;
  }
}

/* ---------- dựng nút, đã chuẩn hoá (§3.1) ---------- */

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));

export const int = (m: Minter, v: number): Expr => ({ k: 'int', v, id: m.next() });

/** Hữu tỉ, tối giản. `q == 1` thì trả về `int` — dạng chuẩn tắc không có `rat` mẫu 1. */
export function rat(m: Minter, p: number, q: number): Expr {
  if (q === 0) throw new Error('mẫu bằng 0');
  const s = q < 0 ? -1 : 1;
  const g = gcd(p, q) || 1;
  const np = (s * p) / g;
  const nq = (s * q) / g;
  return nq === 1 ? int(m, np) : { k: 'rat', p: np, q: nq, id: m.next() };
}

export const variable = (m: Minter, name: string): Expr => ({ k: 'var', name, id: m.next() });

/**
 * Tổng đã làm phẳng.
 *
 * Làm phẳng ở đây chứ không ở một bước "chuẩn hoá" riêng: mọi luật đều dựng nút
 * bằng hàm này, nên bất biến "add không lồng trực tiếp trong add" giữ được mà
 * không cần ai nhớ gọi thêm gì.
 */
export function add(m: Minter, args: readonly Expr[]): Expr {
  const flat: Expr[] = [];
  for (const a of args) {
    if (a.k === 'add') flat.push(...a.args);
    else flat.push(a);
  }
  if (flat.length === 0) return int(m, 0);
  if (flat.length === 1) return flat[0] as Expr;
  return { k: 'add', args: flat, id: m.next() };
}

export function mul(m: Minter, args: readonly Expr[]): Expr {
  const flat: Expr[] = [];
  for (const a of args) {
    if (a.k === 'mul') flat.push(...a.args);
    else flat.push(a);
  }
  if (flat.length === 0) return int(m, 1);
  if (flat.length === 1) return flat[0] as Expr;
  return { k: 'mul', args: flat, id: m.next() };
}

export function pow(m: Minter, base: Expr, exp: number): Expr {
  if (exp === 0) return int(m, 1);
  if (exp === 1) return base;
  return { k: 'pow', base, exp, id: m.next() };
}

export const div = (m: Minter, num: Expr, den: Expr): Expr => ({
  k: 'div',
  num,
  den,
  id: m.next(),
});

export const rel = (m: Minter, op: RelOp, lhs: Expr, rhs: Expr): Expr => ({
  k: 'rel',
  op,
  lhs,
  rhs,
  id: m.next(),
});

/** Đối của một biểu thức: $-e$ là `mul[-1, e]`, trừ khi $e$ là số thì đổi dấu luôn. */
export function negate(m: Minter, e: Expr): Expr {
  if (e.k === 'int') return int(m, -e.v);
  if (e.k === 'rat') return rat(m, -e.p, e.q);
  return mul(m, [int(m, -1), e]);
}

/* ---------- đi trong cây ---------- */

export function children(e: Expr): readonly Expr[] {
  switch (e.k) {
    case 'add':
    case 'mul':
      return e.args;
    case 'pow':
      return [e.base];
    case 'div':
      return [e.num, e.den];
    case 'rel':
      return [e.lhs, e.rhs];
    default:
      return [];
  }
}

/** Dựng lại một nút với danh sách con khác, **giữ nguyên `id`**. */
export function withChildren(e: Expr, kids: readonly Expr[]): Expr {
  switch (e.k) {
    case 'add':
      return { ...e, args: kids };
    case 'mul':
      return { ...e, args: kids };
    case 'pow':
      return { ...e, base: kids[0] as Expr };
    case 'div':
      return { ...e, num: kids[0] as Expr, den: kids[1] as Expr };
    case 'rel':
      return { ...e, lhs: kids[0] as Expr, rhs: kids[1] as Expr };
    default:
      return e;
  }
}

export function walk(e: Expr, visit: (node: Expr) => void): void {
  visit(e);
  for (const c of children(e)) walk(c, visit);
}

export const nodeCount = (e: Expr): number => {
  let n = 0;
  walk(e, () => {
    n += 1;
  });
  return n;
};

export function depth(e: Expr): number {
  const kids = children(e);
  return kids.length === 0 ? 1 : 1 + Math.max(...kids.map(depth));
}

export function varsOf(e: Expr): Set<string> {
  const out = new Set<string>();
  walk(e, (n) => {
    if (n.k === 'var') out.add(n.name);
  });
  return out;
}

export const isConst = (e: Expr): boolean => varsOf(e).size === 0;

/** Bậc tổng — cận trên thô, đủ cho ràng buộc Schwartz–Zippel ở `check.ts`. */
export function totalDegree(e: Expr): number {
  switch (e.k) {
    case 'var':
      return 1;
    case 'int':
    case 'rat':
      return 0;
    case 'add':
      return Math.max(...e.args.map(totalDegree));
    case 'mul':
      return e.args.reduce((s, a) => s + totalDegree(a), 0);
    case 'pow':
      return totalDegree(e.base) * Math.abs(e.exp);
    case 'div':
      return totalDegree(e.num) + totalDegree(e.den);
    case 'rel':
      return Math.max(totalDegree(e.lhs), totalDegree(e.rhs));
  }
}

/* ---------- đường dẫn (§3.4) ---------- */

/**
 * `"L.0.1"` — vế trái, con thứ nhất, con thứ hai của nó. `""` là gốc.
 *
 * Đường dẫn nói **nó đang ở đâu**; `TermId` nói **nó là ai**. Hai thứ khác nhau, và
 * gộp chúng là lỗi thiết kế đắt nhất có thể mắc ở engine này: sau `commute` thì hạng
 * tử đổi đường dẫn, nên id-theo-đường-dẫn biến một phép dịch chỗ thành cặp xoá–thêm.
 */
export function segmentsOf(path: string): number[] {
  if (path === '') return [];
  return path.split('.').map((s) => {
    if (s === 'L') return 0;
    if (s === 'R') return 1;
    const n = Number(s);
    if (!Number.isInteger(n) || n < 0) throw new Error(`đoạn đường dẫn không hợp lệ: "${s}"`);
    return n;
  });
}

export function nodeAt(root: Expr, path: string): Expr | null {
  let cur: Expr = root;
  for (const i of segmentsOf(path)) {
    const kids = children(cur);
    const next = kids[i];
    if (next === undefined) return null;
    cur = next;
  }
  return cur;
}

/** Thay cây con tại `path`, giữ nguyên id của mọi nút trên đường đi. */
export function replaceAt(root: Expr, path: string, next: Expr): Expr | null {
  const segs = segmentsOf(path);
  const go = (node: Expr, i: number): Expr | null => {
    if (i === segs.length) return next;
    const kids = [...children(node)];
    const at = segs[i] as number;
    if (kids[at] === undefined) return null;
    const child = go(kids[at] as Expr, i + 1);
    if (child === null) return null;
    kids[at] = child;
    return withChildren(node, kids);
  };
  return go(root, 0);
}

/** Đường dẫn của **mọi** nút, để hit-test và để kiểm chốt canh. */
export function allPaths(root: Expr): Map<string, Expr> {
  const out = new Map<string, Expr>();
  const go = (node: Expr, path: string): void => {
    out.set(path, node);
    children(node).forEach((c, i) => {
      const seg = node.k === 'rel' ? (i === 0 ? 'L' : 'R') : String(i);
      go(c, path === '' ? seg : `${path}.${seg}`);
    });
  };
  go(root, '');
  return out;
}

/**
 * Đưa cây về dạng chuẩn tắc §3.1 sau khi ghép một cây con mới vào.
 *
 * Cần vì `replaceAt` chỉ thay chỗ, không dựng lại bằng hàm khởi tạo — nên một luật
 * trả về `add` mà chỗ nó thay vào lại nằm trong `add` thì sinh ra `add` lồng `add`.
 * Đó không sai về toán nhưng phá bất biến, và triệu chứng của nó rất khó đọc: đường
 * dẫn `"1"` bỗng trỏ vào một nút khác hẳn nút tác giả nhắm tới.
 *
 * Nút bao bị nuốt sẽ **mất id** — và đúng thế: nó thật sự biến mất. `model` ghi lại
 * chuyện đó trong `trace`, không giấu đi.
 */
export function normalize(e: Expr): Expr {
  const kids = children(e).map(normalize);
  if (e.k !== 'add' && e.k !== 'mul') return withChildren(e, kids);

  const flat: Expr[] = [];
  for (const c of kids) {
    if (c.k === e.k) flat.push(...c.args);
    else flat.push(c);
  }
  if (flat.length === 1) return flat[0] as Expr;
  return { ...e, args: flat };
}

/* ---------- so sánh ---------- */

/** Bằng nhau **về cấu trúc**, bỏ qua `id`. */
export function same(a: Expr, b: Expr): boolean {
  if (a.k !== b.k) return false;
  switch (a.k) {
    case 'int':
      return a.v === (b as typeof a).v;
    case 'rat':
      return a.p === (b as typeof a).p && a.q === (b as typeof a).q;
    case 'var':
      return a.name === (b as typeof a).name;
    case 'pow':
      return a.exp === (b as typeof a).exp && same(a.base, (b as typeof a).base);
    case 'rel':
      return (
        a.op === (b as typeof a).op &&
        same(a.lhs, (b as typeof a).lhs) &&
        same(a.rhs, (b as typeof a).rhs)
      );
    default: {
      const x = children(a);
      const y = children(b);
      return x.length === y.length && x.every((c, i) => same(c, y[i] as Expr));
    }
  }
}
