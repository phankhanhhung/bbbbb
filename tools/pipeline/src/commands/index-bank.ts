import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  stripAnchorMarkup,
  stripValueMarkup,
  toSearchableText,
  type Problem,
} from '@combviz/schema';
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

/**
 * Sổ thứ tự bài — **chỉ ghi thêm, không bao giờ xếp lại**.
 *
 * Vì sao là một file chứ không tính từ git lúc dựng: `git log --diff-filter=A`
 * cần lịch sử đầy đủ, mà CI clone nông thì nó trả rỗng và cả bảng số **im lặng**
 * sai. Tệ hơn, `--follow` đoán rename bằng độ giống nội dung: với file bài — cùng
 * khung JSON, cùng lối viết — nó đoán sai, và lần dựng sổ đầu tiên đã quy một bài
 * của M40 về tận M11.
 *
 * Sổ giải luôn cả một chuyện khác: **số bài phải ổn định**. Suy từ git thì viết
 * lại lịch sử là đổi hết số; suy từ ngày `created` thì vô nghĩa (cả kho chỉ có
 * hai giá trị). Ghi ra file thì số đọc được trong diff, và người duyệt thấy ngay
 * khi có gì xen vào giữa.
 *
 * `newest` là mẻ bài **được thêm gần nhất**. Nó tự thay ở lần thêm bài sau, nên
 * nhãn "MỚI" hết hạn mà không ai phải nhớ đi gỡ — một dấu "mới" gài cứng sẽ nằm
 * lại mãi và thành lời nói dối.
 */
interface OrderLedger {
  readonly order: readonly string[];
  readonly newest: readonly string[];
}

const ORDER_FILE = 'order.json';

async function readLedger(root: string): Promise<OrderLedger> {
  let raw: string;
  try {
    raw = await readFile(join(root, ORDER_FILE), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    // Chưa có sổ: mở sổ rỗng. **Không** đoán thứ tự, và `newest` để rỗng — không
    // biết bài nào mới thì nói là không biết, chứ không gắn nhãn "MỚI" cho cả kho.
    return { order: [], newest: [] };
  }

  /**
   * Sổ **có mà hỏng** thì nổ to, không mở sổ rỗng: catch trần cũ nuốt cả lỗi
   * parse, nên một order.json vỡ sau merge conflict làm cả kho bị đánh số lại
   * theo alphabet — vi phạm chính lời hứa "chỉ ghi thêm, không bao giờ xếp lại"
   * — rồi bị writeFile ghi đè vĩnh viễn. Lịch sử chỉ còn cứu được từ git, và
   * chỉ khi có ai đó kịp nhận ra trước lần commit sau.
   */
  const parsed = JSON.parse(raw) as OrderLedger;
  if (!Array.isArray(parsed.order) || !Array.isArray(parsed.newest)) {
    throw new Error(
      `${ORDER_FILE} không đúng dạng sổ {order: [], newest: []} — không tự reset; sửa tay hoặc khôi phục từ git`,
    );
  }
  return parsed;
}

/**
 * Ghi thêm id chưa có vào cuối sổ, theo thứ tự **id tăng dần** cho xác định.
 *
 * Bài bị xoá vẫn nằm lại trong sổ: gỡ nó ra sẽ kéo tụt số của mọi bài sau, tức là
 * đổi nghĩa những con số mà người ta có thể đã nhắc tới.
 */
function extend(ledger: OrderLedger, ids: readonly string[]): OrderLedger {
  const known = new Set(ledger.order);
  const fresh = [...ids].filter((id) => !known.has(id)).sort();
  if (fresh.length === 0) return ledger;
  return { order: [...ledger.order, ...fresh], newest: fresh };
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
  /** Số thứ tự trong sổ, đếm từ $1$. Chỉ để hiển thị — không phải danh tính. */
  readonly ordinal: number;
  /** Thuộc mẻ bài thêm gần nhất. */
  readonly isNew: boolean;
}

export async function runIndex(options: IndexOptions): Promise<number> {
  const dir = join(options.root, 'problems');
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  const files = entries
    .filter((e) => e.isFile() && e.name.endsWith('.json'))
    .map((e) => join(e.parentPath ?? dir, e.name))
    .sort();

  const problems: Problem[] = [];
  for (const file of files) {
    const problem = JSON.parse(await readFile(file, 'utf8')) as Problem;
    // Chỉ mục là mặt tiền công khai: bài draft chưa thuộc về nó.
    if (problem.status !== 'published') continue;
    problems.push(problem);
  }

  // Sổ giữ **mọi** bài từng thấy, kể cả draft đã rút: số thứ tự không được tụt.
  const ledger = extend(await readLedger(options.root), problems.map((p) => p.id));
  await writeFile(
    join(options.root, ORDER_FILE),
    `${JSON.stringify(ledger, null, 2)}\n`,
    'utf8',
  );

  const rank = new Map(ledger.order.map((id, i) => [id, i + 1]));
  const newest = new Set(ledger.newest);
  const index: IndexEntry[] = problems
    .map((problem) => toEntry(problem, rank.get(problem.id) ?? 0, newest.has(problem.id)))
    .sort((a, b) => a.ordinal - b.ordinal);

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

function toEntry(problem: Problem, ordinal: number, isNew: boolean): IndexEntry {
  const steps = problem.solutions.flatMap((s) => s.steps);
  const narratives = steps
    .map((step) => (step.narrative ? stripValueMarkup(stripAnchorMarkup(step.narrative.vi)) : ''))
    .join(' ');

  return {
    id: problem.id,
    // Tiêu đề **giữ nguyên LaTeX** — Bank render bằng KaTeX. Chỉ `text` mới bị
    // tước, vì chỉ nó dùng để so khớp.
    title: stripValueMarkup(stripAnchorMarkup(problem.statement.vi)),
    text: toSearchableText(stripValueMarkup(stripAnchorMarkup(`${problem.statement.vi} ${narratives}`))),
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
    ordinal,
    isNew,
  };
}
