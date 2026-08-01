import {
  definiteSign,
  definitelyNonNegative,
  definitelyNonZero,
  definitelyPositive,
  evalReal,
  type Guard,
  type Guards,
} from './check.js';
import { intExp, needsRealEval } from './expr.js';
import {
  Minter,
  abs,
  add,
  big,
  sys,
  div,
  fn,
  int,
  children,
  mul,
  negate,
  pow,
  flipOp,
  infinity,
  rat,
  rel,
  root,
  same,
  variable,
  varsOf,
  walk,
  withChildren,
  type Expr,
  type FnName,
  type RelOp,
  type TermId,
} from './expr.js';
import { parse, toPlain, tryParse, unparse } from './parse.js';

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
  readonly guard?: Guards;
  /**
   * Các **vai** trong hằng đẳng thức đang áp: nhóm $i$ được tô một màu.
   *
   * $(a+b)^2 = a^2+2ab+b^2$ — tô $a$ một màu, $b$ một màu, và vì `TermId` bền qua các
   * dòng nên màu ấy **tự bắc cầu** giữa dòng nguồn và dòng kết quả. Mắt nối hai vế mà
   * không cần một mũi tên nào. Đây là thứ rẻ nhất trong cả bộ công cụ thị giác và
   * cũng là thứ nói được nhiều nhất, vì nó nói đúng cái mà một hằng đẳng thức *là*:
   * một khuôn, và hai thứ điền vào khuôn.
   *
   * Khai bằng **danh sách id**, không bằng tên vai: engine không cần biết vai ấy tên
   * $a$ hay $u$, nó chỉ cần biết "những nút này là một vai".
   */
  readonly roles?: ReadonlyArray<readonly TermId[]>;
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
  /**
   * **Đẳng thức mà bước này khẳng định** — hợp đồng thứ bảy, và nó có vì hệ phương trình.
   *
   * `sameSolutionSet` **không dùng được cho hệ**, và lý do phải ghi lại: bốc một điểm
   * $(x,y)$ ngẫu nhiên thì cả hệ trước lẫn hệ sau đều **sai**, hai bên "đồng ý", `agree`
   * tăng — phép kiểm xanh mà không chứng minh gì cả. Một chốt canh luôn xanh là chốt
   * canh không có.
   *
   * Nên phép biến đổi hàng kiểm bằng **đẳng thức**: luật khai một cặp $(left, right)$
   * trong đó `left` đọc ra từ cây **sau** còn `right` dựng từ cây **trước**, rồi `model`
   * hỏi `sameValue` — bộ kiểm cũ, không sửa gì. Cộng hai phương trình mà cộng sai thì
   * đẳng thức ấy hỏng ngay, và nó hỏng bằng một con số cụ thể.
   *
   * Kế hoạch M59 nói "không hợp đồng mới, dùng `verify: 'instance'` qua `replaceVar`".
   * Lời ấy sai: `'instance'` thay biến trên **toàn** cây, mà phép biến đổi hàng chỉ đụng
   * một phương trình. Ghi lại chỗ sai thay vì ép một hợp đồng không vừa.
   */
  readonly claim?: { readonly left: Expr; readonly right: Expr };
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
  /**
   * Kiểu nút mà luật này áp được — **chỉ bắt buộc với luật cần tham số** (M65).
   *
   * Luật không cần tham số thì thử thẳng là biết: `applicableRules` chạy nó và đọc lời
   * từ chối. Luật **cần** tham số thì không thử được khi chưa có tham số, nên trước M65
   * chúng được cho qua hết — và điều đó không hại ai vì `applicableRules` **chưa từng
   * có call site**.
   *
   * Nối bảng nước đi vào sandbox làm nó thành giao diện, và đo ngay được cái giá: gốc
   * của $(x+1)^2 + 3x$ bày ra 15 nút, trong đó 9 nút là luật của hệ phương trình, của
   * $\Sigma$, của trị tuyệt đối — bấm vào không làm gì. Đúng thứ chú thích của
   * `algebraTools` vừa viết ra để chống.
   *
   * Khai bằng **kiểu nút** chứ không bằng một bảng tên ở chỗ khác: điều kiện thật nằm
   * ở dòng `if (node.k !== 'sys')` đầu thân luật, nên chép nó lên đây là chép một sự
   * thật cạnh chính nó. Ba luật không quy về kiểu nút được (`set_variable`,
   * `evaluate_at`, `divide_by_linear_factor` — chúng nhận *bất kỳ* cây nào có biến,
   * hoặc bất kỳ đa thức nào) đi qua `couldTakeArg`, và chốt canh ép **mọi** luật cần
   * tham số phải có mặt ở một trong hai chỗ.
   */
  readonly accepts?: readonly Expr['k'][];
  run: RuleRun;
}

const no = (why: string): { refusal: string } => ({ refusal: why });

/**
 * Điều kiện in ra hình, lấy từ chuỗi tác giả gõ.
 *
 * Đổi gạch nối ASCII thành dấu trừ toán học: chuỗi này nằm cạnh công thức đã sắp
 * chữ, và `a - b` bên cạnh `a − b` đọc ra ngay là hai thứ khác nhau.
 */
/**
 * Dựng một điều kiện — bằng `Minter` **riêng**, và **không sao chép** cây con.
 *
 * Hai chuyện, cùng một lý do: biểu thức điều kiện **không bao giờ được vẽ**. Nó chỉ đi
 * qua `evalReal` (bỏ điểm vi phạm), `varsOf`, và từ M64 là `toPlain` (in ra chỗ chạm).
 * Không chỗ nào trong ba chỗ ấy nhìn tới `TermId`.
 *
 * Bản trước mint bằng `m` — `Minter` của chính scene — và trả giá hai lần:
 *
 * 1. **Ngốn không gian danh tính.** Thêm một `guard` vào một luật làm mọi `TermId` sinh
 *    sau đó dịch đi một số, nên bốn golden đổi với toạ độ **giống hệt từng chữ số** và
 *    chỉ khác `data-el`. Đúng loại nhiễu đã cắn ở M55, và lần này nó sẽ cắn lại mỗi lần
 *    ai đó thêm một điều kiện.
 * 2. **Sao chép thừa.** `freshCopy` có để hai chỗ trong *cùng một cây vẽ ra* không mang
 *    trùng danh tính. Điều kiện không nằm trong cây ấy, nên bản sao chỉ tốn bộ nhớ.
 *
 * Nay: `Minter` mới mỗi lần (tất định, không trạng thái dùng chung), cây con dùng thẳng.
 * Thêm điều kiện cho luật thứ 73 sẽ **không** đụng một golden nào.
 */
const guardOf = (sign: Guard['sign'], build: (g: Minter) => Expr): Guard => ({
  expr: build(new Minter()),
  sign,
});

const conditionText = (arg: string): string => `${arg.replace(/-/g, '−')} ≠ 0`;

/** Mọi id trong một cây con. */
function subtreeIds(e: Expr): TermId[] {
  const out: TermId[] = [];
  walk(e, (n) => out.push(n.id));
  return out;
}

/**
 * Sao chép một cây con với id hoàn toàn mới — dùng khi luật nhân bản một nhánh.
 *
 * Đi bằng `children`/`withChildren`, **không** bằng một `switch` viết tay — đúng
 * bài học đã ghi tại `substitute`: bản switch cũ liệt kê add/mul/pow/div/rel rồi
 * `default: return { ...n, id }`, tức là cấp id mới cho nút cha mà **giữ nguyên
 * id con** của root/abs/fn/big/sys. Hậu quả đo được: add_both_sides "sqrt(2)"
 * cho hai nút `2` cùng danh tính ở hai vế; sum_expand cho ba nút `n` trong ba
 * hạng tử cùng một id — id trùng trong cùng một cây vẽ ra, thứ mà mọi walker
 * (trace, hit-test, choreography) đều giả định không tồn tại.
 */
function freshCopy(m: Minter, e: Expr): { copy: Expr; pairs: Array<readonly [TermId, TermId]> } {
  const pairs: Array<readonly [TermId, TermId]> = [];
  const go = (n: Expr): Expr => {
    const id = m.next();
    pairs.push([n.id, id]);
    const kids = children(n);
    const renamed = kids.length === 0 ? n : withChildren(n, kids.map(go));
    return { ...renamed, id };
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
  accepts: ['add', 'mul'],
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
    // Vai thứ nhất là **thừa số được rải ra** (kể cả mọi bản sao của nó); mỗi hạng tử
    // trong ngoặc là một vai riêng. Tô thế thì nhìn một cái là thấy ai nhân với ai —
    // đúng hình mà sách vẽ bằng những cung nối.
    const spread: TermId[] = others.flatMap(subtreeIds);
    const roles: TermId[][] = [spread];

    const terms = sum.args.map((term, i) => {
      const factors =
        i === 0
          ? others
          : others.map((o) => {
              const { copy, pairs } = freshCopy(m, o);
              dup.push(...pairs);
              spread.push(...subtreeIds(copy));
              return copy;
            });
      roles.push(subtreeIds(term));
      return mul(m, [...factors, term]);
    });

    return { after: add(m, terms), dup, roles };
  },
};

const factor: Rule = {
  id: 'factor',
  label: 'đặt nhân tử chung',
  needsArg: true,
  accepts: ['add'],
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
    const roleA = subtreeIds(a);
    const roleB = subtreeIds(b);
    const twin = (e: Expr, bucket: TermId[]): Expr => {
      const { copy, pairs } = freshCopy(m, e);
      dup.push(...pairs);
      bucket.push(...subtreeIds(copy));
      return copy;
    };
    // $(a+b)^2 = a^2 + 2ab + b^2$. Mỗi vế xuất hiện ba lần nên hai bản sao mới.
    const after = add(m, [
      pow(m, a, 2),
      mul(m, [int(m, 2), twin(a, roleA), twin(b, roleB)]),
      pow(m, b, 2),
    ]);
    return { after, dup, roles: [roleA, roleB] };
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

/**
 * Trục căn thức ở mẫu: $\dfrac{a}{\sqrt[n]{b}} = \dfrac{a\sqrt[n]{b^{\,n-1}}}{b}$.
 *
 * Bậc hai là ca quen thuộc và là ca duy nhất bản đầu làm được (*"mới trục được căn bậc
 * hai"*), nhưng công thức chẳng qua là cùng một ý ở mọi bậc: nhân cho đủ $n$ bản của
 * $\sqrt[n]b$ thì dấu căn tan. $\dfrac1{\sqrt[3]2} \to \dfrac{\sqrt[3]4}{2}$.
 *
 * Hai nhánh dựng cây tách riêng **cố ý**: nhánh bậc hai giữ nguyên từng chữ của bản cũ,
 * kể cả thứ tự cấp danh tính, nên kho không đổi một nét. Gộp lại thì đẹp hơn mà đánh đổi
 * bằng việc phải soát lại mọi golden — không đáng.
 *
 * Mẫu **nhị thức** chứa căn ($\sqrt[3]a - \sqrt[3]b$) không đi đường này: nó cần hằng
 * đẳng thức $x^3-y^3$, tức một nhân tử liên hợp ba hạng tử. Từ chối có lời thay vì im.
 */
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
    if (r === undefined || r.k !== 'root') {
      if (den.k === 'add' && den.args.some((a) => a.k === 'root')) {
        return no('mẫu là tổng chứa căn — dùng `multiply_by_conjugate`');
      }
      return no('mẫu không chứa căn');
    }

    const others = den.k === 'mul' ? den.args.filter((a) => a.id !== r.id) : [];
    const newDen = mul(m, [...others, r.arg]);
    const condition = definitelyNonZero(r.arg) ? undefined : conditionText('mẫu');

    if (r.index === 2) {
      const { copy } = freshCopy(m, r);
      return { after: div(m, mul(m, [node.num, copy]), newDen), condition };
    }

    // Bậc $n$: nhân cho $\sqrt[n]{b^{\,n-1}}$, vì $\sqrt[n]b \cdot \sqrt[n]{b^{n-1}}
    // = \sqrt[n]{b^n} = b$. Ruột phải là **bản sao**: nó xuất hiện thêm một lần trên
    // hình, và dùng lại chính nút cũ thì một nút có hai chỗ đứng (bài học M47).
    const { copy: arg } = freshCopy(m, r.arg);
    const multiplier = root(m, r.index, pow(m, arg, r.index - 1));
    return { after: div(m, mul(m, [node.num, multiplier]), newDen), condition };
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
    const roleA = subtreeIds(a);
    const roleB = subtreeIds(b);
    const twin = (e: Expr, bucket: TermId[]): Expr => {
      const { copy, pairs } = freshCopy(m, e);
      dup.push(...pairs);
      bucket.push(...subtreeIds(copy));
      return copy;
    };
    // $(a+b)^3 = a^3 + 3a^2b + 3ab^2 + b^3$.
    const after = add(m, [
      pow(m, a, 3),
      mul(m, [int(m, 3), pow(m, twin(a, roleA), 2), twin(b, roleB)]),
      mul(m, [int(m, 3), twin(a, roleA), pow(m, twin(b, roleB), 2)]),
      pow(m, b, 3),
    ]);
    return { after, dup, roles: [roleA, roleB] };
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
    return {
      after: mul(m, [add(m, [a, negate(m, b)]), add(m, [a2, b2])]),
      roles: [
        [...subtreeIds(x), ...subtreeIds(a), ...subtreeIds(a2)],
        [...subtreeIds(negY), ...subtreeIds(b), ...subtreeIds(b2)],
      ],
    };
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
    const roleA: TermId[] = [...subtreeIds(node.args[0] as Expr), ...subtreeIds(a)];
    const roleB: TermId[] = [...subtreeIds(node.args[1] as Expr), ...subtreeIds(b)];
    const c = (e: Expr, bucket: TermId[]): Expr => {
      const { copy } = freshCopy(m, e);
      bucket.push(...subtreeIds(copy));
      return copy;
    };
    return {
      after: mul(m, [
        add(m, [a, s > 0 ? b : negate(m, b)]),
        add(m, [
          pow(m, c(a, roleA), 2),
          s > 0
            ? negate(m, mul(m, [c(a, roleA), c(b, roleB)]))
            : mul(m, [c(a, roleA), c(b, roleB)]),
          pow(m, c(b, roleB), 2),
        ]),
      ]),
      roles: [roleA, roleB],
    };
  },
};

/** Ước dương của $|n|$, tăng dần. `0` không có ước nào hữu hạn nên trả rỗng. */
function positiveDivisors(n: number): number[] {
  const a = Math.abs(n);
  if (a === 0) return [];
  const out: number[] = [];
  for (let d = 1; d <= a; d += 1) if (a % d === 0) out.push(d);
  return out;
}

/** Mọi ước của $n$, âm trước dương, tăng dần: $6 \mapsto [-6,-3,-2,-1,1,2,3,6]$. */
const allDivisors = (n: number): number[] => {
  const pos = positiveDivisors(n);
  return [...pos.map((d) => -d).reverse(), ...pos];
};

/**
 * Một nhân tử bậc nhất $px + q$ quanh một biến **đã cấp danh tính sẵn**.
 *
 * Nhận `x` từ ngoài chứ không tự dựng, để phía gọi quyết định thứ tự cấp id. Nghe như
 * chi tiết vụn, nhưng `data-el` trong SVG *là* `TermId`, nên đổi thứ tự cấp là đổi
 * golden — mà ở đây hình không đổi một nét, nên diff ấy chỉ là nhiễu.
 *
 * Hệ số $1$ không dựng nút: $1x$ là thứ không ai viết tay, và giữ nguyên dạng cũ cho
 * nhánh $a=1$ nghĩa là cả kho không phải soát lại.
 */
const linearFactor = (m: Minter, p: number, x: Expr, q: number): Expr =>
  add(m, [p === 1 ? x : mul(m, [int(m, p), x]), int(m, q)]);

/**
 * $ax^2 + bx + c = (p_1x + q_1)(p_2x + q_2)$ — "tách hạng tử".
 *
 * Chỉ tìm nghiệm **hữu tỉ**, và chỉ nhận kết quả **hệ số nguyên**: engine không hứa
 * phân tích được mọi tam thức, và một kết quả chứa căn ở đây thì nên đi qua công thức
 * nghiệm chứ không qua luật này.
 *
 * Bản trước từ chối thẳng khi $a \ne 1$ (*"mới phân tích được tam thức có hệ số dẫn đầu
 * bằng 1"*), tức bó tay ở $2x^2+7x+3$ — nội dung lớp 9. Cách tìm nay là vét cạn xác
 * định trên ước của $a$ và của $c$: $p_1 \mid a$, $q_1 \mid c$, rồi kiểm hạng tử giữa.
 * Không phải tìm kiếm mò, và không dùng số thực — mọi phép so đều trên số nguyên, nên
 * không có sai số nào để lọt.
 *
 * Thứ tự duyệt cố định (ước tăng dần, âm trước dương) nên với $a = 1$ nó cho ra **đúng
 * cặp cũ**: hình của kho không đổi một nét.
 */
const factorQuadratic: Rule = {
  id: 'factor_quadratic',
  label: 'phân tích tam thức',
  run(m, node) {
    if (node.k !== 'add') return no('cần một tổng');
    const poly = univariate(node);
    if (typeof poly === 'string') return no(poly);
    const { name, coefs } = poly;

    const top = Math.max(...[...coefs.keys()]);
    if (top !== 2) return no('không phải tam thức bậc hai một biến');
    const a = coefs.get(2) ?? 0;
    const b = coefs.get(1) ?? 0;
    const c = coefs.get(0) ?? 0;
    if (a === 0) return no('hệ số bậc hai bằng 0');

    // $c = 0$: không có ước nào của $0$ để vét, mà lời giải thì hiển nhiên —
    // $ax^2+bx = x(ax+b)$. Tách riêng thay vì để vòng lặp im lặng không tìm thấy gì.
    if (c === 0) {
      const x1 = variable(m, name);
      const x2 = variable(m, name);
      return { after: mul(m, [x1, linearFactor(m, a, x2, b)]) };
    }

    for (const p1 of positiveDivisors(a)) {
      const p2 = a / p1;
      for (const q1 of allDivisors(c)) {
        const q2 = c / q1;
        if (!Number.isInteger(q2)) continue;
        if (p1 * q2 + p2 * q1 !== b) continue;
        // Cấp danh tính cho **cả hai** biến trước rồi mới dựng — đúng thứ tự bản cũ,
        // nên nhánh $a = 1$ cho ra `TermId` y hệt và golden của kho không nhúc nhích.
        const x1 = variable(m, name);
        const x2 = variable(m, name);
        return { after: mul(m, [linearFactor(m, p1, x1, q1), linearFactor(m, p2, x2, q2)]) };
      }
    }
    return no('không có cặp số nguyên nào thoả — hãy dùng công thức nghiệm');
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
  accepts: ['rel'],
  onRelation: true,
  run(m, node, arg) {
    if (node.k !== 'rel' || node.op !== '=') return no('cần một phương trình');
    const sign = (arg ?? '+').trim();
    if (sign !== '+' && sign !== '-') return no('cần tham số "+" hoặc "-"');

    const zeroSide = (e: Expr): boolean => e.k === 'int' && e.v === 0;
    const poly = zeroSide(node.rhs) ? node.lhs : zeroSide(node.lhs) ? node.rhs : null;
    if (poly === null) return no('một vế phải bằng 0 — chuyển vế trước đã');

    const parsed = univariate(poly);
    if (typeof parsed === 'string') return no(parsed);
    const { name, coefs } = parsed;
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
  accepts: ['add'],
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
    const roles: TermId[][] = [];
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
      // Mỗi **nhóm** là một vai: cách nhóm là mẹo của bài, nên nó phải nhìn thấy được.
      roles.push([...terms.flatMap(subtreeIds), ...subtreeIds(common), ...rests.flatMap(subtreeIds)]);
      pieces.push(mul(m, [common, add(m, rests)]));
    }
    return { after: add(m, pieces), roles };
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
/**
 * Hệ số của một **đa thức một biến**, theo bậc.
 *
 * Ba luật cần đúng câu hỏi này — `quadratic_formula`, `complete_square`, và
 * `divide_by_linear_factor` — nên nó ở một chỗ. Ba bản chép tay thì bản thứ tư sẽ khác
 * bản thứ nhất, và khác ở đúng chỗ không ai nhìn.
 *
 * Trả chuỗi khi từ chối, để phía gọi tự gói vào `no()` với ngữ cảnh của nó.
 */
function univariate(e: Expr): { name: string; coefs: Map<number, number> } | string {
  const parts = flatten(e);
  if (parts === null) return 'không phải đa thức';

  let name: string | null = null;
  const coefs = new Map<number, number>();
  for (const p of parts) {
    const live = [...p.powers.entries()].filter(([, exp]) => exp !== 0);
    if (live.length > 1) return 'không phải đa thức một biến';
    if (live.length === 0) {
      coefs.set(0, (coefs.get(0) ?? 0) + p.coef);
      continue;
    }
    const [key, deg] = live[0] as [string, number];
    const base = p.bases.get(key) as Expr;
    if (base.k !== 'var') return 'ẩn phải là một biến';
    name ??= base.name;
    if (base.name !== name) return 'không phải đa thức một biến';
    coefs.set(deg, (coefs.get(deg) ?? 0) + p.coef);
  }
  if (name === null) return 'không có biến nào';
  return { name, coefs };
}

const completeSquare: Rule = {
  id: 'complete_square',
  label: 'hoàn thành bình phương',
  run(m, node) {
    const poly = univariate(node);
    if (typeof poly === 'string') return no(poly);
    const { name, coefs } = poly;

    const top = Math.max(...[...coefs.keys()]);
    if (top !== 2) return no('cần một tam thức bậc hai một biến');
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
  accepts: ['div'],
  run(m, node, arg) {
    if (node.k !== 'div') return no('rút gọn cần một phân số');
    if (arg === undefined) return no('cần nói rút gọn thừa số nào');

    const common = parse(arg, m);
    const num = divideOut(m, node.num, common);
    const den = divideOut(m, node.den, common);
    if (num === null || den === null) return no(`"${arg}" không phải thừa số chung của tử và mẫu`);

    // Rút gọn bởi thứ **có thể bằng 0** là chỗ mất nghiệm. Cùng họ với AL-08.
    const safe = definitelyNonZero(common);
    const after = same(den, int(m, 1)) ? num : div(m, num, den);
    return {
      after,
      condition: safe ? undefined : conditionText(arg),
      // `guard` đi kèm chữ (M64). Không có nó thì dòng đỏ "$x + 2 \ne 0$" là một lời
      // dặn không hỏi được — mà đây đúng là luật mà câu *"thì sao nếu bằng 0"* có câu
      // trả lời sắc nhất: chỗ ấy là nghiệm vừa bị đánh mất.
      ...(safe ? {} : { guard: guardOf('!=0', () => common) }),
    };
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
  accepts: ['rel'],
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
  accepts: ['rel'],
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
      guard: safe ? undefined : guardOf('!=0', () => term),
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
    let shadowed = false;
    const dup: Array<readonly [TermId, TermId]> = [];
    let first = true;
    // Đi bằng `children`/`withChildren`, **không** bằng một `switch` viết tay.
    //
    // Bản cũ liệt kê `add`/`mul`/`pow`/`div`/`rel` rồi `default: return e`, nên nó im
    // lặng bỏ qua `abs`, `root`, `fn`, `big`. Hậu quả: `substitute` **chưa bao giờ**
    // thế được vào trong một dấu căn — từ M47b, năm hạng mục liền — và lời từ chối còn
    // nói sai hẳn ("không thấy biến x") trong khi biến nằm ngay đó. Không ai gặp vì
    // chưa bài nào thế vào trong căn; M57 làm nó lộ ra vì `big` là kiểu nút thứ tư bị
    // bỏ quên. `children` thì **đầy đủ theo kiến trúc**, nên nó không quên được.
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
      // Tên bị **che** bởi một tổng bên trong: chỉ đi vào hai cận, không vào thân.
      if (e.k === 'big' && e.v === name) {
        shadowed = true;
        return { ...e, from: go(e.from), to: go(e.to) };
      }
      const kids = children(e).map(go);
      return kids.length === 0 ? e : withChildren(e, kids);
    };

    const after = go(node);
    if (!found) {
      return no(
        shadowed
          ? `"${name}" ở đây là chỉ số bị ràng buộc — thế được vào cận, không thế được vào thân`
          : `không thấy biến "${name}" trong cây con này`,
      );
    }
    return { after, dup };
  },
};

/**
 * $P(x) \to (x-a)\,Q(x)$ — chia Horner cho một nhân tử tuyến tính.
 *
 * Lỗ duy nhất còn lại của tập luật, và nó nằm ở giữa đúng mạch chuyên toán:
 *
 * ```
 * P(1) = 0   ⟶   P = (x−1)·Q   ⟶   giải Q bậc hai
 *  evaluate_at      chỗ này         quadratic_formula
 * ```
 *
 * Trước đây câu trả lời là "đã có engine `longdiv`". Đúng một nửa, và nửa sai mới quan
 * trọng: `longdiv` là một **scene riêng**, nên nó không giảm bậc được như một *bước bên
 * trong* một chuỗi đại số. Mạch trên gãy đúng ở giữa.
 *
 * Tác giả khai **chia cho cái gì**, engine tính thương — cùng đặt cược với cả engine.
 * Và **dư $\\ne 0$ thì từ chối**, kèm số dư: đó không phải lỗi kỹ thuật mà là câu trả
 * lời cho câu hỏi "$(x-a)$ có phải nhân tử không". Lời từ chối *là* nội dung.
 *
 * Hệ số phải nguyên. Horner trên số nguyên là chính xác; thả ra số thực thì một dư
 * $10^{-16}$ sẽ được nhận là $0$ và engine **khẳng định một nhân tử không tồn tại** —
 * rồi mọi bước sau xây trên lời nói dối ấy.
 *
 * Cửa ấy hiện **không với tới được**: `flatten` đã từ chối cả `rat` lẫn `div` từ trước,
 * nên đa thức hệ số hữu tỉ dừng ở "không phải đa thức". Giữ lại làm lớp chắn thứ hai
 * cho ngày `flatten` biết đọc `rat` — nhưng **không** viết chốt canh cho nó: một test
 * không với tới được nhánh nó nhắm là một test xanh vô nghĩa (bài học M48).
 */
const divideByLinearFactor: Rule = {
  id: 'divide_by_linear_factor',
  label: 'chia cho nhân tử tuyến tính',
  needsArg: true,
  run(m, node, arg) {
    if (arg === undefined) return no('cần nói chia cho cái gì, ví dụ "x - 1"');

    const poly = univariate(node);
    if (typeof poly === 'string') return no(poly);
    const divisor = univariate(parse(arg, m));
    if (typeof divisor === 'string') return no(`ước số: ${divisor}`);
    if (divisor.name !== poly.name) return no('ước số phải cùng biến với đa thức');

    const top = Math.max(...[...poly.coefs.keys()]);
    if (top < 1) return no('đa thức phải có bậc ≥ 1');
    if (Math.max(...[...divisor.coefs.keys()]) !== 1) return no('ước số phải là bậc nhất');
    if ((divisor.coefs.get(1) ?? 0) !== 1) return no('ước số phải có hệ số dẫn đầu bằng 1');

    // $x - a$ nên hệ số tự do là $-a$.
    const root = -(divisor.coefs.get(0) ?? 0);
    const c: number[] = [];
    for (let d = top; d >= 0; d -= 1) c.push(poly.coefs.get(d) ?? 0);
    if (!c.every(Number.isInteger) || !Number.isInteger(root)) {
      return no('hệ số phải nguyên — Horner trên số thực làm dư nhỏ bị nhận nhầm là 0');
    }

    // Horner: $b_{k-1} = c_k + a\\,b_k$, và số cuối là **dư**.
    const q: number[] = [c[0] as number];
    for (let i = 1; i < c.length; i += 1) {
      q.push((c[i] as number) + root * (q[i - 1] as number));
    }
    const remainder = q.pop() as number;
    if (remainder !== 0) {
      return no(`dư ${remainder} ≠ 0 — ${arg} không phải nhân tử`);
    }

    const terms: Expr[] = [];
    q.forEach((coef, i) => {
      if (coef === 0) return;
      const deg = q.length - 1 - i;
      const power = deg === 0 ? null : pow(m, variable(m, poly.name), deg);
      terms.push(withCoefficient(m, coef, power));
    });

    const quotient = terms.length === 0 ? int(m, 0) : add(m, terms);
    const linear = parse(arg, m);
    return {
      after: mul(m, [linear, quotient]),
      roles: [subtreeIds(linear), subtreeIds(quotient)],
    };
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
  accepts: ['rel'],
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
  accepts: ['abs'],
  run(m, node, arg) {
    if (node.k !== 'abs') return no('cần một dấu giá trị tuyệt đối');
    const sign = (arg ?? '+').trim();
    if (sign !== '+' && sign !== '-') return no('cần tham số "+" hoặc "-"');

    const inner = node.arg;
    const text = toPlain(inner);
    return {
      after: sign === '+' ? inner : negate(m, freshCopy(m, inner).copy),
      condition: `${text} ${sign === '+' ? '≥' : '≤'} 0`,
      guard: guardOf(sign === '+' ? '>=0' : '<=0', () => inner),
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
/**
 * **Thay biến bởi một biểu thức** trên cả phương trình — nước đi cốt lõi của
 * chuyên đề phương trình hàm (AL-17, M73).
 *
 * Khác `evaluate_at` ở đúng một chỗ: giá trị thay vào **không cần là hằng**. Đó là
 * cả lý do luật này tồn tại — $f(x+y) = f(x)+f(y)$ mở ra bằng $y := x$, $y := -x$,
 * $y := 0$, và chỉ cái cuối là hằng.
 *
 * Khác `substitute` ở chỗ nó **áp cho cả quan hệ**, và đó là chỗ đổi nghĩa: thế
 * vào một cây con là đổi hệ quy chiếu (M69 ghi lại vì sao ở đó không hợp đồng nào
 * áp được); thế vào cả một đẳng thức **đúng với mọi giá trị** thì là *chuyên biệt
 * hoá* — một hệ quả, và một hệ quả kiểm được bằng cấu trúc.
 *
 * Hợp đồng là `'instance'` chứ **không** phải `'implies'`, và chỗ này đáng ghi lại
 * vì nó suýt sai. `impliesSolutionSet` bốc điểm trên các nguyên tử đã trừu tượng
 * hoá, mà phép trừu tượng hoá **cắt đứt** liên hệ giữa $f(x{+}y)$ và $f(2x)$: hai
 * lời gọi khác đối số thành hai nguyên tử độc lập, nên "trước đúng ⟹ sau đúng"
 * không còn giữ và bộ kiểm sẽ kết tội một bước hoàn toàn hợp lệ. Câu hỏi đúng ở
 * đây không phải "có suy ra được không" mà "**có thế đúng không**" — và đó chính
 * là `'instance'`.
 */
const specialize: Rule = {
  id: 'specialize',
  label: 'chuyên biệt hoá',
  needsArg: true,
  accepts: ['rel', 'sys'],
  run(m, node, arg) {
    if (node.k !== 'rel' && node.k !== 'sys') {
      return no('chuyên biệt hoá áp cho cả một phương trình, không cho một cây con');
    }
    const parts = (arg ?? '').split(':=');
    if (parts.length !== 2) return no('cần tham số dạng "y := 0" hoặc "y := -1*x"');
    const name = (parts[0] as string).trim();
    if (!/^[a-zA-Z](_[0-9])?$/.test(name)) return no(`"${name}" không phải tên biến`);
    if (!varsOf(node).has(name)) return no(`không thấy biến "${name}" trong phương trình này`);

    const value = parse((parts[1] as string).trim(), m);
    // Thay một biến bởi một biểu thức **chứa chính nó** ($x := x + 1$) là hợp lệ về
    // toán và gần như luôn là lỗi gõ trong thực tế; cấm thì mất một nước đi thật,
    // nên cho qua. Chỗ **phải** cấm là tên bị một $\Sigma$ bên trong ràng buộc —
    // `substituteVar` lo, và `model` chặn cả đường gọi vào giữa thân (`boundAlong`).

    const dup: Array<readonly [TermId, TermId]> = [];
    const put = (e: Expr): Expr => {
      if (e.k === 'var' && e.name === name) {
        // Một bản sao **riêng** cho từng lần xuất hiện, cùng lý do đã ghi ở
        // `substitute_from`: dùng chung một cây thì id trùng trong dòng vẽ ra.
        const { copy, pairs } = freshCopy(m, value);
        dup.push(...pairs);
        return copy;
      }
      if (e.k === 'big' && e.v === name) {
        return { ...e, from: put(e.from), to: put(e.to) };
      }
      const kids = children(e).map(put);
      return kids.length === 0 ? e : withChildren(e, kids);
    };

    return { after: put(node), dup, verify: 'instance', binding: { name, expr: value } };
  },
};

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
    let shadowed = false;
    const go = (e: Expr): Expr => {
      if (e.k === 'var' && e.name === name) {
        found = true;
        return freshCopy(m, value).copy;
      }
      // Tên bị **che** bởi một tổng bên trong: chỉ đi vào hai cận, không vào thân —
      // cùng nhánh phạm vi mà `substitute` đã có. Thiếu nó, "k := 3" trên
      // $\sum_k k$ thay cả biến chỉ số bị ràng buộc, ra $\sum_k 3$ — một phép
      // biến đổi sai trắng; và hợp đồng `instance` không bắt được vì `replaceVar`
      // của model từng mù phạm vi theo đúng cùng một cách.
      if (e.k === 'big' && e.v === name) {
        shadowed = true;
        return { ...e, from: go(e.from), to: go(e.to) };
      }
      const kids = children(e);
      return kids.length === 0 ? e : withChildren(e, kids.map(go));
    };
    const after = go(node);
    if (!found) {
      // Lời từ chối là nội dung: "không thấy biến k" trong khi $k$ nằm ngay đó
      // (nhưng bị ràng buộc) là một lời từ chối nói dối.
      return no(
        shadowed
          ? `"${name}" ở đây là chỉ số bị ràng buộc — thay được vào cận, không thay được vào thân`
          : `không thấy biến "${name}" trong cây con này`,
      );
    }
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

    // **Số mũ ký hiệu** — và đây là chỗ $\Sigma$ của M57 trả cổ tức.
    //
    // $a^n - b^n = (a-b)\left(a^{n-1} + \dots + b^{n-1}\right)$ với $n$ ký hiệu thì
    // nhân tử sau cần một dấu ba chấm, và engine không có nút cho dấu ba chấm. Nhưng
    // dấu ba chấm ấy **là** một tổng có chỉ số:
    //
    //     a^n − b^n = (a − b) · Σ_{k=0}^{n−1} a^k · b^{n−1−k}
    //
    // Viết thế thì nó có ngữ nghĩa, kiểm được (bộ bốc điểm số nguyên thay $n$ bằng
    // $1..12$ rồi khai tổng ra), và không phải dựng thêm kiểu nút nào. Đây là lý do
    // "nút dấu ba chấm" nằm ở mục **cố ý không làm**.
    const symbolic = symbolicPowers(x, neg);
    if (symbolic !== null) {
      const { base: a, other: b, exp } = symbolic;
      const k = freshIndex(node);
      const kv = (): Expr => variable(m, k);
      // $x^n - 1$: hạng tử kia là $1$, và $1^{\,n-1-k}$ thì không ai viết ra. Không
      // dựng nút ấy ngay từ đầu **khác** với rút gọn lén — ở đây không có gì bị bỏ đi,
      // chỉ là dạng chuẩn của công thức vốn không có nó.
      const one = b.k === 'int' && b.v === 1;
      const body = one
        ? pow(m, freshCopy(m, a).copy, kv())
        : mul(m, [
            pow(m, freshCopy(m, a).copy, kv()),
            pow(
              m,
              freshCopy(m, b).copy,
              add(m, [freshCopy(m, exp).copy, int(m, -1), negate(m, kv())]),
            ),
          ]);
      return {
        after: mul(m, [
          add(m, [a, negate(m, b)]),
          big(m, 'sum', k, int(m, 0), add(m, [freshCopy(m, exp).copy, int(m, -1)]), body),
        ]),
      };
    }

    const n = sharedPower(x, neg);
    if (n === null || n < 2) {
      return no('hai hạng tử phải là luỹ thừa cùng bậc ≥ 2');
    }
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
    // Số mũ ký hiệu: **từ chối, và nói vì sao**. Tính chẵn/lẻ của $n$ quyết định hẳn
    // câu trả lời — $n$ lẻ thì phân tích được, $n$ chẵn thì không ($a^2+b^2$ là ví dụ ai
    // cũng biết) — mà engine không biết tính chẵn lẻ của một ký hiệu. Đúng tiền lệ
    // `pow_both_sides`: chỗ nào tính chẵn lẻ đổi kết luận thì chỗ ấy phải từ chối.
    if (symbolicPowers(x, y) !== null) {
      return no('bậc là ký hiệu — chẵn hay lẻ quyết định có phân tích được hay không');
    }
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


/* ---------- hàm tổ hợp (M56) ---------- */

/**
 * Năm luật cho $n!$, $C_n^k$, $A_n^k$ — **đồng nhất thức**, đi hợp đồng `sameValue`.
 *
 * Hợp đồng thì cũ, nhưng **sân kiểm** thì mới: `sameValue` nay lái mọi biểu thức có hàm
 * tổ hợp sang bộ bốc điểm **số nguyên** (`check.ts`). Không có bộ ấy thì cả năm luật này
 * đi qua im lặng như "không kiểm được" — vệt vàng thường trực, đúng thất bại M45.
 *
 * Chú ý danh tính: $n$ và $k$ xuất hiện **nhiều lần** ở vế sau của bốn trong năm luật,
 * nên mỗi lần thêm là một `freshCopy` có khai `dup`. Dùng lại chính nút cũ thì một nút có
 * hai chỗ đứng trên hình, và choreography sẽ kéo nó về một chỗ (bài học M47).
 */

/**
 * Điều kiện in ra hình — **`undefined` khi nó hiển nhiên đúng**.
 *
 * $C_5^2$ khai điều kiện "$0 \le 2 \le 5$" thì đó là một dòng đỏ nói một chuyện ai cũng
 * thấy. Kho đã học ở M45 rằng chữ đỏ thường trực và vô ích là cách nhanh nhất để người
 * ta ngừng đọc *mọi* chữ đỏ, kể cả dòng thật. Tiền lệ có sẵn: `rationalize` bỏ điều kiện
 * khi mẫu `definitelyNonZero`.
 *
 * Chỉ bỏ khi **tính ra được và thoả** — có biến thì luôn in, vì engine không biết miền.
 */
const atLeast = (e: Expr, bound: number): string | undefined => {
  const v = varsOf(e).size === 0 ? evalReal(e, new Map()) : null;
  return v !== null && v >= bound ? undefined : `${toPlain(e)} ≥ ${bound}`;
};

/** $0 \le k \le n$, cùng lối: im khi cả hai là hằng và bất đẳng thức đã đúng. */
const between = (k: Expr, n: Expr): string | undefined => {
  const kv = varsOf(k).size === 0 ? evalReal(k, new Map()) : null;
  const nv = varsOf(n).size === 0 ? evalReal(n, new Map()) : null;
  if (kv !== null && nv !== null && kv >= 0 && kv <= nv) return undefined;
  return `0 ≤ ${toPlain(k)} ≤ ${toPlain(n)}`;
};

/** $n! = n\,(n-1)!$ — bước đệ quy, và là cầu nối duy nhất từ $n!$ về số học thường. */
const factorialStep: Rule = {
  id: 'factorial_step',
  label: 'tách một thừa số khỏi giai thừa',
  run(m, node) {
    if (node.k !== 'fn' || node.name !== 'fact') return no('cần một dấu giai thừa');
    const n = node.args[0] as Expr;
    const { copy, pairs } = freshCopy(m, n);
    return {
      after: mul(m, [n, fn(m, 'fact', [add(m, [copy, int(m, -1)])])]),
      dup: pairs,
      // $0! = 1$ nhưng $0 \cdot (-1)!$ vô nghĩa, nên bước này cần $n \ge 1$ thật sự.
      condition: atLeast(n, 1),
      guard: guardOf('>=0', (g) => add(g, [n, int(g, -1)])),
    };
  },
};

/** $C_n^k = \dfrac{n!}{k!\,(n-k)!}$ — định nghĩa, và cửa ra khỏi ký hiệu tổ hợp. */
const binomToFactorial: Rule = {
  id: 'binom_to_factorial',
  label: 'viết tổ hợp bằng giai thừa',
  run(m, node) {
    if (node.k !== 'fn' || node.name !== 'binom') return no('cần một ký hiệu tổ hợp');
    const [n, k] = node.args as [Expr, Expr];
    const nCopy = freshCopy(m, n);
    const kCopy = freshCopy(m, k);
    return {
      after: div(
        m,
        fn(m, 'fact', [n]),
        mul(m, [
          fn(m, 'fact', [k]),
          fn(m, 'fact', [add(m, [nCopy.copy, negate(m, kCopy.copy)])]),
        ]),
      ),
      dup: [...nCopy.pairs, ...kCopy.pairs],
      // `guard` ở đây **không** để loại điểm — điểm vi phạm tự loại rồi: $(n-k)!$ với
      // $n < k$ cho `null`, và bộ kiểm bỏ nó như bỏ căn bậc chẵn của số âm. Nó có mặt
      // để dòng điều kiện **hỏi được** (M64): không có nó thì "$0 \le k \le n$" là một
      // dòng chữ mà chạm vào không ra gì.
      condition: between(k, n),
      guard: [
        guardOf('>=0', () => k),
        guardOf('>=0', (g) => add(g, [n, negate(g, k)])),
      ],
    };
  },
};

/** $C_n^k = C_n^{\,n-k}$ — chọn $k$ thứ để lấy cũng là chọn $n-k$ thứ để bỏ. */
const binomSymmetry: Rule = {
  id: 'binom_symmetry',
  label: 'đối xứng của tổ hợp',
  run(m, node) {
    if (node.k !== 'fn' || node.name !== 'binom') return no('cần một ký hiệu tổ hợp');
    const [n, k] = node.args as [Expr, Expr];
    const nCopy = freshCopy(m, n);
    return {
      after: fn(m, 'binom', [n, add(m, [nCopy.copy, negate(m, k)])]),
      dup: nCopy.pairs,
      // Đúng ở **mọi** $k$ nguyên nhờ quy ước $C_n^k = 0$ ngoài $[0,n]$ — cả hai vế
      // cùng bằng $0$ ở đó. Nên không có điều kiện nào để in.
    };
  },
};

/** $C_n^k = C_{n-1}^{\,k-1} + C_{n-1}^{\,k}$ — hai ô trên trong tam giác Pascal. */
const pascal: Rule = {
  id: 'pascal',
  label: 'công thức Pascal',
  run(m, node) {
    if (node.k !== 'fn' || node.name !== 'binom') return no('cần một ký hiệu tổ hợp');
    const [n, k] = node.args as [Expr, Expr];
    const nCopy = freshCopy(m, n);
    const kCopy = freshCopy(m, k);
    const below = (x: Expr): Expr => add(m, [x, int(m, -1)]);
    return {
      after: add(m, [
        fn(m, 'binom', [below(n), below(k)]),
        fn(m, 'binom', [below(nCopy.copy), kCopy.copy]),
      ]),
      dup: [...nCopy.pairs, ...kCopy.pairs],
      condition: atLeast(n, 1),
      guard: guardOf('>=0', (g) => add(g, [n, int(g, -1)])),
      // Hai vai: $n$ một màu, $k$ một màu. Mắt thấy ngay cả hai đều **lùi một bậc**,
      // và chỉ một trong hai vế lùi thêm ở $k$ — đó chính là nội dung của công thức.
      roles: [
        [n.id, ...nCopy.pairs.map(([, to]) => to)],
        [k.id, ...kCopy.pairs.map(([, to]) => to)],
      ],
    };
  },
};

/** $k\,C_n^k = n\,C_{n-1}^{\,k-1}$ — "hút" hệ số vào trong, mẹo chủ lực của tổng tổ hợp. */
const binomAbsorb: Rule = {
  id: 'binom_absorb',
  label: 'hút hệ số vào tổ hợp',
  run(m, node) {
    if (node.k !== 'mul') return no('cần một tích');
    const at = node.args.findIndex((a) => a.k === 'fn' && a.name === 'binom');
    if (at === -1) return no('trong tích không có ký hiệu tổ hợp');
    const b = node.args[at] as Expr & { k: 'fn' };
    const [n, k] = b.args as [Expr, Expr];

    // Thừa số phải **đúng bằng** $k$ — so bằng cấu trúc, không bằng tên.
    const ki = node.args.findIndex((a, i) => i !== at && same(a, k));
    if (ki === -1) return no(`trong tích không có thừa số bằng ${toPlain(k)}`);

    const rest = node.args.filter((_, i) => i !== at && i !== ki);
    const nCopy = freshCopy(m, n);
    const absorbed = mul(m, [
      nCopy.copy,
      fn(m, 'binom', [add(m, [n, int(m, -1)]), add(m, [k, int(m, -1)])]),
    ]);
    return {
      after: rest.length === 0 ? absorbed : mul(m, [...rest, absorbed]),
      dup: nCopy.pairs,
      // Thừa số $k$ **biến mất** khỏi tích và hoá thành $n$ đứng ngoài. Khai `merged`
      // để hình kể đúng chuyện ấy thay vì một cặp xoá–thêm.
      merged: [[[(node.args[ki] as Expr).id], nCopy.copy.id]],
      condition: atLeast(n, 1),
      guard: guardOf('>=0', (g) => add(g, [n, int(g, -1)])),
    };
  },
};



/**
 * Hai hạng tử có phải $a^n$ và $b^n$ với **cùng một số mũ không nguyên** không.
 *
 * Trả `null` khi số mũ là số nguyên — ca ấy đi đường cũ, viết hết các hạng tử ra. Chỉ
 * khi số mũ là ký hiệu thì mới cần tới $\Sigma$.
 */
function symbolicPowers(
  x: Expr,
  y: Expr,
): { base: Expr; other: Expr; exp: Expr } | null {
  if (x.k !== 'pow' || intExp(x) !== null) return null;
  // $x^n - 1$ là ví dụ kinh điển nhất của cả họ, và $1$ **là** $1^n$. Không nhận nó thì
  // luật từ chối đúng bài mà người ta mở sách ra để tìm.
  if (y.k === 'int' && y.v === 1) return { base: x.base, other: y, exp: x.exp };
  if (y.k !== 'pow' || intExp(y) !== null) return null;
  if (!same(x.exp, y.exp)) return null;
  return { base: x.base, other: y.base, exp: x.exp };
}

/**
 * Một tên chỉ số **chưa dùng** trong cây con này.
 *
 * `k` là tên ai cũng viết, nhưng nếu $k$ đã có mặt (chẳng hạn $a^k - b^k$) thì dùng lại
 * nó là bắt một biến tự do — đúng lỗi phạm vi mà M57 dựng cả một hàm `varsOf` để tránh.
 */
function freshIndex(e: Expr, also: ReadonlySet<string> = new Set()): string {
  const used = new Set([...varsOf(e), ...also]);
  for (const name of ['k', 'i', 'j', 'r', 's', 't']) if (!used.has(name)) return name;
  let n = 1;
  while (used.has(`k_${n}`)) n += 1;
  return `k_${n}`;
}

/** $x^{m+n} \to x^m x^n$ — chiều ngược của `pow_add`, và nó chưa có. */
const powSplit: Rule = {
  id: 'pow_split',
  label: 'tách số mũ thành tích',
  run(m, node) {
    if (node.k !== 'pow') return no('cần một luỹ thừa');
    if (node.exp.k !== 'add') return no('số mũ phải là một tổng');
    const base = node.base;
    const parts = node.exp.args.map((e, i) =>
      pow(m, i === 0 ? base : freshCopy(m, base).copy, e),
    );
    return { after: mul(m, parts) };
  },
};




/* ---------- hàm siêu việt (M61) ---------- */

/**
 * Mười một luật, và **tập ấy đóng**.
 *
 * Không có "rút gọn biểu thức lượng giác": không gian đồng nhất thức lượng giác vô hạn,
 * và một nút bấm nhảy năm bước là đúng thứ làm người học không học được gì (§4). Mười
 * một luật này là những đồng nhất thức có tên trong sách, không phải một bộ giải.
 *
 * Miền xác định **không** cần `Guard`: `evalReal` của $\ln$ trả `null` ngay khi đối số
 * $\le 0$, nên bộ bốc điểm đã tự bỏ mọi điểm ngoài miền. Cái còn thiếu là **nói cho
 * người đọc**, và đó là `domainText` ở bảng hàm.
 */

/** Một lời gọi hàm một đối số, đúng tên. */
const callOf = (e: Expr, name: FnName): Expr | null =>
  e.k === 'fn' && e.name === name && e.args.length === 1 ? (e.args[0] as Expr) : null;

/** Logarit bất kỳ: trả `[cơ số | null, đối số]`. `null` cơ số nghĩa là $\ln$. */
function asLog(e: Expr): { base: Expr | null; arg: Expr } | null {
  if (e.k !== 'fn') return null;
  if (e.name === 'ln' && e.args.length === 1) return { base: null, arg: e.args[0] as Expr };
  if (e.name === 'log' && e.args.length === 2) {
    return { base: e.args[0] as Expr, arg: e.args[1] as Expr };
  }
  return null;
}

/** Dựng lại một logarit cùng loại với cái đã tháo ra. */
const rebuildLog = (m: Minter, base: Expr | null, arg: Expr): Expr =>
  base === null ? fn(m, 'ln', [arg]) : fn(m, 'log', [base, arg]);

/** Điều kiện xác định của một logarit, chữ để in ra hình. */
const logCondition = (arg: Expr): string | undefined =>
  definitelyPositive(arg) ? undefined : `${toPlain(arg)} > 0`;

/**
 * ...và **cùng điều kiện ấy dưới dạng máy đọc được** (M64).
 *
 * M61 (§37.2) đã cân nhắc chuyện này và kết luận `Guard` ở đây *thừa*: `evalReal` của
 * $\ln$ trả `null` ngay khi đối số $\le 0$, nên bộ bốc điểm **đã** tự bỏ mọi điểm
 * ngoài miền và một `Guard` không thêm gì. Kết luận ấy đúng — với **người tiêu thụ duy
 * nhất tồn tại lúc đó**.
 *
 * M64 thêm người tiêu thụ thứ hai: chỗ chạm vào dòng điều kiện (`incident.ts`) hỏi
 * *"thì sao nếu vi phạm"*, và câu ấy chỉ trả lời được bằng `Guard`. Không có nó thì
 * năm luật logarit in ra một dòng đỏ **không hỏi được** — đúng thứ M64 sinh ra để sửa.
 *
 * Nên đây không phải lật lại một quyết định sai, mà là cùng một quyết định trong một
 * thế giới có thêm một người dùng. Chi phí kiểm vẫn bằng không: điểm mà guard loại đã
 * là điểm mà `evalReal` loại.
 *
 * Dùng `>=0` cho một điều kiện thật ra là `> 0`: `Guard` không có dấu ngặt, và chỗ
 * lệch duy nhất là điểm $0$ — nơi $\ln$ vốn đã không xác định nên bị bỏ dù thế nào.
 */
const logGuards = (args: readonly Expr[]): Guard[] =>
  args.filter((a) => !definitelyPositive(a)).map((a) => guardOf('>=0', () => a));

/** $\log(ab) = \log a + \log b$. */
const logProduct: Rule = {
  id: 'log_product',
  label: 'logarit của một tích',
  run(m, node) {
    const L = asLog(node);
    if (L === null) return no('cần một logarit');
    if (L.arg.k !== 'mul') return no('đối số phải là một tích');
    const parts = L.arg.args;
    const terms = parts.map((a, i) =>
      rebuildLog(m, i === 0 ? L.base : L.base === null ? null : freshCopy(m, L.base).copy, a),
    );
    const bad = parts.filter((a) => !definitelyPositive(a));
    return {
      after: add(m, terms),
      condition: bad.length === 0 ? undefined : bad.map((a) => `${toPlain(a)} > 0`).join(', '),
      ...(bad.length === 0 ? {} : { guard: logGuards(parts) }),
    };
  },
};

/** $\log\frac ab = \log a - \log b$. */
const logQuotient: Rule = {
  id: 'log_quotient',
  label: 'logarit của một thương',
  run(m, node) {
    const L = asLog(node);
    if (L === null) return no('cần một logarit');
    if (L.arg.k !== 'div') return no('đối số phải là một phân số');
    const { num, den } = L.arg;
    const other = L.base === null ? null : freshCopy(m, L.base).copy;
    const bad = [num, den].filter((a) => !definitelyPositive(a));
    return {
      after: add(m, [rebuildLog(m, L.base, num), negate(m, rebuildLog(m, other, den))]),
      condition: bad.length === 0 ? undefined : bad.map((a) => `${toPlain(a)} > 0`).join(', '),
      ...(bad.length === 0 ? {} : { guard: logGuards([num, den]) }),
    };
  },
};

/** $\log(a^n) = n\log a$ — cửa chính của mọi phương trình mũ. */
const logPower: Rule = {
  id: 'log_power',
  label: 'số mũ ra trước logarit',
  run(m, node) {
    const L = asLog(node);
    if (L === null) return no('cần một logarit');
    if (L.arg.k !== 'pow') return no('đối số phải là một luỹ thừa');
    const guard = logGuards([L.arg.base]);
    return {
      after: mul(m, [L.arg.exp, rebuildLog(m, L.base, L.arg.base)]),
      condition: logCondition(L.arg.base),
      ...(guard.length === 0 ? {} : { guard }),
    };
  },
};

/** $\log_b a = \dfrac{\ln a}{\ln b}$ — đổi cơ số về $\ln$. */
const logChangeBase: Rule = {
  id: 'log_change_base',
  label: 'đổi cơ số logarit',
  run(m, node) {
    if (node.k !== 'fn' || node.name !== 'log' || node.args.length !== 2) {
      return no('cần một logarit có cơ số');
    }
    const [base, arg] = node.args as [Expr, Expr];
    return {
      after: div(m, fn(m, 'ln', [arg]), fn(m, 'ln', [base])),
      condition: definitelyPositive(base) ? undefined : `${toPlain(base)} > 0, ${toPlain(base)} ≠ 1`,
      // Cơ số $1$ là chỗ **mẫu số nổ** ($\ln 1 = 0$), khác hẳn cơ số âm là chỗ hàm
      // không xác định — hai điều kiện, hai `Guard`.
      ...(definitelyPositive(base)
        ? {}
        : {
            guard: [
              ...logGuards([base]),
              guardOf('!=0', (g) => add(g, [base, int(g, -1)])),
            ],
          }),
    };
  },
};

/** $e^{\ln a} = a$ — hai hàm ngược nhau triệt tiêu. */
const expLog: Rule = {
  id: 'exp_log',
  label: 'mũ rồi logarit thì triệt tiêu',
  run(m, node) {
    const inner = callOf(node, 'exp');
    if (inner === null) return no('cần một luỹ thừa cơ số e');
    const arg = callOf(inner, 'ln');
    if (arg === null) return no('bên trong phải là một logarit tự nhiên');
    // Không cần điều kiện: nếu $\ln a$ đã xác định thì $a > 0$ sẵn rồi. Điều kiện nằm ở
    // chính dấu $\ln$ của dòng trước, không ở bước này — đúng lý lẽ `root_pow`.
    return { after: arg };
  },
};

/** $\ln(e^a) = a$ — chiều còn lại, và nó **không** cần điều kiện nào. */
const logExp: Rule = {
  id: 'log_exp',
  label: 'logarit của luỹ thừa cơ số e',
  run(m, node) {
    const inner = callOf(node, 'ln');
    if (inner === null) return no('cần một logarit tự nhiên');
    const arg = callOf(inner, 'exp');
    if (arg === null) return no('bên trong phải là một luỹ thừa cơ số e');
    return { after: arg };
  },
};

/** $\sin^2 x + \cos^2 x = 1$. */
const pythagoreanIdentity: Rule = {
  id: 'pythagorean_identity',
  label: 'hằng đẳng thức lượng giác cơ bản',
  run(m, node) {
    if (node.k !== 'add') return no('cần một tổng');
    const squareOf = (e: Expr, name: FnName): Expr | null =>
      e.k === 'pow' && intExp(e) === 2 ? callOf(e.base, name) : null;

    for (let i = 0; i < node.args.length; i += 1) {
      for (let j = 0; j < node.args.length; j += 1) {
        if (i === j) continue;
        const s = squareOf(node.args[i] as Expr, 'sin');
        const c = squareOf(node.args[j] as Expr, 'cos');
        if (s === null || c === null || !same(s, c)) continue;
        const rest = node.args.filter((_, k) => k !== i && k !== j);
        return {
          after: add(m, [...rest, int(m, 1)]),
          merged: [[[(node.args[i] as Expr).id, (node.args[j] as Expr).id], (node.args[i] as Expr).id]],
        };
      }
    }
    return no('không thấy sin² và cos² của cùng một góc');
  },
};

/** $\sin 2x = 2\sin x\cos x$ và $\cos 2x = \cos^2 x - \sin^2 x$. */
const doubleAngle: Rule = {
  id: 'double_angle',
  label: 'công thức góc nhân đôi',
  run(m, node) {
    if (node.k !== 'fn' || (node.name !== 'sin' && node.name !== 'cos')) {
      return no('cần sin hoặc cos');
    }
    const arg = node.args[0] as Expr;
    // Góc phải có dạng $2\cdot\theta$ — nhận bằng cấu trúc, không bằng số học.
    if (arg.k !== 'mul') return no('góc phải là một tích');
    const at = arg.args.findIndex((a) => a.k === 'int' && a.v === 2);
    if (at === -1) return no('góc phải có thừa số 2');
    const rest = arg.args.filter((_, i) => i !== at);
    const half = rest.length === 1 ? (rest[0] as Expr) : mul(m, rest);
    const copy = freshCopy(m, half);

    if (node.name === 'sin') {
      return {
        after: mul(m, [int(m, 2), fn(m, 'sin', [half]), fn(m, 'cos', [copy.copy])]),
        dup: copy.pairs,
      };
    }
    return {
      after: add(m, [
        pow(m, fn(m, 'cos', [half]), 2),
        negate(m, pow(m, fn(m, 'sin', [copy.copy]), 2)),
      ]),
      dup: copy.pairs,
    };
  },
};

/** $\sin A + \sin B = 2\sin\frac{A+B}2\cos\frac{A-B}2$ (và bản $\cos$). */
const sumToProduct: Rule = {
  id: 'sum_to_product',
  label: 'tổng thành tích',
  run(m, node) {
    if (node.k !== 'add' || node.args.length !== 2) return no('cần một tổng hai hạng tử');
    const [x, y] = node.args as [Expr, Expr];
    for (const name of ['sin', 'cos'] as const) {
      const a = callOf(x, name);
      const b = callOf(y, name);
      if (a === null || b === null) continue;
      const half = (u: Expr, v: Expr): Expr => div(m, add(m, [u, v]), int(m, 2));
      const a2 = freshCopy(m, a);
      const b2 = freshCopy(m, b);
      const sum = half(a, b);
      const diff = half(a2.copy, negate(m, b2.copy));
      return {
        after:
          name === 'sin'
            ? mul(m, [int(m, 2), fn(m, 'sin', [sum]), fn(m, 'cos', [diff])])
            : mul(m, [int(m, 2), fn(m, 'cos', [sum]), fn(m, 'cos', [diff])]),
        dup: [...a2.pairs, ...b2.pairs],
      };
    }
    return no('cần sin + sin hoặc cos + cos');
  },
};

/** $\sin A\cos B = \tfrac12\left(\sin(A+B) + \sin(A-B)\right)$. */
const productToSum: Rule = {
  id: 'product_to_sum',
  label: 'tích thành tổng',
  run(m, node) {
    if (node.k !== 'mul') return no('cần một tích');
    const si = node.args.findIndex((a) => callOf(a, 'sin') !== null);
    const ci = node.args.findIndex((a) => callOf(a, 'cos') !== null);
    if (si === -1 || ci === -1) return no('cần một thừa số sin và một thừa số cos');
    const a = callOf(node.args[si] as Expr, 'sin') as Expr;
    const b = callOf(node.args[ci] as Expr, 'cos') as Expr;
    const rest = node.args.filter((_, i) => i !== si && i !== ci);
    const a2 = freshCopy(m, a);
    const b2 = freshCopy(m, b);
    const body = div(
      m,
      add(m, [
        fn(m, 'sin', [add(m, [a, b])]),
        fn(m, 'sin', [add(m, [a2.copy, negate(m, b2.copy)])]),
      ]),
      int(m, 2),
    );
    return {
      after: rest.length === 0 ? body : mul(m, [...rest, body]),
      dup: [...a2.pairs, ...b2.pairs],
    };
  },
};

/**
 * Lấy logarit hai vế — nhóm ★, và nó **bảo toàn** tập nghiệm.
 *
 * $\ln$ tăng ngặt trên $(0,\infty)$, nên $A = B \iff \ln A = \ln B$ **khi cả hai dương**.
 * Điều kiện ấy đi theo đúng cơ chế AL-08: ghi ra hình, không từ chối. Từ chối thì luật
 * này gần như không bao giờ áp được, vì hai vế thường chứa biến.
 */
const logBothSides: Rule = {
  id: 'log_both_sides',
  label: 'lấy logarit hai vế',
  onRelation: true,
  run(m, node) {
    if (node.k !== 'rel') return no('cần một quan hệ');
    if (node.op !== '=' && node.op !== '<' && node.op !== '>') {
      return no('mới làm được với =, < và >');
    }
    const bad = [node.lhs, node.rhs].filter((e) => !definitelyPositive(e));
    return {
      after: { ...node, lhs: fn(m, 'ln', [node.lhs]), rhs: fn(m, 'ln', [node.rhs]) },
      condition: bad.length === 0 ? undefined : bad.map((e) => `${toPlain(e)} > 0`).join(', '),
      ...(bad.length === 0 ? {} : { guard: logGuards([node.lhs, node.rhs]) }),
    };
  },
};

/* ---------- tập nghiệm và khoảng (M60) ---------- */

/**
 * Ba luật phát biểu **đáp số** của một bất phương trình.
 *
 * Lỗ này có thật và đo được: $x^2-3x+2>0$ phân tích ra $(x-2)(x-1)>0$ rồi **dừng** — không
 * có chỗ nào đặt đáp số. Thêm luật không cứu được, phải thêm chỗ cho kết quả rơi vào.
 *
 * Và chỗ ấy **đã có sẵn** từ M59: `sys` với `join: 'or'` *là* một tuyển khoảng. Không dựng
 * nút `set`/`interval` riêng — một khoảng *là* một hội hai bất đẳng thức, và dựng lại nó
 * thành một nút thứ hai là dựng hai lần cùng một thứ (đúng lỗi §24.3 đã tránh với hai
 * nghiệm bậc hai).
 *
 * Ở đây `sameSolutionSet` **có răng thật**, ngược hẳn với hệ phương trình (§35.2): bốc một
 * $x$ ngẫu nhiên thì "thuộc tập nghiệm" là một câu đúng/sai có nghĩa ở cả hai vế. Cùng một
 * bộ kiểm mà chỗ này dùng được, chỗ kia không.
 */

/** Số thực của một biểu thức hằng; `null` khi còn biến. */
const constValue = (e: Expr): number | null =>
  varsOf(e).size === 0 ? evalReal(e, new Map()) : null;

/** $|A| < a$ và $|A| > a$ — `<` cho một hội, `>` cho một tuyển. */
const absToInterval: Rule = {
  id: 'abs_to_interval',
  label: 'bỏ trị tuyệt đối thành khoảng',
  run(m, node) {
    if (node.k !== 'rel') return no('cần một bất phương trình');
    if (node.lhs.k !== 'abs') return no('vế trái phải là một dấu giá trị tuyệt đối');
    const bound = constValue(node.rhs);
    if (bound === null) return no('vế phải phải là một số');
    if (bound <= 0) return no(`vế phải phải dương (đang là ${bound})`);

    const inner = node.lhs.arg;
    const other = freshCopy(m, inner);
    const negBound = negate(m, freshCopy(m, node.rhs).copy);

    if (node.op === '<' || node.op === '<=') {
      // $|A| < a \iff -a < A < a$ — một **hội**, vẽ trong ngoặc nhọn.
      return {
        after: sys(m, 'and', [
          rel(m, node.op === '<' ? '>' : '>=', inner, negBound),
          rel(m, node.op, other.copy, node.rhs),
        ]),
        dup: other.pairs,
      };
    }
    if (node.op === '>' || node.op === '>=') {
      // $|A| > a \iff A < -a$ **hoặc** $A > a$ — một tuyển, vẽ nằm ngang.
      return {
        after: sys(m, 'or', [
          rel(m, node.op === '>' ? '<' : '<=', inner, negBound),
          rel(m, node.op, other.copy, node.rhs),
        ]),
        dup: other.pairs,
      };
    }
    return no('mới làm được với < ≤ > ≥');
  },
};

/**
 * $(x-r_1)(x-r_2) > 0$ (hoặc $< 0$) thành khoảng.
 *
 * Chỉ **hai** nhân tử bậc nhất, hệ số dẫn đầu $1$, hai nghiệm là số. Đó là ca bậc hai —
 * gần như toàn bộ chương trình phổ thông — và mở rộng lên $n$ nhân tử thì kết quả là một
 * tuyển của các hội, tức một cây lồng hai tầng mà không mắt nào đọc nổi trên một dòng.
 * Từ chối có lời thay vì vẽ ra một thứ không đọc được.
 */
const intervalFromFactors: Rule = {
  id: 'interval_from_factors',
  label: 'đọc khoảng nghiệm từ dạng tích',
  run(m, node) {
    if (node.k !== 'rel') return no('cần một bất phương trình');
    if (node.op !== '<' && node.op !== '>') return no('mới làm được với < và >');
    if (constValue(node.rhs) !== 0) return no('vế phải phải là 0');
    if (node.lhs.k !== 'mul' || node.lhs.args.length !== 2) {
      return no('vế trái phải là tích **hai** nhân tử bậc nhất');
    }

    // Mỗi nhân tử phải là $x - r$: một biến cộng một hằng.
    const roots: number[] = [];
    let name: string | null = null;
    for (const f of node.lhs.args) {
      const poly = univariate(f);
      if (typeof poly === 'string') return no(poly);
      if (Math.max(...poly.coefs.keys()) !== 1) return no('mỗi nhân tử phải bậc nhất');
      if ((poly.coefs.get(1) ?? 0) !== 1) return no('mỗi nhân tử phải có hệ số dẫn đầu 1');
      if (name !== null && poly.name !== name) return no('hai nhân tử phải cùng một ẩn');
      name = poly.name;
      roots.push(-(poly.coefs.get(0) ?? 0));
    }
    if (name === null) return no('không có ẩn nào');
    const [r, q] = roots as [number, number];
    if (r === q) return no('hai nghiệm trùng nhau — tích là một bình phương, không đổi dấu');
    const [lo, hi] = r < q ? [r, q] : [q, r];

    const x = (): Expr => variable(m, name as string);
    if (node.op === '>') {
      // Ngoài hai nghiệm: tích dương.
      return {
        after: sys(m, 'or', [rel(m, '<', x(), int(m, lo)), rel(m, '>', x(), int(m, hi))]),
      };
    }
    // Giữa hai nghiệm: tích âm.
    return {
      after: sys(m, 'and', [rel(m, '>', x(), int(m, lo)), rel(m, '<', x(), int(m, hi))]),
    };
  },
};

/**
 * Gộp hai ràng buộc cùng chiều trên cùng một ẩn.
 *
 * Hội thì giữ cái **chặt hơn**, tuyển thì giữ cái **lỏng hơn** — $x>1 \wedge x>2$ là
 * $x>2$, còn $x<1 \vee x<2$ là $x<2$. So bằng số, nên hai cận phải là hằng.
 */
const mergeIntervals: Rule = {
  id: 'merge_intervals',
  label: 'gộp hai ràng buộc cùng chiều',
  run(m, node) {
    if (node.k !== 'sys') return no('cần một hệ hoặc một tuyển');

    const dir = (op: RelOp): 'up' | 'down' | null =>
      op === '>' || op === '>=' ? 'up' : op === '<' || op === '<=' ? 'down' : null;

    for (let i = 0; i < node.rels.length; i += 1) {
      for (let j = i + 1; j < node.rels.length; j += 1) {
        const a = node.rels[i] as Expr;
        const b = node.rels[j] as Expr;
        if (a.k !== 'rel' || b.k !== 'rel') continue;
        if (a.lhs.k !== 'var' || b.lhs.k !== 'var' || a.lhs.name !== b.lhs.name) continue;
        const d = dir(a.op);
        if (d === null || d !== dir(b.op)) continue;
        const va = constValue(a.rhs);
        const vb = constValue(b.rhs);
        if (va === null || vb === null) continue;

        // Hội + chiều lên ⇒ cận lớn hơn thắng; ba tổ hợp còn lại suy ra từ đối xứng.
        const tighter = node.join === 'and' ? d === 'up' : d === 'down';
        const keep = (tighter ? va > vb : va < vb) ? a : b;
        const rest = node.rels.filter((_, k) => k !== i && k !== j);
        const merged: Expr = rest.length === 0 ? keep : { ...node, rels: [...rest, keep] };
        return {
          after: merged,
          merged: [[[a.id, b.id], keep.id]],
        };
      }
    }
    return no('không có hai ràng buộc nào cùng ẩn, cùng chiều, cận là số');
  },
};

/* ---------- hệ phương trình (M59) ---------- */

/**
 * Bốn phép biến đổi hàng, và cả bốn kiểm bằng **đẳng thức** (`claim`), không bằng tập
 * nghiệm.
 *
 * `sameSolutionSet` vô nghĩa ở đây: bốc một điểm $(x,y)$ ngẫu nhiên thì cả hệ trước lẫn
 * hệ sau đều **sai**, hai bên "đồng ý", và phép kiểm xanh mà không chứng minh gì cả.
 * Còn hiệu hai vế thì là một **hàm** — hỏi nó có đồng nhất bằng cái engine bảo là được
 * không thì có răng thật, và răng nói bằng một con số cụ thể.
 *
 * `arg` theo quy ước dấu phẩy sẵn có (`commute` dùng `"0,1"`): các chỉ số phương trình,
 * rồi tới hệ số nếu luật cần.
 */

/** Đọc `arg` thành danh sách chỉ số/biểu thức, tách bằng dấu phẩy. */
const argParts = (arg: string | undefined): string[] =>
  (arg ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x.length > 0);

/** Chỉ số phương trình hợp lệ trong một hệ. */
function equationAt(node: Expr & { k: 'sys' }, raw: string | undefined): Expr | string {
  const i = Number(raw);
  if (!Number.isInteger(i) || i < 0 || i >= node.rels.length) {
    return `chỉ số phương trình phải trong 0..${node.rels.length - 1}, đang là "${raw ?? ''}"`;
  }
  return node.rels[i] as Expr;
}

/** Hiệu hai vế của một phương trình — vật mà mọi phép biến đổi hàng thật ra tác động lên. */
const sideDiff = (m: Minter, e: Expr & { k: 'rel' }): Expr =>
  add(m, [freshCopy(m, e.lhs).copy, negate(m, freshCopy(m, e.rhs).copy)]);

/** $E_i \leftarrow E_i + \lambda E_j$ — `arg` là `"i,j,λ"`. */
const addEquations: Rule = {
  id: 'add_equations',
  label: 'cộng hai phương trình',
  needsArg: true,
  accepts: ['sys'],
  run(m, node, arg) {
    if (node.k !== 'sys' || node.join !== 'and') return no('cần một hệ phương trình');
    const parts = argParts(arg);
    if (parts.length !== 3) return no('cần tham số dạng "0,1,2" — hàng đích, hàng nguồn, hệ số');

    const target = equationAt(node, parts[0]);
    const source = equationAt(node, parts[1]);
    if (typeof target === 'string') return no(target);
    if (typeof source === 'string') return no(source);
    if (parts[0] === parts[1]) return no('hai hàng phải khác nhau');
    if (target.k !== 'rel' || source.k !== 'rel') return no('cả hai phải là phương trình');
    if (target.op !== '=' || source.op !== '=') {
      return no('mới cộng được hai đẳng thức — cộng bất đẳng thức là chuyện khác');
    }
    const coef = tryParse(parts[2] as string, m);
    if ('error' in coef) return no(`hệ số không đọc được: ${coef.error}`);

    const scaled = (side: Expr): Expr =>
      add(m, [side, mul(m, [freshCopy(m, coef.expr).copy, freshCopy(m, side === target.lhs ? source.lhs : source.rhs).copy])]);
    const nextRel: Expr = {
      ...target,
      lhs: scaled(target.lhs),
      rhs: scaled(target.rhs),
    };
    const i = Number(parts[0]);

    return {
      after: { ...node, rels: node.rels.map((r, k) => (k === i ? nextRel : r)) },
      // `left` đọc ra từ hàng **mới**, `right` dựng từ hai hàng **cũ**. Cộng sai thì
      // đẳng thức này hỏng, và nó hỏng bằng một điểm cụ thể.
      claim: {
        left: sideDiff(m, nextRel as Expr & { k: 'rel' }),
        right: add(m, [
          sideDiff(m, target),
          mul(m, [freshCopy(m, coef.expr).copy, sideDiff(m, source)]),
        ]),
      },
    };
  },
};

/** $E_i \leftarrow \lambda E_i$ — `arg` là `"i,λ"`, và $\lambda \ne 0$ là điều kiện thật. */
const scaleEquation: Rule = {
  id: 'scale_equation',
  label: 'nhân một phương trình',
  needsArg: true,
  accepts: ['sys'],
  run(m, node, arg) {
    if (node.k !== 'sys' || node.join !== 'and') return no('cần một hệ phương trình');
    const parts = argParts(arg);
    if (parts.length !== 2) return no('cần tham số dạng "0,3" — hàng, hệ số');

    const target = equationAt(node, parts[0]);
    if (typeof target === 'string') return no(target);
    if (target.k !== 'rel') return no('phải là một phương trình');
    if (target.op !== '=') return no('mới nhân được đẳng thức — bất đẳng thức phải xét dấu');
    const coef = tryParse(parts[1] as string, m);
    if ('error' in coef) return no(`hệ số không đọc được: ${coef.error}`);
    if (definitelyNonZero(coef.expr) === false && varsOf(coef.expr).size === 0) {
      return no('nhân một phương trình với 0 làm mất thông tin');
    }

    const nextRel: Expr = {
      ...target,
      lhs: mul(m, [coef.expr, target.lhs]),
      rhs: mul(m, [freshCopy(m, coef.expr).copy, target.rhs]),
    };
    const i = Number(parts[0]);
    return {
      after: { ...node, rels: node.rels.map((r, k) => (k === i ? nextRel : r)) },
      claim: {
        left: sideDiff(m, nextRel as Expr & { k: 'rel' }),
        right: mul(m, [freshCopy(m, coef.expr).copy, sideDiff(m, target)]),
      },
      condition: definitelyNonZero(coef.expr) ? undefined : conditionText(parts[1] as string),
      guard: definitelyNonZero(coef.expr)
        ? undefined
        : guardOf('!=0', () => coef.expr),
    };
  },
};

/** $E_i$ cho $x = t$, thế $t$ vào $E_j$ — `arg` là `"i,j"`. */
const substituteFrom: Rule = {
  id: 'substitute_from',
  label: 'thế từ một phương trình',
  needsArg: true,
  accepts: ['sys'],
  run(m, node, arg) {
    if (node.k !== 'sys' || node.join !== 'and') return no('cần một hệ phương trình');
    const parts = argParts(arg);
    if (parts.length !== 2) return no('cần tham số dạng "0,1" — hàng cho ẩn, hàng nhận');

    const source = equationAt(node, parts[0]);
    const target = equationAt(node, parts[1]);
    if (typeof source === 'string') return no(source);
    if (typeof target === 'string') return no(target);
    if (parts[0] === parts[1]) return no('hai hàng phải khác nhau');
    if (source.k !== 'rel' || target.k !== 'rel') return no('cả hai phải là phương trình');
    // Nguồn phải **đã cô lập một ẩn**. Đây là chỗ có răng nhất của luật: thế một thứ
    // không phải ràng buộc là cách nhanh nhất làm hỏng một hệ, và cửa này chặn nó bằng
    // cấu trúc chứ không bằng lời hứa.
    //
    // "Một ẩn" gồm cả **một số hạng dãy có chỉ số cụ thể** (M71): $a_1 = 3$ ràng buộc
    // đúng một giá trị, y hệt $x = 3$, và bài dãy số nào cũng bắt đầu bằng một dòng
    // như thế. Chỉ số phải **đóng** — $a_k = 3$ với $k$ tự do là một câu về *mọi* $k$,
    // một phát biểu khác hẳn, và thế nó đi như một ẩn là đọc sai giả thiết.
    const lhs = source.lhs;
    const isSeq = lhs.k === 'ufn' && lhs.notation === 'sub' && varsOf(lhs).size === 0;
    if (source.op !== '=' || !(lhs.k === 'var' || isSeq)) {
      return no(`hàng ${parts[0]} phải có dạng "x = …" hoặc "a_1 = …" thì mới thế được`);
    }
    const name = lhs.k === 'var' ? lhs.name : toPlain(lhs);
    const holds = (e: Expr): boolean => {
      let found = false;
      walk(e, (n) => {
        if (same(n, lhs)) found = true;
      });
      return found;
    };
    if (holds(source.rhs)) return no(`vế phải vẫn còn ${name}`);
    if (!holds(target)) return no(`hàng ${parts[1]} không chứa ${name}`);

    /**
     * Một bản sao mới cho **từng** lần xuất hiện, không phải một bản dùng chung:
     * `substituteVar` trả về *cùng một object* tại mọi chỗ khớp, nên phương trình
     * đích chứa ẩn hai lần ($x^2 + x$) sẽ có nguyên cả cây thế nhân đôi danh
     * tính — đường sinh id trùng thứ hai, độc lập với lỗi default-case cũ của
     * `freshCopy`. Luật `substitute` đã làm đúng từ đầu; đây là chép lại kỷ luật
     * ấy, kèm ghi `dup` để trace nối phả hệ từng bản sao về nguồn.
     */
    const dup: Array<readonly [TermId, TermId]> = [];
    const put = (side: Expr, record: boolean): Expr => {
      const go = (e: Expr): Expr => {
        if (same(e, lhs)) {
          const { copy, pairs } = freshCopy(m, source.rhs);
          if (record) dup.push(...pairs);
          return copy;
        }
        // Tên bị một $\sum$ bên trong che: chỉ có nghĩa khi ẩn là một **biến trần**.
        // Một số hạng dãy không bao giờ bị che — nó không phải một tên để ràng buộc.
        if (lhs.k === 'var' && e.k === 'big' && e.v === name) {
          return { ...e, from: go(e.from), to: go(e.to) };
        }
        const kids = children(e).map(go);
        return kids.length === 0 ? e : withChildren(e, kids);
      };
      return go(side);
    };
    const nextRel: Expr = { ...target, lhs: put(target.lhs, true), rhs: put(target.rhs, true) };
    const j = Number(parts[1]);

    return {
      after: { ...node, rels: node.rels.map((r, k) => (k === j ? nextRel : r)) },
      dup,
      claim: {
        left: sideDiff(m, nextRel as Expr & { k: 'rel' }),
        // Cây claim không vẽ ra, nhưng nó vẫn là một cây — id trùng trong đó là
        // một cái bẫy gài sẵn cho walker tương lai, nên cũng sao chép từng lần.
        right: put(sideDiff(m, target), false),
      },
    };
  },
};

/** Bỏ một phương trình đã rút về $0 = 0$ — `arg` là chỉ số hàng. */
const dropEquation: Rule = {
  id: 'drop_equation',
  label: 'bỏ phương trình thừa',
  needsArg: true,
  accepts: ['sys'],
  run(m, node, arg) {
    if (node.k !== 'sys') return no('cần một hệ phương trình');
    if (node.rels.length <= 2) return no('hệ chỉ còn hai dòng — bỏ nữa thì không còn là hệ');
    const target = equationAt(node, argParts(arg)[0]);
    if (typeof target === 'string') return no(target);
    if (target.k !== 'rel' || target.op !== '=') return no('phải là một đẳng thức');
    if (!same(target.lhs, target.rhs)) {
      return no(`hai vế chưa giống nhau (${toPlain(target.lhs)} ≠ ${toPlain(target.rhs)})`);
    }
    const i = Number(argParts(arg)[0]);
    return {
      after: { ...node, rels: node.rels.filter((_, k) => k !== i) },
      // Khẳng định: hàng bị bỏ đúng là $0 = 0$, tức hiệu hai vế của nó **đồng nhất** $0$.
      // Bỏ một phương trình còn nội dung là mất nghiệm, nên cửa này phải có răng.
      claim: { left: sideDiff(m, target), right: int(m, 0) },
    };
  },
};

/* ---------- tổng và tích (M57) ---------- */

/**
 * Sáu luật cho $\sum$ và $\prod$.
 *
 * Cả sáu là **đồng nhất thức**, đi hợp đồng `sameValue` — nay chạy trên bộ bốc điểm số
 * nguyên của M56, vì $\sum$ chỉ khai được khi hai cận là số nguyên. Đó là cổ tức của
 * việc M56 dựng một *sân* chứ không một *câu hỏi*: M57 không phải khai thêm gì.
 *
 * Chỗ phải cẩn thận ở mọi luật dưới đây là **phạm vi**: biến chỉ số bị ràng buộc, nên
 * mọi phép thế phải đi qua `substituteVar` (tôn trọng che tên) chứ không đi qua một
 * phép duyệt cây trần.
 */

/** Thân có nhắc tới biến chỉ số không. */
const usesIndex = (e: Expr & { k: 'big' }): boolean => varsOf(e.body).has(e.v);

/**
 * Thay biến chỉ số bằng một giá trị, **cấp danh tính mới cho từng chỗ thay**.
 *
 * `substituteVar` dùng lại *cùng một* nút ở mọi vị trí, và điều đó đúng cho một phép so
 * cấu trúc nhưng sai cho một cây sắp đem vẽ: một nút có hai chỗ đứng thì choreography
 * kéo nó về một chỗ (bài học M47). Nên mỗi lần thay là một `freshCopy`.
 */
function replaceIndex(m: Minter, body: Expr, name: string, value: Expr): Expr {
  const go = (e: Expr): Expr => {
    if (e.k === 'var' && e.name === name) return freshCopy(m, value).copy;
    // Tên bị che bởi một tổng bên trong: dừng, chỉ đi tiếp vào hai cận.
    if (e.k === 'big' && e.v === name) return { ...e, from: go(e.from), to: go(e.to) };
    const kids = children(e).map(go);
    if (kids.length === 0) return e;
    // Luỹ thừa **thoái hoá** thì dựng lại qua hàm dựng, không qua `withChildren`.
    //
    // `pow()` chuẩn hoá $x^1 \to x$ và $x^0 \to 1$, và mọi luật khác đều đi qua nó. Đi
    // vòng ở đây thì `sum_expand` trên $\sum_{k=0}^{3} x^k$ cho ra `x^0 + x^1 + x^2 +
    // x^3` — đúng về giá trị, nhưng hai hạng tử đầu là thứ không ai viết.
    //
    // Chỉ đi vòng khi số mũ **thật sự** thành $0$ hay $1$: `pow()` cấp danh tính mới,
    // mà `data-el` trong SVG *là* `TermId`, nên gọi nó ở mọi nút luỹ thừa thì golden
    // đổi ở những chỗ hình không đổi một nét. Nút nào thoái hoá thì nó biến mất thật —
    // ở đó danh tính mới là đúng chuyện đang xảy ra.
    const exp = kids[1];
    if (e.k === 'pow' && exp !== undefined && exp.k === 'int' && (exp.v === 0 || exp.v === 1)) {
      return pow(m, kids[0] as Expr, exp);
    }
    return withChildren(e, kids);
  };
  return go(body);
}

/** Số hạng của một khoảng: $b - a + 1$. */
const spanOf = (m: Minter, from: Expr, to: Expr): Expr =>
  add(m, [freshCopy(m, to).copy, negate(m, freshCopy(m, from).copy), int(m, 1)]);

/** $\sum_{k=a}^{b} c = (b-a+1)c$ và $\prod_{k=a}^{b} c = c^{\,b-a+1}$ khi $c$ không có $k$. */
const sumConst: Rule = {
  id: 'sum_const',
  label: 'thân không phụ thuộc chỉ số',
  run(m, node) {
    if (node.k !== 'big') return no('cần một tổng hoặc một tích');
    // Cùng nguyên tắc ∞ đã tuyên bố ở `sum_shift`/`sum_expand`: `spanOf` dựng
    // $b - a + 1$, và với $b = \infty$ nó vẽ ra nguyên văn "(inf + 0 + 1)·c" —
    // số học với ∞ mà M68 cấm. Đây từng là entry bị bỏ sót trong cùng bảng.
    // Lời từ chối là nội dung: vô hạn bản sao của một hằng khác 0 không có tổng.
    if (node.from.k === 'inf' || node.to.k === 'inf') {
      return no('khoảng vô hạn không có "số hạng tử" — không rút gọn kiểu (b − a + 1)·c được');
    }
    if (usesIndex(node)) return no(`thân còn chứa chỉ số ${node.v}`);
    const span = spanOf(m, node.from, node.to);
    return {
      after: node.op === 'sum' ? mul(m, [span, node.body]) : pow(m, node.body, span),
    };
  },
};

/**
 * Tính **tuyến tính** của tổng — hai hình dạng, một tính chất.
 *
 * Rút thừa số hằng ra ngoài ($\sum c\,f = c\sum f$), và tách tổng của tổng
 * ($\sum (f+g) = \sum f + \sum g$). Không áp cho $\prod$: ở đó hai hình dạng ấy là hai
 * tính chất khác nhau, và gộp chúng dưới một cái tên là nói dối về nội dung.
 */
const sumLinear: Rule = {
  id: 'sum_linear',
  label: 'tính tuyến tính của tổng',
  run(m, node) {
    if (node.k !== 'big') return no('cần một tổng');
    if (node.op !== 'sum') return no('tính chất này của tổng, không của tích');

    if (node.body.k === 'mul') {
      const outside = node.body.args.filter((a) => !varsOf(a).has(node.v));
      const inside = node.body.args.filter((a) => varsOf(a).has(node.v));
      if (outside.length === 0) return no('không thừa số nào rời khỏi chỉ số được');
      if (inside.length === 0) return no('cả thân không phụ thuộc chỉ số — dùng `sum_const`');
      return {
        after: mul(m, [
          ...outside,
          big(m, 'sum', node.v, node.from, node.to, mul(m, inside)),
        ]),
      };
    }

    if (node.body.k === 'add') {
      const parts = node.body.args.map((a, i) =>
        i === 0
          ? big(m, 'sum', node.v, node.from, node.to, a)
          : big(
              m,
              'sum',
              node.v,
              freshCopy(m, node.from).copy,
              freshCopy(m, node.to).copy,
              a,
            ),
      );
      return { after: add(m, parts) };
    }

    return no('thân phải là một tích hoặc một tổng');
  },
};

/** $\sum_{k=a}^{b} = \sum_{k=a}^{m} + \sum_{k=m+1}^{b}$ — `arg` là chỗ cắt $m$. */
const sumSplit: Rule = {
  id: 'sum_split',
  label: 'tách tổng tại một chỉ số',
  needsArg: true,
  accepts: ['big'],
  run(m, node, arg) {
    if (node.k !== 'big') return no('cần một tổng hoặc một tích');
    if (arg === undefined) return no('cần chỗ cắt, ví dụ "3"');
    const cut = tryParse(arg, m);
    if ('error' in cut) return no(`chỗ cắt không đọc được: ${cut.error}`);
    if (varsOf(cut.expr).has(node.v)) return no(`chỗ cắt không được chứa chỉ số ${node.v}`);

    // **Hai** điều kiện, và cả hai đều có răng: engine bắt được bước sai ở $n = 1$ khi
    // chỗ cắt $3$ nằm ngoài khoảng $[1, 1]$ — nửa sau thành khoảng rỗng ($0$ với tổng)
    // trong khi nửa đầu đã ăn quá tay. Đây chính là ca buộc `guard` phải nhận số nhiều.
    const guard: Guards = [
      guardOf('>=0', (g) => add(g, [node.to, negate(g, cut.expr)])),
      guardOf('>=0', (g) => add(g, [cut.expr, negate(g, node.from), int(g, 1)])),
    ];
    const second = freshCopy(m, cut.expr);
    return {
      guard,
      condition: `${toPlain(node.from)} − 1 ≤ ${toPlain(cut.expr)} ≤ ${toPlain(node.to)}`,
      after: (node.op === 'sum' ? add : mul)(m, [
        big(m, node.op, node.v, node.from, cut.expr, node.body),
        big(
          m,
          node.op,
          node.v,
          add(m, [second.copy, int(m, 1)]),
          freshCopy(m, node.to).copy,
          freshCopy(m, node.body).copy,
        ),
      ]),
      dup: second.pairs,
    };
  },
};

/**
 * Đổi biến chỉ số: $\sum_{k=a}^{b} f(k) = \sum_{k=a+c}^{b+c} f(k-c)$. `arg` là $c$.
 *
 * Đặt $j = k + c$ rồi gọi lại biến mới là $k$ — đó là cách người ta viết tay, và nó giữ
 * cho `at` của bước sau không phải đổi theo.
 */
const sumShift: Rule = {
  id: 'sum_shift',
  label: 'đổi biến chỉ số',
  needsArg: true,
  accepts: ['big'],
  run(m, node, arg) {
    if (node.k !== 'big') return no('cần một tổng hoặc một tích');
    if (arg === undefined) return no('cần lượng dịch, ví dụ "1"');
    const shift = tryParse(arg, m);
    if ('error' in shift) return no(`lượng dịch không đọc được: ${shift.error}`);
    if (varsOf(shift.expr).has(node.v)) return no(`lượng dịch không được chứa chỉ số ${node.v}`);

    const back = add(m, [variable(m, node.v), negate(m, freshCopy(m, shift.expr).copy)]);
    // $\infty + c = \infty$ (M68). Không phải một phép cộng — `add` với một nút `inf`
    // sẽ dựng ra $\infty + 1$ và in ra hình đúng như thế, một câu vô nghĩa. Cận vô hạn
    // **giữ nguyên**, và đó là toàn bộ số học với $\infty$ mà engine này có.
    const move = (bound: Expr): Expr =>
      bound.k === 'inf' ? bound : add(m, [bound, freshCopy(m, shift.expr).copy]);
    return {
      after: big(
        m,
        node.op,
        node.v,
        move(node.from),
        move(node.to),
        replaceIndex(m, node.body, node.v, back),
      ),
    };
  },
};

/**
 * Viết hết ra khi hai cận là số — **cầu nối** duy nhất từ $\sum$ về `add` thường.
 *
 * Không có nó thì $\sum$ là một ốc đảo: cả 47 luật cũ đều không áp được vào một nút
 * `big`. Trần sáu hạng tử vì bảy trở lên thì dòng vượt trần bề ngang, và để trần kích
 * thước từ chối thì đúng phân công hơn là dựng thêm một trần ở đây (bài học M50 tầng C).
 */
const sumExpand: Rule = {
  id: 'sum_expand',
  label: 'viết hết các hạng tử',
  run(m, node) {
    if (node.k !== 'big') return no('cần một tổng hoặc một tích');
    // Lời từ chối **là nội dung**: người học vừa gặp $\infty$ lần đầu, và câu trả lời
    // đúng cho "viết hết ra xem nào" chính là *không viết hết được*.
    if (node.to.k === 'inf') return no('không viết hết được vô hạn hạng tử — dùng luật chuỗi hình học');
    if (node.from.k !== 'int' || node.to.k !== 'int') return no('hai cận phải là số nguyên');
    const count = node.to.v - node.from.v + 1;
    if (count <= 0) return no('khoảng rỗng — không có hạng tử nào');
    if (count > 6) return no(`${count} hạng tử, quá 6 — hãy tách bớt trước`);

    const terms = Array.from({ length: count }, (_, i) =>
      replaceIndex(m, freshCopy(m, node.body).copy, node.v, int(m, (node.from as Expr & { k: 'int' }).v + i)),
    );
    return { after: (node.op === 'sum' ? add : mul)(m, terms) };
  },
};

/**
 * $\prod_{k=a}^{b} \dfrac{f(k+1)}{f(k)} = \dfrac{f(b+1)}{f(a)}$ — tích lồng nhau triệt tiêu.
 *
 * Nhận dạng bằng **cấu trúc**, không bằng mẫu chuỗi: tử phải đúng bằng mẫu sau khi thay
 * $k \to k+1$. Xác định, và không có ca nào nó "gần đúng".
 */
const prodTelescope: Rule = {
  id: 'prod_telescope',
  label: 'tích triệt tiêu dây chuyền',
  run(m, node) {
    if (node.k !== 'big' || node.op !== 'prod') return no('cần một tích');
    if (node.body.k !== 'div') return no('thân phải là một phân số');
    const { num, den } = node.body;

    const probe = new Minter();
    const shifted = replaceIndex(probe, den, node.v, add(probe, [variable(probe, node.v), int(probe, 1)]));
    if (!same(num, shifted)) return no('tử không phải là mẫu với chỉ số lùi một bậc');

    return {
      after: div(
        m,
        replaceIndex(m, freshCopy(m, den).copy, node.v, add(m, [freshCopy(m, node.to).copy, int(m, 1)])),
        replaceIndex(m, freshCopy(m, den).copy, node.v, freshCopy(m, node.from).copy),
      ),
    };
  },
};

/**
 * $\sum_{k=a}^{b} \bigl(f(k+1) - f(k)\bigr) = f(b+1) - f(a)$ — tổng triệt tiêu dây
 * chuyền (M71, AL-18).
 *
 * Anh em còn thiếu của `prod_telescope`, và mãi tới đây mới làm được vì trước M71 vế
 * phải **không viết ra được**: $a_{n+1}$ cần chỉ số là một `Expr`.
 *
 * Nhận dạng bằng **cấu trúc** như `prod_telescope`: thân phải là một hiệu hai hạng
 * tử, và số bị trừ phải đúng bằng số trừ sau khi thay $k \to k+1$. Không đoán, không
 * khớp mẫu chuỗi — nên không có ca nào nó "gần đúng".
 *
 * Chiều **ngược** không có. $f(b+1) - f(a)$ nhìn thấy được ở mọi cặp biểu thức, và
 * dựng ra một tổng từ đó là bịa cho người học một bước họ không nghĩ ra.
 */
const sumTelescope: Rule = {
  id: 'sum_telescope',
  label: 'tổng triệt tiêu dây chuyền',
  run(m, node) {
    if (node.k !== 'big' || node.op !== 'sum') return no('cần một tổng');
    if (node.from.k === 'inf' || node.to.k === 'inf') {
      return no('khoảng vô hạn không triệt tiêu về hai đầu — không có "số hạng cuối"');
    }
    if (node.body.k !== 'add' || node.body.args.length !== 2) {
      return no('thân phải là một hiệu hai hạng tử');
    }
    // Hạng tử nào mang dấu trừ: `a - b` là `add[a, mul[-1, b]]`, nên số trừ là hạng
    // tử **có** dạng ấy. Thử cả hai vị trí — `-f(k) + f(k+1)` cũng là cùng một hiệu.
    const [p, q] = node.body.args as [Expr, Expr];
    const split = (plus: Expr, minus: Expr): readonly [Expr, Expr] | null => {
      if (minus.k !== 'mul' || minus.args.length !== 2) return null;
      const [c, inner] = minus.args as [Expr, Expr];
      if (!(c.k === 'int' && c.v === -1)) return null;
      return [plus, inner] as const;
    };
    const pair = split(p, q) ?? split(q, p);
    if (pair === null) return no('thân phải là một hiệu hai hạng tử');
    const [ahead, behind] = pair;

    const probe = new Minter();
    const shifted = replaceIndex(
      probe,
      behind,
      node.v,
      add(probe, [variable(probe, node.v), int(probe, 1)]),
    );
    if (!same(ahead, shifted)) return no('số bị trừ không phải số trừ với chỉ số tiến một bậc');

    return {
      after: add(m, [
        replaceIndex(
          m,
          freshCopy(m, behind).copy,
          node.v,
          add(m, [freshCopy(m, node.to).copy, int(m, 1)]),
        ),
        negate(
          m,
          replaceIndex(m, freshCopy(m, behind).copy, node.v, freshCopy(m, node.from).copy),
        ),
      ]),
    };
  },
};

/* ---------- trích hệ số: hàm sinh tầng hai (M72, AL-19) ---------- */

/** Số nguyên hằng của một cây, hoặc `null`. */
function constExp(e: Expr): number | null {
  const v = evalReal(e, new Map());
  return v !== null && Number.isInteger(v) ? v : null;
}

/**
 * $\dfrac{1}{(1-v)^m}$ với $m \ge 1$ nguyên — nhận dạng dùng chung.
 *
 * Trả `m`, hoặc `null`. Nhận cả dạng không có số mũ ($m = 1$).
 */
function repeatedGeometric(e: Expr, v: string): number | null {
  if (e.k !== 'div') return null;
  if (constExp(e.num) !== 1) return null;
  const [base, m] = e.den.k === 'pow' ? [e.den.base, constExp(e.den.exp)] : [e.den, 1];
  if (m === null || m < 1) return null;
  // $1 - v$ dựng bằng `add[1, (-1)·v]` — engine không có nút `sub` (§3.1).
  if (base.k !== 'add' || base.args.length !== 2) return null;
  const [p, q] = base.args as [Expr, Expr];
  const one = constExp(p) === 1 ? q : constExp(q) === 1 ? p : null;
  if (one === null) return null;
  if (one.k !== 'mul' || one.args.length !== 2) return null;
  const [c, x] = one.args as [Expr, Expr];
  if (!(c.k === 'int' && c.v === -1)) return null;
  return x.k === 'var' && x.name === v ? m : null;
}

/**
 * **Tích chập Cauchy**: $[x^n](F \cdot G) = \sum_{i=0}^{n} \bigl([x^i]F\bigr)
 * \bigl([x^{n-i}]G\bigr)$ — luật trung tâm của chuyên đề hàm sinh (M72).
 *
 * Đây là chỗ hai thế giới gặp nhau: **nhân hai hàm sinh** ở vế trái là một phép đại
 * số, còn **cộng theo mọi cách chia $n$ thành hai phần** ở vế phải là một phép đếm.
 * Mọi bài "có bao nhiêu cách…" giải bằng hàm sinh đều đi qua đúng dòng này.
 *
 * Tích nhiều hơn hai thừa số thì cắt **thừa số đầu** ra, phần còn lại gộp lại: áp
 * liên tiếp cho ra tích chập nhiều tầng, và mỗi lần áp là **một dòng trên hình** —
 * đúng kỷ luật "không luật nào nhảy nhiều bước".
 */
const coeffOfProduct: Rule = {
  id: 'coeff_of_product',
  label: 'tích chập hai hàm sinh',
  run(m, node) {
    if (node.k !== 'coeff') return no('cần một chỗ trích hệ số');
    if (node.of.k !== 'mul' || node.of.args.length < 2) return no('phải trích hệ số của một tích');
    const [head, ...rest] = node.of.args as [Expr, ...Expr[]];
    const tail = rest.length === 1 ? (rest[0] as Expr) : mul(m, rest);

    // Chỉ số chạy phải khác **cả** biến chuỗi: $[x^n]$ ràng buộc $x$, nên `varsOf`
    // không kể nó, và dùng lại đúng tên ấy là bắt một biến đang bị che.
    const i = freshIndex(node, new Set([node.v]));

    return {
      after: big(
        m,
        'sum',
        i,
        int(m, 0),
        freshCopy(m, node.at).copy,
        mul(m, [
          { k: 'coeff', v: node.v, at: variable(m, i), of: head, id: m.next() },
          {
            k: 'coeff',
            v: node.v,
            at: add(m, [freshCopy(m, node.at).copy, negate(m, variable(m, i))]),
            of: tail,
            id: m.next(),
          },
        ]),
      ),
    };
  },
};

/**
 * Tính **tuyến tính** của phép trích: $[x^n](F + G) = [x^n]F + [x^n]G$, và hằng số
 * rời khỏi dấu ngoặc vuông.
 *
 * Hai hình dạng một tính chất, đúng khuôn `sum_linear`. "Hằng" ở đây nghĩa là
 * **không chứa biến chuỗi** — $n$ được phép có mặt, và điều đó đúng: $n$ đứng ngoài
 * phạm vi ràng buộc của $[x^{\cdot}]$.
 */
const coeffLinear: Rule = {
  id: 'coeff_linear',
  label: 'tính tuyến tính của phép trích',
  run(m, node) {
    if (node.k !== 'coeff') return no('cần một chỗ trích hệ số');

    if (node.of.k === 'mul') {
      const outside = node.of.args.filter((a) => !varsOf(a).has(node.v));
      const inside = node.of.args.filter((a) => varsOf(a).has(node.v));
      if (outside.length === 0) return no(`không thừa số nào rời khỏi ${node.v} được`);
      if (inside.length === 0) return no(`cả tích không chứa ${node.v} — dùng \`coeff_const\``);
      return {
        after: mul(m, [
          ...outside,
          { k: 'coeff', v: node.v, at: node.at, of: mul(m, inside), id: m.next() } as Expr,
        ]),
      };
    }

    if (node.of.k === 'add') {
      return {
        after: add(
          m,
          node.of.args.map(
            (a, k) =>
              ({
                k: 'coeff',
                v: node.v,
                at: k === 0 ? node.at : freshCopy(m, node.at).copy,
                of: a,
                id: m.next(),
              }) as Expr,
          ),
        ),
      };
    }

    return no('thân phải là một tổng hoặc một tích');
  },
};

/**
 * $[x^n]\bigl(x^d \cdot F\bigr) = [x^{n-d}]F$ — dịch bậc.
 *
 * Điều kiện **$n \ge d$** là thật, không phải thủ tục: dưới đó vế trái bằng $0$ còn
 * vế phải là một bậc âm, thứ không tồn tại. Khai bằng `guard` chứ không chỉ bằng
 * chữ, nên bộ kiểm bỏ đúng những điểm ấy thay vì im lặng trượt qua chúng.
 */
const coeffShift: Rule = {
  id: 'coeff_shift',
  label: 'dịch bậc trích',
  run(m, node) {
    if (node.k !== 'coeff') return no('cần một chỗ trích hệ số');
    if (node.of.k !== 'mul') return no('phải trích hệ số của một tích');

    const degreeOf = (a: Expr): number | null => {
      if (a.k === 'var' && a.name === node.v) return 1;
      if (a.k !== 'pow' || a.base.k !== 'var' || a.base.name !== node.v) return null;
      return intExp(a);
    };
    const at = node.of.args.findIndex((a) => degreeOf(a) !== null);
    if (at < 0) return no(`không thừa số nào là một luỹ thừa của ${node.v}`);
    const d = degreeOf(node.of.args[at] as Expr) as number;
    if (d < 1) return no('số mũ phải dương');
    const rest = node.of.args.filter((_, k) => k !== at);
    if (rest.length === 0) return no('còn mỗi luỹ thừa — không còn gì để trích');

    return {
      guard: guardOf('>=0', (g) => add(g, [node.at, int(g, -d)])),
      condition: `${toPlain(node.at)} ≥ ${d}`,
      after: {
        k: 'coeff',
        v: node.v,
        at: add(m, [freshCopy(m, node.at).copy, int(m, -d)]),
        of: rest.length === 1 ? (rest[0] as Expr) : mul(m, rest),
        id: m.next(),
      } as Expr,
    };
  },
};

/**
 * **Chia kẹo**: $[x^n]\dfrac{1}{(1-x)^m} = \dbinom{n+m-1}{m-1}$.
 *
 * Một dòng, và nó *là* bài toán chia $n$ vật giống nhau cho $m$ người — "stars and
 * bars" viết bằng hàm sinh. Engine kiểm nó như kiểm mọi đẳng thức khác: bốc $n$
 * nguyên, khai chuỗi tới bậc ấy, so với $\binom{n+m-1}{m-1}$ tính trên bộ nguyên
 * của M56. Không có một dòng mã nào riêng cho "hằng đẳng thức đã biết".
 *
 * $m$ phải là **hằng nguyên** $\ge 1$: với $m$ ký hiệu thì không khai chuỗi được ở
 * bất kỳ bậc nào, và luật sẽ dựng một dòng mà bộ kiểm chỉ biết nói "chưa kiểm được".
 */
const coeffRepeatedGeometric: Rule = {
  id: 'coeff_repeated_geometric',
  label: 'hệ số của 1/(1−x)^m',
  run(m, node) {
    if (node.k !== 'coeff') return no('cần một chỗ trích hệ số');
    const deg = repeatedGeometric(node.of, node.v);
    if (deg === null) return no(`thân phải có dạng 1/(1 − ${node.v})^m với m nguyên ≥ 1`);
    // $m = 1$ cho $\binom{n+0}{0}$ — đúng, và không ai viết `+ 0`. Dựng thẳng.
    const upper =
      deg === 1 ? freshCopy(m, node.at).copy : add(m, [freshCopy(m, node.at).copy, int(m, deg - 1)]);
    return { after: fn(m, 'binom', [upper, int(m, deg - 1)]) };
  },
};

/**
 * $\sum_{k=0}^{\infty} x^k = \dfrac{1}{1-x}$ — **hai chiều** (M68, AL-16).
 *
 * Luật duy nhất của mục này, và nó cố ý hẹp: cơ số phải là **một biến trần**, cận dưới
 * phải là $0$, số mũ phải là **chính chỉ số**. Không nhận $\sum (2x)^k$, không nhận
 * $\sum_{k=1}^{\infty}$, không nhận $\sum a r^k$.
 *
 * Hẹp vì mỗi lần nới là một lần phải kể lại chuyện hội tụ. $\sum_{k=1}^{\infty} x^k$
 * bằng $\dfrac{x}{1-x}$, $\sum (2x)^k$ bằng $\dfrac{1}{1-2x}$ với $|x| < \frac12$ —
 * mỗi biến thể một điều kiện khác, và một luật nhận cả họ sẽ in ra một điều kiện đúng
 * cho ca này và sai cho ca kia. Người học cần biến thể khác thì đi qua `sum_shift` và
 * `sum_linear`, và mỗi bước ấy **hiện ra trên hình**.
 *
 * Điều kiện $|x| < 1$ là **chữ**, không phải `Guard`: sân chuỗi không bốc điểm nào nên
 * không có điểm nào để loại. Nó là một phát biểu về *khi nào đẳng thức số học có nghĩa*,
 * trong khi thứ engine vừa kiểm là đẳng thức **hình thức** — hai chuyện khác nhau, và
 * nói rõ chỗ khác nhau ấy chính là phần dạy học.
 */
const geometricSeries: Rule = {
  id: 'geometric_series',
  label: 'chuỗi hình học',
  run(m, node) {
    // Chiều xuôi: $\sum_{k=0}^{\infty} x^k \to \dfrac{1}{1-x}$.
    if (node.k === 'big') {
      if (node.op !== 'sum') return no('cần một tổng, không phải một tích');
      if (node.to.k !== 'inf') return no('cận trên phải là ∞');
      if (!(node.from.k === 'int' && node.from.v === 0)) return no('cận dưới phải là 0');
      if (node.body.k !== 'pow') return no('thân phải là một luỹ thừa');
      if (node.body.base.k !== 'var') return no('cơ số phải là một biến');
      if (!(node.body.exp.k === 'var' && node.body.exp.name === node.v)) {
        return no(`số mũ phải là chính chỉ số ${node.v}`);
      }
      const x = node.body.base;
      return {
        after: div(m, int(m, 1), add(m, [int(m, 1), negate(m, x)])),
        condition: `|${toPlain(x)}| < 1`,
      };
    }

    // Chiều ngược: $\dfrac{1}{1-x} \to \sum_{k=0}^{\infty} x^k$.
    if (node.k !== 'div') return no('cần một tổng vô hạn hoặc một phân số');
    if (!(node.num.k === 'int' && node.num.v === 1)) return no('tử phải là 1');
    const den = node.den;
    if (den.k !== 'add' || den.args.length !== 2) return no('mẫu phải có dạng 1 − x');
    const [one, rest] = den.args as [Expr, Expr];
    if (!(one.k === 'int' && one.v === 1)) return no('mẫu phải bắt đầu bằng 1');
    if (!(rest.k === 'mul' && rest.args.length === 2)) return no('mẫu phải có dạng 1 − x');
    const [neg, x] = rest.args as [Expr, Expr];
    if (!(neg.k === 'int' && neg.v === -1)) return no('mẫu phải có dạng 1 − x');
    if (x.k !== 'var') return no('phải là 1 − (một biến)');

    // Chỉ số mới: một tên chưa dùng, để không che biến nào (bài học M57).
    const k = freshIndex(x);
    return {
      after: big(m, 'sum', k, int(m, 0), infinity(m), pow(m, x, variable(m, k))),
      condition: `|${toPlain(x)}| < 1`,
    };
  },
};

export const RULES: readonly Rule[] = [
  geometricSeries,
  specialize,
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
  divideByLinearFactor,
  factorialStep,
  binomToFactorial,
  binomSymmetry,
  pascal,
  binomAbsorb,
  sumConst,
  sumLinear,
  sumSplit,
  sumShift,
  sumExpand,
  sumTelescope,
  coeffOfProduct,
  coeffLinear,
  coeffShift,
  coeffRepeatedGeometric,
  prodTelescope,
  powSplit,
  addEquations,
  scaleEquation,
  substituteFrom,
  dropEquation,
  absToInterval,
  intervalFromFactors,
  mergeIntervals,
  logProduct,
  logQuotient,
  logPower,
  logChangeBase,
  expLog,
  logExp,
  pythagoreanIdentity,
  doubleAngle,
  sumToProduct,
  productToSum,
  logBothSides,
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

/**
 * Luật cần tham số có **thể** áp được ở đây không — cho ba luật không quy về kiểu nút.
 *
 * Mặc định `false`, không phải `true`. Trước M65 nó là `true`, và một luật mới thêm
 * vào sẽ tự động hiện trên bảng nước đi ở **mọi** nút — sai theo hướng ồn ào. Nay một
 * luật mới bị **giấu** cho tới khi ai đó khai, và chốt canh
 * `mọi luật cần tham số phải khai chỗ nó áp được` bắt ngay chuyện đó. Sai theo hướng
 * im lặng nhưng có người canh, đổi lấy sai theo hướng ồn ào mà không ai canh.
 */
export const ARG_RULE_PREDICATES: Readonly<Record<string, (node: Expr) => boolean>> = {
  // Đặt ẩn phụ và thay giá trị: cần **có biến** để mà thay.
  set_variable: hasVariable,
  evaluate_at: hasVariable,
  specialize: hasVariable,
  substitute: hasVariable,
  // Chia đa thức: cần chính nó là một đa thức một biến bậc ≥ 1.
  divide_by_linear_factor: (node) => {
    const poly = univariate(node);
    return typeof poly !== 'string' && Math.max(...[...poly.coefs.keys()]) >= 1;
  },
};

function hasVariable(node: Expr): boolean {
  let has = false;
  walk(node, (n) => {
    if (n.k === 'var') has = true;
  });
  return has;
}

function couldTakeArg(r: Rule, node: Expr): boolean {
  if (r.accepts !== undefined) return r.accepts.includes(node.k);
  return ARG_RULE_PREDICATES[r.id]?.(node) ?? false;
}

/** Chỉ để test đọc được: dựng một biến nhanh. */
export const v = (m: Minter, name: string): Expr => variable(m, name);
