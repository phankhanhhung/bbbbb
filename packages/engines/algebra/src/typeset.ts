import { UNITS_PER_CELL } from '@combviz/render';
import type { Expr, TermId } from './expr.js';
import { FUNCTIONS } from './functions.js';

/**
 * Sắp chữ biểu thức — **phần rủi ro nhất của cả engine** (`ENGINE-ALGEBRA.md` §18).
 *
 * Engine tự in từ cây, **không** qua label atlas. Lý do có số liệu: atlas là bảng
 * tra phải dựng lại mỗi lần nội dung đổi, và quên dựng thì hình hiện chữ đỏ — kho đã
 * xuất bản một bài như thế suốt bốn hạng mục (M45). `longdiv` in $c\,x^k$ thẳng từ
 * model và không bao giờ cũ được; ở đây ngữ pháp rộng hơn nhưng vẫn đóng và biết trước.
 *
 * Làm hai lượt, như mọi bộ sắp chữ toán:
 *
 *   1. **Đo** — mỗi hộp khai `w` (bề ngang), `above`/`below` (vươn lên/xuống so với
 *      **đường chân của chính nó**). Phân số và số mũ đổi đường chân, nên không đo
 *      được bằng một con số chiều cao.
 *   2. **Đặt** — đi lại cây với một gốc toạ độ, phát ra glyph tuyệt đối.
 *
 * Trục (`AXIS`) là chỗ vạch phân số nằm, và là chỗ hai phân số cạnh nhau gióng theo.
 * Không có nó thì $\frac ab + \frac cd$ có hai vạch lệch nhau.
 */

/** Quy ước G-10 — cỡ một ô, hằng số duy nhất mọi engine dùng chung. */
export const ROW = UNITS_PER_CELL;
export const FONT = 5;

/** Tỉ lệ so với cỡ chữ hiện hành. */
const ASCENT = 0.72;
const DESCENT = 0.24;
/** Chiều cao trục: vạch phân số và dấu $=$ nằm ở đây. */
const AXIS = 0.28;
/** Cỡ chữ tầng số mũ và tầng phân số lồng. */
const SCRIPT = 0.68;

/**
 * **Sàn cỡ chữ.** Teo bao nhiêu tầng cũng không xuống dưới đây.
 *
 * TeX có đúng ba cỡ — text, script, scriptscript — rồi **dừng**; số mũ của số mũ của
 * số mũ vẫn vẽ bằng scriptscript. Không dừng thì mỗi tầng lồng nhân thêm một hệ số
 * $<1$, và số đo trên engine này là $0{,}82$ mỗi tầng phân thức: tầng 5 còn $1{,}85$
 * đơn vị $\approx 8$px trên thiết bị đích, tức là có vẽ mà không đọc được.
 *
 * $0{,}6$ của cỡ gốc là $3{,}0$ đơn vị $\approx 13$px — cỡ chỉ số dưới của một cuốn
 * sách in. Đổi lại cây lồng sâu **cao** hơn, và chiều cao thì có trần đo được (§1.2);
 * cỡ chữ thì không, nên phải chặn ở đây.
 */
const SIZE_FLOOR = FONT * 0.6;

/** Teo một cỡ chữ, nhưng không qua sàn. Mọi chỗ thu nhỏ đi qua đây. */
export const shrink = (size: number, factor: number): number =>
  Math.max(size * factor, SIZE_FLOOR);
const SUP_RISE = 0.46;
/**
 * Đáy số mũ phải cao hơn đường chân cơ số ít nhất chừng này (đo theo vươn lên của cơ số).
 *
 * $0{,}22$ chọn để **số mũ là chữ số thì không xê dịch một li**: một chữ số ở cỡ
 * `SCRIPT` có `below` nhỏ nên `SUP_RISE` vẫn thắng, và cả kho giữ nguyên hình.
 */
const SUP_CLEAR = 0.22;

/**
 * Nâng số mũ lên bao nhiêu.
 *
 * `SUP_RISE` một mình đủ khi số mũ là một chữ số — nó **chỉ nhìn cơ số**, và với một
 * glyph con con thì thế là đủ. Nay số mũ là `Expr`, nên nó có thể là một phân số, và
 * phân số thì thò xuống dưới đường chân của **chính nó** rất sâu. Kết quả trên trang:
 * $x^{1/2}$ vẽ ra thành $x$ đứng cạnh $\frac12$ ngang tầm mắt — đọc là "x một phần
 * hai" chứ không phải "x mũ một phần hai". Bẫy cũ: một hằng số hiệu chỉnh cho một
 * hình dạng, rồi hình dạng ấy thôi độc quyền.
 *
 * Nên nâng theo **đáy của số mũ**, không theo mỗi cơ số.
 */
const supRise = (base: Metrics, exp: Metrics): number =>
  Math.max(base.above * SUP_RISE, exp.below + base.above * SUP_CLEAR);

/** Hạ chỉ số dưới bao nhiêu — gương của `supRise`, đo theo vươn xuống của cơ số. */
const SUB_DROP = 0.2;
const SUB_CLEAR = 0.34;
const subDrop = (base: Metrics, sub: Metrics): number =>
  Math.max(base.above * SUB_DROP, sub.above * SUB_CLEAR + base.below);

/** Hở dọc giữa hai dòng của một chồng; bề ngang ngoặc nhọn; hở sau ngoặc. */
const STACK_GAP = 0.42;
const BRACE_W = 0.42;
const BRACE_PAD = 0.26;

/** Ký hiệu $\sum$ vẽ to hơn cỡ chữ dòng; hở giữa nó và hai cận; hở trước thân. */
const BIG_GLYPH = 1.5;
const BIG_GAP = 0.14;
const BIG_BODY_GAP = 0.22;

/** Hở tối thiểu giữa đáy số mũ và đỉnh chỉ số dưới, theo cỡ chữ của cụm. */
const SUBSUP_GAP = 0.12;

/**
 * Nâng số mũ và hạ chỉ số dưới bao nhiêu — tính **một chỗ** cho `measure` và `place`.
 *
 * `supRise` và `subDrop` mỗi cái chỉ nhìn *một* tầng, nên chúng không biết tầng kia ở
 * đâu. Ở cỡ chữ thường thì thừa chỗ nên không sao; xuống tới sàn `SIZE_FLOOR` — $C_n^k$
 * lồng trong chỉ số dưới của một $C_n^k$ khác — hai tầng đụng nhau, và lượt quét chồng
 * chữ bắt được đúng $0{,}07$ đơn vị. Nên phải có một chỗ nhìn **cả hai** rồi đẩy ra.
 *
 * Đẩy đều hai phía: dồn hết vào một phía thì cụm lệch khỏi đường chân của dòng.
 */
function subsupShift(
  base: Metrics,
  sub: Metrics,
  sup: Metrics,
  size: number,
): { rise: number; drop: number } {
  const rise = supRise(base, sup);
  const drop = subDrop(base, sub);
  const have = rise - sup.below + (drop - sub.above);
  const need = size * SUBSUP_GAP;
  const push = Math.max(0, need - have) / 2;
  return { rise: rise + push, drop: drop + push };
}
/** Hở trên/dưới vạch phân số. */
const FRAC_GAP = 0.18;
const FRAC_PAD = 0.22;
const THIN = 0.18;
const MED = 0.3;

/* ---------- bảng bề ngang, đo cho **bảng chữ của riêng engine này** ---------- */

/**
 * Bề ngang **advance** của từng glyph, theo `em`, đọc thẳng từ bảng `hmtx` của
 * `KaTeX_Main-Regular` (và `KaTeX_Size1-Regular` cho hai toán tử lớn).
 *
 * `estimateTextWidth` ước đều $0{,}55$ em cho mọi ký tự và cố ý ước dôi — đúng cho
 * việc nó sinh ra (chừa lề caption), sai ở đây: sai số bề ngang đẩy số mũ trôi khỏi
 * cơ số và $x ^2$ đọc thành hai vật rời nhau.
 *
 * **Bản trước ước bằng mắt và ước thiếu ở đúng nhóm toán tử** (M76): `+` khai
 * $0{,}62$ trong khi glyph thật rộng $0{,}778$, `=` khai $0{,}66$ so với $0{,}778$,
 * `(` khai $0{,}32$ so với $0{,}389$. Hệ quả nhìn thấy được trên mọi công thức đã
 * xuất bản: `binop` chừa hở **đối xứng** hai bên dấu, nhưng glyph rộng hơn ô đã
 * chừa nên nó ăn hết hở bên phải — trang in ra `x +1` thay vì `x + 1`. Số dưới đây
 * đọc bằng máy từ chính tệp font, nên nó hết là chuyện thẩm mỹ.
 */
const EM: Readonly<Record<string, number>> = {
  ' ': 0.25,
  '∞': 1.0,
  '+': 0.778,
  '−': 0.778,
  '=': 0.778,
  '<': 0.778,
  '>': 0.778,
  '≤': 0.778,
  '≥': 0.778,
  // `≠` **không có trong font KaTeX nào**. Nó được vẽ tay: dấu `=` cộng một nét
  // chéo (xem `place`), nên bề ngang của nó là bề ngang dấu `=`.
  '≠': 0.778,
  // Dấu nhân là `⋅` (U+22C5 DOT OPERATOR), không phải `·` (U+00B7 MIDDLE DOT):
  // ký tự sau là dấu câu và **không có** trong KaTeX_Main, nên nó rơi xuống font
  // hệ thống — một chấm lạc phông giữa dòng công thức.
  '⋅': 0.278,
  '(': 0.389,
  ')': 0.389,
  '[': 0.278,
  ']': 0.278,
  '{': 0.5,
  '_': 0.5,
  '!': 0.278,
  '√': 0.833,
  // Hai toán tử lớn đọc từ **KaTeX_Size1-Regular** — chúng không có trong
  // KaTeX_Main (xem `MATH_OP_GLYPHS`). Bản trước để chúng rơi vào mặc định chữ cái
  // $0{,}5$, tức chừa chỗ **bằng một nửa** thứ được vẽ ra, và trên hình thì $\prod$
  // đâm thẳng vào dấu ngoặc đứng sau nó.
  '∑': 1.056,
  '∏': 0.944,
};

/**
 * Glyph **không** nằm trong `KaTeX_Main` — phải khai font riêng, nếu không trình
 * duyệt lặng lẽ rơi xuống font hệ thống và vẽ chúng bằng một typeface khác cả dòng.
 *
 * Đây không phải chuyện lý thuyết: `KaTeX_Main-Regular` không chứa `∑` cũng không
 * chứa `∏` (quét `cmap` mà ra), nên suốt từ M57 tới M75 mọi dấu tổng và dấu tích
 * của kho đều được vẽ bằng serif hệ thống.
 */
const MATH_OP_GLYPHS = new Set(['∑', '∏']);

/**
 * Font của hai toán tử lớn.
 *
 * `Size1` trước `Size2`: engine đã tự phóng ký hiệu lên $1{,}5$ lần (`BIG_GLYPH`),
 * nên lấy bản nhỏ rồi phóng cho ra đúng nét mà KaTeX vẽ ở display style. Lấy
 * `Size2` rồi phóng nữa thì nét dày quá so với dòng chữ quanh nó.
 */
const MATH_OP_FAMILY = "'KaTeX_Size1', 'KaTeX_Size2', 'Latin Modern Math', serif";

/**
 * Bề ngang từng chữ cái, `em`, đọc từ `hmtx` — **hai bảng, vì có hai mặt chữ**.
 *
 * Biến của công thức vẽ **nghiêng** (`font-style: italic` ⇒ `KaTeX_Main-Italic`),
 * còn tên hàm và chữ trong nhãn vẽ **đứng** (`KaTeX_Main-Regular`). Hai mặt ấy có
 * advance khác nhau tới $0{,}096$ em (chữ `b`: $0{,}556$ đứng so với $0{,}460$
 * nghiêng), nên đo một mặt rồi vẽ mặt kia là sai ở mọi biến.
 *
 * Bản trước ước **đều $0{,}5$ em cho mọi chữ thường** (M76 đo lại). Sai số thật:
 * `m` nghiêng rộng $0{,}818$ — chừa $0{,}5$ tức thiếu $64\%$, và trên trang thì chữ
 * sau nó bị đè; `l` nghiêng rộng $0{,}256$ — chừa $0{,}5$ tức dôi gấp đôi, ra một
 * lỗ trống giữa dòng. Chữ hoa thì đã có bảng đo đúng từ M56, chỉ thiếu mặt nghiêng.
 */
const LOWER_EM: Readonly<Record<string, number>> = {
  a: 0.5, b: 0.556, c: 0.444, d: 0.556, e: 0.444, f: 0.306, g: 0.5,
  h: 0.556, i: 0.278, j: 0.306, k: 0.528, l: 0.278, m: 0.833, n: 0.556,
  o: 0.5, p: 0.556, q: 0.528, r: 0.392, s: 0.394, t: 0.389, u: 0.556,
  v: 0.528, w: 0.722, x: 0.528, y: 0.528, z: 0.444,
};

const UPPER_EM: Readonly<Record<string, number>> = {
  A: 0.75, B: 0.708, C: 0.722, D: 0.764, E: 0.681, F: 0.653, G: 0.785,
  H: 0.75, I: 0.361, J: 0.514, K: 0.778, L: 0.625, M: 0.917, N: 0.75,
  O: 0.778, P: 0.681, Q: 0.778, R: 0.736, S: 0.556, T: 0.722, U: 0.75,
  V: 0.75, W: 1.028, X: 0.75, Y: 0.75, Z: 0.611,
};

/** Mặt **nghiêng** — bảng của biến, tức của gần hết mọi chữ trên hình. */
const ITALIC_EM: Readonly<Record<string, number>> = {
  a: 0.511, b: 0.46, c: 0.46, d: 0.511, e: 0.46, f: 0.307, g: 0.46,
  h: 0.511, i: 0.307, j: 0.307, k: 0.46, l: 0.256, m: 0.818, n: 0.562,
  o: 0.511, p: 0.511, q: 0.46, r: 0.422, s: 0.409, t: 0.332, u: 0.537,
  v: 0.46, w: 0.664, x: 0.464, y: 0.486, z: 0.409,
  A: 0.743, B: 0.704, C: 0.716, D: 0.755, E: 0.678, F: 0.653, G: 0.774,
  H: 0.743, I: 0.386, J: 0.525, K: 0.769, L: 0.627, M: 0.897, N: 0.743,
  O: 0.767, P: 0.678, Q: 0.767, R: 0.729, S: 0.562, T: 0.716, U: 0.743,
  V: 0.743, W: 0.999, X: 0.743, Y: 0.743, Z: 0.613,
};

/** Chữ không có trong bảng nào — dấu tiếng Việt trong nhãn luật chẳng hạn. */
const LETTER_EM = 0.5;
const DIGIT_EM = 0.5;

/**
 * Bề ngang **cả tên hàm**, không cộng từng chữ.
 *
 * `ln` cộng từng chữ ra $1{,}0$ em, còn glyph thật chỉ rộng $0{,}778$ — chữ `l` hẹp
 * bằng nửa chữ `n`. Dôi $0{,}22$ em đủ để trên trang thấy một khe hở giữa `ln` và
 * dấu ngoặc, đọc thành hai vật rời nhau. Số lấy từ metric KaTeX_Main.
 */
const WORD_EM: Readonly<Record<string, number>> = {
  ln: 0.778,
  log: 1.278,
  exp: 1.444,
  sin: 1.172,
  cos: 1.338,
  tan: 1.389,
};

/** Làm tròn toạ độ để lệnh path không dài lê thê vì sai số dấu phẩy động. */
const round = (v: number): number => Math.round(v * 1000) / 1000 + 0;

/**
 * `italic` **không** có giá trị mặc định vô hại: gần hết chữ trên hình là biến, tức
 * là nghiêng. Chỗ gọi nào quên truyền thì nó đo bằng mặt đứng và sai đúng nhóm ký
 * tự đông nhất.
 */
export function textWidth(value: string, size: number, italic = false): number {
  const word = WORD_EM[value];
  if (word !== undefined) return word * size;
  let em = 0;
  for (const ch of value) {
    const letter = italic ? ITALIC_EM[ch] : (LOWER_EM[ch] ?? UPPER_EM[ch]);
    em += EM[ch] ?? letter ?? (ch >= '0' && ch <= '9' ? DIGIT_EM : LETTER_EM);
  }
  return em * size;
}

/* ---------- hộp ---------- */

export type Box =
  | { t: 'text'; s: string; size: number; italic: boolean }
  /**
   * Khoảng hở thuần hình học.
   *
   * Không dùng ký tự trắng trong `<text>` để chừa chỗ: chuỗi `" = "` render đúng khi
   * serialize ra SVG nhưng **mất khoảng trắng đầu** khi đi qua lớp patch DOM của
   * Player, nên `a = b` hiện ra thành `a= b`. Lỗi chỉ thấy khi mở Player, không thấy
   * ở SVG rời — cùng họ với mọi lỗi mà golden không bắt được. Khoảng cách là bố cục,
   * nên nó phải sống ở tầng bố cục.
   */
  | { t: 'gap'; w: number }
  | { t: 'row'; items: readonly Box[] }
  | { t: 'frac'; num: Box; den: Box; size: number }
  | { t: 'sup'; base: Box; exp: Box }
  | { t: 'paren'; inner: Box; size: number }
  /**
   * Dấu căn: móc bên trái, vạch trùm lên trên toàn bộ ruột.
   *
   * Vẽ bằng **path**, không phóng to glyph `√`: glyph có tỉ lệ cố định nên phóng lên
   * cho vừa một phân số hai tầng thì nét dày ra và cái móc thò xuống dưới đường chân.
   * Vạch trùm cũng phải dài đúng bằng ruột — đó là thứ nói cho người đọc biết căn ăn
   * tới đâu, và ăn sai một hạng tử là đọc ra một biểu thức khác.
   */
  | { t: 'radical'; inner: Box; index: number; size: number }
  /** Giá trị tuyệt đối: hai vạch đứng cao bằng ruột. */
  | { t: 'bars'; inner: Box; size: number }
  /** Dịch đường chân xuống `dy` — chỉ số dưới. */
  | { t: 'shift'; dy: number; inner: Box }
  /**
   * Chỉ số dưới **và** số mũ trên cùng một gốc — $C_n^k$, lối Việt Nam.
   *
   * Không ghép được từ `sup` và `shift`: hai tầng ấy phải **chồng cột** với nhau, tức
   * bề ngang của cả cụm là `max` chứ không phải tổng. Ghép hai hộp cũ cho ra
   * $C_n{}^k$ — chỉ số dưới rồi mới tới số mũ, đọc ra một thứ khác.
   */
  | { t: 'subsup'; base: Box; sub: Box; sup: Box; size: number }
  /**
   * Ký hiệu tổng/tích với **cận trên và cận dưới**, kiểu display.
   *
   * Khác `subsup` ở chỗ hai cận nằm **trên và dưới** ký hiệu chứ không bên phải, và cả
   * cụm ký-hiệu-cùng-cận thì căn giữa theo trục dọc. Đó cũng là lý do nó không ghép được
   * từ `subsup`: bề ngang là `max(glyph, cận trên, cận dưới)`, còn thân đứng bên phải.
   */
  | { t: 'big'; glyph: string; lower: Box; upper: Box; body: Box; size: number }
  /**
   * Một chồng dòng, có thể kèm ngoặc nhọn — hệ phương trình.
   *
   * `lead` là bề ngang phần **trước** dấu quan hệ của từng dòng, và nó là cả lý do hộp
   * này tồn tại: các dấu $=$ phải gióng thẳng cột thì một hệ mới đọc được, còn không thì
   * nó nhìn như hai dòng rời nhau. Đo `lead` ở `toBox` (chỗ duy nhất còn thấy cây), rồi
   * `place` đẩy mỗi dòng sang phải $\max(\text{lead}) - \text{lead}$.
   */
  | {
      t: 'stack';
      brace: '{' | null;
      rows: readonly { box: Box; lead: number }[];
      size: number;
    }
  /** Bọc danh tính: không đổi hình học, chỉ nói "phần này là nút `id`". */
  | { t: 'tag'; id: TermId; inner: Box };

export interface Metrics {
  readonly w: number;
  readonly above: number;
  readonly below: number;
}

export function measure(box: Box): Metrics {
  switch (box.t) {
    case 'text':
      return {
        w: textWidth(box.s, box.size, box.italic),
        above: box.size * ASCENT,
        below: box.size * DESCENT,
      };
    case 'gap':
      return { w: box.w, above: 0, below: 0 };
    case 'tag':
      return measure(box.inner);
    case 'shift': {
      const m = measure(box.inner);
      return { w: m.w, above: Math.max(0, m.above - box.dy), below: m.below + box.dy };
    }
    case 'row': {
      const ms = box.items.map(measure);
      return {
        w: ms.reduce((s, m) => s + m.w, 0),
        above: Math.max(0, ...ms.map((m) => m.above)),
        below: Math.max(0, ...ms.map((m) => m.below)),
      };
    }
    case 'sup': {
      const b = measure(box.base);
      const e = measure(box.exp);
      const rise = supRise(b, e);
      return {
        w: b.w + e.w,
        above: Math.max(b.above, rise + e.above),
        below: b.below,
      };
    }
    case 'subsup': {
      const b = measure(box.base);
      const sb = measure(box.sub);
      const sp = measure(box.sup);
      const { rise, drop } = subsupShift(b, sb, sp, box.size);
      return {
        // Hai tầng **chồng cột**, nên bề ngang là `max` — đó là cả điểm của hộp này.
        w: b.w + Math.max(sb.w, sp.w),
        above: Math.max(b.above, rise + sp.above),
        below: Math.max(b.below, drop + sb.below),
      };
    }
    case 'stack': {
      const ms = box.rows.map((r) => measure(r.box));
      const lead = Math.max(0, ...box.rows.map((r) => r.lead));
      const tail = Math.max(0, ...ms.map((m, i) => m.w - (box.rows[i] as { lead: number }).lead));
      const step = box.size * STACK_GAP;
      let h = 0;
      ms.forEach((m, i) => {
        h += m.above + m.below + (i > 0 ? step : 0);
      });
      const head = box.brace === null ? 0 : box.size * (BRACE_W + BRACE_PAD);
      // Cả chồng căn giữa quanh trục của dòng: một hệ hai phương trình phải có dấu $=$
      // của nó nằm hai bên đường chân, không treo lên trên.
      const axis = box.size * AXIS;
      return { w: head + lead + tail, above: h / 2 + axis, below: h / 2 - axis };
    }
    case 'big': {
      const g = measure({ t: 'text', s: box.glyph, size: box.size * BIG_GLYPH, italic: false });
      const up = measure(box.upper);
      const lo = measure(box.lower);
      const body = measure(box.body);
      const gap = box.size * BIG_GAP;
      const head = Math.max(g.w, up.w, lo.w);
      return {
        w: head + box.size * BIG_BODY_GAP + body.w,
        above: Math.max(g.above + gap + up.below + up.above, body.above),
        below: Math.max(g.below + gap + lo.above + lo.below, body.below),
      };
    }
    case 'frac': {
      const n = measure(box.num);
      const d = measure(box.den);
      const gap = box.size * FRAC_GAP;
      const axis = box.size * AXIS;
      return {
        w: Math.max(n.w, d.w) + box.size * FRAC_PAD * 2,
        above: axis + gap + n.below + n.above,
        below: -axis + gap + d.above + d.below,
      };
    }
    case 'radical': {
      const inner = measure(box.inner);
      const hook = box.size * RAD_HOOK;
      const idx = box.index === 2 ? 0 : textWidth(String(box.index), shrink(box.size, RAD_INDEX));
      return {
        w: hook + idx + inner.w + box.size * RAD_PAD,
        above: inner.above + box.size * RAD_LIFT,
        below: inner.below,
      };
    }
    case 'bars': {
      const inner = measure(box.inner);
      return { w: inner.w + box.size * BAR_PAD * 2, above: inner.above, below: inner.below };
    }
    case 'paren': {
      const inner = measure(box.inner);
      const { w, above, below } = parenMetrics(inner, box.size);
      return { w: inner.w + 2 * w, above, below };
    }
  }
}

/** Bề ngang cái móc, độ nhô của vạch trùm, và hở phải. */
const RAD_HOOK = 0.62;
/** Cỡ chỉ số căn — nhỏ hơn số mũ, vì nó ngồi trong góc chứ không đứng riêng. */
const RAD_INDEX = 0.52;
/** Hở hai bên vạch đứng của dấu giá trị tuyệt đối. */
const BAR_PAD = 0.26;
const RAD_LIFT = 0.34;
const RAD_PAD = 0.16;

/**
 * Hình dạng ngoặc: **độ cong** và **chỗ đứng** là hai số khác nhau.
 *
 * Bản đầu của M76 gộp chúng làm một — cung bẻ sâu đúng bằng bề ngang đã chừa — và
 * lượt nhìn cho ra ngay hai lỗi: ngoặc ngắn phình thành cái ngoặc vuông bè, còn hai
 * ngoặc kề nhau `)(` chạm bụng nhau thành một hình thấu kính. Tách ra thì mỗi số
 * chữa một chuyện: `PAREN_BOW` lo dáng, `PAREN_SIDE` lo khoảng hở.
 *
 * Độ cong tỉ lệ với chiều cao nhưng **có trần và có sàn**: ngoặc của một dòng chữ
 * cong như ngoặc bình thường, ngoặc trùm bốn dòng thì tương đối *thẳng hơn* — đúng
 * như mọi bộ font toán vẽ, vì một cung giữ nguyên tỉ lệ ở chiều cao gấp bốn sẽ loe
 * ra thành dấu ngoặc nhọn.
 */
const PAREN_BOW = 0.13;
const PAREN_BOW_MIN = 0.2;
const PAREN_BOW_MAX = 0.55;
/**
 * Hở giữa mép cung và mép hộp — chỗ giữ cho `)(` không dính vào nhau.
 *
 * $0{,}17$ chọn để bề ngang cả ngoặc xấp xỉ advance $0{,}389$ em của glyph `(`
 * trong KaTeX_Main: đổi cách vẽ mà không đổi nhịp dòng.
 */
const PAREN_SIDE = 0.17;
/**
 * Hở **trong lòng** ngoặc, giữa đầu cung và mực của ruột.
 *
 * Một glyph ngoặc mang sẵn side bearing hai bên; một cung vẽ tay thì không, nên đầu
 * cung nằm đúng mép hộp của ruột và chữ nghiêng — vốn thò ra ngoài advance — chạm
 * vào nó. Thấy ở $(c+d)$: bụng chữ `d` dính vào ngoặc đóng.
 */
const PAREN_INNER = 0.09;
/** Ngoặc nhô ra ngoài ruột chừng này để nó ôm chứ không cắt ngang. */
const PAREN_LIP = 0.06;

/**
 * Hình học của một cặp ngoặc — **không** phải một glyph phóng to (M76).
 *
 * Bản trước lấy glyph `(` rồi kéo `font-size` lên cho bằng chiều cao ruột. Nét của
 * một glyph dày theo cỡ chữ, nên một ngoặc bọc phân số lồng hai tầng có nét **dày
 * gấp 3,68 lần** ngoặc thường nằm ngay cạnh nó — đo trên chính cây hộp, không phải
 * cảm giác. Trên trang nó ra một cục đậm bên cạnh mấy ngoặc mảnh.
 *
 * Và kho này **đã biết** bài học ấy: `{` của hệ và móc của dấu căn đều vẽ bằng path
 * với đúng lời giải thích "glyph có tỉ lệ cố định nên kéo cho cao thì nét dày ra".
 * Ngoặc tròn là chỗ duy nhất còn làm ngược. Nay nó cũng là path: **cao theo ruột,
 * nét không đổi**, bề ngang loe nhẹ để một ngoặc cao không thành cái kim.
 *
 * Cổ tức kèm theo: bớt một chỗ phụ thuộc font. Ngoặc nay vẽ ra giống hệt nhau ở
 * trình duyệt và ở ảnh tĩnh, dù font nào được nạp.
 */
function parenMetrics(
  inner: Metrics,
  size: number,
): { w: number; bow: number; above: number; below: number } {
  const above = Math.max(inner.above, size * ASCENT) + size * PAREN_LIP;
  const below = Math.max(inner.below, size * DESCENT) + size * PAREN_LIP;
  const bow = Math.min(
    Math.max((above + below) * PAREN_BOW, size * PAREN_BOW_MIN),
    size * PAREN_BOW_MAX,
  );
  return { w: bow + size * (PAREN_SIDE + PAREN_INNER), bow, above, below };
}

/* ---------- glyph đã đặt ---------- */

export interface PlacedGlyph {
  readonly s: string;
  readonly x: number;
  /** Đường chân. */
  readonly y: number;
  readonly size: number;
  readonly italic: boolean;
  /**
   * Họ font **đè lên** mực chung của engine, cho glyph không có trong `KaTeX_Main`.
   *
   * Vắng mặt ở gần hết mọi glyph, và đó là chủ ý: một trường có mặt ở đây nghĩa là
   * "chỗ này font mặc định **không vẽ được**", chứ không phải một chỗ để chỉnh
   * kiểu chữ cho đẹp.
   */
  readonly family?: string;
  /** Nút gần nhất bao lấy glyph này — dùng để tô khi nhấn. */
  readonly owner: TermId | null;
}

/**
 * Hộp mực của một glyph đã đặt — bề ngang thật và vươn lên/xuống thật.
 *
 * Có mặt để chốt canh "không chồng chữ" hỏi được câu đúng. Hỏi "cùng đường chân và
 * cách nhau đủ xa" là hỏi hụt: hai vật nguy hiểm nhất của engine này — số mũ đè cơ số,
 * tử phân số đè vạch — nằm ở **hai đường chân khác nhau**, nên phép so ấy bỏ qua đúng
 * chỗ cần nhìn. Trả hộp ra đây để phép so là so hộp với hộp, hai chiều.
 */
export const glyphBox = (
  g: PlacedGlyph,
): { x1: number; x2: number; y1: number; y2: number } => ({
  x1: g.x,
  x2: g.x + textWidth(g.s, g.size, g.italic),
  y1: g.y - g.size * ASCENT,
  y2: g.y + g.size * DESCENT,
});

export interface PlacedRule {
  readonly x1: number;
  readonly x2: number;
  readonly y: number;
  readonly width: number;
  readonly owner: TermId | null;
}

/** Hộp bao của một nút, theo `TermId`. */
export interface NodeBox {
  readonly id: TermId;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PlacedPath {
  readonly d: string;
  readonly width: number;
  readonly owner: TermId | null;
}

export interface Placed {
  readonly glyphs: readonly PlacedGlyph[];
  readonly rules: readonly PlacedRule[];
  readonly paths: readonly PlacedPath[];
  readonly boxes: readonly NodeBox[];
  readonly metrics: Metrics;
}

/**
 * Đặt hộp vào toạ độ tuyệt đối.
 *
 * `x` là mép trái, `y` là **đường chân** của hộp.
 */
export function place(box: Box, x: number, y: number): Placed {
  const glyphs: PlacedGlyph[] = [];
  const rules: PlacedRule[] = [];
  const paths: PlacedPath[] = [];
  const boxes: NodeBox[] = [];

  const go = (b: Box, bx: number, by: number, owner: TermId | null): Metrics => {
    switch (b.t) {
      case 'text': {
        const m = measure(b);
        if (b.s === '≠') {
          /**
           * `≠` **không có trong font KaTeX nào** — quét cả mười tệp mà không ra.
           * Nên vẽ nó: dấu `=` từ font, cộng một nét chéo. Cùng lối KaTeX dựng
           * `\neq`, và cùng lý lẽ đã cho `{` và `√` là path chứ không phải glyph.
           */
          glyphs.push({ s: '=', x: bx, y: by, size: b.size, italic: false, owner });
          const cx = bx + m.w / 2;
          const mid = by - b.size * 0.25;
          paths.push({
            d:
              `M${round(cx - b.size * 0.16)} ${round(mid + b.size * 0.34)}` +
              `L${round(cx + b.size * 0.16)} ${round(mid - b.size * 0.34)}`,
            width: b.size * 0.07,
            owner,
          });
          return m;
        }
        glyphs.push({
          s: b.s,
          x: bx,
          y: by,
          size: b.size,
          italic: b.italic,
          ...(MATH_OP_GLYPHS.has(b.s) ? { family: MATH_OP_FAMILY } : {}),
          owner,
        });
        return m;
      }
      case 'tag': {
        const m = go(b.inner, bx, by, b.id);
        boxes.push({
          id: b.id,
          x: bx,
          y: by - m.above,
          width: Math.max(m.w, FONT * 0.3),
          height: m.above + m.below,
        });
        return m;
      }
      case 'gap':
        return measure(b);
      case 'shift':
        go(b.inner, bx, by + b.dy, owner);
        return measure(b);
      case 'row': {
        let cx = bx;
        for (const item of b.items) cx += go(item, cx, by, owner).w;
        return measure(b);
      }
      case 'sup': {
        const bm = measure(b.base);
        go(b.base, bx, by, owner);
        go(b.exp, bx + bm.w, by - supRise(bm, measure(b.exp)), owner);
        return measure(b);
      }
      case 'subsup': {
        const bm = measure(b.base);
        const { rise, drop } = subsupShift(bm, measure(b.sub), measure(b.sup), b.size);
        go(b.base, bx, by, owner);
        go(b.sup, bx + bm.w, by - rise, owner);
        go(b.sub, bx + bm.w, by + drop, owner);
        return measure(b);
      }
      case 'stack': {
        const m = measure(b);
        const ms = b.rows.map((r) => measure(r.box));
        const lead = Math.max(0, ...b.rows.map((r) => r.lead));
        const step = b.size * STACK_GAP;
        const head = b.brace === null ? 0 : b.size * (BRACE_W + BRACE_PAD);
        const top = by - m.above;

        let y = top;
        ms.forEach((rm, i) => {
          y += rm.above;
          const row = b.rows[i] as { box: Box; lead: number };
          go(row.box, bx + head + (lead - row.lead), y, owner);
          y += rm.below + step;
        });

        if (b.brace !== null) {
          const w = b.size * BRACE_W;
          const bottom = by + m.below;
          const mid = (top + bottom) / 2;
          // Vẽ bằng path chứ không phóng to glyph `{`: glyph có tỉ lệ cố định nên kéo
          // cho cao bằng ba dòng thì nét dày ra và hai cái móc méo hẳn. Cùng lý lẽ với
          // dấu căn.
          paths.push({
            d:
              `M${round(bx + w)} ${round(top)}` +
              `Q${round(bx + w * 0.35)} ${round(top)} ${round(bx + w * 0.35)} ${round(top + (mid - top) * 0.45)}` +
              `Q${round(bx + w * 0.35)} ${round(mid)} ${round(bx)} ${round(mid)}` +
              `Q${round(bx + w * 0.35)} ${round(mid)} ${round(bx + w * 0.35)} ${round(mid + (bottom - mid) * 0.55)}` +
              `Q${round(bx + w * 0.35)} ${round(bottom)} ${round(bx + w)} ${round(bottom)}`,
            width: b.size * 0.07,
            owner,
          });
        }
        return m;
      }
      case 'big': {
        const m = measure(b);
        const glyph: Box = { t: 'text', s: b.glyph, size: b.size * BIG_GLYPH, italic: false };
        const g = measure(glyph);
        const up = measure(b.upper);
        const lo = measure(b.lower);
        const gap = b.size * BIG_GAP;
        const head = Math.max(g.w, up.w, lo.w);
        // Ký hiệu và hai cận **căn giữa theo cột**: lệch cột thì mắt đọc cận trên như
        // một số mũ của thứ đứng trước.
        go(glyph, bx + (head - g.w) / 2, by, owner);
        go(b.upper, bx + (head - up.w) / 2, by - g.above - gap - up.below, owner);
        go(b.lower, bx + (head - lo.w) / 2, by + g.below + gap + lo.above, owner);
        go(b.body, bx + head + b.size * BIG_BODY_GAP, by, owner);
        return m;
      }
      case 'frac': {
        const m = measure(b);
        const n = measure(b.num);
        const d = measure(b.den);
        const gap = b.size * FRAC_GAP;
        const axis = b.size * AXIS;
        const barY = by - axis;
        // Căn giữa cả tử lẫn mẫu quanh trục dọc của phân số.
        go(b.num, bx + (m.w - n.w) / 2, barY - gap - n.below, owner);
        go(b.den, bx + (m.w - d.w) / 2, barY + gap + d.above, owner);
        rules.push({ x1: bx, x2: bx + m.w, y: barY, width: b.size * 0.075, owner });
        return m;
      }
      case 'radical': {
        const m = measure(b);
        const inner = measure(b.inner);
        const hook = b.size * RAD_HOOK;
        const idxSize = shrink(b.size, RAD_INDEX);
        const idx = b.index === 2 ? 0 : textWidth(String(b.index), idxSize);
        const top = by - m.above;
        const bottom = by + inner.below;
        const stroke = b.size * 0.075;

        if (b.index !== 2) {
          go(
            { t: 'text', s: String(b.index), size: idxSize, italic: false },
            bx,
            top + idxSize * 0.9,
            owner,
          );
        }

        // Móc: đi từ giữa bên trái, chúc xuống đáy, rồi vọt lên đỉnh vạch trùm.
        const x0 = bx + idx;
        const mid = (top + bottom) / 2;
        paths.push({
          d:
            `M${round(x0)} ${round(mid + (bottom - mid) * 0.45)}` +
            `L${round(x0 + hook * 0.3)} ${round(mid + (bottom - mid) * 0.72)}` +
            `L${round(x0 + hook * 0.62)} ${round(bottom)}` +
            `L${round(x0 + hook)} ${round(top)}`,
          width: stroke,
          owner,
        });
        rules.push({
          x1: round(x0 + hook),
          x2: round(x0 + hook + inner.w + b.size * RAD_PAD),
          y: round(top),
          width: stroke,
          owner,
        });
        go(b.inner, x0 + hook, by, owner);
        return m;
      }
      case 'bars': {
        const m = measure(b);
        const stroke = b.size * 0.07;
        const top = by - m.above;
        const bottom = by + m.below;
        for (const x of [bx + b.size * BAR_PAD * 0.4, bx + m.w - b.size * BAR_PAD * 0.4]) {
          paths.push({
            d: `M${round(x)} ${round(top)}L${round(x)} ${round(bottom)}`,
            width: stroke,
            owner,
          });
        }
        go(b.inner, bx + b.size * BAR_PAD, by, owner);
        return m;
      }
      case 'paren': {
        const inner = measure(b.inner);
        const { w, bow, above, below } = parenMetrics(inner, b.size);
        const top = by - above;
        const bottom = by + below;
        const mid = (top + bottom) / 2;
        const stroke = b.size * 0.075;

        /**
         * Một cung bậc hai duy nhất mỗi bên.
         *
         * Điểm giữa của một cung bậc hai là $(P_0 + 2C + P_2)/4$, nên với hai đầu
         * cùng hoành độ thì bụng cung chỉ đi được **nửa** đường tới điểm điều
         * khiển. Muốn bụng sâu `bow` thì điểm điều khiển phải đặt xa `2·bow` —
         * viết ra vì bản đầu đặt `bow` và cung nông đúng một nửa.
         */
        const arc = (tipX: number, dir: -1 | 1): string =>
          `M${round(tipX)} ${round(top)}` +
          `Q${round(tipX + dir * 2 * bow)} ${round(mid)} ${round(tipX)} ${round(bottom)}`;

        // Đầu cung lùi vào trong `PAREN_INNER`, ruột vẫn bắt đầu ở `bx + w` — nhờ
        // đó mép ngoài của cung rơi đúng `PAREN_SIDE` từ mép hộp, và trong lòng
        // vẫn còn hở.
        const pad = b.size * PAREN_INNER;
        paths.push({ d: arc(bx + w - pad, -1), width: stroke, owner });
        go(b.inner, bx + w, by, owner);
        paths.push({ d: arc(bx + w + inner.w + pad, 1), width: stroke, owner });
        return measure(b);
      }
    }
  };

  const metrics = go(box, x, y, null);
  return { glyphs, rules, paths, boxes, metrics };
}

/* ---------- cây → hộp ---------- */

/** Dãy đối số ngăn bằng dấu phẩy — dùng cho lời gọi hàm nhiều biến. */
function commaRow(args: readonly Expr[], size: number): Box {
  const items: Box[] = [];
  args.forEach((a, i) => {
    if (i > 0) items.push(text(', ', size));
    items.push(toBox(a, size));
  });
  return items.length === 1 ? (items[0] as Box) : { t: 'row', items };
}

/** Độ ưu tiên, để biết khi nào phải bọc ngoặc. */
const PREC: Readonly<Record<Expr['k'], number>> = {
  // $[x^n]F$ ăn tới hết cái đứng sau nó, hệt $\Sigma$ — chỗ bọc ngoặc nằm ở `toBox`.
  coeff: 0,
  inf: 6,
  // Lời gọi hàm xếp ngang nguyên tử: `f(x)` đã tự có ngoặc, không cần thêm.
  ufn: 6,
  sys: 0,
  rel: 0,
  add: 1,
  mul: 2,
  div: 2,
  pow: 3,
  // Căn tự bọc ruột bằng vạch trùm nên nó **là** dấu gộp — không cần ngoặc quanh nó,
  // và ruột của nó cũng không cần ngoặc dù là tổng.
  root: 4,
  abs: 4,
  // Lời gọi hàm có dấu gộp riêng ($C_n^k$ tự đứng, `n!` dính vào đối số), nên nó xếp
  // ngang nguyên tử. Riêng **đối số** của giai thừa thì không: xem `toBox`.
  fn: 4,
  // Ký hiệu tổng ăn **tới hết** thân của nó, nên nó lỏng nhất bảng: $\sum f + g$ đọc ra
  // $(\sum f) + g$, và chỗ bọc ngoặc cho thân nằm ở `toBox`.
  big: 0,
  int: 4,
  rat: 4,
  var: 4,
};

const REL_TEXT: Readonly<Record<string, string>> = {
  '=': '=',
  '<': '<',
  '<=': '≤',
  '>': '>',
  '>=': '≥',
  '!=': '≠',
};

/** Dấu nhân của toán học — xem chú thích `'⋅'` trong bảng `EM`. */
const MUL_DOT = '⋅';

const text = (s: string, size: number, italic = false): Box => ({ t: 'text', s, size, italic });
const gap = (w: number): Box => ({ t: 'gap', w });
/** Toán tử hai ngôi: hở đều hai bên, không phụ thuộc ký tự trắng. */
const binop = (s: string, size: number, pad: number): Box[] => [
  gap(size * pad),
  text(s, size),
  gap(size * pad),
];

/**
 * Dấu trừ toán học `−` (U+2212), không phải gạch nối `-` của ASCII.
 *
 * `String(-2)` cho ra gạch nối, và cạnh dấu `−` của phép cộng-trừ ở cùng một dòng
 * thì hai nét dài ngắn khác nhau — nhìn ra ngay là hai ký tự khác nhau. Chỗ này lộ
 * ở $x^{-2}$ và $(-2)^2$ của lượt nhìn tầng 0.
 */
const num = (v: number): string => String(v).replace('-', '−');

/**
 * Cỡ chữ của một tầng phân số lồng bên trong.
 *
 * $x/(y/z)$ vẽ ba dòng chồng nhau với hai vạch **bằng nhau** thì đọc được thành
 * $(x/y)/z$ — một biểu thức khác hẳn. Thu nhỏ tầng trong là cách sách toán phân
 * biệt chúng, và nó rẻ hơn mọi mẹo về độ dài vạch.
 */
const NEST = 0.82;

/**
 * Hệ số âm trong một tích ⇒ in dấu trừ trước cả hạng tử, không in `·(−1)` giữa chừng.
 *
 * Tìm ở **mọi vị trí**, không riêng vị trí đầu: `distribute` trên $a(a-b)$ cho ra
 * `mul[a, −1, b]` vì phép làm phẳng gộp `a` với `(−1)·b`, nên hệ số âm nằm giữa. Bản
 * đầu chỉ nhìn `args[0]` và in ra `a·−1b` — đọc được, nhưng không ai viết thế.
 */
function negCoefIndex(e: Expr): number {
  if (e.k !== 'mul') return -1;
  return e.args.findIndex((a) => (a.k === 'int' && a.v < 0) || (a.k === 'rat' && a.p < 0));
}

/**
 * Dấu của một tích đọc từ **tích các hệ số**, không từ hệ số âm đầu tiên.
 *
 * `distribute` trên $-(x-2)$ cho ra `mul[−1, −2]`, giá trị $+2$. Bản đầu chỉ tìm *một*
 * thừa số âm rồi tách nó ra, nên phần còn lại vẫn âm và hình in ra `−−2`. Hai dấu trừ
 * liền nhau không sai về giá trị nhưng không ai viết thế, và người đọc dừng lại ở đó.
 */
function coefficientSign(e: Expr): number {
  if (e.k === 'int') return Math.sign(e.v);
  if (e.k === 'rat') return Math.sign(e.p);
  if (e.k !== 'mul') return 1;
  let sign = 1;
  for (const a of e.args) {
    if (a.k === 'int' && a.v < 0) sign = -sign;
    else if (a.k === 'rat' && a.p < 0) sign = -sign;
  }
  return sign;
}

function isNegative(e: Expr): boolean {
  return coefficientSign(e) < 0;
}

/**
 * Trị tuyệt đối của một hạng tử, để in sau dấu $-$ đã tách ra.
 *
 * Ba trường hợp: số thì bỏ dấu; $(-1)\cdot x$ còn đúng $x$ (hệ số $1$ không viết);
 * $(-3)\cdot x$ còn $3x$.
 */
function stripSign(e: Expr): Expr {
  if (e.k === 'int') return { ...e, v: Math.abs(e.v) };
  if (e.k === 'rat') return { ...e, p: Math.abs(e.p) };
  if (e.k !== 'mul') return e;
  if (negCoefIndex(e) === -1) return e;

  // Bỏ dấu ở **mọi** hệ số, không riêng cái đầu: `mul[−1, −2]` phải còn lại `2`, không
  // phải `−2`. Chỉ bỏ dấu, không nhân gộp — gộp hệ số là việc của `fold_coefficients`,
  // một luật có tên và có dòng riêng trên hình.
  const positive = e.args.map((a): Expr => {
    if (a.k === 'int' && a.v < 0) return { ...a, v: -a.v };
    if (a.k === 'rat' && a.p < 0) return { ...a, p: -a.p };
    return a;
  });
  // Hệ số $1$ sinh ra do bỏ dấu thì biến mất hẳn — không ai viết `1x`.
  const kept = positive.filter((a) => !(a.k === 'int' && a.v === 1));
  if (kept.length === 0) return { k: 'int', v: 1, id: e.id };
  if (kept.length === 1) return kept[0] as Expr;
  return { ...e, args: kept };
}

/**
 * Thân của một hạng tử **sau khi dấu trừ đã tách ra**, bọc ngoặc nếu cần.
 *
 * $-(x-2)$ mà in `−x − 2` là in ra một biểu thức **khác**: dấu trừ chỉ ăn hạng tử đầu.
 * Bảng ưu tiên không bắt được vì dấu trừ ấy không phải một nút — nó là thứ `stripSign`
 * vừa bóc ra, nên chỗ duy nhất biết nó tồn tại là đây.
 */
const needsGuardAfterSign = (e: Expr): boolean => e.k === 'add';

export function toBox(e: Expr, size: number = FONT): Box {
  const tag = (inner: Box): Box => ({ t: 'tag', id: e.id, inner });
  const wrap = (child: Expr, box: Box, tight = false): Box =>
    PREC[child.k] < PREC[e.k] || (tight && PREC[child.k] === PREC[e.k])
      ? { t: 'paren', inner: box, size }
      : box;

  switch (e.k) {
    case 'int':
      return tag(text(num(e.v), size));
    case 'rat':
      return tag({
        t: 'frac',
        num: text(num(e.p), shrink(size, NEST)),
        den: text(num(e.q), shrink(size, NEST)),
        size,
      });
    case 'inf':
      // Không nghiêng: $\infty$ là một **ký hiệu**, không phải một biến. Cùng lối với
      // dấu $=$ và tên hàm.
      return tag(text('∞', size, false));
    case 'var': {
      const [head, sub] = e.name.split('_');
      const body = text(head as string, size, true);
      return tag(
        sub === undefined
          ? body
          : {
              t: 'row',
              items: [
                body,
                { t: 'shift', dy: size * 0.2, inner: text(sub, shrink(size, SCRIPT), false) },
              ],
            },
      );
    }
    case 'add': {
      const items: Box[] = [];
      e.args.forEach((arg, i) => {
        const negative = isNegative(arg);
        // Dấu $-$ **thay cho** dấu $+$ của phép cộng, không đứng thêm cạnh nó:
        // `a + −b` là thứ không ai viết tay.
        if (i > 0) items.push(...binop(negative ? '−' : '+', size, 0.22));
        else if (negative) items.push(text('−', size));
        const shown = negative ? stripSign(arg) : arg;
        const box = toBox(shown, size);
        items.push(
          negative && needsGuardAfterSign(shown) ? { t: 'paren', inner: box, size } : wrap(shown, box),
        );
      });
      return tag({ t: 'row', items });
    }
    case 'mul': {
      // Tách dấu âm ở **mọi vị trí**, không riêng khi hạng tử nằm trong một tổng.
      // Bản đầu chỉ tách trong `add`, nên một tích âm đứng một mình — vế trái của
      // $-3x < 6$ chẳng hạn — in ra `−1·3x`. Lỗi chỉ thấy khi giải bất phương trình,
      // vì trước đó tích âm luôn nằm trong một tổng.
      if (isNegative(e)) {
        const body = stripSign(e);
        const inner = body.k === 'mul' ? bareMul(body, size) : toBox(body, size);
        return tag({
          t: 'row',
          items: [
            text('−', size),
            needsGuardAfterSign(body) ? { t: 'paren', inner, size } : inner,
          ],
        });
      }
      const items: Box[] = [];
      // Hệ số $1$ không viết ra khi còn thừa số khác — `1x` và `1√2` là thứ không ai
      // viết tay. Chỉ bỏ ở tầng **hiển thị**: nút $1$ vẫn còn trong cây, vì bỏ nó đi
      // là việc của luật `drop_unit`, có tên và có dòng riêng.
      const shown = e.args.filter(
        (a, i) => !(a.k === 'int' && a.v === 1 && e.args.length > 1 && i === 0),
      );
      shown.forEach((arg, i) => {
        if (i > 0 && needsDot(shown[i - 1] as Expr, arg)) items.push(...binop(MUL_DOT, size, 0.06));
        // Căn bậc $n$ có chỉ số ở góc trên trái; đứng sát một chữ số thì `3` của hệ số
        // và `3` của chỉ số đọc thành `33`. Hở một chút là đủ tách chúng ra.
        else if (i > 0 && arg.k === 'root' && arg.index !== 2) items.push(gap(size * 0.16));
        // Thừa số âm **không đứng đầu** phải có ngoặc: `−1·−2` đọc ra hai phép toán
        // liền nhau. `bareMul` đã làm đúng chỗ này từ M47c; nhánh chính thì quên, và
        // nó chỉ lộ ra khi một tích *dương* chứa hai thừa số âm.
        const bare = toBox(arg, size);
        items.push(i > 0 && isNegative(arg) ? { t: 'paren', inner: bare, size } : wrap(arg, bare));
      });
      return tag({ t: 'row', items });
    }
    case 'pow': {
      // Số âm làm cơ số **phải** có ngoặc: `-2²` đọc là $-(2^2)$, khác hẳn $(-2)^2$.
      // Bảng ưu tiên không bắt được chỗ này vì nguyên tử có ưu tiên cao nhất.
      const negLiteral =
        (e.base.k === 'int' && e.base.v < 0) || (e.base.k === 'rat' && e.base.p < 0);
      // Căn làm cơ số **phải** có ngoặc: `√3²` đọc được thành $\sqrt{3^2}$, vì số mũ
      // đứng ngay sau vạch trùm nên mắt không biết nó thuộc về căn hay về ruột căn.
      // Bảng ưu tiên không bắt được — căn xếp ngang nguyên tử, và đúng là thế ở mọi
      // chỗ khác.
      const needsGuard = negLiteral || e.base.k === 'root';
      const inner = toBox(e.base, size);
      return tag({
        t: 'sup',
        base: needsGuard ? { t: 'paren', inner, size } : wrap(e.base, inner, true),
        exp: toBox(e.exp, shrink(size, SCRIPT)),
      });
    }
    case 'ufn':
      /**
       * $a_n$ — tên nghiêng rồi **chỉ số dưới**, cỡ script, hạ xuống.
       *
       * Chép đúng cách $\log_b$ dựng cơ số ngay dưới đây: một `row` với một `shift`,
       * không phải một hộp mới. Chỉ số **không bọc ngoặc**: $a_{n+1}$ là cách mọi
       * sách viết, và cỡ chữ nhỏ hơn cùng đường nền hạ xuống đã đủ tách nó khỏi
       * $a_n + 1$ — thứ mà mắt phân biệt được ngay ở lượt nhìn PNG.
       */
      if (e.notation === 'sub') {
        return tag({
          t: 'row',
          items: [
            text(e.name, size, true),
            {
              t: 'shift',
              dy: size * 0.2,
              inner: toBox(e.args[0] as Expr, shrink(size, SCRIPT)),
            },
          ],
        });
      }
      /**
       * $f(x)$ — tên **nghiêng** rồi ngoặc.
       *
       * Ngược hẳn `sin`/`ln` ở ngay dưới, và ngược có lý do: `sin` đứng thẳng vì
       * nó là một *từ* ba chữ cái, nghiêng thì đọc ra $s\cdot i\cdot n$. Còn $f$
       * là một **ký hiệu** đúng nghĩa — cùng hạng với $x$, chỉ khác là nó nhận đối
       * số — nên nó nghiêng như mọi ký hiệu khác. Đó cũng là cách mọi sách viết.
       */
      return tag({
        t: 'row',
        items: [
          text(e.name, size, true),
          { t: 'paren', inner: commaRow(e.args as Expr[], size), size },
        ],
      });
    case 'fn': {
      const spec = FUNCTIONS[e.name];
      if (e.name === 'fact') {
        const arg = e.args[0] as Expr;
        const inner = toBox(arg, size);
        // $(x+1)!$ **phải** có ngoặc: `x + 1!` đọc ra $x + (1!)$, một biểu thức khác.
        // Bảng ưu tiên không bắt được vì hậu tố `!` không phải một nút — nó là hình
        // dạng của chính nút này. Cùng họ với ngoặc quanh cơ số âm ở `pow`.
        const atomic = PREC[arg.k] >= PREC['pow'];
        return tag({
          t: 'row',
          items: [atomic ? inner : { t: 'paren', inner, size }, text('!', size)],
        });
      }
      // Hàm siêu việt in tên **đứng thẳng** rồi ngoặc: $\sin(x)$, $\ln(x)$. Chữ nghiêng
      // dành cho biến, nên `sin` nghiêng đọc ra $s\cdot i\cdot n$ — quy ước có từ Euler.
      if (e.name !== 'binom' && e.name !== 'perm') {
        const items: Box[] = [text(spec.source, size)];
        // $\log_b$ — cơ số là chỉ số dưới, không phải đối số thứ nhất trong ngoặc.
        const shown = e.name === 'log' ? (e.args.slice(1) as Expr[]) : (e.args as Expr[]);
        if (e.name === 'log') {
          items.push({
            t: 'shift',
            dy: size * 0.2,
            inner: toBox(e.args[0] as Expr, shrink(size, SCRIPT)),
          });
        }
        items.push({ t: 'paren', inner: toBox(shown[0] as Expr, size), size });
        return tag({ t: 'row', items });
      }

      // $C_n^k$, $A_n^k$ — chỉ số dưới là $n$, số mũ trên là $k$.
      const [lower, upper] = e.args as [Expr, Expr];
      return tag({
        t: 'subsup',
        base: text(spec.source, size),
        sub: toBox(lower, shrink(size, SCRIPT)),
        sup: toBox(upper, shrink(size, SCRIPT)),
        size,
      });
    }
    case 'coeff': {
      /**
       * $[x^n]F$ — ngoặc vuông **không giãn**.
       *
       * Ruột của nó là $x^n$, luôn cao đúng một dòng có số mũ, nên một `paren` co
       * giãn ở đây chỉ thêm một tham số để sai. Hai glyph `[` `]` cỡ chữ là đủ, và
       * đó cũng là cách mọi sách in nó.
       *
       * Thân bọc ngoặc theo cùng luật của $\Sigma$: $[x^n](F + G)$ và $[x^n]F + G$
       * là hai biểu thức khác nhau mà ký hiệu không phân biệt.
       */
      const script = shrink(size, SCRIPT);
      const inner = toBox(e.of, size);
      const body =
        PREC[e.of.k] <= PREC['coeff'] || e.of.k === 'add'
          ? { t: 'paren' as const, inner, size }
          : inner;
      return tag({
        t: 'row',
        items: [
          text('[', size),
          { t: 'sup', base: text(e.v, size, true), exp: toBox(e.at, script) },
          text(']', size),
          { t: 'gap', w: size * 0.12 },
          body,
        ],
      });
    }
    case 'big': {
      // Thân phải bọc ngoặc khi nó là một tổng: $\sum (f + g)$ và $\sum f + g$ là hai
      // biểu thức khác nhau, và không dấu gộp nào trong ký hiệu $\sum$ phân biệt chúng.
      const inner = toBox(e.body, size);
      const body = e.body.k === 'add' || e.body.k === 'rel' ? { t: 'paren' as const, inner, size } : inner;
      const script = shrink(size, SCRIPT);
      return tag({
        t: 'big',
        glyph: e.op === 'sum' ? '∑' : '∏',
        // Cận dưới là `k = a`, một cụm ba phần — chỉ số một mình thì không nói được nó
        // chạy từ đâu.
        lower: {
          t: 'row',
          items: [
            text(e.v, script, true),
            ...binop('=', script, 0.12),
            toBox(e.from, script),
          ],
        },
        upper: toBox(e.to, script),
        body,
        size,
      });
    }
    case 'root':
      return tag({ t: 'radical', inner: toBox(e.arg, size), index: e.index, size });
    case 'abs':
      return tag({ t: 'bars', inner: toBox(e.arg, size), size });
    case 'div':
      return tag({
        t: 'frac',
        num: toBox(e.num, shrink(size, NEST)),
        den: toBox(e.den, shrink(size, NEST)),
        size,
      });
    case 'rel':
      return tag({
        t: 'row',
        items: [
          toBox(e.lhs, size),
          ...binop(REL_TEXT[e.op] as string, size, 0.3),
          toBox(e.rhs, size),
        ],
      });
    case 'sys': {
      // **Tuyển vẽ nằm ngang**, nối bằng chữ "hoặc" — đó là cách mọi sách viết một tập
      // nghiệm ($x < 1$ hoặc $x > 2$), và một ngoặc nhọn quanh hai nhánh loại trừ nhau
      // đọc ra đúng nghĩa ngược lại. Hội thì xếp dọc trong ngoặc nhọn.
      if (e.join === 'or') {
        const items: Box[] = [];
        e.rels.forEach((r, i) => {
          if (i > 0) items.push(gap(size * 0.4), text('hoặc', size), gap(size * 0.4));
          items.push(toBox(r, size));
        });
        return tag({ t: 'row', items });
      }
      return tag({
        t: 'stack',
        brace: '{',
        rows: e.rels.map((r) => ({
          box: toBox(r, size),
          // Phần trước dấu quan hệ: vế trái cộng nửa khoảng hở của toán tử. Đo bằng
          // chính bộ sắp chữ sẽ vẽ nó, nên con số không thể lệch với cái hiện ra.
          lead: r.k === 'rel' ? measure(toBox(r.lhs, size)).w + size * 0.3 : 0,
        })),
        size,
      });
    }
  }
}

/** Ruột của một tích, không bọc `tag` — dùng khi dấu đã được tách ra ngoài. */
function bareMul(e: Expr & { k: 'mul' }, size: number): Box {
  const items: Box[] = [];
  const shown = e.args.filter((a, i) => !(a.k === 'int' && a.v === 1 && e.args.length > 1 && i === 0));
  shown.forEach((arg, i) => {
    if (i > 0 && needsDot(shown[i - 1] as Expr, arg)) items.push(...binop(MUL_DOT, size, 0.06));
    else if (i > 0 && arg.k === 'root' && arg.index !== 2) items.push(gap(size * 0.16));
    // Thừa số âm **không đứng đầu** phải có ngoặc: `3x·−1` đọc ra hai phép toán liền
    // nhau, `3x·(−1)` thì không. Bảng ưu tiên không bắt được vì số là nguyên tử.
    const bare = toBox(arg, size);
    const needsParen = PREC[arg.k] < PREC['mul'] || (i > 0 && isNegative(arg));
    items.push(needsParen ? { t: 'paren', inner: bare, size } : bare);
  });
  return { t: 'row', items };
}

/**
 * Có cần dấu nhân giữa hai thừa số không.
 *
 * $2x$ và $x(x+1)$ viết liền; $2 \cdot 3$ thì không, vì `23` là một số khác. Đây là
 * chỗ **duy nhất** engine chấp nhận nhân ngầm — ở đầu ra, nơi không có gì mơ hồ.
 * Đầu vào thì vẫn cấm (§3.3).
 */
function needsDot(left: Expr, right: Expr): boolean {
  const numeric = (x: Expr): boolean => x.k === 'int' || x.k === 'rat';
  if (numeric(right)) return true;
  if (right.k === 'pow' && numeric(right.base)) return true;
  return numeric(left) && numeric(right);
}

/** Khoảng hở hai bên một dòng, để hộp bao không dính mép. */
export const PAD = { thin: THIN * FONT, med: MED * FONT } as const;
