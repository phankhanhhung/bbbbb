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
} from '@combviz/render';
import { GAME_LIMITS } from './schema.js';
import { analyzeGame, losingSpectrum } from './solver.js';
import { readGame, type GameModel } from './model.js';

/** Bề rộng một cột đống, theo quy ước đơn vị G-10. */
const SLOT = 10;
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

    const width = model.piles.reduce((n, p) => n + pileWidth(p.count), 0);
    const tallest = Math.max(1, ...model.piles.map((p) => stackShape(p.count).rows));
    return {
      x: -PADDING,
      y: -PADDING - SLOT * 0.9,
      width: Math.max(SLOT, width) + PADDING * 2,
      height: tallest * DOT_GAP + SLOT * 2.2 + PADDING * 2,
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

/** Bề ngang một đống, tính bằng đơn vị scene. */
function pileWidth(count: number): number {
  return Math.max(SLOT, stackShape(count).columns * (STONE_R * 2.6));
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
  const tallest = Math.max(1, ...model.piles.map((p) => stackShape(p.count).rows));
  const baseline = SLOT * 0.4 + tallest * DOT_GAP + SLOT * 0.35;

  let cursor = 0;
  model.piles.forEach((pile, index) => {
    const width = pileWidth(pile.count);
    const { columns } = stackShape(pile.count);
    const dots = Math.min(pile.count, MAX_DOTS);
    const centre = cursor + width / 2;
    const group: SvgNode[] = [];

    for (let i = 0; i < dots; i += 1) {
      const column = Math.floor(i / STACK);
      const row = i % STACK;
      group.push(
        el('circle', {
          cx: round(centre + (column - (columns - 1) / 2) * (STONE_R * 2.6)),
          cy: round(SLOT * 0.4 + row * DOT_GAP),
          r: STONE_R,
          fill: fillForClass(ctx, pile.colorClass || undefined),
          stroke: strokeForClass(ctx, pile.colorClass || undefined),
          'stroke-width': ctx.theme.stroke.hairline,
        }),
      );
    }

    nodes.push(
      keyed(pile.id, 'g', decorationAttrs(ctx, pile.id, pile.emphasis), group),
    );

    // Đống quá cao thì hiện số: hai mươi lăm viên vẽ rời là một khối chấm không
    // ai đếm, mà đếm mới là việc người đọc cần làm.
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
