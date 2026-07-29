/**
 * Bảng màu ngữ nghĩa cho `color_class` (DAT-20, NFR-A1).
 *
 * Nguồn: Okabe–Ito color-blind-safe palette. Thứ tự ở đây **không** phải thứ tự
 * gốc của Okabe–Ito: nó được sắp lại có chủ đích cho tổ hợp.
 *
 * Lập luận tô hai màu (bàn cờ, đồ thị hai phía) là dạng bài xuất hiện nhiều nhất
 * trong kho, nên class 1 và class 2 phải đọc được như cặp "đậm / nhạt" ngay cả
 * với người mất hoàn toàn cảm nhận màu — vì vậy class 1 = xanh đậm, class 2 =
 * xanh nhạt: hai màu này khác nhau về **độ sáng**, không chỉ về sắc.
 *
 * Style Guide (AUT-10) chốt phần ngữ nghĩa: trong lập luận tô màu, class 1 luôn
 * đóng vai "ô đen".
 *
 * Mỗi class có `pattern` dự phòng, bật được toàn cục (NFR-A1) — màu không bao giờ
 * là kênh thông tin duy nhất.
 */

export const MAX_COLOR_CLASS = 8;

export interface ColorClassToken {
  /** Giá trị color_class trong file problem (1..8). */
  readonly index: number;
  /** Mã màu hiển thị. */
  readonly fill: string;
  /** Màu nét viền, đủ tương phản trên chính `fill`. */
  readonly stroke: string;
  /** Màu chữ/nhãn đặt chồng lên `fill` (đạt WCAG AA với cỡ chữ nhãn). */
  readonly on: string;
  /** Kênh dự phòng không phụ thuộc màu (NFR-A1). */
  readonly pattern: PatternId;
  /** Tên gọi trong Style Guide và thông báo lỗi. */
  readonly name: string;
}

export type PatternId =
  | 'solid'
  | 'diagonal-right'
  | 'diagonal-left'
  | 'dots'
  | 'grid'
  | 'horizontal'
  | 'vertical'
  | 'crosshatch';

export const COLOR_CLASSES: readonly ColorClassToken[] = [
  { index: 1, fill: '#0072B2', stroke: '#00456B', on: '#FFFFFF', pattern: 'solid', name: 'xanh đậm' },
  { index: 2, fill: '#9ED9F5', stroke: '#3E8BB5', on: '#0B2027', pattern: 'diagonal-right', name: 'xanh nhạt' },
  { index: 3, fill: '#D55E00', stroke: '#8A3D00', on: '#FFFFFF', pattern: 'diagonal-left', name: 'cam đất' },
  { index: 4, fill: '#009E73', stroke: '#006147', on: '#FFFFFF', pattern: 'dots', name: 'lục' },
  { index: 5, fill: '#E69F00', stroke: '#9A6B00', on: '#1A1200', pattern: 'grid', name: 'hổ phách' },
  { index: 6, fill: '#CC79A7', stroke: '#8A4E70', on: '#1A0A14', pattern: 'horizontal', name: 'hồng tía' },
  { index: 7, fill: '#F0E442', stroke: '#9C9400', on: '#1A1900', pattern: 'vertical', name: 'vàng' },
  { index: 8, fill: '#3A3A3A', stroke: '#000000', on: '#FFFFFF', pattern: 'crosshatch', name: 'xám than' },
] as const;

export function colorClass(index: number): ColorClassToken {
  const token = COLOR_CLASSES[index - 1];
  if (!token) {
    throw new RangeError(
      `color_class ${index} nằm ngoài khoảng 1..${MAX_COLOR_CLASS}`,
    );
  }
  return token;
}
