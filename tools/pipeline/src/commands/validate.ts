import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { createValidator, formatIssue, type ValidationIssue } from '@combviz/schema';
import { ENGINE_FRAGMENTS } from '../engines.js';
import { checkTaxonomy, loadTaxonomy } from '../taxonomy.js';

export interface ValidateOptions {
  /** Thư mục content (chứa `problems/` và `taxonomy/`). */
  root: string;
  /** Coi warning là lỗi. CI dùng cờ này khi kho đã đủ sạch. */
  strict: boolean;
}

export interface ValidateReport {
  files: number;
  errors: number;
  warnings: number;
}

export async function runValidate(options: ValidateOptions): Promise<ValidateReport> {
  const validator = createValidator(ENGINE_FRAGMENTS);
  const taxonomy = await loadTaxonomy(options.root);
  const files = await findProblemFiles(join(options.root, 'problems'));

  let errors = 0;
  let warnings = 0;

  for (const file of files.sort()) {
    const issues: ValidationIssue[] = [];
    const raw = await readFile(file, 'utf8');
    const size = (await stat(file)).size;

    issues.push(...validator.checkFileSize(size));

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      issues.push({
        code: 'io/invalid-json',
        severity: 'error',
        message: `Không parse được JSON: ${(error as Error).message}`,
        path: '',
      });
      report(file, issues, options.root);
      errors += 1;
      continue;
    }

    const result = validator.validateProblem(parsed);
    issues.push(...result.issues);

    // Taxonomy chỉ chạy khi hình dạng đã đúng — nếu không thì `problem.topics`
    // có thể không tồn tại và ta sẽ báo lỗi giả chồng lên lỗi thật.
    if (result.ok || !result.issues.some((i) => i.code.startsWith('schema/'))) {
      issues.push(...checkTaxonomy(parsed as never, taxonomy));
    }

    const fileErrors = issues.filter((i) => i.severity === 'error').length;
    const fileWarnings = issues.filter((i) => i.severity === 'warning').length;
    errors += fileErrors;
    warnings += fileWarnings;

    report(file, issues, options.root);
  }

  const failed = errors > 0 || (options.strict && warnings > 0);
  const verdict = failed ? 'THẤT BẠI' : 'ĐẠT';
  console.log(
    `\n${verdict} — ${files.length} bài, ${errors} lỗi, ${warnings} cảnh báo` +
      (options.strict ? ' (strict: cảnh báo tính là lỗi)' : ''),
  );

  return { files: files.length, errors, warnings };
}

function report(file: string, issues: ValidationIssue[], root: string): void {
  const name = relative(root, file);
  if (issues.length === 0) {
    console.log(`✓ ${name}`);
    return;
  }
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  console.log(`${errorCount > 0 ? '✗' : '!'} ${name}`);
  for (const issue of issues) {
    console.log(formatIssue(issue));
  }
}

async function findProblemFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.json'))
    .map((e) => join(e.parentPath ?? dir, e.name));
}
