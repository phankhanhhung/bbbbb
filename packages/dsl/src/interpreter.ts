import { DslError, type BinaryOp, type Expr } from './ast.js';
import { CORE_BUILTINS } from './builtins.js';
import {
  isElement,
  isLambda,
  isList,
  typeName,
  type ElementValue,
  type LambdaValue,
  type Value,
} from './values.js';

/**
 * Ngân sách chạy (DSL-02).
 *
 * `maxSteps` là chốt **chính** vì nó deterministic: cùng biểu thức, cùng scene
 * thì luôn cho cùng kết quả, nên CI không thể đỏ trên máy chậm rồi xanh trên máy
 * nhanh. `maxMs` chỉ là lưới an toàn cuối cho trường hợp bệnh lý — 50ms theo
 * DSL-02, và nếu nó là thứ cắt trước thì đó là dấu hiệu `maxSteps` đặt sai.
 */
export interface Budget {
  readonly maxSteps: number;
  readonly maxMs: number;
}

export const DEFAULT_BUDGET: Budget = { maxSteps: 200_000, maxMs: 50 };

export interface DslEnvironment {
  /** Tên truy cập được: tập hợp (`cells`, `tiles`) và hằng số (`rows`, `cols`). */
  readonly bindings: Readonly<Record<string, Value>>;
  /** Builtin của engine: `covered(c)`, `deg(v)`, `attacks(p,q)`… */
  readonly builtins: Readonly<Record<string, EngineBuiltin>>;
}

export type EngineBuiltin = (args: readonly Value[], pos: number) => Value;

export interface EvalContext {
  readonly env: DslEnvironment;
  readonly budget: Budget;
  steps: number;
  readonly deadline: number;
  /** Biến do lambda ràng buộc. Không có gán, nên nó chỉ lớn thêm khi lồng lambda. */
  scope: ReadonlyMap<string, Value>;
}

export function evaluate(
  expr: Expr,
  env: DslEnvironment,
  budget: Budget = DEFAULT_BUDGET,
): Value {
  const ctx: EvalContext = {
    env,
    budget,
    steps: 0,
    deadline: now() + budget.maxMs,
    scope: new Map(),
  };
  return evalExpr(expr, ctx);
}

function now(): number {
  return typeof performance === 'object' ? performance.now() : Date.now();
}

export function evalExpr(expr: Expr, ctx: EvalContext): Value {
  ctx.steps += 1;
  if (ctx.steps > ctx.budget.maxSteps) {
    throw new DslError(
      `Biểu thức vượt ngân sách ${ctx.budget.maxSteps} bước — nhiều khả năng đang duyệt một tập quá lớn`,
      expr.pos,
    );
  }
  // Kiểm giờ thưa thớt: gọi đồng hồ mỗi bước còn tốn hơn cả phép tính.
  if ((ctx.steps & 2047) === 0 && now() > ctx.deadline) {
    throw new DslError(`Biểu thức chạy quá ${ctx.budget.maxMs}ms, đã cắt`, expr.pos);
  }

  switch (expr.kind) {
    case 'number':
      return expr.value;

    case 'boolean':
      return expr.value;

    case 'ident': {
      const scoped = ctx.scope.get(expr.name);
      if (scoped !== undefined) return scoped;

      // `Object.hasOwn`, không phải `bindings[name] !== undefined`: tra thẳng sẽ
      // rơi xuống `Object.prototype`, và `constructor` / `toString` / `valueOf`
      // trở thành tên hợp lệ trỏ vào nội tại của JS. Nội dung problem là dữ liệu
      // (NFR-S1) — nó không được với tới bất cứ thứ gì ngoài môi trường ta trao.
      if (Object.hasOwn(ctx.env.bindings, expr.name)) {
        return ctx.env.bindings[expr.name] as Value;
      }

      throw new DslError(
        `Không có tên "${expr.name}". Có: ${Object.keys(ctx.env.bindings).sort().join(', ')}`,
        expr.pos,
      );
    }

    case 'member': {
      const object = evalExpr(expr.object, ctx);
      if (!isElement(object)) {
        throw new DslError(
          `Chỉ element mới có thuộc tính, "${expr.property}" đang đọc trên ${typeName(object)}`,
          expr.pos,
        );
      }
      if (!Object.hasOwn(object.props, expr.property)) {
        throw new DslError(
          `Element "${object.id}" không có thuộc tính "${expr.property}". Có: ${Object.keys(
            object.props,
          ).join(', ')}`,
          expr.pos,
        );
      }
      return object.props[expr.property] as Value;
    }

    case 'unary': {
      const argument = evalExpr(expr.argument, ctx);
      if (expr.op === '-') {
        if (typeof argument !== 'number') {
          throw new DslError(`Không đổi dấu được ${typeName(argument)}`, expr.pos);
        }
        return -argument;
      }
      if (typeof argument !== 'boolean') {
        throw new DslError(`"!" cần giá trị đúng/sai, nhận ${typeName(argument)}`, expr.pos);
      }
      return !argument;
    }

    case 'binary':
      return evalBinary(expr.op, expr, ctx);

    case 'call':
      return evalCall(expr, ctx);

    case 'lambda':
      return { kind: 'lambda', param: expr.param, body: expr.body } satisfies LambdaValue;
  }
}

function evalBinary(
  op: BinaryOp,
  expr: Extract<Expr, { kind: 'binary' }>,
  ctx: EvalContext,
): Value {
  // && và || cắt ngắn: `exists(...) && count(...) > 0` không nên trả giá cho vế
  // phải khi vế trái đã quyết định kết quả.
  if (op === '&&' || op === '||') {
    const left = expectBoolean(evalExpr(expr.left, ctx), op, expr.pos);
    if (op === '&&' && !left) return false;
    if (op === '||' && left) return true;
    return expectBoolean(evalExpr(expr.right, ctx), op, expr.pos);
  }

  const left = evalExpr(expr.left, ctx);
  const right = evalExpr(expr.right, ctx);

  if (op === '==' || op === '!=') {
    const equal = valuesEqual(left, right);
    return op === '==' ? equal : !equal;
  }

  if (typeof left !== 'number' || typeof right !== 'number') {
    throw new DslError(
      `"${op}" cần hai số, nhận ${typeName(left)} và ${typeName(right)}`,
      expr.pos,
    );
  }

  switch (op) {
    case '+':
      return left + right;
    case '-':
      return left - right;
    case '*':
      return left * right;
    case '/':
      if (right === 0) throw new DslError('Chia cho 0', expr.pos);
      return left / right;
    case '%':
      if (right === 0) throw new DslError('Chia lấy dư cho 0', expr.pos);
      return left % right;
    case '<':
      return left < right;
    case '<=':
      return left <= right;
    case '>':
      return left > right;
    case '>=':
      return left >= right;
  }
}

function expectBoolean(value: Value, op: string, pos: number): boolean {
  if (typeof value !== 'boolean') {
    throw new DslError(`"${op}" cần giá trị đúng/sai, nhận ${typeName(value)}`, pos);
  }
  return value;
}

/** Hai element bằng nhau khi cùng id — danh tính, không phải nội dung (DAT-12). */
function valuesEqual(a: Value, b: Value): boolean {
  if (isElement(a) && isElement(b)) return a.id === b.id;
  if (isLambda(a) || isLambda(b)) return false;
  if (isList(a) || isList(b)) return false;
  return a === b;
}

function evalCall(expr: Extract<Expr, { kind: 'call' }>, ctx: EvalContext): Value {
  // Cùng lý do với tra tên: `CORE_BUILTINS['constructor']` mà tra thẳng sẽ trả về
  // một hàm của JS và biến `constructor(...)` thành lời gọi thật.
  if (Object.hasOwn(CORE_BUILTINS, expr.callee)) {
    return (CORE_BUILTINS[expr.callee] as (e: typeof expr, c: EvalContext) => Value)(
      expr,
      ctx,
    );
  }

  if (Object.hasOwn(ctx.env.builtins, expr.callee)) {
    const engine = ctx.env.builtins[expr.callee] as (
      args: readonly Value[],
      pos: number,
    ) => Value;
    const args = expr.args.map((arg) => evalExpr(arg, ctx));
    return engine(args, expr.pos);
  }

  const known = [...Object.keys(CORE_BUILTINS), ...Object.keys(ctx.env.builtins)].sort();
  throw new DslError(
    `Không có hàm "${expr.callee}". Có: ${known.join(', ')}`,
    expr.pos,
  );
}

/** Gọi một lambda với đúng một tham số. Dùng bởi các hàm tổng hợp. */
export function applyLambda(
  lambda: LambdaValue,
  argument: ElementValue | Value,
  ctx: EvalContext,
): Value {
  const previous = ctx.scope;
  const scope = new Map(previous);
  scope.set(lambda.param, argument);
  ctx.scope = scope;
  try {
    return evalExpr(lambda.body, ctx);
  } finally {
    ctx.scope = previous;
  }
}
