import { useMemo, useState } from 'preact/hooks';
import {
  breadcrumb,
  childrenOf,
  isClosedBranch,
  isMergeTarget,
  pathTo,
  type SolutionTree,
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

export function TreeNavigator({ tree, currentId, onSelect }: TreeNavigatorProps) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [open, setOpen] = useState(true);

  const layout = useMemo(() => layoutTree(tree, collapsed), [tree, collapsed]);
  const crumbs = useMemo(() => breadcrumb(tree, currentId), [tree, currentId]);
  const onPath = useMemo(
    () => new Set(pathTo(tree, currentId).map((step) => step.id)),
    [tree, currentId],
  );

  const toggle = (stepId: string): void => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });
  };

  const minX = Math.min(...layout.nodes.map((n) => n.x), 0);

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
        <div class="tree__canvas">
          <svg
            viewBox={`${minX - COLUMN / 2} ${-ROW / 2} ${layout.width + COLUMN} ${layout.height}`}
            style={{ maxHeight: `${Math.min(layout.height * 3, 260)}px` }}
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
                  transform={`translate(${node.x} ${node.y})`}
                  onClick={() => onSelect(node.step.id)}
                  role="treeitem"
                  aria-selected={isCurrent}
                  aria-label={nodeLabel(node.step, closed)}
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelect(node.step.id);
                    }
                  }}
                >
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

                  {hasKids ? (
                    <circle
                      class="tree__collapse"
                      cy="11"
                      r="4.5"
                      fill="#FDFDFC"
                      stroke="#8A8A82"
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

function nodeLabel(step: { id: string; case_label?: { vi: string }; edge_type: string }, closed: boolean): string {
  const base = step.case_label?.vi ?? step.id;
  if (step.edge_type === 'contradiction') return `${base} — mâu thuẫn, nhánh đóng`;
  if (step.edge_type === 'merge_ref') return `${base} — quay về bước tổng hợp`;
  return closed ? `${base} — nhánh đã đóng` : base;
}
