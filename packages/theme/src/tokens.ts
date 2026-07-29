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
  /** Nền vùng ngoài bàn / ô khuyết. */
  readonly void: string;
  /** Lưới phụ trợ. */
  readonly guide: string;
  /** Nền báo vi phạm validator (SBX-02). */
  readonly invalid: string;
}

export interface StrokeTokens {
  readonly hairline: number;
  readonly base: number;
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
    void: '#D8D8D2',
    guide: '#C4C4BD',
    invalid: '#FCE8E6',
  },
  stroke: {
    hairline: 0.5,
    base: 1.5,
    emphasis: 3,
    region: 4,
    invalid: '#C5221F',
  },
  emphasis: {
    focusScale: 1.08,
    focusHalo: '#1A1A1A',
    focusHaloWidth: 3,
    dimOpacity: 0.28,
    anchorHalo: '#E8B004',
    anchorHaloWidth: 4,
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
