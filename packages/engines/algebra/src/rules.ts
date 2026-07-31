import {
  definiteSign,
  definitelyNonNegative,
  definitelyNonZero,
  type Guard,
} from './check.js';
import { intExp, needsRealEval } from './expr.js';
import {
  Minter,
  abs,
  add,
  div,
  int,
  children,
  mul,
  negate,
  pow,
  flipOp,
  rat,
  rel,
  root,
  same,
  variable,
  varsOf,
  walk,
  withChildren,
  type Expr,
  type TermId,
} from './expr.js';
import { parse, toPlain, unparse } from './parse.js';

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
  /** Điều kiện kèm theo (AL-08), ví dụ `"x − 1 ≠ 0"` — **chữ để in ra hình**. */
  readonly condition?: string;
  /**
   * Cùng điều kiện ấy, nhưng **máy đọc được**: bộ kiểm bỏ những điểm vi phạm nó.
   *
   * Trước M50, `model` dựng thứ này bằng cách parse lại `step.arg` — đúng tình cờ cho
   * `mul_both_sides` (arg *là* thừa số) và sai với mọi luật khác. Luật phải tự khai,
   * vì chỉ nó biết điều kiện là gì: `abs_case` cần "$A \ge 0$", thứ không đọc ra được
   * từ chuỗi tác giả gõ.
   */
  readonly guard?: Guard;
  /**
   * Biến phụ vừa đặt: `after` chỉ đúng **dưới ràng buộc** này.
   *
   * `model` kiểm bằng cách thế ngược lại rồi so — không có nó thì phép kiểm thấy hai
   * biểu thức khác biến và kết tội oan.
   */
  readonly binding?: { readonly name: string; readonly expr: Expr };
  /**
   * Hợp đồng kiểm của bước này, khi nó không phải "đồng nhất" hay "cùng tập nghiệm".
   *
   * `'root'`: `after` có dạng $x = r$ và điều phải kiểm là $r$ **thoả** phương trình
   * trước đó — một nhánh nghiệm thì hẹp hơn tập nghiệm gốc, nên hỏi "cùng tập
   * nghiệm" là hỏi sai.
   *
   * `'implies'`: bước **nới rộng** tập nghiệm (bình phương hai vế). Chỉ hỏi được chiều
   * "nghiệm cũ còn là nghiệm mới", và nghĩa vụ còn lại — thử lại để loại nghiệm ngoại
   * lai — engine ghi ra hình chứ không tự làm.
   *
   * `'instance'`: `after` là `before` sau khi **thế một giá trị cụ thể** vào một ẩn.
   * Không phải chuyện tập nghiệm mà là chuyện "có thế đúng không", nên kiểm bằng cấu
   * trúc. Đây cũng là đường trả nợ cho `'implies'`.
   */
  readonly verify?: 'root' | 'implies' | 'instance';
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
        return { ...n, id, base: go(n.base), exp: go(n.exp) };
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
      // Chỉ số mũ **nguyên** mới cho ra giá trị hữu tỉ chính xác. $2^{1/2}$ là số vô
      // tỉ, và cả hàm này nói về "giá trị đúng dạng $p/q$" — nên nó trả `null`.
      const k = intExp(e);
      if (k === null) return null;
      const b = exactValue(e.base);
      if (b === null) return null;
      const n = Math.abs(k);
      const p = Math.pow(b.p, n);
      const q = Math.pow(b.q, n);
      if (!Number.isSafeInteger(p) || !Number.isSafeInteger(q)) return null;
      return k > 0 ? { p, q } : { p: q, q: p };
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
    if (node.k !== 'pow' || intExp(node) !== 2) return no('cần một luỹ thừa bậc 2');
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
      const fe = f.k === 'pow' ? intExp(f) : null;
      if (f.k === 'pow' && fe !== null && fe > 0 && fe % n === 0) {
        outside.push(pow(m, f.base, fe / n));
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
    if (intExp(node) !== node.base.index) return no('số mũ phải bằng chỉ số căn');
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
    if (node.k !== 'pow' || intExp(node) !== 3) return no('cần một luỹ thừa bậc 3');
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
      if (e.k === 'pow' && intExp(e) === 2) return e.base;
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
      if (e.k === 'pow' && intExp(e) === 3) return { base: e.base, sign: 1 };
      if (e.k === 'int') {
        const r = Math.round(Math.cbrt(Math.abs(e.v)));
        if (r * r * r !== Math.abs(e.v)) return null;
        return { base: int(m, r), sign: e.v < 0 ? -1 : 1 };
      }
      if (e.k === 'mul' && e.args.length === 2) {
        const head = e.args[0] as Expr;
        const tail = e.args[1] as Expr;
        if (head.k === 'int' && head.v === -1 && tail.k === 'pow' && intExp(tail) === 3) {
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
      if (rest.k === 'pow' && intExp(rest) === 2 && rest.base.k === 'var') {
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

/* ---------- nhân đa thức, đặt ẩn phụ, công thức nghiệm ---------- */

/** Khoá gom hạng tử: tích các luỹ thừa đã sắp, để $2xy$ và $2yx$ vào cùng một nhóm. */
function monomialKey(factors: ReadonlyMap<string, number>): string {
  return [...factors.entries()]
    .filter(([, e]) => e !== 0)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([b, e]) => `${b}^${e}`)
    .join('*');
}

/** Khai triển thành danh sách (hệ số, các luỹ thừa) — dạng chuẩn của đa thức. */
function flatten(e: Expr): Array<{ coef: number; powers: Map<string, number>; bases: Map<string, Expr> }> | null {
  const unit = () => [{ coef: 1, powers: new Map<string, number>(), bases: new Map<string, Expr>() }];
  switch (e.k) {
    case 'int':
      return [{ coef: e.v, powers: new Map(), bases: new Map() }];
    case 'add': {
      const out: ReturnType<typeof flatten> = [];
      for (const a of e.args) {
        const part = flatten(a);
        if (part === null) return null;
        out!.push(...part);
      }
      return out;
    }
    case 'mul': {
      let acc = unit();
      for (const a of e.args) {
        const part = flatten(a);
        if (part === null) return null;
        const next: ReturnType<typeof flatten> = [];
        for (const x of acc) {
          for (const y of part) {
            const powers = new Map(x.powers);
            const bases = new Map(x.bases);
            for (const [k, v] of y.powers) powers.set(k, (powers.get(k) ?? 0) + v);
            for (const [k, v] of y.bases) bases.set(k, v);
            next!.push({ coef: x.coef * y.coef, powers, bases });
          }
        }
        acc = next as never;
      }
      return acc;
    }
    case 'pow': {
      // Chỉ số mũ nguyên không âm mới khai triển được thành đa thức. $x^{1/2}$ và
      // $x^n$ không phải đơn thức, nên chúng ra khỏi cửa này chứ không được coi là
      // một "biến lạ" — coi thế thì $x^{1/2} \cdot x^{1/2}$ thu gọn thành $x^{1}$ theo
      // đúng luật đa thức, và ăn may đúng, nhưng $x^n \cdot x^{n}$ thì không.
      const k = intExp(e);
      if (k === null || k < 0) return null;
      const base = flatten(e.base);
      if (base === null) return null;
      let acc = unit();
      for (let i = 0; i < k; i += 1) {
        const next: ReturnType<typeof flatten> = [];
        for (const x of acc) {
          for (const y of base) {
            const powers = new Map(x.powers);
            const bases = new Map(x.bases);
            for (const [k, v] of y.powers) powers.set(k, (powers.get(k) ?? 0) + v);
            for (const [k, v] of y.bases) bases.set(k, v);
            next!.push({ coef: x.coef * y.coef, powers, bases });
          }
        }
        acc = next as never;
      }
      return acc;
    }
    case 'var':
    case 'root':
    case 'abs': {
      const key = unparseKey(e);
      return [{ coef: 1, powers: new Map([[key, 1]]), bases: new Map([[key, e]]) }];
    }
    default:
      return null;
  }
}

function unparseKey(e: Expr): string {
  if (e.k === 'var') return e.name;
  if (e.k === 'root') return `root${e.index}(${unparseKey(e.arg)})`;
  if (e.k === 'abs') return `abs(${unparseKey(e.arg)})`;
  return `?${e.id}`;
}

/**
 * Nhân đa thức và thu gọn — **một** bước.
 *
 * Không có nó thì $(x+1)(x+4)$ tốn sáu bước vi mô: `distribute` ba lần, `drop_unit`,
 * `pow_add`, rồi `collect_like`. Học sinh viết đúng một dòng, và một chuỗi sáu dòng
 * cho một phép nhân làm chìm mất bước thật sự đáng nhìn của bài. Trần 12 bước cũng
 * không đủ cho bài nào có hai phép nhân.
 */
const multiplyOut: Rule = {
  id: 'multiply_out',
  label: 'nhân ra và thu gọn',
  run(m, node, arg) {
    if (node.k !== 'mul' && node.k !== 'pow') return no('cần một tích hoặc một luỹ thừa');
    if (node.k === 'mul' && !node.args.some((a) => a.k === 'add')) {
      return no('không có thừa số nào là tổng');
    }
    if (node.k === 'pow' && (node.base.k !== 'add' || (intExp(node) ?? 0) < 2)) {
      return no('cần luỹ thừa bậc ≥ 2 của một tổng');
    }

    // `arg` chọn **thừa số nào** được nhân với nhau; thiếu nó thì nhân hết.
    //
    // Cần vì `mul` làm phẳng: $(x+1)(x+2)(x+3)(x+4)$ là **một** tích bốn thừa số,
    // không phải hai tích lồng nhau, nên không có cách nào nhóm cặp bằng cấu trúc.
    // Mà nhóm cặp lại chính là mẹo của cả họ bài này — nhân hết ra bậc bốn là mất mẹo.
    if (arg !== undefined && node.k === 'mul') {
      const picked = arg.split(',').map((x) => Number(x.trim()));
      if (picked.some((i) => !Number.isInteger(i) || node.args[i] === undefined)) {
        return no(`chỉ số ngoài khoảng 0..${node.args.length - 1}`);
      }
      if (picked.length < 2) return no('cần ít nhất hai thừa số');
      const chosen = picked.map((i) => node.args[i] as Expr);
      const inner = multiplyOut.run(m, mul(m, chosen), undefined);
      if ('refusal' in inner) return inner;
      const rest = node.args.filter((_, i) => !picked.includes(i));
      const at = Math.min(...picked);
      return {
        after: mul(m, [...rest.slice(0, at), inner.after, ...rest.slice(at)]),
      };
    }

    const parts = flatten(node);
    if (parts === null) return no('có phần không khai triển được (phân số, số mũ âm)');

    const groups = new Map<string, { coef: number; powers: Map<string, number>; bases: Map<string, Expr> }>();
    for (const p of parts) {
      const key = monomialKey(p.powers);
      const g = groups.get(key);
      if (g) g.coef += p.coef;
      else groups.set(key, { ...p, powers: new Map(p.powers), bases: new Map(p.bases) });
    }

    const degree = (g: { powers: Map<string, number> }): number =>
      [...g.powers.values()].reduce((s, v) => s + v, 0);
    const live = [...groups.values()].filter((g) => g.coef !== 0).sort((a, b) => degree(b) - degree(a));
    if (live.length === 0) return { after: int(m, 0) };

    const terms = live.map((g) => {
      const factors: Expr[] = [];
      for (const [k, e] of [...g.powers.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
        if (e === 0) continue;
        factors.push(pow(m, g.bases.get(k) as Expr, e));
      }
      return withCoefficient(m, g.coef, factors.length === 0 ? null : mul(m, factors));
    });
    return { after: add(m, terms) };
  },
};

/**
 * Đặt ẩn phụ: thay **mọi** chỗ xuất hiện của một biểu thức bằng một biến mới.
 *
 * Ngược chiều `substitute`, và là mấu chốt của cả một họ bài — $(x+1)(x+2)(x+3)(x+4)-8=0$
 * giải được là nhờ nó. Phép kiểm phải biết ràng buộc, nếu không nó thấy hai biểu thức
 * khác biến rồi kết tội oan; `binding` mang thông tin ấy cho `model`.
 */
const setVariable: Rule = {
  id: 'set_variable',
  label: 'đặt ẩn phụ',
  needsArg: true,
  run(m, node, arg) {
    const parts = (arg ?? '').split(':=');
    if (parts.length !== 2) return no('cần tham số dạng "t := x^2 + 5*x"');
    const name = (parts[0] as string).trim();
    if (!/^[a-zA-Z](_[0-9])?$/.test(name)) return no('tên biến phải là một chữ cái');
    const defn = parse((parts[1] as string).trim(), m);

    let hits = 0;
    const go = (e: Expr): Expr => {
      if (same(e, defn)) {
        hits += 1;
        return variable(m, name);
      }
      // Khớp **một phần** trong một tổng: $x^2+5x$ nằm trong $x^2+5x+4$ mà không phải
      // một nút, vì `add` làm phẳng. Người ta vẫn đặt được ẩn phụ ở đó — và đây là
      // cách duy nhất họ đặt, nên khớp cả cây thì luật này gần như vô dụng.
      if (e.k === 'add' && defn.k === 'add' && defn.args.length < e.args.length) {
        const rest = [...e.args];
        const taken: number[] = [];
        for (const want of defn.args) {
          const at = rest.findIndex((r, i) => !taken.includes(i) && same(r, want));
          if (at === -1) {
            taken.length = 0;
            break;
          }
          taken.push(at);
        }
        if (taken.length === defn.args.length) {
          hits += 1;
          const left = e.args.filter((_, i) => !taken.includes(i)).map(go);
          return add(m, [variable(m, name), ...left]);
        }
      }
      const kids = children(e).map(go);
      return kids.length === 0 ? e : withChildren(e, kids);
    };
    const after = go(node);
    if (hits === 0) return no(`không thấy "${parts[1]}" ở đâu trong cây con này`);
    return { after, binding: { name, expr: defn } };
  },
};

/**
 * Công thức nghiệm bậc hai — **một nhánh mỗi lần**, chọn bằng `arg` là `"+"` hoặc `"-"`.
 *
 * Không dựng nút "hoặc": một phương trình bậc hai có hai nghiệm, và chỗ đúng để tách
 * hai nghiệm là **cây lời giải** (`edge_type: "case"`), vốn đã có sẵn và vốn sinh ra
 * để làm đúng việc ấy. Thêm một nút "hoặc" vào cây biểu thức là dựng lại cùng khái
 * niệm ở tầng thứ hai.
 *
 * Biệt thức âm thì **từ chối** — và lời từ chối ấy chính là nội dung đáng dạy.
 */
const quadraticFormula: Rule = {
  id: 'quadratic_formula',
  label: 'công thức nghiệm',
  needsArg: true,
  onRelation: true,
  run(m, node, arg) {
    if (node.k !== 'rel' || node.op !== '=') return no('cần một phương trình');
    const sign = (arg ?? '+').trim();
    if (sign !== '+' && sign !== '-') return no('cần tham số "+" hoặc "-"');

    const zeroSide = (e: Expr): boolean => e.k === 'int' && e.v === 0;
    const poly = zeroSide(node.rhs) ? node.lhs : zeroSide(node.lhs) ? node.rhs : null;
    if (poly === null) return no('một vế phải bằng 0 — chuyển vế trước đã');

    const parts = flatten(poly);
    if (parts === null) return no('vế này không phải đa thức');
    let name: string | null = null;
    const coefs = new Map<number, number>();
    for (const p of parts) {
      const live = [...p.powers.entries()].filter(([, e]) => e !== 0);
      if (live.length > 1) return no('không phải đa thức một biến');
      if (live.length === 0) {
        coefs.set(0, (coefs.get(0) ?? 0) + p.coef);
        continue;
      }
      const [key, deg] = live[0] as [string, number];
      const base = p.bases.get(key) as Expr;
      if (base.k !== 'var') return no('ẩn phải là một biến');
      name ??= base.name;
      if (base.name !== name) return no('không phải đa thức một biến');
      coefs.set(deg, (coefs.get(deg) ?? 0) + p.coef);
    }
    if (name === null) return no('không có ẩn nào');
    const top = Math.max(...coefs.keys());
    if (top !== 2) return no(`đa thức bậc ${top}, không phải bậc hai`);

    const a = coefs.get(2) ?? 0;
    const b = coefs.get(1) ?? 0;
    const c = coefs.get(0) ?? 0;
    const delta = b * b - 4 * a * c;
    if (delta < 0) return no(`biệt thức bằng ${delta} < 0 — phương trình vô nghiệm thực`);

    const rootPart = root(m, 2, int(m, delta));
    const numerator = add(m, [int(m, -b), sign === '+' ? rootPart : negate(m, rootPart)]);
    return {
      after: rel(m, '=', variable(m, name), div(m, numerator, int(m, 2 * a))),
      verify: 'root',
    };
  },
};

/**
 * Cộng/nhân hai số mũ.
 *
 * Hai số nguyên thì **gộp thành một số** — $x^2x^3$ phải ra $x^5$, không ra $x^{2+3}$,
 * và đó là hành vi mọi bài đang có trong kho trông chờ. Ngoài ra thì dựng cây, và nhờ
 * thế $x^ax^b = x^{a+b}$ chạy **ký hiệu** mà không cần một luật riêng nào.
 */
const addExp = (m: Minter, a: Expr, b: Expr): Expr =>
  a.k === 'int' && b.k === 'int' ? int(m, a.v + b.v) : add(m, [a, b]);
const mulExp = (m: Minter, a: Expr, b: Expr): Expr =>
  a.k === 'int' && b.k === 'int' ? int(m, a.v * b.v) : mul(m, [a, b]);

const powAdd: Rule = {
  id: 'pow_add',
  label: 'cộng số mũ',
  run(m, node) {
    if (node.k !== 'mul') return no('cần một tích');
    const asPow = (e: Expr): { base: Expr; exp: Expr } =>
      e.k === 'pow' ? { base: e.base, exp: e.exp } : { base: e, exp: int(m, 1) };

    const args = [...node.args];
    for (let i = 0; i < args.length; i += 1) {
      for (let j = i + 1; j < args.length; j += 1) {
        const a = asPow(args[i] as Expr);
        const b = asPow(args[j] as Expr);
        if (!same(a.base, b.base) || a.base.k === 'int' || a.base.k === 'rat') continue;
        const rest = args.filter((_, k) => k !== i && k !== j);
        const joined = pow(m, a.base, addExp(m, a.exp, b.exp));
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
    // $(x^a)^b = x^{ab}$ đúng ở mọi chỗ **cả hai vế cùng xác định** — trừ đúng một hình
    // dạng: số mũ trong **chẵn**, số mũ ngoài không nguyên. Ở đó luỹ thừa chẵn giấu mất
    // dấu rồi số mũ không nguyên lấy nhánh chính luôn dương, nên $(x^2)^{1/2}$ ra $|x|$
    // chứ không ra $x$. Cùng cái bẫy `pull_square_out` phải viết ra `abs` mới đúng.
    const inner = intExp(node.base);
    if (
      intExp(node) === null &&
      inner !== null &&
      inner % 2 === 0 &&
      !definitelyNonNegative(node.base.base)
    ) {
      return no('cơ số có thể âm: (x²)^(1/2) là |x|, không phải x');
    }
    return { after: pow(m, node.base.base, mulExp(m, node.base.exp, node.exp)) };
  },
};

/**
 * Số mũ ở dạng $p/q$ **chính xác**, khi nó có dạng ấy. `q` luôn dương.
 *
 * Nhận cả `rat` (do luật dựng) lẫn `div` hai số nguyên (do parser dựng cho `x^(1/2)`),
 * và cả `mul[-1, …]` cho số mũ âm — ba dạng cùng một vật, vì cây không chuẩn hoá số mũ.
 */
function ratioExp(e: Expr): { p: number; q: number } | null {
  if (e.k === 'int') return { p: e.v, q: 1 };
  if (e.k === 'rat') return { p: e.p, q: e.q };
  if (e.k === 'div' && e.num.k === 'int' && e.den.k === 'int' && e.den.v !== 0) {
    const s = e.den.v < 0 ? -1 : 1;
    return { p: s * e.num.v, q: s * e.den.v };
  }
  if (e.k === 'mul' && e.args.length === 2) {
    const [h, t] = e.args as [Expr, Expr];
    if (h.k === 'int' && h.v === -1) {
      const inner = ratioExp(t);
      return inner === null ? null : { p: -inner.p, q: inner.q };
    }
  }
  return null;
}

/**
 * $\sqrt[q]{a} \to a^{1/q}$ — chính là bài "luỹ thừa với số mũ hữu tỉ" của lớp 11.
 *
 * **Chỉ số lẻ bị từ chối trừ khi cơ số chắc chắn không âm**, và đó không phải sự thận
 * trọng thừa: $\sqrt[3]{-8} = -2$ trong khi $(-8)^{1/3}$ **không xác định** trên
 * $\mathbb{R}$ (luỹ thừa thực đòi cơ số dương). Hai vế khác nhau ở đúng nửa trục âm.
 *
 * Và bộ kiểm **không bắt được** chỗ này: nơi chúng khác nhau lại đúng là nơi vế phải
 * trả `null`, tức là điểm bị bỏ qua chứ không bị kết tội. Nên chặn phải nằm ở luật.
 * Mỗi lần đặc tả nói "bộ kiểm lo được" thì phải hỏi lại nó lo bằng cách nào — đây là
 * lần thứ ba câu hỏi ấy tìm ra một lỗ (M47b, M47c, và đây).
 */
const rootToPower: Rule = {
  id: 'root_to_power',
  label: 'căn thành luỹ thừa hữu tỉ',
  run(m, node) {
    if (node.k !== 'root') return no('cần một dấu căn');
    if (node.index % 2 === 1 && !definitelyNonNegative(node.arg)) {
      return no(`căn bậc lẻ của số âm có nghĩa, còn luỹ thừa số mũ 1/${node.index} thì không`);
    }
    return { after: pow(m, node.arg, div(m, int(m, 1), int(m, node.index))) };
  },
};

/** $a^{p/q} \to \sqrt[q]{a^p}$ — chiều ngược của {@link rootToPower}, cùng một dè dặt. */
const powerToRoot: Rule = {
  id: 'power_to_root',
  label: 'luỹ thừa hữu tỉ thành căn',
  run(m, node) {
    if (node.k !== 'pow') return no('cần một luỹ thừa');
    const r = ratioExp(node.exp);
    if (r === null) return no('số mũ phải là một phân số cụ thể');
    if (r.q < 2) return no('số mũ đã là số nguyên, không có căn nào để viết');
    if (r.q % 2 === 1 && !definitelyNonNegative(node.base)) {
      return no(`căn bậc ${r.q} nhận cả cơ số âm, còn luỹ thừa số mũ hữu tỉ thì không`);
    }
    return { after: root(m, r.q, pow(m, node.base, r.p)) };
  },
};

/* ---------- lớp lõi: quy đồng, gộp, nhóm, hoàn thành bình phương ---------- */

/**
 * Tử và mẫu của một hạng tử trong tổng. Hạng tử không phải phân số là $t/1$.
 *
 * Có riêng vì cả `common_denominator` lẫn `combine_fraction` đều phải hỏi cùng câu ấy,
 * và hỏi khác nhau ở hai chỗ là cách chắc nhất để hai luật nối vào nhau không khớp.
 */
const asFraction = (m: Minter, e: Expr): { num: Expr; den: Expr } =>
  e.k === 'div' ? { num: e.num, den: e.den } : { num: e, den: int(m, 1) };

/**
 * Quy đồng một tổng các phân số.
 *
 * $\frac ab + \frac cd \to \frac{ad + cb}{bd}$, tổng quát cho $n$ hạng tử. **Miền không
 * đổi**: hai vế cùng không xác định đúng tại chỗ một mẫu triệt tiêu, nên không sinh
 * điều kiện nào — khác hẳn `cancel_common`, vốn *bỏ đi* một mẫu và vì thế phải khai.
 *
 * Mỗi mẫu xuất hiện **hai lần** trong kết quả (một trong tử mới, một trong tích mẫu),
 * nên phải nhân bản có khai `dup`; không thì một nút mang hai chỗ và hình nhấp nháy.
 */
const commonDenominator: Rule = {
  id: 'common_denominator',
  label: 'quy đồng mẫu',
  run(m, node) {
    if (node.k !== 'add') return no('quy đồng cần một tổng');
    const parts = node.args.map((a) => asFraction(m, a));
    if (parts.filter((p) => p.den.k !== 'int' || p.den.v !== 1).length < 2) {
      return no('cần ít nhất hai phân số có mẫu khác 1');
    }
    if (parts.every((p, i) => i === 0 || same(p.den, (parts[0] as { den: Expr }).den))) {
      return no('các mẫu đã giống nhau — dùng `combine_fraction`');
    }

    const dup: Array<readonly [TermId, TermId]> = [];
    const twin = (e: Expr): Expr => {
      const { copy, pairs } = freshCopy(m, e);
      dup.push(...pairs);
      return copy;
    };

    // Tử thứ $i$ nhân với **mọi** mẫu khác nó; mẫu chung là tích tất cả các mẫu. Không
    // đi tìm BCNN: bội chung nhỏ nhất của hai đa thức là một bài toán riêng, và rút gọn
    // sau đó là việc của `cancel_common` — một luật có tên, có dòng trên hình.
    const numerators = parts.map((p, i) => {
      const others = parts.filter((_, j) => j !== i).map((q) => twin(q.den));
      return others.length === 0 ? p.num : mul(m, [p.num, ...others]);
    });
    const denominator = mul(m, parts.map((p) => p.den));

    return { after: div(m, add(m, numerators), denominator), dup };
  },
};

/**
 * Gộp các phân số **cùng mẫu** thành một. Nghịch đảo của `split_fraction`.
 *
 * Chỗ hổng rõ nhất của tập luật cũ: tách phân số ra được mà gộp lại thì không, nên mọi
 * chuỗi biến đổi hữu tỉ đều đi một chiều.
 */
const combineFraction: Rule = {
  id: 'combine_fraction',
  label: 'gộp phân số cùng mẫu',
  run(m, node) {
    if (node.k !== 'add') return no('cần một tổng');
    const fracs = node.args.filter((a) => a.k === 'div') as Array<Expr & { k: 'div' }>;
    if (fracs.length < 2) return no('cần ít nhất hai phân số');

    const den = (fracs[0] as { den: Expr }).den;
    if (!fracs.every((f) => same(f.den, den))) {
      return no('các mẫu chưa giống nhau — chạy `common_denominator` trước');
    }

    const rest = node.args.filter((a) => a.k !== 'div');
    const joined = div(m, add(m, fracs.map((f) => f.num)), den);
    // Các mẫu **nhập một**: giữ lại nút mẫu của phân số đầu, không dựng nút mới. Bài
    // học M47 ở `collect_like`: dựng lại một nút đáng lẽ giữ nguyên thì id đổi vô cớ
    // và hạng tử nhấp nháy dù người đọc thấy nó đứng yên.
    const merged: Array<readonly [readonly TermId[], TermId]> = [
      [fracs.slice(1).map((f) => f.den.id), den.id],
      [fracs.map((f) => f.id), joined.id],
    ];
    return { after: rest.length === 0 ? joined : add(m, [joined, ...rest]), merged };
  },
};

/**
 * Một đơn thức tách thành hệ số và bảng **cơ số → số mũ**.
 *
 * Khoá là chuỗi `unparse` của cơ số, tức so theo **cấu trúc** chứ không theo danh tính:
 * hai nút $x$ khác id vẫn phải là cùng một cơ số. Bảng số mũ là thứ bắt buộc phải có —
 * so thừa số bằng `same` thì $x^2$ và $x$ thành hai vật khác nhau, và nhân tử chung của
 * $2x^2+2x$ ra $2$ thay vì $2x$. Mà $2x$ mới là cái làm lộ ra thừa số $(x+1)$ chung với
 * nhóm kia — tức là làm hỏng đúng việc `factor_by_grouping` sinh ra để làm.
 */
function monomial(
  m: Minter,
  e: Expr,
): { coef: number; parts: Map<string, { base: Expr; exp: number }> } | null {
  const { coef, rest } = splitCoefficient(m, e);
  const parts = new Map<string, { base: Expr; exp: number }>();
  if (rest === null) return { coef, parts };

  for (const f of rest.k === 'mul' ? rest.args : [rest]) {
    const n = f.k === 'pow' ? intExp(f) : 1;
    if (n === null || n < 1) return null;
    const base = f.k === 'pow' ? f.base : f;
    const key = unparse(base);
    const seen = parts.get(key);
    parts.set(key, { base, exp: (seen?.exp ?? 0) + n });
  }
  return { coef, parts };
}

/**
 * Nhân tử chung của một nhóm hạng tử — **tính ra**, không đi tìm.
 *
 * Ước chung của các hệ số, và với mỗi cơ số có mặt ở **mọi** hạng tử thì lấy số mũ nhỏ
 * nhất. Xác định hoàn toàn: không có lựa chọn nào để "chọn cho khéo", nên nó không phải
 * một mẩu solver lén.
 */
function commonFactorOf(m: Minter, terms: readonly Expr[]): Expr | null {
  const gcdOf = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcdOf(b, a % b));
  const monos = terms.map((t) => monomial(m, t));
  if (monos.some((x) => x === null)) return null;
  const first = monos[0] as NonNullable<(typeof monos)[number]>;

  let coef = Math.abs(first.coef);
  for (const s of monos) coef = gcdOf(coef, (s as NonNullable<typeof s>).coef);

  const factors: Expr[] = [];
  for (const [key, { base }] of first.parts) {
    let exp = Infinity;
    for (const s of monos) {
      const here = (s as NonNullable<typeof s>).parts.get(key);
      if (here === undefined) {
        exp = 0;
        break;
      }
      exp = Math.min(exp, here.exp);
    }
    if (exp > 0) factors.push(pow(m, freshCopy(m, base).copy, exp));
  }

  if (coef === 1 && factors.length === 0) return null;
  if (factors.length === 0) return int(m, coef);
  return coef === 1 ? mul(m, factors) : mul(m, [int(m, coef), ...factors]);
}

/** Chia một đơn thức cho một đơn thức; `null` khi không chia hết. */
function divideMonomial(m: Minter, term: Expr, by: Expr): Expr | null {
  const a = monomial(m, term);
  const b = monomial(m, by);
  if (a === null || b === null || b.coef === 0 || a.coef % b.coef !== 0) return null;

  const left: Expr[] = [];
  const seen = new Set<string>();
  for (const [key, { base, exp }] of a.parts) {
    seen.add(key);
    const cut = b.parts.get(key)?.exp ?? 0;
    if (cut > exp) return null;
    if (exp - cut > 0) left.push(pow(m, base, exp - cut));
  }
  // Cơ số chỉ có ở mẫu ⇒ không chia hết (engine không sinh số mũ âm lén ở đây).
  for (const key of b.parts.keys()) if (!seen.has(key)) return null;

  return withCoefficient(m, a.coef / b.coef, left.length === 0 ? null : mul(m, left));
}

/**
 * Nhóm hạng tử theo phân hoạch **tác giả chọn**, rồi đặt nhân tử chung của từng nhóm.
 *
 * `arg` là `"0,1|2,3"` — dấu phẩy ngăn chỉ số (như `commute`, `multiply_out`), dấu `|`
 * ngăn nhóm. Chọn cách nhóm nào là *mẹo của bài*, nên nó phải do tác giả khai; engine
 * chỉ tính phần còn lại.
 *
 * **Không có dòng trung gian `(ab+ac)+(bd+cd)`**, và không thể có: dạng chuẩn tắc §3.1
 * làm phẳng `add`, nên hai cách nhóm là *cùng một cây*. Bỏ bất biến ấy để vẽ được cái
 * ngoặc là mở lại lỗi M47 #8 (đường dẫn của bước sau trỏ lệch). Việc cho người đọc
 * **thấy** cách nhóm thuộc về choreography: `hold` một pha tô sáng hai nhóm trước khi
 * đổi (CHO-11, M48). Hình học của lời giải, không phải cấu trúc của cây.
 */
const factorByGrouping: Rule = {
  id: 'factor_by_grouping',
  label: 'nhóm hạng tử',
  needsArg: true,
  run(m, node, arg) {
    if (node.k !== 'add') return no('nhóm hạng tử cần một tổng');
    if (arg === undefined) return no('cần nói nhóm thế nào, ví dụ "0,1|2,3"');

    const groups = arg.split('|').map((g) => g.split(',').map((s) => Number(s.trim())));
    if (groups.length < 2) return no('cần ít nhất hai nhóm');

    const seen = new Set<number>();
    for (const g of groups) {
      if (g.length === 0) return no('có nhóm rỗng');
      for (const i of g) {
        if (!Number.isInteger(i) || node.args[i] === undefined) {
          return no(`chỉ số ngoài khoảng 0..${node.args.length - 1}`);
        }
        if (seen.has(i)) return no(`hạng tử ${i} nằm ở hai nhóm`);
        seen.add(i);
      }
    }
    if (seen.size !== node.args.length) {
      const missing = node.args.map((_, i) => i).filter((i) => !seen.has(i));
      return no(`hạng tử ${missing.join(', ')} không thuộc nhóm nào`);
    }

    const pieces: Expr[] = [];
    for (const [gi, g] of groups.entries()) {
      const terms = g.map((i) => node.args[i] as Expr);
      const common = commonFactorOf(m, terms);
      if (common === null) return no(`nhóm ${gi + 1} không có nhân tử chung nào khác 1`);
      const rests: Expr[] = [];
      for (const t of terms) {
        const rest = divideMonomial(m, t, common);
        if (rest === null) return no(`nhóm ${gi + 1}: không chia được hạng tử cho nhân tử chung`);
        rests.push(rest);
      }
      pieces.push(mul(m, [common, add(m, rests)]));
    }
    return { after: add(m, pieces) };
  },
};

/**
 * Hoàn thành bình phương: $ax^2+bx+c \to a\left(x+\frac b{2a}\right)^2 + \frac{4ac-b^2}{4a}$.
 *
 * Trung tâm của bất đẳng thức, cực trị, và cách giải phương trình bậc hai *không* qua
 * công thức nghiệm. Số học đi bằng `rat` — **chính xác**, không dấu phẩy động: hệ số
 * $\frac b{2a}$ hầu như luôn là phân số, và một sai số $10^{-16}$ ở đây là một dòng
 * hình sai.
 */
const completeSquare: Rule = {
  id: 'complete_square',
  label: 'hoàn thành bình phương',
  run(m, node) {
    const parts = flatten(node);
    if (parts === null) return no('cần một đa thức');

    let name: string | null = null;
    const coefs = new Map<number, number>();
    for (const p of parts) {
      const live = [...p.powers.entries()].filter(([, e]) => e !== 0);
      if (live.length > 1) return no('không phải đa thức một biến');
      if (live.length === 0) {
        coefs.set(0, (coefs.get(0) ?? 0) + p.coef);
        continue;
      }
      const [key, deg] = live[0] as [string, number];
      const base = p.bases.get(key) as Expr;
      if (base.k !== 'var') return no('ẩn phải là một biến');
      name ??= base.name;
      if (base.name !== name) return no('không phải đa thức một biến');
      coefs.set(deg, (coefs.get(deg) ?? 0) + p.coef);
    }

    const top = Math.max(...[...coefs.keys()]);
    if (top !== 2 || name === null) return no('cần một tam thức bậc hai một biến');
    const a = coefs.get(2) ?? 0;
    const b = coefs.get(1) ?? 0;
    const c = coefs.get(0) ?? 0;
    if (a === 0) return no('hệ số bậc hai bằng 0');
    if (b === 0) return no('đã không còn hạng tử bậc nhất để gộp');

    const inner = add(m, [variable(m, name), rat(m, b, 2 * a)]);
    const square = pow(m, inner, 2);
    const scaled = a === 1 ? square : mul(m, [int(m, a), square]);
    const remainder = rat(m, 4 * a * c - b * b, 4 * a);
    const isZero = 4 * a * c - b * b === 0;
    return { after: isZero ? scaled : add(m, [scaled, remainder]) };
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
    const safe = definitelyNonZero(term);
    const { copy } = freshCopy(m, term);
    return {
      after: { ...node, lhs: mul(m, [node.lhs, term]), rhs: mul(m, [node.rhs, copy]) },
      condition: safe ? undefined : conditionText(arg),
      guard: safe ? undefined : { expr: freshCopy(m, term).copy, sign: '!=0' },
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
          return { ...e, base: go(e.base), exp: go(e.exp) };
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

/* ---------- lớp phương trình có điều kiện ---------- */

/**
 * Nâng cả hai vế lên luỹ thừa $n$ — và **ba nhánh của nó chính là nội dung đáng dạy**.
 *
 * - **$n$ lẻ**: $x \mapsto x^n$ là song ánh **tăng** trên $\mathbb R$, nên nó bảo toàn
 *   tập nghiệm, cả với bất đẳng thức. Đi hợp đồng `sameSolutionSet` như mọi luật ★.
 * - **$n$ chẵn, đẳng thức**: **nới rộng** — $x = -2$ sai mà $x^2 = 4$ đúng. Hợp đồng
 *   `implies`, và nghĩa vụ thử lại được ghi ra hình.
 * - **$n$ chẵn, bất đẳng thức**: **từ chối** trừ khi hai vế chắc chắn không âm.
 *   $-5 < 3$ mà $25 > 9$. Bám đúng tiền lệ `mul_both_sides` từ chối khi chưa biết dấu:
 *   ở trường người ta tách trường hợp, và một điều kiện lấp liếm ở đây sẽ giấu mất
 *   đúng cái phải tách.
 *
 * Nhãn để trung tính; tác giả muốn chữ "bình phương hai vế" thì dùng `AlgebraStep.note`,
 * vốn sinh ra để đè nhãn luật.
 */
const powBothSides: Rule = {
  id: 'pow_both_sides',
  label: 'nâng luỹ thừa hai vế',
  onRelation: true,
  needsArg: true,
  run(m, node, arg) {
    if (node.k !== 'rel') return no('cần một đẳng thức hoặc bất đẳng thức');
    const n = Number((arg ?? '2').trim());
    if (!Number.isInteger(n) || n < 2) return no('số mũ phải là số nguyên ≥ 2');

    const after: Expr = { ...node, lhs: pow(m, node.lhs, n), rhs: pow(m, node.rhs, n) };
    if (n % 2 === 1) return { after };

    const isEquation = node.op === '=' || node.op === '!=';
    if (!isEquation && !(definitelyNonNegative(node.lhs) && definitelyNonNegative(node.rhs))) {
      return no(
        `luỹ thừa bậc chẵn không giữ chiều khi hai vế có thể âm — tách trường hợp trước`,
      );
    }
    if (!isEquation) return { after };

    // Không kèm `condition`: món nợ này đã có dòng đỏ riêng (`AlgebraModel.extraneous`),
    // và trộn nó vào dòng điều kiện là nói rằng "giả thiết" với "nợ phải trả" cùng loại.
    return { after, verify: 'implies' };
  },
};

/**
 * Bỏ dấu giá trị tuyệt đối theo **một nhánh**: `arg` là `"+"` hoặc `"-"`.
 *
 * Cùng quy ước với `quadratic_formula`, và cùng lý lẽ (§24.3): chia nhánh là việc của
 * **cây lời giải** (`edge_type: "case"`), vốn sinh ra để làm đúng việc ấy. Nhét một nút
 * "hoặc" vào cây biểu thức là dựng lại cùng một khái niệm ở tầng thứ hai.
 *
 * `guard` là thứ làm bước này kiểm được: $|A| = A$ **sai** ở mọi điểm $A<0$, nên không
 * có `guard` thì bộ kiểm kết tội đúng — và kết tội oan, vì nhánh này chỉ hứa đúng bên
 * trong điều kiện của nó.
 */
const absCase: Rule = {
  id: 'abs_case',
  label: 'bỏ dấu giá trị tuyệt đối',
  needsArg: true,
  run(m, node, arg) {
    if (node.k !== 'abs') return no('cần một dấu giá trị tuyệt đối');
    const sign = (arg ?? '+').trim();
    if (sign !== '+' && sign !== '-') return no('cần tham số "+" hoặc "-"');

    const inner = node.arg;
    const text = toPlain(inner);
    return {
      after: sign === '+' ? inner : negate(m, freshCopy(m, inner).copy),
      condition: `${text} ${sign === '+' ? '≥' : '≤'} 0`,
      guard: { expr: freshCopy(m, inner).copy, sign: sign === '+' ? '>=0' : '<=0' },
    };
  },
};

/**
 * Thế một giá trị cụ thể vào một ẩn: `arg` là `"x := 3"`, cùng quy ước `substitute`.
 *
 * Hai việc thật: kiểm một nhân tử (định lý Bézout — $P(a)=0 \iff (x-a) \mid P$), và
 * **thử lại nghiệm ngoại lai** sau `pow_both_sides`. Nên nó không phải tiện ích: nó là
 * đường trả nợ cho hợp đồng `implies`.
 *
 * Hợp đồng `'instance'` kiểm bằng **cấu trúc** — `after` phải đúng bằng `before` sau
 * khi thay. `substitute` đang được **miễn kiểm**, và M47c dạy rằng chỗ miễn kiểm là
 * chỗ lỗ hổng nằm; luật này không xin miễn.
 */
const evaluateAt: Rule = {
  id: 'evaluate_at',
  label: 'thay giá trị vào',
  needsArg: true,
  run(m, node, arg) {
    const parts = (arg ?? '').split(':=');
    if (parts.length !== 2) return no('cần tham số dạng "x := 3"');
    const name = (parts[0] as string).trim();
    if (!/^[a-zA-Z](_[0-9])?$/.test(name)) return no(`"${name}" không phải tên biến`);
    const value = parse(parts[1] as string, m);
    if (varsOf(value).size > 0) return no('giá trị thay vào phải là hằng');

    let found = false;
    const go = (e: Expr): Expr => {
      if (e.k === 'var' && e.name === name) {
        found = true;
        return freshCopy(m, value).copy;
      }
      const kids = children(e);
      return kids.length === 0 ? e : withChildren(e, kids.map(go));
    };
    const after = go(node);
    if (!found) return no(`không thấy biến "${name}" trong cây con này`);
    return { after, verify: 'instance', binding: { name, expr: value } };
  },
};

/* ---------- hằng đẳng thức luỹ thừa bậc n ---------- */

/** Nhận ra $a^n$ với $n$ nguyên $\ge 2$; số nguyên thì thử khai căn đúng bậc. */
function asPowerOf(m: Minter, e: Expr, n: number): Expr | null {
  if (e.k === 'pow' && intExp(e) === n) return e.base;
  if (e.k === 'int' && e.v > 0) {
    const r = Math.round(Math.pow(e.v, 1 / n));
    return Math.pow(r, n) === e.v ? int(m, r) : null;
  }
  return null;
}

/** Bậc chung lớn nhất đọc ra được từ hai hạng tử — không đoán, chỉ đọc số mũ đã viết. */
function sharedPower(a: Expr, b: Expr): number | null {
  const deg = (e: Expr): number | null => (e.k === 'pow' ? intExp(e) : null);
  const x = deg(a);
  const y = deg(b);
  if (x !== null && y !== null && x === y && x >= 2) return x;
  return x ?? y;
}

/**
 * $a^n - b^n \to (a-b)\left(a^{n-1} + a^{n-2}b + \dots + b^{n-1}\right)$.
 *
 * Tổng quát hoá `factor_diff_squares`. **Không tự đặt trần $n$**: nhân tử sau có $n$
 * hạng tử nên nó đụng `maxNodes` và `maxWidthCells` rất nhanh — mà từ M49 hai trần ấy
 * đo **đúng thứ chúng nói**, nên để chúng từ chối là đúng phân công. Đặt thêm một trần
 * $n \le 5$ ở đây là dựng lại đúng cái lỗi M49 vừa gỡ: một con số đứng thay cho một
 * con số khác.
 */
const factorPowerDifference: Rule = {
  id: 'factor_power_difference',
  label: 'hiệu hai luỹ thừa',
  run(m, node) {
    if (node.k !== 'add' || node.args.length !== 2) return no('cần một tổng hai hạng tử');
    const [x, y] = node.args as [Expr, Expr];
    const neg = stripNegative(m, y);
    if (neg === null) return no('hạng tử thứ hai phải mang dấu trừ');

    const n = sharedPower(x, neg);
    if (n === null || n < 2) return no('hai hạng tử phải là luỹ thừa cùng bậc ≥ 2');
    const a = asPowerOf(m, x, n);
    const b = asPowerOf(m, neg, n);
    if (a === null || b === null) return no(`hai hạng tử phải là luỹ thừa bậc ${n} đúng`);

    const terms: Expr[] = [];
    for (let i = n - 1; i >= 0; i -= 1) {
      const factors: Expr[] = [];
      if (i > 0) factors.push(pow(m, freshCopy(m, a).copy, i));
      if (n - 1 - i > 0) factors.push(pow(m, freshCopy(m, b).copy, n - 1 - i));
      terms.push(factors.length === 0 ? int(m, 1) : mul(m, factors));
    }
    return { after: mul(m, [add(m, [a, negate(m, b)]), add(m, terms)]) };
  },
};

/**
 * $a^n + b^n \to (a+b)\left(a^{n-1} - a^{n-2}b + \dots + b^{n-1}\right)$, **chỉ khi $n$ lẻ**.
 *
 * $n$ chẵn thì $a^n+b^n$ *không* phân tích được trên $\mathbb{Q}$ — $a^2+b^2$ là ví dụ
 * ai cũng biết. Từ chối và nói ra, chứ không im lặng trả về chính nó.
 */
const factorPowerSumOdd: Rule = {
  id: 'factor_power_sum_odd',
  label: 'tổng hai luỹ thừa bậc lẻ',
  run(m, node) {
    if (node.k !== 'add' || node.args.length !== 2) return no('cần một tổng hai hạng tử');
    const [x, y] = node.args as [Expr, Expr];
    const n = sharedPower(x, y);
    if (n === null || n < 3) return no('hai hạng tử phải là luỹ thừa cùng bậc ≥ 3');
    if (n % 2 === 0) return no(`bậc chẵn thì a^${n} + b^${n} không phân tích được trên ℚ`);
    const a = asPowerOf(m, x, n);
    const b = asPowerOf(m, y, n);
    if (a === null || b === null) return no(`hai hạng tử phải là luỹ thừa bậc ${n} đúng`);

    const terms: Expr[] = [];
    for (let i = n - 1; i >= 0; i -= 1) {
      const factors: Expr[] = [];
      if (i > 0) factors.push(pow(m, freshCopy(m, a).copy, i));
      if (n - 1 - i > 0) factors.push(pow(m, freshCopy(m, b).copy, n - 1 - i));
      const piece = factors.length === 0 ? int(m, 1) : mul(m, factors);
      terms.push((n - 1 - i) % 2 === 1 ? negate(m, piece) : piece);
    }
    return { after: mul(m, [add(m, [a, b]), add(m, terms)]) };
  },
};

/** Bỏ dấu trừ của một hạng tử âm; `null` khi nó không mang dấu trừ. */
function stripNegative(m: Minter, e: Expr): Expr | null {
  if (e.k === 'int' && e.v < 0) return int(m, -e.v);
  if (e.k !== 'mul') return null;
  const head = e.args[0];
  if (head === undefined || head.k !== 'int' || head.v !== -1) return null;
  const tail = e.args.slice(1);
  return tail.length === 1 ? (tail[0] as Expr) : mul(m, tail);
}

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
  multiplyOut,
  setVariable,
  quadraticFormula,
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
  rootToPower,
  powerToRoot,
  commonDenominator,
  combineFraction,
  factorByGrouping,
  completeSquare,
  cancelCommon,
  splitFraction,
  factorPowerDifference,
  factorPowerSumOdd,
  addBothSides,
  mulBothSides,
  powBothSides,
  absCase,
  evaluateAt,
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
