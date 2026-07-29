import { Resvg } from '@resvg/resvg-js';
import { describe, expect, it } from 'vitest';

/**
 * G-09 — chốt canh cho phông trong đường raster (REN-02, D-08).
 *
 * Đây là lớp lỗi tệ nhất mà pipeline này có thể mắc: máy build **thiếu phông** →
 * resvg không báo lỗi, nó chỉ **bỏ chữ đi**. Kết quả là một card 1200×630 bố cục
 * hoàn hảo, hình đẹp, và không một chữ nào — rồi nó lên Twitter.
 *
 * Test này rasterize đúng ba thứ dễ mất nhất rồi **đếm mực**: chữ Latin, dấu
 * tiếng Việt, và ký tự quân cờ Unicode. Không so ảnh, không so pixel-perfect —
 * chỉ hỏi một câu mà kiểu lỗi trên trả lời sai: có gì được vẽ ra không.
 */
function inkRatio(svg: string): number {
  const image = new Resvg(svg, {
    font: { loadSystemFonts: true },
    background: '#FFFFFF',
  }).render();

  const pixels = image.pixels;
  let inked = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    // Nền trắng đục; "có mực" = lệch đáng kể khỏi trắng ở bất kỳ kênh nào.
    if (pixels[i]! < 200 || pixels[i + 1]! < 200 || pixels[i + 2]! < 200) inked += 1;
  }
  return inked / (pixels.length / 4);
}

const svgWith = (content: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="60">` +
  `<text x="4" y="42" font-size="36" font-family="sans-serif" fill="#000000">${content}</text>` +
  `</svg>`;

describe('raster OG (G-09)', () => {
  it('máy build có phông — chữ Latin ra mực', () => {
    expect(inkRatio(svgWith('CombViz'))).toBeGreaterThan(0.01);
  });

  it('dấu tiếng Việt không bị nuốt', () => {
    // Nếu phông thiếu ký tự có dấu, "Bàn cờ" ra ít mực hơn hẳn "Ban co".
    const withTones = inkRatio(svgWith('B&#224;n c&#7901;'));
    const withoutTones = inkRatio(svgWith('Ban co'));

    expect(withTones).toBeGreaterThan(0.01);
    expect(withTones).toBeGreaterThan(withoutTones);
  });

  it('ký tự quân cờ Unicode ra mực — bàn cờ không được mất quân', () => {
    // ♞ (U+265E). Đúng ký tự mà board renderer dùng cho quân mã; thiếu nó thì
    // card của mọi bài dùng quân cờ ra một bàn trống.
    const withPiece = inkRatio(svgWith('&#9822;'));

    expect(withPiece).toBeGreaterThan(0.005);
  });

  it('SVG rỗng thì không có mực — phép đếm đang đo đúng thứ nó tưởng', () => {
    expect(inkRatio(svgWith(''))).toBe(0);
  });
});
