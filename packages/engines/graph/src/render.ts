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
 * Bề rộng ước lượng của một ký tự nhãn, tính bằng đơn vị scene.
 *
 * `labelSize` của theme là 14 **px trên khung nhìn chuẩn**, còn khoảng cách đỉnh
 * chuẩn là 10 đơn vị scene. Con số dưới đây là ước lượng thô cho chữ Latin có
 * dấu ở cỡ đó; nó chỉ dùng để chừa lề, không dùng để đặt chữ, nên sai số vài
 * phần trăm không ảnh hưởng gì ngoài một chút khoảng trắng thừa.
 */
const LABEL_CHAR_WIDTH = 1.6;

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

    // Nhãn đỉnh nằm **ngoài** vòng tròn đỉnh, nên khung nhìn phải chừa chỗ cho
    // chúng — nếu không, đỉnh ngoài cùng bên phải mất đuôi nhãn. Không đo được
    // chiều rộng chữ khi chạy headless (REN-01), nên ước lượng theo số ký tự;
    // ước lượng rộng tay hơn một chút vẫn rẻ hơn nhiều so với một chữ bị cắt.
    const labelRoom =
      (scene.config as GraphConfig)?.show_labels === false
        ? 0
        : Math.max(0, ...graph.vertices.map((v) => (v.label ?? '').length)) *
          LABEL_CHAR_WIDTH;

    const xs = graph.vertices.map((v) => v.x);
    const ys = graph.vertices.map((v) => v.y);
    const minX = Math.min(...xs) - VERTEX_RADIUS - padding - labelRoom;
    const minY = Math.min(...ys) - VERTEX_RADIUS - padding;
    const maxX = Math.max(...xs) + VERTEX_RADIUS + padding + labelRoom;
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
    const weight = ctx.theme.stroke.link / ctx.theme.stroke.base;

    return [
      el(
        'g',
        { class: 'cv-edge-labels' },
        (config.show_labels ?? true)
          ? graph.edges.flatMap((edge) => renderEdgeLabel(edge, graph, ctx))
          : [],
      ),
      el(
        'g',
        { class: 'cv-edges' },
        // Vẽ theo **mức quan trọng**, không theo thứ tự trong file: cạnh chưa xét
        // trước, cạnh đã tô sau, cạnh được nhấn sau cùng. Trong $K_6$ có 15 cạnh
        // cắt nhau, thứ tự file sẽ chôn đúng những cạnh đang mang lập luận.
        [...graph.edges]
          .sort((a, b) => weightOf(a, ctx) - weightOf(b, ctx))
          .flatMap((edge) => [
            ...renderEdge(edge, graph, ctx, weight),
            ...renderArrow(edge, graph, ctx),
          ]),
      ),
      el(
        'g',
        { class: 'cv-vertices' },
        graph.vertices.flatMap((vertex) => {
          const nodes: SvgNode[] = [renderVertexShape(vertex, ctx, weight)];

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

/**
 * Một cạnh, cộng vòng halo khi nó được nhấn.
 *
 * Halo phải là **một path riêng vẽ phía dưới**, không phải thuộc tính chồng lên
 * chính cạnh. Với hình có mặt (ô bàn cờ, quân domino) thì màu nằm ở `fill` còn
 * halo nằm ở `stroke`, hai kênh không đụng nhau. Cạnh đồ thị thì màu **chính là**
 * `stroke` — nên trước sửa này, một cạnh vừa mang `color_class` vừa mang
 * `emphasis: "focus"` bị halo xoá mất màu, im lặng và đúng ở chỗ đau nhất: cạnh
 * đang mang lập luận là cạnh hay được nhấn nhất.
 */
function renderEdge(
  edge: Edge,
  graph: GraphModel,
  ctx: RenderContext,
  weight: number,
): SvgNode[] {
  const u = graph.byId.get(edge.u);
  const v = graph.byId.get(edge.v);
  if (!u || !v) return [];

  const stroke =
    edge.colorClass > 0
      ? fillForClass(ctx, edge.colorClass)
      : ctx.theme.emphasis.focusHalo;

  const d =
    edge.u === edge.v ? loopPath(u.x, u.y, edge.multiIndex) : arcPath(u, v, edge.multiIndex);

  // Cạnh đã tô màu dày hơn chút: nó mang lập luận, nên phải đọc được giữa đám
  // cạnh chưa xét.
  const width = edge.colorClass > 0 ? ctx.theme.stroke.link * 1.6 : ctx.theme.stroke.link;
  const decoration = decorationAttrs(ctx, edge.id, edge.emphasis, weight);
  const haloStroke = decoration['stroke'];

  const nodes: SvgNode[] = [];

  if (typeof haloStroke === 'string') {
    nodes.push(
      keyed(`${edge.id}-halo`, 'path', {
        d,
        fill: 'none',
        stroke: haloStroke,
        'stroke-width': Number(decoration['stroke-width'] ?? width) + width,
        'stroke-linecap': 'round',
      }),
    );
  }

  nodes.push(
    keyed(edge.id, 'path', {
      d,
      fill: 'none',
      stroke,
      'stroke-width': width,
      'stroke-linecap': 'round',
      ...dashAttrs(edge.style),
      ...dimAttrs(ctx, edge.emphasis),
    }),
  );

  return nodes;
}

/**
 * `emphasis: "dim"` cho hình dạng lá.
 *
 * Trường này là của **mọi** element, mọi engine (`ElementBaseProps`), nhưng board
 * engine áp nó qua `groupAttrs` trên `<g>` còn graph engine thì không có nhóm —
 * nên "đẩy ra nền" là một lệnh không ai thi hành. Một scene khai `dim` mà trông
 * y hệt scene không khai là lời nói dối rẻ tiền nhất mà renderer có thể kể.
 */
function dimAttrs(
  ctx: RenderContext,
  emphasis: string | undefined,
): Record<string, string | number> {
  return emphasis === 'dim' ? { opacity: ctx.theme.emphasis.dimOpacity } : {};
}

/**
 * Hình dạng đỉnh (GR-01): tròn, vuông, thoi.
 *
 * Trường thứ tư bị bỏ quên. Nó quan trọng hơn vẻ ngoài: trong đồ thị hai phía,
 * **hình dạng** là kênh phân biệt hai nhóm mà không phụ thuộc màu — đúng thứ
 * NFR-A1 đòi hỏi, và là kênh duy nhất còn lại khi bài đã dùng hết màu cho việc
 * khác.
 */
function renderVertexShape(
  vertex: GraphModel['vertices'][number],
  ctx: RenderContext,
  weight: number,
): SvgNode {
  const common = {
    fill: fillForClass(ctx, vertex.colorClass || undefined),
    stroke: ctx.theme.emphasis.focusHalo,
    'stroke-width': ctx.theme.stroke.link,
    ...decorationAttrs(ctx, vertex.id, vertex.emphasis, weight),
    ...dimAttrs(ctx, vertex.emphasis),
  };

  const shape = vertex.shape;

  if (shape === 'square') {
    const side = VERTEX_RADIUS * 1.7;
    return keyed(vertex.id, 'rect', {
      x: round(vertex.x - side / 2),
      y: round(vertex.y - side / 2),
      width: round(side),
      height: round(side),
      rx: side * 0.12,
      ...common,
    });
  }

  if (shape === 'diamond') {
    const r = VERTEX_RADIUS * 1.15;
    return keyed(vertex.id, 'polygon', {
      points: [
        `${round(vertex.x)},${round(vertex.y - r)}`,
        `${round(vertex.x + r)},${round(vertex.y)}`,
        `${round(vertex.x)},${round(vertex.y + r)}`,
        `${round(vertex.x - r)},${round(vertex.y)}`,
      ].join(' '),
      ...common,
    });
  }

  return keyed(vertex.id, 'circle', {
    cx: vertex.x,
    cy: vertex.y,
    r: VERTEX_RADIUS,
    ...common,
  });
}

/**
 * Mũi tên cho cạnh có hướng (GR-01).
 *
 * `directed` có trong schema từ M4 và renderer **chưa bao giờ đọc nó**: một bài
 * về giải đấu vòng tròn vẽ ra mười đoạn thẳng không đầu không đuôi, trong khi
 * toàn bộ nội dung bài nằm ở chiều "ai thắng ai". Trường ma thứ ba, cùng họ với
 * `show_attacks` và nhãn cạnh.
 *
 * Vẽ tam giác bằng hình học thay vì `<marker>` của SVG: marker thừa kế màu nét
 * qua `context-stroke`, mà resvg (D-08, đường raster của REN-02) không hỗ trợ
 * đầy đủ — nghĩa là mũi tên sẽ có trong browser và biến mất trên OG card. Một
 * tam giác tự vẽ thì ba đường render đều ra đúng một hình.
 */
function renderArrow(edge: Edge, graph: GraphModel, ctx: RenderContext): SvgNode[] {
  if (!edge.directed || edge.u === edge.v) return [];

  const u = graph.byId.get(edge.u);
  const v = graph.byId.get(edge.v);
  if (!u || !v) return [];

  const dx = v.x - u.x;
  const dy = v.y - u.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;

  // Đầu mũi đặt ngay mép vòng tròn đỉnh đích, không đặt ở tâm — đâm vào tâm thì
  // mũi tên bị chính đỉnh che mất.
  const tipX = v.x - ux * VERTEX_RADIUS;
  const tipY = v.y - uy * VERTEX_RADIUS;
  const size = VERTEX_RADIUS * 0.75;
  const baseX = tipX - ux * size;
  const baseY = tipY - uy * size;
  const halfWidth = size * 0.42;

  const stroke =
    edge.colorClass > 0 ? fillForClass(ctx, edge.colorClass) : ctx.theme.emphasis.focusHalo;

  return [
    keyed(`${edge.id}-arrow`, 'polygon', {
      points: [
        `${round(tipX)},${round(tipY)}`,
        `${round(baseX - uy * halfWidth)},${round(baseY + ux * halfWidth)}`,
        `${round(baseX + uy * halfWidth)},${round(baseY - ux * halfWidth)}`,
      ].join(' '),
      fill: stroke,
      ...(edge.emphasis === 'dim' ? { opacity: ctx.theme.emphasis.dimOpacity } : {}),
    }),
  ];
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

/**
 * GR-08 — nhãn cạnh.
 *
 * `EdgeElement` có trường `label` từ M4 và renderer **chưa bao giờ đọc nó**: đặt
 * `label: "có"` thì file hợp lệ, validate xanh, và trên hình không có gì. Cùng
 * một lớp lỗi với `show_attacks` của board engine — trường ma.
 *
 * Nhãn đặt lệch khỏi đường nối theo phương vuông góc: đè lên chính đường nối thì
 * chữ và nét cắt nhau, và ở cây quyết định — nơi nhãn cạnh mang **toàn bộ** nội
 * dung ("có" / "không") — chữ đọc được là điều kiện để hình có nghĩa.
 */
function renderEdgeLabel(
  edge: Edge,
  graph: GraphModel,
  ctx: RenderContext,
): SvgNode[] {
  if (!edge.label) return [];

  const u = graph.byId.get(edge.u);
  const v = graph.byId.get(edge.v);
  if (!u || !v || edge.u === edge.v) return [];

  const dx = v.x - u.x;
  const dy = v.y - u.y;
  const length = Math.hypot(dx, dy) || 1;
  // Pháp tuyến đơn vị, cộng thêm độ lệch của cạnh song song để nhãn đi theo
  // đúng đường cong của cạnh mình.
  const offset = VERTEX_RADIUS * 0.9 + edge.multiIndex * VERTEX_RADIUS;

  return [
    {
      ...text(
        'text',
        {
          x: round((u.x + v.x) / 2 + (-dy / length) * offset),
          y: round((u.y + v.y) / 2 + (dx / length) * offset),
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': ctx.theme.type.uiFamily,
          'font-size': ctx.theme.type.badgeSize * 0.22,
          fill: ctx.theme.surface.guide,
        },
        edge.label,
      ),
      key: `${edge.id}-label`,
    },
  ];
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
