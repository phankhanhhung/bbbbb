import { DslError, type BinaryOp, type Expr, type UnaryOp } from './ast.js';
import { tokenize, type Token } from './tokenizer.js';

/**
 * Parser Pratt viết tay (D-06).
 *
 * Không dùng thư viện parser: grammar phải **đóng** (DSL-01) và sandbox phải kín
 * (DSL-02). Một generator ngoài mang theo bề mặt ngữ nghĩa mà ta không kiểm soát,
 * đúng thứ mà "nội dung problem là dữ liệu, không phải code" (NFR-S1) cấm.
 */

const BINDING_POWER: Readonly<Record<string, number>> = {
  '||': 1,
  '&&': 2,
  '==': 3,
  '!=': 3,
  '<': 4,
  '<=': 4,
  '>': 4,
  '>=': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
  '%': 6,
};

export function parse(source: string): Expr {
  const parser = new Parser(tokenize(source));
  const expr = parser.parseExpression(0);
  parser.expectEof();
  return expr;
}

class Parser {
  private index = 0;

  constructor(private readonly tokens: readonly Token[]) {}

  private peek(): Token {
    return this.tokens[this.index] as Token;
  }

  private next(): Token {
    const token = this.peek();
    this.index += 1;
    return token;
  }

  private at(type: Token['type'], value?: string): boolean {
    const token = this.peek();
    return token.type === type && (value === undefined || token.value === value);
  }

  expectEof(): void {
    if (!this.at('eof')) {
      const token = this.peek();
      throw new DslError(`Thừa "${token.value}" ở cuối biểu thức`, token.pos);
    }
  }

  parseExpression(minPower: number): Expr {
    let left = this.parseUnary();

    for (;;) {
      const token = this.peek();
      if (token.type !== 'op') break;

      const power = BINDING_POWER[token.value];
      if (power === undefined || power < minPower) break;

      this.next();
      // Mọi toán tử đều kết hợp trái: `a - b - c` là `(a - b) - c`.
      const right = this.parseExpression(power + 1);
      left = {
        kind: 'binary',
        op: token.value as BinaryOp,
        left,
        right,
        pos: token.pos,
      };
    }

    return left;
  }

  private parseUnary(): Expr {
    const token = this.peek();
    if (token.type === 'op' && (token.value === '-' || token.value === '!')) {
      this.next();
      return {
        kind: 'unary',
        op: token.value as UnaryOp,
        argument: this.parseUnary(),
        pos: token.pos,
      };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): Expr {
    let expr = this.parsePrimary();

    while (this.at('punct', '.')) {
      const dot = this.next();
      const name = this.next();
      if (name.type !== 'ident') {
        throw new DslError('Sau dấu "." phải là tên thuộc tính', name.pos);
      }
      expr = { kind: 'member', object: expr, property: name.value, pos: dot.pos };
    }

    return expr;
  }

  private parsePrimary(): Expr {
    const token = this.next();

    if (token.type === 'number') {
      return { kind: 'number', value: Number(token.value), pos: token.pos };
    }

    if (token.type === 'punct' && token.value === '(') {
      const expr = this.parseExpression(0);
      this.expectPunct(')');
      return expr;
    }

    if (token.type === 'ident') {
      if (token.value === 'true' || token.value === 'false') {
        return { kind: 'boolean', value: token.value === 'true', pos: token.pos };
      }

      // Lambda chỉ hợp lệ ngay tại đây, làm tham số của hàm tổng hợp — không phải
      // giá trị hạng nhất. Đó là ranh giới giữ DSL khỏi thành ngôn ngữ lập trình.
      if (this.at('op', '=>')) {
        this.next();
        return {
          kind: 'lambda',
          param: token.value,
          body: this.parseExpression(0),
          pos: token.pos,
        };
      }

      if (this.at('punct', '(')) {
        this.next();
        const args: Expr[] = [];
        if (!this.at('punct', ')')) {
          for (;;) {
            args.push(this.parseExpression(0));
            if (!this.at('punct', ',')) break;
            this.next();
          }
        }
        this.expectPunct(')');
        return { kind: 'call', callee: token.value, args, pos: token.pos };
      }

      return { kind: 'ident', name: token.value, pos: token.pos };
    }

    throw new DslError(
      token.type === 'eof' ? 'Biểu thức kết thúc đột ngột' : `Không hiểu "${token.value}"`,
      token.pos,
    );
  }

  private expectPunct(value: string): void {
    if (!this.at('punct', value)) {
      const token = this.peek();
      throw new DslError(`Thiếu "${value}"`, token.pos);
    }
    this.next();
  }
}
