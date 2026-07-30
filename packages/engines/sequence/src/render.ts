import type { Scene, Viewport } from '@combviz/schema';
import {
  estimateTextWidth,
  decorationAttrs,
  el,
  fillForClass,
  inkForClass,
  keyed,
  strokeForClass,
  text,
  type EngineRenderer,
  type RenderContext,
  type SvgNode,
} from '@combviz/render';
import {
  deriveSequence,
  drawnStones,
  GAP,
  isPileTooTall,
  PADDING,
  PITCH,
  SLOT,
  sequenceConfig,
  slotX,
  STONE_PITCH,
  STONE_R,
  type DerivedItem,
  type SequenceDerived,
} from './geometry.js';

/**
 * Renderer của Sequence/Multiset engine.
 *
 * Hai idiom thị giác cho cùng một dữ liệu:
 *
 *   - **`sequence`** — ô vuông xếp hàng, số nằm trong ô. Đây là cách người ta
 *     viết một dãy lên bảng.
 *   - **`piles`** — cột sỏi. Đây là cách người ta vẽ "$n$ đống sỏi", và nó khác
 *     hẳn về mặt nhận thức: **nhìn** là thấy đống nào nhiều hơn, không phải đọc
 *     rồi so. Bài "gộp đống" sống nhờ đúng cái nhìn-là-thấy đó.
 *
 * Hàm thuần như hai engine kia: không DOM, không giờ, không random.
 */
export const sequenceRenderer: EngineRenderer = {
  id: 'sequence',

  defaultViewport(scene: Scene): Viewport {
    return viewportOf(scene);
  },

  render(scene: Scene, ctx: RenderContext): SvgNode[] {
    const derived = deriveSequence(scene);
    const config = sequenceConfig(scene);

    const body =
      derived.mode === 'piles'
        ? derived.items.map((item) => renderPile(item, derived, ctx))
        : derived.items.map((item) =>
            renderSlot(item, config.show_index === true, config.show_monotone === true, ctx),
          );

    return [
      el('g', { class: 'cv-cuts' }, derived.cuts.map((cut) => renderCut(cut, derived, ctx))),
      el('g', { class: 'cv-items' }, body),
      ...(config.caption ? [renderCaption(config.caption, derived, ctx)] : []),
      ...(config.show_total ? [renderTotal(derived, ctx)] : []),
    ];
  },
};

/**
 * Khung nhìn — tính **một chỗ**, dùng cho cả `defaultViewport`.
 *
 * Ba thứ suýt bị bỏ quên, và cả ba chỉ lộ ra khi render ra ảnh rồi nhìn:
 *
 *   1. Ở chế độ `piles`, cột mọc lên phía **âm** của $y$ còn con số nằm phía
 *      dưới — quên chừa chỗ dưới thì mọi con số bị cắt mất một nửa.
 *   2. Nhãn `Σ = …` nằm **ngoài** phần tử cuối, nên nó phải được cộng vào bề
 *      rộng chứ không thể trông chờ vào lề.
 *   3. Scene chỉ có một phần tử: khung khít quá thì trình duyệt scale nó lên hết
 *      cỡ, và một đống sỏi đơn lẻ hiện ra to bằng cả màn hình. Phải có bề rộng
 *      tối thiểu — hình phải giữ được **cảm giác về tỉ lệ** giữa các step, vì
 *      người học đang so step này với step trước.
 */
export function viewportOf(scene: Scene): Viewport {
  const derived = deriveSequence(scene);
  const config = sequenceConfig(scene);

  const count = Math.max(1, derived.items.length);
  const totalRoom = config.show_total ? SLOT * 3 : 0;
  const contentWidth = count * PITCH - GAP + totalRoom;
  // Tối thiểu năm ô: đủ để một scene một phần tử không bị phóng to lố, và vẫn
  // khít cho scene năm phần tử trở lên.
  // Caption dài hơn hình thì **nới khung**, không cắt chữ: `captionRoom` dưới đây
  // chỉ chừa chiều cao, và ba engine còn lại cũng từng quên đúng chiều ngang này.
  const captionWidth = config.caption
    ? estimateTextWidth(config.caption, SLOT * 0.36) + PADDING * 2
    : 0;
  const width = Math.max(contentWidth, 5 * PITCH, captionWidth) + PADDING * 2;

  const captionRoom = config.caption ? SLOT * 0.8 : 0;

  if (derived.mode === 'piles') {
    // Sàn chiều cao, cùng lý do với sàn bề rộng: mười hai ngăn mỗi ngăn một viên
    // cho ra một khung dài ngoẵng và dẹt lét, trình duyệt fit theo bề rộng, và
    // cả hình co lại thành một sợi chỉ không đọc được. Bốn viên là chỗ cân: đủ
    // để mười hai ngăn còn ra hình cột, chưa tới mức chừa một khoảng trống to.
    const stones = Math.max(4, drawnStones(derived.tallest));
    const top = -(stones * STONE_PITCH + STONE_R * 2) - captionRoom - PADDING;
    // Chân cột ở y = 0, con số ở y ≈ 0.55·SLOT ⇒ mép dưới phải qua khỏi nó.
    const bottom = SLOT * 0.95 + PADDING;
    return { x: -PADDING, y: top, width, height: bottom - top };
  }

  const indexRoom = config.show_index ? SLOT * 0.75 : 0;
  // Cặp $(inc, dec)$ nằm dưới cùng, nên khung phải chừa thêm — quên là chữ nằm
  // ngoài mép dưới, đúng lỗi caption của M22 chỉ khác trục.
  const monotoneRoom = config.show_monotone ? SLOT * 0.75 : 0;
  const top = -PADDING - captionRoom;
  const bottom = SLOT + indexRoom + monotoneRoom + PADDING;
  return { x: -PADDING, y: top, width, height: bottom - top };
}

/** Chế độ `sequence`: một ô vuông có số bên trong. */
function renderSlot(
  item: DerivedItem,
  showIndex: boolean,
  showMonotone: boolean,
  ctx: RenderContext,
): SvgNode {
  const x = slotX(item.pos);
  const children: SvgNode[] = [
    el('rect', {
      x,
      y: 0,
      width: SLOT,
      height: SLOT,
      rx: 1.2,
      fill: fillForClass(ctx, item.colorClass),
      stroke: strokeForClass(ctx, item.colorClass),
      'stroke-width': ctx.theme.stroke.base,
      ...decorationAttrs(ctx, item.id, item.emphasis),
    }),
    text(
      'text',
      {
        x: x + SLOT / 2,
        y: SLOT / 2,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': ctx.theme.type.uiFamily,
        'font-size': SLOT * 0.44,
        fill: inkForClass(ctx, item.colorClass),
      },
      item.label ?? formatValue(item.value),
    ),
  ];

  if (showIndex) {
    children.push(
      text(
        'text',
        {
          x: x + SLOT / 2,
          y: SLOT + SLOT * 0.5,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': ctx.theme.type.uiFamily,
          'font-size': SLOT * 0.3,
          fill: ctx.theme.surface.guide,
        },
        String(item.pos + 1),
      ),
    );
  }

  if (showMonotone) {
    // Cặp $(inc, dec)$ dưới ô, dưới cả chỉ số nếu có. Đây **là** lời giải
    // Erdős–Szekeres chứ không phải chú thích: hai phần tử không bao giờ mang
    // cùng một cặp, nên đếm cặp là đếm phần tử.
    children.push(
      text(
        'text',
        {
          x: x + SLOT / 2,
          y: SLOT + (showIndex ? SLOT * 1.2 : SLOT * 0.5),
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': ctx.theme.type.mathFamily,
          'font-size': SLOT * 0.3,
          fill: ctx.theme.emphasis.focusHalo,
        },
        `${item.inc},${item.dec}`,
      ),
    );
  }

  return keyed(item.id, 'g', {}, children);
}

/**
 * Chế độ `piles`: một cột sỏi mọc lên từ đường đáy $y = 0$.
 *
 * Vẽ từng viên tới ngưỡng `maxDotsPerPile` rồi chuyển sang hiện số: một đống
 * $137$ viên vẽ đủ 137 chấm vừa chậm vừa không đọc được, mà đọc được mới là lý do
 * chọn chế độ này.
 */
function renderPile(
  item: DerivedItem,
  derived: SequenceDerived,
  ctx: RenderContext,
): SvgNode {
  const x = slotX(item.pos) + SLOT / 2;
  const children: SvgNode[] = [];

  if (isPileTooTall(item.value)) {
    children.push(
      el('rect', {
        x: x - SLOT * 0.4,
        y: -STONE_PITCH * 3,
        width: SLOT * 0.8,
        height: STONE_PITCH * 3,
        rx: 1,
        fill: fillForClass(ctx, item.colorClass),
        stroke: strokeForClass(ctx, item.colorClass),
        'stroke-width': ctx.theme.stroke.base,
        ...decorationAttrs(ctx, item.id, item.emphasis),
      }),
    );
  } else {
    for (let i = 0; i < drawnStones(item.value); i += 1) {
      children.push(
        el('circle', {
          cx: x,
          cy: -STONE_R - i * STONE_PITCH,
          r: STONE_R,
          fill: fillForClass(ctx, item.colorClass),
          stroke: strokeForClass(ctx, item.colorClass),
          'stroke-width': ctx.theme.stroke.hairline,
          // Trang trí đặt lên **viên dưới cùng**: halo bao cả cột sẽ thành một
          // vệt dọc, còn một vòng quanh chân cột thì đọc được là "đống này".
          ...(i === 0 ? decorationAttrs(ctx, item.id, item.emphasis) : {}),
        }),
      );
    }
  }

  children.push(
    text(
      'text',
      {
        x,
        y: SLOT * 0.55,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': ctx.theme.type.uiFamily,
        'font-size': SLOT * 0.42,
        fill: ctx.theme.object.pieceGlyph,
      },
      item.label ?? formatValue(item.value),
    ),
  );

  // Đống rỗng vẫn phải chiếm chỗ: "còn 0 viên" là một trạng thái có nghĩa, và
  // một đống biến mất khỏi hình sẽ bị đọc nhầm thành "đống đó đã bị gộp".
  if (drawnStones(item.value) === 0 && !isPileTooTall(item.value)) {
    children.unshift(
      el('line', {
        x1: x - SLOT * 0.3,
        x2: x + SLOT * 0.3,
        y1: 0,
        y2: 0,
        stroke: ctx.theme.surface.guide,
        'stroke-width': ctx.theme.stroke.base,
        ...decorationAttrs(ctx, item.id, item.emphasis),
      }),
    );
  }

  void derived;
  return keyed(item.id, 'g', {}, children);
}

function renderCut(
  cut: { id: string; before: number; label: string | undefined },
  derived: SequenceDerived,
  ctx: RenderContext,
): SvgNode {
  const x = slotX(cut.before) - GAP / 2;
  const top = derived.mode === 'piles' ? -STONE_PITCH * 7 : -GAP * 0.6;
  const bottom = derived.mode === 'piles' ? SLOT * 0.2 : SLOT + GAP * 0.6;

  return keyed(cut.id, 'g', {}, [
    el('line', {
      x1: x,
      x2: x,
      y1: top,
      y2: bottom,
      stroke: ctx.theme.object.regionStroke,
      'stroke-width': ctx.theme.stroke.emphasis,
      'stroke-dasharray': '1.6 1.2',
      ...decorationAttrs(ctx, cut.id),
    }),
  ]);
}

function renderCaption(
  caption: string,
  derived: SequenceDerived,
  ctx: RenderContext,
): SvgNode {
  // Ở `piles`, cột mọc lên trên nên caption phải leo qua đỉnh cột cao nhất —
  // đặt cố định ở -0.45·SLOT thì nó nằm **giữa** đống sỏi.
  const y =
    derived.mode === 'piles'
      ? -(Math.max(1, drawnStones(derived.tallest)) * STONE_PITCH + STONE_R * 2) - SLOT * 0.25
      : -SLOT * 0.45;

  return text(
    'text',
    {
      x: 0,
      y,
      'font-family': ctx.theme.type.uiFamily,
      'font-size': SLOT * 0.36,
      fill: ctx.theme.surface.guide,
    },
    caption,
  );
}

/**
 * Tổng ở cuối hàng.
 *
 * Đây là đại lượng bất biến hay gặp nhất của cả họ bài, nên nó xứng đáng một chỗ
 * cố định trong hình thay vì phải khai lại thành invariant ở từng bài. Invariant
 * strip (PLY-06) vẫn là chỗ cho những đại lượng *không* hiển nhiên.
 */
function renderTotal(derived: SequenceDerived, ctx: RenderContext): SvgNode {
  const x = slotX(Math.max(1, derived.items.length)) + SLOT * 0.2;
  const y = derived.mode === 'piles' ? SLOT * 0.55 : SLOT / 2;

  return text(
    'text',
    {
      x,
      y,
      'dominant-baseline': 'central',
      'font-family': ctx.theme.type.uiFamily,
      'font-size': SLOT * 0.4,
      fill: ctx.theme.surface.guide,
    },
    `Σ = ${formatValue(derived.total)}`,
  );
}

function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
