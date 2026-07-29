import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { stripAnchorMarkup, toSearchableText, type Problem } from '@combviz/schema';
import { loadTaxonomy } from '../taxonomy.js';

/**
 * `combviz index` — chỉ mục kho, sinh lúc build (CMS-02).
 *
 * Tìm kiếm chạy **client-side** trên chỉ mục này: ở quy mô ≤ 500 bài, gửi cả chỉ
 * mục xuống rẻ hơn nhiều so với dựng một backend tìm kiếm — mà backend thì NG-08
 * cấm hẳn.
 *
 * Chỉ mục chứa **text đã tước LaTeX và markup anchor**: gõ "bàn cờ" phải tìm ra
 * bài dù trong file nó nằm cạnh `$8\\times8$`.
 */
export interface IndexOptions {
  root: string;
  out: string;
}

export interface IndexEntry {
  readonly id: string;
  readonly title: string;
  readonly text: string;
  readonly contest: string;
  readonly year?: number;
  readonly topics: readonly string[];
  readonly techniques: readonly string[];
  readonly engines: readonly string[];
  readonly difficulty: number;
  readonly slot: string;
  readonly kind: string;
  readonly steps: number;
  readonly hasBranching: boolean;
  readonly hasInvariants: boolean;
  readonly hasSandbox: boolean;
}

export async function runIndex(options: IndexOptions): Promise<number> {
  const dir = join(options.root, 'problems');
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  const files = entries
    .filter((e) => e.isFile() && e.name.endsWith('.json'))
    .map((e) => join(e.parentPath ?? dir, e.name))
    .sort();

  const index: IndexEntry[] = [];

  for (const file of files) {
    const problem = JSON.parse(await readFile(file, 'utf8')) as Problem;
    // Chỉ mục là mặt tiền công khai: bài draft chưa thuộc về nó.
    if (problem.status !== 'published') continue;
    index.push(toEntry(problem));
  }

  await mkdir(dirname(options.out), { recursive: true });
  await writeFile(options.out, `${JSON.stringify(index, null, 2)}\n`, 'utf8');

  // Studio chạy trong browser nên không đọc được YAML trên đĩa. Xuất controlled
  // vocabulary ra JSON cạnh chỉ mục để nó chạy **đúng** luật tag mà CI chạy —
  // nếu không, Studio lại là nơi duy nhất không thấy một lớp kiểm (AUT-04).
  const taxonomy = await loadTaxonomy(options.root);
  await writeFile(
    join(dirname(options.out), 'taxonomy.json'),
    `${JSON.stringify(
      {
        topics: [...taxonomy.topics.values()],
        techniques: [...taxonomy.techniques.values()],
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  console.log(`${index.length} bài published → ${options.out}`);
  return index.length;
}

function toEntry(problem: Problem): IndexEntry {
  const steps = problem.solutions.flatMap((s) => s.steps);
  const narratives = steps
    .map((step) => (step.narrative ? stripAnchorMarkup(step.narrative.vi) : ''))
    .join(' ');

  return {
    id: problem.id,
    // Tiêu đề **giữ nguyên LaTeX** — Bank render bằng KaTeX. Chỉ `text` mới bị
    // tước, vì chỉ nó dùng để so khớp.
    title: stripAnchorMarkup(problem.statement.vi),
    text: toSearchableText(stripAnchorMarkup(`${problem.statement.vi} ${narratives}`)),
    contest: problem.source.contest,
    ...(problem.source.year === undefined ? {} : { year: problem.source.year }),
    topics: problem.topics,
    techniques: problem.techniques,
    engines: problem.engines_used,
    difficulty: problem.difficulty.author_rating,
    slot: problem.difficulty.slot_proxy,
    kind: problem.kind ?? 'illustration',
    steps: steps.length,
    hasBranching: steps.some((s) => s.edge_type === 'case'),
    hasInvariants: (problem.invariants?.length ?? 0) > 0,
    hasSandbox: problem.sandbox !== undefined,
  };
}
