import {
  createValidator,
  hasErrors,
  type EngineSchemaFragment,
  type Problem,
  type ValidationIssue,
} from '@combviz/schema';
import { checkSemantics, type EngineDslModule } from './semantics.js';
import { lintProblem } from './lint.js';
import { checkTaxonomy, type Taxonomy } from './taxonomy.js';

export { checkSemantics, type EngineDslModule } from './semantics.js';
export { lintProblem } from './lint.js';
export { checkTaxonomy, type Taxonomy, type VocabEntry } from './taxonomy.js';

/**
 * Bộ kiểm đầy đủ của AUT-04, **một bộ cho ba nơi**: Studio, CLI và CI.
 *
 * Trước đây hai lớp cuối (eval invariant/validator, lint biên tập) nằm trong
 * `tools/pipeline`, và Studio không với tới được. Đó chính là mầm của tình trạng
 * mà AUT-04 tồn tại để chặn: CI xanh mà Studio đỏ, hoặc tệ hơn là ngược lại —
 * tác giả thấy bài sạch, publish, rồi CI mới nói không.
 *
 * Engine nạp vào từ ngoài, đúng như mọi chỗ khác: package này không biết engine
 * nào tồn tại.
 */
export interface CheckerOptions {
  readonly fragments: readonly EngineSchemaFragment[];
  readonly dsl: Readonly<Record<string, EngineDslModule>>;
  /**
   * Controlled vocabulary (CMS-01). Vắng thì luật tag **không chạy** — và đó là
   * một sự im lặng nguy hiểm, nên phía gọi nào cũng nên truyền vào.
   */
  readonly taxonomy?: Taxonomy;
}

export interface Checker {
  /** `raw` là nội dung file gốc, nếu có — cần cho lint định dạng (DAT-03). */
  check(problem: unknown, raw?: string): ValidationIssue[];
  readonly jsonSchema: object;
  checkFileSize(bytes: number): ValidationIssue[];
}

export function createChecker(options: CheckerOptions): Checker {
  const validator = createValidator(options.fragments);

  return {
    jsonSchema: validator.jsonSchema,
    checkFileSize: validator.checkFileSize,

    check(problem: unknown, raw?: string): ValidationIssue[] {
      const shape = validator.validateProblem(problem);
      const issues = [...shape.issues];

      // Ba lớp sau giả định hình dạng đã đúng. Chạy chúng trên dữ liệu méo sẽ sinh
      // ra lỗi giả chồng lên lỗi thật, và tác giả sẽ đi sửa nhầm chỗ.
      if (!shape.issues.some((i) => i.code.startsWith('schema/'))) {
        issues.push(...checkSemantics(problem as Problem, options.dsl));
        issues.push(...lintProblem(problem as Problem, raw));
        if (options.taxonomy) {
          issues.push(...checkTaxonomy(problem as Problem, options.taxonomy));
        }
      }

      return issues;
    },
  };
}

export { hasErrors };
