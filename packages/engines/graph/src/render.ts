import type { Scene, Viewport } from '@combviz/schema';
import {
  decorationAttrs,
  el,
  estimateTextWidth,
  fillForClass,
  keyed,
  text,
  type EngineRenderer,
  type RenderContext,
  type SvgNode,
} from '@combviz/render';
import {
  buildGraph,
  SPACING,
  VERTEX_RADIUS,
  type Edge,
  type GraphModel,
  type Vertex,
} from './graph.js';
import type { GraphConfig } from './schema.js';
import { matrixViewport, renderMatrix } from './matrix.js';
import { pruferCode, treeShape } from './analyzers.js';

/**
 * Bề rộng ước lượng của một ký tự nhãn, tính bằng đơn vị scene.
 *
 * `labelSize` của theme là 14 **px trên khung nhìn chuẩn**, còn khoảng cách đỉnh
 * chuẩn là 10 đơn vị scene. Con số dưới đây là ước lượng thô cho chữ Latin có
 * dấu ở cỡ đó; nó chỉ dùng để chừa lề, không dùng để đặt chữ, nên sai số vài
 * phần trăm không ảnh hưởng gì ngoài một chút khoảng trắng thừa.
 */
const LABEL_CHAR_WIDTH = 1.6;

/** Cạnh một ô của hàng mã Prüfer. */
const PRUFER_CELL = SPACING * 0.8;

/**
 * Hộp bao của hàng mã Prüfer, tính **một lần** rồi cả khung lẫn renderer đọc.
 *
 * Bản đầu ước bề rộng riêng rồi so với bề rộng hình bằng một phép `max` — và nó
 * so nhầm hai thứ khác gốc toạ độ, nên ô cuối của mã nằm ngoài khung. Không test
 * nào bắt được vì chẳng có gì *sai*; chỉ nhìn mới thấy, đúng lần thứ chín trong
 * kho này.
 */
function pruferBox(
  scene: Scene,
): { left: number; top: number; right: number; bottom: number } | null {
  const config = scene.config as GraphConfig | undefined;
  if (!config?.show_prufer) return null;

  const graph = buildGraph(scene);
  const padding = config.padding ?? 6;
  const xs = graph.vertices.map((v) => v.x);
  const ys = graph.vertices.map((v) => v.y);
  const left = graph.vertices.length === 0 ? 0 : Math.min(...xs);
  const top =
    (graph.vertices.length === 0 ? 0 : Math.max(...ys)) + VERTEX_RADIUS + padding * 0.6;

  const result = pruferCode(graph);
  if (result.value === null) {
    return {
      left,
      top,
      right: left + estimateTextWidth(PRUFER_REFUSED, SPACING * 0.32),
      bottom: top + PRUFER_CELL,
    };
  }

  const cells = left + PRUFER_GUTTER + result.value.code.length * PRUFER_CELL * 1.15;
  return {
    left,
    top,
    right: Math.max(cells, left + estimateTextWidth(PRUFER_LABEL, SPACING * 0.32)),
    bottom: top + PRUFER_CELL,
  };
}

/** Chỗ chừa cho chữ "Mã Prüfer:" trước ô đầu tiên. */
const PRUFER_GUTTER = SPACING * 2.2;

const PRUFER_LABEL = 'Mã Prüfer:';
const PRUFER_REFUSED = 'Không phải cây — không có mã Prüfer';

/**
 * Hàng ô mã Prüfer, vẽ dưới hình (GR-09).
 *
 * Nửa còn lại của một song ánh, đặt cạnh nửa kia trong **cùng một khung**: bên
 * trên là cây, bên dưới là dãy. Mỗi ô mang màu của đỉnh nó trỏ tới, nên "đỉnh $5$
 * xuất hiện hai lần" đọc được bằng mắt — mà đó chính là bổ đề bậc $=$ số lần $+1$.
 */
function renderPrufer(scene: Scene, ctx: RenderContext): SvgNode[] {
  const box = pruferBox(scene);
  if (box === null) return [];
  const graph = buildGraph(scene);
  const result = pruferCode(graph);
  const { left, top } = box;

  if (result.value === null) {
    // Nói ra là mình không vẽ được, thay vì để một khoảng trống mà người đọc
    // tưởng là mã rỗng.
    return [
      text(
        'text',
        {
          x: round(left),
          y: round(top + PRUFER_CELL * 0.6),
          'font-family': ctx.theme.type.uiFamily,
          'font-size': SPACING * 0.32,
          fill: ctx.theme.surface.guide,
        },
        PRUFER_REFUSED,
      ),
    ];
  }

  const nodes: SvgNode[] = [
    text(
      'text',
      {
        x: round(left),
        y: round(top + PRUFER_CELL * 0.6),
        'dominant-baseline': 'central',
        'font-family': ctx.theme.type.uiFamily,
        'font-size': SPACING * 0.32,
        fill: ctx.theme.surface.guide,
      },
      PRUFER_LABEL,
    ),
  ];

  const start = left + PRUFER_GUTTER;
  result.value.code.forEach((id, i) => {
    const vertex = graph.byId.get(id);
    const x = start + i * PRUFER_CELL * 1.15;
    nodes.push(
      keyed(`prufer-${i}`, 'rect', {
        x: round(x),
        y: round(top),
        width: PRUFER_CELL,
        height: PRUFER_CELL,
        rx: 1,
        fill: fillForClass(ctx, vertex?.colorClass || undefined),
        stroke: ctx.theme.surface.guide,
        'stroke-width': ctx.theme.stroke.hairline,
        ...decorationAttrs(ctx, `prufer-${i}`, undefined),
      }),
    );
    nodes.push(
      text(
        'text',
        {
          x: round(x + PRUFER_CELL / 2),
          y: round(top + PRUFER_CELL / 2),
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': ctx.theme.type.mathFamily,
          'font-size': PRUFER_CELL * 0.5,
          fill: ctx.theme.emphasis.focusHalo,
        },
        vertex?.label ?? id,
      ),
    );
  });

  return nodes;
}

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

    if (config?.view === 'matrix') {
      return matrixViewport(graph, config.show_sums === true);
    }

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

    // Hàng ô mã Prüfer nằm **dưới và bên phải** hình, nên khung phải nới cả hai
    // chiều — và nới theo hộp bao **thật** của nó, không theo một ước lượng riêng.
    const prufer = pruferBox(scene);
    const right = prufer === null ? maxX : Math.max(maxX, prufer.right + padding);
    const low = prufer === null ? maxY : Math.max(maxY, prufer.bottom + padding * 0.6);

    return {
      x: round(minX),
      y: round(minY),
      width: round(Math.max(right - minX, SPACING)),
      height: round(Math.max(low - minY, SPACING)),
    };
  },

  render(scene: Scene, ctx: RenderContext): SvgNode[] {
    const graph = buildGraph(scene);
    const config = (scene.config as GraphConfig) ?? {};

    if (config.view === 'matrix') {
      return [el('g', { class: 'cv-matrix' }, renderMatrix(graph, ctx, config.show_sums === true))];
    }

    const centre = centroid(graph);
    const weight = ctx.theme.stroke.link / ctx.theme.stroke.base;

    // GR-10 — sống lưng đường kính, vẽ **dưới** các cạnh để không chôn chúng.
    const spine = config.show_diameter ? renderDiameter(graph, ctx) : [];

    return [
      ...(config.show_prufer ? [el('g', { class: 'cv-prufer' }, renderPrufer(scene, ctx))] : []),
      ...(spine.length > 0 ? [el('g', { class: 'cv-diameter' }, spine)] : []),
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
        (() => {
          const ordered = [...graph.edges].sort(
            (a, b) => weightOf(a, ctx) - weightOf(b, ctx),
          );
          // Mũi tên vẽ thành **lớp riêng sau tất cả các cạnh**, không đi kèm từng
          // cạnh. Halo của cạnh được nhấn dày hơn nét thường, mà các cạnh gặp
          // nhau đúng ở đỉnh — nơi mũi tên đứng. Vẽ xen kẽ thì halo của cạnh sau
          // chôn mũi tên của cạnh trước: trong chu trình 3 đỉnh cùng được nhấn,
          // cả ba mũi tên biến mất và hình vẽ không còn nói được chiều nào.
          return [
            ...ordered.flatMap((edge) => renderEdge(edge, graph, ctx, weight)),
            ...ordered.flatMap((edge) => renderArrow(edge, graph, ctx, weight)),
          ];
        })(),
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
                  ...labelAnchor(vertex, centre, graph),
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
                  ...degreeAnchor(
                    vertex,
                    centre,
                    graph,
                    Boolean(vertex.label) && (config.show_labels ?? true),
                  ),
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
 * GR-10 — **sống lưng** của cây: đường kính vẽ thành một dải mờ chạy dưới các cạnh.
 *
 * Vì sao là một dải chứ không phải tô màu từng cạnh: đường kính là **một vật** —
 * một đường đi — chứ không phải một tập cạnh rời. Tô từng cạnh thì người đọc phải
 * tự nối chúng lại bằng mắt, và ở cây có nhiều nhánh thì nối nhầm rất dễ.
 *
 * Đỉnh **tâm** được đánh dấu ngay trên dải, vì mệnh đề "tâm nằm giữa đường kính"
 * là thứ hình này sinh ra để nói. Trọng tâm thì **không** đánh dấu ở đây, và lý do
 * không phải là nó nằm ngoài dải — nhiều khi nó nằm trên. Lý do là nó **không được
 * định nghĩa bằng đường kính** chút nào: nó cực tiểu hoá cỡ mảnh, không cực tiểu
 * hoá khoảng cách. Vẽ nó lên dải sẽ gợi ý một quan hệ không có, và gợi ý ấy sai ở
 * đúng chỗ mà cả họ bài này muốn phân biệt. Muốn chỉ trọng tâm thì neo vào đỉnh —
 * `v.is_centroid` có sẵn cho biểu thức, và anchor là công cụ đúng cho việc chỉ trỏ.
 *
 * Không phải cây thì **không vẽ gì**: hình im lặng chứ không vẽ một đường đi
 * trông có vẻ đúng trong một đồ thị mà "đường kính" chưa được định nghĩa.
 */
function renderDiameter(graph: GraphModel, ctx: RenderContext): SvgNode[] {
  const shape = treeShape(graph).value;
  if (!shape || shape.diameterPath.length < 2) return [];

  const points = shape.diameterPath
    .map((id) => graph.byId.get(id))
    .filter((v): v is Vertex => v !== undefined);
  if (points.length < 2) return [];

  const d = points
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${round(v.x)} ${round(v.y)}`)
    .join('');

  return [
    keyed('diameter-spine', 'path', {
      d,
      fill: 'none',
      stroke: ctx.theme.emphasis.focusHalo,
      'stroke-width': VERTEX_RADIUS * 1.6,
      'stroke-opacity': 0.22,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    }),
    ...shape.centre
      .map((id) => graph.byId.get(id))
      .filter((v): v is Vertex => v !== undefined)
      .map((v) =>
        keyed(`centre-${v.id}`, 'circle', {
          cx: round(v.x),
          cy: round(v.y),
          r: round(VERTEX_RADIUS * 1.55),
          fill: 'none',
          stroke: ctx.theme.emphasis.focusHalo,
          'stroke-width': ctx.theme.stroke.base,
          'stroke-dasharray': `${round(VERTEX_RADIUS * 0.5)} ${round(VERTEX_RADIUS * 0.4)}`,
        }),
      ),
  ];
}

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

  const width = strokeWidthOf(edge, ctx);
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
 * Cạnh đã tô màu dày hơn chút: nó mang lập luận, nên phải đọc được giữa đám cạnh
 * chưa xét.
 */
function strokeWidthOf(edge: Edge, ctx: RenderContext): number {
  return edge.colorClass > 0 ? ctx.theme.stroke.link * 1.6 : ctx.theme.stroke.link;
}

/**
 * Bề ngang **thực tế** của một cạnh sau khi cộng halo.
 *
 * Mũi tên cần con số này: đầu mũi hẹp hơn dải nét thì nó nằm lọt hẳn bên trong,
 * cùng màu với chính cạnh, và biến mất. Đó là điều đã xảy ra với chu trình 3
 * đỉnh được nhấn — ba mũi tên đều được vẽ, không mũi nào nhìn thấy.
 */
function bandWidthOf(edge: Edge, ctx: RenderContext, weight: number): number {
  const width = strokeWidthOf(edge, ctx);
  const decoration = decorationAttrs(ctx, edge.id, edge.emphasis, weight);
  if (typeof decoration['stroke'] !== 'string') return width;
  return Number(decoration['stroke-width'] ?? width) + width;
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
function renderArrow(
  edge: Edge,
  graph: GraphModel,
  ctx: RenderContext,
  weight: number,
): SvgNode[] {
  if (!edge.directed || edge.u === edge.v) return [];

  const u = graph.byId.get(edge.u);
  const v = graph.byId.get(edge.v);
  if (!u || !v) return [];

  // Đầu mũi đặt **trên chính đường đã vẽ**, ở chỗ nó rời khỏi mép đỉnh đích —
  // không đặt ở tâm (mũi tên sẽ bị đỉnh che) và không suy ra từ đoạn thẳng
  // $u \to v$ (với `multi_index > 0` cạnh là một cung, và đầu mũi sẽ trôi ra
  // ngoài nét, chỉ lệch hướng: hình khai một chiều còn đường nối đi lối khác).
  const c = controlPoint(u, v, edge.multiIndex);
  const anchor = onQuadratic(u, c, v, VERTEX_RADIUS);
  const tipX = anchor.x;
  const tipY = anchor.y;
  const ux = anchor.tx;
  const uy = anchor.ty;
  // Đầu mũi luôn rộng hơn dải nét của chính cạnh, kể cả khi cạnh đang đội halo.
  const size = Math.max(VERTEX_RADIUS * 0.75, bandWidthOf(edge, ctx, weight) * 1.8);
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
      // Viền mảnh màu nền quanh đầu mũi. Mũi tên hay dừng ngay mép một đỉnh
      // **cùng `color_class` với nó** — hoán vị tô mỗi chu trình một màu là đúng
      // trường hợp đó — và khi ấy tam giác xanh nằm trên đĩa xanh thì không còn
      // là hình gì cả. Viền nền tách nó ra khỏi bất cứ thứ gì phía sau.
      stroke: ctx.theme.surface.canvas,
      'stroke-width': ctx.theme.stroke.link * 0.6,
      'stroke-linejoin': 'round',
      'paint-order': 'stroke',
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

  const c = controlPoint(u, v, multiIndex);
  return `M${round(u.x)} ${round(u.y)}Q${round(c.x)} ${round(c.y)} ${round(v.x)} ${round(v.y)}`;
}

interface CurvePoint {
  readonly x: number;
  readonly y: number;
  /** Tiếp tuyến đã chuẩn hoá, theo chiều đi tới. */
  readonly tx: number;
  readonly ty: number;
}

/**
 * Điểm trên cung Bézier bậc hai, cách điểm cuối `p2` đúng `back` đơn vị.
 *
 * Nhị phân trên tham số $t$ thay vì lùi theo tiếp tuyến từ $p_2$: cung càng cong
 * thì hai cách càng lệch nhau, và lệch theo phương ngang — đầu mũi tên đứng bên
 * cạnh nét chứ không nằm trên nó. Mười vòng đủ cho sai số dưới một phần nghìn
 * khoảng cách đỉnh, và hàm này chỉ chạy một lần cho mỗi cạnh có hướng.
 */
function onQuadratic(
  p0: { x: number; y: number },
  c: { x: number; y: number },
  p2: { x: number; y: number },
  back: number,
): CurvePoint {
  const at = (t: number): { x: number; y: number } => {
    const s = 1 - t;
    return {
      x: s * s * p0.x + 2 * s * t * c.x + t * t * p2.x,
      y: s * s * p0.y + 2 * s * t * c.y + t * t * p2.y,
    };
  };

  // Khoảng cách tới `p2` giảm đơn điệu khi $t$ tiến tới 1 trên các cung ta vẽ
  // (độ phồng bị chặn ở `SPACING * 0.35 * step`), nên nhị phân là hợp lệ.
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 10; i += 1) {
    const mid = (lo + hi) / 2;
    const p = at(mid);
    if (Math.hypot(p2.x - p.x, p2.y - p.y) > back) lo = mid;
    else hi = mid;
  }

  const t = (lo + hi) / 2;
  const point = at(t);
  const dx = 2 * (1 - t) * (c.x - p0.x) + 2 * t * (p2.x - c.x);
  const dy = 2 * (1 - t) * (c.y - p0.y) + 2 * t * (p2.y - c.y);
  const length = Math.hypot(dx, dy) || 1;

  return { x: point.x, y: point.y, tx: dx / length, ty: dy / length };
}

/**
 * Điểm điều khiển của cung nối `u` → `v`.
 *
 * Tách ra vì **hai** chỗ cần nó: nét cạnh và hướng mũi tên. Khi mỗi chỗ tự tính
 * lấy một kiểu thì chúng lệch nhau, và lệch một cách khó thấy — nét cong sang
 * bên này còn đầu mũi chỉ sang bên kia.
 *
 * Cong luân phiên hai bên: cạnh 1 lệch trái, cạnh 2 lệch phải, cạnh 3 lệch trái
 * xa hơn — bó cạnh song song mở ra đối xứng quanh đường thẳng. `multi_index = 0`
 * trả về đúng trung điểm, tức đoạn thẳng.
 */
function controlPoint(
  u: { x: number; y: number },
  v: { x: number; y: number },
  multiIndex: number,
): { x: number; y: number } {
  const mx = (u.x + v.x) / 2;
  const my = (u.y + v.y) / 2;
  if (multiIndex === 0) return { x: mx, y: my };

  const step = Math.ceil(multiIndex / 2);
  const side = multiIndex % 2 === 1 ? 1 : -1;
  const bulge = side * step * SPACING * 0.35;

  // Pháp tuyến dựng trên **cặp đỉnh**, không trên chiều của cạnh: lấy đầu nhỏ
  // hơn theo thứ tự từ điển toạ độ làm gốc. Nếu không, hai cạnh ngược chiều giữa
  // cùng một cặp — chu trình độ dài 2, đúng thứ mọi bài hoán vị đều có — đảo
  // luôn hệ quy chiếu, và `multi_index` 1 với 2 cùng cong về một phía thay vì
  // tách ra: hai cung đè lên nhau, trông như một cạnh có hai đầu mũi.
  const flip = u.x > v.x || (u.x === v.x && u.y > v.y);
  const [a, b] = flip ? [v, u] : [u, v];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;

  return { x: mx - (dy / length) * bulge, y: my + (dx / length) * bulge };
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
  vertex: { id: string; x: number; y: number },
  centre: { x: number; y: number },
  graph: GraphModel,
): Record<string, string | number> {
  const gap = VERTEX_RADIUS + 1.1;
  const angle = labelDirection(vertex, centre, graph);
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);

  return {
    x: round(vertex.x + ux * gap),
    y: round(vertex.y + uy * gap),
    'text-anchor': ux > 0.3 ? 'start' : ux < -0.3 ? 'end' : 'middle',
    'dominant-baseline': uy > 0.3 ? 'hanging' : uy < -0.3 ? 'auto' : 'central',
  };
}

/**
 * Chỗ đặt **badge bậc** (GR-03): dưới–phải, **lật sang trái** khi nhãn đã ở bên phải.
 *
 * Badge từng đặt cố định ở dưới–phải. Với đỉnh có nhãn cũng rơi vào dưới–phải,
 * hai con số dính vào nhau và đọc ra một số hai chữ số — hình không sai, chỉ là
 * nói dối, và chỉ thấy khi bật cả `show_labels` lẫn `show_degrees`.
 *
 * Bản "khoảng trống rộng thứ hai" — dùng đúng cơ chế của nhãn — nghe nguyên tắc
 * hơn, và tôi đã viết rồi **bỏ** sau khi render ra ảnh: khoảng trống thứ hai của
 * đỉnh bậc $2$–$3$ thường là một nêm hẹp **giữa hai cạnh**, nên badge rơi thẳng
 * lên nét vẽ. Luật một dòng ở đây cho hình sạch hơn.
 */
function degreeAnchor(
  vertex: { id: string; x: number; y: number },
  centre: { x: number; y: number },
  graph: GraphModel,
  labelled: boolean,
): Record<string, string | number> {
  const labelRight =
    labelled && Number(labelAnchor(vertex, centre, graph)['x']) > vertex.x;
  return {
    x: round(vertex.x + (labelRight ? -1 : 1) * (VERTEX_RADIUS + 1.4)),
    y: round(vertex.y + VERTEX_RADIUS),
    'text-anchor': labelRight ? 'end' : 'start',
  };
}

/**
 * Hướng đặt nhãn: **giữa khoảng trống rộng nhất** giữa các cạnh kề.
 *
 * Quy tắc cũ là "hướng ra xa trọng tâm". Nó đúng cho vòng tròn và cho hai hàng,
 * và sai hẳn cho đỉnh nằm gần tâm: ở $K_4$ vẽ với một đỉnh giữa tam giác, hướng
 * đó gần như ngẫu nhiên — và nó rơi đúng dọc theo một cạnh, nên nhãn nằm đè lên
 * cạnh ấy. Trọng tâm chỉ là **đại diện** cho thứ ta thật sự muốn tránh; tránh
 * thẳng các cạnh thì đúng ở mọi hình, kể cả hai hình kia.
 *
 * Đỉnh cô lập không có cạnh nào để tránh — lúc đó mới quay về trọng tâm.
 */
function labelDirection(
  vertex: { id: string; x: number; y: number },
  centre: { x: number; y: number },
  graph: GraphModel,
): number {
  const angles: number[] = [];
  for (const { to } of graph.adjacency.get(vertex.id) ?? []) {
    const other = graph.byId.get(to);
    if (!other || (other.x === vertex.x && other.y === vertex.y)) continue;
    angles.push(Math.atan2(other.y - vertex.y, other.x - vertex.x));
  }

  if (angles.length === 0) {
    const dx = vertex.x - centre.x;
    const dy = vertex.y - centre.y;
    return Math.hypot(dx, dy) < 1e-9 ? -Math.PI / 2 : Math.atan2(dy, dx);
  }

  angles.sort((a, b) => a - b);

  let best = -Math.PI / 2;
  let widest = -1;
  for (let i = 0; i < angles.length; i += 1) {
    const from = angles[i] as number;
    // Khoảng cuối vòng lại về khoảng đầu, cộng $2\pi$.
    const to = i + 1 < angles.length ? (angles[i + 1] as number) : (angles[0] as number) + 2 * Math.PI;
    if (to - from > widest) {
      widest = to - from;
      best = from + (to - from) / 2;
    }
  }

  return best;
}

function dashAttrs(style: string): Record<string, string | number> {
  if (style === 'dashed') return { 'stroke-dasharray': '2.4 1.6' };
  if (style === 'dotted') return { 'stroke-dasharray': '0.1 2' };
  return {};
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
