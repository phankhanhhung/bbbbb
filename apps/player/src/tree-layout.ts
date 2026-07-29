import { childrenOf, type SolutionTree } from '@combviz/schema';
import type { Step } from '@combviz/schema';

/**
 * Bố cục minimap cây (PLY-02, OPQ-2 = phương án minimap cây đứng).
 *
 * Thuật toán "tidy tree" rút gọn: đặt lá theo thứ tự từ trái sang phải, node cha
 * căn giữa các con. Đủ cho cây lời giải — chúng rộng vài nhánh chứ không phải vài
 * chục — và cho ra hình mà mắt đọc được ngay: cùng một cây luôn vẽ ra cùng một
 * chỗ, không phụ thuộc thứ tự duyệt.
 *
 * Đây là **chrome**, không phải nội dung: nó không đi qua `packages/render` và
 * không chịu theme tokens của canvas. Trộn hai thứ sẽ khiến đổi brand của hình vẽ
 * kéo theo đổi cả thanh điều hướng.
 */
export interface TreeNode {
  readonly step: Step;
  readonly x: number;
  readonly y: number;
}

export interface TreeEdge {
  readonly from: TreeNode;
  readonly to: TreeNode;
  /** `merge_ref` vẽ đứt nét: nó là con trỏ quay lại, không phải một bước tiến. */
  readonly dashed: boolean;
}

export interface TreeLayout {
  readonly nodes: readonly TreeNode[];
  readonly edges: readonly TreeEdge[];
  readonly width: number;
  readonly height: number;
}

const COLUMN = 26;
const ROW = 30;

export function layoutTree(tree: SolutionTree, collapsed: ReadonlySet<string>): TreeLayout {
  const nodes: TreeNode[] = [];
  const byId = new Map<string, TreeNode>();
  let nextLeafColumn = 0;

  const place = (step: Step, depth: number): TreeNode => {
    const kids = collapsed.has(step.id) ? [] : childrenOf(tree, step.id);

    let x: number;
    if (kids.length === 0) {
      x = nextLeafColumn * COLUMN;
      nextLeafColumn += 1;
    } else {
      const placed = kids.map((child) => place(child, depth + 1));
      const first = placed[0] as TreeNode;
      const last = placed[placed.length - 1] as TreeNode;
      x = (first.x + last.x) / 2;
    }

    const node: TreeNode = { step, x, y: depth * ROW };
    nodes.push(node);
    byId.set(step.id, node);
    return node;
  };

  if (tree.root) place(tree.root, 0);

  const edges: TreeEdge[] = [];
  for (const node of nodes) {
    if (node.step.parent) {
      const parent = byId.get(node.step.parent);
      if (parent) edges.push({ from: parent, to: node, dashed: false });
    }

    // Cạnh merge_ref vẽ **sau** và đứt nét: nó nối ngược lên một node đã đặt, nên
    // nó là thứ duy nhất trong hình có thể đi lên chứ không đi xuống.
    if (node.step.edge_type === 'merge_ref' && node.step.merge_target) {
      const target = byId.get(node.step.merge_target);
      if (target) edges.push({ from: node, to: target, dashed: true });
    }
  }

  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);

  return {
    nodes,
    edges,
    width: nodes.length === 0 ? 0 : Math.max(...xs) - Math.min(...xs) + COLUMN,
    height: nodes.length === 0 ? 0 : Math.max(...ys) + ROW,
  };
}

export { COLUMN, ROW };
