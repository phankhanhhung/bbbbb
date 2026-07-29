import { colorClass, type Theme } from '@combviz/theme';
import { el, type SvgNode } from './svg-node.js';

/**
 * Ngữ cảnh vẽ truyền xuống engine renderer.
 *
 * Engine nhận theme qua tham số chứ không đọc biến toàn cục — đó là điều kiện để
 * cùng một renderer chạy được trong player, trong test golden, và trong Node khi
 * build OG card với theme có thể khác (khổ khác, nền khác).
 */
export interface RenderContext {
  readonly theme: Theme;
  /**
   * NFR-A1: bật kênh dự phòng pattern cho người mù màu.
   *
   * Khi bật, ô được tô bằng `url(#…)` thay vì mã màu, nên chuyển màu giữa hai
   * step **chuyển dứt khoát** thay vì nội suy — pattern không lerp được. Đây là
   * đánh đổi có ý thức: đọc được quan trọng hơn mượt.
   */
  readonly patterns: boolean;
  /**
   * ANC-01: id các element đang được anchor trỏ tới.
   *
   * Highlight là **một phần của thứ được vẽ**, không phải một lớp DOM chồng lên
   * sau. Nếu để Player tự sửa thuộc tính sau khi patch xong, hai nguồn sự thật sẽ
   * đánh nhau: animation ghi đè highlight, rồi highlight ghi đè lại, và không ai
   * khôi phục được giá trị gốc. Đưa vào đây thì renderer vẫn thuần, highlight
   * test được, và nó sống sót qua mọi khung animation.
   */
  readonly highlight: ReadonlySet<string>;
}

export interface ContextOptions {
  readonly patterns?: boolean;
  readonly highlight?: ReadonlySet<string>;
}

const NO_HIGHLIGHT: ReadonlySet<string> = new Set();

export function createContext(theme: Theme, options: ContextOptions = {}): RenderContext {
  return {
    theme,
    patterns: options.patterns ?? false,
    highlight: options.highlight ?? NO_HIGHLIGHT,
  };
}

/**
 * Viền highlight cho element đang được anchor trỏ tới.
 *
 * **Chỉ đặt lên hình lá** (rect, circle, path), không bao giờ lên `<g>`: thuộc
 * tính `stroke` của SVG được kế thừa, nên đặt lên nhóm sẽ vẽ viền quanh *từng ô
 * con* của quân domino thay vì quanh đường bao của nó — quân trông thành cái
 * khung có gạch giữa. Cùng lý do áp cho `emphasis: "focus"`.
 */
export function highlightAttrs(
  ctx: RenderContext,
  id: string,
): Record<string, string | number> {
  if (!ctx.highlight.has(id)) return {};
  return {
    stroke: ctx.theme.emphasis.anchorHalo,
    'stroke-width': ctx.theme.emphasis.anchorHaloWidth,
    'paint-order': 'stroke',
  };
}

/** Mã tô cho một `color_class`, tôn trọng chế độ pattern. */
export function fillForClass(ctx: RenderContext, index: number | undefined): string {
  if (index === undefined) return ctx.theme.surface.neutral;
  const token = colorClass(index);
  return ctx.patterns ? `url(#${patternId(index)})` : token.fill;
}

export function strokeForClass(ctx: RenderContext, index: number | undefined): string {
  return index === undefined ? ctx.theme.surface.guide : colorClass(index).stroke;
}

export function patternId(index: number): string {
  return `cv-pat-${index}`;
}

const TILE = 8;

/**
 * `<defs>` chứa pattern cho từng color_class.
 *
 * Mỗi pattern tự mang nền màu của lớp đó, nên một ô vẫn chỉ là một node dù có bật
 * pattern hay không — số node không đổi theo chế độ hiển thị, và ngân sách của
 * NFR-P1 không phụ thuộc vào việc người học có bật kênh dự phòng hay không.
 */
export function patternDefs(theme: Theme): SvgNode {
  const patterns = theme.colorClasses.map((token) => {
    const marks = patternMarks(token.pattern, token.stroke);
    return el(
      'pattern',
      {
        id: patternId(token.index),
        width: TILE,
        height: TILE,
        patternUnits: 'userSpaceOnUse',
      },
      [el('rect', { width: TILE, height: TILE, fill: token.fill }), ...marks],
    );
  });

  return el('defs', {}, patterns);
}

function patternMarks(pattern: string, stroke: string): SvgNode[] {
  const line = (x1: number, y1: number, x2: number, y2: number): SvgNode =>
    el('line', { x1, y1, x2, y2, stroke, 'stroke-width': 1.2 });

  switch (pattern) {
    case 'diagonal-right':
      return [line(0, TILE, TILE, 0), line(-1, 1, 1, -1), line(TILE - 1, TILE + 1, TILE + 1, TILE - 1)];
    case 'diagonal-left':
      return [line(0, 0, TILE, TILE), line(-1, TILE - 1, 1, TILE + 1), line(TILE - 1, -1, TILE + 1, 1)];
    case 'horizontal':
      return [line(0, TILE / 2, TILE, TILE / 2)];
    case 'vertical':
      return [line(TILE / 2, 0, TILE / 2, TILE)];
    case 'grid':
      return [line(0, TILE / 2, TILE, TILE / 2), line(TILE / 2, 0, TILE / 2, TILE)];
    case 'crosshatch':
      return [line(0, 0, TILE, TILE), line(0, TILE, TILE, 0)];
    case 'dots':
      return [el('circle', { cx: TILE / 2, cy: TILE / 2, r: 1.4, fill: stroke })];
    case 'solid':
    default:
      return [];
  }
}
