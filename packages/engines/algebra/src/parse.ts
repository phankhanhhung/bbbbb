import {
  ufn,
  seqTerm,
  coeff,
  infinity,
  Minter,
  add,
  big,
  div,
  fn,
  int,
  mul,
  negate,
  abs,
  pow,
  rat,
  rel,
  root,
  sys,
  variable,
  type Expr,
  type FnName,
  type RelOp,
} from './expr.js';
import { FUNCTIONS } from './functions.js';

/**
 * Trần số đối số của một ký hiệu hàm không diễn giải.
 *
 * Ba là đủ cho mọi phương trình hàm của chương trình chuyên ($f(x+y)$, $f(x,y)$
 * ở dạng hai biến); trần tồn tại vì `f(a,b,c,d,e,…)` gần như luôn là dấu hiệu
 * người viết đang gõ một thứ khác, và một lời từ chối ở đây rẻ hơn một hình vẽ
 * tràn khung.
 */
const UFN_MAX_ARITY = 3;

/**
 * Parser cho cú pháp mặt (§3.3).
 *
 * Tác giả gõ `"(x + 1)^2 = x^2 + 1"`, không gõ cây JSON. Ba lý do ở §3.3, và lý do
 * thứ tư chỉ thấy khi viết: parser **dù sao cũng phải có** cho sandbox, nơi người
 * học gõ biểu thức đích.
 *
 * **Không có nhân ngầm.** `2x` là lỗi cú pháp. Nhân ngầm kéo theo `xy` là một biến
 * hay hai biến nhân nhau — mơ hồ ngay ở ký tự thứ hai, và mơ hồ trong dữ liệu là
 * thứ đắt nhất kho này có thể mua.
 */

export class ParseError extends Error {
  constructor(
    message: string,
    readonly at: number,
  ) {
    super(message);
  }
}

// Dài trước ngắn: `<=` phải thử trước `<`, nếu không `<` nuốt mất dấu bằng.
const RELS: readonly RelOp[] = ['<=', '>=', '!=', '=', '<', '>'];

/**
 * Cú pháp mặt của các hàm, **dài trước ngắn**.
 *
 * `fact` phải đứng trước bất cứ tên một chữ nào bắt đầu bằng `f` nếu sau này có; giữ
 * thứ tự này làm quy ước để chỗ thêm hàm mới không phải nghĩ lại.
 */
/** Cú pháp mặt của tổng và tích. */
const BIG_OPS: ReadonlyArray<readonly [string, 'sum' | 'prod']> = [
  ['sum', 'sum'],
  ['prod', 'prod'],
];

const NAMED_FNS: ReadonlyArray<readonly [string, FnName]> = [
  ['fact', 'fact'],
  ['log', 'log'],
  ['ln', 'ln'],
  ['exp', 'exp'],
  ['sin', 'sin'],
  ['cos', 'cos'],
  ['tan', 'tan'],
  // Một chữ **sau cùng**: `C` và `A` chỉ là hàm khi đứng sát `(`, mà `cos(` cũng bắt
  // đầu bằng `c` — thứ tự này giữ cho tên dài luôn được thử trước.
  ['C', 'binom'],
  ['A', 'perm'],
];

class Parser {
  private i = 0;
  /**
   * Các tên đang bị **ràng buộc** bởi một $\sum$/$\prod$ bao ngoài.
   *
   * Có để từ chối $\sum_k \sum_k$ ngay ở tầng ngữ pháp. Đổi tên tự động là một mẹo, và
   * mẹo ở tầng ngữ pháp là chỗ lỗi nằm: người soạn gõ `k` rồi đọc lại thấy `k'` mà không
   * hiểu vì sao, còn `at` của bước sau thì trỏ vào một cái tên chưa từng gõ.
   */
  private readonly bound: string[] = [];

  constructor(
    private readonly src: string,
    private readonly m: Minter,
  ) {}

  /**
   * **Hệ chỉ ở gốc.** Dấu chấm phẩy ngăn các phương trình — dấu phẩy đã thuộc về
   * `root(3, x)`, `C(n, k)` và `sum(k, 1, n, …)`. Không cho `sys` lồng `sys`: một hệ
   * của các hệ không phải thứ ai viết, và cho phép nó là mở một chiều lồng vô hạn mà
   * không luật nào biết đi trong đó.
   *
   * ## `hoặc` đọc được từ M77
   *
   * `sys` có hai lối nối từ M60, và engine **sinh** cả hai: một bất phương trình chứa
   * trị tuyệt đối tách ra thành $x < 1$ **hoặc** $x > 2$, hiện đúng chữ ấy trên hình,
   * và `toPlain` in đúng chữ ấy. Nhưng parser thì chỉ biết `;`, tức chỉ biết `and`.
   *
   * Hai hậu quả, và cái thứ hai mới đau:
   *
   * 1. Người soạn **không viết được** thứ engine vẽ ra được. Muốn một bài mở đầu bằng
   *    hợp hai khoảng thì phải bắt đầu từ chỗ khác rồi đi tới nó bằng một luật.
   * 2. `unparse` in hệ `or` bằng `;` — tức **đổi phép hội thành phép tuyển**. Đó không
   *    phải mất một dạng in, đó là mất một mệnh đề: $x<1 \lor x>2$ là gần cả trục số,
   *    $x<1 \land x>2$ là tập rỗng. Chú thích của `unparse` khai một chốt canh khứ hồi
   *    `parse(unparse(e)) ≡ e`; chốt ấy chưa từng tồn tại, và nếu có thì nó đã đỏ ngay
   *    ở đây.
   *
   * Không trộn hai dấu nối trong một hệ: `a; b hoặc c` đọc kiểu gì cũng phải cãi nhau
   * về độ ưu tiên, và một hệ hỗn hợp không phải thứ chương trình phổ thông viết.
   */
  parse(): Expr {
    const first = this.rel();
    const rels: Expr[] = [first];
    let join: 'and' | 'or' | null = null;
    for (;;) {
      const next = this.eat(';') ? 'and' : this.eat('hoặc') ? 'or' : null;
      if (next === null) break;
      if (join !== null && join !== next) {
        throw new ParseError('một hệ dùng một dấu nối: hoặc toàn ";", hoặc toàn "hoặc"', this.i);
      }
      join = next;
      rels.push(this.rel());
    }

    this.ws();
    if (this.i < this.src.length) {
      throw new ParseError(`thừa ký tự "${this.src.slice(this.i)}"`, this.i);
    }
    if (rels.length === 1) return first;
    for (const r of rels) {
      if (r.k !== 'rel') throw new ParseError('mỗi dòng của hệ phải là một quan hệ', this.i);
    }
    return sys(this.m, join ?? 'and', rels);
  }

  private ws(): void {
    while (this.i < this.src.length && /\s/.test(this.src[this.i] as string)) this.i += 1;
  }

  private eat(text: string): boolean {
    this.ws();
    if (this.src.startsWith(text, this.i)) {
      this.i += text.length;
      return true;
    }
    return false;
  }

  private rel(): Expr {
    const lhs = this.sum();
    this.ws();
    for (const op of RELS) {
      if (this.src.startsWith(op, this.i)) {
        this.i += op.length;
        return rel(this.m, op, lhs, this.sum());
      }
    }
    return lhs;
  }

  private sum(): Expr {
    const args: Expr[] = [this.prod()];
    for (;;) {
      this.ws();
      if (this.eat('+')) args.push(this.prod());
      // `a - b` là `a + (-1)·b`. Không có nút `sub` — §3.1.
      else if (this.eat('-')) args.push(negate(this.m, this.prod()));
      else break;
    }
    return add(this.m, args);
  }

  private prod(): Expr {
    let left = this.unary();
    for (;;) {
      this.ws();
      if (this.eat('*')) left = mul(this.m, [left, this.unary()]);
      else if (this.eat('/')) left = div(this.m, left, this.unary());
      else break;
    }
    return left;
  }

  private unary(): Expr {
    this.ws();
    if (this.eat('-')) return negate(this.m, this.unary());
    return this.power();
  }

  /**
   * `power := atom '!'* ('^' unary)?` — **kết hợp phải**, như mọi ký pháp toán:
   * $x$^$2$^$3$ là $x^{(2^3)}$.
   *
   * Số mũ đi qua `unary` chứ không qua `sum`: `x^2 + 1` phải là $x^2+1$, không phải
   * $x^{2+1}$. Muốn tổng trong số mũ thì viết ngoặc — `x^(n+1)` — và ngoặc ấy chính là
   * thứ mắt người cũng cần.
   *
   * Giai thừa là **hậu tố** và ăn trước dấu mũ, nên `n!^2` là $(n!)^2$ còn `2^n!` là
   * $2^{n!}$ — đúng thứ tự đọc của mắt.
   */
  private power(): Expr {
    let base = this.atom();
    while (this.bang()) base = fn(this.m, 'fact', [base]);
    this.ws();
    if (!this.eat('^')) return base;
    const exp = this.unary();
    if (exp.k === 'rel') throw new ParseError('số mũ không thể là một quan hệ', this.i);
    return pow(this.m, base, exp);
  }

  /**
   * Dấu giai thừa — và chỗ **không** được nuốt nhầm.
   *
   * `!=` là một toán tử quan hệ, nên `n != 3` phải đọc là "$n \ne 3$" chứ không phải
   * "$n!$ rồi lỗi cú pháp". Kiểm ký tự ngay sau, và **không bỏ qua khoảng trắng** trước
   * dấu `!`: giai thừa dính liền vào đối số của nó ở mọi cách viết tay, nên `n ! = 3`
   * không phải thứ cần đọc được.
   *
   * Hệ quả có thật và phải nói ra: `n!=3` đọc thành $n \ne 3$. Muốn "$n! = 3$" thì viết
   * dấu cách — `n! = 3`.
   */
  private bang(): boolean {
    if (this.src[this.i] !== '!' || this.src[this.i + 1] === '=') return false;
    this.i += 1;
    return true;
  }

  /** Ruột của `sum(`/`prod(` — đã ăn tên và dấu ngoặc mở. */
  private bigBody(op: 'sum' | 'prod', head: string): Expr {
    this.ws();
    const name = this.name();
    if (name === null) throw new ParseError(`${head} cần một tên biến chỉ số`, this.i);
    if (this.bound.includes(name)) {
      throw new ParseError(`chỉ số "${name}" đã bị một tổng/tích bao ngoài dùng`, this.i);
    }
    if (!this.eat(',')) throw new ParseError(`${head} cần dấu ","`, this.i);
    // Hai cận đọc **ngoài** phạm vi ràng buộc: $\sum_{k=1}^{k}$ thì cận trên là một $k$
    // khác, tự do — trộn hai thứ ấy là lỗi phạm vi cổ điển nhất.
    const from = this.sum();
    if (!this.eat(',')) throw new ParseError(`${head} cần dấu ","`, this.i);
    const to = this.sum();
    if (!this.eat(',')) throw new ParseError(`${head} cần dấu ","`, this.i);

    this.bound.push(name);
    try {
      const body = this.sum();
      if (!this.eat(')')) throw new ParseError('thiếu dấu ")"', this.i);
      return big(this.m, op, name, from, to, body);
    } finally {
      this.bound.pop();
    }
  }

  /** Một tên biến: **một chữ cái**. `null` khi không có. */
  private name(): string | null {
    this.ws();
    const ch = this.src[this.i];
    if (ch === undefined || !/[a-zA-Z]/.test(ch)) return null;
    this.i += 1;
    return ch;
  }

  private digits(): number | null {
    this.ws();
    const start = this.i;
    while (this.i < this.src.length && /[0-9]/.test(this.src[this.i] as string)) this.i += 1;
    if (this.i === start) return null;
    return Number(this.src.slice(start, this.i));
  }

  private atom(): Expr {
    this.ws();
    if (this.eat('(')) {
      const inner = this.rel();
      if (!this.eat(')')) throw new ParseError('thiếu dấu ")"', this.i);
      return inner;
    }

    const ch = this.src[this.i];
    if (ch === undefined) throw new ParseError('hết chuỗi giữa chừng', this.i);

    if (/[0-9]/.test(ch)) {
      const v = this.digits() as number;
      return int(this.m, v);
    }

    // Hàm: `sqrt(x)` và `root(3, x)`. Hai cái tên, không mở cửa cho hàm tuỳ ý —
    // ngữ pháp phải đóng thì printer mới biết trước mình phải in những gì.
    if (this.src.startsWith('abs', this.i)) {
      this.i += 3;
      if (!this.eat('(')) throw new ParseError('abs cần dấu "("', this.i);
      const inner = this.sum();
      if (!this.eat(')')) throw new ParseError('thiếu dấu ")"', this.i);
      return abs(this.m, inner);
    }
    if (this.src.startsWith('sqrt', this.i)) {
      this.i += 4;
      if (!this.eat('(')) throw new ParseError('sqrt cần dấu "("', this.i);
      const inner = this.sum();
      if (!this.eat(')')) throw new ParseError('thiếu dấu ")"', this.i);
      return root(this.m, 2, inner);
    }
    if (this.src.startsWith('root', this.i)) {
      this.i += 4;
      if (!this.eat('(')) throw new ParseError('root cần dấu "("', this.i);
      const n = this.digits();
      if (n === null || n < 2) throw new ParseError('chỉ số căn phải là số nguyên ≥ 2', this.i);
      if (!this.eat(',')) throw new ParseError('root cần dấu ","', this.i);
      const inner = this.sum();
      if (!this.eat(')')) throw new ParseError('thiếu dấu ")"', this.i);
      return root(this.m, n, inner);
    }

    /**
     * **Trích hệ số**: `coeff(x, n, 1/(1 - x)^3)` in ra $[x^n]\dfrac{1}{(1-x)^3}$.
     *
     * Cú pháp mặt là một lời gọi ba đối số chứ không phải `[x^n]…`: dấu ngoặc vuông
     * chưa có nghĩa nào trong ngữ pháp này, và mở nó ra thì phải trả lời ngay
     * "$[a](b)$ là trích hệ số hay là tích?" — một câu hỏi mơ hồ ngay ở ký tự đầu.
     * Cùng lý lẽ đã cấm nhân ngầm (§3.3). Cách viết đẹp nằm ở `typeset`, chỗ nó
     * thuộc về.
     *
     * Đối số **đầu là một tên**: biến chuỗi, ràng buộc trong đối số thứ ba.
     */
    if (this.src.startsWith('coeff', this.i) && this.src[this.i + 5] === '(') {
      this.i += 6;
      const v = this.name();
      if (v === null) throw new ParseError('coeff cần một tên biến chuỗi', this.i);
      if (this.bound.includes(v)) {
        throw new ParseError(`biến chuỗi "${v}" đã bị một dấu bao ngoài ràng buộc`, this.i);
      }
      if (!this.eat(',')) throw new ParseError('coeff cần dấu ","', this.i);
      // Bậc đọc **ngoài** phạm vi ràng buộc, hệt hai cận của Σ.
      const at = this.sum();
      if (!this.eat(',')) throw new ParseError('coeff cần dấu ","', this.i);
      this.bound.push(v);
      try {
        const of = this.sum();
        if (!this.eat(')')) throw new ParseError('thiếu dấu ")"', this.i);
        return coeff(this.m, v, at, of);
      } finally {
        this.bound.pop();
      }
    }

    /**
     * `rat(p, q)` — dạng viết của **nguyên tử hữu tỉ** (M77).
     *
     * Không ai soạn bài gõ nó, và đó là chủ ý: `3/4` vẫn đọc thành `div`, đúng như từ
     * trước tới nay. Nó có mặt vì `unparse` cần in được `rat`, và bản trước in ra
     * `(3 / 4)` — đọc lại thành một `div`, tức **đổi kiểu nút**. `rat` là dạng chuẩn
     * mà luật sinh ra sau khi rút gọn chính xác; `div` là một phép chia chưa làm. Hai
     * thứ ấy cùng giá trị nhưng `same` phân biệt chúng, nên chốt canh khứ hồi mà
     * `unparse` khai là có thì đỏ ở mọi phân số rút gọn.
     */
    if (this.src.startsWith('rat', this.i) && this.src[this.i + 3] === '(') {
      this.i += 4;
      const p = this.sum();
      if (!this.eat(',')) throw new ParseError('rat cần dấu ","', this.i);
      const q = this.sum();
      if (!this.eat(')')) throw new ParseError('thiếu dấu ")"', this.i);
      if (p.k !== 'int' || q.k !== 'int') throw new ParseError('rat cần hai số nguyên', this.i);
      if (q.v === 0) throw new ParseError('rat có mẫu bằng 0', this.i);
      return rat(this.m, p.v, q.v);
    }

    // $\sum$ và $\prod$: `sum(k, 1, n, k^2)`. Đối số **đầu là một tên**, không phải một
    // biểu thức — nó là biến chỉ số, và biến chỉ số không có giá trị để tính.
    for (const [head, op] of BIG_OPS) {
      if (!this.src.startsWith(head, this.i)) continue;
      if (this.src[this.i + head.length] !== '(') continue;
      this.i += head.length + 1;
      return this.bigBody(op, head);
    }

    // Hàm tổ hợp. `C` và `A` cũng là **tên biến hợp lệ**, và chuyện ấy không mơ hồ —
    // engine **cấm nhân ngầm** (§3.3), nên một biến không bao giờ đứng sát dấu ngoặc
    // mở. `C(` chỉ có thể là lời gọi hàm. Một ràng buộc cũ trả cổ tức ở đây.
    for (const [head, name] of NAMED_FNS) {
      if (!this.src.startsWith(head, this.i)) continue;
      if (this.src[this.i + head.length] !== '(') continue;
      this.i += head.length + 1;
      const spec = FUNCTIONS[name];
      const args: Expr[] = [this.sum()];
      while (args.length < spec.arity) {
        if (!this.eat(',')) throw new ParseError(`${head} cần ${spec.arity} đối số`, this.i);
        args.push(this.sum());
      }
      if (!this.eat(')')) throw new ParseError('thiếu dấu ")"', this.i);
      return fn(this.m, name, args);
    }

    // `inf` **trước** khi đọc tên biến: không có nhân ngầm nên `inf` không thể là ba
    // biến đứng cạnh nhau, và `i`, `n`, `f` vẫn dùng làm tên biến bình thường ở chỗ
    // khác. Đòi ký tự sau nó **không phải chữ cái** để `info` vẫn là một tên (nếu ngày
    // nào đó tên nhiều chữ được mở).
    if (this.src.startsWith('inf', this.i) && !/[a-zA-Z]/.test(this.src[this.i + 3] ?? '')) {
      this.i += 3;
      return infinity(this.m);
    }

    const name = this.name();
    if (name === null) throw new ParseError('cần một số hoặc một tên', this.i);

    /**
     * **Ký hiệu hàm không diễn giải** (AL-17): một tên đứng sát dấu ngoặc mở.
     *
     * Đọc được vì engine **cấm nhân ngầm** (§3.3) — cùng cổ tức mà `C(n,k)` đã ăn
     * ngay trên: một biến không bao giờ đứng sát `(`, nên `f(` chỉ có thể là một
     * lời gọi. Không cần khai trước tên nào là hàm; chỗ nó đứng đã nói.
     */
    if (this.src[this.i] === '(') {
      this.i += 1;
      const args: Expr[] = [this.sum()];
      while (this.eat(',')) args.push(this.sum());
      if (!this.eat(')')) throw new ParseError('thiếu dấu ")"', this.i);
      if (args.length > UFN_MAX_ARITY) {
        throw new ParseError(`ký hiệu hàm nhận nhiều nhất ${UFN_MAX_ARITY} đối số`, this.i);
      }
      return ufn(this.m, name, args);
    }

    /**
     * **Số hạng của dãy** (AL-18): một tên đứng sát dấu gạch dưới.
     *
     * `a_n`, `a_1`, `a_{k+1}` — chỉ số là một `Expr` đầy đủ, và đó là cả điểm của
     * mục này: bản trước chỉ đọc được **một chữ số** và cất kết quả vào *tên biến*
     * `"a_1"`, nghĩa là $a_{n+1}$ không viết ra được và $a_1$ với $a_2$ là hai ẩn
     * rời nhau chứ không phải hai số hạng của một dãy.
     *
     * Chỉ số **không ngoặc** thì đọc đúng **một nguyên tử** — `a_n+1` là
     * $a_n + 1$, đúng như người ta viết tay. Muốn $a_{n+1}$ thì phải gõ ngoặc
     * nhọn, và đòi hỏi ấy rẻ hơn nhiều so với đoán hộ.
     */
    if (this.src[this.i] === '_') {
      this.i += 1;
      if (this.eat('{')) {
        const idx = this.sum();
        if (!this.eat('}')) throw new ParseError('thiếu dấu "}"', this.i);
        return seqTerm(this.m, name, idx);
      }
      const ch = this.src[this.i];
      if (ch === undefined || !/[0-9a-zA-Z]/.test(ch)) {
        throw new ParseError('sau "_" cần một chỉ số, ví dụ `a_1` hoặc `a_{k+1}`', this.i);
      }
      const idx = /[0-9]/.test(ch) ? int(this.m, this.digits() as number) : variable(this.m, ch);
      if (idx.k === 'var') this.i += 1;
      return seqTerm(this.m, name, idx);
    }

    return variable(this.m, name);

    throw new ParseError(`không đọc được ký tự "${ch}"`, this.i);
  }
}

export function parse(source: string, m: Minter = new Minter()): Expr {
  return new Parser(source, m).parse();
}

/** Bản không ném: dùng ở chỗ cần **từ chối** thay vì nổ (renderer, checkBounds). */
export function tryParse(
  source: string,
  m: Minter = new Minter(),
): { expr: Expr } | { error: string } {
  try {
    return { expr: parse(source, m) };
  } catch (error) {
    const e = error as ParseError;
    const where = typeof e.at === 'number' ? ` (vị trí ${e.at})` : '';
    return { error: `${e.message}${where}` };
  }
}

/* ---------- chữ trơn, cho dòng điều kiện ---------- */

const PLAIN_PREC: Readonly<Record<Expr['k'], number>> = {
  // $[x^n]F$ ăn **tới hết** cái đứng sau nó, hệt $\Sigma$ — nên nó lỏng như $\Sigma$.
  coeff: 0,
  inf: 6,
  // Lời gọi hàm xếp ngang nguyên tử: `f(x)` đã tự có ngoặc, không cần thêm.
  ufn: 6,
  sys: 0,
  rel: 0,
  add: 1,
  mul: 2,
  div: 2,
  pow: 3,
  root: 4,
  abs: 4,
  fn: 4,
  // Ký hiệu tổng ăn **tới hết** thân của nó, nên nó lỏng hơn cả phép cộng: $\sum f + g$
  // đọc ra $(\sum f) + g$ chỉ vì thân được bọc ngoặc khi cần, và chỗ bọc ấy nằm ở đây.
  big: 1,
  int: 4,
  rat: 4,
  var: 4,
};

const PLAIN_REL: Readonly<Record<string, string>> = {
  '=': '=',
  '<': '<',
  '<=': '≤',
  '>': '>',
  '>=': '≥',
  '!=': '≠',
};

const negativeTerm = (e: Expr): boolean =>
  (e.k === 'int' && e.v < 0) ||
  (e.k === 'rat' && e.p < 0) ||
  (e.k === 'mul' && e.args.some((a) => (a.k === 'int' && a.v < 0) || (a.k === 'rat' && a.p < 0)));

/**
 * Chữ **trơn** của một biểu thức — cho dòng điều kiện dưới hình, và cho lời từ chối.
 *
 * Khác `unparse` ở đúng một chỗ, và chỗ ấy quyết định: `unparse` in **dư ngoặc** có
 * chủ ý để khứ hồi giữ nguyên cấu trúc, nên $x-2$ ra `(x + (-2))`. Đọc được, nhưng
 * dòng điều kiện là chữ cho **người học**, và "(x + (−2)) ≥ 0" thì không ai viết thế.
 *
 * Không dùng `typeset` vì chỗ này cần một chuỗi, không cần một hộp: dòng điều kiện in
 * bằng phông giao diện, ngang hàng với nhãn luật. Và cũng vì `lint/label-not-plain` —
 * chữ vào giao diện nguyên văn thì phải là chữ trơn, không phải LaTeX.
 */
export function toPlain(e: Expr): string {
  const wrap = (child: Expr, tight = false): string => {
    const s = toPlain(child);
    return PLAIN_PREC[child.k] < PLAIN_PREC[e.k] || (tight && PLAIN_PREC[child.k] === PLAIN_PREC[e.k])
      ? `(${s})`
      : s;
  };

  switch (e.k) {
    case 'int':
      return String(e.v).replace('-', '−');
    case 'rat':
      return `${String(e.p).replace('-', '−')}/${e.q}`;
    case 'var':
      return e.name;
    case 'inf':
      return '∞';
    case 'add':
      return e.args
        .map((a, i) => {
          const neg = negativeTerm(a);
          const body = wrap(neg ? stripSignPlain(a) : a);
          if (i === 0) return neg ? `−${body}` : body;
          return `${neg ? ' − ' : ' + '}${body}`;
        })
        .join('');
    case 'mul': {
      // Bỏ hệ số $1$ và gộp dấu âm ra đầu — `1·x` và `−1·x` là thứ không ai viết tay.
      const neg = negativeTerm(e);
      const body = neg ? stripSignPlain(e) : e;
      if (body.k !== 'mul') return `${neg ? '−' : ''}${toPlain(body)}`;
      const shown = body.args.filter((a) => !(a.k === 'int' && a.v === 1));
      // **Tích rỗng là $1$, không phải chuỗi rỗng.** Bỏ hết hệ số $1$ rồi mà không còn
      // gì thì tích ấy *bằng* $1$ — và `1 · 1` là một cây có thật: `add_equations` với
      // hệ số $1$ dựng ra đúng nó, nên $x+y=3$ cộng $x-y=1$ in ra `3 + ` — một dấu cộng
      // treo lơ lửng, không phải một công thức.
      //
      // Chỗ này **người học nhìn thấy**: `toPlain` là bộ chữ của mọi dòng điều kiện đỏ
      // (`rules.ts` gọi nó ở hai chục chỗ) và của câu trả lời "thì sao nếu" trong
      // `incident.ts`. Một điều kiện in ra `" > 0"` thì tệ hơn không có điều kiện.
      if (shown.length === 0) return `${neg ? '−' : ''}1`;
      // Dấu nhân **chỉ** ở chỗ thiếu nó thì đọc sai. Kề nhau là cách viết tay ($2x$,
      // $xy$), nhưng hai chữ số kề nhau thì dính thành một số khác: $x^2 \cdot
      // \frac1{1-x}$ in ra `x^21/(1 − x)` và đọc thành "x mũ hai mươi mốt". Nên hỏi
      // **chuỗi đã in**, không hỏi kiểu nút — kiểu nút không biết mình bắt đầu bằng gì.
      let text = '';
      for (const [i, a] of shown.entries()) {
        const s = PLAIN_PREC[a.k] < PLAIN_PREC['mul'] ? `(${toPlain(a)})` : toPlain(a);
        const glue = i > 0 && (/^[0-9]/.test(s) || a.k === 'int' || a.k === 'rat');
        text += glue ? `·${s}` : s;
      }
      return `${neg ? '−' : ''}${text}`;
    }
    case 'div':
      return `${wrap(e.num)}/${wrap(e.den, true)}`;
    case 'pow': {
      // Cơ số âm phải có ngoặc, và `PLAIN_PREC` **không** biết điều đó: nó hỏi kiểu
      // nút, mà `int(−1)` có độ ưu tiên cao nhất. Chuỗi in ra thì bắt đầu bằng dấu
      // trừ, và `−1^n` đọc thành $-(1^n) = -1$ — sai hẳn giá trị, không phải xấu.
      // Cùng bài học mà nhánh `mul` ngay trên đã học: hỏi **chuỗi đã in**, đừng hỏi
      // kiểu nút, vì kiểu nút không biết mình bắt đầu bằng gì.
      const base = wrap(e.base, true);
      return `${base.startsWith('−') ? `(${base})` : base}^${wrap(e.exp, true)}`;
    }
    case 'root':
      return e.index === 2 ? `√(${toPlain(e.arg)})` : `căn bậc ${e.index} của (${toPlain(e.arg)})`;
    case 'abs':
      return `|${toPlain(e.arg)}|`;
    case 'big': {
      const sign = e.op === 'sum' ? 'Σ' : 'Π';
      const body = PLAIN_PREC[e.body.k] <= PLAIN_PREC['big'] ? `(${toPlain(e.body)})` : toPlain(e.body);
      return `${sign}(${e.v}=${toPlain(e.from)}..${toPlain(e.to)}) ${body}`;
    }
    case 'coeff': {
      const of = PLAIN_PREC[e.of.k] <= PLAIN_PREC['coeff'] ? `(${toPlain(e.of)})` : toPlain(e.of);
      // Bậc phải bọc ngoặc khi nó không phải nguyên tử: `[x^n − k]` đọc thành
      // "$[x^n]$ trừ $k$", một biểu thức khác hẳn.
      const at = PLAIN_PREC[e.at.k] < PLAIN_PREC['pow'] ? `(${toPlain(e.at)})` : toPlain(e.at);
      return `[${e.v}^${at}] ${of}`;
    }
    case 'ufn': {
      if (e.notation !== 'sub') return `${e.name}(${e.args.map(toPlain).join(', ')})`;
      // Ngoặc nhọn chỉ khi chỉ số **không** là một nguyên tử: `a_1`, `a_n` đọc lên
      // thành "a một", "a n"; còn `a_{n+1}` thì cần ngoặc để người đọc màn hình
      // không đọc ra "a n cộng một".
      const idx = e.args[0] as Expr;
      const atom = idx.k === 'int' || idx.k === 'var';
      return atom ? `${e.name}_${toPlain(idx)}` : `${e.name}_{${toPlain(idx)}}`;
    }
    case 'fn':
      // Giai thừa của một thứ không phải nguyên tử phải có ngoặc: `x + 1!` đọc ra
      // $x + (1!)$, khác hẳn $(x+1)!$. Bảng ưu tiên không bắt được vì `fn` xếp ngang
      // nguyên tử — và đúng là thế với `C(n,k)`, chỉ riêng hậu tố `!` là không.
      return FUNCTIONS[e.name].plain(
        e.args.map((a) =>
          e.name === 'fact' && PLAIN_PREC[a.k] < PLAIN_PREC['fn'] ? `(${toPlain(a)})` : toPlain(a),
        ),
      );
    case 'rel':
      return `${wrap(e.lhs)} ${PLAIN_REL[e.op] as string} ${wrap(e.rhs)}`;
    case 'sys':
      return e.rels.map(toPlain).join(e.join === 'and' ? '; ' : ' hoặc ');
  }
}

/** Bỏ dấu âm của một hạng tử để in sau dấu $-$ đã tách ra. Chỉ dùng cho chữ trơn. */
function stripSignPlain(e: Expr): Expr {
  if (e.k === 'int') return { ...e, v: Math.abs(e.v) };
  if (e.k === 'rat') return { ...e, p: Math.abs(e.p) };
  if (e.k !== 'mul') return e;
  const at = e.args.findIndex((a) => (a.k === 'int' && a.v < 0) || (a.k === 'rat' && a.p < 0));
  if (at === -1) return e;
  const coef = e.args[at] as Expr;
  const rest = e.args.filter((_, i) => i !== at);
  if (coef.k === 'int' && coef.v === -1) {
    return rest.length === 1 ? (rest[0] as Expr) : { ...e, args: rest };
  }
  const positive: Expr =
    coef.k === 'int'
      ? { ...coef, v: -coef.v }
      : { ...(coef as Extract<Expr, { k: 'rat' }>), p: -(coef as Extract<Expr, { k: 'rat' }>).p };
  return { ...e, args: [positive, ...rest] };
}

/**
 * Chuỗi nguồn từ một cây — **không** phải để hiển thị (việc đó là của `typeset`),
 * mà để chốt canh khứ hồi `parse(unparse(e)) ≡ e` và để thông báo lỗi đọc được.
 *
 * In **dư ngoặc** một cách có chủ ý: khứ hồi cần đúng cấu trúc, không cần đẹp.
 */
export function unparse(e: Expr): string {
  switch (e.k) {
    case 'int':
      // `(-5)`, không phải `(0 - 5)`: cái sau parse ra một nút `add` hai con, tức
      // khứ hồi đổi cấu trúc. Ngoặc để nó an toàn ở mọi vị trí.
      return e.v < 0 ? `(-${-e.v})` : String(e.v);
    case 'rat':
      // `rat(p, q)`, **không** `(p / q)`: dạng sau đọc lại thành một `div`, tức khứ
      // hồi đổi kiểu nút. Bản trước in `(p / q)` và tự bào chữa bằng câu "chốt canh
      // khứ hồi không đi qua đó" — đúng, và đó chính là vấn đề: một chốt canh né đúng
      // chỗ nó sai thì nó không canh gì cả. Nay nó đi qua đủ mười sáu kiểu nút.
      return `rat(${e.p}, ${e.q})`;
    case 'var':
      return e.name;
    case 'inf':
      return 'inf';
    case 'add':
      return `(${e.args.map(unparse).join(' + ')})`;
    case 'mul':
      return `(${e.args.map(unparse).join(' * ')})`;
    case 'pow':
      // Ngoặc quanh **cả hai** phía: số mũ nay là một biểu thức bất kỳ, và `x^-2`
      // không ngoặc thì khứ hồi qua `unary` cho ra `mul[-1, 2]` thay vì `int(-2)`.
      return `(${unparse(e.base)})^(${unparse(e.exp)})`;
    case 'div':
      return `(${unparse(e.num)} / ${unparse(e.den)})`;
    case 'abs':
      return `abs(${unparse(e.arg)})`;
    case 'root':
      return e.index === 2 ? `sqrt(${unparse(e.arg)})` : `root(${e.index}, ${unparse(e.arg)})`;
    case 'big':
      return `${e.op}(${e.v}, ${unparse(e.from)}, ${unparse(e.to)}, ${unparse(e.body)})`;
    case 'coeff':
      return `coeff(${e.v}, ${unparse(e.at)}, ${unparse(e.of)})`;
    case 'ufn':
      // Chỉ số **luôn** trong ngoặc nhọn khi khứ hồi: `a_n+1` đọc lại thành
      // $a_n + 1$, và một dạng in không đọc lại được là một dạng in sai.
      return e.notation === 'sub'
        ? `${e.name}_{${unparse(e.args[0] as Expr)}}`
        : `${e.name}(${e.args.map(unparse).join(', ')})`;
    case 'fn':
      // Luôn in dạng **lời gọi**, kể cả giai thừa: `fact(n)` khứ hồi được ở mọi vị trí,
      // còn `n!` thì không — `2^n!` đọc lại thành $2^{n!}$ chứ không phải $(2^n)!$.
      return `${FUNCTIONS[e.name].source}(${e.args.map(unparse).join(', ')})`;
    case 'rel':
      return `(${unparse(e.lhs)} ${e.op} ${unparse(e.rhs)})`;
    case 'sys':
      // Không bọc ngoặc: hệ chỉ ở gốc, nên không có vị trí nào cần dấu gộp.
      //
      // In **đúng dấu nối**. Bản trước luôn dùng `;`, tức in một phép tuyển ra thành
      // một phép hội — xem chú thích ở `parse()`. Đó là chỗ duy nhất trong tệp này
      // mà một dạng in làm sai *nghĩa* chứ không chỉ sai *dáng*.
      return e.rels.map(unparse).join(e.join === 'and' ? '; ' : ' hoặc ');
  }
}
