import type { Scene, SceneElement, Viewport } from '@combviz/schema';
import {
  decorationAttrs,
  el,
  elementDecoration,
  estimateTextWidth,
  fillForClass,
  groupAttrs,
  inkForClass,
  keyed,
  strokeForClass,
  text,
  type EngineRenderer,
  type RenderContext,
  type SceneBox,
  type SvgNode,
} from '@combviz/render';
import {
  BOARD_PADDING,
  CELL,
  cellColorClass,
  latticeOf,
  outlinePath,
  tileOffsets,
  type Offset,
} from './geometry.js';
import {
  cellPolygon,
  cellsInRow,
  inBoard,
  centreOf,
  isLatticeShape,
  latticeExtent,
  outlineOfCells,
  wrapOf,
} from './lattice.js';
import { tileCells } from './dsl.js';
import { cellId, parseCellId, parseStrikeId, strikeId } from './ids.js';
import { attackedCells, cellCentre, type AttackBoard } from './attacks.js';
import type { BoardConfig } from './schema.js';

/**
 * Renderer của Grid/Board engine.
 *
 * Hàm thuần: `Scene → SvgNode[]`, không đụng DOM, không đọc giờ, không random.
 * Cùng hàm này chạy trong Player, trong golden test, và trong Node khi build OG
 * card — nên thứ người học thấy và thứ xuất bản ra không thể lệch nhau.
 */
/**
 * Chỗ mực của một element bàn cờ nằm.
 *
 * Mọi thứ quy về `cellPolygon` — cùng hàm mà renderer dùng để vẽ ô, dựng đường
 * bao region và tính tâm. Một ô có **một** hình dạng, khai ở một chỗ; nhờ vậy
 * bàn ong và bàn tam giác không cần một dòng riêng nào ở đây.
 *
 * Quân nhiều ô trả **một hộp cho mỗi ô**, không phải hộp bao chung. Với quân
 * hình L thì tâm hộp bao chung rơi vào **cái khuyết** — một chỗ không có mực, và
 * phép biến hình sẽ bay tới chỗ trống.
 */
function boxesOf(scene: Scene, id: string): readonly SceneBox[] {
  const config = scene.config as BoardConfig | undefined;
  if (!config) return [];

  const lattice = latticeOf(config);
  const rows = config.rows ?? 0;
  const cols = config.cols ?? 0;
  const board = { rows, cols, wrap: wrapOf(config) };

  const boxOfCell = ([row, col]: Offset): SceneBox | null => {
    if (!inBoard(lattice, rows, cols, row, col)) return null;
    const points = cellPolygon(lattice, rows, cols, row, col);
    if (points.length === 0) return null;
    const x = Math.min(...points.map((pt) => pt.x));
    const y = Math.min(...points.map((pt) => pt.y));
    return {
      x,
      y,
      width: Math.max(...points.map((pt) => pt.x)) - x,
      height: Math.max(...points.map((pt) => pt.y)) - y,
    };
  };

  // Nét gạch (BD-10) nằm quanh tâm ô, nên hộp của ô trả lời đúng cho nó: tâm hộp
  // ô **là** tâm nét.
  const cell = parseCellId(id) ?? parseStrikeId(id);
  if (cell) {
    const box = boxOfCell([cell.row, cell.col]);
    return box ? [box] : [];
  }

  const element = scene.elements.find((e) => e.id === id);
  if (!element) return [];

  const cells: readonly Offset[] =
    element.type === 'tile'
      ? tileCells(element, lattice, board)
      : element.type === 'region'
        ? ((element['cells'] as Offset[] | undefined) ?? [])
        : element.type === 'piece'
          ? [(element['pos'] as Offset | undefined) ?? [-1, -1]]
          : [];

  return cells.map(boxOfCell).filter((box): box is SceneBox => box !== null);
}

export const boardRenderer: EngineRenderer = {
  id: 'board',
  elementBoxes: boxesOf,

  defaultViewport(scene: Scene): Viewport {
    const config = scene.config as BoardConfig;
    const rows = config?.rows ?? 1;
    const cols = config?.cols ?? 1;

    // Bảng (PRN-03) mọc thêm nhãn ở lề trái/trên và dòng tổng ở lề phải/dưới;
    // quên chừa chỗ thì nhãn bị cắt đúng như nhãn đỉnh đồ thị từng bị.
    const table = config?.table;
    // Lề trái đọc từ **nhãn dài nhất**, không từ một hằng số: nhãn được phép tới
    // 10 ký tự, mà `CELL * 1.4` chỉ đủ cho khoảng năm. Công thức khớp đúng chỗ đặt
    // chữ — nhãn căn phải kết thúc ở `-CELL * 0.3` rồi kéo sang trái theo bề rộng
    // của nó — nên nhãn ngắn vẫn ra đúng con số cũ và golden không đổi.
    const longestRowLabel = Math.max(
      0,
      ...(table?.row_labels ?? []).map((label) => estimateTextWidth(label, ROW_LABEL_SIZE)),
    );
    const left = table?.row_labels ? Math.max(CELL * 1.4, longestRowLabel + CELL * 0.3) : 0;
    const top = table?.col_labels ? CELL * 0.9 : 0;
    const right = table?.show_sums ? CELL * 1.1 : 0;
    const bottom = table?.show_sums ? CELL * 0.9 : 0;

    // Khung đọc từ `latticeExtent`, **cùng** phép tính mà `cellPolygon` dùng để
    // đặt từng ô. Ước riêng bằng `rows * CELL` thì đúng cho lưới vuông và hụt cho
    // hai lưới kia — lục giác cao hơn ô vuông $15\%$, tam giác thì thấp hơn $13\%$.
    const extent = latticeExtent(latticeOf(config), rows, cols);

    return {
      x: -BOARD_PADDING - left,
      y: -BOARD_PADDING - top,
      width: extent.width + BOARD_PADDING * 2 + left + right,
      height: extent.height + BOARD_PADDING * 2 + top + bottom,
    };
  },

  render(scene: Scene, ctx: RenderContext): SvgNode[] {
    const config = scene.config as BoardConfig;
    if (!config || typeof config.rows !== 'number') return [];

    const elements = [...scene.elements].sort(byLayer);

    // Overlay nằm **giữa** ô và quân: nó phải đè lên màu ô để đọc được, nhưng
    // không được che chính quân đang khống chế. Vắng thì không phát ra nhóm rỗng
    // — mọi bàn cờ không dùng attack map phải cho ra đúng SVG như trước.
    const attacks = renderAttackOverlay(config, elements, ctx);

    // BD-05 — ký hiệu mép dán. Vắng `wrap` thì **không** phát ra nhóm nào, để mọi
    // bàn đang có cho ra đúng SVG như trước.
    const seams = renderSeams(config, ctx);

    return [
      el('g', { class: 'cv-cells' }, renderCells(config, ctx)),
      ...(config.table ? [el('g', { class: 'cv-table' }, renderTable(config, ctx))] : []),
      ...(attacks.length > 0 ? [el('g', { class: 'cv-attacks' }, attacks)] : []),
      ...(seams.length > 0 ? [el('g', { class: 'cv-seams' }, seams)] : []),
      el('g', { class: 'cv-elements' }, elements.flatMap((e) => renderElement(e, config, ctx))),
    ];
  },
};

/**
 * Mép dán, vẽ theo **quy ước tôpô** (BD-05).
 *
 * Không phải trang trí, mà là sửa một lỗi "hình không nói điều lời nói": một bàn
 * dán mép vẽ ra **giống hệt** một bàn thường, nên người đọc không có cách nào biết
 * ô cột cuối kề ô cột đầu — trong khi cả lời giải dựa vào đúng chuyện đó.
 *
 * Ký hiệu là ký hiệu chuẩn của không gian thương: hai cạnh **được dán với nhau**
 * mang cùng một loại mũi tên, cùng chiều. Một mũi tên cho cặp trái–phải, hai mũi
 * tên cho cặp trên–dưới. Ai từng đọc một trang sách tôpô nhận ra ngay; ai chưa
 * từng thì lời giải nói cho biết, và hình không nói dối họ.
 */
function renderSeams(config: BoardConfig, ctx: RenderContext): SvgNode[] {
  const wrap = wrapOf(config);
  if (wrap === 'none') return [];

  const width = config.cols * CELL;
  const height = config.rows * CELL;
  const stroke = ctx.theme.object.regionStroke;
  const weight = ctx.theme.stroke.region;

  const seam = (x1: number, y1: number, x2: number, y2: number, marks: number): SvgNode[] => {
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    // Vector đơn vị dọc cạnh, và pháp tuyến của nó — mũi tên là hai gạch chéo
    // dựng từ chính hai vector ấy, nên nó tự xoay đúng cho cạnh dọc lẫn cạnh ngang.
    const len = Math.hypot(x2 - x1, y2 - y1);
    const ux = (x2 - x1) / len;
    const uy = (y2 - y1) / len;
    const size = CELL * 0.3;

    const heads: SvgNode[] = [];
    for (let i = 0; i < marks; i += 1) {
      // Nhiều mũi tên thì xếp dọc cạnh, cách nhau một quãng. Hệ số phải **lớn hơn**
      // bề ngang một mũi tên, không thì hai cái lồng vào nhau và trông như một cái
      // dày — chính là thứ ký hiệu này phải phân biệt.
      const offset = (i - (marks - 1) / 2) * size * 1.8;
      const cx = midX + ux * offset;
      const cy = midY + uy * offset;
      heads.push(
        el('path', {
          d:
            `M${round(cx - ux * size + uy * size * 0.6)} ${round(cy - uy * size - ux * size * 0.6)}` +
            `L${round(cx)} ${round(cy)}` +
            `L${round(cx - ux * size - uy * size * 0.6)} ${round(cy - uy * size + ux * size * 0.6)}`,
          fill: 'none',
          stroke,
          'stroke-width': weight,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
        }),
      );
    }

    return [
      el('path', {
        d: `M${round(x1)} ${round(y1)}L${round(x2)} ${round(y2)}`,
        fill: 'none',
        stroke,
        'stroke-width': weight,
        'stroke-linecap': 'round',
      }),
      ...heads,
    ];
  };

  const out: SvgNode[] = [
    // Trái và phải: cùng chiều (đi xuống), nghĩa là dán thẳng chứ không xoắn — bàn
    // này là hình ống / hình xuyến, không phải dải Möbius hay mặt Klein.
    ...seam(0, 0, 0, height, 1),
    ...seam(width, 0, width, height, 1),
  ];

  if (wrap === 'torus') {
    out.push(...seam(0, 0, width, 0, 2), ...seam(0, height, width, height, 2));
  }

  return out;
}

/** Cỡ chữ nhãn hàng — một hằng số, để khung và chữ không đọc hai con số khác nhau. */
const ROW_LABEL_SIZE = CELL * 0.38;

/** Cỡ chữ nhãn cột: cỡ chuẩn, co lại nếu chữ rộng hơn một ô. */
function colLabelSize(label: string): number {
  const wanted = estimateTextWidth(label, ROW_LABEL_SIZE);
  const room = CELL * 0.92;
  return wanted <= room ? ROW_LABEL_SIZE : (ROW_LABEL_SIZE * room) / wanted;
}

function byLayer(a: SceneElement, b: SceneElement): number {
  return (a.layer ?? 0) - (b.layer ?? 0);
}

/**
 * Mỗi ô là một node có key riêng — cố ý **không** gộp các ô cùng màu thành một
 * `<path>`.
 *
 * Gộp thì ít node hơn, nhưng khoảnh khắc thị giác quan trọng nhất của cả dạng bài
 * tiling là lúc bàn cờ được tô xen kẽ; gộp sẽ biến nó thành một cú nháy thay vì
 * một chuyển màu mà mắt theo được. Giữ ô rời để auto-diff (DAT-12) lo phần
 * chuyển động, và tối ưu gộp chỉ đưa vào **sau khi** đo trên iPad thật cho thấy
 * cần (NFR-P1) — chứ không đoán trước.
 */
function renderCells(config: BoardConfig, ctx: RenderContext): SvgNode[] {
  const holes = new Set((config.holes ?? []).map(([r, c]) => `${r},${c}`));
  const lattice = latticeOf(config);
  const nodes: SvgNode[] = [];

  for (let r = 0; r < config.rows; r += 1) {
    for (let c = 0; c < cellsInRow(lattice, config.cols, r); c += 1) {
      const isHole = holes.has(`${r},${c}`);
      const colorClassIndex = isHole ? undefined : cellColorClass(config, r, c);
      const glyph = config.cell_overrides?.[cellId(r, c)]?.glyph;
      const centre = centreOf(lattice, config.rows, config.cols, r, c);

      // Lưới vuông vẫn vẽ `<rect>`, không phải `<polygon>` bốn đỉnh: hai thứ ra
      // cùng một hình, nhưng đổi thẻ sẽ làm lệch golden của **hai mươi** bài đang
      // publish mà không đổi một pixel nào. Diff golden phải nói lên điều gì đó.
      const shape =
        lattice === 'square'
          ? keyed(cellId(r, c), 'rect', {
              x: c * CELL,
              y: r * CELL,
              width: CELL,
              height: CELL,
              fill: isHole ? ctx.theme.surface.void : fillForClass(ctx, colorClassIndex),
              stroke: ctx.theme.surface.guide,
              'stroke-width': ctx.theme.stroke.hairline,
              ...decorationAttrs(ctx, cellId(r, c)),
            })
          : keyed(cellId(r, c), 'polygon', {
              points: cellPolygon(lattice, config.rows, config.cols, r, c)
                .map((p) => `${round(p.x)},${round(p.y)}`)
                .join(' '),
              fill: isHole ? ctx.theme.surface.void : fillForClass(ctx, colorClassIndex),
              stroke: ctx.theme.surface.guide,
              'stroke-width': ctx.theme.stroke.hairline,
              ...decorationAttrs(ctx, cellId(r, c)),
            });

      nodes.push(shape);

      // BD-10 — nét gạch. Vẽ **sau** ô và **trước** glyph? Không: sau cả glyph, để
      // nét nằm trên con số. Gạch mà bị con số đè lên thì nó thành gạch chân.
      const strike = isHole ? undefined : config.cell_overrides?.[cellId(r, c)]?.strike;

      if (glyph) {
        nodes.push(
          text(
            'text',
            {
              x: round(centre.x),
              y: round(centre.y),
              'text-anchor': 'middle',
              'dominant-baseline': 'central',
              'font-family': ctx.theme.type.uiFamily,
              // Tam giác đơn vị hẹp hơn ô vuông nhiều, nên chữ phải nhỏ lại —
              // không thì glyph tràn ra ngoài ô và đè lên ô bên cạnh.
              'font-size': CELL * (lattice === 'triangle' ? 0.34 : 0.55),
              // Mực theo lớp màu của **chính ô này**: một dấu "−" trên ô lớp 8
              // vẽ bằng mực đen chung thì gần như biến mất.
              fill: inkForClass(ctx, colorClassIndex),
              /**
               * Chữ trong ô **thuộc về ô**, và phải nói ra điều đó.
               *
               * `key` đã nằm trên `<rect>`, nên node chữ này không mang danh tính
               * nào cả — mà `applyChoreography` tra chủ sở hữu theo `data-el ?? key`.
               * Hệ quả: một pha `dim`/`show`/`hide` nhắm vào một ô chỉ chạm **cái
               * ô**, con số bên trong đứng nguyên. Bài `sum-odd-numbers-gnomon` xây
               * hình vuông theo từng lớp gnomon bằng năm pha `show`, và ở khung đầu
               * cả lưới $5\times5$ con số đã hiện sẵn trong khi mọi ô còn ẩn — hình
               * lộ đáp án trước khi lập luận bắt đầu.
               *
               * Không đặt `key` mà đặt `data-el`: `key` là danh tính **DOM** và ô đã
               * dùng nó cho `<rect>`; hai node cùng key thì auto-diff (DAT-12) không
               * phân biệt được chúng. `data-el` đúng là "element ngữ nghĩa mà node
               * này thuộc về, khi nó khác danh tính DOM" — xem `patch.ts`.
               */
              'data-el': cellId(r, c),
            },
            glyph,
          ),
        );
      }

      if (strike !== undefined) {
        const sid = strikeId(r, c);
        const reach = CELL * 0.35;
        nodes.push(
          keyed(sid, 'line', {
            // Dựng quanh **tâm ô** chứ không theo hộp bao: tâm ô là thứ
            // `lattice.ts` biết, nên một công thức chạy đúng ở cả ba lưới. Đường
            // chéo của hộp bao thì thò ra ngoài ô tam giác.
            x1: round(centre.x - reach),
            y1: round(centre.y + reach),
            x2: round(centre.x + reach),
            y2: round(centre.y - reach),
            stroke: strokeForClass(ctx, strike),
            'stroke-width': ctx.theme.stroke.base,
            'stroke-linecap': 'round',
            // Neo được như mọi element khác. Đánh đổi ghi ra để không ai tưởng là
            // sót: `decorationAttrs` trả về `stroke` + `stroke-width`, mà một nét
            // thì không có `fill` để `paint-order` dựng viền quanh — nên lúc được
            // nhấn, nét **đổi màu** thành màu halo thay vì mọc thêm halo. Với một
            // nét mảnh thì đó vẫn là "cái này đây", và cách duy nhất giữ được màu
            // là phát thêm một node vô hình cho mọi ô bị gạch.
            ...decorationAttrs(ctx, sid, undefined, ctx.theme.stroke.base / ctx.theme.stroke.region),
          }),
        );
      }
    }
  }

  return nodes;
}

/**
 * PRN-03 — nhãn hàng/cột và dòng tổng.
 *
 * Tổng đếm **ô đã tô**, và cả hai chiều được đếm độc lập rồi in cạnh nhau. Đó
 * chính là toàn bộ nội dung của "đếm hai chiều": không phải một công thức, mà
 * hai con số bằng nhau mà người học tự đối chiếu được.
 */
function renderTable(config: BoardConfig, ctx: RenderContext): SvgNode[] {
  const table = config.table;
  if (!table) return [];

  const holes = new Set((config.holes ?? []).map(([r, c]) => `${r},${c}`));
  const marked = (r: number, c: number): boolean =>
    !holes.has(`${r},${c}`) && cellColorClass(config, r, c) !== undefined;

  const nodes: SvgNode[] = [];
  const label = (
    key: string,
    x: number,
    y: number,
    value: string,
    anchor: string,
    strong = false,
    size?: number,
  ): void => {
    // `text` là **nội dung**, không phải thuộc tính — đặt nhầm chỗ thì SVG hợp
    // lệ, hiện ra `text="5"` và không một con số nào xuất hiện.
    nodes.push({
      ...text(
        'text',
        {
          x,
          y,
          'text-anchor': anchor,
          'dominant-baseline': 'central',
          'font-family': ctx.theme.type.uiFamily,
          'font-size': size ?? CELL * (strong ? 0.42 : 0.38),
          'font-weight': strong ? 600 : 400,
          fill: strong ? ctx.theme.object.pieceGlyph : ctx.theme.surface.guide,
        },
        value,
      ),
      key,
    });
  };

  (table.row_labels ?? []).slice(0, config.rows).forEach((value, r) => {
    label(`row-label-${r}`, -CELL * 0.3, r * CELL + CELL / 2, value, 'end');
  });

  // Nhãn cột **co lại cho vừa một ô**. Nhãn dài hơn ô thì hai nhãn cạnh nhau dính
  // vào nhau và đọc ra một chuỗi vô nghĩa — "dec=1dec=2dec=3". Không có gì báo:
  // chữ vẫn vẽ đủ, khung vẫn đúng. Chỉ nhìn mới thấy.
  (table.col_labels ?? []).slice(0, config.cols).forEach((value, c) => {
    label(
      `col-label-${c}`,
      c * CELL + CELL / 2,
      -CELL * 0.35,
      value,
      'middle',
      false,
      colLabelSize(value),
    );
  });

  if (table.show_sums) {
    const mark = table.sum_label ?? 'Σ';
    let grand = 0;

    for (let r = 0; r < config.rows; r += 1) {
      let sum = 0;
      for (let c = 0; c < config.cols; c += 1) if (marked(r, c)) sum += 1;
      grand += sum;
      label(`row-sum-${r}`, config.cols * CELL + CELL * 0.4, r * CELL + CELL / 2, String(sum), 'start', true);
    }

    for (let c = 0; c < config.cols; c += 1) {
      let sum = 0;
      for (let r = 0; r < config.rows; r += 1) if (marked(r, c)) sum += 1;
      label(`col-sum-${c}`, c * CELL + CELL / 2, config.rows * CELL + CELL * 0.4, String(sum), 'middle', true);
    }

    label(
      'grand-sum',
      config.cols * CELL + CELL * 0.4,
      config.rows * CELL + CELL * 0.4,
      `${mark} ${grand}`,
      'start',
      true,
    );
  }

  return nodes;
}

/**
 * BD-02 — overlay vùng khống chế cho những quân bật `show_attacks`.
 *
 * Vẽ dấu chứ không tô nền ô: nền ô đã mang `color_class`, mà ở phần lớn bài dùng
 * attack map thì màu ô **cũng** đang mang nghĩa (bàn cờ tô xen kẽ). Đè một lớp
 * nền thứ hai lên đó là cách chắc chắn để hai khẳng định khác nhau trông giống
 * nhau. Một dấu nhỏ ở tâm ô thì cộng vào, không ghi đè.
 */
function renderAttackOverlay(
  config: BoardConfig,
  elements: readonly SceneElement[],
  ctx: RenderContext,
): SvgNode[] {
  const pieces = elements.filter((e) => e.type === 'piece');
  const shown = pieces.filter((e) => e['show_attacks'] === true);
  if (shown.length === 0) return [];

  const board: AttackBoard = {
    rows: config.rows,
    cols: config.cols,
    occupied: new Set(
      pieces.map((p) => {
        const pos = p['pos'] as Offset;
        return `${pos?.[0] ?? 0},${pos?.[1] ?? 0}`;
      }),
    ),
  };

  const holes = new Set((config.holes ?? []).map(([r, c]) => `${r},${c}`));
  const marks: SvgNode[] = [];

  for (const piece of shown) {
    const pos = piece['pos'] as Offset;
    for (const cell of attackedCells(String(piece['kind']), pos, board)) {
      if (holes.has(`${cell[0]},${cell[1]}`)) continue;
      const { x, y } = cellCentre(cell);
      marks.push(
        keyed(`${piece.id}-atk-${cell[0]}-${cell[1]}`, 'circle', {
          cx: x,
          cy: y,
          r: CELL * 0.13,
          fill: ctx.theme.object.attackMark,
          opacity: ctx.theme.object.attackMarkOpacity,
        }),
      );
    }
  }

  return marks;
}

function renderElement(
  element: SceneElement,
  config: BoardConfig,
  ctx: RenderContext,
): SvgNode[] {
  switch (element.type) {
    case 'tile':
      return [
        isLatticeShape(String(element['shape']))
          ? renderLatticeTile(element, config, ctx)
          : renderTile(element, ctx),
      ];
    case 'piece':
      return [renderPiece(element, config, ctx)];
    case 'region':
      return [renderRegion(element, config, ctx)];
    default:
      return [];
  }
}

/**
 * Tile vẽ trong toạ độ **cục bộ** rồi đặt bằng `transform="translate(x,y)"`.
 *
 * Đây là điều kiện để quân trượt mượt sang ô mới: nội suy một phép tịnh tiến duy
 * nhất, thay vì nội suy toạ độ của từng ô con và đường bao (`d` của path không
 * nội suy được). Xem `lerpStructuredString` ở packages/render.
 */
function renderTile(element: SceneElement, ctx: RenderContext): SvgNode {
  const pos = element['pos'] as Offset;
  const offsets = tileOffsets(
    String(element['shape']),
    Number(element['rot'] ?? 0),
    Boolean(element['flip']),
    element['offsets'] as Offset[] | undefined,
  );

  const fill =
    element.color_class === undefined
      ? ctx.theme.object.tile
      : fillForClass(ctx, element.color_class);

  const cells = offsets.map(([dr, dc]) =>
    el('rect', {
      x: dc * CELL,
      y: dr * CELL,
      width: CELL,
      height: CELL,
      fill,
      // Quân che ô nhưng không xoá ô: màu bên dưới vẫn đọc được. Với dạng bài
      // tiling thì đó không phải chuyện thẩm mỹ — cả lập luận nằm ở chỗ "quân
      // này phủ một ô mỗi màu", mà quân đục thì người đọc không kiểm được.
      'fill-opacity': ctx.theme.object.tileOpacity,
    }),
  );

  const outline = el('path', {
    d: outlinePath(offsets),
    fill: 'none',
    stroke: ctx.theme.object.tileStroke,
    'stroke-width': ctx.theme.stroke.base,
    'stroke-linecap': 'square',
    ...elementDecoration(ctx, element),
  });

  return keyed(
    element.id,
    'g',
    {
      transform: translate((pos?.[1] ?? 0) * CELL, (pos?.[0] ?? 0) * CELL),
      ...groupAttrs(ctx, element),
    },
    [...cells, outline],
  );
}

/**
 * Quân trên lưới phi vuông vẽ bằng toạ độ **tuyệt đối**, không tịnh tiến (BD-09).
 *
 * Đây không phải đường tắt — nó là hệ quả của hình học. Polyomino giữ nguyên hình
 * khi dời chỗ, nên vẽ một lần trong toạ độ cục bộ rồi `translate` là đúng, và nhờ
 * vậy quân **trượt** mượt sang ô mới. Hình thoi thì không: dời nó từ một tam giác
 * hướng lên sang một tam giác hướng xuống là **lật** nó, chứ không phải dời. Không
 * có phép tịnh tiến nào để nội suy, nên vờ có một cái sẽ cho ra animation trong đó
 * quân đi qua những vị trí không tồn tại trên lưới.
 *
 * Giá phải trả, ghi ra để không ai tưởng là quên: quân lưới **nhảy** giữa hai
 * step thay vì trượt. Đổi lại, mọi khung hình đều là một thế hợp lệ.
 */
function renderLatticeTile(
  element: SceneElement,
  config: BoardConfig,
  ctx: RenderContext,
): SvgNode {
  const lattice = latticeOf(config);
  const cells = tileCells(element, lattice, {
    rows: config.rows,
    cols: config.cols,
    wrap: wrapOf(config),
  });

  const fill =
    element.color_class === undefined
      ? ctx.theme.object.tile
      : fillForClass(ctx, element.color_class);

  const faces = cells.map(([r, c]) =>
    el('polygon', {
      points: cellPolygon(lattice, config.rows, config.cols, r, c)
        .map((p) => `${round(p.x)},${round(p.y)}`)
        .join(' '),
      fill,
      // Cùng lý do với polyomino: quân che ô nhưng không xoá ô, vì cả lập luận của
      // dạng tiling nằm ở chỗ "quân này phủ một ô mỗi màu".
      'fill-opacity': ctx.theme.object.tileOpacity,
    }),
  );

  return keyed(element.id, 'g', groupAttrs(ctx, element), [
    ...faces,
    el('path', {
      d: outlineOfCells(lattice, config.rows, config.cols, cells),
      fill: 'none',
      stroke: ctx.theme.object.tileStroke,
      'stroke-width': ctx.theme.stroke.base,
      // Đầu nét tròn: góc nhọn của tam giác làm nét vuông thò ra thành gai — cùng
      // chuyện đã gặp ở region.
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      ...elementDecoration(ctx, element),
    }),
  ]);
}

function renderPiece(
  element: SceneElement,
  config: BoardConfig,
  ctx: RenderContext,
): SvgNode {
  const pos = element['pos'] as Offset;
  const glyph =
    element['kind'] === 'custom'
      ? String(element['glyph'] ?? '?')
      : PIECE_GLYPHS[String(element['kind'])] ?? '?';

  const fill =
    element.color_class === undefined
      ? ctx.theme.object.piece
      : fillForClass(ctx, element.color_class);

  // Quân đặt ở **tâm ô**, và tâm ô là thứ `lattice.ts` biết. Trên lưới vuông,
  // `translate` tới góc trên trái rồi vẽ ở `CELL/2` cho ra đúng chuỗi transform
  // như trước — golden của hai mươi bài không đổi.
  const lattice = latticeOf(config);
  const centre = centreOf(lattice, config.rows, config.cols, pos?.[0] ?? 0, pos?.[1] ?? 0);
  const origin =
    lattice === 'square'
      ? { x: (pos?.[1] ?? 0) * CELL, y: (pos?.[0] ?? 0) * CELL }
      : { x: round(centre.x - CELL / 2), y: round(centre.y - CELL / 2) };

  return keyed(
    element.id,
    'g',
    {
      transform: translate(origin.x, origin.y),
      ...groupAttrs(ctx, element),
    },
    [
      el('circle', {
        cx: CELL / 2,
        cy: CELL / 2,
        r: CELL * 0.36,
        fill,
        stroke: ctx.theme.object.pieceStroke,
        'stroke-width': ctx.theme.stroke.base,
        ...elementDecoration(ctx, element),
      }),
      text(
        'text',
        {
          x: CELL / 2,
          y: CELL / 2,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': ctx.theme.type.uiFamily,
          'font-size': CELL * 0.45,
          fill: inkForClass(ctx, element.color_class),
        },
        glyph,
      ),
    ],
  );
}

function renderRegion(
  element: SceneElement,
  config: BoardConfig,
  ctx: RenderContext,
): SvgNode {
  const cells = (element['cells'] as Offset[] | undefined) ?? [];
  const lattice = latticeOf(config);
  return keyed(
    element.id,
    'g',
    groupAttrs(ctx, element),
    [
      el('path', {
        d:
          lattice === 'square'
            ? outlinePathAbsolute(cells)
            : outlineOfCells(lattice, config.rows, config.cols, cells),
        fill: 'none',
        stroke: ctx.theme.object.regionStroke,
        'stroke-width': ctx.theme.stroke.region,
        // Đầu nét vuông trên lưới vuông thì lấp đúng góc; trên lưới tam giác góc
        // nhọn nên nó thò ra thành mấy cái gai ở mỗi đỉnh. Chỉ thấy khi nhìn hình.
        'stroke-linecap': lattice === 'square' ? 'square' : 'round',
        ...elementDecoration(ctx, element),
      }),
      ...regionLabel(element, config, ctx, cells),
    ],
  );
}

/** Cỡ chữ nhãn vùng — nhỏ hơn nhãn hàng/cột, vì nó là chú thích chứ không phải dữ liệu. */
const REGION_LABEL_SIZE = CELL * 0.34;

/**
 * Tên của một vùng, vẽ **ngay trên** mép trên của nó.
 *
 * Trường `label` có trong schema từ lúc dựng `region` và **chưa bao giờ được
 * vẽ**: `renderRegion` chỉ dựng đường bao, không lớp nào khác đọc tới nó, và
 * lượt rà trước freeze đo được đúng thế — SVG của `pascal-two-proofs` có glyph
 * `10` và `data-el="target"` nhưng không có `C(5,2)` ở đâu cả. Ba nhãn ấy là dữ
 * liệu chết, và một trường chết trong file bài thì tệ hơn một trường vắng mặt:
 * tác giả khai nó, tin là nó hiện ra, rồi không ai thấy gì.
 *
 * Đặt **ngoài** đường bao chứ không trong: vùng một ô là ca thường gặp nhất, và ở
 * đó bên trong đã có glyph của chính ô ấy — viết đè lên là giấu đi con số mà cả
 * bài đang nói tới.
 *
 * Và đặt đúng trên **ranh giới hai hàng**, không lửng giữa hàng trên. Vùng thường
 * nằm giữa bàn: lửng giữa thì nhãn đâm thẳng vào glyph của hàng trên (đo ở
 * `mod-addition-table`: chữ "hàng r = 2" nằm đè lên dãy số $2\,3\,4$), còn ở ranh
 * giới thì nó cách tâm glyph của **cả hai** hàng đúng nửa ô — xa nhất có thể mà
 * vẫn dính vào vùng nó chú. Nhờ đó cũng không phải nới khung: `BOARD_PADDING` sẵn
 * có đủ chỗ cho nhãn của một vùng chạm hàng $0$.
 */
function regionLabel(
  element: SceneElement,
  config: BoardConfig,
  ctx: RenderContext,
  cells: readonly Offset[],
): SvgNode[] {
  const label = element['label'];
  if (typeof label !== 'string' || label === '' || cells.length === 0) return [];

  const lattice = latticeOf(config);
  const centres = cells.map(([r, c]) => centreOf(lattice, config.rows, config.cols, r, c));
  const top = Math.min(...centres.map((p) => p.y));
  // Căn giữa theo **hàng trên cùng** của vùng, không theo cả vùng: một vùng hình
  // chữ L thì tâm của cả vùng rơi ra ngoài mép trên, và nhãn trôi khỏi chỗ nó chú.
  const xs = centres.filter((p) => p.y === top).map((p) => p.x);
  const x = (Math.min(...xs) + Math.max(...xs)) / 2;

  return [
    {
      ...text(
        'text',
        {
          x: round(x),
          y: round(top - CELL * 0.5),
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': ctx.theme.type.uiFamily,
          'font-size': REGION_LABEL_SIZE,
          fill: ctx.theme.surface.guide,
          // Quầng nền quanh chữ, cùng mẹo `paint-order` mà mũi tên của engine đồ
          // thị dùng. Vùng thường nằm **giữa** bàn, nên mép trên của nó là mép
          // dưới của một hàng ô đầy quân: không có quầng thì nhãn xám nằm chồng
          // lên glyph đen và không còn đọc được chữ nào. Thấy ngay ở lượt nhìn
          // đầu tiên, trên đúng bài `bishop-keeps-colour`.
          stroke: ctx.theme.surface.canvas,
          'stroke-width': REGION_LABEL_SIZE * 0.4,
          'stroke-linejoin': 'round',
          'paint-order': 'stroke',
        },
        label,
      ),
      key: `${element.id}__label`,
    },
  ];
}

/** Region dùng toạ độ tuyệt đối trên bàn, không tịnh tiến như tile. */
function outlinePathAbsolute(cells: readonly Offset[]): string {
  if (cells.length === 0) return '';
  const minR = Math.min(...cells.map(([r]) => r));
  const minC = Math.min(...cells.map(([, c]) => c));
  const local = cells.map(([r, c]) => [r - minR, c - minC] as Offset);
  const path = outlinePath(local);
  return shiftPath(path, minC * CELL, minR * CELL);
}

function shiftPath(path: string, dx: number, dy: number): string {
  return path.replace(
    /([ML])(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g,
    (_full, command: string, x: string, y: string) =>
      `${command}${Number(x) + dx} ${Number(y) + dy}`,
  );
}

function translate(x: number, y: number): string {
  return `translate(${x} ${y})`;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000 + 0;
}

/**
 * Ký tự quân cờ Unicode.
 *
 * Ghi nhận giới hạn: render headless (REN-01/02) sẽ cần nhúng phông có các ký tự
 * này, nếu không quân cờ biến mất khỏi OG card trong khi trên player vẫn hiện —
 * đúng loại sai lệch mà D-03 sinh ra để tránh. Xử lý ở M6 cùng label atlas (D-07).
 */
const PIECE_GLYPHS: Readonly<Record<string, string>> = {
  king: '♚',
  queen: '♛',
  rook: '♜',
  bishop: '♝',
  knight: '♞',
  pawn: '♟',
};
