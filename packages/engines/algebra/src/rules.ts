import { definitelyNonZero } from './check.js';
import {
  Minter,
  add,
  div,
  int,
  mul,
  pow,
  rat,
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
  const head = e.args[0];
  if (head === undefined || head.k !== 'int') return { coef: 1, rest: e };
  const tail = e.args.slice(1);
  return { coef: head.v, rest: tail.length === 1 ? (tail[0] as Expr) : mul(m, tail) };
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
