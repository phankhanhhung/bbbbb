import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCHEMA_VERSION } from '@combviz/schema';
import { runImportDraft } from '../src/commands/import-draft.js';

/**
 * Cổng nhận draft (AUT-09) — hai lỗ của lượt rà trước freeze.
 *
 * Draft là dữ liệu **không tin cậy** (NFR-S1), và cổng của nó phải chịu được cả
 * hai kiểu dữ liệu xấu: méo hình dạng (không được nổ TypeError trước khi lớp
 * kiểm kịp nói), và id trùng bài thật (không được thành nút unpublish/ghi đè).
 */
const CONTENT = fileURLToPath(new URL('../../../packages/content', import.meta.url));

async function draftRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'combviz-draft-'));
  await mkdir(join(root, 'problems'), { recursive: true });
  await cp(join(CONTENT, 'taxonomy'), join(root, 'taxonomy'), { recursive: true });
  return root;
}

describe('cổng import-draft', () => {
  afterEach(() => vi.restoreAllMocks());

  it('draft méo hình dạng bị TỪ CHỐI có lời — không nổ TypeError trong quarantine', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const root = await draftRoot();
    const file = join(root, 'evil.json');
    // `solutions: 42` — quarantine cũ đi thẳng vào `.solutions.map` và nổ.
    await writeFile(
      file,
      JSON.stringify({ schema_version: SCHEMA_VERSION, id: 'evil-draft', solutions: 42 }),
      'utf8',
    );

    const report = await runImportDraft({ file, root, write: false });

    expect(report.errors).toBeGreaterThan(0);
  });

  it('KHÔNG ghi đè bài đã tồn tại — cổng nhận draft không phải nút unpublish', async () => {
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((m) => logs.push(String(m)));

    const root = await draftRoot();
    const existing = readFileSync(join(CONTENT, 'problems', 'mutilated-chessboard.json'), 'utf8');
    await writeFile(join(root, 'problems', 'mutilated-chessboard.json'), existing, 'utf8');

    // Draft hợp lệ về nội dung nhưng trùng id bài đã có: quarantine ép status về
    // draft, nên nếu được ghi thì bài thật biến mất khỏi index công khai.
    const file = join(root, 'evil.json');
    await writeFile(file, existing, 'utf8');

    const report = await runImportDraft({ file, root, write: true });

    expect(report.errors).toBeGreaterThan(0);
    expect(logs.join('\n')).toContain('TỪ CHỐI GHI');
    // Bài thật còn nguyên từng byte.
    expect(await readFile(join(root, 'problems', 'mutilated-chessboard.json'), 'utf8')).toBe(
      existing,
    );
  });
});
