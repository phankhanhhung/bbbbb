/**
 * LaTeX → chữ thường, cho những chỗ **không** render được KaTeX.
 *
 * Có đúng ba chỗ như vậy, và trước file này cả ba tự xoay xở một kiểu khác nhau:
 *   - OG card (REN-02): raster bằng resvg, không có KaTeX. Card từng hiện thẳng
 *     `5\times5` cho mọi người thấy — trên đúng cái ảnh mà mỗi link chia sẻ mang
 *     theo.
 *   - Chỉ mục tìm kiếm (CMS-02): tước sạch để gõ "time" không ra mọi bài có phép
 *     nhân.
 *   - `alt_text` tự sinh (NFR-A3): screen reader đọc "backslash times" là vô nghĩa.
 *
 * Hai chế độ, vì hai nhu cầu thật sự khác nhau:
 *   - `toReadableMath` giữ nội dung, đổi ký hiệu sang Unicode — dành cho chỗ có
 *     **người đọc**.
 *   - `toSearchableText` vứt hẳn ký hiệu — dành cho chỗ **máy so khớp**.
 *
 * Đây không phải bản thay thế cho label atlas (D-07). Nó không dựng nổi phân số
 * hay tổng $\\sum$; nó chỉ lo phần mà đề bài tổ hợp dùng đến 95% thời gian —
 * chỉ số, số mũ, và một nhúm ký hiệu quan hệ.
 */

/** Lệnh LaTeX có ký tự Unicode tương đương đọc được. */
const SYMBOLS: readonly (readonly [RegExp, string])[] = [
  [/\\times/g, '×'],
  [/\\cdot/g, '·'],
  [/\\div/g, '÷'],
  [/\\pm/g, '±'],
  [/\\mp/g, '∓'],
  [/\\leq?\b/g, '≤'],
  [/\\geq?\b/g, '≥'],
  [/\\neq/g, '≠'],
  [/\\approx/g, '≈'],
  [/\\equiv/g, '≡'],
  [/\\in\b/g, '∈'],
  [/\\notin/g, '∉'],
  [/\\subset(eq)?/g, '⊂'],
  [/\\cup/g, '∪'],
  [/\\cap/g, '∩'],
  [/\\emptyset|\\varnothing/g, '∅'],
  [/\\infty/g, '∞'],
  [/\\to|\\rightarrow/g, '→'],
  [/\\Rightarrow/g, '⇒'],
  [/\\Leftrightarrow|\\iff/g, '⇔'],
  [/\\ldots|\\dots|\\cdots/g, '…'],
  [/\\deg\b/g, 'deg'],
  [/\\bmod\b/g, 'mod'],
  [/\\Delta/g, 'Δ'],
  [/\\alpha/g, 'α'],
  [/\\beta/g, 'β'],
  [/\\gamma/g, 'γ'],
  [/\\lambda/g, 'λ'],
  [/\\sum/g, '∑'],
  [/\\binom/g, 'C'],
];

/** Khoảng cách và lệnh chỉ ảnh hưởng trình bày — bỏ hẳn. */
const SPACING = /\\[!,;:> ]|\\quad|\\qquad|\\left|\\right|\\displaystyle/g;

const SUBSCRIPT: Readonly<Record<string, string>> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
  '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  n: 'ₙ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ', m: 'ₘ',
};

const SUPERSCRIPT: Readonly<Record<string, string>> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  n: 'ⁿ', k: 'ᵏ', i: 'ⁱ',
};

/**
 * Đổi các đoạn `$…$` thành chữ đọc được, giữ nguyên phần văn xuôi.
 *
 * Chỉ số và số mũ đổi sang ký tự Unicode khi có; không có thì giữ dạng `_`/`^`,
 * vì `v_{max}` đọc ra "vmax" thì mất luôn ranh giới giữa tên và chỉ số.
 */
export function toReadableMath(source: string): string {
  return replaceMath(source, (math) => {
    let out = math;
    for (const [pattern, replacement] of SYMBOLS) out = out.replace(pattern, replacement);
    out = out.replace(SPACING, '');

    // `x_{12}` và `x_1` — chỉ đổi khi **mọi** ký tự có bản chỉ số, để không sinh
    // ra thứ nửa nạc nửa mỡ kiểu `x₁2`.
    out = out.replace(/_\{?([A-Za-z0-9]+)\}?/g, (whole, body: string) =>
      mapAll(body, SUBSCRIPT) ?? whole,
    );
    out = out.replace(/\^\{?([A-Za-z0-9]+)\}?/g, (whole, body: string) =>
      mapAll(body, SUPERSCRIPT) ?? whole,
    );

    // Ngoặc **thoát** là ngoặc thật của một tập hợp, không phải ngoặc nhóm của
    // LaTeX. Một lượt thay duy nhất phân biệt được hai thứ: nhánh trước của
    // `|` bắt `\{`/`\}` và **giữ** dấu ngoặc, nhánh sau bắt ngoặc trần và bỏ.
    //
    // Không có bước này thì `$\{1,2,\dots,n\}$` hiện ra thành `\1,2,…,n\` — hai
    // dấu gạch chéo lạc giữa tiêu đề, trên card của đúng những bài nói về tập hợp.
    return out
      .replace(/\\([{}])|[{}]/g, (_whole, kept: string | undefined) => kept ?? '')
      .replace(/\\[a-zA-Z]+/g, '')
      .trim();
  });
}

/**
 * Bỏ **dấu** đậm, giữ chữ — cho mọi nơi vẽ ra không có khái niệm "chữ đậm".
 *
 * Player đổi `**…**` thành `<strong>`; SVG của OG card thì không có thẻ nào để
 * đổi sang, nên trước M69 nó in nguyên bốn dấu sao ra ảnh — trên **57/114** card,
 * tức nửa kho, ở đúng thứ duy nhất người ta thấy khi ai đó chia sẻ link. Lỗi này
 * không test nào bắt và cũng không thể: nó chỉ lộ ở lượt nhìn.
 *
 * Cùng hai luật ngữ nghĩa với `renderMath`, và chép sang đây thay vì gọi nhờ vì
 * bên kia sống trong `apps/player` (tầng dưới không được biết tới tầng trên):
 *
 * - **Không đụng phần trong `$…$`** — `a ** b` ở đó là phép nhân.
 * - **Số dấu lẻ thì để nguyên tất** — tác giả đang viết phép nhân chứ không phải
 *   chữ đậm, và nuốt một dấu lẻ là sửa lời họ viết.
 */
export function stripBoldMarkup(source: string): string {
  const outside = source.split(/(\$[^$]*\$)/g);
  const markers = outside.reduce(
    (n, part, i) => (i % 2 === 1 ? n : n + (part.match(/\*\*/g) ?? []).length),
    0,
  );
  if (markers === 0 || markers % 2 !== 0) return source;
  return outside.map((part, i) => (i % 2 === 1 ? part : part.replace(/\*\*/g, ''))).join('');
}

/**
 * Vứt hẳn ký hiệu toán, chỉ giữ chữ và số — cho ô tìm kiếm.
 *
 * Phải bỏ **cả tên lệnh**, không chỉ dấu `\`: bỏ mỗi backslash thì `\times` còn
 * lại "times", và gõ "time" sẽ ra mọi bài có phép nhân — đúng loại kết quả rác
 * khiến người ta thôi tin ô tìm kiếm.
 */
export function toSearchableText(source: string): string {
  return replaceMath(source, (math) =>
    math
      .replace(/\\[a-zA-Z]+/g, ' ')
      .replace(/[_^{}\\]/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function replaceMath(source: string, transform: (math: string) => string): string {
  return source.replace(/\$([^$]*)\$/g, (_whole, math: string) => transform(math));
}

function mapAll(body: string, table: Readonly<Record<string, string>>): string | null {
  let out = '';
  for (const char of body) {
    const mapped = table[char];
    if (mapped === undefined) return null;
    out += mapped;
  }
  return out;
}
