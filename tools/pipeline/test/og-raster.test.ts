import { Resvg } from '@resvg/resvg-js';
import { describe, expect, it } from 'vitest';
import { defaultTheme } from '@combviz/theme';
import { rasterize } from '../src/commands/og.js';

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

/**
 * M69 — phông **mặc định** phải là một quyết định, không phải chỗ resvg bốc bừa.
 *
 * `font-family` của chữ giao diện là `'Inter', 'Segoe UI', system-ui, sans-serif`.
 * Máy build không có ba cái đầu; nếu `defaultFontFamily` bỏ trống thì resvg lấy
 * đại một mặt trong danh sách vừa nạp — mà danh sách ấy đứng đầu bằng bộ KaTeX.
 * Hậu quả nhìn thấy trên **mọi** card: tiêu đề in nghiêng, và dòng nào chỉ có
 * ASCII (không dấu tiếng Việt để buộc rơi xuống DejaVu) in bằng `KaTeX_Fraktur`.
 * Card của `pascal-two-proofs` ngắt dòng đúng chỗ để chữ "Pascal." đứng một mình,
 * và nó hiện ra kiểu chữ gô-tích giữa một tiêu đề sans.
 *
 * Chốt canh so **byte ảnh**: chữ giao diện vẽ ra phải giống hệt như khi khai
 * thẳng phông đích. Không cần biết mặt chữ nào thắng — chỉ cần biết nó là mặt ta
 * đã chọn, chứ không phải mặt nào tình cờ đứng đầu danh sách.
 */
describe('phông mặc định của đường raster (M69)', () => {
  const png = (family: string, content: string): Buffer =>
    rasterize(
      `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="60">` +
        `<text x="4" y="42" font-size="34" font-family="${family}" fill="#000000">${content}</text>` +
        `</svg>`,
    );

  const UI = defaultTheme.type.uiFamily.replace(/'/g, '&apos;');

  it('chữ chỉ có ASCII vẽ ra bằng đúng phông đã chọn, không phải Fraktur', () => {
    expect(png(UI, 'Pascal.').equals(png('DejaVu Sans', 'Pascal.'))).toBe(true);
  });

  it('…và chữ có dấu tiếng Việt cũng vậy — cùng một mặt chữ cho cả tiêu đề', () => {
    // Trước lượt này hai dòng của cùng một tiêu đề ra hai mặt khác nhau: dòng có
    // dấu rơi xuống DejaVu, dòng ASCII ở lại Fraktur.
    expect(png(UI, 'tam giác').equals(png('DejaVu Sans', 'tam giác'))).toBe(true);
  });
});
