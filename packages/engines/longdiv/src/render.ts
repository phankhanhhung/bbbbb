import type { Scene, Viewport } from '@combviz/schema';
import {
  decorationAttrs,
  el,
  estimateTextWidth,
  keyed,
  text,
  type EngineRenderer,
  type RenderContext,
  type SceneBox,
  type SvgNode,
} from '@combviz/render';
import {
  EXP_FONT,
  EXP_RISE,
  FONT,
  ROW,
  boxOf,
  exponentX,
  layout,
  type Layout,
  type PlacedRow,
} from './layout.js';
import { readLongDiv } from './model.js';

const PADDING = 3;
const CAPTION_SIZE = FONT * 0.5;
const CAPTION_ROOM = ROW * 0.32 + CAPTION_SIZE * 0.3;

/**
 * Renderer của Long division engine.
 *
 * Vẽ đúng bố cục người ta viết trên giấy: thương trên vạch, số chia bên trái
 * ngoặc, số bị chia trong ngoặc, rồi mỗi nhịp một dòng bị trừ, một vạch ngang, và
 * một dòng hiệu — kèm mũi tên hạ hạng tử.
 *
 * **Chữ dựng thẳng, không qua label atlas.** Khác `derivation`, và có lý do: hạng
 * tử ở đây chỉ có đúng một dạng, $c\,x^k$. Engine biết trước ngữ pháp ấy nên nó
 * đặt được hệ số, biến và số mũ vào đúng chỗ mà không cần một bộ sắp chữ tổng
 * quát. Đổi lại, nó không bao giờ **cũ**: atlas là bảng tra phải dựng lại mỗi khi
 * nội dung đổi, mà quên dựng lại thì hình hiện ra chữ đỏ báo lỗi — kho đã sống với
 * đúng chuyện đó bốn hạng mục.
 */
function boxesOf(scene: Scene, id: string): readonly SceneBox[] {
  const model = readLongDiv(scene);
  if (model.refusal !== null) return [];
  const found = boxOf(layout(model), id);
  return found ? [found] : [];
}

export const longDivRenderer: EngineRenderer = {
  id: 'longdiv',
  elementBoxes: boxesOf,

  defaultViewport(scene: Scene): Viewport {
    const model = readLongDiv(scene);
    if (model.refusal !== null) return { x: 0, y: 0, width: ROW * 4, height: ROW * 2 };

    const box = layout(model);
    const room = model.config.caption === undefined ? 0 : CAPTION_ROOM;
    const captionWidth =
      model.config.caption === undefined
        ? 0
        : estimateTextWidth(model.config.caption, CAPTION_SIZE) + PADDING;

    return {
      x: -PADDING,
      y: -PADDING,
      width: Math.max(box.width, captionWidth) + PADDING * 2,
      height: box.height + room + PADDING * 2,
    };
  },

  render(scene: Scene, ctx: RenderContext): SvgNode[] {
    const model = readLongDiv(scene);
    // Cấu hình không chia được thì **nói ra**, không vẽ một bảng nửa vời. Cùng lý
    // lẽ với nhãn thiếu atlas: hỏng thì phải nhìn là thấy.
    if (model.refusal !== null) {
      return [
        text(
          'text',
          {
            x: 0,
            y: ROW,
            'font-family': 'monospace',
            'font-size': FONT * 0.8,
            fill: ctx.theme.stroke.invalid,
          },
          `⟨không chia được: ${model.refusal}⟩`,
        ),
      ];
    }

    const box = layout(model);
    const ink = ctx.theme.object.pieceGlyph;
    const rule = ctx.theme.surface.guide;
    const nodes: SvgNode[] = [];

    if (box.bracket) {
      const b = box.bracket;
      nodes.push(
        el('path', {
          // Một nét: đi lên dọc theo cạnh đứng rồi rẽ phải thành vạch trên đầu số
          // bị chia. Vẽ liền thay vì hai đoạn rời để chỗ gấp khúc khép kín.
          d: `M${b.x} ${b.yBottom}L${b.x} ${b.yTop}L${b.xRight} ${b.yTop}`,
          fill: 'none',
          stroke: ink,
          'stroke-width': ctx.theme.stroke.hairline * 1.8,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
        }),
      );
    }

    for (const r of box.rules) {
      // Có `key` nên nó là một danh tính neo được: choreography mở vạch cùng nhịp
      // với dòng bị trừ thay vì kẻ sẵn cả bảng từ khung $0$.
      nodes.push(
        keyed(r.id, 'line', {
          x1: r.x1,
          y1: r.y,
          x2: r.x2,
          y2: r.y,
          stroke: rule,
          'stroke-width': ctx.theme.stroke.hairline * 1.6,
          'stroke-linecap': 'round',
          ...decorationAttrs(ctx, r.id, undefined, 0.5),
        }),
      );
    }

    if (model.config.show_arrows !== false) {
      for (const arrow of box.arrows) nodes.push(renderArrow(arrow, ctx));
    }

    for (const row of box.rows) nodes.push(renderRow(row, ctx, ink));

    return [
      el('g', { class: 'cv-longdiv' }, nodes),
      ...caption(model.config.caption, box, ctx),
    ];
  },
};

function renderRow(row: PlacedRow, ctx: RenderContext, ink: string): SvgNode {
  const children: SvgNode[] = [];

  for (const item of row.terms) {
    const parts: SvgNode[] = [
      text(
        'text',
        {
          x: item.x,
          y: row.y,
          'font-family': ctx.theme.type.mathFamily,
          'font-size': FONT,
          'font-style': 'italic',
          fill: ink,
        },
        item.head,
      ),
    ];

    if (item.exponent !== '') {
      parts.push(
        text(
          'text',
          {
            x: round(exponentX(item.x, item.head)),
            y: round(row.y - EXP_RISE),
            'font-family': ctx.theme.type.mathFamily,
            'font-size': EXP_FONT,
            'font-style': 'italic',
            fill: ink,
          },
          item.exponent,
        ),
      );
    }

    // Tay cầm của hạng tử: chỗ nhận halo. Không đặt halo lên chính chữ — `stroke`
    // trên glyph vẽ viền quanh từng nét và một hạng tử được nhấn thành vệt mực.
    parts.push(
      el('rect', {
        x: round(item.x - 0.4),
        y: round(row.y - FONT * 0.78),
        width: round(item.width + 0.8),
        height: round(FONT * 1.05),
        rx: 0.6,
        fill: 'none',
        ...decorationAttrs(ctx, item.id, undefined, 0.5),
      }),
    );

    children.push(keyed(item.id, 'g', {}, parts));
  }

  // Tay cầm của **cả dòng**: `[[a1|dòng hiệu thứ hai]]` là anchor tự nhiên với một
  // phép chia dọc, và không có node này thì nó validate xanh mà không sáng gì.
  children.push(
    keyed(row.row.id, 'rect', {
      x: round(row.x - 0.6),
      y: round(row.y - FONT * 0.82),
      width: round(Math.max(row.width, 1) + 1.2),
      height: round(FONT * 1.12),
      rx: 0.8,
      fill: 'none',
      ...decorationAttrs(ctx, row.row.id),
    }),
  );

  return el('g', { class: `cv-ld-${row.row.kind}` }, children);
}

function renderArrow(
  arrow: { id: string; x: number; y1: number; y2: number },
  ctx: RenderContext,
): SvgNode {
  const head = FONT * 0.28;
  return keyed(arrow.id, 'path', {
    d:
      `M${arrow.x} ${arrow.y1}L${arrow.x} ${arrow.y2}` +
      `M${round(arrow.x - head)} ${round(arrow.y2 - head)}L${arrow.x} ${arrow.y2}` +
      `L${round(arrow.x + head)} ${round(arrow.y2 - head)}`,
    fill: 'none',
    stroke: ctx.theme.object.regionStroke,
    'stroke-width': ctx.theme.stroke.hairline * 1.6,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    ...decorationAttrs(ctx, arrow.id, undefined, 0.5),
  });
}

function caption(value: string | undefined, box: Layout, ctx: RenderContext): SvgNode[] {
  if (value === undefined) return [];
  return [
    text(
      'text',
      {
        x: 0,
        y: round(box.height + ROW * 0.32),
        'font-family': ctx.theme.type.uiFamily,
        'font-size': CAPTION_SIZE,
        fill: ctx.theme.surface.guide,
      },
      value,
    ),
  ];
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000 + 0;
}
