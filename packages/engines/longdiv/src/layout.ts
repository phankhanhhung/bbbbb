import { UNITS_PER_CELL } from '@combviz/render';
import { rowsOf, termId, type LongDivModel, type LongDivRow, type Term } from './model.js';

/**
 * Xếp chỗ cho bảng chia dọc.
 *
 * **Cột theo bậc là toàn bộ ý của bố cục này.** Hạng tử cùng bậc phải thẳng cột ở
 * mọi dòng, vì đó là thứ làm phép trừ đọc được bằng mắt: nhìn xuống một cột là
 * thấy ngay $-x^2$ trừ $-3x^2$ ra $2x^2$. Bề rộng mỗi cột lấy theo hạng tử **rộng
 * nhất** trong cột ấy, không phải một hằng số — cột chứa $12x$ cần chỗ hơn cột
 * chứa $-2$, và ép chúng bằng nhau thì bảng rỗng toác ở giữa.
 *
 * Dấu đi **liền** hạng tử chứ không nằm giữa hai cột. Nhờ vậy `− 3x²` của dòng bị
 * trừ nằm đúng dưới `− x²` của số bị chia, y như viết tay.
 */

/** Quy ước G-10, lấy từ một chỗ. */
export const ROW = UNITS_PER_CELL;
export const FONT = 5;
/** Cỡ số mũ, và độ nâng của nó so với đường chân. */
export const EXP_FONT = FONT * 0.62;
export const EXP_RISE = FONT * 0.42;

/** Khoảng cách hai đường chân liền nhau. */
const LINE = FONT * 1.65;
/** Hở giữa hai cột bậc. */
const COL_GAP = FONT * 0.34;
/** Hở giữa số chia và nét đứng của ngoặc, và giữa ngoặc với hạng tử đầu. */
const BRACKET_GAP = FONT * 0.5;
const BRACKET_PAD = FONT * 0.6;

export interface PlacedTerm {
  readonly id: string;
  readonly term: Term;
  /** Chữ chính: dấu, hệ số, biến. Số mũ vẽ riêng vì nó nâng lên và nhỏ đi. */
  readonly head: string;
  readonly exponent: string;
  readonly x: number;
  readonly width: number;
}

export interface PlacedRow {
  readonly row: LongDivRow;
  readonly terms: readonly PlacedTerm[];
  /** Đường chân. */
  readonly y: number;
  readonly x: number;
  readonly width: number;
}

export interface Rule {
  /**
   * Danh tính **riêng** của vạch: `rule1`, `rule2`, …, đánh số theo nhịp.
   *
   * Vạch phải neo được, vì viết tay thì gạch ngay sau khi viết dòng bị trừ — vạch
   * hiện sẵn từ khung $0$ là hai đoạn kẻ lơ lửng giữa chỗ trống. Cho nó mượn danh
   * tính của dòng thì rẻ hơn, nhưng sai: chốt canh `elementBoxes` đòi tâm hộp khai
   * của một id rơi vào **mực** của id ấy, mà mực của một đoạn thẳng ngang cao đúng
   * $0$ — không hộp chữ nào có tâm nằm trên nó. Đánh số riêng, như mũi tên.
   */
  readonly id: string;
  /** Vạch ngang dưới một dòng bị trừ. */
  readonly y: number;
  readonly x1: number;
  readonly x2: number;
}

export interface Arrow {
  readonly id: string;
  readonly x: number;
  readonly y1: number;
  readonly y2: number;
}

export interface Layout {
  readonly rows: readonly PlacedRow[];
  readonly rules: readonly Rule[];
  readonly arrows: readonly Arrow[];
  /** Nét đứng và vạch ngang của ngoặc chia. */
  readonly bracket: { x: number; yTop: number; yBottom: number; xRight: number } | null;
  readonly width: number;
  readonly height: number;
}

/** Chữ của một hạng tử, tách phần chân và phần số mũ. */
export function termText(
  term: Term,
  variable: string,
  first: boolean,
): { head: string; exponent: string } {
  const sign = term.coefficient < 0 ? (first ? '−' : '− ') : first ? '' : '+ ';
  const size = Math.abs(term.coefficient);
  // Hệ số $1$ không viết ra khi còn biến — `1x` là thứ không ai viết tay.
  const digits = size === 1 && term.degree > 0 ? '' : String(size);
  const body = term.degree === 0 ? digits : `${digits}${variable}`;
  return { head: `${sign}${body}`, exponent: term.degree >= 2 ? String(term.degree) : '' };
}

/**
 * Bề ngang một chuỗi hạng tử, đo theo **bảng chữ của chính engine này**.
 *
 * `estimateTextWidth` ước đều $0{,}55$ em cho mọi ký tự và cố ý ước dôi — đúng
 * cho việc nó sinh ra (chừa lề cho caption), sai cho việc ở đây. Hạng tử chỉ gồm
 * dấu, chữ số, dấu cách và một biến; dấu cách hẹp hơn chữ số chừng một nửa, nên
 * ước đều làm số mũ trôi ra xa và `2x ²` đọc thành hai thứ rời nhau — thấy rõ ở
 * hạng tử **có dấu** và không thấy ở hạng tử đầu dòng.
 *
 * Đo riêng ở đây thay vì nới hàm chung: hàm chung phục vụ chữ tiếng Việt tuỳ ý,
 * còn bảng chữ này đóng và biết trước.
 */
const EM: Readonly<Record<string, number>> = { ' ': 0.26, '+': 0.62, '−': 0.62 };
const DIGIT_EM = 0.5;
const LETTER_EM = 0.46;

export function textWidth(value: string, fontSize: number): number {
  let em = 0;
  for (const ch of value) em += EM[ch] ?? (ch >= '0' && ch <= '9' ? DIGIT_EM : LETTER_EM);
  return em * fontSize;
}

/** Chỗ số mũ bắt đầu: ngay sau phần chân. */
export const exponentX = (x: number, head: string): number => x + textWidth(head, FONT);

const widthOf = (head: string, exponent: string): number =>
  textWidth(head, FONT) + (exponent === '' ? 0 : textWidth(exponent, EXP_FONT));

export function layout(model: LongDivModel): Layout {
  const rows = rowsOf(model).filter((r) => r.kind !== 'divisor');
  const degrees: number[] = [];
  for (let d = model.degA; d >= 0; d -= 1) degrees.push(d);

  // Lượt một: đo bề rộng cần cho từng cột bậc.
  const need = new Map<number, number>(degrees.map((d) => [d, 0]));
  const text = new Map<string, { head: string; exponent: string }>();
  for (const row of rows) {
    row.terms.forEach((term, i) => {
      const t = termText(term, model.variable, i === 0);
      text.set(termId(row.id, term.degree), t);
      need.set(term.degree, Math.max(need.get(term.degree) ?? 0, widthOf(t.head, t.exponent)));
    });
  }

  // Số chia có hệ trục **của riêng nó**: nó đứng ngoài ngoặc nên không thuộc cột
  // bậc nào cả. Trước khi tách ra, nó bị đặt vào `colX` như mọi dòng khác và vẽ
  // đè lên số bị chia — hai đa thức chồng lên nhau, mà hình vẫn trông "có gì đó".
  const divisorTerms: PlacedTerm[] = [];
  let divisorCursor = 0;
  model.divisor.terms.forEach((term, i) => {
    const t = termText(term, model.variable, i === 0);
    const w = widthOf(t.head, t.exponent);
    divisorTerms.push({
      id: termId('divisor', term.degree),
      term,
      head: t.head,
      exponent: t.exponent,
      x: round(divisorCursor),
      width: round(w),
    });
    divisorCursor += w + COL_GAP;
  });
  const divisorWidth = round(Math.max(0, divisorCursor - COL_GAP));

  const bracketX = model.divisor.terms.length === 0 ? 0 : divisorWidth + BRACKET_GAP;
  const left = bracketX + BRACKET_PAD;
  const colX = new Map<number, number>();
  let cursor = left;
  for (const d of degrees) {
    colX.set(d, round(cursor));
    cursor += (need.get(d) ?? 0) + COL_GAP;
  }
  const right = round(cursor - COL_GAP);

  // Lượt ba: xếp dòng. Thương nằm **trên** vạch, nên nó chiếm dòng đầu tiên và
  // vạch ngang của ngoặc nằm ngay dưới đường chân của nó.
  const placed: PlacedRow[] = [];
  const rules: Rule[] = [];
  const arrows: Arrow[] = [];
  let y = FONT;

  // Dòng hiệu, dòng dư và thương **rỗng** nghĩa là đa thức không — và người ta viết
  // số $0$ ở đó chứ không bỏ trắng. Bỏ trắng thì `x^3-1 : x-1` kết thúc bằng một
  // vạch ngang chẳng có gì bên dưới, và câu "dư $0$" trong lời kể không trỏ vào đâu.
  // Hạng tử này chỉ có ở tầng bố cục: về mặt toán, đa thức không **không có** hạng tử.
  const ZERO_SHOWN = new Set(['rest', 'remainder', 'quotient']);

  const place = (row: LongDivRow, baseline: number): PlacedRow => {
    if (row.terms.length === 0 && ZERO_SHOWN.has(row.kind)) {
      const width = round(textWidth('0', FONT));
      const x = colX.get(0) ?? left;
      return {
        row,
        terms: [
          { id: termId(row.id, 0), term: { degree: 0, coefficient: 0 }, head: '0', exponent: '', x, width },
        ],
        y: round(baseline),
        x,
        width,
      };
    }

    const terms = row.terms.map((term) => {
      const key = termId(row.id, term.degree);
      const t = text.get(key) ?? termText(term, model.variable, false);
      return {
        id: key,
        term,
        head: t.head,
        exponent: t.exponent,
        x: colX.get(term.degree) ?? left,
        width: round(widthOf(t.head, t.exponent)),
      };
    });
    const xs = terms.map((t) => t.x);
    return {
      row,
      terms,
      y: round(baseline),
      x: round(terms.length === 0 ? left : Math.min(...xs)),
      width: round(terms.length === 0 ? 1 : Math.max(...terms.map((t) => t.x + t.width)) - Math.min(...xs)),
    };
  };

  placed.push(place(model.quotient, y));
  const vinculum = round(y + FONT * 0.35);
  y += LINE;

  placed.push(place(model.dividend, y));
  const dividendBaseline = y;
  // Số chia nằm cùng đường chân với số bị chia — đó là chỗ nó đứng khi viết tay.
  placed.push({
    row: model.divisor,
    terms: divisorTerms,
    y: round(y),
    x: 0,
    width: Math.max(divisorWidth, 1),
  });

  model.beats.forEach((beat, index) => {
    y += LINE;
    const sub = place(beat.sub, y);
    placed.push(sub);
    // Hạng tử thương bằng $0$ ⇒ dòng bị trừ toàn số $0$, và viết tay thì không ai
    // kẻ một dòng $0$ rồi gạch dưới nó. Không bỏ đi thì `x⁴+1 : x²+1` vẽ ra một
    // gạch ngắn cỡ một đơn vị lơ lửng giữa bảng, không thuộc về cái gì.
    if (beat.sub.terms.length > 0) {
      rules.push({
        // Đánh số theo **nhịp**, không theo thứ tự vạch: nhịp bỏ vạch vẫn giữ chỗ
        // của mình, nên `rule3` luôn là vạch của `sub3` dù `rule2` không tồn tại.
        id: `rule${index + 1}`,
        y: round(y + FONT * 0.3),
        x1: round(sub.x - COL_GAP * 0.5),
        x2: round(sub.x + sub.width + COL_GAP * 0.5),
      });
    }

    y += LINE;
    const rest = place(beat.rest, y);
    placed.push(rest);

    if (beat.broughtDown !== null) {
      const x = colX.get(beat.broughtDown);
      if (x !== undefined) {
        const w = need.get(beat.broughtDown) ?? FONT;
        arrows.push({
          id: `arrow${arrows.length + 1}`,
          x: round(x + w / 2),
          y1: round(dividendBaseline + FONT * 0.45),
          y2: round(y - FONT * 1.15),
        });
      }
    }
  });

  // Mép phải đo theo **chữ đã đặt**, không theo tổng bề rộng cột: cột bậc $0$ có
  // thể rộng $0$ (không dòng nào có hằng số) trong khi số $0$ của dòng dư vẫn được
  // viết ở đó — lấy `right` thì vạch trên đầu ngoặc ngắn hơn thứ nó phải trùm.
  const contentRight = placed.reduce(
    (acc, row) => Math.max(acc, row.row.kind === 'divisor' ? 0 : row.x + row.width),
    right,
  );

  return {
    rows: placed,
    rules,
    arrows,
    bracket:
      model.divisor.terms.length === 0
        ? null
        : {
            x: round(bracketX),
            yTop: vinculum,
            yBottom: round(dividendBaseline + FONT * 0.45),
            xRight: round(contentRight),
          },
    width: round(Math.max(contentRight, divisorWidth)),
    height: round(y + FONT * 0.4),
  };
}

/** Tra hộp của một dòng hoặc một hạng tử — dùng chung cho hit-test và elementBoxes. */
export function boxOf(
  box: Layout,
  id: string,
): { x: number; y: number; width: number; height: number } | null {
  for (const row of box.rows) {
    if (row.row.id === id) {
      return { x: row.x, y: row.y - FONT * 0.75, width: Math.max(row.width, 1), height: FONT * 1.05 };
    }
    for (const term of row.terms) {
      if (term.id !== id) continue;
      return { x: term.x, y: row.y - FONT * 0.75, width: Math.max(term.width, 1), height: FONT * 1.05 };
    }
  }
  for (const arrow of box.arrows) {
    if (arrow.id !== id) continue;
    return { x: arrow.x - FONT * 0.25, y: arrow.y1, width: FONT * 0.5, height: arrow.y2 - arrow.y1 };
  }
  for (const rule of box.rules) {
    if (rule.id !== id) continue;
    // Đối xứng quanh chính đoạn thẳng, nên tâm hộp nằm **trên** nét — điều kiện mà
    // chốt canh `elementBoxes` đòi, và cũng là chỗ ngón tay nhắm tới.
    return { x: rule.x1, y: rule.y - FONT * 0.25, width: rule.x2 - rule.x1, height: FONT * 0.5 };
  }
  return null;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000 + 0;
}
