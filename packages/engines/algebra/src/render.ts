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
import { boxOf, layout, RULE_SIZE, type Layout } from './layout.js';
import { readAlgebra } from './model.js';
import { FONT, ROW } from './typeset.js';

const PADDING = 3;
const CAPTION_SIZE = FONT * 0.5;

/**
 * Renderer.
 *
 * **Chữ dựng thẳng từ cây, không qua label atlas** — cùng lý lẽ với `longdiv`, và có
 * số liệu: atlas là bảng tra phải dựng lại mỗi khi nội dung đổi, quên dựng thì hình
 * hiện chữ đỏ, và kho đã xuất bản một bài như thế suốt bốn hạng mục (M45).
 *
 * Mỗi nút của cây là một node có `key = TermId`. Danh tính ấy **sống xuyên các dòng**,
 * nên diff giữa hai bước cho ra một chuyển động chứ không phải một cặp xoá–thêm.
 */
export const algebraRenderer: EngineRenderer = {
  id: 'algebra',

  elementBoxes(scene: Scene, id: string): readonly SceneBox[] {
    const model = readAlgebra(scene);
    if (model.refusal !== null) return [];
    const found = boxOf(layout(model), id);
    return found ? [found] : [];
  },

  defaultViewport(scene: Scene): Viewport {
    const model = readAlgebra(scene);
    if (model.refusal !== null) return { x: 0, y: 0, width: ROW * 6, height: ROW * 2 };

    const box = layout(model);
    const caption = model.config.caption;
    const captionWidth =
      caption === undefined ? 0 : estimateTextWidth(caption, CAPTION_SIZE) + PADDING;
    const room = caption === undefined ? 0 : ROW * 0.32 + CAPTION_SIZE * 0.3;

    return {
      x: -PADDING,
      y: -PADDING,
      width: Math.max(box.width, captionWidth) + PADDING * 2,
      height: box.height + room + PADDING * 2,
    };
  },

  render(scene: Scene, ctx: RenderContext): SvgNode[] {
    const model = readAlgebra(scene);
    if (model.refusal !== null) {
      return [redText(`⟨không dựng được: ${model.refusal}⟩`, ctx)];
    }
    // Bước không qua phép kiểm §6 là **lỗi của engine**, và nó phải hiện ra bằng
    // mực đỏ chứ không nằm im trong log: hình lúc ấy đang dạy một phép biến đổi sai.
    if (model.unsound.length > 0) {
      return [redText(`⟨bước sai: ${model.unsound[0] as string}⟩`, ctx)];
    }

    const box = layout(model);
    const ink = ctx.theme.object.pieceGlyph;
    const nodes: SvgNode[] = [];

    for (const line of box.lines) {
      const children: SvgNode[] = [];

      for (const g of line.glyphs) {
        children.push(
          text(
            'text',
            {
              x: round(g.x),
              y: round(g.y),
              'font-family': ctx.theme.type.mathFamily,
              'font-size': round(g.size),
              ...(g.italic ? { 'font-style': 'italic' } : {}),
              fill: ink,
              // Chủ sở hữu tra theo `data-el ?? key` (`patch.ts`) — glyph phải mang
              // danh tính của nút bao nó, nếu không một pha `dim` chỉ chạm cái hộp
              // vô hình và để nguyên con chữ. Đúng lỗi đã xuất bản ở board (M44).
              ...(g.owner === null ? {} : { 'data-el': g.owner }),
            },
            g.s,
          ),
        );
      }

      for (const r of line.rules) {
        children.push(
          el('line', {
            x1: round(r.x1),
            y1: round(r.y),
            x2: round(r.x2),
            y2: round(r.y),
            stroke: ink,
            'stroke-width': round(r.width),
            'stroke-linecap': 'round',
            ...(r.owner === null ? {} : { 'data-el': r.owner }),
          }),
        );
      }

      for (const q of line.paths) {
        children.push(
          el('path', {
            d: q.d,
            fill: 'none',
            stroke: ink,
            'stroke-width': round(q.width),
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
            ...(q.owner === null ? {} : { 'data-el': q.owner }),
          }),
        );
      }

      // Tay cầm của từng nút: chỗ nhận halo. Không đặt `stroke` lên chính glyph —
      // stroke trên chữ vẽ viền quanh từng nét và biến hạng tử thành vệt mực.
      // Danh tính nằm trên `<g>`, hình chữ nhật nằm bên trong. Trông thừa một tầng,
      // nhưng nó là điều kiện để chốt canh `elementBoxes` đo được: oracle bỏ qua node
      // `fill: 'none'` (đúng — tay cầm không phải mực), nên nếu id nằm thẳng trên
      // rect thì mực duy nhất của nút là mấy **điểm** toạ độ của `<text>`, và không
      // hộp nào có tâm rơi trúng một điểm. `longdiv` giải đúng như vậy.
      for (const b of line.boxes) {
        children.push(
          keyed(b.id, 'g', {}, [
            el('rect', {
              x: round(b.x - 0.3),
              y: round(b.y - 0.3),
              width: round(b.width + 0.6),
              height: round(b.height + 0.6),
              rx: 0.6,
              fill: 'none',
              ...decorationAttrs(ctx, b.id, undefined, 0.5),
            }),
          ]),
        );
      }

      children.push(
        keyed(line.box.id, 'g', {}, [
          el('rect', {
            x: round(line.box.x - 0.6),
            y: round(line.box.y - 0.6),
            width: round(line.box.width + 1.2),
            height: round(line.box.height + 1.2),
            rx: 0.8,
            fill: 'none',
            ...decorationAttrs(ctx, line.box.id),
          }),
        ]),
      );

      if (line.label !== null) {
        children.push(
          text(
            'text',
            {
              x: round(line.label.x),
              y: round(line.label.y),
              'font-family': ctx.theme.type.uiFamily,
              'font-size': round(RULE_SIZE),
              fill: ctx.theme.surface.guide,
              // Nhãn luật **thuộc về dòng của nó**, và phải khai ra điều đó.
              //
              // Không khai thì nó không mang danh tính nào, và một pha `show` hiện
              // dòng $k$ không chạm tới nó: khung đầu tiên bày sẵn tên bốn phép biến
              // đổi trong khi chỉ mới có một dòng. Lỗi này không test nào bắt — nó
              // hiện ra ở lượt nhìn khung 0 của timeline vừa sinh.
              'data-el': line.box.id,
            },
            line.label.text,
          ),
        );
      }

      nodes.push(el('g', { class: 'cv-alg-row' }, children));
    }

    for (const note of box.notes) {
      nodes.push(
        text(
          'text',
          {
            x: round(note.x),
            y: round(note.y),
            'font-family': ctx.theme.type.uiFamily,
            'font-size': round(FONT * 0.6),
            fill: ctx.theme.stroke.invalid,
          },
          note.text,
        ),
      );
    }

    return [el('g', { class: 'cv-algebra' }, nodes), ...caption(model.config.caption, box, ctx)];
  },
};

function redText(message: string, ctx: RenderContext): SvgNode {
  return text(
    'text',
    {
      x: 0,
      y: ROW,
      'font-family': 'monospace',
      'font-size': FONT * 0.8,
      fill: ctx.theme.stroke.invalid,
    },
    message,
  );
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
