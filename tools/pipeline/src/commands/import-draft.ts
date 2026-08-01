import { access, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  formatIssue,
  formatProblem,
  hasErrors,
  type Problem,
  type ValidationIssue,
} from '@combviz/schema';
import { createChecker } from '@combviz/check';
import { loadTaxonomy } from '../taxonomy.js';
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

  // Cổng draft chạy **đúng** bộ luật của CI, taxonomy bao gồm: một cổng lỏng hơn
  // CI chỉ dời thời điểm phát hiện lỗi sang lúc muộn hơn và đắt hơn.
  const checker = createChecker({
    fragments: ENGINE_FRAGMENTS,
    dsl: ENGINE_DSL,
    taxonomy: await loadTaxonomy(options.root),
  });

  /**
   * **Hình dạng đi trước quarantine.** Draft là dữ liệu không tin cậy (NFR-S1),
   * mà `quarantine` đi thẳng vào `.solutions.map` — một draft méo mó làm cổng
   * nổ TypeError trước khi lớp kiểm nào kịp mở miệng. Kiểm hình dạng trên bản
   * parse thô trước; qua rồi mới quarantine, rồi kiểm **lại** đúng bản sẽ được
   * ghi ra đĩa — thứ được validate phải là thứ được ghi, không phải anh em nó.
   */
  const shapeIssues = checker.check(parsed);
  if (hasErrors(shapeIssues)) {
    const shapeErrors = shapeIssues.filter((i) => i.severity === 'error').length;
    console.log(`Draft: ${String((parsed as { id?: unknown }).id ?? '(không đọc được id)')}`);
    for (const issue of shapeIssues) console.log(formatIssue(issue));
    console.log(`\nTỪ CHỐI — ${shapeErrors} lỗi. Draft không vào hàng đợi duyệt.`);
    return {
      problemId: String((parsed as { id?: unknown }).id ?? ''),
      errors: shapeErrors,
      warnings: shapeIssues.length - shapeErrors,
      stripped: 0,
      destination: '',
    };
  }

  const { problem, stripped } = quarantine(parsed);
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
    /**
     * Từ chối ghi đè đích **đã tồn tại**: một draft khai id trùng bài published
     * sẽ biến cổng nhận draft thành nút unpublish — quarantine ép status về
     * draft, bài thật biến mất khỏi index công khai, CLI vẫn exit 0. Draft mới
     * cho một bài đã có phải đi đường sửa bài trong Studio, không đi cổng này.
     */
    const occupied = await access(resolve(destination)).then(
      () => true,
      () => false,
    );
    if (occupied) {
      console.log(
        `\nTỪ CHỐI GHI — ${destination} đã tồn tại. Cổng nhận draft không ghi đè bài có sẵn;` +
          ' muốn sửa bài thật thì sửa trong Studio.',
      );
      return { problemId: problem.id, errors: errors + 1, warnings, stripped, destination };
    }
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
