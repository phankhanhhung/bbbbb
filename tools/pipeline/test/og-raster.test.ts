import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { describe, expect, it } from 'vitest';
import { defaultTheme } from '@combviz/theme';
import { rasterize } from '../src/commands/og.js';
import { fontOptions, uiFontFiles } from '../src/fonts.js';

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
/**
 * Đo bằng **đúng cấu hình phông mà pipeline dùng thật** (`fontOptions()`), không
 * phải một `loadSystemFonts: true` gõ tay ở đây.
 *
 * Bản trước gõ tay, và vì thế nó canh sai thứ: nó khẳng định *"máy này có phông"*
 * chứ không phải *"kho này mang theo phông"*. Hai câu ấy khác nhau đúng ở chỗ đắt
 * — máy CI có DejaVu nên test xanh, máy khác không có nên card trống trơn, và
 * chốt canh không có cách nào biết. Từ khi `loadSystemFonts` tắt thì mọi mực ở
 * đây đến từ file trong `node_modules`, và đó mới là điều cần khẳng định.
 */
function inkRatio(svg: string): number {
  const image = new Resvg(svg, { font: fontOptions(), background: '#FFFFFF' }).render();

  const pixels = image.pixels;
  let inked = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    // Nền trắng đục; "có mực" = lệch đáng kể khỏi trắng ở bất kỳ kênh nào.
    if (pixels[i]! < 200 || pixels[i + 1]! < 200 || pixels[i + 2]! < 200) inked += 1;
  }
  return inked / (pixels.length / 4);
}

/**
 * Mực của một ô `.notdef` — **mốc để phân biệt "vẽ ra" với "vẽ ra một cái hộp"**.
 *
 * U+2FFFF nằm trong Plane 2 chưa gán, nên không phông nào có nó; thứ resvg vẽ là
 * glyph số 0 của mặt chữ đang dùng, tức đúng cái hộp mà một ký tự thiếu sẽ ra.
 */
const TOFU = (): number => inkRatio(svgWith('&#196607;'));

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

  /**
   * Và đây là chỗ bản trước **xanh mà không canh gì**.
   *
   * Nó chỉ hỏi `mực > 0.005`. Nhưng một ký tự **thiếu** không vẽ ra khoảng trắng —
   * nó vẽ ra ô `.notdef`, và ô ấy **có mực**. Đo được khi dò phông cho lượt này:
   * với Inter, `♞`, `♟` và một codepoint chưa gán cho ra **cùng một con số**
   * $0{,}0337$ — cả ba là cùng một cái hộp. Bản cũ sẽ gọi đó là "quân cờ ra mực".
   *
   * Nay phép so là với chính mực của `.notdef`: khác nó thì mới là glyph thật.
   */
  it('ký tự quân cờ Unicode ra **glyph thật**, không phải ô .notdef', () => {
    const tofu = TOFU();
    // Ba quân mà board renderer thật sự phát: hậu, xe, mã.
    for (const piece of ['&#9819;', '&#9820;', '&#9822;']) {
      const ink = inkRatio(svgWith(piece));
      expect(ink).toBeGreaterThan(0.005);
      expect(ink, `${piece} vẽ ra đúng lượng mực của .notdef — đây là một ô rỗng`).not.toBe(
        tofu,
      );
    }
  });

  /**
   * Ký hiệu toán trong **nhãn giao diện** — `∑`, `∏`, `×`, `−`, `≤`, `∞`.
   *
   * Chúng không đi qua KaTeX (đó là chữ trong canvas); chúng nằm trong nhãn luật và
   * caption, tức đi đường phông giao diện. Thiếu một cái thì một dòng caption ra
   * một ô vuông giữa câu, và không lớp nào phía trên biết.
   */
  it('ký hiệu toán trong nhãn giao diện đều là glyph thật', () => {
    const tofu = TOFU();
    for (const sign of ['&#8721;', '&#8719;', '&#215;', '&#8722;', '&#8804;', '&#8734;']) {
      expect(inkRatio(svgWith(sign)), `${sign} ra ô .notdef`).not.toBe(tofu);
    }
  });

  it('SVG rỗng thì không có mực — phép đếm đang đo đúng thứ nó tưởng', () => {
    expect(inkRatio(svgWith(''))).toBe(0);
  });

  /**
   * **`loadSystemFonts` phải tắt** — và điều này chỉ khẳng định được bằng cách hỏi
   * thẳng cấu hình, không bằng cách nhìn ảnh.
   *
   * Lượt bẻ răng cho lượt này bật nó lại thành `true` và **cả bảy test vẫn xanh**:
   * máy chạy test *có* DejaVu, nên nạp thêm phông hệ thống không làm hỏng gì. Đó
   * đúng là lý do món này tồn tại — chốt canh cũ xanh trên máy có phông và mù với
   * máy không có, tức nó **chặn** chứ không **chữa** (`PLAN-P1.md` §10.3).
   *
   * Không có ảnh nào phân biệt được hai cấu hình ấy trên máy này. Thứ phân biệt
   * được là chính lời khai, nên lời khai là thứ phải khoá.
   */
  /**
   * Mặt **đậm** phải có thật trong bundle, không phải chỉ mặt thường.
   *
   * `font-weight: 600` được ba chỗ phát ra: watermark của card, nhãn đậm của board
   * renderer, và nhãn của set renderer. Thiếu mặt Bold thì resvg không báo gì — nó
   * vẽ bằng mặt thường, và thứ *đáng lẽ nổi bật* hoà vào phần còn lại. Đúng loại
   * lỗi "hình đúng, chỉ sai chỗ người ta nhìn" mà cả G-09 sinh ra để canh.
   *
   * Lượt bẻ răng bắt được chỗ này: bỏ `DejaVuSans-Bold.ttf` khỏi bundle mà **cả
   * 2473 test vẫn xanh**.
   */
  it('mặt đậm có thật — chữ 600 khác chữ 400', () => {
    const at = (weight: number): number =>
      inkRatio(
        `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="60">` +
          `<text x="4" y="42" font-size="36" font-family="sans-serif" font-weight="${weight}"` +
          ` fill="#000000">Bàn cờ</text></svg>`,
      );

    expect(at(600)).toBeGreaterThan(at(400));
  });

  it('đường raster **không** mượn phông của máy', () => {
    expect(fontOptions().loadSystemFonts).toBe(false);
    // …và bộ file kho mang theo phải có thật, không phải một đường dẫn khai suông.
    for (const file of uiFontFiles()) expect(existsSync(file), file).toBe(true);
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

  /**
   * Hai phép so trên **cùng suy biến được**, và lượt bẻ răng chứng minh điều đó:
   * thay `DejaVuSans.ttf` bằng `DejaVuSerif.ttf` trong bộ bundle thì cả hai vẫn
   * xanh. Vì khi mặt Sans biến mất, `font-family="DejaVu Sans"` trượt về mặc định
   * — cũng là `'DejaVu Sans'`, cũng không có — nên **cả hai vế** rơi xuống cùng
   * một mặt thay thế và bằng nhau. Một phép so mà hai vế cùng hỏng thì nó không so
   * cái gì; đúng hình dạng của cái test quân cờ vừa sửa ở trên.
   *
   * Neo còn thiếu là một **mặt chữ khác hẳn, và chắc chắn có mặt trong bundle**:
   * nếu tên family không thật sự chọn được mặt, thì UI cũng sẽ trượt về đúng chỗ
   * KaTeX_Main trượt tới, và phép so dưới đây đỏ.
   */
  it('tên family **thật sự** chọn mặt chữ, không phải cùng nhau trượt về một chỗ', () => {
    expect(png(UI, 'Pascal.').equals(png('KaTeX_Main', 'Pascal.'))).toBe(false);
  });

  /**
   * …và phép so trên vẫn chưa đủ: nó bắt được ca *"UI không chọn được mặt nào"*,
   * không bắt được ca *"UI chọn **nhầm** mặt"*. Đổi bundle sang `DejaVuSerif.ttf`
   * thì UI rơi xuống Serif, `KaTeX_Main` vẫn ra KaTeX, hai vế vẫn khác nhau, test
   * vẫn xanh — mà **mọi card vừa đổi kiểu chữ**.
   *
   * Neo phải đến từ **ngoài** `fontOptions()`: test tự tìm `DejaVuSans.ttf` trong
   * `node_modules` và dựng một bản render bằng đúng file ấy. Đường raster thật
   * phải cho ra **cùng byte**. Nếu bundle mang một mặt khác thì hai bên lệch, và
   * chỗ lệch ấy chính là chỗ không ảnh nào khác nhìn ra.
   */
  it('mặt chữ kho mang theo đúng là DejaVu Sans, neo bằng một nguồn độc lập', () => {
    const sans = join(
      dirname(createRequire(import.meta.url).resolve('dejavu-fonts-ttf/package.json')),
      'ttf',
      'DejaVuSans.ttf',
    );
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="60">` +
      `<text x="4" y="42" font-size="34" font-family="${UI}" fill="#000000">Pascal.</text>` +
      `</svg>`;
    const direct = new Resvg(svg, {
      font: {
        loadSystemFonts: false,
        fontFiles: [sans],
        defaultFontFamily: 'DejaVu Sans',
        sansSerifFamily: 'DejaVu Sans',
      },
      // Cùng nền với `rasterize`, không thì hai ảnh khác nhau vì một lý do chẳng
      // liên quan gì tới phông — và một phép so đỏ vì lý do sai thì cũng vô dụng
      // như một phép so xanh vì lý do sai.
      background: defaultTheme.surface.canvas,
    })
      .render()
      .asPng();

    expect(png(UI, 'Pascal.').equals(direct)).toBe(true);
  });
});
