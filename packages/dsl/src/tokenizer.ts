import { DslError } from './ast.js';

export type TokenType =
  | 'number'
  | 'ident'
  | 'op'
  | 'punct'
  | 'eof';

export interface Token {
  readonly type: TokenType;
  readonly value: string;
  readonly pos: number;
}

/**
 * Toán tử, xếp **dài trước ngắn**: `<=` phải được thử trước `<`, `=>` trước `=`,
 * nếu không `a <= b` sẽ đọc thành `a < (= b)` và lỗi báo ra ở sai chỗ.
 */
const OPERATORS = [
  '=>',
  '==',
  '!=',
  '<=',
  '>=',
  '&&',
  '||',
  '+',
  '-',
  '*',
  '/',
  '%',
  '<',
  '>',
  '!',
];

const PUNCT = ['(', ')', ',', '.'];

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < source.length) {
    const char = source[i] as string;

    if (/\s/.test(char)) {
      i += 1;
      continue;
    }

    if (/[0-9]/.test(char)) {
      const start = i;
      while (i < source.length && /[0-9]/.test(source[i] as string)) i += 1;
      if (source[i] === '.' && /[0-9]/.test(source[i + 1] ?? '')) {
        i += 1;
        while (i < source.length && /[0-9]/.test(source[i] as string)) i += 1;
      }
      tokens.push({ type: 'number', value: source.slice(start, i), pos: start });
      continue;
    }

    if (/[A-Za-z_]/.test(char)) {
      const start = i;
      while (i < source.length && /[A-Za-z0-9_]/.test(source[i] as string)) i += 1;
      tokens.push({ type: 'ident', value: source.slice(start, i), pos: start });
      continue;
    }

    const op = OPERATORS.find((candidate) => source.startsWith(candidate, i));
    if (op) {
      tokens.push({ type: 'op', value: op, pos: i });
      i += op.length;
      continue;
    }

    if (PUNCT.includes(char)) {
      tokens.push({ type: 'punct', value: char, pos: i });
      i += 1;
      continue;
    }

    // `=` đơn lẻ gần như luôn là gõ nhầm `==`; nói thẳng ra thay vì báo
    // "ký tự không hợp lệ".
    if (char === '=') {
      throw new DslError('Dùng `==` để so sánh; DSL không có phép gán', i);
    }

    throw new DslError(`Ký tự không hợp lệ: "${char}"`, i);
  }

  tokens.push({ type: 'eof', value: '', pos: source.length });
  return tokens;
}
