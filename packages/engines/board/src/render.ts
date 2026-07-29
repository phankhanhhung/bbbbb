import type { Scene, SceneElement, Viewport } from '@combviz/schema';
import {
  decorationAttrs,
  el,
  elementDecoration,
  fillForClass,
  groupAttrs,
  inkForClass,
  keyed,
  text,
  type EngineRenderer,
  type RenderContext,
  type SvgNode,
} from '@combviz/render';
import {
  BOARD_PADDING,
  CELL,
  cellColorClass,
  outlinePath,
  tileOffsets,
  type Offset,
} from './geometry.js';
import { cellId } from './ids.js';
import { attackedCells, cellCentre, type AttackBoard } from './attacks.js';
import type { BoardConfig } from './schema.js';

/**
 * Renderer của Grid/Board engine.
 *
 * Hàm thuần: `Scene → SvgNode[]`, không đụng DOM, không đọc giờ, không random.
 * Cùng hàm này chạy trong Player, trong golden test, và trong Node khi build OG
 * card — nên thứ người học thấy và thứ xuất bản ra không thể lệch nhau.
 */
export const boardRenderer: EngineRenderer = {
  id: 'board',

  defaultViewport(scene: Scene): Viewport {
    const config = scene.config as BoardConfig;
    const rows = config?.rows ?? 1;
    const cols = config?.cols ?? 1;

    // Bảng (PRN-03) mọc thêm nhãn ở lề trái/trên và dòng tổng ở lề phải/dưới;
    // quên chừa chỗ thì nhãn bị cắt đúng như nhãn đỉnh đồ thị từng bị.
    const table = config?.table;
    const left = table?.row_labels ? CELL * 1.4 : 0;
    const top = table?.col_labels ? CELL * 0.9 : 0;
    const right = table?.show_sums ? CELL * 1.1 : 0;
    const bottom = table?.show_sums ? CELL * 0.9 : 0;

    return {
      x: -BOARD_PADDING - left,
      y: -BOARD_PADDING - top,
      width: cols * CELL + BOARD_PADDING * 2 + left + right,
      height: rows * CELL + BOARD_PADDING * 2 + top + bottom,
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

    return [
      el('g', { class: 'cv-cells' }, renderCells(config, ctx)),
      ...(config.table ? [el('g', { class: 'cv-table' }, renderTable(config, ctx))] : []),
      ...(attacks.length > 0 ? [el('g', { class: 'cv-attacks' }, attacks)] : []),
      el('g', { class: 'cv-elements' }, elements.flatMap((e) => renderElement(e, ctx))),
    ];
  },
};

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
  const nodes: SvgNode[] = [];

  for (let r = 0; r < config.rows; r += 1) {
    for (let c = 0; c < config.cols; c += 1) {
      const isHole = holes.has(`${r},${c}`);
      const colorClassIndex = isHole ? undefined : cellColorClass(config, r, c);
      const glyph = config.cell_overrides?.[cellId(r, c)]?.glyph;

      const rect = keyed(cellId(r, c), 'rect', {
        x: c * CELL,
        y: r * CELL,
        width: CELL,
        height: CELL,
        fill: isHole ? ctx.theme.surface.void : fillForClass(ctx, colorClassIndex),
        stroke: ctx.theme.surface.guide,
        'stroke-width': ctx.theme.stroke.hairline,
        ...decorationAttrs(ctx, cellId(r, c)),
      });

      nodes.push(rect);

      if (glyph) {
        nodes.push(
          text(
            'text',
            {
              x: c * CELL + CELL / 2,
              y: r * CELL + CELL / 2,
              'text-anchor': 'middle',
              'dominant-baseline': 'central',
              'font-family': ctx.theme.type.uiFamily,
              'font-size': CELL * 0.55,
              // Mực theo lớp màu của **chính ô này**: một dấu "−" trên ô lớp 8
              // vẽ bằng mực đen chung thì gần như biến mất.
              fill: inkForClass(ctx, colorClassIndex),
            },
            glyph,
          ),
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
          'font-size': CELL * (strong ? 0.42 : 0.38),
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

  (table.col_labels ?? []).slice(0, config.cols).forEach((value, c) => {
    label(`col-label-${c}`, c * CELL + CELL / 2, -CELL * 0.35, value, 'middle');
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

function renderElement(element: SceneElement, ctx: RenderContext): SvgNode[] {
  switch (element.type) {
    case 'tile':
      return [renderTile(element, ctx)];
    case 'piece':
      return [renderPiece(element, ctx)];
    case 'region':
      return [renderRegion(element, ctx)];
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

function renderPiece(element: SceneElement, ctx: RenderContext): SvgNode {
  const pos = element['pos'] as Offset;
  const glyph =
    element['kind'] === 'custom'
      ? String(element['glyph'] ?? '?')
      : PIECE_GLYPHS[String(element['kind'])] ?? '?';

  const fill =
    element.color_class === undefined
      ? ctx.theme.object.piece
      : fillForClass(ctx, element.color_class);

  return keyed(
    element.id,
    'g',
    {
      transform: translate((pos?.[1] ?? 0) * CELL, (pos?.[0] ?? 0) * CELL),
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

function renderRegion(element: SceneElement, ctx: RenderContext): SvgNode {
  const cells = (element['cells'] as Offset[] | undefined) ?? [];
  return keyed(
    element.id,
    'g',
    groupAttrs(ctx, element),
    [
      el('path', {
        d: outlinePathAbsolute(cells),
        fill: 'none',
        stroke: ctx.theme.object.regionStroke,
        'stroke-width': ctx.theme.stroke.region,
        'stroke-linecap': 'square',
        ...elementDecoration(ctx, element),
      }),
    ],
  );
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
