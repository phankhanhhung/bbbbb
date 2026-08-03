import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Problem, Scene } from '@combviz/schema';
import { buildAtlas } from '../labels.js';

/**
 * D-07 — dựng label atlas cho **cả kho**.
 *
 * Chạy tay khi thêm công thức mới (`--write`), và chạy ở CI để canh atlas có cũ
 * so với nội dung không (mặc định). Không tự chạy trong `validate`: dựng MathJax
 * cho vài chục công thức mất vài giây, mà `validate` là thứ tác giả gõ liên tục.
 *
 * Đây là cùng một quyết định với golden SVG: sinh ra thì phải **cam kết vào git**,
 * để diff nhìn thấy được và để không ai phải cài MathJax mới xem được hình.
 */
export const ATLAS_FILE = 'labels.json';

export interface LabelsOptions {
  root: string;
  write: boolean;
}

export interface LabelsResult {
  readonly total: number;
  readonly stale: boolean;
  readonly missing: readonly string[];
  readonly extra: readonly string[];
  readonly failures: readonly { tex: string; message: string }[];
}

export async function runLabels(options: LabelsOptions): Promise<LabelsResult> {
  const wanted = await collect(options.root);
  const { atlas, failures } = buildAtlas(wanted);

  const path = join(options.root, ATLAS_FILE);
  const current = await readAtlas(path);
  const have = new Set(Object.keys(current?.entries ?? {}));

  const missing = wanted.filter((tex) => !have.has(tex));
  const extra = [...have].filter((tex) => !wanted.includes(tex));
  const stale = missing.length > 0 || extra.length > 0;

  if (options.write) {
    // Xuống dòng theo từng entry: một công thức mới phải hiện ra thành **một**
    // dòng thêm trong diff, không phải một dòng dài 40KB đổi toàn bộ.
    const body = Object.entries(atlas.entries)
      .map(([tex, entry]) => `  ${JSON.stringify(tex)}: ${JSON.stringify(entry)}`)
      .join(',\n');
    await writeFile(
      path,
      `{\n  "version": ${JSON.stringify(atlas.version)},\n  "entries": {\n${body}\n  }\n}\n`,
      'utf8',
    );
  }

  return { total: wanted.length, stale, missing, extra, failures };
}

async function readAtlas(
  path: string,
): Promise<{ entries: Record<string, unknown> } | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as { entries: Record<string, unknown> };
  } catch {
    return null;
  }
}

/**
 * Thu mọi chuỗi LaTeX **cần dựng path**, từ toàn kho.
 *
 * Quy ước một dòng: trường `tex` của element. Cố ý không đi tìm `$…$` trong
 * narrative — chữ trong narrative do KaTeX lo lúc chạy và nó nằm trong HTML, nơi
 * `foreignObject` không phải vấn đề. Chỉ nhãn **trong canvas** mới cần atlas.
 */
async function collect(root: string): Promise<string[]> {
  const dir = join(root, 'problems');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
  const out = new Set<string>();

  for (const file of files) {
    const problem = JSON.parse(await readFile(join(dir, file), 'utf8')) as Problem;
    for (const solution of problem.solutions ?? []) {
      for (const step of solution.steps ?? []) {
        addScene(out, step.scene);
        addScene(out, step.bijection?.scene);
        addScene(out, step.sandbox?.scene);
      }
    }
  }

  return [...out].sort();
}

function addScene(out: Set<string>, scene: Scene | undefined): void {
  if (!scene) return;
  for (const element of scene.elements ?? []) {
    const tex = (element as Record<string, unknown>)['tex'];
    if (typeof tex === 'string' && tex.length > 0) out.add(tex);
  }
}
