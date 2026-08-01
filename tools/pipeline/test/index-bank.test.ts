import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
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

async function emptyRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'combviz-index-'));
  await mkdir(join(root, 'problems'), { recursive: true });
  // `index` xuất luôn `taxonomy.json` cho Studio, nên content root giả cũng phải
  // có controlled vocabulary thật — thiếu là lệnh nổ, và nổ ở đây là đúng: một
  // chỉ mục sinh ra mà Studio mất luật tag thì tệ hơn nhiều so với một lỗi build.
  await cp(join(CONTENT, 'taxonomy'), join(root, 'taxonomy'), { recursive: true });
  return root;
}

/**
 * Chạy `index` trên một root **có sẵn**, thay hẳn tập bài đang có.
 *
 * Gọi hai lần trên cùng root là cách duy nhất test được thứ đáng test ở sổ thứ
 * tự: nó chỉ có ý nghĩa qua **hai** lần dựng, và một root mới mỗi lần thì sổ nào
 * cũng mở từ rỗng và mọi khẳng định đều xanh vô nghĩa.
 */
async function indexInto(root: string, problems: readonly Problem[]): Promise<IndexEntry[]> {
  await rm(join(root, 'problems'), { recursive: true, force: true });
  await mkdir(join(root, 'problems'), { recursive: true });
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

async function indexOf(problems: readonly Problem[]): Promise<IndexEntry[]> {
  return indexInto(await emptyRoot(), problems);
}

function renamed(problem: Problem, id: string): Problem {
  return { ...problem, id };
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

/**
 * Sổ thứ tự — `packages/content/order.json`.
 *
 * Con số hiển thị trên thẻ bài là một lời hứa: "#12" phải chỉ đúng một bài, hôm
 * nay và sang năm. Cả nhóm test này chỉ nói một điều — **sổ chỉ ghi thêm** — vì
 * đó là điều duy nhất giữ được lời hứa ấy.
 */
describe('sổ thứ tự bài', () => {
  const base = (): Problem => loadProblem('mutilated-chessboard.json');

  it('cũ nhất là #1, và chỉ mục xếp theo số chứ không theo id', async () => {
    // `zz` sắp sau `aa` theo id nhưng vào sổ trước, nên nếu chỉ mục xếp theo id
    // thì thứ tự hiển thị mâu thuẫn với chính con số nó in ra.
    const root = await emptyRoot();
    await indexInto(root, [renamed(base(), 'zz-bai-cu')]);
    const entries = await indexInto(root, [
      renamed(base(), 'zz-bai-cu'),
      renamed(base(), 'aa-bai-moi'),
    ]);

    expect(entries.map((e) => [e.id, e.ordinal])).toEqual([
      ['zz-bai-cu', 1],
      ['aa-bai-moi', 2],
    ]);
  });

  it('thêm bài **không** dời số của bài cũ', async () => {
    const root = await emptyRoot();
    const first = await indexInto(root, [renamed(base(), 'a'), renamed(base(), 'b')]);
    const second = await indexInto(root, [
      renamed(base(), 'a'),
      renamed(base(), 'b'),
      renamed(base(), 'c'),
    ]);

    const ordinalOf = (list: readonly IndexEntry[], id: string): number =>
      list.find((e) => e.id === id)!.ordinal;
    expect(ordinalOf(second, 'a')).toBe(ordinalOf(first, 'a'));
    expect(ordinalOf(second, 'b')).toBe(ordinalOf(first, 'b'));
    expect(ordinalOf(second, 'c')).toBe(3);
  });

  it('sổ **hỏng** thì nổ to, không lặng lẽ reset — lịch sử thứ tự không tự đánh lại', async () => {
    // Catch trần cũ nuốt cả lỗi parse: order.json vỡ sau merge conflict → cả kho
    // bị đánh số lại theo alphabet rồi sổ reset bị ghi đè vĩnh viễn. Sổ chưa có
    // (ENOENT) mới là ca "mở sổ rỗng"; sổ có mà hỏng là ca "dừng lại, gọi người".
    const root = await emptyRoot();
    await indexInto(root, [renamed(base(), 'a')]);

    await writeFile(join(root, 'order.json'), '{ nát', 'utf8');
    await expect(indexInto(root, [renamed(base(), 'a')])).rejects.toThrow();

    // JSON lành nhưng sai dạng sổ cũng không được coi là "chưa có sổ".
    await writeFile(join(root, 'order.json'), '{"khong": "phai so"}', 'utf8');
    await expect(indexInto(root, [renamed(base(), 'a')])).rejects.toThrow(/không tự reset/);
  });

  it('rút một bài rồi thêm bài khác thì số **không tụt** — chỗ trống nằm lại', async () => {
    // Đây là chỗ mà "đánh số lúc dựng" khác hẳn "đánh số theo sổ": đếm lại mỗi
    // lần dựng thì `c` nhận số $2$ của `b` vừa rút, và một con số đã có người
    // nhắc tới bỗng chỉ sang bài khác.
    const root = await emptyRoot();
    await indexInto(root, [renamed(base(), 'a'), renamed(base(), 'b')]);
    await indexInto(root, [renamed(base(), 'a')]);
    const third = await indexInto(root, [renamed(base(), 'a'), renamed(base(), 'c')]);

    expect(third.find((e) => e.id === 'c')!.ordinal).toBe(3);
  });

  it('nhãn "MỚI" **tự hết hạn**: chỉ mẻ thêm gần nhất mang nó', async () => {
    const root = await emptyRoot();
    const first = await indexInto(root, [renamed(base(), 'a'), renamed(base(), 'b')]);
    expect(first.filter((e) => e.isNew).map((e) => e.id)).toEqual(['a', 'b']);

    const second = await indexInto(root, [
      renamed(base(), 'a'),
      renamed(base(), 'b'),
      renamed(base(), 'c'),
    ]);
    expect(second.filter((e) => e.isNew).map((e) => e.id)).toEqual(['c']);
  });

  it('dựng lại mà không thêm bài nào thì nhãn "MỚI" **giữ nguyên**', async () => {
    // Hết hạn theo *mẻ bài sau*, không theo *lần dựng sau*: CI dựng lại mỗi lần
    // push, nên nếu mỗi lần dựng đều xoá nhãn thì nó sống được đúng một commit.
    const root = await emptyRoot();
    await indexInto(root, [renamed(base(), 'a')]);
    const again = await indexInto(root, [renamed(base(), 'a')]);

    expect(again.map((e) => e.isNew)).toEqual([true]);
  });

  it('sổ ghi ra đĩa, để số đọc được trong diff', async () => {
    const root = await emptyRoot();
    await indexInto(root, [renamed(base(), 'a'), renamed(base(), 'b')]);

    const ledger = JSON.parse(await readFile(join(root, 'order.json'), 'utf8')) as {
      order: string[];
      newest: string[];
    };
    expect(ledger.order).toEqual(['a', 'b']);
    expect(ledger.newest).toEqual(['a', 'b']);
  });
});
