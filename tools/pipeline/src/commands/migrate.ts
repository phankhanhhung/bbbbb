import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { formatIssue, migrateProblem, SCHEMA_VERSION } from '@combviz/schema';

/**
 * `combviz migrate` — nâng toàn kho lên schema hiện tại (DAT-02).
 *
 * Chạy trên **cả kho** chứ không từng file: nâng schema là thao tác nửa vời nguy
 * hiểm nhất — một nửa kho ở phiên bản mới, một nửa ở cũ, và Player phải xử lý cả
 * hai vĩnh viễn.
 *
 * Mặc định chạy khô. Ghi đè kho phải là một hành động có ý thức, không phải hệ
 * quả của việc gõ nhầm lệnh.
 */
export interface MigrateOptions {
  root: string;
  write: boolean;
}

export interface MigrateReport {
  scanned: number;
  changed: number;
  failed: number;
}

export async function runMigrate(options: MigrateOptions): Promise<MigrateReport> {
  const dir = join(options.root, 'problems');
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  const files = entries
    .filter((e) => e.isFile() && e.name.endsWith('.json'))
    .map((e) => join(e.parentPath ?? dir, e.name))
    .sort();

  let changed = 0;
  let failed = 0;

  for (const file of files) {
    const name = relative(options.root, file);
    const raw = await readFile(file, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const before = String(parsed['schema_version'] ?? '');

    const result = migrateProblem(parsed);

    if (result.issues.length > 0) {
      failed += 1;
      console.log(`✗ ${name}`);
      for (const issue of result.issues) console.log(formatIssue(issue));
      continue;
    }

    if (result.applied.length === 0) {
      console.log(`· ${name} — đã ở ${SCHEMA_VERSION}`);
      continue;
    }

    changed += 1;
    console.log(`${options.write ? '✓' : '→'} ${name} (${before})`);
    for (const step of result.applied) console.log(`      ${step}`);

    if (options.write) {
      await writeFile(file, `${JSON.stringify(result.problem, null, 2)}\n`, 'utf8');
    }
  }

  const mode = options.write ? 'đã ghi' : 'chạy khô — thêm --write để ghi thật';
  console.log(
    `\n${files.length} bài, ${changed} cần nâng, ${failed} không nâng được (${mode})`,
  );

  return { scanned: files.length, changed, failed };
}
