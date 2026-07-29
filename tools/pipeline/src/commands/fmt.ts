import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { formatProblem } from '@combviz/schema';

/**
 * `combviz fmt` — đưa file bài về định dạng chuẩn tắc (DAT-03).
 *
 * Mặc định chỉ kiểm, không ghi: định dạng lại cả kho là thao tác đụng vào mọi
 * file, và nó phải là một lệnh có chủ đích chứ không phải hệ quả phụ của việc
 * chạy thử một lệnh khác.
 */
export interface FmtOptions {
  root: string;
  write: boolean;
}

export interface FmtReport {
  scanned: number;
  changed: number;
}

export async function runFmt(options: FmtOptions): Promise<FmtReport> {
  const dir = join(options.root, 'problems');
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  const files = entries
    .filter((e) => e.isFile() && e.name.endsWith('.json'))
    .map((e) => join(e.parentPath ?? dir, e.name))
    .sort();

  let changed = 0;

  for (const file of files) {
    const name = relative(options.root, file);
    const raw = await readFile(file, 'utf8');
    const formatted = formatProblem(JSON.parse(raw));

    if (formatted === raw) {
      console.log(`· ${name}`);
      continue;
    }

    changed += 1;
    console.log(`${options.write ? '✓' : '→'} ${name}`);
    if (options.write) await writeFile(file, formatted, 'utf8');
  }

  console.log(
    `\n${files.length} bài, ${changed} cần định dạng lại` +
      (options.write ? ' (đã ghi)' : ' — thêm --write để ghi thật'),
  );

  return { scanned: files.length, changed };
}
