import {
  compile,
  DETERMINISTIC_BUDGET,
  tryEvaluate,
  type CompiledExpression,
} from '@combviz/dsl';
import type { Problem, Scene, ValidationIssue } from '@combviz/schema';
import { ENGINE_DSL } from './engines.js';

/**
 * Phần "eval invariant/validator mọi step" của AUT-04.
 *
 * Đây là lớp check bắt được loại lỗi mà schema và cấu trúc không thấy: biểu thức
 * gõ sai tên tập hợp, invariant tham chiếu thuộc tính không tồn tại, validator
 * khai trong `sandbox` mà engine không có. Tất cả đều im lặng lúc chạy — người
 * học chỉ thấy một ô trống ở invariant strip và không biết đó là lỗi.
 */
export function checkSemantics(problem: Problem): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const invariants = compileInvariants(problem, issues);
  issues.push(...checkSandbox(problem));
  issues.push(...evalOnEveryStep(problem, invariants));

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

function checkSandbox(problem: Problem): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const sandbox = problem.sandbox;
  if (!sandbox) return issues;

  // Validator tra theo engine của scene gốc: sandbox khởi tạo từ đề bài (SBX-01).
  const rootScene = firstScene(problem);
  const engineId = rootScene?.engine;
  const dsl = engineId ? ENGINE_DSL[engineId] : undefined;

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
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  problem.solutions.forEach((solution, si) => {
    solution.steps.forEach((step, i) => {
      const scene = step.scene;
      if (!scene) return;

      const dsl = ENGINE_DSL[scene.engine];
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

      issues.push(...runValidators(problem, scene, step.id, path));
    });
  });

  return issues;
}

function runValidators(
  problem: Problem,
  scene: Scene,
  stepId: string,
  path: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const dsl = ENGINE_DSL[scene.engine];
  if (!dsl) return issues;

  for (const id of problem.sandbox?.validators ?? []) {
    const validator = dsl.fragment.resolveValidator(id);
    if (!validator) continue;

    const outcome = validator.check(scene);
    if (!outcome.ok) {
      issues.push({
        code: 'validator/violated-in-step',
        severity: 'warning',
        message: `Step "${stepId}" vi phạm "${validator.label}": ${outcome.message ?? ''}`.trim(),
        path,
        hint:
          'Nếu là chủ đích (bày ra cấu hình sai để chỉ chỗ sai) thì bỏ qua; ' +
          'nếu không thì đây là lỗi soạn bài',
      });
    }
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
