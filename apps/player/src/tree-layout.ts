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

/**
 * Con **vẽ ra**, tức bỏ `merge_ref`.
 *
 * `merge_ref` là một con trỏ, không phải một bước: schema đã ép nó là lá, có
 * `merge_target`, và **không mang scene**. Vẽ nó thành một chấm riêng là vẽ một ngõ
 * cụt cho một thứ mà cả nội dung là "đi tiếp ở chỗ kia" — `polynomial-long-division`
 * ra 11 chấm, trong đó **4 chấm là ngõ cụt mang ↰**, cộng 4 đường bezier phình sang
 * phải, để diễn tả đúng một điểm hội tụ. Nay 7 chấm + 4 ray chụm vào ga.
 *
 * Đây là thay đổi **bố cục thuần**: schema giữ nguyên, `merge_ref` vẫn là lá trong
 * dữ liệu, `pathTo`/`breadcrumb` vẫn thấy nó. Chỉ bản đồ thôi không vẽ nó thành một
 * đích đến — vì nó chưa bao giờ là một đích đến.
 */
export function drawnChildren(tree: SolutionTree, id: string): readonly Step[] {
  return childrenOf(tree, id).filter((kid) => kid.edge_type !== 'merge_ref');
}

/**
 * **Sợi** hay **cây** — quyết định theo hình dạng lời giải, không theo sở thích.
 *
 * Đo trên kho: **122/143 lời giải không có điểm rẽ nhánh nào**, 20 có một, 1 có
 * hai. Với 122 lời giải ấy, một cái cây đứng tiêu bốn năm hàng để nói đúng một
 * điều — "không có nhánh nào" — trong khi chú thích của chính component khai rằng
 * nó tồn tại để trả lời *"còn bao nhiêu nhánh nữa"*. Vẽ cây cho một lời giải thẳng
 * là vẽ một câu trả lời rỗng bằng cỡ chữ lớn nhất trang.
 *
 * Đổi hình thì cái cây **có nghĩa trở lại**: thấy cây tức là bài này thật sự xét
 * trường hợp.
 */
export type TreeShape = 'strip' | 'tree';

export interface TreeLayout {
  readonly nodes: readonly TreeNode[];
  readonly edges: readonly TreeEdge[];
  readonly width: number;
  readonly height: number;
  readonly shape: TreeShape;
}

const COLUMN = 26;
const ROW = 30;

/**
 * Hình dạng đọc từ **cây đầy đủ**, không phải từ cây đang hiện.
 *
 * Nếu đọc từ cây đã thu gọn thì thu gọn nhánh cuối cùng sẽ biến cây thành sợi và
 * bản đồ nhảy sang một bố cục khác giữa chừng — người học bấm một nút "giấu bớt"
 * và nhận lại một hình không nhận ra.
 */
export function treeShape(tree: SolutionTree): TreeShape {
  const forks = (step: Step): boolean => {
    const kids = drawnChildren(tree, step.id);
    return kids.length > 1 || kids.some(forks);
  };
  return tree.root && forks(tree.root) ? 'tree' : 'strip';
}

export function layoutTree(tree: SolutionTree, collapsed: ReadonlySet<string>): TreeLayout {
  if (treeShape(tree) === 'strip') return layoutStrip(tree);
  return layoutBranching(tree, collapsed);
}

/**
 * Bố cục sợi: một hàng, đi từ trái sang phải theo thứ tự bước.
 *
 * Không có `collapsed` ở đây, và đó là chủ đích: "thu gọn" trên một sợi nghĩa là
 * giấu phần đuôi, mà phần đuôi của một lời giải thẳng chính là phần chưa đọc. Nút
 * ấy sẽ là một nút để tự giấu chỗ mình đang đi tới.
 */
function layoutStrip(tree: SolutionTree): TreeLayout {
  const nodes: TreeNode[] = [];
  const byId = new Map<string, TreeNode>();

  let step: Step | undefined = tree.root;
  for (let i = 0; step; i += 1) {
    const node: TreeNode = { step, x: i * COLUMN, y: 0 };
    nodes.push(node);
    byId.set(step.id, node);
    step = childrenOf(tree, step.id)[0];
  }

  const edges: TreeEdge[] = [];
  for (const node of nodes) {
    const parent = node.step.parent ? byId.get(node.step.parent) : undefined;
    if (parent) edges.push({ from: parent, to: node, dashed: false });
  }

  // Khung đọc từ **toạ độ node thật**, không tính lại từ `nodes.length`. Bản đầu
  // viết `height: ROW` cho gọn, và một lượt bẻ răng bắt được ngay: đổi sợi sang xếp
  // dọc (`y: i * ROW`) thì node chạy ra ngoài khung mà khung vẫn khai một hàng —
  // hình sai, chốt canh xanh. Khung là một *khẳng định về node*, nên nó phải đọc
  // từ node.
  return { ...box(nodes), nodes, edges, shape: 'strip' };
}

function box(nodes: readonly TreeNode[]): { width: number; height: number } {
  if (nodes.length === 0) return { width: 0, height: 0 };
  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);
  return {
    width: Math.max(...xs) - Math.min(...xs) + COLUMN,
    height: Math.max(...ys) - Math.min(...ys) + ROW,
  };
}

function layoutBranching(tree: SolutionTree, collapsed: ReadonlySet<string>): TreeLayout {
  const nodes: TreeNode[] = [];
  const byId = new Map<string, TreeNode>();
  let nextLeafColumn = 0;

  const place = (step: Step, depth: number): TreeNode => {
    const kids = collapsed.has(step.id) ? [] : drawnChildren(tree, step.id);

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
  }

  // **Đường ray tới ga.** `merge_ref` không có node, nên ray chạy từ *cha* của nó —
  // tức đầu mút của nhánh — thẳng tới node tổng hợp. Đúng thứ G-03 đã chốt ("cạnh
  // đứt nét từ leaf quay về node tổng hợp"), chỉ khác là leaf không còn phải mọc
  // thêm một cái chấm để làm điểm xuất phát.
  for (const step of tree.steps.values()) {
    if (step.edge_type !== 'merge_ref' || !step.merge_target || !step.parent) continue;
    const from = byId.get(step.parent);
    const to = byId.get(step.merge_target);
    if (from && to && from !== to) edges.push({ from, to, dashed: true });
  }

  return { ...box(nodes), nodes, edges, shape: 'tree' };
}

export { COLUMN, ROW };
