import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';

import { Problem as ProblemSchema } from './problem.js';
import { FORBIDDEN_STYLE_KEYS } from './element.js';
import { checkStructure } from './structure.js';
import { createEngineRegistry, type EngineSchemaFragment } from './engine-registry.js';
import { GLOBAL_BOUNDS } from './bounds.js';
import { hasErrors, type ValidationIssue, type ValidationResult } from './issues.js';
import type { Problem } from './problem.js';
import type { Scene } from './scene.js';

export interface Validator {
  /** JSON Schema công bố kèm repo (DAT-01). */
  readonly jsonSchema: object;
  validateProblem(data: unknown): ValidationResult;
  /** NFR-P4: file problem ≤ 1MB. Tách riêng vì chỉ có ý nghĩa khi đọc từ đĩa. */
  checkFileSize(bytes: number): ValidationIssue[];
}

/**
 * Dựng bộ validate dùng chung cho Studio, CLI và CI (AUT-04).
 *
 * Ba nơi này **phải** chạy đúng một bộ luật — nếu không, CI xanh mà Studio đỏ
 * (hoặc tệ hơn: ngược lại) và niềm tin vào validate biến mất.
 */
export function createValidator(
  fragments: readonly EngineSchemaFragment[] = [],
): Validator {
  const ajv = new Ajv({ allErrors: true, strict: false, allowUnionTypes: true });
  addFormats(ajv);

  const validateShape = ajv.compile(ProblemSchema);
  const engines = createEngineRegistry(fragments);

  const configValidators = new Map<string, ValidateFunction>();
  const elementValidators = new Map<string, Map<string, ValidateFunction>>();
  for (const fragment of fragments) {
    configValidators.set(fragment.id, ajv.compile(fragment.configSchema));
    elementValidators.set(
      fragment.id,
      new Map(
        Object.entries(fragment.elementSchemas).map(([type, schema]) => [
          type,
          ajv.compile(schema),
        ]),
      ),
    );
  }

  function validateProblem(data: unknown): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (!validateShape(data)) {
      issues.push(...(validateShape.errors ?? []).map((e) => toIssue(e)));
      // Dừng ở đây: các lượt sau giả định hình dạng đã đúng, chạy tiếp chỉ sinh
      // ra tiếng ồn che mất lỗi thật.
      return { ok: false, issues };
    }

    const problem = data as Problem;

    issues.push(...validateScenes(problem));
    issues.push(...checkStructure(problem, engines));

    return { ok: !hasErrors(issues), issues };
  }

  function validateScenes(problem: Problem): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    problem.solutions.forEach((solution, si) => {
      solution.steps.forEach((step, i) => {
        if (!step.scene) return;
        const path = `/solutions/${si}/steps/${i}/scene`;
        issues.push(...validateScene(step.scene, path));
      });
    });

    return issues;
  }

  function validateScene(scene: Scene, path: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    const validateConfig = configValidators.get(scene.engine);
    const byType = elementValidators.get(scene.engine);
    if (!validateConfig || !byType) {
      issues.push({
        code: 'scene/unknown-engine',
        severity: 'error',
        message: `Scene dùng engine "${scene.engine}" chưa được đăng ký`,
        path: `${path}/engine`,
        hint: `Engine đã có: ${[...engines.keys()].join(', ') || '(chưa có engine nào)'}`,
      });
      return issues;
    }

    if (!validateConfig(scene.config)) {
      issues.push(
        ...(validateConfig.errors ?? []).map((e) => toIssue(e, `${path}/config`)),
      );
    }

    const seenIds = new Set<string>();
    scene.elements.forEach((element, ei) => {
      const elementPath = `${path}/elements/${ei}`;
      const type = (element as { type?: unknown }).type;

      if (typeof type !== 'string') {
        issues.push({
          code: 'scene/element-missing-type',
          severity: 'error',
          message: 'Element thiếu trường "type"',
          path: elementPath,
          hint: `Engine "${scene.engine}" nhận: ${[...byType.keys()].join(', ')}`,
        });
      } else {
        const validateElement = byType.get(type);
        if (!validateElement) {
          issues.push({
            code: 'scene/unknown-element-type',
            severity: 'error',
            message: `Engine "${scene.engine}" không có loại element "${type}"`,
            path: `${elementPath}/type`,
            hint: `Loại hợp lệ: ${[...byType.keys()].join(', ')}`,
          });
        } else if (!validateElement(element)) {
          issues.push(
            ...(validateElement.errors ?? []).map((e) => toIssue(e, elementPath)),
          );
        }
      }

      const id = (element as { id?: unknown }).id;
      if (typeof id === 'string') {
        if (seenIds.has(id)) {
          issues.push({
            code: 'scene/duplicate-element-id',
            severity: 'error',
            message: `Element id "${id}" bị trùng trong cùng một scene`,
            path: `${elementPath}/id`,
            hint: 'Id phải ổn định và duy nhất — auto-diff nhận diện element theo id (DAT-12)',
          });
        }
        seenIds.add(id);
      }
    });

    return issues;
  }

  function checkFileSize(bytes: number): ValidationIssue[] {
    if (bytes <= GLOBAL_BOUNDS.maxProblemFileBytes) return [];
    return [
      {
        code: 'bounds/file-too-large',
        severity: 'error',
        message: `File ${(bytes / 1024).toFixed(0)}KB vượt trần ${
          GLOBAL_BOUNDS.maxProblemFileBytes / 1024
        }KB`,
        path: '',
        hint: 'NFR-P4. Thường là dấu hiệu scene lặp thừa hoặc asset nhúng inline',
      },
    ];
  }

  return { jsonSchema: ProblemSchema as object, validateProblem, checkFileSize };
}

// ---------------------------------------------------------------------------

/**
 * Dịch lỗi Ajv sang `ValidationIssue`.
 *
 * Thông báo mặc định của Ajv đúng nhưng không dạy được gì. Trường hợp quan trọng
 * nhất là `additionalProperties`: khi tác giả viết `"color": "#f00"` thay vì
 * `color_class`, đó chính là lúc DAT-20 cần giải thích *vì sao* nó bị cấm, chứ
 * không phải nói "must NOT have additional properties".
 */
function toIssue(error: ErrorObject, pathPrefix = ''): ValidationIssue {
  const path = `${pathPrefix}${error.instancePath}`;

  if (error.keyword === 'additionalProperties') {
    const key = String((error.params as { additionalProperty?: string }).additionalProperty);
    const styleHint = FORBIDDEN_STYLE_KEYS[key];
    if (styleHint) {
      return {
        code: 'schema/forbidden-style-field',
        severity: 'error',
        message: `Trường "${key}" bị cấm: file problem không chứa thông tin hiển thị`,
        path,
        hint: styleHint,
      };
    }
    return {
      code: 'schema/unknown-field',
      severity: 'error',
      message: `Trường "${key}" không có trong schema`,
      path,
      hint: 'Schema là whitelist đóng (DAT-20) — gõ sai tên trường sẽ rơi vào đây',
    };
  }

  if (error.keyword === 'required') {
    const key = String((error.params as { missingProperty?: string }).missingProperty);
    return {
      code: 'schema/missing-field',
      severity: 'error',
      message: `Thiếu trường bắt buộc "${key}"`,
      path,
    };
  }

  if (error.keyword === 'pattern') {
    return {
      code: 'schema/bad-format',
      severity: 'error',
      message: `Giá trị không đúng định dạng (${
        (error.params as { pattern?: string }).pattern ?? ''
      })`,
      path,
    };
  }

  return {
    code: `schema/${error.keyword}`,
    severity: 'error',
    message: error.message ?? 'Không hợp lệ',
    path,
  };
}
