import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';
import { formatIssue, type ValidationIssue } from '@combviz/schema';
import { createChecker } from '@combviz/check';
import { ENGINE_DSL, ENGINE_FRAGMENTS } from '../engines.js';
import { loadTaxonomy } from '../taxonomy.js';

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
  const taxonomy = await loadTaxonomy(options.root);
  const validator = createChecker({
    fragments: ENGINE_FRAGMENTS,
    dsl: ENGINE_DSL,
    taxonomy,
  });
  const files = await findProblemFiles(join(options.root, 'problems'));

  let errors = 0;
  let warnings = 0;
  /**
   * Danh tính **xuyên file** — lớp kiểm mà vòng lặp per-file không thấy được.
   * Hôm nay kho sạch (114/114 id khớp tên file, 0 trùng) nhưng đó là may chứ
   * chưa phải luật: hai file cùng id thì index-bank đếm cả hai, OG card ghi đè
   * nhau lặng lẽ, và `?p=<id>` mở bài nào tuỳ thứ tự đọc thư mục.
   */
  const fileOfId = new Map<string, string>();

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

    // Một lần gọi, đủ mọi lớp — kể cả taxonomy, thứ trước đây chỉ lệnh này chạy
    // còn Studio và `import-draft` thì không (AUT-04).
    issues.push(...validator.check(parsed, raw));

    const id = (parsed as { id?: unknown }).id;
    if (typeof id === 'string') {
      if (basename(file) !== `${id}.json`) {
        issues.push({
          code: 'content/filename-mismatch',
          severity: 'error',
          message: `Tên file "${basename(file)}" không khớp id "${id}" — phải là ${id}.json`,
          path: '/id',
          hint: 'Đường dẫn là cách người ta tìm bài; tên lệch id là hai sự thật về cùng một bài',
        });
      }
      const holder = fileOfId.get(id);
      if (holder !== undefined) {
        issues.push({
          code: 'content/duplicate-id',
          severity: 'error',
          message: `Id "${id}" đã dùng ở ${relative(options.root, holder)}`,
          path: '/id',
          hint: 'Hai file cùng id: index đếm đôi, OG card ghi đè nhau, deep-link mở bài tuỳ hên',
        });
      } else {
        fileOfId.set(id, file);
      }
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
