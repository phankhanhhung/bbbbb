import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildTree, preorder, type Problem, type Solution } from '@combviz/schema';
import { createChecker } from '@combviz/check';
import { ENGINE_DSL, ENGINE_FRAGMENTS } from '../engines.js';

/**
 * `combviz coverage` — bảng điểm của content sprint, đối chiếu DoD Phase 1 §15.1.
 *
 * Content sprint là chỗ dự án này chết nếu chết (R-1), và nó chết theo một kiểu
 * rất cụ thể: soạn 25 bài rồi mới phát hiện 19 bài là grid và kho không có bài
 * đồ thị nào tử tế. Lúc đó sửa nghĩa là soạn lại, không phải sửa.
 *
 * Vì vậy phân bố phải **đo được từ ngày đầu**, khi con số còn là 2/25 và việc
 * đổi hướng còn rẻ. Lệnh này cố ý không có ngưỡng "gần đạt": mỗi tiêu chí hoặc
 * đủ hoặc thiếu bao nhiêu, và nó nói ra con số thiếu.
 */
export interface CoverageOptions {
  root: string;
  /** Tính cả bài draft — xem sprint sẽ về đâu nếu hàng đợi duyệt trôi hết. */
  includeDrafts: boolean;
}

interface Criterion {
  readonly label: string;
  readonly target: number;
  readonly count: number;
  /** Bài **không** thoả — để biết phải sửa bài nào, không chỉ biết thiếu mấy bài. */
  readonly missing: readonly string[];
  /** Tiêu chí phải đạt trên 100% kho, không phải đếm tới ngưỡng. */
  readonly universal?: boolean;
  /** Chỉ là con số để đọc, không phải chỉ tiêu — không tính vào tổng kết. */
  readonly info?: boolean;
}

export const BANK_TARGET = 25;

export async function runCoverage(options: CoverageOptions): Promise<boolean> {
  const dir = join(options.root, 'problems');
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  const files = entries
    .filter((e) => e.isFile() && e.name.endsWith('.json'))
    .map((e) => join(e.parentPath ?? dir, e.name))
    .sort();

  const all: Problem[] = [];
  for (const file of files) {
    all.push(JSON.parse(await readFile(file, 'utf8')) as Problem);
  }

  const published = all.filter((p) => p.status === 'published');
  const drafts = all.filter((p) => p.status !== 'published');
  const bank = options.includeDrafts ? all : published;

  const checker = createChecker({ fragments: ENGINE_FRAGMENTS, dsl: ENGINE_DSL });
  const criteria = measure(bank, (problem) => checker.check(problem).length === 0);

  console.log(
    options.includeDrafts
      ? `Kho: ${published.length} published + ${drafts.length} draft = ${bank.length}/${BANK_TARGET}`
      : `Kho: ${published.length}/${BANK_TARGET} published (${drafts.length} draft đang chờ duyệt)`,
  );
  console.log('');

  let met = 0;
  const scored = criteria.filter((c) => !c.info);

  for (const c of criteria) {
    if (c.info) {
      console.log(`  ${String(c.count).padEnd(7)} ${c.label}`);
      continue;
    }
    const ok = c.count >= c.target;
    if (ok) met += 1;
    const bar = `${c.count}/${c.target}`.padEnd(7);
    console.log(`${ok ? '✓' : '·'} ${bar} ${c.label}`);
    if (!ok && c.universal && c.missing.length > 0) {
      // Tiêu chí 100% thì danh sách bài hỏng **là** việc phải làm, nên in ra luôn.
      for (const id of c.missing.slice(0, 8)) console.log(`      ↳ ${id}`);
      if (c.missing.length > 8) console.log(`      ↳ … và ${c.missing.length - 8} bài nữa`);
    }
  }

  console.log('');
  const remaining = Math.max(0, BANK_TARGET - bank.length);
  if (remaining > 0) {
    console.log(`Còn ${remaining} bài. Ưu tiên theo khoảng cách lớn nhất:`);
    for (const c of criteria.filter((x) => !x.universal && !x.info && x.count < x.target)) {
      console.log(`  · ${c.target - c.count} bài ${c.label.toLowerCase()}`);
    }
  }

  const allMet = met === scored.length && bank.length >= BANK_TARGET;
  console.log(allMet ? 'ĐẠT — DoD Phase 1 §15.1' : `${met}/${scored.length} tiêu chí đạt`);
  return allMet;
}

/**
 * Đo từng tiêu chí của §15.1.
 *
 * `lintClean` được tiêm vào thay vì gọi thẳng checker để hàm này thuần và test
 * được — nó là chỗ dễ sai nhất (phân loại bài), và một phân loại sai sẽ nói dối
 * rất thuyết phục.
 */
export function measure(
  bank: readonly Problem[],
  lintClean: (problem: Problem) => boolean,
): Criterion[] {
  const by = (
    label: string,
    target: number,
    predicate: (p: Problem) => boolean,
    universal = false,
  ): Criterion => ({
    label,
    target: universal ? bank.length : target,
    count: bank.filter(predicate).length,
    missing: bank.filter((p) => !predicate(p)).map((p) => p.id),
    ...(universal ? { universal } : {}),
  });

  return [
    by('Grid (tiling/coloring/pieces)', 10, (p) => p.engines_used.includes('board')),
    by('Graph', 10, (p) => p.engines_used.includes('graph')),
    by('Lấy bất biến làm trục', 5, (p) =>
      p.techniques.some((t) => t === 'invariant' || t === 'monovariant'),
    ),
    by('Case-branching thật', 8, (p) => p.solutions.some(hasRealBranching)),
    by('Có invariant strip', 10, (p) => (p.invariants?.length ?? 0) > 0),
    // DoD viết "100% có sandbox + validator". Đọc theo **ý**: mỗi bài phải có
    // một sandbox cho phản hồi bằng máy. Với họ bài "lật dấu", phản hồi đó là
    // `goal_expr` chứ không phải validator — ràng buộc của bài nằm trong chính
    // thao tác hợp lệ (`board/flip-line`), nên không có gì để một validator cấm.
    // Đếm cả hai dạng, nhưng **in riêng** số bài có validator để không ai tưởng
    // hai thứ là một.
    by(
      'Sandbox dùng được (bài challenge/both)',
      0,
      (p) =>
        // Bài khai `illustration` **được miễn**, và đó không phải cửa lách: nó là
        // một tuyên bố của tác giả rằng bài này không có thao tác nào có nghĩa.
        // Ép sandbox lên mọi bài chỉ đẻ ra đồ chơi vô nghĩa cho đủ chỉ tiêu, mà
        // một sandbox không ai muốn nghịch còn tệ hơn không có sandbox.
        (p.kind ?? 'illustration') === 'illustration' ||
        (p.sandbox?.validators.length ?? 0) > 0 ||
        p.sandbox?.goal_expr !== undefined,
      true,
    ),
    {
      label: '… trong đó khai `illustration` (được miễn sandbox)',
      target: 0,
      count: bank.filter((p) => (p.kind ?? 'illustration') === 'illustration').length,
      missing: [],
      info: true,
    },
    by('Sạch lint + validate', 0, lintClean, true),
    by('Có OG card', 0, hasOgCard, true),
  ];
}

/**
 * "Case-branching **thật**" — ít nhất một node có ≥ 2 nhánh case.
 *
 * Một `case` đơn độc không phải xét trường hợp; nó là `seq` bị gắn nhầm nhãn, và
 * đếm nó vào chỉ tiêu sẽ cho một kho tự khai là phân nhánh trong khi tree
 * navigator chẳng có gì để vẽ. Lint đã cảnh báo trường hợp đó (`lint/lone-case`);
 * ở đây chỉ đơn giản là không tính.
 */
function hasRealBranching(solution: Solution): boolean {
  const perParent = new Map<string, number>();
  for (const step of preorder(buildTree(solution))) {
    if (step.edge_type !== 'case' || step.parent === null) continue;
    perParent.set(step.parent, (perParent.get(step.parent) ?? 0) + 1);
  }
  return [...perParent.values()].some((n) => n >= 2);
}

/**
 * OG card sinh được, chứ không phải OG card đã sinh.
 *
 * File `.svg` trong `og/` là artifact build — kiểm nó ở đây sẽ biến `coverage`
 * thành "đã chạy `combviz og` chưa", một câu hỏi khác hẳn. Thứ đáng kiểm là bài
 * có **trỏ tới một step render được** hay không (REN-02 + G-01).
 */
function hasOgCard(problem: Problem): boolean {
  const ref = problem.og_step_ref;
  if (!ref) {
    // Vắng thì fallback = step cuối nhánh chính; vẫn ra card, chỉ là card do máy
    // chọn. Lint đã cảnh báo riêng chuyện đó.
    const last = problem.solutions[0]?.steps.filter((s) => s.scene).at(-1);
    return last !== undefined;
  }
  const solution = problem.solutions.find((s) => s.id === ref.sol_id);
  return solution?.steps.find((s) => s.id === ref.step_id)?.scene !== undefined;
}
