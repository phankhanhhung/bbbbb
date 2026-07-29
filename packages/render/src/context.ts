import { colorClass, type Theme } from '@combviz/theme';
import type { SceneElement } from '@combviz/schema';
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
  /**
   * SBX-02: id các element đang vi phạm ràng buộc.
   *
   * Cùng lý do với `highlight` — trạng thái vi phạm là **một phần của thứ được
   * vẽ**, nên nó sống sót qua animation và test được mà không cần DOM.
   */
  readonly invalid: ReadonlySet<string>;
}

export interface ContextOptions {
  readonly patterns?: boolean;
  readonly highlight?: ReadonlySet<string>;
  readonly invalid?: ReadonlySet<string>;
}

const EMPTY: ReadonlySet<string> = new Set();

export function createContext(theme: Theme, options: ContextOptions = {}): RenderContext {
  return {
    theme,
    patterns: options.patterns ?? false,
    highlight: options.highlight ?? EMPTY,
    invalid: options.invalid ?? EMPTY,
  };
}

/**
 * Trang trí đặt lên **hình lá** (rect, circle, path) — mọi thứ dùng `stroke`.
 *
 * Không bao giờ đặt lên `<g>`: `stroke` của SVG được kế thừa, nên đặt lên nhóm sẽ
 * vẽ viền quanh *từng ô con* của quân domino thay vì quanh đường bao của nó.
 *
 * Sống ở tầng render chứ không ở từng engine, vì `emphasis` là thuộc tính **lõi**
 * trong whitelist của DAT-20. Khi nó nằm rải trong từng engine, engine mới quên
 * cài là chuyện đương nhiên — và nó quên một cách im lặng: hình vẫn vẽ ra, chỉ là
 * `emphasis: "focus"` của tác giả không có tác dụng gì.
 *
 * Thứ tự ưu tiên: vi phạm → anchor → emphasis của tác giả. Vi phạm thắng vì khi
 * người học vừa trỏ vào một quân *và* quân đó đang đặt sai, thứ họ cần biết là chỗ
 * sai; anchor thắng emphasis vì anchor là phản hồi với thao tác ngay lúc đó, còn
 * emphasis là trạng thái nền của step.
 */
export function decorationAttrs(
  ctx: RenderContext,
  id: string,
  emphasis?: string,
  /**
   * Hệ số theo **độ đậm nét của engine**.
   *
   * Độ dày halo trong theme căn theo nét `base` (viền vùng tô). Engine dùng nét
   * mảnh hơn phải thu halo theo cùng tỉ lệ, nếu không một cạnh đồ thị rộng 0.42
   * sẽ đội viền 1.6 — gấp bốn lần chính nó, và cả $K_6$ biến thành mấy thanh xà
   * đen. Cách khai đúng là `stroke.link / stroke.base`: "nét của tôi mảnh hơn nét
   * tham chiếu chừng này".
   */
  weightScale = 1,
): Record<string, string | number> {
  if (ctx.invalid.has(id)) {
    return halo(
      ctx.theme.stroke.invalid,
      ctx.theme.emphasis.anchorHaloWidth * weightScale,
    );
  }
  if (ctx.highlight.has(id)) {
    return halo(
      ctx.theme.emphasis.anchorHalo,
      ctx.theme.emphasis.anchorHaloWidth * weightScale,
    );
  }
  if (emphasis === 'focus') {
    return halo(
      ctx.theme.emphasis.focusHalo,
      ctx.theme.emphasis.focusHaloWidth * weightScale,
    );
  }
  return {};
}

/** Dạng nhận thẳng element, cho engine không phải tự bóc `emphasis`. */
export function elementDecoration(
  ctx: RenderContext,
  element: SceneElement,
): Record<string, string | number> {
  return decorationAttrs(ctx, element.id, element.emphasis);
}

/**
 * Trang trí đặt lên **nhóm**: chỉ những thuộc tính mà kế thừa là đúng.
 *
 * `opacity` trên `<g>` áp cho cả nhóm như một khối — đúng nghĩa của "dim".
 */
export function groupAttrs(
  ctx: RenderContext,
  element: SceneElement,
): Record<string, string | number> {
  return element.emphasis === 'dim' ? { opacity: ctx.theme.emphasis.dimOpacity } : {};
}

function halo(stroke: string, width: number): Record<string, string | number> {
  return { stroke, 'stroke-width': width, 'paint-order': 'stroke' };
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

/**
 * Màu **chữ đặt chồng lên** một lớp màu.
 *
 * Bảng màu có sẵn token `on` cho từng lớp, đạt WCAG AA trên chính `fill` của lớp
 * đó (có test ép ở `packages/theme`). Trước hàm này không renderer nào đọc nó:
 * mọi glyph đều dùng một mực đen cố định, nên một dấu "−" trên ô lớp 8 (xám
 * than) chỉ còn 1.7:1 — chữ vẫn ở đó, chỉ là không ai đọc được.
 *
 * Ô chưa có lớp màu thì vẫn dùng mực chung: nền của nó là màu trung tính, và
 * `on` chỉ có nghĩa khi đã biết mình nằm trên cái gì.
 */
export function inkForClass(ctx: RenderContext, index: number | undefined): string {
  return index === undefined ? ctx.theme.object.pieceGlyph : colorClass(index).on;
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
