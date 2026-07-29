import { cp, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Problem } from '@combviz/schema';
import { runIndex, type IndexEntry } from '../src/commands/index-bank.js';

/**
 * Chỉ mục kho (CMS-02) là **mặt tiền công khai**: nó quyết định bài nào tồn tại
 * với người ngoài, và tiêu đề trong đó là thứ đầu tiên ai cũng đọc.
 *
 * Hai bất biến quan trọng và **ngược nhau**, nên phải test riêng:
 *   - `title` giữ nguyên LaTeX, vì Bank render bằng KaTeX.
 *   - `text` tước sạch LaTeX, vì không ai gõ "times" để tìm bài.
 */
const CONTENT = fileURLToPath(new URL('../../../packages/content', import.meta.url));

function loadProblem(name: string): Problem {
  return JSON.parse(readFileSync(join(CONTENT, 'problems', name), 'utf8')) as Problem;
}

async function indexOf(problems: readonly Problem[]): Promise<IndexEntry[]> {
  const root = await mkdtemp(join(tmpdir(), 'combviz-index-'));
  await mkdir(join(root, 'problems'), { recursive: true });
  // `index` xuất luôn `taxonomy.json` cho Studio, nên content root giả cũng phải
  // có controlled vocabulary thật — thiếu là lệnh nổ, và nổ ở đây là đúng: một
  // chỉ mục sinh ra mà Studio mất luật tag thì tệ hơn nhiều so với một lỗi build.
  await cp(join(CONTENT, 'taxonomy'), join(root, 'taxonomy'), { recursive: true });
  for (const problem of problems) {
    await writeFile(
      join(root, 'problems', `${problem.id}.json`),
      JSON.stringify(problem),
      'utf8',
    );
  }

  const out = join(root, 'index.json');
  await runIndex({ root, out });
  return JSON.parse(await readFile(out, 'utf8')) as IndexEntry[];
}

describe('CMS-02 — chỉ mục kho', () => {
  it('tiêu đề giữ LaTeX để Bank render được', async () => {
    const [entry] = await indexOf([loadProblem('mutilated-chessboard.json')]);

    expect(entry!.title).toContain('$8\\times8$');
  });

  it('text tước cả tên lệnh LaTeX, không chỉ dấu backslash', async () => {
    const [entry] = await indexOf([loadProblem('mutilated-chessboard.json')]);

    // "times" lọt vào chỉ mục thì gõ "time" ra mọi bài có phép nhân.
    expect(entry!.text).not.toContain('times');
    expect(entry!.text).not.toContain('\\');
    expect(entry!.text).not.toContain('$');
    expect(entry!.text).toContain('Bàn cờ 8 8');
  });

  it('text gộp cả narrative, nên tìm được theo nội dung lời giải', async () => {
    const problem = loadProblem('mutilated-chessboard.json');
    problem.solutions[0]!.steps[0]!.narrative = { vi: 'một [[a1|từ khoá lạ]] ở đây' };

    const [entry] = await indexOf([problem]);

    // Markup anchor bị tước, chữ bên trong thì không.
    expect(entry!.text).toContain('từ khoá lạ');
    expect(entry!.text).not.toContain('[[');
  });

  it('bài draft không vào chỉ mục', async () => {
    const published = loadProblem('mutilated-chessboard.json');
    const draft = { ...loadProblem('ramsey-3-3-six.json'), status: 'draft' as const };

    const entries = await indexOf([published, draft]);

    expect(entries.map((e) => e.id)).toEqual([published.id]);
  });

  it('mang theo đủ mặt lọc mà Bank cần', async () => {
    const [entry] = await indexOf([loadProblem('ramsey-3-3-six.json')]);

    expect(entry).toMatchObject({
      contest: expect.any(String),
      topics: expect.any(Array),
      techniques: expect.any(Array),
      engines: ['graph'],
      hasBranching: true,
    });
    expect(entry!.steps).toBeGreaterThan(0);
  });

  it('bỏ hẳn "year" khi bài không ghi năm, thay vì để undefined', async () => {
    const problem = loadProblem('mutilated-chessboard.json');
    delete problem.source.year;

    const [entry] = await indexOf([problem]);

    // JSON.stringify nuốt undefined, nên trường này phải vắng chứ không null.
    expect('year' in entry!).toBe(false);
  });
});
