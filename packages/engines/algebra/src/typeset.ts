import { UNITS_PER_CELL } from '@combviz/render';
import type { Expr, TermId } from './expr.js';

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
const SUP_RISE = 0.46;
/** Hở trên/dưới vạch phân số. */
const FRAC_GAP = 0.18;
const FRAC_PAD = 0.22;
const THIN = 0.18;
const MED = 0.3;

/* ---------- bảng bề ngang, đo cho **bảng chữ của riêng engine này** ---------- */

/**
 * `estimateTextWidth` ước đều $0{,}55$ em cho mọi ký tự và cố ý ước dôi — đúng cho
 * việc nó sinh ra (chừa lề caption), sai ở đây: ước dôi làm số mũ trôi khỏi cơ số và
 * $x ^2$ đọc thành hai vật rời nhau. `longdiv` đã phải đo riêng vì đúng lý do này.
 */
const EM: Readonly<Record<string, number>> = {
  ' ': 0.26,
  '+': 0.62,
  '−': 0.62,
  '=': 0.66,
  '<': 0.62,
  '≤': 0.62,
  '≠': 0.66,
  '·': 0.3,
  '(': 0.32,
  ')': 0.32,
  '_': 0.4,
};
const DIGIT_EM = 0.5;
const LETTER_EM = 0.5;

export function textWidth(value: string, size: number): number {
  let em = 0;
  for (const ch of value) em += EM[ch] ?? (ch >= '0' && ch <= '9' ? DIGIT_EM : LETTER_EM);
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
  /** Dịch đường chân xuống `dy` — chỉ số dưới. */
  | { t: 'shift'; dy: number; inner: Box }
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
        w: textWidth(box.s, box.size),
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
      const rise = b.above * SUP_RISE;
      return {
        w: b.w + e.w,
        above: Math.max(b.above, rise + e.above),
        below: b.below,
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
    case 'paren': {
      const inner = measure(box.inner);
      // Ngoặc cao theo ruột: một ngoặc cỡ chữ thường bên cạnh một phân số hai tầng
      // trông như dấu phẩy. Bề ngang cũng giãn theo, nếu không nó thành nét mảnh.
      const scale = parenScale(inner, box.size);
      return {
        w: inner.w + 2 * textWidth('(', box.size * scale),
        above: Math.max(inner.above, box.size * ASCENT * scale),
        below: Math.max(inner.below, box.size * DESCENT * scale),
      };
    }
  }
}

/** Ngoặc phải trùm ruột: tỉ lệ theo chiều cao thật, chặn dưới ở 1. */
function parenScale(inner: Metrics, size: number): number {
  const need = inner.above + inner.below;
  const have = size * (ASCENT + DESCENT);
  return Math.max(1, need / have);
}

/* ---------- glyph đã đặt ---------- */

export interface PlacedGlyph {
  readonly s: string;
  readonly x: number;
  /** Đường chân. */
  readonly y: number;
  readonly size: number;
  readonly italic: boolean;
  /** Nút gần nhất bao lấy glyph này — dùng để tô khi nhấn. */
  readonly owner: TermId | null;
}

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

export interface Placed {
  readonly glyphs: readonly PlacedGlyph[];
  readonly rules: readonly PlacedRule[];
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
  const boxes: NodeBox[] = [];

  const go = (b: Box, bx: number, by: number, owner: TermId | null): Metrics => {
    switch (b.t) {
      case 'text': {
        const m = measure(b);
        glyphs.push({ s: b.s, x: bx, y: by, size: b.size, italic: b.italic, owner });
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
        go(b.exp, bx + bm.w, by - bm.above * SUP_RISE, owner);
        return measure(b);
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
      case 'paren': {
        const inner = measure(b.inner);
        const scale = parenScale(inner, b.size);
        const size = b.size * scale;
        const pw = textWidth('(', size);
        // Ngoặc đã giãn thì đường chân của nó phải hạ theo, nếu không nó treo lên
        // trên trong khi ruột nằm giữa.
        const shift = (inner.above - inner.below) / 2 - (size * (ASCENT - DESCENT)) / 2;
        glyphs.push({ s: '(', x: bx, y: by - shift, size, italic: false, owner });
        go(b.inner, bx + pw, by, owner);
        glyphs.push({ s: ')', x: bx + pw + inner.w, y: by - shift, size, italic: false, owner });
        return measure(b);
      }
    }
  };

  const metrics = go(box, x, y, null);
  return { glyphs, rules, boxes, metrics };
}

/* ---------- cây → hộp ---------- */

/** Độ ưu tiên, để biết khi nào phải bọc ngoặc. */
const PREC: Readonly<Record<Expr['k'], number>> = {
  rel: 0,
  add: 1,
  mul: 2,
  div: 2,
  pow: 3,
  int: 4,
  rat: 4,
  var: 4,
};

const REL_TEXT: Readonly<Record<string, string>> = {
  '=': '=',
  '<': '<',
  '<=': '≤',
  '!=': '≠',
};

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

function isNegative(e: Expr): boolean {
  if (e.k === 'int') return e.v < 0;
  if (e.k === 'rat') return e.p < 0;
  return negCoefIndex(e) !== -1;
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

  const at = negCoefIndex(e);
  if (at === -1) return e;
  const coef = e.args[at] as Expr;
  const rest = e.args.filter((_, i) => i !== at);
  // Hệ số $-1$ biến mất hẳn (không ai viết `1x`); hệ số khác thì chỉ bỏ dấu.
  if (coef.k === 'int' && coef.v === -1) {
    return rest.length === 1 ? (rest[0] as Expr) : { ...e, args: rest };
  }
  const positive: Expr =
    coef.k === 'int' ? { ...coef, v: -coef.v } : { ...(coef as Extract<Expr, { k: 'rat' }>), p: -(coef as Extract<Expr, { k: 'rat' }>).p };
  return { ...e, args: [positive, ...rest] };
}

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
        num: text(num(e.p), size * NEST),
        den: text(num(e.q), size * NEST),
        size,
      });
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
                { t: 'shift', dy: size * 0.2, inner: text(sub, size * SCRIPT, false) },
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
        items.push(wrap(shown, toBox(shown, size)));
      });
      return tag({ t: 'row', items });
    }
    case 'mul': {
      const items: Box[] = [];
      e.args.forEach((arg, i) => {
        if (i > 0 && needsDot(e.args[i - 1] as Expr, arg)) items.push(...binop('·', size, 0.06));
        items.push(wrap(arg, toBox(arg, size)));
      });
      return tag({ t: 'row', items });
    }
    case 'pow': {
      // Số âm làm cơ số **phải** có ngoặc: `-2²` đọc là $-(2^2)$, khác hẳn $(-2)^2$.
      // Bảng ưu tiên không bắt được chỗ này vì nguyên tử có ưu tiên cao nhất.
      const negLiteral =
        (e.base.k === 'int' && e.base.v < 0) || (e.base.k === 'rat' && e.base.p < 0);
      const inner = toBox(e.base, size);
      return tag({
        t: 'sup',
        base: negLiteral ? { t: 'paren', inner, size } : wrap(e.base, inner, true),
        exp: text(num(e.exp), size * SCRIPT),
      });
    }
    case 'div':
      return tag({
        t: 'frac',
        num: toBox(e.num, size * NEST),
        den: toBox(e.den, size * NEST),
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
  }
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
