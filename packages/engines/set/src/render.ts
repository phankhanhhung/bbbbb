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
  inclusionExclusion,
  setConfig,
  vennCentres,
  vennRegionCentre,
  vennTooManySets,
  type SetDerived,
} from './derive.js';
import { SET_LIMITS, type SetConfig } from './schema.js';

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

/** ST-03 — bề rộng tối thiểu một cột chấm, và khoảng cách hai chấm chồng nhau. */
const DOT_COL_MIN = CELL * 0.9;
const DOT_PITCH = CELL * 0.42;
const DOT_R = CELL * 0.15;
const DOT_LABEL_SIZE = CELL * 0.34;

/**
 * Bề rộng cột chấm, **nới theo nhãn dài nhất**.
 *
 * Chấm thì nhỏ, còn nhãn tập là chữ tự do ("bóng đá", "cờ vua"). Cột rộng cố định
 * theo chấm khiến ba nhãn liền nhau dính thành một vệt — bản đầu cho ra đúng
 * "bóng đáng rổ vua", vẽ đủ chữ và không đọc được chữ nào. Nới cột thì rẻ hơn co
 * chữ: co xuống vừa $9$ đơn vị thì nhãn thành li ti.
 */
function dotColumn(derived: SetDerived): number {
  const longest = Math.max(
    0,
    ...derived.sets.map((s) => estimateTextWidth(s.label, DOT_LABEL_SIZE)),
  );
  return Math.max(DOT_COL_MIN, longest + CELL * 0.3);
}
/** ST-02 — chiều cao một dòng của bảng bao hàm–loại trừ. */
const IE_LINE = CELL * 0.5;

/** Bảng bao hàm–loại trừ có hiện không: cần bật cờ, và cần $\le 3$ tập. */
function ieVisible(derived: SetDerived, config: SetConfig): boolean {
  return (
    config.show_inclusion_exclusion === true &&
    derived.sets.length >= 1 &&
    derived.sets.length <= SET_LIMITS.maxVennSets
  );
}

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
      : derived.view === 'dots'
      ? (() => {
          // Cột mọc **lên trên** từ $y = 0$, nhãn nằm dưới. Nên mép trên là số âm
          // và chiều cao là khoảng cách trên–dưới, không phải chỉ phần dương: bản
          // đầu tính như thể gốc nằm ở đỉnh cột, và hai chấm trên cùng của mỗi cột
          // bị cắt khỏi khung — vẫn vẽ ra, chỉ là nằm ngoài viewBox.
          const cols = Math.max(1, derived.sets.length);
          const top = dotsTop(derived);
          return {
            x: -PADDING - CELL * 0.4,
            y: top - PADDING,
            width: cols * dotColumn(derived) + CELL * 0.8 + PADDING * 2,
            height: DOTS_BOTTOM - top + PADDING * 2,
          };
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

  // ST-02 — bảng bao hàm–loại trừ nằm **dưới** hình, nên nó nới chiều cao chứ
  // không đè lên hình. Chiều cao đọc từ số hạng tử thật, không từ một hằng số:
  // hai tập cho ba dòng, ba tập cho năm.
  const ieRows = ieVisible(derived, config) ? derived.sets.length + 2 : 0;
  const ieRoom = ieRows === 0 ? 0 : ieRows * IE_LINE + CELL * 0.6;

  return {
    viewport: {
      ...body,
      y: body.y - room,
      height: body.height + room + ieRoom,
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
        : derived.view === 'dots'
          ? renderDots(derived, ctx)
          : renderMatrix(derived, config.show_sums === true, ctx);

    const ie = ieVisible(derived, config)
      ? renderInclusionExclusion(derived, bodyBottom(scene), ctx)
      : [];

    return [
      el('g', { class: 'cv-set' }, body),
      ...(ie.length > 0 ? [el('g', { class: 'cv-ie' }, ie)] : []),
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

/** Mép trên của cột chấm cao nhất — cột mọc lên trên từ $y = 0$. */
function dotsTop(derived: SetDerived): number {
  const tallest = Math.max(1, ...derived.sets.map((s) => s.size));
  return -(tallest * DOT_PITCH + DOT_PITCH * 0.6 + DOT_R);
}

/** Mép dưới của cột chấm: dưới nhãn tập và con số cỡ. */
const DOTS_BOTTOM = CELL * 1.2;

/**
 * Mép dưới **thật** của phần hình, nơi bảng bao hàm–loại trừ bắt đầu.
 *
 * Phải là mép dưới của thứ đã vẽ ra, không phải một hằng số áng chừng: bản đầu
 * ước cho Venn bằng $1{,}6R$ trong khi vùng "ngoài mọi tập" nằm đúng ở đó, nên
 * bảng đè lên chấm cuối và lên nhãn tập thứ ba.
 */
function bodyBottom(scene: Scene): number {
  const derived = deriveSet(scene);
  if (derived.view === 'venn' && !vennTooManySets(derived)) return VENN_R * 2.1;
  if (derived.view === 'dots') return DOTS_BOTTOM;
  return derived.tokens.length * CELL + CELL * 0.6;
}

/**
 * ST-03 — mỗi tập một **cột chấm**, mỗi chấm một phần tử.
 *
 * Vì sao view này đáng có, khi bảng incidence đã nói đủ mọi thứ: bảng trả lời
 * "phần tử nào thuộc tập nào", còn cột chấm trả lời "**bao nhiêu**", và mắt đọc
 * chiều cao nhanh hơn đọc số. Cả họ bài cực trị về hệ tập hợp hỏi đúng câu thứ
 * hai — "gia đình lớn nhất thoả điều kiện này có bao nhiêu tập" — nên có nó thì
 * người học so được hai phương án bằng một cái liếc.
 *
 * Một phần tử thuộc $d$ tập hiện ra thành $d$ chấm, ở $d$ cột khác nhau. Đó
 * **không** phải trùng lặp cần dẹp: tổng số chấm chính là `incidences`, tức
 * $\sum_S |S|$, và nhìn thấy một phần tử được đếm nhiều lần là toàn bộ nội dung
 * của phép đếm hai chiều. Chấm mang id của phần tử qua `data-el`, nên rê vào một
 * phần tử thì **mọi** bản sao của nó cùng sáng — cùng cơ chế mà ma trận kề của
 * engine đồ thị dùng để làm sáng hai ô đối xứng.
 */
function renderDots(derived: SetDerived, ctx: RenderContext): SvgNode[] {
  const nodes: SvgNode[] = [];

  const column = dotColumn(derived);

  derived.sets.forEach((set, c) => {
    const x = c * column + column / 2;
    const members = derived.tokens.filter((t) => t.sets.includes(set.id));

    members.forEach((token, i) => {
      nodes.push(
        keyed(incidenceId(token.id, set.id), 'circle', {
          cx: round(x),
          // Xếp từ dưới lên: cột cao hơn trông "nhiều hơn", đúng trực giác đọc
          // biểu đồ cột. Xếp từ trên xuống thì tập lớn trông như tụt xuống thấp.
          cy: round(-i * DOT_PITCH - DOT_PITCH * 0.6),
          r: round(DOT_R),
          fill: fillForClass(ctx, set.colorClass ?? token.colorClass ?? 1),
          'data-el': token.id,
          ...decorationAttrs(ctx, incidenceId(token.id, set.id), token.emphasis),
        }),
      );
    });

    nodes.push(
      label(`set-label-${set.id}`, x, CELL * 0.35, set.label, 'middle', ctx, false, DOT_LABEL_SIZE),
      // Con số dưới nhãn: chiều cao đọc nhanh nhưng đọc **xấp xỉ**, và một lập
      // luận cực trị cần con số chính xác.
      label(`set-size-${set.id}`, x, CELL * 0.95, String(set.size), 'middle', ctx),
    );
  });

  return nodes;
}

/**
 * ST-02 — bảng bao hàm–loại trừ, đặt dưới hình.
 *
 * Mỗi dòng là một hạng tử kèm dấu của nó, rồi tổng, rồi $|A \cup B \cup \dots|$
 * **đếm trực tiếp**. Hai con số cuối bằng nhau, và chúng đi qua hai đường tính
 * khác hẳn nhau — nên bảng này không phải một lời khẳng định mà là một phép đối
 * chiếu người học tự làm được.
 */
function renderInclusionExclusion(
  derived: SetDerived,
  top: number,
  ctx: RenderContext,
): SvgNode[] {
  const { terms, total, union } = inclusionExclusion(derived);
  const nodes: SvgNode[] = [];
  const left = 0;
  const size = CELL * 0.32;

  const rows: { head: string; value: string; key: string }[] = terms.map((term, i) => ({
    head: `${i % 2 === 0 ? '+' : '−'} ${
      i === 0 ? 'Σ|Aᵢ|' : i === 1 ? 'Σ|Aᵢ∩Aⱼ|' : 'Σ|Aᵢ∩Aⱼ∩Aₖ|'
    }`,
    value: String(term),
    key: `t${i}`,
  }));
  rows.push({ head: '= tổng', value: String(total), key: 'sum' });
  // Đếm trực tiếp: mỗi phần tử **một** lần, bất kể nó thuộc mấy tập.
  rows.push({ head: '|hợp| đếm thẳng', value: String(union), key: 'union' });

  // Cột số đặt sau nhãn **dài nhất**, không sau một khoảng cố định. Bản đầu dùng
  // $2{,}6$ ô và dòng "|hợp| đếm thẳng" đủ dài để chữ đâm vào con số — cùng lỗi
  // mà nhãn cột của bảng board đã mắc, và cùng cách chữa.
  const valueX =
    left + Math.max(...rows.map((r) => estimateTextWidth(r.head, size))) + CELL * 0.9;

  rows.forEach((row, i) => {
    const y = top + CELL * 0.5 + i * IE_LINE;
    nodes.push(
      label(`ie-${row.key}`, left, y, row.head, 'start', ctx, false, size),
      label(`ie-${row.key}-v`, valueX, y, row.value, 'end', ctx, false, size),
    );
  });

  return nodes;
}

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
