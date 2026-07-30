import type { Scene, Viewport } from '@combviz/schema';
import {
  estimateTextWidth,
  decorationAttrs,
  el,
  fillForClass,
  keyed,
  strokeForClass,
  text,
  type EngineRenderer,
  type RenderContext,
  type SvgNode,
} from '@combviz/render';
import type { PointConfig } from './schema.js';
import {
  buildPoints,
  convexHull,
  crossings,
  POINT_RADIUS,
  UNIT,
  type Point2,
  type PointModel,
  type Pt,
} from './geometry.js';

const pointConfig = (scene: Scene): PointConfig => (scene.config as PointConfig) ?? {};

/**
 * Renderer của Point/Segment engine (PT-01).
 *
 * Thứ tự vẽ là nội dung, không phải thẩm mỹ: lưới → đa giác → bao lồi → đoạn →
 * giao điểm → điểm → nhãn. Điểm phải nằm **trên** mọi thứ vì chúng là vật thể
 * mà bài toán nói tới; một điểm bị đoạn thẳng đè lên là một điểm người đọc
 * tưởng không có.
 */
/** Cỡ chữ caption — một hằng số, để khung và chữ không đọc hai con số khác nhau. */
const CAPTION_SIZE = UNIT * 0.36;

export const pointRenderer: EngineRenderer = {
  id: 'point',

  defaultViewport(scene: Scene): Viewport {
    const model = buildPoints(scene);
    const config = pointConfig(scene);
    const padding = config.padding ?? 6;

    if (model.points.length === 0) {
      return { x: -padding, y: -padding, width: padding * 2, height: padding * 2 };
    }

    // Nhãn nằm ngoài chấm điểm nên khung phải chừa chỗ; không đo được bề rộng
    // chữ khi chạy headless (REN-01) nên ước lượng theo số ký tự, rộng tay.
    const labelRoom =
      config.show_labels === false
        ? 0
        : Math.max(0, ...model.points.map((p) => (p.label ?? '').length)) * 1.3;

    const xs = model.points.map((p) => p.x);
    const ys = model.points.map((p) => p.y);
    const room = POINT_RADIUS + padding + labelRoom;
    const minX = Math.min(...xs) - room;
    const minY = Math.min(...ys) - room;

    // Cùng lý do với `labelRoom`, nhưng cho caption — và chỗ này thì trước đây
    // **quên**: caption đặt ở `viewport.x + 2` nên chữ dài hơn hình sẽ chạy ra
    // ngoài khung và bị cắt cụt. `estimateTextWidth` dùng chung với ba engine kia.
    const captionWidth = config.caption
      ? estimateTextWidth(config.caption, CAPTION_SIZE) + 4
      : 0;

    return {
      x: round(minX),
      y: round(minY),
      width: round(Math.max(Math.max(...xs) + room - minX, UNIT, captionWidth)),
      height: round(Math.max(Math.max(...ys) + room - minY, UNIT)),
    };
  },

  render(scene: Scene, ctx: RenderContext): SvgNode[] {
    const model = buildPoints(scene);
    const config = pointConfig(scene);
    const viewport = pointRenderer.defaultViewport(scene);

    return [
      el('g', { class: 'cv-point-grid' }, renderGrid(config, viewport, ctx)),
      el('g', { class: 'cv-polygons' }, renderPolygons(model, ctx)),
      el('g', { class: 'cv-hull' }, renderHull(model, config, ctx)),
      el('g', { class: 'cv-lines' }, renderLines(model, viewport, ctx)),
      el('g', { class: 'cv-segments' }, renderSegments(model, ctx)),
      el('g', { class: 'cv-crossings' }, renderCrossings(model, config, ctx)),
      el('g', { class: 'cv-points' }, renderPoints(model, config, ctx)),
      ...(config.caption
        ? [
            text(
              'text',
              {
                x: viewport.x + 2,
                y: viewport.y + UNIT * 0.42,
                'font-family': ctx.theme.type.uiFamily,
                'font-size': CAPTION_SIZE,
                fill: ctx.theme.surface.guide,
              },
              config.caption,
            ),
          ]
        : []),
    ];
  },
};

/**
 * Lưới nền.
 *
 * Bài điểm nguyên nói những mệnh đề **về lưới** — "trung điểm cũng là điểm
 * nguyên" — nên không vẽ lưới thì người đọc không có gì để đối chiếu, và hình
 * chỉ còn là mấy cái chấm rải rác.
 */
function renderGrid(
  config: PointConfig,
  viewport: Viewport,
  ctx: RenderContext,
): SvgNode[] {
  const step = config.grid;
  if (!step || step <= 0) return [];

  const nodes: SvgNode[] = [];
  const right = viewport.x + viewport.width;
  const bottom = viewport.y + viewport.height;
  // Chặn số đường: một `grid` bé xíu trên khung lớn sẽ đẻ ra hàng nghìn node và
  // đóng băng trình duyệt — thà không vẽ lưới còn hơn treo máy (NFR-P4).
  if (viewport.width / step > 200 || viewport.height / step > 200) return [];

  const attrs = {
    stroke: ctx.theme.surface.guide,
    'stroke-width': ctx.theme.stroke.hairline,
  };
  for (let x = Math.ceil(viewport.x / step) * step; x <= right; x += step) {
    nodes.push(el('line', { ...attrs, x1: round(x), y1: viewport.y, x2: round(x), y2: bottom }));
  }
  for (let y = Math.ceil(viewport.y / step) * step; y <= bottom; y += step) {
    nodes.push(el('line', { ...attrs, x1: viewport.x, y1: round(y), x2: right, y2: round(y) }));
  }
  return nodes;
}

function renderPolygons(model: PointModel, ctx: RenderContext): SvgNode[] {
  return model.polygons.flatMap((polygon) => {
    const pts = polygon.points
      .map((id) => model.byId.get(id))
      .filter((p): p is Pt => p !== undefined);
    if (pts.length < 3) return [];

    return [
      keyed(polygon.id, 'polygon', {
        points: pts.map((p) => `${round(p.x)},${round(p.y)}`).join(' '),
        fill: fillForClass(ctx, polygon.colorClass || undefined),
        'fill-opacity': 0.28,
        stroke: strokeForClass(ctx, polygon.colorClass || undefined),
        'stroke-width': ctx.theme.stroke.link,
        ...decorationAttrs(ctx, polygon.id, polygon.emphasis),
      }),
    ];
  });
}

/** PT-02: bao lồi của **mọi** điểm, vẽ mờ phía sau như một vùng. */
function renderHull(
  model: PointModel,
  config: PointConfig,
  ctx: RenderContext,
): SvgNode[] {
  if (!config.show_hull) return [];
  const hull = convexHull(model.points);
  if (hull.length < 3) return [];

  return [
    el('polygon', {
      points: hull.map((p) => `${round(p.x)},${round(p.y)}`).join(' '),
      fill: ctx.theme.surface.neutral,
      'fill-opacity': 0.55,
      stroke: ctx.theme.surface.guide,
      'stroke-width': ctx.theme.stroke.link,
      'stroke-dasharray': '2.4 1.6',
    }),
  ];
}

/**
 * Đường thẳng qua hai điểm, cắt theo mép khung hình.
 *
 * Vẽ dưới đoạn thẳng: nó là đường kẻ phụ của lập luận, không phải vật thể bài
 * toán dựng ra, nên nó không được che thứ gì.
 */
function renderLines(
  model: PointModel,
  viewport: Viewport,
  ctx: RenderContext,
): SvgNode[] {
  return model.lines.flatMap((line) => {
    const a = model.byId.get(line.a);
    const b = model.byId.get(line.b);
    if (!a || !b) return [];

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length < 1e-9) return [];

    // Kéo dài quá đường chéo khung hình rồi để `viewBox` cắt: rẻ hơn nhiều so
    // với giải giao điểm với bốn cạnh, và cho đúng một kết quả.
    const reach = Math.hypot(viewport.width, viewport.height);
    const ux = (dx / length) * reach;
    const uy = (dy / length) * reach;

    return [
      keyed(line.id, 'line', {
        x1: round(a.x - ux),
        y1: round(a.y - uy),
        x2: round(b.x + ux),
        y2: round(b.y + uy),
        stroke:
          line.colorClass > 0
            ? fillForClass(ctx, line.colorClass)
            : ctx.theme.surface.guide,
        'stroke-width': ctx.theme.stroke.link,
        ...dashAttrs(line.style === 'solid' ? 'solid' : line.style || 'dashed'),
        ...decorationAttrs(ctx, line.id, line.emphasis),
      }),
    ];
  });
}

function renderSegments(model: PointModel, ctx: RenderContext): SvgNode[] {
  return model.segments.flatMap((segment) => {
    const a = model.byId.get(segment.a);
    const b = model.byId.get(segment.b);
    if (!a || !b) return [];

    const stroke =
      segment.colorClass > 0
        ? fillForClass(ctx, segment.colorClass)
        : ctx.theme.emphasis.focusHalo;
    const width =
      segment.colorClass > 0 ? ctx.theme.stroke.link * 1.6 : ctx.theme.stroke.link;
    const decoration = decorationAttrs(ctx, segment.id, segment.emphasis);
    const nodes: SvgNode[] = [];

    // Halo là path riêng vẽ phía dưới: màu đoạn nằm ở `stroke`, nên đặt halo
    // chồng lên sẽ xoá mất màu — cùng lỗi đã sửa ở graph engine tại M10.
    if (typeof decoration['stroke'] === 'string') {
      nodes.push(
        keyed(`${segment.id}-halo`, 'line', {
          x1: round(a.x),
          y1: round(a.y),
          x2: round(b.x),
          y2: round(b.y),
          stroke: decoration['stroke'],
          'stroke-width': Number(decoration['stroke-width'] ?? width) + width,
          'stroke-linecap': 'round',
        }),
      );
    }

    nodes.push(
      keyed(segment.id, 'line', {
        x1: round(a.x),
        y1: round(a.y),
        x2: round(b.x),
        y2: round(b.y),
        stroke,
        'stroke-width': width,
        'stroke-linecap': 'round',
        ...dashAttrs(segment.style),
        ...(segment.emphasis === 'dim' ? { opacity: ctx.theme.emphasis.dimOpacity } : {}),
      }),
    );

    return nodes;
  });
}

/** Chấm nhỏ ở mỗi chỗ hai đoạn cắt nhau — vật thể mà bài đếm giao điểm nói tới. */
function renderCrossings(
  model: PointModel,
  config: PointConfig,
  ctx: RenderContext,
): SvgNode[] {
  if (!config.show_intersections) return [];

  return crossings(model).map((crossing) =>
    el('circle', {
      cx: round(crossing.at.x),
      cy: round(crossing.at.y),
      r: POINT_RADIUS * 0.62,
      fill: ctx.theme.surface.canvas,
      stroke: ctx.theme.emphasis.focusHalo,
      'stroke-width': ctx.theme.stroke.link,
    }),
  );
}

function renderPoints(
  model: PointModel,
  config: PointConfig,
  ctx: RenderContext,
): SvgNode[] {
  const centre = centroid(model.points);

  return model.points.flatMap((point) => {
    const nodes: SvgNode[] = [
      keyed(point.id, 'circle', {
        cx: round(point.x),
        cy: round(point.y),
        r: POINT_RADIUS,
        fill: fillForClass(ctx, point.colorClass || undefined),
        stroke: strokeForClass(ctx, point.colorClass || undefined),
        'stroke-width': ctx.theme.stroke.link,
        ...decorationAttrs(ctx, point.id, point.emphasis),
      }),
    ];

    if (point.label && (config.show_labels ?? true)) {
      const dx = point.x - centre.x;
      const dy = point.y - centre.y;
      const length = Math.hypot(dx, dy) || 1;
      const gap = POINT_RADIUS + 1.4;
      const ux = length < 1e-9 ? 0 : dx / length;
      const uy = length < 1e-9 ? -1 : dy / length;

      nodes.push(
        text(
          'text',
          {
            x: round(point.x + ux * gap),
            y: round(point.y + uy * gap),
            'text-anchor': ux > 0.3 ? 'start' : ux < -0.3 ? 'end' : 'middle',
            'dominant-baseline': uy > 0.3 ? 'hanging' : uy < -0.3 ? 'auto' : 'central',
            'font-family': ctx.theme.type.mathFamily,
            'font-size': UNIT * 0.3,
            'font-style': 'italic',
            fill: ctx.theme.emphasis.focusHalo,
          },
          point.label,
        ),
      );
    }

    return nodes;
  });
}

function centroid(points: readonly Pt[]): Point2 {
  if (points.length === 0) return { x: 0, y: 0 };
  return {
    x: points.reduce((n, p) => n + p.x, 0) / points.length,
    y: points.reduce((n, p) => n + p.y, 0) / points.length,
  };
}

function dashAttrs(style: string): Record<string, string | number> {
  if (style === 'dashed') return { 'stroke-dasharray': '2.4 1.6' };
  if (style === 'dotted') return { 'stroke-dasharray': '0.1 2' };
  return {};
}

function round(value: number): number {
  return Math.round(value * 100) / 100 + 0;
}
