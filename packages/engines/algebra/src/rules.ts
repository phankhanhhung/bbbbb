import { definiteSign, definitelyNonNegative, definitelyNonZero } from './check.js';
import { needsRealEval } from './expr.js';
import {
  Minter,
  abs,
  add,
  div,
  int,
  mul,
  negate,
  pow,
  flipOp,
  rat,
  root,
  same,
  variable,
  walk,
  type Expr,
  type TermId,
} from './expr.js';
import { parse } from './parse.js';

/**
 * Tập luật (`ENGINE-ALGEBRA.md` §4).
 *
 * Mỗi luật là **hàm toàn phần trên một cây con**: nhận cây con và một tham số tuỳ
 * chọn, trả về cây con mới hoặc lời từ chối. Không luật nào đi ra ngoài cây con nó
 * được gọi vào, trừ nhóm ★ vốn định nghĩa trên nút `rel`.
 *
 * **Không có `simplify`, không có bộ giải.** Một nút bấm nhảy năm bước là đúng thứ
 * làm người học không học được gì. Mọi thay đổi phải mang tên một luật, và tên ấy
 * hiện ở cột bên phải — nên cột ghi chú cũng không nói dối được.
 */

export interface RuleOutcome {
  readonly after: Expr;
  /** Nút bị **nhân bản**: id cũ → id mới sinh thêm. `distribute` là ca duy nhất. */
  readonly dup?: ReadonlyArray<readonly [TermId, TermId]>;
  /** Nút bị **nhập một**: các id cũ → id còn lại. `collect_like` là ca chính. */
  readonly merged?: ReadonlyArray<readonly [readonly TermId[], TermId]>;
  /** Điều kiện kèm theo (AL-08), ví dụ `"x − 1 ≠ 0"`. */
  readonly condition?: string;
}

export type RuleRun = (
  m: Minter,
  node: Expr,
  arg: string | undefined,
) => RuleOutcome | { refusal: string };

export interface Rule {
  readonly id: string;
  /** Nhãn tiếng Việt — in ở cột luật, và dùng luôn làm nhãn pha (chữ trơn). */
  readonly label: string;
  /** Luật này chỉ áp được trên nút `rel` (nhóm ★). */
  readonly onRelation?: boolean;
  readonly needsArg?: boolean;
  run: RuleRun;
}

const no = (why: string): { refusal: string } => ({ refusal: why });

/**
 * Điều kiện in ra hình, lấy từ chuỗi tác giả gõ.
 *
 * Đổi gạch nối ASCII thành dấu trừ toán học: chuỗi này nằm cạnh công thức đã sắp
 * chữ, và `a - b` bên cạnh `a − b` đọc ra ngay là hai thứ khác nhau.
 */
const conditionText = (arg: string): string => `${arg.replace(/-/g, '−')} ≠ 0`;

/** Sao chép một cây con với id hoàn toàn mới — dùng khi luật nhân bản một nhánh. */
function freshCopy(m: Minter, e: Expr): { copy: Expr; pairs: Array<readonly [TermId, TermId]> } {
  const pairs: Array<readonly [TermId, TermId]> = [];
  const go = (n: Expr): Expr => {
    const id = m.next();
    pairs.push([n.id, id]);
    switch (n.k) {
      case 'add':
      case 'mul':
        return { ...n, id, args: n.args.map(go) };
      case 'pow':
        return { ...n, id, base: go(n.base) };
      case 'div':
        return { ...n, id, num: go(n.num), den: go(n.den) };
      case 'rel':
        return { ...n, id, lhs: go(n.lhs), rhs: go(n.rhs) };
      default:
        return { ...n, id };
    }
  };
  return { copy: go(e), pairs };
}

/** Tách một hạng tử thành (hệ số hữu tỉ, phần còn lại). $3x$ → $(3, x)$. */
function splitCoefficient(m: Minter, e: Expr): { coef: number; rest: Expr | null } {
  if (e.k === 'int') return { coef: e.v, rest: null };
  if (e.k !== 'mul') return { coef: 1, rest: e };

  // Gom **mọi** thừa số nguyên, không chỉ cái đứng đầu: `a - 3*x` parse ra
  // `mul[−1, 3, x]`, và lấy mỗi số đầu thì hệ số ra $-1$ còn phần còn lại là $3x$ —
  // nên $-3x$ và $5x$ bị coi là không đồng dạng.
  let coef = 1;
  const rest: Expr[] = [];
  for (const a of e.args) {
    if (a.k === 'int') coef *= a.v;
    else rest.push(a);
  }
  if (rest.length === e.args.length) return { coef: 1, rest: e };
  if (rest.length === 0) return { coef, rest: null };
  return { coef, rest: rest.length === 1 ? (rest[0] as Expr) : mul(m, rest) };
}

const withCoefficient = (m: Minter, coef: number, rest: Expr | null): Expr => {
  if (rest === null) return int(m, coef);
  if (coef === 1) return rest;
  return mul(m, [int(m, coef), rest]);
};

/** Tính một cây con không chứa biến ra số hữu tỉ. `null` khi không tính được. */
function exactValue(e: Expr): { p: number; q: number } | null {
  const comb = (
    a: { p: number; q: number },
    b: { p: number; q: number },
    op: 'add' | 'mul',
  ): { p: number; q: number } =>
    op === 'add' ? { p: a.p * b.q + b.p * a.q, q: a.q * b.q } : { p: a.p * b.p, q: a.q * b.q };

  switch (e.k) {
    case 'int':
      return { p: e.v, q: 1 };
    case 'rat':
      return { p: e.p, q: e.q };
    case 'add':
    case 'mul': {
      let acc = e.k === 'add' ? { p: 0, q: 1 } : { p: 1, q: 1 };
      for (const a of e.args) {
        const v = exactValue(a);
        if (v === null) return null;
        acc = comb(acc, v, e.k);
      }
      return acc;
    }
    case 'pow': {
      const b = exactValue(e.base);
      if (b === null) return null;
      const n = Math.abs(e.exp);
      const p = Math.pow(b.p, n);
      const q = Math.pow(b.q, n);
      if (!Number.isSafeInteger(p) || !Number.isSafeInteger(q)) return null;
      return e.exp > 0 ? { p, q } : { p: q, q: p };
    }
    case 'div': {
      const n = exactValue(e.num);
      const d = exactValue(e.den);
      if (n === null || d === null || d.p === 0) return null;
      return { p: n.p * d.q, q: n.q * d.p };
    }
    default:
      return null;
  }
}

/* ---------- các luật ---------- */

const commute: Rule = {
  id: 'commute',
  label: 'đổi chỗ',
  needsArg: true,
  run(m, node, arg) {
    if (node.k !== 'add' && node.k !== 'mul') return no('chỉ đổi chỗ được trong tổng hoặc tích');
    const [a, b] = (arg ?? '').split(',').map((s) => Number(s.trim()));
    if (!Number.isInteger(a) || !Number.isInteger(b)) return no('cần tham số dạng "0,1"');
    const args = [...node.args];
    if (args[a as number] === undefined || args[b as number] === undefined) {
      return no(`chỉ số ngoài khoảng 0..${args.length - 1}`);
    }
    const tmp = args[a as number] as Expr;
    args[a as number] = args[b as number] as Expr;
    args[b as number] = tmp;
    return { after: { ...node, args } };
  },
};

const distribute: Rule = {
  id: 'distribute',
  label: 'nhân phân phối',
  run(m, node) {
    if (node.k !== 'mul') return no('nhân phân phối cần một tích');
    const at = node.args.findIndex((a) => a.k === 'add');
    if (at === -1) return no('không có thừa số nào là tổng');

    const sum = node.args[at] as Expr & { k: 'add' };
    const others = node.args.filter((_, i) => i !== at);
    const dup: Array<readonly [TermId, TermId]> = [];

    // Thừa số ngoài ngoặc **nhân bản** theo số hạng tử trong ngoặc. Bản đầu giữ id
    // gốc, các bản sau mang id mới — nhờ vậy choreography vẽ được một bản tách ra
    // chứ không phải cả cụm nhấp nháy.
    const terms = sum.args.map((term, i) => {
      const factors =
        i === 0
          ? others
          : others.map((o) => {
              const { copy, pairs } = freshCopy(m, o);
              dup.push(...pairs);
              return copy;
            });
      return mul(m, [...factors, term]);
    });

    return { after: add(m, terms), dup };
  },
};

const factor: Rule = {
  id: 'factor',
  label: 'đặt nhân tử chung',
  needsArg: true,
  run(m, node, arg) {
    if (node.k !== 'add') return no('đặt nhân tử chung cần một tổng');
    if (arg === undefined) return no('cần nói đặt nhân tử nào ra ngoài');

    const common = parse(arg, m);
    const rests: Expr[] = [];
    for (const term of node.args) {
      const rest = divideOut(m, term, common);
      if (rest === null) return no(`"${arg}" không phải thừa số của mọi hạng tử`);
      rests.push(rest);
    }
    return { after: mul(m, [common, add(m, rests)]) };
  },
};

/** $t / f$ khi $f$ là thừa số hiển của $t$; `null` nếu không. */
function divideOut(m: Minter, term: Expr, factorOf: Expr): Expr | null {
  if (same(term, factorOf)) return int(m, 1);

  // Hệ số số học: $6x$ chia $3$ ra $2x$.
  const fv = exactValue(factorOf);
  if (fv !== null && fv.p !== 0) {
    const { coef, rest } = splitCoefficient(m, term);
    if (fv.q === 1 && coef % fv.p === 0) return withCoefficient(m, coef / fv.p, rest);
  }

  if (term.k !== 'mul') return null;
  const args = [...term.args];
  const at = args.findIndex((a) => same(a, factorOf));
  if (at === -1) return null;
  args.splice(at, 1);
  return args.length === 0 ? int(m, 1) : mul(m, args);
}

const collectLike: Rule = {
  id: 'collect_like',
  label: 'gộp hạng tử đồng dạng',
  run(m, node) {
    if (node.k !== 'add') return no('gộp hạng tử cần một tổng');

    const parts = node.args.map((a) => ({ node: a, ...splitCoefficient(m, a) }));
    // Nhóm **không cần kề nhau**: $3x + 2 + 5x$ vẫn gộp được. Bắt người học
    // `commute` trước là bắt họ làm một bước không mang nội dung gì.
    const groups: Array<{ rest: Expr | null; idx: number[] }> = [];
    parts.forEach((p, i) => {
      const g = groups.find((x) =>
        x.rest === null ? p.rest === null : p.rest !== null && same(x.rest, p.rest),
      );
      if (g) g.idx.push(i);
      else groups.push({ rest: p.rest, idx: [i] });
    });

    if (!groups.some((g) => g.idx.length > 1)) return no('không có hai hạng tử nào đồng dạng');

    const merged: Array<readonly [readonly TermId[], TermId]> = [];
    const out: Expr[] = [];
    for (const g of groups) {
      const coef = g.idx.reduce((s, i) => s + (parts[i] as { coef: number }).coef, 0);
      if (coef === 0) {
        // Triệt tiêu: mọi id của nhóm biến mất, và `model` biến nó thành pha `hide`.
        merged.push([g.idx.map((i) => (parts[i] as { node: Expr }).node.id), '']);
        continue;
      }
      if (g.idx.length === 1) {
        // Nhóm một mình thì **giữ nguyên nút cũ**, không dựng lại. Dựng lại là cấp
        // id mới cho một hạng tử không hề đổi, và diff biến nó thành một cặp
        // xoá–thêm: hạng tử `2` nhấp nháy trong khi lời kể nói nó đứng yên.
        out.push((parts[g.idx[0] as number] as { node: Expr }).node);
        continue;
      }
      const term = withCoefficient(m, coef, g.rest);
      merged.push([g.idx.map((i) => (parts[i] as { node: Expr }).node.id), term.id]);
      out.push(term);
    }

    return { after: out.length === 0 ? int(m, 0) : add(m, out), merged };
  },
};

const evalInt: Rule = {
  id: 'eval_int',
  label: 'tính ra số',
  run(m, node) {
    const v = exactValue(node);
    if (v === null) return no('cây con này còn chứa biến, không tính ra số được');
    if (v.q === 0) return no('chia cho 0');
    const after = rat(m, v.p, v.q);
    if (same(after, node)) return no('đã là số rồi');
    return { after };
  },
};

const expandSquare: Rule = {
  id: 'expand_square',
  label: 'khai triển bình phương',
  run(m, node) {
    if (node.k !== 'pow' || node.exp !== 2) return no('cần một luỹ thừa bậc 2');
    if (node.base.k !== 'add' || node.base.args.length !== 2) {
      return no('cơ số phải là tổng hai hạng tử');
    }
    const [a, b] = node.base.args as [Expr, Expr];
    const dup: Array<readonly [TermId, TermId]> = [];
    const twin = (e: Expr): Expr => {
      const { copy, pairs } = freshCopy(m, e);
      dup.push(...pairs);
      return copy;
    };
    // $(a+b)^2 = a^2 + 2ab + b^2$. Mỗi vế xuất hiện ba lần nên hai bản sao mới.
    return {
      after: add(m, [
        pow(m, a, 2),
        mul(m, [int(m, 2), twin(a), twin(b)]),
        pow(m, b, 2),
      ]),
      dup,
    };
  },
};

/**
 * Bỏ phần tử trung hoà: $x \cdot 1 \to x$, $x + 0 \to x$.
 *
 * Phải là **một luật có tên**, không phải chuẩn hoá lặng lẽ trong hàm dựng. Hai lý
 * do: nếu tác giả gõ `x*1` trong `start` thì engine không được tự sửa lời họ viết;
 * và một nút biến mất giữa hai dòng mà không luật nào giải thích là đúng thứ engine
 * này sinh ra để dẹp. Luật này có thật trong sách giáo khoa — "nhân với 1".
 */
const dropUnit: Rule = {
  id: 'drop_unit',
  label: 'bỏ nhân 1, cộng 0',
  run(m, node) {
    if (node.k === 'mul') {
      const kept = node.args.filter((a) => !(a.k === 'int' && a.v === 1));
      if (kept.length === node.args.length) return no('không có thừa số 1 nào');
      return { after: kept.length === 0 ? int(m, 1) : mul(m, kept) };
    }
    if (node.k === 'add') {
      const kept = node.args.filter((a) => !(a.k === 'int' && a.v === 0));
      if (kept.length === node.args.length) return no('không có hạng tử 0 nào');
      return { after: kept.length === 0 ? int(m, 0) : add(m, kept) };
    }
    return no('cần một tổng hoặc một tích');
  },
};

/**
 * Điều kiện tồn tại của căn bậc chẵn, cùng họ với AL-08.
 *
 * $\sqrt{ab} = \sqrt a\,\sqrt b$ **sai** khi cả hai âm: $\sqrt{(-1)(-4)} = 2$ nhưng vế
 * phải không xác định trên $\mathbb{R}$. Engine không chặn — nó ghi điều kiện ra hình,
 * đúng cách nó xử `mul_both_sides`.
 */
/** $\sqrt{k^2 a} = k\sqrt a$ — rút thừa số chính phương ra ngoài dấu căn. */
const pullSquareOut: Rule = {
  id: 'pull_square_out',
  label: 'rút thừa số ra ngoài căn',
  run(m, node) {
    if (node.k !== 'root') return no('cần một dấu căn');
    const n = node.index;

    const factors = node.arg.k === 'mul' ? [...node.arg.args] : [node.arg];
    const outside: Expr[] = [];
    const inside: Expr[] = [];

    for (const f of factors) {
      // Hệ số nguyên: tách phần luỹ thừa bậc `n` lớn nhất. $\sqrt{48} = 4\sqrt3$.
      if (f.k === 'int' && f.v > 0) {
        let k = 1;
        let rest = f.v;
        for (let d = 2; d * d <= rest || Math.pow(d, n) <= rest; d += 1) {
          while (rest % Math.pow(d, n) === 0) {
            rest /= Math.pow(d, n);
            k *= d;
          }
        }
        if (k > 1) {
          outside.push(int(m, k));
          if (rest !== 1) inside.push(int(m, rest));
          continue;
        }
      }
      // $\sqrt{x^4} = x^2$ khi số mũ chia hết cho chỉ số căn.
      if (f.k === 'pow' && f.exp > 0 && f.exp % n === 0) {
        outside.push(pow(m, f.base, f.exp / n));
        continue;
      }
      inside.push(f);
    }

    if (outside.length === 0) return no('không có thừa số nào rút ra được');

    // $\sqrt{x^2} = |x|$, **không** phải $x$ — vế sau sai với mọi $x < 0$. Trước khi có
    // nút `abs` thì engine phải từ chối chỗ này; nay nó viết ra đúng ký hiệu. Không
    // ghi điều kiện "$x \ge 0$": thứ thiếu là một **ký hiệu**, không phải một giả thiết,
    // và một điều kiện ở đây làm người đọc tưởng đẳng thức đúng nếu chịu thêm giả thiết.
    const wrapped =
      n % 2 === 0 ? outside.map((o) => (definitelyNonNegative(o) ? o : abs(m, o))) : outside;

    const left = inside.length === 0 ? [] : [root(m, n, mul(m, inside))];
    return { after: mul(m, [...wrapped, ...left]) };
  },
};

/** $\sqrt a\,\sqrt b = \sqrt{ab}$ và chiều ngược lại. */
const rootOfProduct: Rule = {
  id: 'root_of_product',
  label: 'gộp hai căn',
  run(m, node) {
    if (node.k !== 'mul') return no('cần một tích');
    const at = node.args.findIndex((a) => a.k === 'root');
    const bt = node.args.findIndex((a, i) => i !== at && a.k === 'root');
    if (at === -1 || bt === -1) return no('không có hai dấu căn nào');

    const a = node.args[at] as Expr & { k: 'root' };
    const b = node.args[bt] as Expr & { k: 'root' };
    if (a.index !== b.index) return no('hai căn khác chỉ số');

    const rest = node.args.filter((_, i) => i !== at && i !== bt);
    const joined = root(m, a.index, mul(m, [a.arg, b.arg]));
    return {
      after: rest.length === 0 ? joined : mul(m, [...rest, joined]),
      merged: [[[a.id, b.id], joined.id]],
    };
  },
};

/** $(\sqrt a)^n = a$ khi số mũ bằng chỉ số căn. */
const rootPow: Rule = {
  id: 'root_pow',
  label: 'căn rồi luỹ thừa thì triệt tiêu',
  run(m, node) {
    if (node.k !== 'pow' || node.base.k !== 'root') return no('cần luỹ thừa của một căn');
    if (node.exp !== node.base.index) return no('số mũ phải bằng chỉ số căn');
    // Không cần điều kiện: nếu $\sqrt[n]a$ đã xác định thì $(\sqrt[n]a)^n = a$ đúng
    // hệt. Điều kiện tồn tại nằm ở chính dấu căn của dòng trước, không ở bước này.
    return { after: node.base.arg };
  },
};

/** Trục căn thức ở mẫu: $\dfrac{a}{\sqrt b} = \dfrac{a\sqrt b}{b}$. */
const rationalize: Rule = {
  id: 'rationalize',
  label: 'trục căn thức ở mẫu',
  run(m, node) {
    if (node.k !== 'div') return no('cần một phân số');
    const den = node.den;
    const r =
      den.k === 'root'
        ? den
        : den.k === 'mul'
          ? (den.args.find((a) => a.k === 'root') as (Expr & { k: 'root' }) | undefined)
          : undefined;
    if (r === undefined || r.k !== 'root') return no('mẫu không chứa căn');
    if (r.index !== 2) return no('mới trục được căn bậc hai');

    const { copy } = freshCopy(m, r);
    const others = den.k === 'mul' ? den.args.filter((a) => a.id !== r.id) : [];
    const newDen = mul(m, [...others, r.arg]);
    return {
      after: div(m, mul(m, [node.num, copy]), newDen),
      condition: definitelyNonZero(r.arg) ? undefined : conditionText('mẫu'),
    };
  },
};

/** $\sqrt{16} = 4$ — chỉ khi ra số nguyên, không làm tròn. */
const evalRoot: Rule = {
  id: 'eval_root',
  label: 'tính căn',
  run(m, node) {
    if (node.k !== 'root') return no('cần một dấu căn');
    const v = exactValue(node.arg);
    if (v === null) return no('trong căn còn chứa biến');
    if (v.q !== 1 || v.p < 0) return no('chỉ tính được căn của số nguyên không âm');
    const r = Math.round(Math.pow(v.p, 1 / node.index));
    if (Math.pow(r, node.index) !== v.p) return no(`${v.p} không phải luỹ thừa bậc ${node.index}`);
    return { after: int(m, r) };
  },
};

/**
 * Bảy hằng đẳng thức đáng nhớ — trục chính của đại số THCS.
 *
 * $(a\pm b)^2$ đã có ở `expand_square` (dấu trừ đi qua vì $b$ nhận giá trị âm). Ở đây
 * là bốn cái còn lại, chia hai chiều: **khai triển** và **phân tích**.
 */
const expandCube: Rule = {
  id: 'expand_cube',
  label: 'khai triển lập phương',
  run(m, node) {
    if (node.k !== 'pow' || node.exp !== 3) return no('cần một luỹ thừa bậc 3');
    if (node.base.k !== 'add' || node.base.args.length !== 2) {
      return no('cơ số phải là tổng hai hạng tử');
    }
    const [a, b] = node.base.args as [Expr, Expr];
    const dup: Array<readonly [TermId, TermId]> = [];
    const twin = (e: Expr): Expr => {
      const { copy, pairs } = freshCopy(m, e);
      dup.push(...pairs);
      return copy;
    };
    // $(a+b)^3 = a^3 + 3a^2b + 3ab^2 + b^3$.
    return {
      after: add(m, [
        pow(m, a, 3),
        mul(m, [int(m, 3), pow(m, twin(a), 2), twin(b)]),
        mul(m, [int(m, 3), twin(a), pow(m, twin(b), 2)]),
        pow(m, b, 3),
      ]),
      dup,
    };
  },
};

/** $a^2 - b^2 = (a-b)(a+b)$ — hằng đẳng thức được dùng nhiều nhất khi phân tích. */
const factorDiffSquares: Rule = {
  id: 'factor_diff_squares',
  label: 'hiệu hai bình phương',
  run(m, node) {
    if (node.k !== 'add' || node.args.length !== 2) return no('cần một tổng hai hạng tử');
    const [x, y] = node.args as [Expr, Expr];
    const root2 = (e: Expr): Expr | null => {
      if (e.k === 'pow' && e.exp === 2) return e.base;
      if (e.k === 'int' && e.v > 0) {
        const r = Math.round(Math.sqrt(e.v));
        return r * r === e.v ? int(m, r) : null;
      }
      return null;
    };
    const neg = (e: Expr): Expr | null => {
      if (e.k === 'int' && e.v < 0) return int(m, -e.v);
      if (e.k !== 'mul') return null;
      const head = e.args[0];
      if (head === undefined || head.k !== 'int' || head.v !== -1) return null;
      const tail = e.args.slice(1);
      return tail.length === 1 ? (tail[0] as Expr) : mul(m, tail);
    };

    const negY = neg(y);
    if (negY === null) return no('hạng tử thứ hai phải mang dấu trừ');
    const a = root2(x);
    const b = root2(negY);
    if (a === null || b === null) return no('hai hạng tử phải là bình phương đúng');

    const { copy: a2 } = freshCopy(m, a);
    const { copy: b2 } = freshCopy(m, b);
    return { after: mul(m, [add(m, [a, negate(m, b)]), add(m, [a2, b2])]) };
  },
};

/** $a^3 \pm b^3 = (a \pm b)(a^2 \mp ab + b^2)$. */
const factorCubes: Rule = {
  id: 'factor_cubes',
  label: 'tổng/hiệu hai lập phương',
  run(m, node) {
    if (node.k !== 'add' || node.args.length !== 2) return no('cần một tổng hai hạng tử');
    const cube = (e: Expr): { base: Expr; sign: 1 | -1 } | null => {
      if (e.k === 'pow' && e.exp === 3) return { base: e.base, sign: 1 };
      if (e.k === 'int') {
        const r = Math.round(Math.cbrt(Math.abs(e.v)));
        if (r * r * r !== Math.abs(e.v)) return null;
        return { base: int(m, r), sign: e.v < 0 ? -1 : 1 };
      }
      if (e.k === 'mul' && e.args.length === 2) {
        const head = e.args[0] as Expr;
        const tail = e.args[1] as Expr;
        if (head.k === 'int' && head.v === -1 && tail.k === 'pow' && tail.exp === 3) {
          return { base: tail.base, sign: -1 };
        }
      }
      return null;
    };

    const x = cube(node.args[0] as Expr);
    const y = cube(node.args[1] as Expr);
    if (x === null || y === null) return no('hai hạng tử phải là lập phương đúng');
    if (x.sign !== 1) return no('hạng tử đầu phải dương');

    const a = x.base;
    const b = y.base;
    const s = y.sign; // $+$ cho tổng, $-$ cho hiệu
    const c = (e: Expr): Expr => freshCopy(m, e).copy;
    return {
      after: mul(m, [
        add(m, [a, s > 0 ? b : negate(m, b)]),
        add(m, [
          pow(m, c(a), 2),
          s > 0 ? negate(m, mul(m, [c(a), c(b)])) : mul(m, [c(a), c(b)]),
          pow(m, c(b), 2),
        ]),
      ]),
    };
  },
};

/**
 * $x^2 + bx + c = (x+p)(x+q)$ với $p+q=b$, $pq=c$ — "tách hạng tử" ở dạng gọn nhất.
 *
 * Chỉ tìm nghiệm **nguyên**: engine không hứa phân tích được mọi tam thức, và một
 * kết quả chứa căn ở đây thì nên đi qua công thức nghiệm chứ không qua luật này.
 */
const factorQuadratic: Rule = {
  id: 'factor_quadratic',
  label: 'phân tích tam thức',
  run(m, node) {
    if (node.k !== 'add') return no('cần một tổng');
    let variableName: string | null = null;
    let A = 0;
    let B = 0;
    let C = 0;

    for (const t of node.args) {
      const { coef, rest } = splitCoefficient(m, t);
      if (rest === null) {
        C += coef;
        continue;
      }
      if (rest.k === 'var') {
        variableName ??= rest.name;
        if (rest.name !== variableName) return no('có nhiều hơn một biến');
        B += coef;
        continue;
      }
      if (rest.k === 'pow' && rest.exp === 2 && rest.base.k === 'var') {
        variableName ??= rest.base.name;
        if (rest.base.name !== variableName) return no('có nhiều hơn một biến');
        A += coef;
        continue;
      }
      return no('không phải tam thức bậc hai một biến');
    }

    if (A !== 1) return no('mới phân tích được tam thức có hệ số dẫn đầu bằng 1');
    if (variableName === null) return no('không có biến nào');

    for (let p = -Math.abs(C) - Math.abs(B) - 1; p <= Math.abs(C) + Math.abs(B) + 1; p += 1) {
      const q = B - p;
      if (p * q !== C) continue;
      if (p > q) continue; // một cặp, không hai lần
      const v = variable(m, variableName);
      const w = variable(m, variableName);
      return {
        after: mul(m, [
          add(m, [v, int(m, p)]),
          add(m, [w, int(m, q)]),
        ]),
      };
    }
    return no('không có cặp số nguyên nào thoả');
  },
};

/**
 * Gộp các thừa số **số** của một tích: $(-3)\cdot x\cdot(-1) \to 3x$.
 *
 * Thiếu nó thì chuỗi giải bất phương trình dừng lại ở một dòng đúng nhưng chưa gọn,
 * và `eval_int` không giúp được vì tích còn chứa biến.
 */
const foldCoefficients: Rule = {
  id: 'fold_coefficients',
  label: 'gộp hệ số',
  run(m, node) {
    if (node.k !== 'mul') return no('cần một tích');
    const numeric = node.args.filter((a) => a.k === 'int' || a.k === 'rat');
    if (numeric.length < 2) return no('không có hai thừa số số nào để gộp');

    const v = exactValue(mul(m, numeric));
    if (v === null) return no('không tính được');
    const rest = node.args.filter((a) => a.k !== 'int' && a.k !== 'rat');
    const coef = rat(m, v.p, v.q);
    const merged: Array<readonly [readonly TermId[], TermId]> = [
      [numeric.map((a) => a.id), coef.id],
    ];
    if (rest.length === 0) return { after: coef, merged };
    const isOne = coef.k === 'int' && coef.v === 1;
    return { after: isOne ? mul(m, rest) : mul(m, [coef, ...rest]), merged };
  },
};

/**
 * $(a+b)(a-b) = a^2 - b^2$ — chiều **khai triển** của hiệu hai bình phương.
 *
 * Có riêng chứ không bắt người học `distribute` hai lần rồi `collect_like`: đây là
 * *lý do* người ta nhân liên hợp, nên nó phải là một bước có tên, đọc ra được ý đồ.
 */
const expandDiffSquares: Rule = {
  id: 'expand_diff_squares',
  label: 'nhân liên hợp',
  run(m, node) {
    if (node.k !== 'mul' || node.args.length !== 2) return no('cần tích hai nhân tử');
    const [p, q] = node.args as [Expr, Expr];
    if (p.k !== 'add' || q.k !== 'add' || p.args.length !== 2 || q.args.length !== 2) {
      return no('hai nhân tử phải là nhị thức');
    }
    const [a1, b1] = p.args as [Expr, Expr];
    const [a2, b2] = q.args as [Expr, Expr];
    if (!same(a1, a2)) return no('hạng tử đầu của hai nhân tử phải giống nhau');

    // Hạng tử thứ hai phải đối nhau. So bằng cấu trúc sau khi cùng đổi dấu một bên.
    const opposite = same(negate(m, b1), b2) || same(b1, negate(m, b2));
    if (!opposite) return no('hạng tử thứ hai của hai nhân tử phải đối nhau');

    const positive = b1.k === 'mul' || (b1.k === 'int' && b1.v < 0) ? b2 : b1;
    return {
      after: add(m, [pow(m, a1, 2), negate(m, pow(m, positive, 2))]),
      merged: [[[p.id, q.id], a1.id]],
    };
  },
};

/**
 * Trục căn thức ở mẫu **bằng nhân liên hợp**: $\dfrac{c}{a+\sqrt b}$ nhân cả tử lẫn
 * mẫu với $a-\sqrt b$.
 *
 * `rationalize` chỉ xử được mẫu là một dấu căn trần. Mẫu là **tổng** thì nhân với
 * chính nó không giúp gì — phải nhân với liên hợp, và đó là chỗ hiệu hai bình phương
 * làm việc: căn bị bình phương nên biến mất.
 */
const multiplyByConjugate: Rule = {
  id: 'multiply_by_conjugate',
  label: 'nhân liên hợp tử và mẫu',
  run(m, node) {
    if (node.k !== 'div') return no('cần một phân số');
    const den = node.den;
    if (den.k !== 'add' || den.args.length !== 2) return no('mẫu phải là tổng hai hạng tử');
    if (!needsRealEval(den)) return no('mẫu không chứa căn — không cần liên hợp');

    const [a, b] = den.args as [Expr, Expr];
    const conj = (): Expr => {
      const { copy: ca } = freshCopy(m, a);
      const { copy: cb } = freshCopy(m, b);
      return add(m, [ca, negate(m, cb)]);
    };
    const c1 = conj();
    const c2 = conj();

    // Liên hợp bằng $0$ thì phép nhân này mất nghiệm — cùng họ AL-08. Hằng số thì
    // máy kiểm ngay; còn biến thì ghi điều kiện ra hình.
    const condition = definitelyNonZero(c1) ? undefined : conditionText('liên hợp');
    return { after: div(m, mul(m, [node.num, c1]), mul(m, [den, c2])), condition };
  },
};

/**
 * Khử căn lồng: $\sqrt{a \pm 2\sqrt b} = \sqrt c \pm \sqrt d$ với $c+d=a$, $cd=b$.
 *
 * Cách làm ở trường: nhận ra biểu thức dưới căn **là một bình phương**. Ở đây engine
 * đi tìm cặp $(c,d)$ nguyên, và chỉ nhận khi tìm được — nó không hứa khử được mọi căn
 * lồng, vì phần lớn căn lồng **không** khử được bằng căn bậc hai.
 *
 * Dấu trừ đòi $c \ge d$: vế trái là một căn bậc hai nên luôn không âm, mà
 * $\sqrt c - \sqrt d$ âm khi $c < d$ — đổi chỗ là ra đúng.
 */
const denestRadical: Rule = {
  id: 'denest_radical',
  label: 'khử căn lồng',
  run(m, node) {
    if (node.k !== 'root' || node.index !== 2) return no('cần một căn bậc hai');
    const inner = node.arg;
    if (inner.k !== 'add' || inner.args.length !== 2) return no('dưới căn phải là tổng hai hạng tử');

    let a: number | null = null;
    let k = 1;
    let b: number | null = null;
    for (const t of inner.args) {
      if (t.k === 'int') {
        a = t.v;
        continue;
      }
      const { coef, rest } = splitCoefficient(m, t);
      if (rest !== null && rest.k === 'root' && rest.index === 2 && rest.arg.k === 'int') {
        k = coef;
        b = rest.arg.v;
      }
    }
    if (a === null || b === null) return no('dưới căn phải có dạng a ± k·√b');

    // $k\sqrt b = 2\sqrt{k^2 b/4}$ — đưa về hệ số $2$ chuẩn của công thức.
    const scaled = (k * k * b) / 4;
    if (!Number.isInteger(scaled)) return no('không đưa được về dạng a ± 2√b');
    const negative = k < 0;

    for (let c = 0; c <= a; c += 1) {
      const d = a - c;
      if (c * d !== scaled) continue;
      if (negative && c < d) continue;
      const rc = root(m, 2, int(m, c));
      const rd = root(m, 2, int(m, d));
      return { after: add(m, [rc, negative ? negate(m, rd) : rd]) };
    }
    return no('không tách được thành hai căn nguyên — căn lồng này không khử được');
  },
};

const powAdd: Rule = {
  id: 'pow_add',
  label: 'cộng số mũ',
  run(m, node) {
    if (node.k !== 'mul') return no('cần một tích');
    const asPow = (e: Expr): { base: Expr; exp: number } =>
      e.k === 'pow' ? { base: e.base, exp: e.exp } : { base: e, exp: 1 };

    const args = [...node.args];
    for (let i = 0; i < args.length; i += 1) {
      for (let j = i + 1; j < args.length; j += 1) {
        const a = asPow(args[i] as Expr);
        const b = asPow(args[j] as Expr);
        if (!same(a.base, b.base) || a.base.k === 'int' || a.base.k === 'rat') continue;
        const rest = args.filter((_, k) => k !== i && k !== j);
        const joined = pow(m, a.base, a.exp + b.exp);
        return {
          after: rest.length === 0 ? joined : mul(m, [...rest.slice(0, i), joined, ...rest.slice(i)]),
          merged: [[[(args[i] as Expr).id, (args[j] as Expr).id], joined.id]],
        };
      }
    }
    return no('không có hai thừa số nào cùng cơ số');
  },
};

const powMul: Rule = {
  id: 'pow_mul',
  label: 'nhân số mũ',
  run(m, node) {
    if (node.k !== 'pow' || node.base.k !== 'pow') return no('cần luỹ thừa của luỹ thừa');
    return { after: pow(m, node.base.base, node.base.exp * node.exp) };
  },
};

const cancelCommon: Rule = {
  id: 'cancel_common',
  label: 'rút gọn',
  needsArg: true,
  run(m, node, arg) {
    if (node.k !== 'div') return no('rút gọn cần một phân số');
    if (arg === undefined) return no('cần nói rút gọn thừa số nào');

    const common = parse(arg, m);
    const num = divideOut(m, node.num, common);
    const den = divideOut(m, node.den, common);
    if (num === null || den === null) return no(`"${arg}" không phải thừa số chung của tử và mẫu`);

    // Rút gọn bởi thứ **có thể bằng 0** là chỗ mất nghiệm. Cùng họ với AL-08.
    const condition = definitelyNonZero(common) ? undefined : conditionText(arg);
    const after = same(den, int(m, 1)) ? num : div(m, num, den);
    return { after, condition };
  },
};

const splitFraction: Rule = {
  id: 'split_fraction',
  label: 'tách phân số',
  run(m, node) {
    if (node.k !== 'div') return no('cần một phân số');
    if (node.num.k !== 'add') return no('tử phải là một tổng');
    const dup: Array<readonly [TermId, TermId]> = [];
    const parts = node.num.args.map((t, i) => {
      if (i === 0) return div(m, t, node.den);
      const { copy, pairs } = freshCopy(m, node.den);
      dup.push(...pairs);
      return div(m, t, copy);
    });
    return { after: add(m, parts), dup };
  },
};

/* ---------- nhóm ★: định nghĩa trên nút `rel` ---------- */

const addBothSides: Rule = {
  id: 'add_both_sides',
  label: 'cộng vào hai vế',
  onRelation: true,
  needsArg: true,
  run(m, node, arg) {
    if (node.k !== 'rel') return no('cần một đẳng thức hoặc bất đẳng thức');
    if (arg === undefined) return no('cần nói cộng thêm gì');
    const term = parse(arg, m);
    const { copy } = freshCopy(m, term);
    return { after: { ...node, lhs: add(m, [node.lhs, term]), rhs: add(m, [node.rhs, copy]) } };
  },
};

const mulBothSides: Rule = {
  id: 'mul_both_sides',
  label: 'nhân hai vế',
  onRelation: true,
  needsArg: true,
  run(m, node, arg) {
    if (node.k !== 'rel') return no('cần một đẳng thức hoặc bất đẳng thức');
    if (arg === undefined) return no('cần nói nhân với gì');
    const term = parse(arg, m);
    const sign = definiteSign(term);

    // **Bất đẳng thức nhân số âm thì ĐỔI CHIỀU.** Bản đầu quên, nên engine cho ra
    // $x < 3 \Rightarrow -x < -3$ — sai trắng trợn, và không gì kêu vì bộ kiểm bỏ qua
    // nút `rel`. Dấu **chưa biết** thì từ chối: ở trường người ta tách trường hợp, và
    // một điều kiện "$y > 0$" ở đây sẽ giấu mất đúng cái phải tách.
    const isEquation = node.op === '=' || node.op === '!=';
    if (!isEquation) {
      if (sign === 0) {
        return no(`chưa biết dấu của "${arg}" — bất đẳng thức phải tách trường hợp trước`);
      }
      const { copy } = freshCopy(m, term);
      return {
        after: {
          ...node,
          op: sign < 0 ? flipOp(node.op) : node.op,
          lhs: mul(m, [node.lhs, term]),
          rhs: mul(m, [node.rhs, copy]),
        },
      };
    }

    // **AL-08 — cái bẫy nổi tiếng nhất của đại số phổ thông.** Nhân hai vế với thứ
    // có thể bằng 0 không bảo toàn tập nghiệm; đó là đường đi của mọi "chứng minh
    // 1 = 2". Engine không chặn — nó **ghi điều kiện ra**, vì bước ấy vẫn hợp lệ khi
    // điều kiện đúng, và vì chỗ này chính là nội dung đáng dạy.
    const condition = definitelyNonZero(term) ? undefined : conditionText(arg);
    const { copy } = freshCopy(m, term);
    return {
      after: { ...node, lhs: mul(m, [node.lhs, term]), rhs: mul(m, [node.rhs, copy]) },
      condition,
    };
  },
};

const substitute: Rule = {
  id: 'substitute',
  label: 'thế biến',
  needsArg: true,
  run(m, node, arg) {
    const parts = (arg ?? '').split(':=');
    if (parts.length !== 2) return no('cần tham số dạng "x := 2*y"');
    const name = (parts[0] as string).trim();
    const value = parse((parts[1] as string).trim(), m);

    let found = false;
    const dup: Array<readonly [TermId, TermId]> = [];
    let first = true;
    const go = (e: Expr): Expr => {
      if (e.k === 'var' && e.name === name) {
        found = true;
        if (first) {
          first = false;
          return value;
        }
        const { copy, pairs } = freshCopy(m, value);
        dup.push(...pairs);
        return copy;
      }
      switch (e.k) {
        case 'add':
        case 'mul':
          return { ...e, args: e.args.map(go) };
        case 'pow':
          return { ...e, base: go(e.base) };
        case 'div':
          return { ...e, num: go(e.num), den: go(e.den) };
        case 'rel':
          return { ...e, lhs: go(e.lhs), rhs: go(e.rhs) };
        default:
          return e;
      }
    };

    const after = go(node);
    if (!found) return no(`không thấy biến "${name}" trong cây con này`);
    return { after, dup };
  },
};

export const RULES: readonly Rule[] = [
  commute,
  distribute,
  factor,
  collectLike,
  evalInt,
  expandSquare,
  dropUnit,
  foldCoefficients,
  expandCube,
  factorDiffSquares,
  factorCubes,
  factorQuadratic,
  evalRoot,
  pullSquareOut,
  expandDiffSquares,
  multiplyByConjugate,
  denestRadical,
  rootOfProduct,
  rootPow,
  rationalize,
  powAdd,
  powMul,
  cancelCommon,
  splitFraction,
  addBothSides,
  mulBothSides,
  substitute,
];

export const ruleById = (id: string): Rule | null => RULES.find((r) => r.id === id) ?? null;

/** Luật nào áp được tại nút này — chính là bảng nước đi hợp lệ của sandbox (AL-07). */
export function applicableRules(node: Expr): readonly Rule[] {
  const probe = new Minter();
  return RULES.filter((r) => {
    if (r.onRelation && node.k !== 'rel') return false;
    // Luật cần tham số thì không thử được ở đây — bày ra để người học nhập.
    if (r.needsArg) return r.onRelation ? node.k === 'rel' : couldTakeArg(r, node);
    return !('refusal' in r.run(probe, node, undefined));
  });
}

function couldTakeArg(r: Rule, node: Expr): boolean {
  if (r.id === 'commute') return node.k === 'add' || node.k === 'mul';
  if (r.id === 'factor') return node.k === 'add';
  if (r.id === 'cancel_common') return node.k === 'div';
  if (r.id === 'substitute') {
    let has = false;
    walk(node, (n) => {
      if (n.k === 'var') has = true;
    });
    return has;
  }
  return true;
}

/** Chỉ để test đọc được: dựng một biến nhanh. */
export const v = (m: Minter, name: string): Expr => variable(m, name);
