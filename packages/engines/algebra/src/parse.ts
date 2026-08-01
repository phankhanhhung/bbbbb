import {
  Minter,
  add,
  div,
  fn,
  int,
  mul,
  negate,
  abs,
  pow,
  rel,
  root,
  variable,
  type Expr,
  type FnName,
  type RelOp,
} from './expr.js';
import { FUNCTIONS } from './functions.js';

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
const NAMED_FNS: ReadonlyArray<readonly [string, FnName]> = [
  ['fact', 'fact'],
  ['C', 'binom'],
  ['A', 'perm'],
];

class Parser {
  private i = 0;

  constructor(
    private readonly src: string,
    private readonly m: Minter,
  ) {}

  parse(): Expr {
    const e = this.rel();
    this.ws();
    if (this.i < this.src.length) {
      throw new ParseError(`thừa ký tự "${this.src.slice(this.i)}"`, this.i);
    }
    return e;
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

    if (/[a-zA-Z]/.test(ch)) {
      this.i += 1;
      let name = ch;
      // Chỉ số dưới một chữ số: `a_1`. Đủ cho dãy, không mở cửa cho tên nhiều chữ.
      if (this.src[this.i] === '_' && /[0-9]/.test(this.src[this.i + 1] ?? '')) {
        name += `_${this.src[this.i + 1] as string}`;
        this.i += 2;
      }
      return variable(this.m, name);
    }

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
  rel: 0,
  add: 1,
  mul: 2,
  div: 2,
  pow: 3,
  root: 4,
  abs: 4,
  fn: 4,
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
      const text = shown
        .map((a, i) => {
          const s = PLAIN_PREC[a.k] < PLAIN_PREC['mul'] ? `(${toPlain(a)})` : toPlain(a);
          return i > 0 && (a.k === 'int' || a.k === 'rat') ? `·${s}` : s;
        })
        .join('');
      return `${neg ? '−' : ''}${text}`;
    }
    case 'div':
      return `${wrap(e.num)}/${wrap(e.den, true)}`;
    case 'pow':
      return `${wrap(e.base, true)}^${wrap(e.exp, true)}`;
    case 'root':
      return e.index === 2 ? `√(${toPlain(e.arg)})` : `căn bậc ${e.index} của (${toPlain(e.arg)})`;
    case 'abs':
      return `|${toPlain(e.arg)}|`;
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
      // Parser không bao giờ sinh `rat` (nó sinh `div`), nên nhánh này chỉ gặp trên
      // cây do luật `eval_int` dựng ra — và chốt canh khứ hồi không đi qua đó.
      return `(${e.p} / ${e.q})`;
    case 'var':
      return e.name;
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
    case 'fn':
      // Luôn in dạng **lời gọi**, kể cả giai thừa: `fact(n)` khứ hồi được ở mọi vị trí,
      // còn `n!` thì không — `2^n!` đọc lại thành $2^{n!}$ chứ không phải $(2^n)!$.
      return `${FUNCTIONS[e.name].source}(${e.args.map(unparse).join(', ')})`;
    case 'rel':
      return `(${unparse(e.lhs)} ${e.op} ${unparse(e.rhs)})`;
  }
}
