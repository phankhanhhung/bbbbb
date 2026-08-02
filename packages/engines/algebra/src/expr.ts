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

export type RelOp = '=' | '<' | '<=' | '>' | '>=' | '!=';

/** Đổi chiều bất đẳng thức — nhân hai vế với số âm thì bắt buộc. */
export const flipOp = (op: RelOp): RelOp =>
  op === '<' ? '>' : op === '<=' ? '>=' : op === '>' ? '<' : op === '>=' ? '<=' : op;

interface WithId {
  readonly id: TermId;
}

export type Expr =
  | ({ readonly k: 'int'; readonly v: number } & WithId)
  | ({ readonly k: 'rat'; readonly p: number; readonly q: number } & WithId)
  | ({ readonly k: 'var'; readonly name: string } & WithId)
  /**
   * Vô cực — **nguyên tử**, không phải một số (M68, AL-16).
   *
   * Có vì hàm sinh cần cận vô hạn: $\sum_{k=0}^{\infty} x^k$ là câu mở đầu của cả
   * chuyên đề, và viết nó bằng một cận hữu hạn lớn là nói dối về thứ đang được nói.
   *
   * **Nó không có giá trị.** `evalAt` và `evalReal` trả `null`, `totalDegree` trả
   * `Infinity`. Nghĩa là mọi biểu thức chứa nó **không kiểm được** trên ba sân cũ —
   * và chúng nói ra điều đó (`verified: false`) thay vì giả vờ xanh. Chỉ sân thứ tư
   * (`series.ts`) mới trả lời được, và nó trả lời bằng **hệ số**, không bằng điểm.
   *
   * Không phải một `var` tên `"inf"`: một biến thì bốc điểm được, và bốc một điểm cho
   * $\infty$ là chỗ mọi thứ bắt đầu nói dối. Kiểu nút riêng thì mọi `switch` trong
   * repo phải khai nó xử lý ra sao — và đó chính là cái giá đáng trả.
   */
  | ({ readonly k: 'inf' } & WithId)
  | ({ readonly k: 'add'; readonly args: readonly Expr[] } & WithId)
  | ({ readonly k: 'mul'; readonly args: readonly Expr[] } & WithId)
  /**
   * Luỹ thừa. Số mũ là một **`Expr`**, không phải số nguyên.
   *
   * Bản đầu khai `exp: number` và đặc tả §16 gọi đó là giới hạn cố ý. Lời khai ấy sai
   * với chương trình học: $x^{1/2}$, $x^{2/3}$ là lớp 11–12, $x^{\sqrt 2}$ là bậc đại
   * học, và $x^n$ thì có mặt từ lớp 8. Đổi được rẻ vì cây `Expr` **chưa bao giờ được
   * serialize** — `start` và `arg` trong scene là chuỗi — nên không có migration nào.
   *
   * Luật nào cần số nguyên thì hỏi qua {@link intExp} và từ chối khi `null`.
   */
  | ({ readonly k: 'pow'; readonly base: Expr; readonly exp: Expr } & WithId)
  | ({ readonly k: 'div'; readonly num: Expr; readonly den: Expr } & WithId)
  /**
   * Căn bậc `index` (≥ 2). Chỉ số là **số nguyên**, không phải `Expr`: căn bậc ký hiệu
   * kéo theo cả một tầng suy luận về miền mà không luật phổ thông nào gói gọn được.
   * Ai cần nó thì viết $x^{1/n}$ — số mũ đã là `Expr`.
   *
   * Không chuẩn hoá thành `pow(x, 1/2)`: dấu căn là một **vật thể thị giác** có bố cục
   * riêng (móc, vạch trùm), hệt lý do `div` không bị chuẩn hoá thành `mul` với luỹ
   * thừa âm. Hai chiều đi lại giữa chúng là hai **luật có tên**, có dòng riêng trên
   * hình: `root_to_power` và `power_to_root`.
   */
  | ({ readonly k: 'root'; readonly index: number; readonly arg: Expr } & WithId)
  /**
   * Giá trị tuyệt đối.
   *
   * Có vì thiếu nó thì $\sqrt{x^2}$ **không rút được** — engine phải từ chối, và từ
   * chối một phép biến đổi có trong mọi sách giáo khoa là lỗ hổng nhìn thấy được.
   */
  | ({ readonly k: 'abs'; readonly arg: Expr } & WithId)
  /**
   * Lời gọi hàm — **một** biến thể cho cả họ, không một biến thể mỗi hàm.
   *
   * Mỗi kiểu nút mới phải đi qua sáu chỗ (`expr`, `parse`, `typeset`, `check`, `rules`,
   * và bảng ưu tiên), nên dựng `fact`, `binom`, `log`, `sin` thành bốn biến thể là trả
   * giá ấy bốn lần. Ở đây trả một lần: tên thuộc một union **đóng**, còn mọi thứ riêng
   * của từng hàm — arity, cách in, cách tính, miền xác định — nằm trong bảng ở
   * `functions.ts`. Hàm thứ bảy sau này là *một dòng bảng*.
   *
   * Union phải **đóng**: ngữ pháp mở thì printer không biết trước mình phải in những gì,
   * và đó là lý do parser không nhận hàm tuỳ ý ngay từ §3.3.
   */
  | ({ readonly k: 'fn'; readonly name: FnName; readonly args: readonly Expr[] } & WithId)
  /**
   * **Ký hiệu hàm không diễn giải** — $f$, $g$, $h$ của một phương trình hàm
   * (AL-17, M73).
   *
   * Khác `fn` ở đúng một chỗ, và chỗ ấy là tất cả: `fn` tra `FUNCTIONS` để biết
   * hàm *làm gì*; `ufn` thì **không có gì để tra**. $f$ là một hàm nào đó thoả
   * phương trình, và đi tìm xem nó có thể là hàm nào chính là cả bài toán.
   *
   * Vì thế nó là kiểu nút riêng chứ không phải một dòng thêm trong `FUNCTIONS`.
   * Nhét vào bảng ấy thì phải bịa một `evalNum`, mà mọi giá trị bịa ra đều biến
   * bộ bốc điểm thành cỗ máy nói dối. Kiểu riêng thì **mọi** `switch` trong repo
   * phải khai nó xử lý ra sao — đúng cái giá mà `inf` đã trả ở M68, và đúng lý do
   * để trả.
   *
   * Tên là chữ tác giả gõ chứ không phải một tập đóng: bài này dùng $f$, bài kia
   * dùng $f$ và $g$ cùng lúc. Ràng buộc duy nhất là **một chữ cái**, để $f(x)$
   * không đọc nhầm thành tích $f \cdot (x)$.
   *
   * `notation` phân biệt $f(x)$ với $a_n$ — và đó là **toàn bộ** chỗ khác nhau
   * giữa một hàm và một dãy (AL-18, M71). Một dãy *là* một hàm trên chỉ số; mọi
   * thứ bộ kiểm làm với $f(x)$ nó phải làm y hệt với $a_n$. Dựng thêm một kiểu
   * nút `seq` thì mỗi luật tương lai có **hai** chỗ phải nhớ, và quên một chỗ là
   * một lỗ im lặng — nên chỗ khác nhau duy nhất nằm đúng ở nơi nó thật sự khác:
   * cách viết. `sub` chỉ nhận **một** đối số (chỉ số), và parser ép điều đó.
   */
  | ({
      readonly k: 'ufn';
      readonly name: string;
      readonly notation: 'call' | 'sub';
      readonly args: readonly Expr[];
    } & WithId)
  /**
   * Tổng $\sum$ và tích $\prod$ — **construct ràng buộc biến đầu tiên** của engine.
   *
   * `v` là một **tên**, không phải nút: cùng lối với `root.index`, và vì lý do giống hệt
   * — nó không phải một giá trị để neo hay áp luật vào. `children` là `[from, to, body]`,
   * nên đường dẫn `.0`, `.1`, `.2`.
   *
   * Chỗ ràng buộc **đổi luật chơi** ở đúng một hàm: {@link varsOf} phải **trừ** `v` ra
   * khỏi thân. Bỏ sót chỗ trừ ấy thì `maxVars` đếm nhầm và bộ kiểm bốc giá trị cho một
   * biến không tự do — im lặng và sai, kiểu tệ nhất.
   */
  | ({
      readonly k: 'big';
      readonly op: 'sum' | 'prod';
      readonly v: string;
      readonly from: Expr;
      readonly to: Expr;
      readonly body: Expr;
    } & WithId)
  /**
   * **Trích hệ số** $[x^n]F(x)$ — kiểu nút thứ 16 (AL-19, M72).
   *
   * Toàn bộ chuyên đề hàm sinh chỉ có một câu hỏi, và đây là câu ấy: *dựng một chuỗi
   * rồi đọc lấy hệ số thứ $n$*. Trước M72 vế "đọc lấy" **không viết ra được** —
   * engine dựng được $\dfrac{1}{(1-x)^3}$ nhưng không nói được $\binom{n+2}{2}$ là
   * hệ số của nó.
   *
   * `v` là một **tên** và nó **ràng buộc**: $x$ trong `of` là biến chuỗi, không phải
   * một ẩn tự do. Cùng lối `big.v`, và cùng cái bẫy: quên trừ nó khỏi {@link varsOf}
   * thì bộ kiểm bốc một giá trị cho $x$ và mọi thứ sai im lặng. `at` thì **ngoài**
   * phạm vi — $[x^n]$ với $n$ tự do là cả điểm của mục này.
   *
   * `children` là `[at, of]`, nên đường dẫn `.0` và `.1`.
   *
   * Không có sân nào ngoài **số nguyên** tính được nó, và cách tính thì đúng một
   * dòng: khai `of` thành chuỗi tới bậc $n$ rồi lấy hệ số ấy. Nghĩa là mọi đồng nhất
   * thức hàm sinh với $n$ ký hiệu đều kiểm được bằng bốc $n$ nguyên — không phải một
   * sân mới, chỉ là một nút mới biết tự tính.
   */
  | ({ readonly k: 'coeff'; readonly v: string; readonly at: Expr; readonly of: Expr } & WithId)
  | ({ readonly k: 'rel'; readonly op: RelOp; readonly lhs: Expr; readonly rhs: Expr } & WithId)
  /**
   * **Hệ** quan hệ — hội (`and`) hoặc tuyển (`or`).
   *
   * Là một `Expr` chứ không phải "một dòng chứa nhiều `Expr`", và chỗ ấy quyết định giá
   * của cả hạng mục: `children` là các quan hệ, nên `"0"`, `"1"` chỉ vào từng phương
   * trình và `"0.L"` vào vế trái của phương trình đầu — **toàn bộ máy luật, `replaceAt`,
   * danh tính và choreography chạy nguyên si**. Phương án kia bắt sửa `model`, `layout`,
   * `choreography` và mọi luật.
   *
   * `join` khai từ M59 dù M59 chỉ dùng `'and'`: tập nghiệm bất phương trình (M60) cần
   * `'or'`, và thêm một trường vào một nút đã xuất bản thì đắt hơn khai sẵn.
   */
  | ({ readonly k: 'sys'; readonly join: 'and' | 'or'; readonly rels: readonly Expr[] } & WithId);

/**
 * Danh sách **chạy được** của mọi kiểu nút, để chốt canh tự soát được độ phủ của nó.
 *
 * Một hợp rời rạc chỉ sống ở tầng kiểu, nên không test nào hỏi được *"tôi đã chạm hết
 * mười sáu kiểu chưa"* — nó chỉ chạm được những kiểu mà bộ sinh của nó tình cờ dựng
 * ra. Hậu quả đo được ở M77: chốt canh khứ hồi của tầng 0 chạy $300$ biểu thức mà
 * chưa **một lần** chạm `rat`, `inf`, `rel`, `sys`, `ufn` — vì bộ sinh chỉ ghép toán
 * tử hai ngôi. Ba trong năm kiểu ấy khứ hồi **sai**, và chốt canh xanh suốt.
 *
 * Hai dòng `_EXHAUSTIVE` dưới đây bắt trình biên dịch đối chiếu hai chiều: thiếu một
 * kiểu là lỗi biên dịch, thừa một tên cũng là lỗi biên dịch. Nên danh sách này không
 * lệch khỏi `Expr` được, và chốt canh nào đi qua nó thì **không bỏ sót được**.
 */
export const EXPR_KINDS = [
  'int',
  'rat',
  'var',
  'inf',
  'add',
  'mul',
  'pow',
  'div',
  'root',
  'abs',
  'fn',
  'ufn',
  'big',
  'coeff',
  'rel',
  'sys',
] as const;

export type ExprKind = (typeof EXPR_KINDS)[number];
type _EXHAUSTIVE_A = Expr['k'] extends ExprKind ? true : ['thiếu kiểu nút trong EXPR_KINDS'];
type _EXHAUSTIVE_B = ExprKind extends Expr['k'] ? true : ['EXPR_KINDS có tên không phải kiểu nút'];
const _exhaustive: [_EXHAUSTIVE_A, _EXHAUSTIVE_B] = [true, true];
void _exhaustive;

/**
 * Tên hàm engine biết — **đóng**, và mở rộng bằng cách thêm một dòng ở `functions.ts`.
 *
 * M56 đăng ký ba hàm tổ hợp. Với một nền tảng nhắm Olympiad Combinatorics thì $n!$ và
 * $C_n^k$ không phải món mở rộng — chúng là ký hiệu nền của cả môn.
 */
export type FnName =
  | 'fact'
  | 'binom'
  | 'perm'
  // M61 — và cả sáu chỉ tốn **một dòng bảng** mỗi cái ở `functions.ts`. Đó là cổ tức
  // của việc M56 dựng *một* biến thể `fn` cho cả họ thay vì một biến thể mỗi hàm.
  | 'ln'
  | 'log'
  | 'exp'
  | 'sin'
  | 'cos'
  | 'tan';

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

/** $\infty$ — nguyên tử, không phải biến (M68). */
export const infinity = (m: Minter): Expr => ({ k: 'inf', id: m.next() });

/** Cây này có chứa $\infty$ không — cửa định tuyến sang sân chuỗi. */
/** Cây có ký hiệu hàm không diễn giải không — quyết định lối kiểm (AL-17). */
export function hasUninterpreted(e: Expr): boolean {
  let found = false;
  walk(e, (n) => {
    if (n.k === 'ufn') found = true;
  });
  return found;
}

export function hasInfinity(e: Expr): boolean {
  let found = false;
  walk(e, (n) => {
    if (n.k === 'inf') found = true;
  });
  return found;
}

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

/**
 * Số mũ khi nó là số nguyên; `null` khi không.
 *
 * **Mọi luật giả định số nguyên phải hỏi qua đây** — đó là toàn bộ cách giữ cho việc
 * mở `exp` thành `Expr` không đổi hành vi của một luật cũ nào. Nghiêm ngặt cố ý: chỉ
 * nút `int` mới tính. `x^(4/2)` là `pow(x, div(4,2))` và **không** được coi là $x^2$
 * — muốn thế thì rút gọn số mũ bằng một luật có tên, đừng làm lén trong hàm tra.
 */
export function intExp(e: Expr & { k: 'pow' }): number | null {
  return e.exp.k === 'int' ? e.exp.v : null;
}

/** Số mũ nhận `Expr`; một `number` được hiểu là số mũ nguyên và tự nâng thành `int`. */
export function pow(m: Minter, base: Expr, exp: Expr | number): Expr {
  const e = typeof exp === 'number' ? int(m, exp) : exp;
  // Quan hệ không có "giá trị" nên $x^{(a=b)}$ vô nghĩa; parser cho phép về cú pháp
  // (ngoặc chứa được cả `rel`), nên chặn phải nằm ở đây.
  if (e.k === 'rel') throw new Error('số mũ không thể là một quan hệ');
  if (e.k === 'int' && e.v === 0) return int(m, 1);
  if (e.k === 'int' && e.v === 1) return base;
  return { k: 'pow', base, exp: e, id: m.next() };
}

export const div = (m: Minter, num: Expr, den: Expr): Expr => ({
  k: 'div',
  num,
  den,
  id: m.next(),
});

export const abs = (m: Minter, arg: Expr): Expr => ({ k: 'abs', arg, id: m.next() });

export const root = (m: Minter, index: number, arg: Expr): Expr => ({
  k: 'root',
  index,
  arg,
  id: m.next(),
});

export const fn = (m: Minter, name: FnName, args: readonly Expr[]): Expr => ({
  k: 'fn',
  name,
  args,
  id: m.next(),
});

/** Áp dụng một ký hiệu hàm không diễn giải (AL-17). */
export const ufn = (
  m: Minter,
  name: string,
  args: readonly Expr[],
  notation: 'call' | 'sub' = 'call',
): Expr => ({
  k: 'ufn',
  name,
  notation,
  args,
  id: m.next(),
});

/** Một số hạng của dãy: $a_n$, $a_{k+1}$ (AL-18). */
export const seqTerm = (m: Minter, name: string, index: Expr): Expr =>
  ufn(m, name, [index], 'sub');

/** Trích hệ số: $[v^{at}]\,of$ (AL-19). */
export const coeff = (m: Minter, v: string, at: Expr, of: Expr): Expr => ({
  k: 'coeff',
  v,
  at,
  of,
  id: m.next(),
});

export const big = (
  m: Minter,
  op: 'sum' | 'prod',
  v: string,
  from: Expr,
  to: Expr,
  body: Expr,
): Expr => ({ k: 'big', op, v, from, to, body, id: m.next() });

export const sys = (m: Minter, join: 'and' | 'or', rels: readonly Expr[]): Expr => ({
  k: 'sys',
  join,
  rels,
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

/**
 * Hai hàm dưới đây là **nền** của mọi phép đi cây trong engine.
 *
 * `substitute` từng liệt kê tay `add`/`mul`/`pow`/`div`/`rel` rồi `default: return e`,
 * nên nó im lặng bỏ qua `abs`, `root`, `fn`, `big` — suốt năm hạng mục. Lời chữa là
 * *"đi bằng `children`/`withChildren`, đừng viết `switch` tay, vì `children` đầy đủ
 * theo kiến trúc nên nó không quên được"* (xem `substitute` ở `rules.ts`).
 *
 * Câu ấy **không tự đúng**. Bản trước của chính hai hàm này kết bằng `default:` —
 * `[]` và `e` — tức đúng cái bẫy mà chúng được dựng lên để bịt, chỉ dời xuống một
 * tầng và dời vào chỗ mọi thứ khác đứng lên. Kiểu nút thứ mười bảy có con mà quên khai
 * ở đây thì **cả engine** mù nó cùng lúc: `walk`, `nodeCount`, `depth`, `substituteVar`,
 * `allPaths`, `resolveAt`, `reid`.
 *
 * Nay không có `default`. `Expr` là hợp rời rạc, nên thiếu một nhánh là **lỗi biên
 * dịch** — lời hứa "không quên được" chuyển từ chú thích sang trình biên dịch, và đó
 * là chỗ duy nhất nó đứng được.
 */
export function children(e: Expr): readonly Expr[] {
  switch (e.k) {
    case 'add':
    case 'mul':
      return e.args;
    // Cơ số là `.0`, số mũ là `.1` — nên mọi đường dẫn cũ trỏ vào cơ số vẫn đúng, và
    // `.1` là đường mới, nhờ nó neo và áp luật được **vào chính số mũ**.
    case 'pow':
      return [e.base, e.exp];
    case 'div':
      return [e.num, e.den];
    case 'root':
    case 'abs':
      return [e.arg];
    case 'fn':
    case 'ufn':
      return e.args;
    case 'big':
      return [e.from, e.to, e.body];
    case 'coeff':
      return [e.at, e.of];
    case 'rel':
      return [e.lhs, e.rhs];
    case 'sys':
      return e.rels;
    // Lá thật — khai từng cái một, **không** gom vào `default`.
    case 'int':
    case 'rat':
    case 'var':
    case 'inf':
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
      return { ...e, base: kids[0] as Expr, exp: kids[1] as Expr };
    case 'div':
      return { ...e, num: kids[0] as Expr, den: kids[1] as Expr };
    case 'root':
    case 'abs':
      return { ...e, arg: kids[0] as Expr };
    case 'fn':
    case 'ufn':
      return { ...e, args: kids };
    case 'big':
      return { ...e, from: kids[0] as Expr, to: kids[1] as Expr, body: kids[2] as Expr };
    case 'coeff':
      return { ...e, at: kids[0] as Expr, of: kids[1] as Expr };
    case 'rel':
      return { ...e, lhs: kids[0] as Expr, rhs: kids[1] as Expr };
    case 'sys':
      return { ...e, rels: kids };
    case 'int':
    case 'rat':
    case 'var':
    case 'inf':
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

/**
 * Các biến **tự do** của một biểu thức.
 *
 * Trước M57 đây chỉ là "mọi nút `var`", vì engine không có construct nào ràng buộc tên.
 * $\sum_{k=1}^{n} k$ đổi chuyện đó: $k$ **không** là biến tự do, và nếu hàm này khai nó
 * ra thì hai chỗ hỏng cùng lúc, cả hai đều im lặng:
 *
 * - `maxVars` đếm thừa, nên một bài hai ẩn bị từ chối vì "quá 6 biến";
 * - bộ kiểm bốc một giá trị cho $k$ rồi truyền vào `evalReal`, nơi vòng lặp của
 *   `big` **đè lên nó**. Giá trị bốc ra bị bỏ đi lặng lẽ, và phép kiểm vẫn xanh —
 *   nhưng nó xanh vì một lý do khác với lý do người ta tưởng.
 *
 * Nên đi tay thay vì dùng `walk`: `walk` không có khái niệm phạm vi.
 */
export function varsOf(e: Expr): Set<string> {
  const out = new Set<string>();
  const go = (n: Expr): void => {
    if (n.k === 'var') {
      out.add(n.name);
      return;
    }
    if (n.k === 'big') {
      // Hai cận nằm **ngoài** phạm vi ràng buộc — $\sum_{k=1}^{k}$ thì cận trên là một
      // $k$ khác, tự do, và trộn hai thứ ấy là chỗ lỗi phạm vi cổ điển nhất.
      go(n.from);
      go(n.to);
      for (const name of varsOf(n.body)) if (name !== n.v) out.add(name);
      return;
    }
    if (n.k === 'coeff') {
      // Cùng luật phạm vi: bậc cần trích nằm **ngoài**, chuỗi nằm **trong**.
      go(n.at);
      for (const name of varsOf(n.of)) if (name !== n.v) out.add(name);
      return;
    }
    for (const c of children(n)) go(c);
  };
  go(e);
  return out;
}

/** Biến chỉ số bị ràng buộc **tại** nút này; rỗng với mọi nút khác. */
export const boundVar = (e: Expr): string | null =>
  e.k === 'big' || e.k === 'coeff' ? e.v : null;

/**
 * Thay mọi `var name` **tự do** bằng `value`.
 *
 * Tôn trọng phạm vi: không thò vào thân một $\sum$ đã ràng buộc chính tên ấy. Có ở đây
 * chứ không ở `model.ts` vì từ M57 cả `rules` lẫn `model` đều cần, và hai bản chép tay
 * thì bản thứ hai sẽ quên đúng dòng phạm vi này.
 */
export function substituteVar(e: Expr, name: string, value: Expr): Expr {
  if (e.k === 'var' && e.name === name) return value;
  if (e.k === 'big' && e.v === name) {
    // Tên bị che: chỉ thay trong hai cận, không thay trong thân.
    return { ...e, from: substituteVar(e.from, name, value), to: substituteVar(e.to, name, value) };
  }
  if (e.k === 'coeff' && e.v === name) {
    // Tên bị che bởi $[x^{\cdot}]$: chỉ thay ở bậc cần trích.
    return { ...e, at: substituteVar(e.at, name, value) };
  }
  const kids = children(e).map((c) => substituteVar(c, name, value));
  return kids.length === 0 ? e : withChildren(e, kids);
}

export const isConst = (e: Expr): boolean => varsOf(e).size === 0;

/**
 * Cây có phần **không đại số** không — quyết định dùng bộ kiểm nào (`check.ts`).
 *
 * Căn và giá trị tuyệt đối đều không sống trên $\mathbb{F}_p$: một cái cần khái niệm
 * thặng dư bậc hai, cái kia cần **thứ tự**, mà trường hữu hạn thì không có thứ tự.
 */
export function needsRealEval(e: Expr): boolean {
  let found = false;
  walk(e, (n) => {
    if (n.k === 'root' || n.k === 'abs') found = true;
    // Giai thừa và tổ hợp cũng không: chúng chỉ có nghĩa ở **số nguyên**, và trên
    // $\mathbb{F}_p$ thì $n!$ với $n$ là một thặng dư ngẫu nhiên là câu vô nghĩa.
    // Đường đi thật của chúng là bộ bốc điểm **số nguyên** (`needsIntegerEval`); nhánh
    // này là lớp chắn thứ hai, để nếu lối lái ấy hỏng thì kết quả là "không kiểm được"
    // chứ không phải một số bịa ra.
    if (n.k === 'fn') found = true;
    // $\sum$ chỉ khai được khi hai cận là **số nguyên**, nên nó cũng thuộc họ đi đường
    // bộ bốc điểm số nguyên. `walk` chui cả vào thân, nên một hàm nằm trong thân cũng
    // bị bắt ở nhánh trên.
    if (n.k === 'big') found = true;
    // $[x^n]F$ chỉ có nghĩa khi $n$ là **số nguyên không âm** — cùng họ với $\sum$.
    if (n.k === 'coeff') found = true;
    // Số mũ không nguyên cũng không sống ở đó: $x^{1/2}$ cần chọn một trong hai căn,
    // $x^{\sqrt 2}$ thì không có nghĩa gì trên trường hữu hạn. `walk` chui cả vào số
    // mũ (nó là con `.1`), nên căn **nằm trong** số mũ cũng bị bắt ở nhánh trên.
    if (n.k === 'pow' && intExp(n) === null) found = true;
  });
  return found;
}

/** Bậc tổng — cận trên thô, đủ cho ràng buộc Schwartz–Zippel ở `check.ts`. */
export function totalDegree(e: Expr): number {
  switch (e.k) {
    case 'var':
      return 1;
    case 'inf':
      // Không phải "bậc rất lớn" mà là **không có bậc**. `sameValue` đọc con số này để
      // quyết cận Schwartz–Zippel, và `Infinity` đẩy nó vào nhánh "không kiểm được" —
      // đúng chỗ nó phải đứng, vì ba sân cũ không nói được gì về $\infty$.
      return Infinity;
    case 'int':
    case 'rat':
      return 0;
    case 'add':
      return Math.max(...e.args.map(totalDegree));
    case 'mul':
      return e.args.reduce((s, a) => s + totalDegree(a), 0);
    case 'pow': {
      // Số mũ nguyên hoặc hữu tỉ ⇒ bậc tính được. Ngoài ra ($x^n$, $x^{\sqrt 2}$) thì
      // vật này **không phải hàm hữu tỉ**, và "bậc" của nó không có nghĩa: trả
      // `Infinity` để chỗ dùng phải tự quyết. Cổng bậc ở `model.ts` bỏ qua `Infinity`
      // — nếu không thì $x^n$ bị từ chối vì "bậc vượt trần", đúng cái vừa mở ra.
      const d = totalDegree(e.base);
      if (e.exp.k === 'int') return d * Math.abs(e.exp.v);
      if (e.exp.k === 'rat') return (d * Math.abs(e.exp.p)) / Math.abs(e.exp.q);
      return Infinity;
    }
    case 'div':
      return totalDegree(e.num) + totalDegree(e.den);
    case 'abs':
      return totalDegree(e.arg);
    case 'ufn':
      // Một hàm **không biết là gì** thì không phải hàm hữu tỉ của đối số nó: $f(x)$
      // được phép mọc nhanh hơn mọi đa thức. Cận Schwartz–Zippel không nói được gì
      // ở đây, và `check.ts` không đi đường bậc cho biểu thức chứa nó.
      return isConst(e) ? 0 : Infinity;
    case 'fn':
    case 'big':
    case 'coeff':
      // $n!$, $C_n^k$, $\sum_{k=1}^{n} f(k)$, $[x^n]F$ **không phải hàm hữu tỉ** của $n$, nên
      // "bậc" của chúng vô nghĩa — trả `Infinity`, cùng lối với $x^n$. Hằng thì bậc $0$.
      return isConst(e) ? 0 : Infinity;
    case 'root':
      // Bậc **làm tròn lên**: nó chỉ dùng làm cận cho Schwartz–Zippel, mà biểu thức
      // có căn thì không đi đường ấy nữa (xem `check.ts`). Ước dôi ở đây là an toàn.
      return Math.ceil(totalDegree(e.arg) / e.index);
    case 'rel':
      return Math.max(totalDegree(e.lhs), totalDegree(e.rhs));
    case 'sys':
      return Math.max(0, ...e.rels.map(totalDegree));
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

/**
 * Các tên chỉ số bị ràng buộc **trên đường đi** từ gốc tới `path` — những tên mà
 * cây con tại `path` nằm trong *thân* của một $\Sigma/\Pi$ mang tên ấy.
 *
 * Tồn tại vì luật là hàm toàn phần trên một cây con: gọi `evaluate_at "k := 3"`
 * **vào giữa thân** $\sum_k$ thì luật chỉ thấy một `var k` trần — nhánh che tên
 * trong luật không cứu được, vì cái Σ đứng ngoài cây con nó được đưa. Chỉ model
 * biết đường dẫn, nên model phải hỏi câu này trước khi tin hợp đồng `instance`.
 */
export function boundAlong(root: Expr, path: string): Set<string> {
  const out = new Set<string>();
  let cur: Expr = root;
  for (const i of segmentsOf(path)) {
    if (cur.k === 'big' && i === 2) out.add(cur.v);
    const next = children(cur)[i];
    if (next === undefined) return out;
    cur = next;
  }
  return out;
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
  // Hệ lồng hệ **cùng phép nối** thì làm phẳng: $(A \wedge B) \wedge C$ và
  // $A \wedge B \wedge C$ là một. Khác phép nối thì **không** — $(A \vee B) \wedge C$
  // làm phẳng là đổi hẳn nghĩa. Cùng lý lẽ với `add`/`mul` ở dưới, và cùng chỗ đứng:
  // ghép cây con xong là chuẩn hoá lại, nếu không đường dẫn bước sau trỏ lệch.
  if (e.k === 'sys') {
    const flat: Expr[] = [];
    for (const c of kids) {
      if (c.k === 'sys' && c.join === e.join) flat.push(...c.rels);
      else flat.push(c);
    }
    return flat.length === 1 ? (flat[0] as Expr) : { ...e, rels: flat };
  }
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
      return same(a.exp, (b as typeof a).exp) && same(a.base, (b as typeof a).base);
    case 'root':
      return a.index === (b as typeof a).index && same(a.arg, (b as typeof a).arg);
    case 'abs':
      return same(a.arg, (b as typeof a).arg);
    case 'fn': {
      const o = b as typeof a;
      return (
        a.name === o.name &&
        a.args.length === o.args.length &&
        a.args.every((c, i) => same(c, o.args[i] as Expr))
      );
    }
    case 'ufn': {
      const o = b as typeof a;
      // So cả `notation`: $f(1)$ và $f_1$ in ra hai thứ khác nhau trên hình, nên coi
      // chúng bằng nhau là để một bước đổi cách viết trôi qua mà không ai thấy.
      return (
        a.name === o.name &&
        a.notation === o.notation &&
        a.args.length === o.args.length &&
        a.args.every((c, i) => same(c, o.args[i] as Expr))
      );
    }
    case 'big': {
      const o = b as typeof a;
      // So cả **tên biến chỉ số**: $\sum_k f(k)$ và $\sum_j f(j)$ bằng nhau về giá trị
      // nhưng khác nhau về cây, và `same` là phép so **cấu trúc**. Đổi tên chỉ số là
      // một luật có tên (`sum_shift` với dịch $0$), không phải chuyện `same` làm lén.
      return (
        a.op === o.op &&
        a.v === o.v &&
        same(a.from, o.from) &&
        same(a.to, o.to) &&
        same(a.body, o.body)
      );
    }
    case 'coeff': {
      const o = b as typeof a;
      // So cả tên biến chuỗi, cùng lý lẽ với `big`: đổi tên một biến ràng buộc là
      // một phép biến đổi, không phải chuyện `same` làm lén.
      return a.v === o.v && same(a.at, o.at) && same(a.of, o.of);
    }
    case 'rel':
      return (
        a.op === (b as typeof a).op &&
        same(a.lhs, (b as typeof a).lhs) &&
        same(a.rhs, (b as typeof a).rhs)
      );
    case 'sys': {
      const o = b as typeof a;
      return (
        a.join === o.join &&
        a.rels.length === o.rels.length &&
        a.rels.every((c, i) => same(c, o.rels[i] as Expr))
      );
    }
    default: {
      const x = children(a);
      const y = children(b);
      return x.length === y.length && x.every((c, i) => same(c, y[i] as Expr));
    }
  }
}
