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

/**
 * Lệnh LaTeX → chữ đọc được. **Tên lệnh**, không phải regex — và đó là cả bài học.
 *
 * Bản trước là một bảng `RegExp`, và hai lỗi rơi thẳng ra từ hình dạng ấy:
 *
 * - `[/\\cdot/g, '·']` đứng trước `\cdots`, nên `$a \cdots z$` ra `a ·s z`. Không
 *   phải mất chữ mà **gặm** chữ, và cái răng canh "có lệnh nào bị xoá im lặng không"
 *   nhìn không thấy: `\cdot` *đã* được xử, thứ còn lại là một chữ `s` lạc.
 * - `[/\\pm/g, '±']` ăn được `\pmod`; hôm nay nó không nổ chỉ vì `structures()` chạy
 *   trước. Một lỗi chỉ nằm im nhờ thứ tự gọi là một lỗi đang chờ.
 *
 * Cả lớp ấy chết bằng **hình dạng dữ liệu**, không bằng vá từng dòng: bảng khai tên,
 * rồi một alternation duy nhất dựng ra từ nó, **sắp dài trước ngắn** và đóng bằng một
 * `(?![a-zA-Z])`. Tên dài luôn thử trước tên ngắn, và không tên nào cắn được nửa đầu
 * của tên khác. Thêm dòng mới vào bảng không phải nghĩ tới thứ tự nữa.
 */
const SYMBOLS: Readonly<Record<string, string>> = {
  times: '×', cdot: '·', cdots: '…', div: '÷', pm: '±', mp: '∓',
  le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠',
  mid: '∣', nmid: '∤', approx: '≈', equiv: '≡',
  in: '∈', notin: '∉', subset: '⊂', subseteq: '⊂', cup: '∪', cap: '∩', oplus: '⊕',
  emptyset: '∅', varnothing: '∅', infty: '∞',
  to: '→', rightarrow: '→', mapsto: '↦', Rightarrow: '⇒',
  Leftrightarrow: '⇔', iff: '⇔',
  ldots: '…', dots: '…',
  lfloor: '⌊', rfloor: '⌋', lceil: '⌈', rceil: '⌉', blacksquare: '∎',
  sum: '∑', prod: '∏', binom: 'C',

  // Bảng chữ Hy Lạp trọn bộ. Đây là chỗ **duy nhất** trong tệp khai thừa so với kho,
  // và khai thừa có lý: tập này đóng, mỗi tên có đúng một ký tự Unicode, nên không
  // có phán đoán nào để sai. Mọi thứ ngoài bảng chữ cái thì chỉ khai cái kho dùng —
  // một bảng đầy tên chưa ai gọi cũng là một khẳng định không ai kiểm.
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε',
  zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'θ', iota: 'ι', kappa: 'κ',
  lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', varpi: 'π',
  rho: 'ρ', varrho: 'ρ', sigma: 'σ', varsigma: 'ς', tau: 'τ', upsilon: 'υ',
  phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π',
  Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',

  /**
   * Tên phép toán — `\sin` phải ra `sin`, không ra **rỗng**.
   *
   * Đây là chỗ chổi quét cuối cắn thật, và cắn vào đúng thứ nó không được phép chạm:
   * `$(\sin x + \cos x)^2$` hiện lên OG card thành `( x + x)²`. Không phải chữ xấu
   * — chữ **sai**, trên thứ duy nhất người ta nhìn thấy khi ai đó chia sẻ link.
   *
   * `\deg` và `\bmod` đã được xử đúng kiểu này từ đầu, nên ý định vốn có sẵn; thiếu
   * là thiếu phần còn lại của một tập đóng. KaTeX gọi chúng là `\operatorname`.
   */
  arccos: 'arccos', arcsin: 'arcsin', arctan: 'arctan',
  cos: 'cos', cot: 'cot', csc: 'csc', sec: 'sec', sin: 'sin', tan: 'tan',
  cosh: 'cosh', sinh: 'sinh', tanh: 'tanh', exp: 'exp',
  ln: 'ln', log: 'log', lim: 'lim', sup: 'sup', inf: 'inf',
  max: 'max', min: 'min', gcd: 'gcd', lcm: 'lcm',
  deg: 'deg', det: 'det', dim: 'dim', ker: 'ker', bmod: 'mod',
};

/**
 * Một alternation duy nhất, đóng bằng `(?![a-zA-Z])`.
 *
 * Cái lookahead ấy là **toàn bộ** phần gánh việc, và nó gánh hai việc khác nhau:
 *
 * - Tên ngắn không gặm được tên dài, kể cả khi nó đứng trước trong bảng. `cdot|cdots`
 *   thử `cdot` cho `\cdots`, thấy chữ `s` phía sau, **quay lui**, rồi ăn trọn `cdots`.
 *   Nên thứ tự khai trong bảng không phải chuyện đúng-sai — lượt bẻ răng xác nhận:
 *   bỏ phép sắp `dài trước ngắn` đi thì không test nào đỏ, nên phép sắp ấy đã bị gỡ
 *   thay vì giữ lại kèm một chú thích nói nó quan trọng.
 * - Lệnh **lạ** thì để nguyên chứ không ăn mất nửa đầu. `\subsetneq` chưa có trong
 *   bảng: không có lookahead thì nó ra `⊂neq`, một ký hiệu **sai** mà không ai than.
 *   Có lookahead thì nó đi nguyên vẹn tới `unhandledMathCommands`, và chốt canh quét
 *   kho gọi tên nó ra.
 */
const SYMBOL_RE = new RegExp(`\\\\(${Object.keys(SYMBOLS).join('|')})(?![a-zA-Z])`, 'g');

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
  // Chổi quét cuối: vứt mọi lệnh **còn sót**. Nó đọc như một lưới an toàn, nhưng nó
  // không phân biệt lệnh trình bày với lệnh mang nội dung — nó xoá cả hai, và xoá
  // im lặng. Đo được: `$(\sin x + \cos x)^2$` từng hiện lên OG card thành `( x + x)²`.
  //
  // Nên câu này chỉ được phép quét vào **chỗ trống**, và `unhandledMathCommands` bên
  // dưới cùng chốt canh của nó ép đúng điều ấy trên toàn kho.
  return replaceMath(source, (math) => convert(math).replace(/\\[a-zA-Z]+/g, '').trim());
}

/**
 * Lệnh nào của đoạn `$…$` này **không** ai xử — tức cái mà chổi quét cuối sắp nuốt.
 *
 * Tồn tại để chốt canh hỏi được câu tổng thay vì hỏi từng lệnh một: chữa `\sin` rồi
 * thì lệnh thứ 32 vẫn rơi vào chổi, và vẫn rơi im lặng. Quét kho bằng hàm này thì
 * bài kế tiếp gõ một lệnh mới biết ngay lúc `pnpm test`, chứ không phải lúc card đã
 * lên mạng.
 */
export function unhandledMathCommands(math: string): string[] {
  return [...convert(math).matchAll(/\\[a-zA-Z]+/g)].map((m) => m[0]);
}

/** Toàn bộ phép đổi, **trừ** chổi quét cuối. */
function convert(math: string): string {
  let out = structures(math);
  out = out.replace(SYMBOL_RE, (_whole, name: string, at: number, all: string) => {
    const word = SYMBOLS[name] as string;
    // Cùng lỗi dán dính với `GLUES`, chỉ khác chỗ dán: một tên phép toán đi sau một
    // **chữ cái** thì hai thứ đọc thành một. Đo trên kho: `$\sin 3x\cos x$` ra
    // `sin 3xcos x` ở 6 chỗ. Trước một **chữ số** thì không chèn — `2sin x`, `2min(a,b)`
    // đúng là lối viết người ta dùng, và chèn vào đó là sửa lời tác giả.
    const glued = /^[a-z]+$/.test(word) && /[A-Za-z]/.test(all[at - 1] ?? '');
    return glued ? ` ${word}` : word;
  });
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
  return out.replace(/\\([{}])|[{}]/g, (_whole, kept: string | undefined) => kept ?? '');
}

/**
 * Lệnh **có đối số** — thứ mà một bảng tra ký hiệu không xử được.
 *
 * `\frac{a}{b}` không phải một ký tự nào cả; bỏ tên lệnh đi thì còn `ab`, và `ab`
 * là một câu **sai** chứ không phải một câu xấu. Nên chỗ này phải đọc đối số, và
 * đọc bằng đếm ngoặc chứ không bằng regex: `\frac{1}{1-x^{2}}` có ngoặc lồng, mà
 * `\{([^{}]*)\}` thì dừng ở cái `}` đầu tiên nó gặp.
 *
 * Chạy **trước** bảng ký hiệu, vì đối số của chúng có thể chứa ký hiệu.
 */
function structures(math: string): string {
  let out = applyOperators(math);
  // `\begin{cases} A \\ B \end{cases}` — hệ phương trình. Trên một dòng chữ thì
  // không có ngoặc nhọn nào để vẽ, nên viết thành "A; B": mất hình, giữ nội dung.
  out = out.replace(
    /\\begin\{cases\}([\s\S]*?)\\end\{cases\}/g,
    (_w, body: string) =>
      body.split(/\\\\/).map((row) => row.trim()).filter(Boolean).join('; '),
  );
  out = out.replace(/\\begin\{[a-z*]+\}|\\end\{[a-z*]+\}/g, '');

  out = takesArgs(out, 'text', (a) => a);
  out = takesArgs(out, 'bar', (a) => `${a}̄`); // dấu ngang trên, ký tự tổ hợp
  out = takesArgs(out, 'pmod', (a) => `(mod ${a})`);
  out = takesArgs(out, 'sqrt', (a) => `√${wrap(a)}`);
  for (const name of ['dfrac', 'tfrac', 'frac'] as const) {
    out = takesArgs(out, name, (a, b) => `${wrap(a)}/${wrap(b as string)}`, 2);
  }
  return out;
}

/** Ngoặc chỉ khi cần: `1/2` đọc được, còn `1-x/2` thì đọc ra nghĩa khác. */
const wrap = (arg: string): string => (/^[\wÀ-ɏ₀-₉⁰-⁹]+$/.test(arg) ? arg : `(${arg})`);

/**
 * Tên phép toán **ăn một đối số** — và chỉ những tên mà điều đó đúng.
 *
 * `\tan\frac{a+b}{2}` là *tang của cả phân số*. Làm phẳng nó thành `tan(a+b)/2` cho ra
 * một biểu thức **khác** — đọc lên là "tang của $a+b$, chia 2" — nên đây là chữ sai
 * chứ không phải chữ xấu, trên đúng thứ người ta thấy khi ai đó chia sẻ link.
 *
 * Bảng này là **tập con** của phần tên phép toán trong `SYMBOLS`, và phần bị bỏ ra là
 * phần đáng nói: `\max`, `\gcd`, `\det`, `\lim`, `\deg` cũng là `\operatorname` của
 * KaTeX, nhưng `\max\frac{a}{b}` không phải một lối viết ai dùng — `\max` lấy đối số
 * qua ngoặc tròn hoặc qua một chỉ số dưới. Khai thừa ở đây không phải khai thừa vô
 * hại: mỗi tên thêm vào là một chỗ hàm này **thêm ngoặc vào thứ nó không hiểu**.
 */
const UNARY_OPERATORS = [
  'arccos', 'arcsin', 'arctan', 'cos', 'cot', 'csc', 'sec', 'sin', 'tan',
  'cosh', 'sinh', 'tanh', 'exp', 'ln', 'log',
];

/** Lệnh sinh ra **một cụm** — thứ duy nhất mà luật trên được phép bọc. */
const GROUPING_ARITY: Readonly<Record<string, number>> = { dfrac: 2, tfrac: 2, frac: 2, sqrt: 1 };

/**
 * `\op` **liền ngay** một cụm. Hai chỗ hẹp có chủ đích:
 *
 * - Chỉ `\frac`/`\sqrt`, **không** `_`/`^`. `\log_2 x` không phải "log ăn $2$" — chỉ số
 *   là chỉ số, và bọc nó lại thành `log(2) x` là dựng ra một phép nhân không ai viết.
 * - Chỉ khi **không có gì chen giữa**. `\tan\left(\dfrac{a+b}{2}\right)` đã có ngoặc
 *   của tác giả rồi; `\log_2\frac{a}{b}` thì vẫn phẳng như cũ, và để nguyên vì kho
 *   không có bài nào viết thế — thêm một nhánh cho một hình dạng chưa ai gõ là dựng
 *   một lời hứa không ai kiểm.
 *
 * Hai chỗ đó **không** cần lookahead sau tên phép toán: chính đòi hỏi "một `\` ngay
 * sau" đã là ranh giới từ rồi — `\tanh\frac…` không khớp vì sau `tan` là `h` chứ không
 * phải `\`. Lượt bẻ răng xác nhận bỏ nó đi không test nào đỏ, nên nó bị gỡ thay vì
 * giữ lại kèm một chú thích nói nó quan trọng. Lookahead sau **tên cụm** thì có gánh
 * việc: thiếu nó, một lệnh lạ như `\fracture` khớp nửa đầu rồi tra `GROUPING_ARITY`
 * bằng cả tên và nhận `undefined`.
 */
const OPERATOR_THEN_GROUP = new RegExp(
  `\\\\(?:${UNARY_OPERATORS.join('|')})\\\\(?:${Object.keys(GROUPING_ARITY).join('|')})(?![a-zA-Z])`,
);

/** Bọc cụm liền sau một tên phép toán vào ngoặc, rồi để bảng ký hiệu đổi tên như thường. */
function applyOperators(source: string): string {
  let out = '';
  let rest = source;
  for (;;) {
    const found = OPERATOR_THEN_GROUP.exec(rest);
    if (found === null) return out + rest;

    const whole = found[0];
    const groupAt = found.index + whole.lastIndexOf('\\');
    const group = /^\\([a-zA-Z]+)/.exec(rest.slice(groupAt))?.[1] as string;

    let cursor = groupAt + group.length + 1;
    for (let k = 0; k < (GROUPING_ARITY[group] as number); k += 1) {
      cursor = readArg(rest, cursor).next;
    }

    // Giữ nguyên `\tan` chứ không thay bằng `tan` ngay tại đây: bảng ký hiệu là chỗ
    // **duy nhất** biết tên nào đọc ra chữ gì, và chép lại phép đổi ấy sang đây là
    // dựng bản thứ hai của một câu trả lời.
    out += rest.slice(0, groupAt) + `(${structures(rest.slice(groupAt, cursor))})`;
    rest = rest.slice(cursor);
  }
}

/**
 * Chỗ mà một chữ cái đứng ngay sau sẽ **bị nuốt vào** thứ đứng trước.
 *
 * Tìm ra khi dò luật bọc ngoặc ở trên: `\max\frac{a}{b}` ra `/b`. Phân số bung thành
 * `a/b`, dán ngay sau `\max`, thành `\maxa/b` — một **tên lệnh khác**, không tên nào
 * trong bảng, nên chổi quét cuối xoá sạch cả cụm. Cùng lớp với `\sin` bị xoá im lặng
 * ở lượt trước, chỉ khác chỗ lệnh không phải do tác giả gõ mà do chính hàm này dán ra.
 *
 * `_`/`^` cũng dính theo cách ấy, và dính **sai nghĩa** chứ không mất chữ:
 * `\log_2\frac{a}{b}` ra `log_2a/b`, đọc lên là "log cơ số $2a$".
 *
 * Kho hôm nay chưa bài nào gõ hai hình dạng đó — `unhandledMathCommands` sẽ gọi tên
 * `\maxa` ra nếu có. Vá vì nó rẻ và vì cái răng kia chỉ canh được bài **đã** viết.
 */
const GLUES = /\\[a-zA-Z]+$|[_^]\{?[A-Za-z0-9]+$/;

/**
 * Thay mọi `\name` cùng $n$ đối số của nó. Đối số là một nhóm `{…}` **cân ngoặc**,
 * hoặc — khi tác giả viết `\bar S`, `\pmod 4` — đúng một ký tự kế tiếp.
 */
function takesArgs(
  source: string,
  name: string,
  build: (...args: string[]) => string,
  arity = 1,
): string {
  let out = '';
  let i = 0;
  const token = `\\${name}`;
  while (i < source.length) {
    const at = source.indexOf(token, i);
    // Ranh giới từ: `\barX` không phải `\bar` áp lên `X`, và `\int` không phải `\in`.
    if (at === -1 || /[a-zA-Z]/.test(source[at + token.length] ?? '')) {
      if (at === -1) break;
      out += source.slice(i, at + token.length);
      i = at + token.length;
      continue;
    }
    out += source.slice(i, at);
    let cursor = at + token.length;
    const args: string[] = [];
    for (let k = 0; k < arity; k += 1) {
      const arg = readArg(source, cursor);
      args.push(arg.value);
      cursor = arg.next;
    }
    const built = build(...args.map((a) => structures(a)));
    out += (GLUES.test(out) && /^[A-Za-z0-9]/.test(built) ? ' ' : '') + built;
    i = cursor;
  }
  return out + source.slice(i);
}

/**
 * Một đối số bắt đầu tại `cursor`: nhóm `{…}` **cân ngoặc**, hoặc — khi tác giả viết
 * `\bar S`, `\pmod 4` — đúng một ký tự kế tiếp.
 *
 * Đếm ngoặc chứ không regex: `\frac{1}{1-x^{2}}` có ngoặc lồng, mà `\{([^{}]*)\}` thì
 * dừng ở cái `}` đầu tiên nó gặp. Hai chỗ gọi — `takesArgs` cần **nội dung** của đối
 * số, `applyOperators` chỉ cần biết nó **kết thúc ở đâu** — và cả hai phải trả lời
 * giống hệt nhau, nếu không thì cụm bị bọc sẽ lệch với cụm bị thay.
 */
function readArg(source: string, from: number): { value: string; next: number } {
  let cursor = from;
  while (source[cursor] === ' ') cursor += 1;
  if (source[cursor] === '{') {
    let depth = 0;
    const start = cursor + 1;
    while (cursor < source.length) {
      if (source[cursor] === '{') depth += 1;
      else if (source[cursor] === '}' && (depth -= 1) === 0) break;
      cursor += 1;
    }
    return { value: source.slice(start, cursor), next: cursor + 1 };
  }
  if (cursor < source.length) return { value: source[cursor] as string, next: cursor + 1 };
  return { value: '', next: cursor };
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
