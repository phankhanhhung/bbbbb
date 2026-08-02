import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  breadcrumb,
  childrenOf,
  isClosedBranch,
  isMergeTarget,
  pathTo,
  type SolutionTree,
  type Step,
} from '@combviz/schema';
import { COLUMN, layoutTree, ROW } from './tree-layout.js';

/**
 * Tree navigator (PLY-02).
 *
 * Minimap cây đứng, thu gọn được — phương án (a) của OPQ-2. Nó tồn tại để trả lời
 * một câu mà breadcrumb không trả lời được: *chứng minh này còn bao nhiêu nhánh
 * nữa, và mình đã đi hết chưa*. Với dạng bài xét trường hợp, đó không phải thông
 * tin phụ; đó là hình dạng của lời giải.
 */
interface TreeNavigatorProps {
  tree: SolutionTree;
  currentId: string;
  onSelect: (stepId: string) => void;
}

/**
 * Một "ô" của bản đồ trên màn hình, tính bằng pixel — và nó **là** `CELL_PX` của
 * `@combviz/render`, không phải một con số khác tình cờ gần bằng.
 *
 * **Vấn đề hằng số này sinh ra để dẹp.** Trước nó, `<svg>` mang `width: 100%;
 * height: auto` với `viewBox` tính từ hộp bao của cây, nên tỉ lệ thật là
 * `trần chiều cao / chiều cao cây` — **đổi theo từng bài, và đổi cả khi thu gọn một
 * nhánh**. Đo trên kho: lời giải tuyến tính 4 bước ra $2{,}17\times$, `ramsey-3-3-six`
 * ra $1{,}73\times$ — cùng một chấm, hai bài chênh $25\%$. Đúng lớp lỗi mà
 * `packages/render/src/scale.ts` sinh ra để dẹp cho canvas, chỉ khác là chrome chưa
 * được hưởng luật ấy.
 *
 * **Luật thay thế, cùng hai dòng như canvas.** Một ô luôn là `TREE_CELL_PX` pixel;
 * rộng quá pane thì **cuộn**, không bao giờ co và không bao giờ giãn. Hệ quả đo
 * được: chấm luôn $20{,}3$px ở mọi bài và mọi trạng thái thu gọn.
 *
 * Vì sao lấy đúng $44$: `COLUMN × ROW` là ô chạm của một node, và NFR-A3 đòi
 * $44$px. Ở hệ số này ô chạm là $44 \times 50{,}8$px — đạt cả hai chiều. Bản trước
 * có chấm to hơn (26px) nhưng ô chạm thì chưa ai tính, và một chấm to trong một ô
 * chạm nhỏ là thứ tệ nhất trong hai.
 *
 * Đo trên kho tại lúc viết: bài rộng nhất ra 264px, cao nhất 254px — **không lời
 * giải nào** phải cuộn. Cuộn là hàng rào cho bài chưa soạn, không phải cho kho.
 */
export const TREE_CELL_PX = 44;

/** Pixel trên một đơn vị bố cục cây. */
export const TREE_SCALE = TREE_CELL_PX / COLUMN;

/** Trần chiều cao khung bản đồ. Vượt thì **cuộn**, không co. */
export const TREE_MAX_PX = 260;

export function TreeNavigator({ tree, currentId, onSelect }: TreeNavigatorProps) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [open, setOpen] = useState(true);

  const layout = useMemo(() => layoutTree(tree, collapsed), [tree, collapsed]);
  const crumbs = useMemo(() => breadcrumb(tree, currentId), [tree, currentId]);
  const onPath = useMemo(
    () => new Set(pathTo(tree, currentId).map((step) => step.id)),
    [tree, currentId],
  );

  /**
   * Thứ tự **duyệt của bàn phím**, không phải thứ tự bố cục.
   *
   * `layoutTree` đẩy con trước cha (hậu thứ tự) vì nó cần toạ độ con để căn giữa
   * cha. Bấm ↓ mà nhảy từ một lá lên cha nó thì đó là bản đồ đang tiết lộ thứ tự
   * duyệt nội bộ của mình — `role="tree"` hứa thứ tự **đọc**, tức tiền thứ tự, chỉ
   * đi qua node đang hiện.
   */
  const order = useMemo(() => visibleOrder(tree, collapsed), [tree, collapsed]);

  // Một tab stop cho cả cây (roving tabindex). Trước đây mỗi node là một tab stop,
  // nên một cây 11 node ăn 11 lần Tab của người dùng bàn phím — trong khi
  // `role="tree"` đã hứa ngược lại với screen reader.
  const [focusId, setFocusId] = useState(currentId);
  const refs = useRef(new Map<string, SVGGElement>());

  useEffect(() => setFocusId(currentId), [currentId]);

  // Focus **sau khi** danh sách node đã đổi: bấm ← để thu gọn làm node con biến
  // mất, và nếu focus đang ở đó thì focus rơi về `<body>` — người dùng bàn phím
  // mất chỗ đứng giữa chừng.
  const moveFocus = (id: string): void => {
    setFocusId(id);
    refs.current.get(id)?.focus();
  };

  const toggle = (stepId: string): void => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });
  };

  const onKeyDown = (event: KeyboardEvent, step: Step): void => {
    const at = order.indexOf(step.id);
    const kids = childrenOf(tree, step.id);
    const isCollapsed = collapsed.has(step.id);

    switch (event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault();
        onSelect(step.id);
        return;
      case 'ArrowDown':
        event.preventDefault();
        if (at >= 0 && at + 1 < order.length) moveFocus(order[at + 1] as string);
        return;
      case 'ArrowUp':
        event.preventDefault();
        if (at > 0) moveFocus(order[at - 1] as string);
        return;
      case 'ArrowRight':
        // Luật của `role="tree"`: đang thu thì mở, đang mở thì đi xuống con đầu.
        event.preventDefault();
        if (kids.length === 0) return;
        if (isCollapsed) toggle(step.id);
        else moveFocus((kids[0] as Step).id);
        return;
      case 'ArrowLeft':
        // Đối xứng: đang mở thì thu, đang thu (hoặc là lá) thì lên cha.
        event.preventDefault();
        if (kids.length > 0 && !isCollapsed) toggle(step.id);
        else if (step.parent) moveFocus(step.parent);
        return;
      case 'Home':
        event.preventDefault();
        if (order.length > 0) moveFocus(order[0] as string);
        return;
      case 'End':
        event.preventDefault();
        if (order.length > 0) moveFocus(order[order.length - 1] as string);
        return;
      default:
    }
  };

  const minX = Math.min(...layout.nodes.map((n) => n.x), 0);
  const boxWidth = layout.width + COLUMN;
  const boxHeight = layout.height;

  return (
    <section class="tree" aria-label="Cấu trúc lời giải">
      <header class="tree__head">
        <button
          class="tree__toggle"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {open ? '▾' : '▸'} Cấu trúc
        </button>

        {/* Breadcrumb luôn hiện, kể cả khi minimap đã thu: nó rẻ về chỗ và trả lời
            câu "mình đang ở đâu", còn minimap trả lời câu "còn gì nữa". */}
        {crumbs.length > 0 ? (
          <p class="tree__crumbs">{crumbs.join(' › ')}</p>
        ) : isMergeTarget(tree, currentId) ? (
          <p class="tree__crumbs tree__crumbs--main">Tổng hợp mọi trường hợp</p>
        ) : (
          <p class="tree__crumbs tree__crumbs--main">Nhánh chính</p>
        )}
      </header>

      {open ? (
        <div class="tree__canvas" style={{ maxHeight: `${TREE_MAX_PX}px` }}>
          <svg
            viewBox={`${minX - COLUMN / 2} ${-ROW / 2} ${boxWidth} ${boxHeight}`}
            /* `width`/`height` bằng **pixel thật**, không phải phần trăm: đây là cả
               nội dung của luật tỉ lệ. Bỏ hai thuộc tính này thì CSS lại kéo svg cho
               vừa khung và mọi thứ ở trên thành vô nghĩa. */
            width={round(boxWidth * TREE_SCALE)}
            height={round(boxHeight * TREE_SCALE)}
            role="tree"
          >
            {layout.edges.map((edge, i) => (
              <path
                key={i}
                d={edgePath(edge.from, edge.to, edge.dashed)}
                fill="none"
                stroke={edge.dashed ? '#9A9A92' : '#C4C4BD'}
                stroke-width={edge.dashed ? 1 : 1.5}
                {...(edge.dashed ? { 'stroke-dasharray': '3 3' } : {})}
              />
            ))}

            {layout.nodes.map((node) => {
              const isCurrent = node.step.id === currentId;
              const closed = isClosedBranch(tree, node.step.id);
              const hasKids = childrenOf(tree, node.step.id).length > 0;

              return (
                <g
                  key={node.step.id}
                  class="tree__node"
                  ref={(el) => {
                    if (el) refs.current.set(node.step.id, el);
                    else refs.current.delete(node.step.id);
                  }}
                  transform={`translate(${node.x} ${node.y})`}
                  onClick={() => onSelect(node.step.id)}
                  role="treeitem"
                  aria-selected={isCurrent}
                  aria-label={nodeLabel(node.step, closed)}
                  {...(hasKids ? { 'aria-expanded': !collapsed.has(node.step.id) } : {})}
                  /* `tabindex` thường, **không** phải `tabIndex`. Trên phần tử SVG,
                     Preact gán prop viết hoa thành *thuộc tính JS* chứ không thành
                     *attribute*, và `SVGElement.tabIndex = 0` không làm phần tử vào
                     được vòng Tab — đo được: `getAttribute('tabindex')` trả `null`
                     và `focus()` rơi về `<body>`. Bản trước dùng `tabIndex={0}`
                     suốt từ M5, nên bản đồ này **chưa bao giờ** bấm được bằng bàn
                     phím: không phải "11 tab stop" mà là **không tab stop nào**, và
                     `onKeyDown` cho Enter/Space nằm đó chưa từng chạy một lần. */
                  tabindex={node.step.id === focusId ? 0 : -1}
                  onKeyDown={(event) => onKeyDown(event as unknown as KeyboardEvent, node.step)}
                >
                  {/* Ô chạm là **cả ô**, không phải cái chấm. Chấm $20$px là thứ
                      nhìn thấy; $44 \times 50{,}8$px là thứ bấm được (NFR-A3). Hai
                      con số ấy khác nhau là chủ đích. */}
                  <rect
                    x={-COLUMN / 2}
                    y={-ROW / 2}
                    width={COLUMN}
                    height={ROW}
                    fill="transparent"
                  />

                  <circle
                    r={isCurrent ? 8 : 6}
                    fill={
                      isCurrent
                        ? '#0072B2'
                        : onPath.has(node.step.id)
                          ? '#9ED9F5'
                          : '#EDEDEA'
                    }
                    stroke={node.step.edge_type === 'contradiction' ? '#C5221F' : '#8A8A82'}
                    stroke-width="1.5"
                  />

                  {node.step.edge_type === 'contradiction' ? (
                    <text
                      y="0.5"
                      text-anchor="middle"
                      dominant-baseline="central"
                      font-size="8"
                      fill="#C5221F"
                    >
                      ✗
                    </text>
                  ) : null}

                  {node.step.edge_type === 'merge_ref' ? (
                    <text
                      y="0.5"
                      text-anchor="middle"
                      dominant-baseline="central"
                      font-size="8"
                      fill="#6A6A62"
                    >
                      ↰
                    </text>
                  ) : null}

                  {/* Không phải một tab stop riêng, và đó là **đúng chuẩn** chứ
                      không phải bỏ sót: `role="tree"` quy định thu/mở đi bằng ←/→
                      trên chính treeitem. Thêm một nút vào vòng Tab là thêm một
                      chặng cho người dùng bàn phím để làm thứ họ đã làm được. */}
                  {hasKids ? (
                    <circle
                      class="tree__collapse"
                      cy="11"
                      r="4.5"
                      fill="#FDFDFC"
                      stroke="#8A8A82"
                      aria-hidden="true"
                      onClick={(event) => {
                        event.stopPropagation();
                        toggle(node.step.id);
                      }}
                    />
                  ) : null}
                  {hasKids ? (
                    <text
                      y="11.5"
                      text-anchor="middle"
                      dominant-baseline="central"
                      font-size="6"
                      fill="#6A6A62"
                      style={{ pointerEvents: 'none' }}
                    >
                      {collapsed.has(node.step.id) ? '+' : '−'}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>
        </div>
      ) : null}
    </section>
  );
}

/**
 * Cạnh vẽ theo kiểu "ống nước": xuống, ngang, xuống.
 *
 * Đường thẳng chéo giữa cha và con làm cây có nhiều nhánh trông như một mạng
 * nhện; gấp khúc vuông làm cấu trúc phân cấp đọc được ngay.
 */
function edgePath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  dashed: boolean,
): string {
  if (dashed) {
    // merge_ref đi ngược lên: vòng ra bên phải để không chồng lên cạnh cha–con.
    const bulge = Math.max(Math.abs(to.y - from.y) * 0.5, 14);
    return `M${from.x} ${from.y}C${from.x + bulge} ${from.y} ${to.x + bulge} ${to.y} ${to.x} ${to.y}`;
  }

  const mid = (from.y + to.y) / 2;
  return `M${from.x} ${from.y}L${from.x} ${mid}L${to.x} ${mid}L${to.x} ${to.y}`;
}

/** Tiền thứ tự, chỉ qua node đang hiện — thứ tự mà ↑/↓ phải đi theo. */
function visibleOrder(tree: SolutionTree, collapsed: ReadonlySet<string>): readonly string[] {
  const out: string[] = [];
  const walk = (step: Step): void => {
    out.push(step.id);
    if (collapsed.has(step.id)) return;
    for (const child of childrenOf(tree, step.id)) walk(child);
  };
  if (tree.root) walk(tree.root);
  return out;
}

function round(value: number): number {
  return Math.round(value * 100) / 100 + 0;
}

function nodeLabel(step: { id: string; case_label?: { vi: string }; edge_type: string }, closed: boolean): string {
  const base = step.case_label?.vi ?? step.id;
  if (step.edge_type === 'contradiction') return `${base} — mâu thuẫn, nhánh đóng`;
  if (step.edge_type === 'merge_ref') return `${base} — quay về bước tổng hợp`;
  return closed ? `${base} — nhánh đã đóng` : base;
}
