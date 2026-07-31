import {
  Minter,
  add,
  div,
  int,
  mul,
  negate,
  pow,
  rel,
  root,
  variable,
  type Expr,
  type RelOp,
} from './expr.js';

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

const RELS: readonly RelOp[] = ['<=', '!=', '=', '<'];

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

  private power(): Expr {
    const base = this.atom();
    this.ws();
    if (!this.eat('^')) return base;
    this.ws();
    const neg = this.eat('-');
    const digits = this.digits();
    if (digits === null) throw new ParseError('số mũ phải là số nguyên', this.i);
    return pow(this.m, base, neg ? -digits : digits);
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
      return `(${unparse(e.base)})^${e.exp < 0 ? `-${-e.exp}` : e.exp}`;
    case 'div':
      return `(${unparse(e.num)} / ${unparse(e.den)})`;
    case 'root':
      return e.index === 2 ? `sqrt(${unparse(e.arg)})` : `root(${e.index}, ${unparse(e.arg)})`;
    case 'rel':
      return `(${unparse(e.lhs)} ${e.op} ${unparse(e.rhs)})`;
  }
}
