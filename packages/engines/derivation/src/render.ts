import type { Scene, Viewport } from '@combviz/schema';
import {
  EMPTY_ATLAS,
  decorationAttrs,
  el,
  estimateTextWidth,
  keyed,
  placeLabel,
  text,
  type EngineRenderer,
  type RenderContext,
  type SceneBox,
  type SvgNode,
} from '@combviz/render';
import { colorClass } from '@combviz/theme';
import { FONT, ROW, layout, type Layout, type PlacedTerm } from './layout.js';
import { readDerivation } from './model.js';

const PADDING = 3;
const NOTE_GAP = 6;
/** Cỡ chữ caption và chiều cao nó cần — một chỗ, để khung và chữ không lệch nhau. */
const CAPTION_SIZE = FONT * 0.5;
const CAPTION_ROOM = ROW * 0.32 + CAPTION_SIZE * 0.3;

/**
 * Renderer của Derivation engine.
 *
 * Khác mọi engine trước ở một điểm: thứ được vẽ **là** đối tượng của lập luận,
 * không phải một hình minh hoạ cho nó. Với đồng nhất thức tổ hợp hay tổng
 * telescoping thì không có bàn cờ nào để vẽ; vẽ ra một cái là trang trí, mà
 * trang trí thì nói dối. Ở đây từng hạng tử là một element có id — nên nó neo
 * được, tô được, và **giữ nguyên danh tính** khi chuyển dòng ở bước sau.
 */
/**
 * Chỗ mực của một hạng tử hoặc một dòng nằm — đọc thẳng từ `layout`.
 *
 * `layout` đã tính chỗ cho mọi thứ (mép trái, bề rộng, phần trên và phần dưới
 * đường chân), nên ở đây không có phép tính hình học nào của riêng mình. Cần
 * `ctx` vì bề rộng một công thức chỉ biết được qua label atlas — cùng lý do
 * `defaultViewport` của engine này cũng nhận `ctx`.
 */
function boxesOf(scene: Scene, id: string, ctx?: RenderContext): readonly SceneBox[] {
  const box = layout(readDerivation(scene), ctx?.labels ?? EMPTY_ATLAS);

  for (const placed of box.rows) {
    if (placed.row.id === id) {
      return [
        {
          x: placed.shift,
          y: placed.y - placed.ascent,
          width: Math.max(placed.width - placed.shift, 1),
          height: placed.ascent + placed.descent,
        },
      ];
    }
    for (const item of placed.terms) {
      if (item.term.id !== id) continue;
      return [
        {
          x: placed.shift + item.x,
          y: placed.y - item.ascent,
          width: item.width,
          height: item.ascent + item.descent,
        },
      ];
    }
  }

  return [];
}

export const derivationRenderer: EngineRenderer = {
  id: 'derivation',
  elementBoxes: boxesOf,

  defaultViewport(scene: Scene, ctx?: RenderContext): Viewport {
    const model = readDerivation(scene);
    const box = layout(model, ctx?.labels ?? EMPTY_ATLAS);
    // Bề rộng ghi chú ước theo **số ký tự**: không có atlas cho chữ thường, mà
    // đoán thiếu thì chữ bị cắt cụt ở mép khung — đúng lỗi đã gặp ở caption của
    // engine tập hợp. Hệ số 0.5 em là bề ngang trung bình của phông giao diện.
    const note = Math.max(0, ...model.rows.map((r) => r.note?.length ?? 0));
    const notes = note === 0 ? 0 : NOTE_GAP + note * FONT * 0.29;

    // Caption nằm **dưới** khối biến đổi, và trước đây khung không chừa chỗ cho
    // nó theo cả hai chiều: chữ dài thì cụt ở mép phải, và ngay cả chữ ngắn cũng
    // nằm gần như trọn bên dưới mép đáy. Cùng lỗi với ba engine caption khác, chỉ
    // khác trục.
    const room = model.config.caption === undefined ? 0 : CAPTION_ROOM;
    const captionWidth =
      model.config.caption === undefined
        ? 0
        : estimateTextWidth(model.config.caption, CAPTION_SIZE) + PADDING;

    return {
      x: -PADDING,
      y: -PADDING,
      width: Math.max(box.width + notes, captionWidth) + PADDING * 2,
      height: box.height + room + PADDING * 2,
    };
  },

  render(scene: Scene, ctx: RenderContext): SvgNode[] {
    const model = readDerivation(scene);
    const box = layout(model, ctx.labels);
    const nodes: SvgNode[] = [];

    for (const placed of box.rows) {
      for (const item of placed.terms) {
        nodes.push(renderTerm(item, placed.shift, placed.y, ctx));
      }

      // Tay cầm cho **dòng**.
      //
      // `row` là một trong hai loại element của engine này, nhưng nó chưa bao giờ
      // sinh ra node nào có danh tính: chỉ hạng tử được vẽ, còn dòng thì chỉ là
      // một toạ độ $y$. Hệ quả là `[[a1|dòng thứ hai]]` — một anchor hoàn toàn tự
      // nhiên với một chuỗi biến đổi — validate xanh và không làm sáng gì.
      //
      // Dựng thẳng từ `PlacedRow`: layout đã biết chân dòng, phần trên và phần
      // dưới của nó. `fill: 'none'` như mọi tay cầm khác — nó chỉ mang halo.
      nodes.push(
        keyed(placed.row.id, 'rect', {
          x: round(placed.shift),
          y: round(placed.y - placed.ascent),
          width: round(Math.max(placed.width - placed.shift, 1)),
          height: round(placed.ascent + placed.descent),
          fill: 'none',
          ...decorationAttrs(ctx, placed.row.id),
        }),
      );

      if (placed.row.note !== undefined) {
        nodes.push(
          text(
            'text',
            {
              x: round(box.width + NOTE_GAP),
              y: round(placed.y),
              'font-family': ctx.theme.type.uiFamily,
              'font-size': FONT * 0.52,
              fill: ctx.theme.surface.guide,
            },
            placed.row.note,
          ),
        );
      }
    }

    return [
      el('g', { class: 'cv-derivation' }, nodes),
      ...caption(model.config.caption, box, ctx),
    ];
  },
};

function renderTerm(
  item: PlacedTerm,
  shift: number,
  y: number,
  ctx: RenderContext,
): SvgNode {
  const { term } = item;
  const x = item.x + shift;
  const ink = term.colorClass > 0 ? colorClass(term.colorClass).stroke : ctx.theme.object.pieceGlyph;
  const children: SvgNode[] = [];

  // Nền của hạng tử: đây là thứ **nhận** halo anchor/vi phạm. Không thể đặt halo
  // lên chính glyph — `stroke` trên path chữ vẽ viền quanh từng nét, và một công
  // thức được nhấn sẽ biến thành một vệt mực.
  const above = item.ascent;
  const below = item.descent;

  children.push(
    el('rect', {
      x: round(x - 0.5),
      y: round(y - above - 0.4),
      width: round(item.width + 1),
      height: round(above + below + 0.8),
      rx: 0.8,
      fill: 'none',
      ...decorationAttrs(ctx, term.id, term.emphasis, 0.5),
    }),
  );

  children.push(
    placeLabel(ctx.labels, term.tex, {
      x,
      y,
      fontSize: FONT,
      fill: term.cancelled ? ctx.theme.surface.guide : ink,
      missingFill: ctx.theme.stroke.invalid,
    }),
  );

  // Gạch chéo của hạng tử triệt tiêu. Vẽ **chéo** chứ không gạch ngang: gạch
  // ngang qua một phân số trông y hệt dấu gạch phân số, và một dấu gạch mọc thêm
  // ở giữa công thức là đúng loại hình nói dối.
  if (term.cancelled) {
    children.push(
      el('line', {
        x1: round(x - 0.3),
        y1: round(y + below),
        x2: round(x + item.width + 0.3),
        y2: round(y - above),
        stroke: ctx.theme.stroke.invalid,
        'stroke-width': ctx.theme.stroke.hairline * 1.6,
        'stroke-linecap': 'round',
      }),
    );
  }

  return keyed(term.id, 'g', term.emphasis === 'dim' ? { opacity: ctx.theme.emphasis.dimOpacity } : {}, children);
}

function caption(
  value: string | undefined,
  box: Layout,
  ctx: RenderContext,
): SvgNode[] {
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
