import type { Solution } from './problem.js';
import type { Step } from './step.js';

/**
 * Cây lời giải, dựng sẵn để duyệt (PLY-02).
 *
 * Sống ở `packages/schema` cạnh `checkStructure` vì đó là **cùng một hiểu biết**
 * về cấu trúc cây: validate dùng nó để bắt chu trình và merge_ref hỏng, Player
 * dùng nó để điều hướng. Hai bản cài sẽ bất đồng ý kiến về "nhánh này đi tới
 * đâu", và bất đồng đó chỉ lộ ra khi người học lạc đường.
 */
export interface SolutionTree {
  readonly steps: ReadonlyMap<string, Step>;
  readonly children: ReadonlyMap<string, readonly Step[]>;
  readonly root: Step | undefined;
  readonly depth: ReadonlyMap<string, number>;
}

export function buildTree(solution: Solution): SolutionTree {
  const steps = new Map(solution.steps.map((step) => [step.id, step]));
  const children = new Map<string, Step[]>();

  for (const step of solution.steps) {
    if (step.parent === null) continue;
    children.set(step.parent, [...(children.get(step.parent) ?? []), step]);
  }

  const root = solution.steps.find((step) => step.parent === null);
  const depth = new Map<string, number>();

  const walk = (step: Step, level: number): void => {
    depth.set(step.id, level);
    for (const child of children.get(step.id) ?? []) walk(child, level + 1);
  };
  if (root) walk(root, 0);

  return { steps, children, root, depth };
}

export function childrenOf(tree: SolutionTree, stepId: string): readonly Step[] {
  return tree.children.get(stepId) ?? [];
}

/**
 * Đường đi từ gốc tới một step.
 *
 * `merge_ref` **không** nằm trên đường đi (G-04): nó là con trỏ quay lại, không
 * phải một bước tiến. Tính nó vào sẽ làm sparkline của invariant strip lặp lại
 * một giá trị đã vẽ, và breadcrumb đếm thừa một mức.
 */
export function pathTo(tree: SolutionTree, stepId: string): Step[] {
  const chain: Step[] = [];
  const guard = new Set<string>();

  let cursor = tree.steps.get(stepId);
  while (cursor && !guard.has(cursor.id)) {
    guard.add(cursor.id);
    if (cursor.edge_type !== 'merge_ref') chain.unshift(cursor);
    cursor = cursor.parent ? tree.steps.get(cursor.parent) : undefined;
  }

  return chain;
}

/**
 * Step này có phải đích của một `merge_ref` nào không — tức **điểm hợp nhánh**.
 *
 * Theo định nghĩa của merge_ref, mọi trường hợp đều dẫn tới đây.
 */
export function isMergeTarget(tree: SolutionTree, stepId: string): boolean {
  for (const step of tree.steps.values()) {
    if (step.edge_type === 'merge_ref' && step.merge_target === stepId) return true;
  }
  return false;
}

/**
 * Nhãn breadcrumb: các `case_label` gặp trên đường từ gốc tới step hiện tại.
 *
 * Chỉ lấy nhãn của node rẽ nhánh, không lấy mọi step — "Trường hợp 2 › 2.1" là
 * thứ người học cần, còn liệt kê cả mười bước thì không ai đọc.
 *
 * **Điểm hợp nhánh trả về rỗng.** Về cấu trúc, step tổng hợp là con của *một*
 * nhánh cụ thể (cây + tham chiếu, không phải DAG thật), nên đường từ gốc tới nó
 * đi qua nhánh đó. Nhưng người học có thể vừa đi từ nhánh khác sang, và bảo họ
 * rằng họ đang ở "Trường hợp 2" khi họ vừa đi hết trường hợp 1 là nói sai. Ở
 * điểm hợp nhánh thì mọi nhánh đều đúng, nên không nhánh nào được nêu tên.
 */
export function breadcrumb(tree: SolutionTree, stepId: string): string[] {
  if (isMergeTarget(tree, stepId)) return [];

  return pathTo(tree, stepId)
    .filter((step) => step.edge_type === 'case' && step.case_label)
    .map((step) => step.case_label!.vi);
}

/**
 * Điểm rẽ nhánh gần nhất **phía trên** step hiện tại — đích của nút "về điểm rẽ
 * nhánh" (PLY-02).
 *
 * Là step có nhiều hơn một con, chứ không phải step `case` gần nhất: khi đang
 * đứng *trong* một nhánh, thứ người học muốn quay về là chỗ họ đã phải chọn.
 */
export function branchPointAbove(tree: SolutionTree, stepId: string): Step | null {
  const chain = pathTo(tree, stepId);

  for (let i = chain.length - 2; i >= 0; i -= 1) {
    const step = chain[i] as Step;
    if (childrenOf(tree, step.id).length > 1) return step;
  }
  return null;
}

/**
 * Bước kế tiếp khi đi tới, hoặc `null` nếu phải để người học chọn.
 *
 * Trả `null` ở node rẽ nhánh là điều PLY-02 đòi: auto-play **dừng** ở đó. Tự
 * chọn hộ một nhánh sẽ biến "xét trường hợp" thành một đoạn phim mà người xem
 * không biết mình vừa bỏ qua nhánh nào.
 */
export function nextStep(tree: SolutionTree, stepId: string): Step | null {
  const current = tree.steps.get(stepId);
  if (!current) return null;

  if (current.edge_type === 'merge_ref' && current.merge_target) {
    return tree.steps.get(current.merge_target) ?? null;
  }

  const kids = childrenOf(tree, stepId);
  return kids.length === 1 ? (kids[0] as Step) : null;
}

/** Node rẽ nhánh: người học phải chọn, không tự đi tiếp được. */
export function isBranchPoint(tree: SolutionTree, stepId: string): boolean {
  return childrenOf(tree, stepId).length > 1;
}

/**
 * Nhánh đã "đóng": mọi lá của nó đều là mâu thuẫn hoặc con trỏ tổng hợp.
 *
 * Dùng để đánh dấu ✗ trong minimap. Một nhánh còn lá `seq` là nhánh chưa kết
 * thúc — hoặc lời giải chưa xong, hoặc nhánh đó là đường dẫn tới kết luận.
 */
export function isClosedBranch(tree: SolutionTree, stepId: string): boolean {
  const step = tree.steps.get(stepId);
  if (!step) return false;

  const kids = childrenOf(tree, stepId);
  if (kids.length === 0) return step.edge_type === 'contradiction';

  return kids.every((child) => isClosedBranch(tree, child.id));
}

/** Duyệt trước toàn cây — thứ tự đọc mặc định. */
export function preorder(tree: SolutionTree): Step[] {
  const out: Step[] = [];
  const visit = (step: Step): void => {
    out.push(step);
    for (const child of childrenOf(tree, step.id)) visit(child);
  };
  if (tree.root) visit(tree.root);
  return out;
}
