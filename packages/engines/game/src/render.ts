import type { Scene, Viewport } from '@combviz/schema';
import {
  decorationAttrs,
  el,
  fillForClass,
  keyed,
  strokeForClass,
  text,
  type EngineRenderer,
  type RenderContext,
  type SvgNode,
  UNITS_PER_CELL,
} from '@combviz/render';
import { GAME_LIMITS } from './schema.js';
import { analyzeGame, losingSpectrum } from './solver.js';
import { readGame, type GameModel } from './model.js';

/** Bề rộng một cột đống, theo quy ước đơn vị G-10. */
/**
 * Đơn vị gốc, lấy từ **một** chỗ (G-10).
 *
 * Trước đây bảy engine mỗi cái tự khai `= 10`. Bảy bản sao của một quy ước là bảy
 * chỗ có thể lệch, và quy ước này lệch một cái là cả hình đổi cỡ — đúng thứ vừa
 * phải sửa ở M20. Nay nó là một hằng số, và engine thứ tám không có cách nào chọn
 * số khác mà vẫn trông như đang theo quy ước.
 */
const SLOT = UNITS_PER_CELL;
const STONE_R = 1.6;
const PADDING = 4;
/** Trên ngưỡng này thì hiện số thay vì vẽ từng viên. */
const MAX_DOTS = 24;
/**
 * Số viên tối đa trên **một** cột con; quá thì gấp sang cột kế.
 *
 * Không có ngưỡng này thì đống $20$ viên vẽ ra một sợi chỉ tỉ lệ $1:20$: hình
 * cao gấp hai mươi lần bề ngang, và trình duyệt co nó lại tới mức không đếm nổi
 * viên nào. Chồng thành khối thì vừa đếm được vừa nhìn ra "đống".
 */
const STACK = 6;
const DOT_GAP = STONE_R * 2.4;

/**
 * Renderer của Game engine (GM-02).
 *
 * Hai view, và chúng trả lời hai câu hỏi khác nhau:
 *
 *   - `piles` — "thế hiện tại thế nào": các đống, ai sắp đi, thắng hay thua.
 *   - `spectrum` — "quy luật là gì": mọi thế một đống từ $0$ tới $N$, tô theo
 *     thắng/thua. Đây là view đắt giá hơn, vì phát biểu "thua đúng khi $n$ chia
 *     hết cho $k+1$" không phải câu để tin — nó là **một vệt sọc** hiện ra.
 */
export const gameRenderer: EngineRenderer = {
  id: 'game',

  defaultViewport(scene: Scene): Viewport {
    const model = readGame(scene);

    if (model.config.view === 'spectrum') {
      const n = spectrumLength(model);
      const cols = Math.min(n, 12);
      const rows = Math.ceil(n / cols);
      return {
        x: -PADDING,
        y: -PADDING - SLOT * 0.6,
        width: cols * SLOT + PADDING * 2,
        height: rows * SLOT + SLOT * 0.6 + PADDING * 2 + SLOT * 0.8,
      };
    }

    const box = pilesBox(model);
    return {
      x: -PADDING,
      y: box.top - PADDING,
      width: box.width + PADDING * 2,
      height: box.bottom - box.top + PADDING * 2,
    };
  },

  render(scene: Scene, ctx: RenderContext): SvgNode[] {
    const model = readGame(scene);
    const viewport = gameRenderer.defaultViewport(scene);

    const body =
      model.config.view === 'spectrum'
        ? renderSpectrum(model, ctx)
        : renderPiles(model, ctx);

    return [
      el('g', { class: 'cv-game' }, body),
      ...(model.config.caption
        ? [
            text(
              'text',
              {
                x: viewport.x + PADDING * 0.5,
                y: viewport.y + SLOT * 0.4,
                'font-family': ctx.theme.type.uiFamily,
                'font-size': SLOT * 0.34,
                fill: ctx.theme.surface.guide,
              },
              model.config.caption,
            ),
          ]
        : []),
    ];
  },
};

/** Số cột con và chiều cao (tính bằng viên) của một đống. */
function stackShape(count: number): { columns: number; rows: number } {
  const dots = Math.min(count, MAX_DOTS);
  const rows = Math.min(dots, STACK);
  return { columns: Math.max(1, Math.ceil(dots / STACK)), rows: Math.max(1, rows) };
}

/** Bề ngang một đống, tính bằng đơn vị scene. Đống lược chỉ chiếm một cột. */
function pileWidth(count: number): number {
  if (count > MAX_DOTS) return SLOT;
  return Math.max(SLOT, stackShape(count).columns * (STONE_R * 2.6));
}

const DOT_TOP = SLOT * 0.4;

/**
 * Hộp bao của view `piles`, tính **một lần** rồi cả viewport lẫn renderer đọc.
 *
 * Trước đây viewport ước lượng riêng bằng mấy hằng số cộng vào, và nó chừa hơn
 * một phần ba khung làm khoảng trống — hình bốn cột sỏi nằm lọt thỏm dưới đáy
 * một khung dựng đứng. Lỗi ấy không test nào bắt được vì không có gì sai; chỉ có
 * nhìn mới thấy.
 */
function pilesBox(model: GameModel): {
  width: number;
  top: number;
  bottom: number;
  baseline: number;
} {
  const width = Math.max(
    SLOT,
    model.piles.reduce((n, p) => n + pileWidth(p.count), 0),
  );
  const tallest = Math.max(1, ...model.piles.map((p) => stackShape(p.count).rows));
  const dotsBottom = DOT_TOP + (tallest - 1) * DOT_GAP + STONE_R;
  const baseline = dotsBottom + SLOT * 0.5;
  const caption = model.config.caption ? SLOT * 0.6 : 0;

  return {
    width,
    top: DOT_TOP - STONE_R - caption,
    baseline,
    bottom: baseline + (model.config.show_grundy ? SLOT * 0.5 : 0) + SLOT * 0.2,
  };
}

function spectrumLength(model: GameModel): number {
  return Math.min(
    GAME_LIMITS.maxSpectrum,
    model.config.spectrum_to ?? Math.max(...model.piles.map((p) => p.count), 12),
  ) + 1;
}

/**
 * Phổ thắng/thua của thế một đống.
 *
 * Ô thua tô đậm, ô thắng để trắng. Không dùng chữ "P" và "N": ký hiệu ấy là của
 * sách chuyên đề, còn ở đây thứ cần thấy là **vệt sọc**, và một vệt sọc thì đọc
 * bằng mắt chứ không bằng chú giải.
 */
function renderSpectrum(model: GameModel, ctx: RenderContext): SvgNode[] {
  const length = spectrumLength(model);
  const lose = losingSpectrum(length - 1, model.config.rule, model.config.misere === true);
  const cols = Math.min(length, 12);
  const nodes: SvgNode[] = [];

  for (let n = 0; n < length; n += 1) {
    const col = n % cols;
    const row = Math.floor(n / cols);
    const x = col * SLOT;
    const y = row * SLOT;

    nodes.push(
      keyed(`pos-${n}`, 'rect', {
        x,
        y,
        width: SLOT,
        height: SLOT,
        fill: lose[n] ? fillForClass(ctx, 3) : ctx.theme.surface.neutral,
        stroke: ctx.theme.surface.guide,
        'stroke-width': ctx.theme.stroke.hairline,
        ...decorationAttrs(ctx, `pos-${n}`, undefined),
      }),
    );
    nodes.push(
      text(
        'text',
        {
          x: x + SLOT / 2,
          y: y + SLOT / 2,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': ctx.theme.type.mathFamily,
          'font-size': SLOT * 0.36,
          fill: lose[n] ? ctx.theme.surface.canvas : ctx.theme.emphasis.focusHalo,
        },
        String(n),
      ),
    );
  }

  const rows = Math.ceil(length / cols);
  nodes.push(
    text(
      'text',
      {
        x: 0,
        y: rows * SLOT + SLOT * 0.55,
        'font-family': ctx.theme.type.uiFamily,
        'font-size': SLOT * 0.32,
        fill: ctx.theme.surface.guide,
      },
      'Ô tô đậm: thế thua của người sắp đi',
    ),
  );

  return nodes;
}

function renderPiles(model: GameModel, ctx: RenderContext): SvgNode[] {
  const nodes: SvgNode[] = [];
  const analysis = analyzeGame(
    model.piles.map((p) => p.count),
    model.config.rule,
    model.config.misere === true,
  );

  // Nhãn của **mọi** đống nằm trên cùng một đường chân, không phải dưới chân
  // từng cột. Cột cao thấp khác nhau thì nhãn so le, và một hàng số so le đọc
  // ra như mấy con số rời rạc chứ không ra "các đống là 3, 5, 7".
  const { baseline } = pilesBox(model);

  let cursor = 0;
  model.piles.forEach((pile, index) => {
    const width = pileWidth(pile.count);
    const { columns } = stackShape(pile.count);
    const centre = cursor + width / 2;
    const group: SvgNode[] = [];

    if (pile.count > MAX_DOTS) {
      // Quá ngưỡng thì **không vẽ đủ viên, và nói ra là mình không vẽ đủ**.
      //
      // Bản trước vẽ đúng 24 chấm rồi dán nhãn "40" xuống dưới: ai đếm sẽ ra 24,
      // mà đếm đúng là việc bài bốc sỏi bắt người đọc làm. Bản sau đó vẽ một khối
      // đặc — hết nói dối, nhưng khối trơn ấy không còn đọc ra "sỏi". Cách còn
      // lại là ký hiệu lược: mấy viên trên, dấu ⋮, một viên đáy.
      const dot = (row: number, r = STONE_R): SvgNode =>
        el('circle', {
          cx: round(centre),
          cy: round(DOT_TOP + row * DOT_GAP),
          r,
          fill: fillForClass(ctx, pile.colorClass || undefined),
          stroke: strokeForClass(ctx, pile.colorClass || undefined),
          'stroke-width': ctx.theme.stroke.hairline,
        });

      group.push(dot(0), dot(1), dot(2));
      for (const row of [3.15, 3.6, 4.05]) {
        group.push(
          el('circle', {
            cx: round(centre),
            cy: round(DOT_TOP + row * DOT_GAP),
            r: STONE_R * 0.22,
            fill: ctx.theme.surface.guide,
          }),
        );
      }
      group.push(dot(5));
    } else {
      for (let i = 0; i < pile.count; i += 1) {
        const column = Math.floor(i / STACK);
        const row = i % STACK;
        group.push(
          el('circle', {
            cx: round(centre + (column - (columns - 1) / 2) * (STONE_R * 2.6)),
            cy: round(DOT_TOP + row * DOT_GAP),
            r: STONE_R,
            fill: fillForClass(ctx, pile.colorClass || undefined),
            stroke: strokeForClass(ctx, pile.colorClass || undefined),
            'stroke-width': ctx.theme.stroke.hairline,
          }),
        );
      }
    }

    nodes.push(
      keyed(pile.id, 'g', decorationAttrs(ctx, pile.id, pile.emphasis), group),
    );

    nodes.push(
      text(
        'text',
        {
          x: round(centre),
          y: round(baseline),
          'text-anchor': 'middle',
          'font-family': ctx.theme.type.mathFamily,
          'font-size': SLOT * 0.36,
          'font-style': 'italic',
          fill: ctx.theme.emphasis.focusHalo,
        },
        pile.label ?? String(pile.count),
      ),
    );

    if (model.config.show_grundy && analysis.grundy.length > 0) {
      nodes.push(
        text(
          'text',
          {
            x: round(centre),
            y: round(baseline + SLOT * 0.5),
            'text-anchor': 'middle',
            'font-family': ctx.theme.type.uiFamily,
            'font-size': SLOT * 0.3,
            fill: ctx.theme.surface.guide,
          },
          `g=${analysis.grundy[index] ?? 0}`,
        ),
      );
    }

    cursor += width;
  });

  return nodes;
}

function round(value: number): number {
  return Math.round(value * 100) / 100 + 0;
}
