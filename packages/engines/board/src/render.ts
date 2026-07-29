import type { Scene, SceneElement, Viewport } from '@combviz/schema';
import {
  el,
  fillForClass,
  highlightAttrs,
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
    return {
      x: -BOARD_PADDING,
      y: -BOARD_PADDING,
      width: cols * CELL + BOARD_PADDING * 2,
      height: rows * CELL + BOARD_PADDING * 2,
    };
  },

  render(scene: Scene, ctx: RenderContext): SvgNode[] {
    const config = scene.config as BoardConfig;
    if (!config || typeof config.rows !== 'number') return [];

    const elements = [...scene.elements].sort(byLayer);

    return [
      el('g', { class: 'cv-cells' }, renderCells(config, ctx)),
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
        ...highlightAttrs(ctx, cellId(r, c)),
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
              fill: ctx.theme.object.pieceGlyph,
            },
            glyph,
          ),
        );
      }
    }
  }

  return nodes;
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
    ...decorationAttrs(element, ctx),
  });

  return keyed(
    element.id,
    'g',
    {
      transform: translate((pos?.[1] ?? 0) * CELL, (pos?.[0] ?? 0) * CELL),
      ...dimAttrs(element, ctx),
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
      ...dimAttrs(element, ctx),
    },
    [
      el('circle', {
        cx: CELL / 2,
        cy: CELL / 2,
        r: CELL * 0.36,
        fill,
        stroke: ctx.theme.object.pieceStroke,
        'stroke-width': ctx.theme.stroke.base,
        ...decorationAttrs(element, ctx),
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
          fill: ctx.theme.object.pieceGlyph,
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
    dimAttrs(element, ctx),
    [
      el('path', {
        d: outlinePathAbsolute(cells),
        fill: 'none',
        stroke: ctx.theme.object.regionStroke,
        'stroke-width': ctx.theme.stroke.region,
        'stroke-linecap': 'square',
        ...decorationAttrs(element, ctx),
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

/**
 * Phần trang trí đặt lên **nhóm**: chỉ những thuộc tính mà kế thừa là đúng.
 *
 * `opacity` trên `<g>` áp cho cả nhóm như một khối — đúng ý nghĩa của "dim".
 */
function dimAttrs(
  element: SceneElement,
  ctx: RenderContext,
): Record<string, string | number> {
  return element.emphasis === 'dim' ? { opacity: ctx.theme.emphasis.dimOpacity } : {};
}

/**
 * Phần trang trí đặt lên **hình lá**: mọi thứ dùng `stroke`.
 *
 * Highlight của anchor thắng emphasis của tác giả khi cả hai cùng có: anchor là
 * phản hồi trực tiếp với thao tác của người học ngay lúc đó, còn emphasis là
 * trạng thái nền của step.
 */
function decorationAttrs(
  element: SceneElement,
  ctx: RenderContext,
): Record<string, string | number> {
  const highlight = highlightAttrs(ctx, element.id);
  if (Object.keys(highlight).length > 0) return highlight;

  if (element.emphasis === 'focus') {
    return {
      stroke: ctx.theme.emphasis.focusHalo,
      'stroke-width': ctx.theme.emphasis.focusHaloWidth,
      'paint-order': 'stroke',
    };
  }
  return {};
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
