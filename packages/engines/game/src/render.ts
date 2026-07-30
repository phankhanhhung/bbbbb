import type { Scene, Viewport } from '@combviz/schema';
import {
  decorationAttrs,
  el,
  fillForClass,
  keyed,
  strokeForClass,
  estimateTextWidth,
  text,
  type EngineRenderer,
  type RenderContext,
  type SvgNode,
  UNITS_PER_CELL,
} from '@combviz/render';
import { GAME_LIMITS } from './schema.js';
import {
  analyzeGame,
  losingGrid,
  losingSpectrum,
  spectrum2dReadable,
  spectrumReadable,
} from './solver.js';
import { readGame, type GameModel } from './model.js';

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
/**
 * Trên ngưỡng này thì dùng ký hiệu lược thay vì vẽ từng viên.
 *
 * Đúng năm dãy đầy ($5 \times 6$), không phải một con số tròn. Bốn dãy — trần cũ —
 * cắt đúng chỗ đau: trò Euclid mở đầu ở $(25,7)$, và $25$ viên là thứ người đọc
 * cần **đếm được** để thấy $25 = 3 \cdot 7 + 4$. Năm dãy vẫn đọc ra "một khối",
 * còn ký hiệu lược thì để cho những đống thật sự lớn.
 */
const MAX_DOTS = 30;
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

    if (model.config.view === 'spectrum-2d') {
      if (!spectrum2dReadable(model.config.rule)) return REFUSED_BOX;
      const n = gridLength(model);
      return {
        x: -PADDING - AXIS,
        y: -PADDING - SLOT * 0.6,
        width: Math.max(n * SLOT, textFloor(model, GRID_LEGEND)) + AXIS + PADDING * 2,
        height: n * SLOT + AXIS + SLOT * 0.6 + PADDING * 2 + SLOT * 0.8,
      };
    }

    if (model.config.view === 'spectrum') {
      // Luật mà phổ một chiều không mô tả được: khung vừa đủ một dòng chữ. Vẽ ra
      // một lưới 60 ô rồi bỏ trống là tệ hơn không vẽ gì — nó trông như hình bị
      // hỏng chứ không như một câu trả lời.
      if (!spectrumReadable(model.config.rule)) return REFUSED_BOX;
      const n = spectrumLength(model);
      const cols = Math.min(n, 12);
      const rows = Math.ceil(n / cols);
      return {
        x: -PADDING,
        y: -PADDING - SLOT * 0.6,
        width: Math.max(cols * SLOT, textFloor(model, SPECTRUM_LEGEND)) + PADDING * 2,
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
      model.config.view === 'spectrum-2d'
        ? renderSpectrum2d(model, ctx)
        : model.config.view === 'spectrum'
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
                'font-size': CAPTION_SIZE,
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

/**
 * Khe giữa hai đống kề nhau.
 *
 * Không có nó thì đống nhiều dãy dính vào đống bên cạnh: hai đống $10$ và $15$
 * vẽ ra năm dãy sỏi liền một khối, và người đọc không còn thấy **ranh giới** giữa
 * hai đống — thứ mà cả bài dựa vào. Nửa đường kính viên là đủ để mắt tách ra mà
 * chưa tới mức hai đống trông như hai hình rời.
 */
const PILE_GAP = STONE_R * 1.2;

/** Bề ngang một đống, tính bằng đơn vị scene. Đống lược chỉ chiếm một cột. */
function pileWidth(count: number): number {
  if (count > MAX_DOTS) return SLOT;
  return Math.max(SLOT, stackShape(count).columns * (STONE_R * 2.6) + PILE_GAP);
}

/** Số hàng của đống cao nhất — mặt sàn dùng chung của cả hình. */
function tallestStack(model: GameModel): number {
  return Math.max(1, ...model.piles.map((p) => stackShape(p.count).rows));
}

const DOT_TOP = SLOT * 0.4;

const CAPTION_SIZE = SLOT * 0.34;

/** Chỗ chừa cho trục số của `spectrum-2d`. */
const AXIS = SLOT * 0.9;

const LEGEND_SIZE = SLOT * 0.32;

/**
 * Chú giải của hai view phổ — hằng số, không phải chuỗi gõ tại chỗ vẽ.
 *
 * Khung phải rộng đủ chứa dòng này, mà "đủ" thì đo từ **chính** chuỗi ấy. Để chuỗi
 * ở hai nơi thì sửa một chỗ, chỗ kia cụt chữ, và cụt chữ là loại lỗi không có gì
 * báo — đúng thứ vừa phải vá ở cả năm engine có caption.
 */
const SPECTRUM_LEGEND = 'Ô tô đậm: thế thua của người sắp đi';
const GRID_LEGEND = 'Ô tô đậm: thế thua của người sắp đi. Trục ngang: đống thứ nhất.';

/** Bề rộng tối thiểu để mọi dòng chữ của một view phổ nằm trong khung. */
function textFloor(model: GameModel, legend: string): number {
  const caption = model.config.caption
    ? estimateTextWidth(model.config.caption, CAPTION_SIZE)
    : 0;
  return Math.max(estimateTextWidth(legend, LEGEND_SIZE), caption);
}

/**
 * Khung khi luật không vẽ được view đã chọn: vừa đủ một dòng chữ.
 *
 * Vẽ ra một lưới rồi bỏ trống là **tệ hơn** không vẽ gì — nó trông như hình bị
 * hỏng chứ không như một câu trả lời.
 */
const REFUSED_BOX = {
  x: -PADDING,
  y: -PADDING,
  width: SLOT * 6,
  height: SLOT + PADDING * 2,
} as const;

/**
 * Dải hoành độ của từng cột đống — **một** phép tính cho cả vẽ và chạm.
 *
 * `gameHitTest` đọc chính hàm này. Trước đó nó chia đều theo `SLOT`, mà cột nhiều
 * viên xếp thành nhiều dãy nên rộng hơn `SLOT`: từ cột thứ hai trở đi, chạm lệch
 * dần. Không ai thấy vì công cụ cũ chỉ cần **một** đống và bấm nhầm đống thì lệnh
 * lặng lẽ từ chối; công cụ Wythoff cần **hai**, và lúc ấy lệch một cột là đi nhầm
 * nước.
 *
 * Khung có thể rộng hơn tổng các cột, vì caption dài hơn hình thì khung phải nới
 * ra cho vừa chữ. Lúc ấy các cột nằm **giữa** khung, không dồn sang trái: một
 * đống sỏi lệch về mép trông như lỗi bố cục chứ không như một hình nhỏ.
 */
export function pileBands(
  model: GameModel,
): readonly { id: string; from: number; to: number }[] {
  const widths = model.piles.map((p) => pileWidth(p.count));
  const stacks = widths.reduce((a, b) => a + b, 0);
  const bands: { id: string; from: number; to: number }[] = [];

  let cursor = Math.max(0, (contentWidth(model) - stacks) / 2);
  model.piles.forEach((pile, index) => {
    const width = widths[index] as number;
    bands.push({ id: pile.id, from: cursor, to: cursor + width });
    cursor += width;
  });
  return bands;
}

/**
 * Bề rộng nội dung: các cột đống, hoặc **caption** nếu chữ dài hơn.
 *
 * Bản trước chỉ đếm các cột, nên một caption bốn mươi ký tự bị cắt cụt ở mép
 * khung — chữ vẫn vẽ đủ, `viewBox` vẫn hợp lệ, không lỗi nào nổi lên, chỉ là
 * người đọc thấy "Bốc một đống, hoặ". Bốn engine có caption và cả bốn đều chừa
 * chỗ theo chiều cao rồi quên chiều ngang; `estimateTextWidth` là chỗ **duy nhất**
 * đoán bề ngang chữ để bốn chỗ ấy không lệch nhau.
 */
function contentWidth(model: GameModel): number {
  const stacks = model.piles.reduce((n, p) => n + pileWidth(p.count), 0);
  const caption = model.config.caption
    ? estimateTextWidth(model.config.caption, CAPTION_SIZE) + PADDING
    : 0;
  return Math.max(SLOT, stacks, caption);
}

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
  const width = contentWidth(model);
  const tallest = tallestStack(model);
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
  if (!spectrumReadable(model.config.rule)) {
    // `checkBounds` đã báo lỗi này lúc soạn, nhưng renderer không được dựa vào
    // chuyện đó: scene vẫn tới đây được. Nói ra mình không vẽ được, thay vì vẽ
    // một bảng tính từ `movesFromPile` — với luật toàn cục hàm ấy trả rỗng, nên
    // bảng sẽ tô sạch một màu và trông hoàn toàn thuyết phục.
    return refusal('Phổ một chiều không mô tả được luật này', ctx);
  }

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
        'font-size': LEGEND_SIZE,
        fill: ctx.theme.surface.guide,
      },
      SPECTRUM_LEGEND,
    ),
  );

  return nodes;
}

/** Số ô trên **một** cạnh của lưới `spectrum-2d`. */
function gridLength(model: GameModel): number {
  return (
    Math.min(
      GAME_LIMITS.maxSpectrum2d,
      model.config.spectrum_to ?? Math.max(...model.piles.map((p) => p.count), 12),
    ) + 1
  );
}

/** Dòng chữ thay cho hình khi luật không vẽ được view đã chọn. */
function refusal(message: string, ctx: RenderContext): SvgNode[] {
  return [
    text(
      'text',
      {
        x: 0,
        y: SLOT * 0.5,
        'font-family': ctx.theme.type.uiFamily,
        'font-size': SLOT * 0.32,
        fill: ctx.theme.surface.guide,
      },
      message,
    ),
  ];
}

/**
 * Phổ **hai chiều**: mọi thế hai đống $(a,b)$, tô theo thắng/thua (GM-08).
 *
 * View này tồn tại vì một lý do rất hẹp và rất đáng: với Wythoff, phát biểu "thế
 * thua là $(\lfloor n\varphi \rfloor, \lfloor n\varphi^2 \rfloor)$" là một
 * công thức **phải tin**. Trên lưới thì nó là **hai tia** kẹp lấy đường chéo, và
 * hai tia ấy đọc được bằng mắt trong một giây. Với trò Euclid, "tỉ số dưới
 * $\varphi$ thì thua" hiện ra thành một **nêm** quanh đường chéo. Đó đúng là việc
 * mà `spectrum` một chiều làm cho họ bốc sỏi, và là việc mà một bảng số không làm
 * được.
 *
 * Trục $b$ đi **lên**, không đi xuống. Trong SVG thì $y$ tăng xuống dưới, nên phải
 * lật; không lật thì hình ra ảnh gương của mọi hình vẽ tay trong sách, và người
 * đọc mất vài giây chỉ để nhận ra mình đang nhìn cái gì.
 */
function renderSpectrum2d(model: GameModel, ctx: RenderContext): SvgNode[] {
  if (!spectrum2dReadable(model.config.rule)) {
    return refusal('Luật chia đống không vẽ được trên lưới hai chiều', ctx);
  }

  const length = gridLength(model);
  const max = length - 1;
  const lose = losingGrid(max, model.config.rule, model.config.misere === true);
  const nodes: SvgNode[] = [];

  const cellY = (b: number): number => (max - b) * SLOT;

  for (let a = 0; a <= max; a += 1) {
    for (let b = 0; b <= max; b += 1) {
      const cold = (lose[a] as boolean[])[b] === true;
      nodes.push(
        keyed(`pos-${a}-${b}`, 'rect', {
          x: a * SLOT,
          y: cellY(b),
          width: SLOT,
          height: SLOT,
          fill: cold ? fillForClass(ctx, 3) : ctx.theme.surface.neutral,
          stroke: ctx.theme.surface.guide,
          'stroke-width': ctx.theme.stroke.hairline,
          ...decorationAttrs(ctx, `pos-${a}-${b}`, undefined),
        }),
      );
    }
  }

  // Thế hiện tại của scene, khoanh lại. Không có nó thì lưới là một biểu đồ rời
  // khỏi bài; có nó thì người đọc thấy ngay "mình đang ở đâu trên bản đồ này".
  if (model.piles.length === 2) {
    const [a, b] = model.piles.map((p) => p.count) as [number, number];
    if (a <= max && b <= max) {
      nodes.push(
        el('rect', {
          x: a * SLOT,
          y: cellY(b),
          width: SLOT,
          height: SLOT,
          fill: 'none',
          stroke: ctx.theme.emphasis.focusHalo,
          'stroke-width': ctx.theme.stroke.emphasis,
        }),
      );
    }
  }

  // Trục. Chỉ đánh số ô chẵn khi lưới lớn: hai mươi lăm con số sát nhau thì mỗi
  // con số đọc được mà cả hàng thì không.
  const stride = max > 14 ? 2 : 1;
  for (let n = 0; n <= max; n += 1) {
    if (n % stride !== 0) continue;
    nodes.push(
      text(
        'text',
        {
          x: n * SLOT + SLOT / 2,
          y: (max + 1) * SLOT + AXIS * 0.55,
          'text-anchor': 'middle',
          'font-family': ctx.theme.type.mathFamily,
          'font-size': SLOT * 0.32,
          fill: ctx.theme.surface.guide,
        },
        String(n),
      ),
    );
    nodes.push(
      text(
        'text',
        {
          x: -AXIS * 0.35,
          y: cellY(n) + SLOT / 2,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': ctx.theme.type.mathFamily,
          'font-size': SLOT * 0.32,
          fill: ctx.theme.surface.guide,
        },
        String(n),
      ),
    );
  }

  nodes.push(
    text(
      'text',
      {
        x: 0,
        y: (max + 1) * SLOT + AXIS + SLOT * 0.5,
        'font-family': ctx.theme.type.uiFamily,
        'font-size': LEGEND_SIZE,
        fill: ctx.theme.surface.guide,
      },
      GRID_LEGEND,
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

  const bands = pileBands(model);

  // **Mọi** viên sỏi nằm trên cùng một mặt sàn, và sàn ấy là hàng đáy của đống cao
  // nhất. Bản trước điền từng cột từ trên xuống theo `row = i % STACK`, nên hai
  // chuyện xảy ra cùng lúc: cột cuối của một đống thiếu viên thì khoảng trống nằm
  // ở **dưới** (đống $10$ viên trông như khối $2 \times 6$ bị mẻ góc), và đống
  // thấp thì **treo lơ lửng** ở mép trên trong khi nhãn của nó nằm ở đáy. Sỏi thật
  // thì đổ xuống bàn.
  const ground = tallestStack(model);

  model.piles.forEach((pile, index) => {
    const band = bands[index] as { from: number; to: number };
    const { columns } = stackShape(pile.count);
    const centre = (band.from + band.to) / 2;
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
        const height = Math.min(STACK, pile.count - column * STACK);
        const row = ground - height + (i % STACK);
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
  });

  return nodes;
}

function round(value: number): number {
  return Math.round(value * 100) / 100 + 0;
}
