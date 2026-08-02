import { createRequire } from 'node:module';
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Phông cho mọi thứ raster hoá ở phía Node (`film`, `og --png`).
 *
 * ## Lỗi thứ nhất: không có phông toán thì phép đo sai một nửa
 *
 * `theme.type.mathFamily` là `'KaTeX_Main', 'Latin Modern Math', serif`, và
 * `typeset.ts` đo bề rộng chữ **bằng bảng metric của KaTeX**. Trong browser Player nạp
 * đúng bộ phông ấy nên hai bên khớp. Trong Node với mỗi `loadSystemFonts` thì máy này
 * có $59$ phông và **không cái nào** là KaTeX: resvg lặng lẽ rơi về một sans hệ thống,
 * chữ số rộng hơn bảng metric giả định, và hình vẽ ra rộng hơn hộp mà layout đã tính.
 *
 * Đo được ở M62: dòng `x = 8` có hộp rộng $11{,}30$ đơn vị, glyph `8` bắt đầu ở
 * $20{,}233$ và theo metric KaTeX kết thúc đúng ở $22{,}733$ — mép phải của hộp. Raster
 * bằng phông thay thế thì nó tràn qua, và cái người ta **nhìn thấy** là quầng anchor
 * cắt ngang chữ số cuối. Không test nào bắt được: golden so **chuỗi SVG**, mà chuỗi
 * SVG thì đúng — sai nằm ở chỗ resvg vẽ chuỗi ấy bằng phông khác.
 *
 * Nên phông không phải chuyện trang trí ở đây: nó là **một nửa của phép đo**. Nửa kia
 * (`textWidth`) đã có sẵn trong repo; nửa này phải trỏ vào cùng bộ file mà Player nạp.
 *
 * ## Lỗi thứ hai: bốn mặt chữ tự khai mình là Regular
 *
 * Trỏ thẳng vào `katex/dist/fonts` xong thì mọi thứ hoá **nghiêng** — kể cả chữ Việt
 * của nhãn luật. Đọc bảng `OS/2` mới ra:
 *
 * | file | family | subfamily | `fsSelection` |
 * |---|---|---|---|
 * | `KaTeX_Main-Regular.ttf` | KaTeX_Main | Regular | `0b1000000` |
 * | `KaTeX_Main-Italic.ttf` | KaTeX_Main | Italic | `0b1000000` |
 * | `KaTeX_Main-Bold.ttf` | KaTeX_Main | Bold | `0b1000000` |
 * | `KaTeX_Main-BoldItalic.ttf` | KaTeX_Main | Bold Italic | `0b1000000` |
 *
 * Bit thứ 6 là `REGULAR`. **Cả bốn mặt đều khai mình là Regular**, không mặt nào bật
 * bit `ITALIC` hay `BOLD`. Với KaTeX thì đó không phải lỗi: trong browser, kiểu chữ do
 * `@font-face { font-style: italic }` khai ở CSS quyết định, bảng trong file không ai
 * đọc. Nhưng resvg **chỉ có** bảng trong file, nên bốn mặt trở thành bốn bản trùng
 * nhau và nó bốc bừa một cái — hoá ra là `Italic`.
 *
 * Nên ta sửa đúng hai bit ấy, trên một **bản sao** trong cache, rồi đưa bản sao cho
 * resvg. Kiểu chữ suy từ tên file — chính thứ mà `@font-face` của KaTeX cũng dùng để
 * suy. Không đụng file gốc trong `node_modules`.
 *
 * Checksum của bảng thì **không** tính lại: `ttf-parser` (bộ đọc của resvg) không kiểm
 * checksum. Ghi ra đây để lần sau đổi bộ đọc thì biết chỗ nào nợ.
 */
const require = createRequire(import.meta.url);

const KATEX_ROOT = dirname(require.resolve('katex/package.json'));

/** Thư mục `dist/fonts` của katex — cùng bộ file mà Player nạp qua `@font-face`. */
export const KATEX_FONT_DIR = join(KATEX_ROOT, 'dist', 'fonts');

/**
 * Mặt chữ **giao diện**, bundle chứ không mượn của máy — nửa còn lại của G-09.
 *
 * ## Vì sao đây là một lỗ chứ không phải một chi tiết
 *
 * Bộ KaTeX ở trên bundle từ M62, nhưng chữ giao diện — tiêu đề card, nhãn luật,
 * caption — vẫn đi `loadSystemFonts: true` với `defaultFontFamily: 'DejaVu Sans'`,
 * mà DejaVu là phông **của máy**, không của kho. Máy build thiếu nó thì resvg
 * không báo lỗi, nó chỉ **bỏ chữ đi**: một card 1200×630 bố cục hoàn hảo, hình
 * đẹp, không một chữ nào — rồi nó lên Twitter. `PLAN-P1.md` §10.3 ghi món này từ
 * lâu và nói đúng chỗ đau: đã có test đếm mực **chặn** kiểu lỗi ấy, nhưng
 * **chặn ≠ chữa**, vì test cũng chạy trên máy *có* phông.
 *
 * ## Vì sao DejaVu chứ không phải Inter, dù theme khai Inter trước
 *
 * Lý lẽ "bundle đúng mặt Player nạp" là lý lẽ của **KaTeX**, và nó không mang sang
 * đây được. Với KaTeX nó đúng vì `typeset.ts` đo bề rộng bằng **bảng metric của
 * KaTeX** — hai bên phải cùng một bộ file thì phép đo mới khớp. Chữ giao diện thì
 * **không có bảng metric nào**: resvg tự dàn chữ, không ai đo trước. Nên tiêu chí
 * duy nhất còn lại là **phủ ký tự**.
 *
 * Và ở tiêu chí ấy Inter trượt, đo được: `♞` (U+265E), `♟` (U+265F) và một
 * codepoint chắc chắn không tồn tại (U+2FFFF) render ra **cùng một lượng mực**
 * trong Inter — tức cả ba là ô `.notdef`. Board renderer phát `♛ ♜ ♞` cho quân cờ,
 * nên bundle Inter là biến mọi quân cờ trên mọi card thành một ô vuông rỗng.
 * DejaVu cho ba con số khác nhau, và phủ luôn `∑ ∏ × − ≤ ∞` cùng dấu tiếng Việt.
 *
 * Chỗ này cũng lộ ra một cổng xanh không canh gì: test quân cờ của G-09 chỉ hỏi
 * `mực > 0`, mà **một ô tofu cũng có mực**. Nay nó so với mực của `.notdef`.
 */
const DEJAVU_ROOT = dirname(require.resolve('dejavu-fonts-ttf/package.json'));

/**
 * Đúng hai mặt, không phải cả bộ 22 file.
 *
 * Card dùng `font-weight: 500` và mặc định; `Oblique`/`Condensed`/`Serif`/`Mono`
 * không chỗ nào gọi. Nạp thừa không sai nhưng nó làm `fontFiles` thành một danh
 * sách không ai giải thích được, và mỗi file thừa là một mặt resvg có thể bốc
 * nhầm khi một family không khớp.
 */
export function uiFontFiles(): string[] {
  return ['DejaVuSans.ttf', 'DejaVuSans-Bold.ttf'].map((name) =>
    join(DEJAVU_ROOT, 'ttf', name),
  );
}

const KATEX_VERSION = (JSON.parse(readFileSync(join(KATEX_ROOT, 'package.json'), 'utf8')) as {
  version: string;
}).version;

/** Bản đã sửa bit nằm trong cache, khoá theo phiên bản katex. */
const CACHE_DIR = join(KATEX_ROOT, '..', '..', '.cache', 'combviz-fonts', KATEX_VERSION);

let cached: string[] | null = null;

/**
 * Đường dẫn tới bộ mặt chữ KaTeX **đã sửa bit kiểu chữ**. Dựng một lần rồi nhớ.
 */
export function katexFontFiles(): string[] {
  if (cached) return cached;

  const files = readdirSync(KATEX_FONT_DIR)
    .filter((name) => name.endsWith('.ttf'))
    .sort();

  mkdirSync(CACHE_DIR, { recursive: true });
  cached = files.map((name) => {
    const target = join(CACHE_DIR, name);
    if (!existsSync(target)) writeFileSync(target, restyle(readFileSync(join(KATEX_FONT_DIR, name)), name));
    return target;
  });
  return cached;
}

/** Bảng của một file TrueType: tên bốn ký tự → offset. */
function tableDirectory(font: Buffer): Map<string, number> {
  const tables = new Map<string, number>();
  const count = font.readUInt16BE(4);
  for (let i = 0; i < count; i += 1) {
    const at = 12 + i * 16;
    tables.set(font.toString('latin1', at, at + 4), font.readUInt32BE(at + 8));
  }
  return tables;
}

/**
 * Bề rộng thật của chữ giao diện — **nửa còn lại của phép đo** (`PLAN-P1.md` §10.3b).
 *
 * `titleLines` ngắt dòng bằng cách **đếm ký tự** với một hằng số `FONT * 0.5`, tức nó
 * giả định mọi ký tự rộng nửa em. Chú thích của chính nó thừa nhận: *"render headless
 * thì không đo được bề rộng chữ"*, và chọn cắt sớm cho an toàn. Nhưng giả định ấy sai
 * theo **cả hai** chiều — `i` hẹp hơn nhiều, `ằ`/`ữ` rộng hơn — nên nó vừa cắt sớm ở
 * chỗ này vừa để tràn ở chỗ kia. Đo được: 17/141 card có mực chạm mép phải.
 *
 * Câu *"không đo được"* đúng cho tới lượt nhúng phông. Từ khi kho **mang theo**
 * `DejaVuSans.ttf` thì bảng `hmtx` của đúng mặt chữ resvg sắp vẽ nằm ngay trong
 * `node_modules` — và đó chính là lý lẽ đã dựng phần KaTeX của tệp này: *"phông không
 * phải chuyện trang trí ở đây: nó là **một nửa của phép đo**"*. Với KaTeX nửa kia là
 * `textWidth`; với chữ giao diện thì nửa kia là hàm dưới đây.
 *
 * Không dựng shaping engine: không kerning, không ligature, không chữ Ả Rập. Đề tiếng
 * Việt là một chuỗi glyph rời, và tổng advance là **đúng** bề rộng của nó.
 */
let metrics: { advance: (code: number) => number; unitsPerEm: number } | null = null;

export function uiTextWidth(text: string, fontSize: number): number {
  if (metrics === null) metrics = readMetrics(readFileSync(uiFontFiles()[0] as string));
  let total = 0;
  for (const char of text) total += metrics.advance(char.codePointAt(0) as number);
  return (total * fontSize) / metrics.unitsPerEm;
}

function readMetrics(font: Buffer): { advance: (code: number) => number; unitsPerEm: number } {
  const tables = tableDirectory(font);
  const head = tables.get('head') as number;
  const unitsPerEm = font.readUInt16BE(head + 18);
  const numHMetrics = font.readUInt16BE((tables.get('hhea') as number) + 34);
  const hmtx = tables.get('hmtx') as number;

  const cmap = tables.get('cmap') as number;
  const subtables = new Map<number, number>();
  for (let i = 0; i < font.readUInt16BE(cmap + 2); i += 1) {
    const at = cmap + 4 + i * 8;
    const off = cmap + font.readUInt32BE(at + 4);
    subtables.set(font.readUInt16BE(off), off);
  }

  const glyphOf = pickCmap(font, subtables);

  return {
    unitsPerEm,
    // Glyph sau `numberOfHMetrics` dùng chung advance với cái cuối — đúng đặc tả, và
    // đó là cách file nén một dãy dài glyph cùng bề rộng (chữ CJK chẳng hạn).
    advance: (code) => {
      const glyph = glyphOf(code);
      return font.readUInt16BE(hmtx + Math.min(glyph, numHMetrics - 1) * 4);
    },
  };
}

/**
 * Bảng con `cmap` **định dạng 12** — và chỉ định dạng ấy.
 *
 * DejaVu có năm bảng con, hai trong đó khai `platform 3`: `(3,1)` định dạng 4 và
 * `(3,10)` định dạng 12. Bản đầu của hàm gọi lọc theo platform rồi giữ cái **cuối
 * cùng** khớp — tức luôn vớ phải định dạng 12 — rồi đọc nó theo bố cục của định dạng
 * 4. Không nổ, không báo lỗi: nó trả glyph $0$ cho mọi ký tự, và `.notdef` có advance
 * thật, nên `iiiiiiiiii` và `MMMMMMMMMM` ra **cùng một** bề rộng. Một phép đo sai đều
 * nhìn như một phép đo đúng — cùng họ với ô tofu ở lượt nhúng phông.
 *
 * Nên chọn theo **định dạng**, không theo platform. Và chỉ viết bộ đọc cho định dạng
 * 12 chứ không viết cả hai: mặt chữ này ghim trong `package.json`, nó *có* định dạng
 * 12, nên một bộ đọc định dạng 4 là hai chục dòng không lượt chạy nào đi qua — lượt
 * bẻ răng xác nhận đúng thế, ép nhánh kia chạy thì không test nào đỏ. Thiếu bảng con
 * ấy thì **ném**, vì đó là lúc mặt chữ đã đổi thành thứ khác hẳn.
 */
function pickCmap(font: Buffer, subtables: ReadonlyMap<number, number>): (code: number) => number {
  const wide = subtables.get(12);
  if (wide === undefined) throw new Error('mặt chữ giao diện không có cmap định dạng 12');

  const groups = font.readUInt32BE(wide + 12);
  return (code) => {
    for (let g = 0; g < groups; g += 1) {
      const at = wide + 16 + g * 12;
      if (font.readUInt32BE(at) > code) return 0; // nhóm sắp tăng dần
      if (font.readUInt32BE(at + 4) < code) continue;
      return font.readUInt32BE(at + 8) + (code - font.readUInt32BE(at));
    }
    return 0;
  };
}

/** Kiểu chữ suy từ đuôi tên file, đúng như `@font-face` của KaTeX khai. */
function styleOf(name: string): { bold: boolean; italic: boolean } {
  const suffix = name.slice(name.indexOf('-') + 1, -4);
  return { bold: suffix.includes('Bold'), italic: suffix.includes('Italic') };
}

function restyle(font: Buffer, name: string): Buffer {
  const { bold, italic } = styleOf(name);
  const out = Buffer.from(font);
  const tables = tableDirectory(out);

  const os2 = tables.get('OS/2');
  if (os2 !== undefined) {
    out.writeUInt16BE(bold ? 700 : 400, os2 + 4); // usWeightClass
    // fsSelection: bit0 ITALIC, bit5 BOLD, bit6 REGULAR — và REGULAR chỉ đúng khi
    // không có bit nào khác, nên ba bit này phải đặt cùng lúc chứ không cộng thêm.
    const kept = out.readUInt16BE(os2 + 62) & ~0b1100001;
    out.writeUInt16BE(kept | (italic ? 1 : 0) | (bold ? 1 << 5 : 0) | (!italic && !bold ? 1 << 6 : 0), os2 + 62);
  }

  const head = tables.get('head');
  if (head !== undefined) {
    const kept = out.readUInt16BE(head + 44) & ~0b11; // macStyle: bit0 bold, bit1 italic
    out.writeUInt16BE(kept | (bold ? 1 : 0) | (italic ? 2 : 0), head + 44);
  }

  return out;
}

/**
 * Tuỳ chọn phông cho `Resvg`.
 *
 * `loadSystemFonts` **tắt** — và đó là cả nội dung của lượt này. Còn bật thì máy *có*
 * phông vẫn che mất lỗi của máy *không có*: chốt canh chạy xanh trên CI, card trống
 * trơn trên máy khác. Tắt nó biến "chặn" thành "chữa" (`PLAN-P1.md` §10.3).
 *
 * `sansSerifFamily` khai tường minh vì `theme.type.uiFamily` kết thúc bằng
 * `sans-serif`, mà mặc định của resvg cho khoá ấy là `Arial` — không có trong danh
 * sách bundle, và khi cả chuỗi trượt hết thì resvg bốc mặt đầu tiên nó nạp được, tức
 * một cái tên do thứ tự file quyết định. Tên nào không có thì resvg vẫn trượt tiếp
 * như cũ, nên khai thừa vô hại.
 */
export function fontOptions(): {
  loadSystemFonts: boolean;
  fontFiles: string[];
  defaultFontFamily: string;
  serifFamily: string;
  sansSerifFamily: string;
} {
  return {
    loadSystemFonts: false,
    fontFiles: [...katexFontFiles(), ...uiFontFiles()],
    /**
     * ## Lỗi thứ ba: phông **mặc định** không khai thì resvg bốc bừa (M69)
     *
     * `font-family` của chữ giao diện là `'Inter', 'Segoe UI', system-ui,
     * sans-serif`. Máy build không có ba cái đầu, và `sansSerifFamily` bên dưới
     * lẽ ra đỡ cho cái thứ tư — nhưng resvg hỏi `defaultFontFamily` **trước**, mà
     * bỏ trống thì nó lấy đại một mặt trong danh sách vừa nạp. Danh sách ấy giờ
     * đứng đầu bằng bộ KaTeX.
     *
     * Nhìn thấy được, và nhìn thấy trên **mọi** card: tiêu đề bài in bằng một mặt
     * nghiêng, còn dòng nào **chỉ có ASCII** — không dấu tiếng Việt để buộc rơi
     * xuống DejaVu — thì in bằng `KaTeX_Fraktur`. Card của `pascal-two-proofs`
     * ngắt dòng đúng chỗ để chữ "Pascal." đứng một mình, và nó hiện ra kiểu chữ
     * gô-tích giữa một tiêu đề sans.
     *
     * Lại là lớp lỗi mà không test nào bắt được và lượt nhìn bắt ngay: chuỗi SVG
     * đúng từng byte, sai nằm ở chỗ resvg vẽ chuỗi ấy bằng phông nào.
     */
    defaultFontFamily: 'DejaVu Sans',
    serifFamily: 'KaTeX_Main',
    sansSerifFamily: 'DejaVu Sans',
  };
}
