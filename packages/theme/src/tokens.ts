/**
 * Nguồn brand visual duy nhất của toàn kho (DAT-20, §14).
 *
 * File problem không chứa màu / phông / kích thước. Mọi giá trị hiển thị đến từ
 * đây, nên đổi nhận diện = sửa file này, cả kho đổi theo và không bài nào lệch
 * được. Renderer nhận theme làm tham số, không đọc biến toàn cục.
 */

import { COLOR_CLASSES, type ColorClassToken } from './palette.js';

export interface Theme {
  readonly id: string;
  readonly colorClasses: readonly ColorClassToken[];
  readonly surface: SurfaceTokens;
  readonly object: ObjectTokens;
  readonly stroke: StrokeTokens;
  readonly emphasis: EmphasisTokens;
  readonly type: TypeTokens;
  readonly motion: MotionTokens;
  readonly brand: BrandTokens;
}

export interface SurfaceTokens {
  /** Nền canvas. */
  readonly canvas: string;
  /** Nền phần tử chưa được gán color_class. */
  readonly neutral: string;
  /**
   * Ô đã bị khoét.
   *
   * Phải **nhạt hơn** ô thường, không đậm hơn: đậm hơn thì mắt đọc thành "ô được
   * nhấn mạnh", còn nhạt bằng nền thì đọc thành "chỗ trống" — mà chỗ trống mới
   * là nghĩa đúng. Ô khuyết vẫn là element có id và vẫn trỏ tới được bằng anchor.
   */
  readonly void: string;
  /** Lưới phụ trợ. */
  readonly guide: string;
  /** Nền báo vi phạm validator (SBX-02). */
  readonly invalid: string;
}

/**
 * Màu của **vật thể đặt lên** bàn (quân, tile), phân biệt với màu *ngữ nghĩa* của
 * ô.
 *
 * Tách riêng vì chúng thuộc hai hệ khác nhau: `color_class` mang ý nghĩa toán học
 * mà lời giải lập luận trên đó ("ô đen", "ô trắng"), còn quân domino thì mặc định
 * không mang màu ngữ nghĩa nào — nó chỉ là vật che ô. Bài nào cần domino mang
 * nghĩa thì gán `color_class` cho nó, và khi đó nó dùng bảng màu ngữ nghĩa.
 */
export interface ObjectTokens {
  readonly tile: string;
  readonly tileStroke: string;
  /** Quân che ô nhưng để lọt màu ô bên dưới — xem chú thích ở board renderer. */
  readonly tileOpacity: number;
  readonly piece: string;
  readonly pieceStroke: string;
  readonly pieceGlyph: string;
  readonly regionStroke: string;
}

/**
 * Độ dày nét, tính bằng **đơn vị scene**, không phải pixel.
 *
 * Quy ước bắt buộc với mọi engine: **một ô bàn cờ / một khoảng cách đỉnh chuẩn =
 * 10 đơn vị scene**. Không có quy ước này thì cùng một token cho ra nét mảnh ở
 * engine dùng lưới lớn và nét bè ở engine dùng lưới nhỏ — và vì theme là nguồn
 * brand duy nhất (DAT-20), sai lệch đó không sửa được ở từng bài.
 *
 * Engine mới phải chọn tỉ lệ toạ độ theo quy ước này, không phải ngược lại.
 */
export interface StrokeTokens {
  readonly hairline: number;
  /** Viền của một **vùng được tô**: phải đủ dày để tách vùng khỏi nền. */
  readonly base: number;
  /**
   * Nét mà **bản thân nó là vật thể**: cạnh đồ thị, đoạn thẳng.
   *
   * Mảnh hơn `base` nhiều, và đó không phải chuyện thẩm mỹ. Viền của một ô cần
   * dày vì nó cạnh tranh với mảng màu bên trong; còn cạnh đồ thị thì độ dày là
   * tuỳ ý, và $K_6$ vẽ bằng nét `base` biến thành một cục đen không đọc được.
   */
  readonly link: number;
  readonly emphasis: number;
  /** Viền `region` — nhóm ô có viền đậm (§5.2). */
  readonly region: number;
  readonly invalid: string;
}

export interface EmphasisTokens {
  /** `emphasis: "focus"` — nhấn mạnh phần tử. */
  readonly focusScale: number;
  readonly focusHalo: string;
  readonly focusHaloWidth: number;
  /** `emphasis: "dim"` — đẩy phần tử ra nền. */
  readonly dimOpacity: number;
  /** Highlight do anchor (ANC-01), khác với emphasis do tác giả đặt. */
  readonly anchorHalo: string;
  readonly anchorHaloWidth: number;
}

export interface TypeTokens {
  readonly uiFamily: string;
  readonly mathFamily: string;
  readonly labelSize: number;
  readonly badgeSize: number;
}

export interface MotionTokens {
  /** PLY-04: mặc định ≤ 400ms. */
  readonly stepDurationMs: number;
  readonly viewportDurationMs: number;
  /** Tên easing, ánh xạ sang hàm thuần trong packages/render (D-05). */
  readonly easing: 'ease-in-out-cubic';
}

export interface BrandTokens {
  readonly name: string;
  readonly wordmark: string;
  /** REN-03: watermark trên mọi export từ Sandbox. */
  readonly watermarkOpacity: number;
  /** REN-02: khung OG card. */
  readonly ogWidth: number;
  readonly ogHeight: number;
}

export const defaultTheme: Theme = {
  id: 'combviz-default',
  colorClasses: COLOR_CLASSES,
  surface: {
    canvas: '#FDFDFC',
    neutral: '#EDEDEA',
    void: '#FDFDFC',
    guide: '#C4C4BD',
    invalid: '#FCE8E6',
  },
  object: {
    tile: '#5B5B54',
    tileStroke: '#2A2A26',
    tileOpacity: 0.62,
    piece: '#FAFAF8',
    pieceStroke: '#2A2A26',
    pieceGlyph: '#1A1A17',
    regionStroke: '#2A2A26',
  },
  stroke: {
    hairline: 0.4,
    base: 1.2,
    link: 0.42,
    emphasis: 1.6,
    region: 1.8,
    invalid: '#C5221F',
  },
  emphasis: {
    focusScale: 1.08,
    focusHalo: '#1A1A1A',
    focusHaloWidth: 1.6,
    dimOpacity: 0.28,
    anchorHalo: '#E8B004',
    anchorHaloWidth: 2,
  },
  type: {
    uiFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
    mathFamily: "'KaTeX_Main', 'Latin Modern Math', serif",
    labelSize: 14,
    badgeSize: 11,
  },
  motion: {
    stepDurationMs: 360,
    viewportDurationMs: 420,
    easing: 'ease-in-out-cubic',
  },
  brand: {
    name: 'CombViz',
    wordmark: 'CombViz',
    watermarkOpacity: 0.32,
    ogWidth: 1200,
    ogHeight: 630,
  },
};
