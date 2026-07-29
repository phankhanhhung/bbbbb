import {
  compile,
  DETERMINISTIC_BUDGET,
  tryEvaluate,
  type CompiledExpression,
} from '@combviz/dsl';
import type {
  EngineSchemaFragment,
  Problem,
  Scene,
  Step,
  ValidationIssue,
} from '@combviz/schema';
import { parseValueMarkup } from '@combviz/schema';
import type { DslEnvironment } from '@combviz/dsl';

/**
 * Phần "chạy được" của engine: schema fragment + môi trường DSL.
 *
 * Nạp từ ngoài vào — package này không biết engine nào tồn tại, đúng như
 * `packages/schema`.
 */
export interface EngineDslModule {
  readonly fragment: EngineSchemaFragment;
  environment(scene: Scene): DslEnvironment;
}

type DslRegistry = Readonly<Record<string, EngineDslModule>>;

/**
 * Phần "eval invariant/validator mọi step" của AUT-04.
 *
 * Đây là lớp check bắt được loại lỗi mà schema và cấu trúc không thấy: biểu thức
 * gõ sai tên tập hợp, invariant tham chiếu thuộc tính không tồn tại, validator
 * khai trong `sandbox` mà engine không có. Tất cả đều im lặng lúc chạy — người
 * học chỉ thấy một ô trống ở invariant strip và không biết đó là lỗi.
 */
export function checkSemantics(problem: Problem, engines: DslRegistry): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const invariants = compileInvariants(problem, issues);
  issues.push(...checkSandbox(problem, engines));
  issues.push(...evalOnEveryStep(problem, invariants, engines));

  return issues;
}

interface CompiledInvariant {
  readonly index: number;
  readonly id: string;
  readonly expr: CompiledExpression;
}

function compileInvariants(
  problem: Problem,
  issues: ValidationIssue[],
): CompiledInvariant[] {
  const compiled: CompiledInvariant[] = [];

  (problem.invariants ?? []).forEach((invariant, index) => {
    try {
      compiled.push({ index, id: invariant.id, expr: compile(invariant.expr) });
    } catch (error) {
      issues.push({
        code: 'dsl/parse-error',
        severity: 'error',
        message: `Invariant "${invariant.id}": ${(error as Error).message}`,
        path: `/invariants/${index}/expr`,
      });
    }
  });

  return compiled;
}

function checkSandbox(problem: Problem, engines: DslRegistry): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const sandbox = problem.sandbox;
  if (!sandbox) return issues;

  // Validator tra theo engine của scene gốc: sandbox khởi tạo từ đề bài (SBX-01).
  const rootScene = firstScene(problem);
  const engineId = rootScene?.engine;
  const dsl = engineId ? engines[engineId] : undefined;

  sandbox.validators.forEach((id, i) => {
    const fragment = engineId ? dsl?.fragment : undefined;
    if (!fragment) return;

    if (!fragment.resolveValidator(id)) {
      issues.push({
        code: 'sandbox/unknown-validator',
        severity: 'error',
        message: `Engine "${engineId}" không có validator "${id}"`,
        path: `/sandbox/validators/${i}`,
        hint: `Có: ${fragment.validatorIds.join(', ')}`,
      });
    }
  });

  if (sandbox.goal_expr) {
    try {
      compile(sandbox.goal_expr);
    } catch (error) {
      issues.push({
        code: 'dsl/parse-error',
        severity: 'error',
        message: `goal_expr: ${(error as Error).message}`,
        path: '/sandbox/goal_expr',
      });
    }
  }

  return issues;
}

/**
 * Chạy mọi invariant và mọi validator đã khai trên **từng step**.
 *
 * Invariant hỏng là **lỗi**: một biểu thức không eval được thì không bao giờ là
 * chủ đích.
 *
 * Validator vi phạm chỉ là **cảnh báo**: `sandbox.validators` là luật của sandbox,
 * còn một step lời giải hoàn toàn có thể cố tình bày ra một cấu hình sai để chỉ
 * ra chỗ sai. Chặn cứng ở đây sẽ cấm mất một kiểu lập luận hợp lệ.
 */
function evalOnEveryStep(
  problem: Problem,
  invariants: readonly CompiledInvariant[],
  engines: DslRegistry,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  problem.solutions.forEach((solution, si) => {
    solution.steps.forEach((step, i) => {
      const scene = step.scene;
      const path0 = `/solutions/${si}/steps/${i}`;
      if (!scene) {
        // Step `merge_ref` không có hình, nên không có gì để tính `{{expr}}` ra.
        // Không bắt ở đây thì nó lọt qua validate rồi hiện `{{…}}` thô lên màn
        // hình — đúng loại lỗi mà cả cơ chế này sinh ra để chặn.
        for (const text of [step.narrative?.vi, step.alt_text?.vi]) {
          for (const span of parseValueMarkup(text ?? '')) {
            issues.push({
              code: 'semantics/value-without-scene',
              severity: 'error',
              message: `Step "${step.id}" dùng \`{{${span.expr}}}\` nhưng không có scene để tính`,
              path: path0,
            });
          }
        }
        return;
      }

      const dsl = engines[scene.engine];
      if (!dsl) return;

      const env = dsl.environment(scene);
      const path = `/solutions/${si}/steps/${i}`;

      for (const invariant of invariants) {
        // Ngân sách deterministic: CI không được đỏ vì runner đang tải (NFR-D2).
        const outcome = tryEvaluate(invariant.expr, env, DETERMINISTIC_BUDGET);
        if (!outcome.ok) {
          issues.push({
            code: 'dsl/eval-error',
            severity: 'error',
            message: `Invariant "${invariant.id}" lỗi tại step "${step.id}": ${outcome.error}`,
            path: `/invariants/${invariant.index}/expr`,
            hint: 'Biểu thức phải chạy được trên mọi step, không chỉ step đầu',
          });
        } else if (typeof outcome.value !== 'number') {
          issues.push({
            code: 'dsl/invariant-not-number',
            severity: 'error',
            message: `Invariant "${invariant.id}" trả về giá trị không phải số tại step "${step.id}"`,
            path: `/invariants/${invariant.index}/expr`,
            hint: 'Invariant strip (PLY-06) vẽ sparkline, nên giá trị phải là số',
          });
        }
      }

      issues.push(...checkClaims(step, env, path));
      issues.push(...checkValueMarkup(step, env, path));
      issues.push(...runValidators(problem, step, scene, path, engines));
    });
  });

  return issues;
}

/**
 * `claims` — khẳng định của lời giải, kiểm bằng chính scene của step.
 *
 * Sai là **lỗi**, không phải cảnh báo: một khẳng định sai trong lời giải toán
 * không có phiên bản "cố ý". Khác hẳn `sandbox.validators`, thứ mà một step
 * hoàn toàn có thể cố tình vi phạm để chỉ ra chỗ sai.
 */
function checkClaims(
  step: Step,
  env: DslEnvironment,
  path: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  (step.claims ?? []).forEach((claim, i) => {
    const outcome = tryEvaluate(claim, env, DETERMINISTIC_BUDGET);
    if (!outcome.ok) {
      issues.push({
        code: 'dsl/eval-error',
        severity: 'error',
        message: `Claim "${claim}" ở step "${step.id}" không chạy được: ${outcome.error}`,
        path: `${path}/claims/${i}`,
      });
      return;
    }
    if (outcome.value !== true) {
      issues.push({
        code: 'semantics/claim-false',
        severity: 'error',
        message: `Step "${step.id}" khai "${claim}" nhưng scene cho ${JSON.stringify(outcome.value)}`,
        path: `${path}/claims/${i}`,
        hint: 'Lời giải và hình đang nói hai điều khác nhau — sửa một trong hai',
      });
    }
  });

  return issues;
}

/** `{{expr}}` trong narrative và alt_text phải tính được trên scene của step. */
function checkValueMarkup(
  step: Step,
  env: DslEnvironment,
  path: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const [field, text] of [
    ['narrative', step.narrative?.vi],
    ['alt_text', step.alt_text?.vi],
  ] as const) {
    if (!text) continue;
    for (const span of parseValueMarkup(text)) {
      const outcome = tryEvaluate(span.expr, env, DETERMINISTIC_BUDGET);
      if (!outcome.ok) {
        issues.push({
          code: 'dsl/eval-error',
          severity: 'error',
          message: `\`{{${span.expr}}}\` ở step "${step.id}" không chạy được: ${outcome.error}`,
          path: `${path}/${field}/vi`,
          hint: 'Giá trị nội suy phải là biểu thức DSL chạy được trên scene của chính step này',
        });
      } else if (outcome.value === null || typeof outcome.value === 'object') {
        issues.push({
          code: 'semantics/value-not-printable',
          severity: 'error',
          message: `\`{{${span.expr}}}\` ở step "${step.id}" cho giá trị không in ra chữ được`,
          path: `${path}/${field}/vi`,
        });
      }
    }
  }

  return issues;
}

function runValidators(
  problem: Problem,
  step: Step,
  scene: Scene,
  path: string,
  engines: DslRegistry,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const dsl = engines[scene.engine];
  if (!dsl) return issues;

  const expected = new Set(step.expects_violation ?? []);
  const seen = new Set<string>();

  for (const id of problem.sandbox?.validators ?? []) {
    const validator = dsl.fragment.resolveValidator(id);
    if (!validator) continue;

    const outcome = validator.check(scene);
    if (!outcome.ok) {
      seen.add(id);
      if (expected.has(id)) continue;

      issues.push({
        code: 'validator/violated-in-step',
        severity: 'warning',
        message: `Step "${step.id}" vi phạm "${validator.label}": ${outcome.message ?? ''}`.trim(),
        path,
        hint: `Nếu là chủ đích thì khai \`expects_violation: ["${id}"]\` trên step này`,
      });
    }
  }

  // Khai thừa: step từng cố ý vi phạm nhưng scene đã đổi và giờ không vi phạm nữa.
  // Đó gần như luôn là lời giải chưa theo kịp hình.
  for (const id of expected) {
    if (seen.has(id)) continue;
    issues.push({
      code: 'validator/expected-violation-missing',
      severity: 'warning',
      message: `Step "${step.id}" khai cố ý vi phạm "${id}" nhưng thực tế không vi phạm`,
      path,
      hint: 'Scene đã đổi? Gỡ khai báo, hoặc sửa lại scene cho khớp lời giải',
    });
  }

  return issues;
}

function firstScene(problem: Problem): Scene | undefined {
  for (const solution of problem.solutions) {
    for (const step of solution.steps) {
      if (step.scene) return step.scene;
    }
  }
  return undefined;
}
