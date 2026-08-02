import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  breadcrumb,
  isClosedBranch,
  isMergeTarget,
  pathTo,
  type SolutionTree,
  type Step,
} from '@combviz/schema';
import { COLUMN, drawnChildren, layoutTree, ROW } from './tree-layout.js';

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
  /** Bước đã đứng qua trong phiên này — xem `coverageOf`. */
  visited: ReadonlySet<string>;
  /**
   * Chuyến đi sandbox gần nhất, vẽ thành **nhánh ma**.
   *
   * Hai lớp trên **một** bản đồ: nhánh của tác giả là chứng minh, nhánh ma là chỗ
   * người học rẽ ra nghịch. Tách hẳn về mặt thị giác (nét chấm, `--ink-soft`, chữ
   * nghiêng) vì trộn hai thứ ấy là nói dối về cái nào có thẩm quyền.
   *
   * **Một** chấm cho cả chuyến, không phải 40. `TRAIL_LIMIT` cho phép tới 40 thế,
   * mà bản đồ lời giải rộng nhất trong kho có 7 chấm — chép sang là chôn chứng minh
   * dưới đống thí nghiệm. Con số nằm trong nhãn; hình dạng chi tiết vẫn ở bản đồ
   * vết chân trong sandbox, nơi nó có chỗ.
   */
  excursion?: { from: string; states: number };
  /**
   * Bước giữ nguyên **mọi** bất biến so với bước trước — cạnh đi vào tô đậm màu.
   *
   * Đây là ý rủi ro nhất trong lượt, và hàng rào là: **không thêm một hàng, một
   * nhãn hay một con số nào**. Nó chỉ đổi màu một cái cạnh đã có. Bảng số vẫn
   * thuộc về `InvariantStrip`; nếu ngày nào chỗ này bắt đầu in giá trị ra thì hai
   * widget đã nói cùng một chuyện và cái thứ hai nên bị gỡ.
   */
  steady?: ReadonlySet<string>;
  onSelect: (stepId: string) => void;
  /** Bấm nhánh ma ⇒ mở lại sandbox từ đúng bước ấy. */
  onFork?: (stepId: string) => void;
}

/**
 * Ký hiệu trên node — và luật chọn chúng khắt khe hơn "trường này có thật".
 *
 * Kỷ luật: mỗi ký hiệu phải trỏ tới một trường có thật trong schema, **và** trường
 * ấy phải đổi *thứ người học làm được tại bước đó*. Hai tiêu chí, không phải một —
 * "có thật trong schema" khác "có nghĩa với người học", và bảng này từng suýt dài
 * gấp rưỡi vì lẫn hai chuyện:
 *
 * - `expects_violation` (94/557 step) là **chú thích của tác giả** cho lint
 *   sandbox: "bước này cố ý vi phạm validator X". Nó không nói gì về chỗ người học
 *   dễ sai; nó nói về chỗ *validator* sẽ đỏ. Vẽ nó lên bản đồ điều hướng là dạy
 *   người học săn một tín hiệu thuộc khâu soạn bài.
 * - `claims` (89/557) là hợp đồng kiểm nội bộ của engine đại số. Người học không
 *   làm gì khác vì nó.
 *
 * Bốn dấu còn lại thì có: bấm được một ván, mở được hai pane, nhánh đã đóng, và
 * hình đổi hẳn engine. Một bảng bốn dòng nói được nhiều hơn bảng sáu dòng có hai
 * dòng nhiễu.
 */
function engineOf(step: Step): string | undefined {
  return step.scene?.engine;
}

/**
 * Độ phủ **của người đọc**, không phải hình dạng của lời giải.
 *
 * Bản đồ trước lượt này chỉ tô tổ tiên của node hiện tại, nên nó vẽ được *lời giải
 * đi tới đâu* mà không vẽ được *mình đã đi tới đâu*. Chỗ ấy có một lỗ có tên:
 * **PLY-02 dừng auto-play ở mỗi điểm rẽ nhánh** để người học không lỡ nhánh nào —
 * nhưng không có gì nói cho họ biết họ **đã** lỡ. Người học chọn "Trường hợp 1",
 * đọc hết, tới bước tổng hợp, và không có tín hiệu nào rằng Trường hợp 2 chưa mở.
 *
 * Một nhánh tính là **đã xem** khi mọi bước trong nó đã được đứng qua. Nghiêm ngặt
 * là cố ý: "đã ghé vào nhánh" và "đã đọc hết nhánh" là hai chuyện, và chuyện thứ
 * hai mới là chuyện chứng minh đòi.
 */
function coverageOf(
  tree: SolutionTree,
  visited: ReadonlySet<string>,
): ReadonlyMap<string, boolean> {
  const seen = new Map<string, boolean>();
  const walk = (step: Step): boolean => {
    // Duyệt con **trước**, và duyệt hết. Viết
    // `visited.has(id) && kids.every(walk)` thì phép rút gọn của `&&` bỏ qua cả
    // cây con ngay khi node cha chưa thăm — và những node ấy biến mất khỏi bảng,
    // nên chỗ đọc bảng nhận `undefined` chứ không nhận `false`.
    const kidsWhole = drawnChildren(tree, step.id).map((kid) => walk(kid));
    const whole = visited.has(step.id) && kidsWhole.every(Boolean);
    seen.set(step.id, whole);
    return whole;
  };
  if (tree.root) walk(tree.root);
  return seen;
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

export function TreeNavigator({
  tree,
  currentId,
  visited,
  excursion,
  steady,
  onSelect,
  onFork,
}: TreeNavigatorProps) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [open, setOpen] = useState(true);

  /**
   * `merge_ref` không có node, nên chỗ đứng của nó là **ga** mà nó trỏ tới.
   *
   * Không có dòng này thì đứng ở một bước `merge_ref` (tới bằng phím Bước sau, hay
   * bằng deep-link) làm bản đồ không sáng ở đâu cả — người học nhìn một hình không
   * có "mình đang ở đây", đúng câu duy nhất mà bản đồ phải trả lời được.
   */
  const selectedId = useMemo(() => {
    const step = tree.steps.get(currentId);
    return step?.edge_type === 'merge_ref' && step.merge_target
      ? step.merge_target
      : currentId;
  }, [tree, currentId]);

  const covered = useMemo(() => coverageOf(tree, visited), [tree, visited]);
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
  const [focusId, setFocusId] = useState(selectedId);
  const refs = useRef(new Map<string, SVGGElement>());

  useEffect(() => setFocusId(selectedId), [selectedId]);

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
    const kids = drawnChildren(tree, step.id);
    const isCollapsed = collapsed.has(step.id);
    // Trên sợi, ←/→ **đi dọc sợi** thay vì thu/mở — và điều đó rơi ra miễn phí từ
    // luật của `role="tree"`: "→ đi xuống con đầu" trên một node có đúng một con
    // chính là "đi sang bước sau". Chỉ phải chặn một chỗ: ← không được thu gọn.
    const canCollapse = layout.shape === 'tree' && kids.length > 0;

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
        if (canCollapse && isCollapsed) toggle(step.id);
        else moveFocus((kids[0] as Step).id);
        return;
      case 'ArrowLeft':
        // Đối xứng: đang mở thì thu, đang thu (hoặc là lá) thì lên cha.
        event.preventDefault();
        if (canCollapse && !isCollapsed) toggle(step.id);
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

  /**
   * Tự thu nhánh **đã xem hết**, và chỉ đúng một lần cho mỗi nhánh.
   *
   * Hai hàng rào, cả hai đều là chỗ tính năng này dễ thành phiền: không thu nhánh
   * mà người học **đang đứng trong** (thu dưới chân người ta là mất chỗ đứng), và
   * `autoDone` nhớ nhánh nào đã tự thu rồi — nếu không thì người học mở lại và
   * effect thu ngay lập tức, tức một cái nút không bấm được.
   */
  const autoDone = useRef(new Set<string>());
  useEffect(() => {
    if (layout.shape !== 'tree') return;
    const fresh: string[] = [];
    for (const [id, whole] of covered) {
      if (!whole || autoDone.current.has(id)) continue;
      if (onPath.has(id) || drawnChildren(tree, id).length === 0) continue;
      // Chỉ nhánh, tức con của một điểm rẽ — không thu cả gốc.
      const parent = tree.steps.get(id)?.parent;
      if (!parent || drawnChildren(tree, parent).length < 2) continue;
      fresh.push(id);
    }
    if (fresh.length === 0) return;
    for (const id of fresh) autoDone.current.add(id);
    setCollapsed((current) => new Set([...current, ...fresh]));
  }, [covered, onPath, tree, layout.shape]);

  // Nhánh ma treo dưới-phải bước đã bấm "Thử từ đây". Chỉ vẽ khi node ấy đang hiện
  // — nhánh cha thu lại thì nhánh ma theo, vì nó là con của bước ấy chứ không phải
  // một lớp nổi lên trên.
  const ghostAt = excursion
    ? layout.nodes.find((n) => n.step.id === excursion.from)
    : undefined;
  const ghost = ghostAt ? { x: ghostAt.x + COLUMN, y: ghostAt.y + ROW } : undefined;

  const minX = Math.min(...layout.nodes.map((n) => n.x), 0);
  // Khung phải **chứa** nhánh ma, không thì nó vẽ ra ngoài viewBox và biến mất —
  // đúng lỗi mà `box(nodes)` vừa sửa cho bố cục sợi, nên không lặp lại nó ở đây.
  const boxWidth = layout.width + COLUMN + (ghost ? COLUMN : 0);
  const boxHeight = layout.height + (ghost && ghost.y >= layout.height - ROW ? ROW : 0);

  return (
    <section
      class={`tree tree--${layout.shape}`}
      aria-label={
        layout.shape === 'strip' ? 'Các bước của lời giải' : 'Cấu trúc lời giải'
      }
    >
      <header class="tree__head">
        <button
          class="tree__toggle"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {open ? '▾' : '▸'} {layout.shape === 'strip' ? 'Các bước' : 'Cấu trúc'}
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
            /* Sợi vẫn khai `tree`, không đổi sang `list`: một dây chuyền là một cây
               hợp lệ, và mọi ngữ nghĩa đang dùng (`aria-selected`, roving focus,
               ↑↓ đi node) vẫn đúng nguyên. Thứ `tree` hứa mà sợi không có là thu/mở
               — và `aria-expanded` chỉ gắn khi node **có** con để mở, nên lời hứa ấy
               không được phát ra. */
            role="tree"
          >
            {layout.edges.map((edge, i) => (
              <path
                key={i}
                class={!edge.dashed && steady?.has(edge.to.step.id) ? 'tree__edge tree__edge--steady' : 'tree__edge'}
                d={edgePath(edge.from, edge.to, edge.dashed)}
                fill="none"
                stroke={
                  edge.dashed
                    ? '#9A9A92'
                    : steady?.has(edge.to.step.id)
                      ? '#3A7D3A'
                      : '#C4C4BD'
                }
                stroke-width={edge.dashed ? 1 : steady?.has(edge.to.step.id) ? 3 : 1.5}
                {...(edge.dashed ? { 'stroke-dasharray': '3 3' } : {})}
              />
            ))}

            {/* **Nhánh ma** — chuyến sandbox gần nhất, nét chấm và mờ hẳn. Vẽ trước
                node để nó nằm dưới, và không bao giờ tranh chỗ đọc với chứng minh. */}
            {ghost && ghostAt ? (
              <g
                class="tree__ghost"
                onClick={() => onFork?.(excursion?.from ?? '')}
                role="button"
                aria-label={`Đã thử ${excursion?.states} thế từ đây — mở lại sandbox`}
                tabindex={-1}
              >
                <path
                  d={edgePath(ghostAt, { x: ghost.x, y: ghost.y }, false)}
                  fill="none"
                  stroke="#9A9A92"
                  stroke-width="1.2"
                  stroke-dasharray="1 3"
                />
                <circle
                  cx={ghost.x}
                  cy={ghost.y}
                  r="6"
                  fill="#FDFDFC"
                  stroke="#9A9A92"
                  stroke-width="1.2"
                  stroke-dasharray="1 3"
                />
                <text
                  x={ghost.x}
                  y={ghost.y + 0.5}
                  text-anchor="middle"
                  dominant-baseline="central"
                  font-size="7"
                  font-style="italic"
                  fill="#6A6A62"
                >
                  {excursion?.states}
                </text>
              </g>
            ) : null}

            {/* **Đổi engine là chuyện của cạnh, không phải của node.** Nó xảy ra
                *giữa* hai bước, nên vạch nó lên node là vạch sai một nửa: node đích
                không "là" chỗ đổi, nó chỉ là chỗ đã đổi xong. 7/143 lời giải có
                chuyện này, và ở chúng hình dưới tay đổi hẳn loại — người đọc xứng
                đáng được báo trước một nhịp. */}
            {layout.edges.map((edge, i) => {
              if (edge.dashed) return null;
              const from = engineOf(edge.from.step);
              const to = engineOf(edge.to.step);
              if (!from || !to || from === to) return null;
              return (
                <line
                  key={`swap-${i}`}
                  class="tree__swap"
                  x1={edge.to.x - 4}
                  y1={edge.to.y - ROW / 2}
                  x2={edge.to.x + 4}
                  y2={edge.to.y - ROW / 2}
                  stroke="#7A5AB0"
                  stroke-width="2"
                />
              );
            })}

            {layout.nodes.map((node) => {
              const isCurrent = node.step.id === selectedId;
              const isStation = isMergeTarget(tree, node.step.id);
              const closed = isClosedBranch(tree, node.step.id);
              // Trên sợi thì **không** có nút thu gọn: xem `layoutStrip`.
              const hasKids =
                layout.shape === 'tree' && drawnChildren(tree, node.step.id).length > 0;
              const kids = drawnChildren(tree, node.step.id);
              const left = kids.length > 1 ? kids.filter((k) => !covered.get(k.id)).length : 0;
              const allSeen = kids.length > 1 && left === 0;

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
                  aria-label={nodeLabel(node.step, closed, left, allSeen, swapsEngine(tree, node.step))}
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

                  {/* Ván chơi được ⇒ **hình vuông bo góc**, không phải chấm. Khác
                      dáng chứ không khác màu: dáng đọc được ở đuôi mắt, còn màu thì
                      đã dùng hết cho "đang ở đây / trên đường / ngoài đường". */}
                  {node.step.play ? (
                    <rect
                      class="tree__glyph tree__glyph--play"
                      x={-(isCurrent ? 8 : 6)}
                      y={-(isCurrent ? 8 : 6)}
                      width={(isCurrent ? 8 : 6) * 2}
                      height={(isCurrent ? 8 : 6) * 2}
                      rx="2"
                      fill={dotFill(isCurrent, onPath.has(node.step.id))}
                      stroke="#8A8A82"
                      stroke-width="1.5"
                    />
                  ) : isStation ? (
                    /* **Ga** — node tổng hợp mọi nhánh, vẽ thành viên thuốc. Đây là
                       nửa sau của chốt G-03 ("node tổng hợp vẽ khác dạng (viên
                       thuốc) để phân biệt với step thường"), chốt từ tuần 1 và
                       **chưa bao giờ được dựng**: mã chỉ làm nửa đầu (cạnh đứt nét).
                       Một quyết định đã ghi mà không ai thi hành thì nó không khác
                       gì một quyết định chưa có. */
                    <rect
                      class="tree__glyph tree__glyph--station"
                      x={-11}
                      y={-(isCurrent ? 8 : 6)}
                      width={22}
                      height={(isCurrent ? 8 : 6) * 2}
                      rx={isCurrent ? 8 : 6}
                      fill={dotFill(isCurrent, onPath.has(node.step.id))}
                      stroke="#8A8A82"
                      stroke-width="1.5"
                    />
                  ) : (
                    <circle
                      r={isCurrent ? 8 : 6}
                      fill={dotFill(isCurrent, onPath.has(node.step.id))}
                      stroke={node.step.edge_type === 'contradiction' ? '#C5221F' : '#8A8A82'}
                      stroke-width="1.5"
                    />
                  )}

                  {/* Song ánh ⇒ **chấm đôi**: hai pane là cả nội dung của bước ấy,
                      nên một chấm là vẽ thiếu một nửa. */}
                  {node.step.bijection ? (
                    <circle
                      class="tree__glyph tree__glyph--pair"
                      cx="5"
                      cy="-5"
                      r="3.5"
                      fill={dotFill(isCurrent, onPath.has(node.step.id))}
                      stroke="#8A8A82"
                      stroke-width="1.2"
                    />
                  ) : null}

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

                  {/* Độ phủ chỉ vẽ ở **điểm rẽ**, vì chỉ ở đó mới có gì để lỡ.
                      Vẽ nó ở mọi node là biến một tín hiệu thành một hoa văn. */}
                  {left > 0 ? (
                    <text
                      class="tree__left"
                      x={COLUMN / 2 - 1}
                      y="-6"
                      text-anchor="end"
                      font-size="8"
                      font-weight="600"
                      fill="#B26A00"
                    >
                      còn {left}
                    </text>
                  ) : null}
                  {allSeen ? (
                    <text
                      class="tree__done"
                      x={COLUMN / 2 - 1}
                      y="-6"
                      text-anchor="end"
                      font-size="9"
                      fill="#3A7D3A"
                    >
                      ✓
                    </text>
                  ) : null}

                  {/* Chỗ này từng vẽ `↰` cho node `merge_ref`. Nay `merge_ref`
                      không có node nữa (xem `drawnChildren`), nên nhánh ấy là mã
                      chết — xoá thay vì để lại một điều kiện không bao giờ đúng. */}

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
    for (const child of drawnChildren(tree, step.id)) walk(child);
  };
  if (tree.root) walk(tree.root);
  return out;
}

function round(value: number): number {
  return Math.round(value * 100) / 100 + 0;
}

/** Một nguồn cho màu nền node — chấm, ô vuông và chấm đôi phải khớp nhau. */
function dotFill(isCurrent: boolean, onPath: boolean): string {
  if (isCurrent) return '#0072B2';
  return onPath ? '#9ED9F5' : '#EDEDEA';
}

/**
 * Nhãn cho screen reader — và **kênh chính** của độ phủ, không phải kênh phụ.
 *
 * Chữ "còn 1" cao 8 đơn vị trên một bản đồ 260px là thứ dễ trượt khỏi mắt; câu
 * "còn 1 nhánh chưa xem" đọc lên thì không trượt được. Chỗ nào tín hiệu quan trọng
 * hơn chỗ nó chiếm thì nhãn phải mang đủ, chứ không phải hình mang đủ rồi nhãn
 * chép lại một nửa.
 */
/** Bước này có đổi engine so với bước trước không (dấu tím trên cạnh)? */
function swapsEngine(tree: SolutionTree, step: Step): boolean {
  const parent = step.parent ? tree.steps.get(step.parent) : undefined;
  const from = parent ? engineOf(parent) : undefined;
  const to = engineOf(step);
  return Boolean(from && to && from !== to);
}

function nodeLabel(
  step: Step,
  closed: boolean,
  left: number,
  allSeen: boolean,
  swaps: boolean,
): string {
  const base = step.case_label?.vi ?? step.id;
  const cover = left > 0 ? ` — còn ${left} nhánh chưa xem` : allSeen ? ' — đã xem hết nhánh' : '';
  // Ký hiệu trên hình phải nói lại thành lời, nếu không thì bốn dấu ấy chỉ tồn tại
  // cho người nhìn được chúng.
  const marks = [
    step.play ? 'chơi được' : '',
    step.bijection ? 'hai pane song ánh' : '',
    swaps ? `đổi sang hình ${engineOf(step)}` : '',
  ].filter(Boolean);
  const tail = marks.length > 0 ? ` — ${marks.join(', ')}` : '';

  if (step.edge_type === 'contradiction') return `${base} — mâu thuẫn, nhánh đóng${tail}`;
  return `${closed ? `${base} — nhánh đã đóng` : base}${cover}${tail}`;
}
