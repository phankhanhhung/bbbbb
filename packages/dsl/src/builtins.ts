import { DslError, type Expr } from './ast.js';
import { isLambda, isList, typeName, type Value } from './values.js';
import type { EvalContext } from './interpreter.js';
import { applyLambda, evalExpr } from './interpreter.js';

type CallExpr = Extract<Expr, { kind: 'call' }>;
type CoreBuiltin = (expr: CallExpr, ctx: EvalContext) => Value;

/**
 * Hàm tổng hợp — **chỗ duy nhất** trong DSL có lặp (DSL-01).
 *
 * Chúng nhận `expr` chưa eval thay vì mảng giá trị, vì lambda phải được gọi lại
 * cho từng phần tử; eval trước sẽ biến lambda thành một giá trị vô dụng.
 */
export const CORE_BUILTINS: Readonly<Record<string, CoreBuiltin>> = {
  count(expr, ctx) {
    const list = expectList(expr, ctx, 0, 'count');
    if (expr.args.length === 1) return list.length;

    const predicate = expectLambda(expr, ctx, 1, 'count');
    let total = 0;
    for (const item of list) {
      if (asBoolean(applyLambda(predicate, item, ctx), expr.pos, 'count')) total += 1;
    }
    return total;
  },

  sum(expr, ctx) {
    const list = expectList(expr, ctx, 0, 'sum');
    const project = expectLambda(expr, ctx, 1, 'sum');
    let total = 0;
    for (const item of list) {
      total += asNumber(applyLambda(project, item, ctx), expr.pos, 'sum');
    }
    return total;
  },

  min: extremum('min', (a, b) => a < b),
  max: extremum('max', (a, b) => a > b),

  forall(expr, ctx) {
    const list = expectList(expr, ctx, 0, 'forall');
    const predicate = expectLambda(expr, ctx, 1, 'forall');
    for (const item of list) {
      if (!asBoolean(applyLambda(predicate, item, ctx), expr.pos, 'forall')) return false;
    }
    return true;
  },

  exists(expr, ctx) {
    const list = expectList(expr, ctx, 0, 'exists');
    const predicate = expectLambda(expr, ctx, 1, 'exists');
    for (const item of list) {
      if (asBoolean(applyLambda(predicate, item, ctx), expr.pos, 'exists')) return true;
    }
    return false;
  },

  abs: unaryMath('abs', Math.abs),
  floor: unaryMath('floor', Math.floor),
  ceil: unaryMath('ceil', Math.ceil),
};

function extremum(name: string, better: (a: number, b: number) => boolean): CoreBuiltin {
  return (expr, ctx) => {
    const list = expectList(expr, ctx, 0, name);
    const project = expectLambda(expr, ctx, 1, name);

    // Tập rỗng không có min/max. Trả 0 sẽ nói dối một cách im lặng — và trong lập
    // luận cực trị (PRN-05) thì "không có phần tử nào" là thông tin, không phải 0.
    if (list.length === 0) {
      throw new DslError(`${name}() trên tập rỗng`, expr.pos);
    }

    let best = asNumber(applyLambda(project, list[0] as Value, ctx), expr.pos, name);
    for (let i = 1; i < list.length; i += 1) {
      const value = asNumber(applyLambda(project, list[i] as Value, ctx), expr.pos, name);
      if (better(value, best)) best = value;
    }
    return best;
  };
}

function unaryMath(name: string, fn: (value: number) => number): CoreBuiltin {
  return (expr, ctx) => {
    expectArity(expr, 1, name);
    return fn(asNumber(evalExpr(expr.args[0] as Expr, ctx), expr.pos, name));
  };
}

function expectArity(expr: CallExpr, arity: number, name: string): void {
  if (expr.args.length !== arity) {
    throw new DslError(
      `${name}() cần ${arity} tham số, nhận ${expr.args.length}`,
      expr.pos,
    );
  }
}

function expectList(
  expr: CallExpr,
  ctx: EvalContext,
  index: number,
  name: string,
): readonly Value[] {
  if (expr.args.length <= index) {
    throw new DslError(`${name}() thiếu tham số thứ ${index + 1} (tập hợp)`, expr.pos);
  }
  const value = evalExpr(expr.args[index] as Expr, ctx);
  if (!isList(value)) {
    throw new DslError(
      `${name}() cần tập hợp ở tham số ${index + 1}, nhận ${typeName(value)}`,
      expr.pos,
    );
  }
  return value;
}

function expectLambda(
  expr: CallExpr,
  ctx: EvalContext,
  index: number,
  name: string,
) {
  if (expr.args.length <= index) {
    throw new DslError(
      `${name}() thiếu tham số thứ ${index + 1} — viết dạng \`x => …\``,
      expr.pos,
    );
  }
  const value = evalExpr(expr.args[index] as Expr, ctx);
  if (!isLambda(value)) {
    throw new DslError(
      `${name}() cần hàm \`x => …\` ở tham số ${index + 1}, nhận ${typeName(value)}`,
      expr.pos,
    );
  }
  return value;
}

function asNumber(value: Value, pos: number, name: string): number {
  if (typeof value !== 'number') {
    throw new DslError(`${name}() cần kết quả là số, nhận ${typeName(value)}`, pos);
  }
  return value;
}

function asBoolean(value: Value, pos: number, name: string): boolean {
  if (typeof value !== 'boolean') {
    throw new DslError(
      `${name}() cần kết quả đúng/sai, nhận ${typeName(value)}`,
      pos,
    );
  }
  return value;
}
