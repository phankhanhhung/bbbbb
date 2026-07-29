import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  formatIssue,
  formatProblem,
  hasErrors,
  type Problem,
  type ValidationIssue,
} from '@combviz/schema';
import { createChecker } from '@combviz/check';
import { ENGINE_DSL, ENGINE_FRAGMENTS } from '../engines.js';

/**
 * `combviz import-draft` — cổng nhận draft (AUT-09 bước 3).
 *
 * Draft máy là **nội dung không tin cậy như mọi nội dung khác** (NFR-S1): nó đi
 * qua đúng bộ validate + lint mà bài soạn tay đi qua, không có đường tắt trust.
 *
 * Hai thứ bị ép, không thương lượng:
 *   - `status` về `draft`,
 *   - `verified` về `false` trên **mọi** step.
 *
 * Draft tự khai `verified: true` là kịch bản duy nhất phá được cổng AUT-09, và
 * một mô hình được đưa cho JSON Schema thì hoàn toàn có thể sinh ra nó — không
 * phải vì ác ý, mà vì trường đó nằm trong schema và nó điền cho đủ. Ép ở đây
 * biến chuyện đó thành không thể thay vì trông cậy vào việc nó không xảy ra.
 */
export interface ImportDraftOptions {
  file: string;
  root: string;
  write: boolean;
}

export interface ImportDraftReport {
  problemId: string;
  errors: number;
  warnings: number;
  stripped: number;
  destination: string;
}

export async function runImportDraft(
  options: ImportDraftOptions,
): Promise<ImportDraftReport> {
  const raw = await readFile(options.file, 'utf8');
  const parsed = JSON.parse(raw) as Problem;

  const { problem, stripped } = quarantine(parsed);

  const checker = createChecker({ fragments: ENGINE_FRAGMENTS, dsl: ENGINE_DSL });
  const issues: ValidationIssue[] = checker.check(problem);

  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.length - errors;
  const destination = join(options.root, 'problems', `${problem.id}.json`);

  console.log(`Draft: ${problem.id}`);
  if (stripped > 0) {
    console.log(
      `  Đã gỡ cờ verified khỏi ${stripped} step — draft không tự duyệt được (AUT-09)`,
    );
  }

  for (const issue of issues) console.log(formatIssue(issue));

  if (hasErrors(issues)) {
    console.log(`\nTỪ CHỐI — ${errors} lỗi. Draft không vào hàng đợi duyệt.`);
    return { problemId: problem.id, errors, warnings, stripped, destination };
  }

  console.log(
    `\nĐẠT — ${warnings} cảnh báo. Draft ${options.write ? 'đã vào' : 'sẵn sàng vào'} hàng đợi duyệt.`,
  );
  console.log(
    'Bước tiếp theo: mở Studio, đi từng step và đánh dấu verified. Publish bị khoá tới khi xong.',
  );

  if (options.write) {
    await writeFile(resolve(destination), formatProblem(problem), 'utf8');
    console.log(`Đã ghi → ${destination}`);
  }

  return { problemId: problem.id, errors, warnings, stripped, destination };
}

/** Ép draft về trạng thái chưa duyệt, và đếm xem nó đã tự khai gì. */
function quarantine(input: Problem): { problem: Problem; stripped: number } {
  let stripped = 0;

  const solutions = input.solutions.map((solution) => ({
    ...solution,
    steps: solution.steps.map((step) => {
      if (step.verified === true) stripped += 1;
      return { ...step, verified: false };
    }),
  }));

  if (input.status === 'published') stripped += 1;

  return { problem: { ...input, status: 'draft', solutions }, stripped };
}
