import type { Scene, Viewport } from '@combviz/schema';
import {
  decorationAttrs,
  el,
  fillForClass,
  keyed,
  text,
  type EngineRenderer,
  type RenderContext,
  type SvgNode,
} from '@combviz/render';
import { buildGraph, SPACING, VERTEX_RADIUS, type Edge, type GraphModel } from './graph.js';
import type { GraphConfig } from './schema.js';

/**
 * Renderer của Graph engine (GR-01, GR-08).
 *
 * Cạnh vẽ **trước** đỉnh: đỉnh phải nằm trên và che đầu mút cạnh, nếu không mỗi
 * đỉnh sẽ trông như có một chùm gạch đâm xuyên qua.
 */
export const graphRenderer: EngineRenderer = {
  id: 'graph',

  defaultViewport(scene: Scene): Viewport {
    const graph = buildGraph(scene);
    const config = scene.config as GraphConfig;
    const padding = config?.padding ?? 6;

    if (graph.vertices.length === 0) {
      return { x: -padding, y: -padding, width: padding * 2, height: padding * 2 };
    }

    const xs = graph.vertices.map((v) => v.x);
    const ys = graph.vertices.map((v) => v.y);
    const minX = Math.min(...xs) - VERTEX_RADIUS - padding;
    const minY = Math.min(...ys) - VERTEX_RADIUS - padding;
    const maxX = Math.max(...xs) + VERTEX_RADIUS + padding;
    const maxY = Math.max(...ys) + VERTEX_RADIUS + padding;

    return {
      x: round(minX),
      y: round(minY),
      width: round(Math.max(maxX - minX, SPACING)),
      height: round(Math.max(maxY - minY, SPACING)),
    };
  },

  render(scene: Scene, ctx: RenderContext): SvgNode[] {
    const graph = buildGraph(scene);
    const config = (scene.config as GraphConfig) ?? {};

    const centre = centroid(graph);

    return [
      el(
        'g',
        { class: 'cv-edges' },
        // Vẽ theo **mức quan trọng**, không theo thứ tự trong file: cạnh chưa xét
        // trước, cạnh đã tô sau, cạnh được nhấn sau cùng. Trong $K_6$ có 15 cạnh
        // cắt nhau, thứ tự file sẽ chôn đúng những cạnh đang mang lập luận.
        [...graph.edges]
          .sort((a, b) => weightOf(a, ctx) - weightOf(b, ctx))
          .map((edge) => renderEdge(edge, graph, ctx)),
      ),
      el(
        'g',
        { class: 'cv-vertices' },
        graph.vertices.flatMap((vertex) => {
          const nodes: SvgNode[] = [
            keyed(vertex.id, 'circle', {
              cx: vertex.x,
              cy: vertex.y,
              r: VERTEX_RADIUS,
              fill: fillForClass(ctx, vertex.colorClass || undefined),
              stroke: ctx.theme.emphasis.focusHalo,
              'stroke-width': ctx.theme.stroke.link,
              ...decorationAttrs(ctx, vertex.id, vertex.emphasis),
            }),
          ];

          if (vertex.label && (config.show_labels ?? true)) {
            nodes.push(
              text(
                'text',
                {
                  // Nhãn đặt ngoài đỉnh và hướng **ra xa tâm** đồ thị. Đặt trong thì
                  // đỉnh phải to ra để chứa chữ, và bán kính khi đó phụ thuộc độ dài
                  // nhãn — hai đỉnh cùng vai trò trông khác cỡ nhau. Đặt cố định
                  // phía trên thì với layout vòng tròn, nhãn của nửa dưới rơi thẳng
                  // vào giữa chùm cạnh.
                  ...labelAnchor(vertex, centre),
                  'font-family': ctx.theme.type.mathFamily,
                  'font-size': VERTEX_RADIUS * 1.05,
                  'font-style': 'italic',
                  fill: ctx.theme.emphasis.focusHalo,
                },
                vertex.label,
              ),
            );
          }

          if (config.show_degrees) {
            nodes.push(
              text(
                'text',
                {
                  x: vertex.x + VERTEX_RADIUS + 1.4,
                  y: vertex.y + VERTEX_RADIUS,
                  'text-anchor': 'start',
                  'font-family': ctx.theme.type.uiFamily,
                  'font-size': VERTEX_RADIUS * 1.1,
                  fill: ctx.theme.surface.guide,
                },
                String(graph.degree.get(vertex.id) ?? 0),
              ),
            );
          }

          return nodes;
        }),
      ),
    ];
  },
};

function renderEdge(edge: Edge, graph: GraphModel, ctx: RenderContext): SvgNode {
  const u = graph.byId.get(edge.u);
  const v = graph.byId.get(edge.v);
  if (!u || !v) return el('g', {});

  const stroke =
    edge.colorClass > 0
      ? fillForClass(ctx, edge.colorClass)
      : ctx.theme.emphasis.focusHalo;

  return keyed(edge.id, 'path', {
    d: edge.u === edge.v ? loopPath(u.x, u.y, edge.multiIndex) : arcPath(u, v, edge.multiIndex),
    fill: 'none',
    stroke,
    // Cạnh đã tô màu dày hơn chút: nó mang lập luận, nên phải đọc được giữa đám
    // cạnh chưa xét.
    'stroke-width':
      edge.colorClass > 0 ? ctx.theme.stroke.link * 1.6 : ctx.theme.stroke.link,
    'stroke-linecap': 'round',
    ...dashAttrs(edge.style),
    ...decorationAttrs(ctx, edge.id, edge.emphasis),
  });
}

/**
 * Cạnh thứ `k` giữa cùng một cặp đỉnh cong ra xa dần.
 *
 * `multi_index = 0` cho đường thẳng — trường hợp thường gặp nhất phải là trường
 * hợp đơn giản nhất, và một đồ thị đơn không được trông cong queo chỉ vì engine
 * hỗ trợ multigraph.
 */
function arcPath(
  u: { x: number; y: number },
  v: { x: number; y: number },
  multiIndex: number,
): string {
  if (multiIndex === 0) {
    return `M${round(u.x)} ${round(u.y)}L${round(v.x)} ${round(v.y)}`;
  }

  // Cong luân phiên hai bên: cạnh 1 lệch trái, cạnh 2 lệch phải, cạnh 3 lệch
  // trái xa hơn — bó cạnh song song mở ra đối xứng quanh đường thẳng.
  const step = Math.ceil(multiIndex / 2);
  const side = multiIndex % 2 === 1 ? 1 : -1;
  const bulge = side * step * SPACING * 0.35;

  const mx = (u.x + v.x) / 2;
  const my = (u.y + v.y) / 2;
  const dx = v.x - u.x;
  const dy = v.y - u.y;
  const length = Math.hypot(dx, dy) || 1;
  const cx = mx - (dy / length) * bulge;
  const cy = my + (dx / length) * bulge;

  return `M${round(u.x)} ${round(u.y)}Q${round(cx)} ${round(cy)} ${round(v.x)} ${round(v.y)}`;
}

/** Khuyên: vòng tròn nhỏ phía trên đỉnh, to dần theo `multi_index`. */
function loopPath(x: number, y: number, multiIndex: number): string {
  const r = VERTEX_RADIUS * (1.1 + multiIndex * 0.5);
  const top = y - VERTEX_RADIUS;
  return (
    `M${round(x)} ${round(top)}` +
    `C${round(x - r)} ${round(top - r * 1.6)} ${round(x + r)} ${round(top - r * 1.6)} ${round(x)} ${round(top)}`
  );
}

/** Mức quan trọng của một cạnh: càng lớn vẽ càng sau, càng nằm trên. */
function weightOf(edge: Edge, ctx: RenderContext): number {
  if (ctx.invalid.has(edge.id)) return 4;
  if (ctx.highlight.has(edge.id)) return 3;
  if (edge.emphasis === 'focus') return 2;
  return edge.colorClass > 0 ? 1 : 0;
}

function centroid(graph: GraphModel): { x: number; y: number } {
  if (graph.vertices.length === 0) return { x: 0, y: 0 };
  const sum = graph.vertices.reduce(
    (acc, v) => ({ x: acc.x + v.x, y: acc.y + v.y }),
    { x: 0, y: 0 },
  );
  return { x: sum.x / graph.vertices.length, y: sum.y / graph.vertices.length };
}

function labelAnchor(
  vertex: { x: number; y: number },
  centre: { x: number; y: number },
): Record<string, string | number> {
  const dx = vertex.x - centre.x;
  const dy = vertex.y - centre.y;
  const length = Math.hypot(dx, dy);
  const gap = VERTEX_RADIUS + 1.1;

  // Đỉnh nằm đúng tâm (đồ thị một đỉnh) không có hướng "ra ngoài" — đẩy lên trên.
  const ux = length === 0 ? 0 : dx / length;
  const uy = length === 0 ? -1 : dy / length;

  return {
    x: round(vertex.x + ux * gap),
    y: round(vertex.y + uy * gap),
    'text-anchor': ux > 0.3 ? 'start' : ux < -0.3 ? 'end' : 'middle',
    'dominant-baseline': uy > 0.3 ? 'hanging' : uy < -0.3 ? 'auto' : 'central',
  };
}

function dashAttrs(style: string): Record<string, string | number> {
  if (style === 'dashed') return { 'stroke-dasharray': '2.4 1.6' };
  if (style === 'dotted') return { 'stroke-dasharray': '0.1 2' };
  return {};
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
