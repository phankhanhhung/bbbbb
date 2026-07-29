import { DslError, type Expr } from './ast.js';
import { parse } from './parser.js';
import {
  DEFAULT_BUDGET,
  evaluate,
  type Budget,
  type DslEnvironment,
} from './interpreter.js';
import type { Value } from './values.js';

export { DslError, type Expr, type BinaryOp, type UnaryOp } from './ast.js';
export { parse } from './parser.js';
export { tokenize, type Token } from './tokenizer.js';
export {
  evaluate,
  applyLambda,
  DEFAULT_BUDGET,
  DETERMINISTIC_BUDGET,
  type Budget,
  type DslEnvironment,
  type EngineBuiltin,
  type EvalContext,
} from './interpreter.js';
export {
  element,
  isElement,
  isLambda,
  isList,
  typeName,
  type Value,
  type ElementValue,
  type LambdaValue,
} from './values.js';

/**
 * Biểu thức đã phân tích, dùng lại được.
 *
 * Invariant strip (PLY-06) chạy cùng một biểu thức trên từng step của cả nhánh;
 * parse lại mỗi lần là lãng phí có thể đo được ở NFR-P2. Parse một lần lúc mở
 * bài, eval nhiều lần.
 */
export interface CompiledExpression {
  readonly source: string;
  readonly ast: Expr;
  run(env: DslEnvironment, budget?: Budget): Value;
}

export function compile(source: string): CompiledExpression {
  const ast = parse(source);
  return {
    source,
    ast,
    run: (env, budget = DEFAULT_BUDGET) => evaluate(ast, env, budget),
  };
}

export interface EvalOutcome {
  readonly ok: boolean;
  readonly value?: Value;
  readonly error?: string;
  readonly pos?: number;
}

/**
 * Chạy một biểu thức và **không bao giờ ném**.
 *
 * Player và validate cần chạy hàng loạt biểu thức của nội dung không tin cậy
 * (NFR-S1, kể cả draft máy ở AUT-09); một biểu thức hỏng phải làm hỏng đúng ô
 * hiển thị của nó, không làm trắng cả trang.
 */
export function tryEvaluate(
  expression: CompiledExpression | string,
  env: DslEnvironment,
  budget: Budget = DEFAULT_BUDGET,
): EvalOutcome {
  try {
    const compiled = typeof expression === 'string' ? compile(expression) : expression;
    return { ok: true, value: compiled.run(env, budget) };
  } catch (error) {
    if (error instanceof DslError) {
      return { ok: false, error: error.message, pos: error.pos };
    }
    return { ok: false, error: (error as Error).message };
  }
}
