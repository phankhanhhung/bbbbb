import type { Scene, Viewport } from '@combviz/schema';
import {
  decorationAttrs,
  el,
  estimateTextWidth,
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
  CELL,
  PADDING,
  VENN_R,
  deriveSet,
  incidenceId,
  setConfig,
  vennCentres,
  vennRegionCentre,
  vennTooManySets,
  type SetDerived,
} from './derive.js';

/**
 * Renderer của Set/Counting engine (ST-01).
 *
 * Hai view, và SRS đã chọn hộ view nào là chủ lực: bảng incidence, không phải
 * Venn. Lý do nằm ở đề thi thật — lời giải đếm hai chiều dùng bảng nhiều hơn hẳn
 * sơ đồ Venn, còn Venn mạnh ở chỗ khác: nó cho thấy **vùng giao** như một vật
 * thể, thứ mà bảng không làm được.
 */
/** Cỡ chữ caption, và chiều cao nó cần được chừa. */
const CAPTION_SIZE = CELL * 0.36;

/**
 * Khung hình **và** chỗ đặt caption, tính một lần từ cùng một phép tính.
 *
 * Tách làm hai chỗ thì chúng trôi khỏi nhau, và bản nháp đầu tiên trôi đúng như
 * vậy: viewport chừa chỗ cho nhãn cột còn caption được đặt bằng một hằng số
 * riêng, cao hơn mép trên. Chữ vẫn được vẽ đủ, chỉ là nằm ngoài khung — không
 * lỗi, không cảnh báo, và không ai đọc được.
 */
function layoutOf(scene: Scene): { viewport: Viewport; caption: { x: number; y: number } } {
  const derived = deriveSet(scene);
  const config = setConfig(scene);
  const room = config.caption === undefined ? 0 : CAPTION_SIZE * 2;

  const body =
    derived.view === 'venn' && !vennTooManySets(derived)
      ? (() => {
          const r = VENN_R * 2.6;
          return { x: -r, y: -r, width: r * 2.15, height: r * 2 };
        })()
      : (() => {
          const rows = Math.max(1, derived.tokens.length);
          const cols = Math.max(1, derived.sets.length);
          const labelRoom = CELL * 1.6;
          const sumRoom = config.show_sums ? CELL * 1.1 : 0;
          return {
            x: -PADDING - labelRoom,
            y: -PADDING - CELL * 0.9,
            width: cols * CELL + labelRoom + sumRoom + PADDING * 2,
            height: rows * CELL + CELL * 0.9 + sumRoom + PADDING * 2,
          };
        })();

  // Caption dài hơn hình thì **nới khung**, không cắt chữ. Trước đây `room` chỉ
  // chừa chiều cao, nên một caption dài bị cụt ở mép phải: chữ vẫn vẽ đủ, viewBox
  // vẫn hợp lệ, không lỗi nào nổi lên. `estimateTextWidth` là chỗ duy nhất đoán
  // bề ngang chữ, dùng chung cho cả bốn engine có caption.
  const needed =
    config.caption === undefined
      ? 0
      : estimateTextWidth(config.caption, CAPTION_SIZE) + PADDING * 2;

  return {
    viewport: {
      ...body,
      y: body.y - room,
      height: body.height + room,
      width: Math.max(body.width, needed),
    },
    caption: { x: body.x + PADDING, y: body.y - room + CAPTION_SIZE },
  };
}

export const setRenderer: EngineRenderer = {
  id: 'set',

  defaultViewport(scene: Scene): Viewport {
    return layoutOf(scene).viewport;
  },

  render(scene: Scene, ctx: RenderContext): SvgNode[] {
    const derived = deriveSet(scene);
    const config = setConfig(scene);
    const { caption } = layoutOf(scene);

    const body =
      derived.view === 'venn' && !vennTooManySets(derived)
        ? renderVenn(derived, ctx)
        : renderMatrix(derived, config.show_sums === true, ctx);

    return [
      el('g', { class: 'cv-set' }, body),
      ...(config.caption
        ? [
            text(
              'text',
              {
                // Vị trí caption suy từ **chính viewport** vừa tính. Đặt bằng một
                // hằng số riêng thì hai bên trôi khỏi nhau, và bản nháp đầu tiên
                // trôi đúng như vậy: chân chữ nằm trên mép trên của viewport, nên
                // caption được vẽ đầy đủ mà không ai nhìn thấy nó.
                x: caption.x,
                y: caption.y,
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
 * Bảng incidence: hàng là phần tử, cột là tập, ô tô = "thuộc".
 *
 * Tổng hàng cho $|\{S : x \in S\}|$, tổng cột cho $|S|$, và hai tổng chung bằng
 * nhau — đó **là** phép đếm hai chiều, hiện ra thành hai con số người học tự đối
 * chiếu được thay vì một công thức phải tin.
 */
function renderMatrix(
  derived: SetDerived,
  showSums: boolean,
  ctx: RenderContext,
): SvgNode[] {
  const nodes: SvgNode[] = [];

  // Cỡ chữ nhãn cột co theo nhãn **dài nhất**, không cố định.
  //
  // Nhãn cột căn giữa ô rộng đúng một CELL, nên một nhãn như `{1,2,3,4}` tràn
  // sang cả hai ô bên cạnh và ba nhãn liền nhau chồng thành một vệt không đọc
  // được. Sàn 0.16 để nhãn dài bất thường thì nhỏ nhưng vẫn còn là chữ.
  const longest = Math.max(1, ...derived.sets.map((s) => (s.label ?? '').length));
  const colFont = Math.max(CELL * 0.16, Math.min(CELL * 0.36, (CELL * 0.95) / (0.55 * longest)));

  derived.sets.forEach((set, c) => {
    nodes.push(
      label(
        `set-label-${set.id}`,
        c * CELL + CELL / 2,
        -CELL * 0.35,
        set.label,
        'middle',
        ctx,
        false,
        colFont,
      ),
    );
  });

  derived.tokens.forEach((token, r) => {
    nodes.push(
      label(`token-label-${token.id}`, -CELL * 0.3, r * CELL + CELL / 2, token.label, 'end', ctx),
    );

    derived.sets.forEach((set, c) => {
      const inside = token.sets.includes(set.id);
      nodes.push(
        keyed(incidenceId(token.id, set.id), 'rect', {
          x: c * CELL,
          y: r * CELL,
          width: CELL,
          height: CELL,
          fill: inside
            ? fillForClass(ctx, set.colorClass ?? token.colorClass ?? 1)
            : ctx.theme.surface.neutral,
          stroke: ctx.theme.surface.guide,
          'stroke-width': ctx.theme.stroke.hairline,
          ...decorationAttrs(ctx, incidenceId(token.id, set.id), inside ? token.emphasis : undefined),
        }),
      );
    });

    if (showSums) {
      nodes.push(
        label(
          `row-sum-${token.id}`,
          derived.sets.length * CELL + CELL * 0.4,
          r * CELL + CELL / 2,
          String(token.sets.length),
          'start',
          ctx,
          true,
        ),
      );
    }
  });

  if (showSums) {
    derived.sets.forEach((set, c) => {
      nodes.push(
        label(
          `col-sum-${set.id}`,
          c * CELL + CELL / 2,
          derived.tokens.length * CELL + CELL * 0.4,
          String(set.size),
          'middle',
          ctx,
          true,
        ),
      );
    });

    nodes.push(
      label(
        'grand-sum',
        derived.sets.length * CELL + CELL * 0.4,
        derived.tokens.length * CELL + CELL * 0.4,
        `Σ ${derived.incidences}`,
        'start',
        ctx,
        true,
      ),
    );
  }

  // "Tay cầm" cho mỗi hàng và mỗi cột, mang **đúng id của token hoặc của set**.
  //
  // View Venn đã có sẵn: ở đó mỗi tập là một đường tròn keyed `set.id`, mỗi phần
  // tử là một chấm keyed `token.id`. View bảng thì không — nó chỉ có ô giao
  // `x__S` và nhãn `token-label-x`. Hệ quả: anchor trỏ tới `x1` — một element
  // khai tường minh, validate xanh — **không làm sáng thứ gì cả**. Không lỗi,
  // không cảnh báo, và tác giả chỉ biết khi tự rê chuột lên đúng chỗ đó.
  //
  // `fill: 'transparent'` chứ không phải `'none'`: `none` thì hình không được tô,
  // và một hình không được tô thì cũng không nhận được con trỏ chuột. Vẽ sau
  // cùng để halo nằm trên, và để chính nó là thứ chuột chạm vào trước.
  //
  // Cột trước, hàng sau — hai tay cầm chồng lên nhau ở thân bảng và cái vẽ sau
  // thắng. Quy ước: trỏ vào một ô thì được **phần tử** của hàng đó, trỏ lên dải
  // tiêu đề (nằm ngoài mọi hàng) thì được **tập**. Ngược lại thì bảng một cột
  // sẽ nuốt sạch mọi thao tác trỏ vào ô, vì cột đó phủ kín cả bảng.
  derived.sets.forEach((set, c) => {
    nodes.push(
      keyed(set.id, 'rect', {
        x: c * CELL,
        y: -CELL * 0.8,
        width: CELL,
        height: derived.tokens.length * CELL + CELL * 0.8,
        fill: 'transparent',
        ...decorationAttrs(ctx, set.id, set.emphasis),
      }),
    );
  });

  derived.tokens.forEach((token, r) => {
    nodes.push(
      keyed(token.id, 'rect', {
        x: -CELL * 0.9,
        y: r * CELL,
        width: derived.sets.length * CELL + CELL * 0.9,
        height: CELL,
        fill: 'transparent',
        ...decorationAttrs(ctx, token.id, token.emphasis),
      }),
    );
  });

  return nodes;
}

/**
 * Sơ đồ Venn ≤ 3 tập.
 *
 * Hình tròn vẽ **trước**, phần tử vẽ sau và nằm trên; vị trí phần tử suy từ chính
 * quan hệ thuộc (xem `vennRegionCentre`) nên hình không thể nói khác dữ liệu.
 */
function renderVenn(derived: SetDerived, ctx: RenderContext): SvgNode[] {
  const centres = vennCentres(derived.sets.length);
  const nodes: SvgNode[] = [];

  derived.sets.forEach((set, i) => {
    const c = centres[i] as { x: number; y: number };
    nodes.push(
      keyed(set.id, 'circle', {
        cx: round(c.x),
        cy: round(c.y),
        r: VENN_R,
        fill: fillForClass(ctx, set.colorClass ?? i + 1),
        // Ba hình tròn chồng nhau: không cho nhìn xuyên thì vùng giao — thứ cả
        // bài toán nói về — biến thành một mảng đặc không đọc được.
        opacity: 0.42,
        stroke: strokeForClass(ctx, set.colorClass ?? i + 1),
        'stroke-width': ctx.theme.stroke.base,
        ...decorationAttrs(ctx, set.id, set.emphasis),
      }),
    );

    // Nhãn ra hẳn **ngoài** vòng tròn theo hướng tâm→ra: đặt gần tâm thì nó đè
    // lên chính các chấm mà nó đang nói về.
    const length = Math.hypot(c.x, c.y) || 1;
    const out = VENN_R * 1.45;
    nodes.push(
      label(
        `set-label-${set.id}`,
        round(derived.sets.length === 1 ? 0 : c.x + (c.x / length) * out),
        round(derived.sets.length === 1 ? -VENN_R * 1.25 : c.y + (c.y / length) * out),
        `${set.label} (${set.size})`,
        'middle',
        ctx,
        true,
      ),
    );
  });

  // Gom phần tử theo vùng rồi rải trong vùng, để hai phần tử cùng vùng không
  // chồng khít lên nhau.
  const byRegion = new Map<string, typeof derived.tokens>();
  for (const token of derived.tokens) {
    const key = [...token.sets].sort().join('|');
    byRegion.set(key, [...(byRegion.get(key) ?? []), token]);
  }

  for (const group of byRegion.values()) {
    const centre = vennRegionCentre(group[0]!.sets, derived.sets);
    group.forEach((token, i) => {
      const angle = (2 * Math.PI * i) / Math.max(1, group.length);
      const spread = group.length === 1 ? 0 : Math.min(VENN_R * 0.3, 1.2 * group.length);
      const x = centre.x + Math.cos(angle) * spread;
      const y = centre.y + Math.sin(angle) * spread;

      nodes.push(
        keyed(token.id, 'circle', {
          cx: round(x),
          cy: round(y),
          r: 1.9,
          fill: fillForClass(ctx, token.colorClass ?? undefined),
          stroke: ctx.theme.object.pieceStroke,
          'stroke-width': ctx.theme.stroke.hairline,
          ...decorationAttrs(ctx, token.id, token.emphasis),
        }),
      );

      nodes.push({
        ...text(
          'text',
          {
            x: round(x),
            y: round(y + 3.6),
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            'font-family': ctx.theme.type.uiFamily,
            'font-size': 2.4,
            fill: inkForClass(ctx, token.colorClass ?? undefined),
          },
          token.label,
        ),
        key: `${token.id}-label`,
      });
    });
  }

  return nodes;
}

function label(
  key: string,
  x: number,
  y: number,
  value: string,
  anchor: string,
  ctx: RenderContext,
  strong = false,
  fontSize?: number,
): SvgNode {
  return {
    ...text(
      'text',
      {
        x,
        y,
        'text-anchor': anchor,
        'dominant-baseline': 'central',
        'font-family': ctx.theme.type.uiFamily,
        'font-size': fontSize ?? CELL * (strong ? 0.42 : 0.36),
        'font-weight': strong ? 600 : 400,
        fill: strong ? ctx.theme.object.pieceGlyph : ctx.theme.surface.guide,
      },
      value,
    ),
    key,
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
