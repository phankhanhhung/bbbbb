import { describe, expect, it } from 'vitest';
import { COLOR_CLASSES, MAX_COLOR_CLASS, colorClass } from '../src/palette.js';
import { defaultTheme } from '../src/tokens.js';

/**
 * NFR-A1 — palette color-blind-safe, kiểm bằng máy chứ không bằng lời hứa.
 *
 * Bảng màu hiện tại **tuyên bố** là Okabe–Ito và tuyên bố class 1/2 đọc được khi
 * mất hoàn toàn cảm nhận màu. Cho tới file này, cả hai tuyên bố đó chỉ nằm trong
 * comment. Một tuyên bố a11y không có test là một tuyên bố sẽ âm thầm sai vào
 * lần đầu có người "chỉ chỉnh màu cho đẹp hơn tí".
 *
 * Ba thứ được ép ở đây, và chúng độc lập nhau:
 *   1. Chữ trên nền màu đạt WCAG AA (4.5:1) — người mắt thường cũng cần.
 *   2. Cặp 1–2 khác nhau đủ nhiều về **độ sáng**, không chỉ về sắc — đây là điều
 *      giữ cho mọi bài tô hai màu còn đọc được khi in đen trắng hoặc khi người
 *      xem mù màu hoàn toàn.
 *   3. Mọi class có pattern **khác nhau** — kênh dự phòng không phụ thuộc màu.
 */

/** Độ chói tương đối theo WCAG 2.1. */
function luminance(hex: string): number {
  const channel = (value: number): number => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };

  const int = Number.parseInt(hex.replace('#', ''), 16);
  const r = channel((int >> 16) & 0xff);
  const g = channel((int >> 8) & 0xff);
  const b = channel(int & 0xff);

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe('NFR-A1 — bảng màu ngữ nghĩa', () => {
  it('chữ đặt trên mỗi lớp màu đạt WCAG AA', () => {
    for (const token of COLOR_CLASSES) {
      const ratio = contrast(token.on, token.fill);
      expect(
        ratio,
        `class ${token.index} (${token.name}): ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('viền của mỗi lớp phân biệt được với chính nền của nó', () => {
    // Viền tồn tại để tách hai ô cùng màu nằm cạnh nhau; viền chìm vào nền thì
    // lưới biến mất và bàn cờ thành một mảng màu.
    for (const token of COLOR_CLASSES) {
      expect(contrast(token.stroke, token.fill), `class ${token.index}`).toBeGreaterThan(1.6);
    }
  });

  it('cặp 1–2 khác nhau về độ sáng, không chỉ về sắc', () => {
    // Đây là cặp dùng trong **mọi** lập luận tô hai màu của kho. Nếu chúng chỉ
    // khác sắc, người mù màu hoàn toàn sẽ thấy một bàn cờ trơn.
    const ratio = contrast(colorClass(1).fill, colorClass(2).fill);
    expect(ratio).toBeGreaterThanOrEqual(3);
  });

  it('mọi lớp có ranh giới đọc được trên nền canvas — bằng nền hoặc bằng viền', () => {
    // Vàng Okabe–Ito (#F0E442) chỉ hơn nền canvas 1.30:1. Không đổi nó: đổi thì
    // mất luôn xuất xứ color-blind-safe của cả bảng, đắt hơn nhiều so với vấn đề.
    // Thứ thật sự bảo vệ người xem ở đây là **viền**, nên test hỏi đúng điều đó:
    // hoặc nền đủ tách, hoặc viền đủ tách. Cả hai cùng yếu mới là lỗi.
    for (const token of COLOR_CLASSES) {
      const byFill = contrast(token.fill, defaultTheme.surface.canvas);
      const byStroke = contrast(token.stroke, defaultTheme.surface.canvas);
      expect(
        Math.max(byFill, byStroke),
        `class ${token.index}: nền ${byFill.toFixed(2)}:1, viền ${byStroke.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it('mỗi lớp có một pattern riêng — kênh dự phòng không phụ thuộc màu', () => {
    const patterns = COLOR_CLASSES.map((t) => t.pattern);
    expect(new Set(patterns).size).toBe(patterns.length);
  });

  it('đủ 8 lớp, đánh số liên tục từ 1', () => {
    expect(COLOR_CLASSES).toHaveLength(MAX_COLOR_CLASS);
    expect(COLOR_CLASSES.map((t) => t.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('`colorClass` từ chối chỉ số ngoài khoảng thay vì trả về undefined', () => {
    // Trả undefined thì lỗi hiện ra ở tận renderer dưới dạng `fill="undefined"`.
    expect(() => colorClass(0)).toThrow(RangeError);
    expect(() => colorClass(MAX_COLOR_CLASS + 1)).toThrow(RangeError);
  });
});

describe('NFR-A4 — chuyển động khai báo được, không hằng số rải rác', () => {
  it('theme khai thời lượng chuyển cảnh ở một chỗ', () => {
    expect(defaultTheme.motion.stepDurationMs).toBeGreaterThan(0);
    expect(defaultTheme.motion.viewportDurationMs).toBeGreaterThan(0);
  });
});
