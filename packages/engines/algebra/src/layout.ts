import { estimateTextWidth } from '@combviz/render';
import {
  FONT,
  ROW,
  measure,
  place,
  toBox,
  type NodeBox,
  type PlacedGlyph,
  type PlacedPath,
  type PlacedRule,
} from './typeset.js';
import type { AlgebraModel, AlgebraRow } from './model.js';

/**
 * Xếp các dòng của một chuỗi biến đổi.
 *
 * **Gióng theo dấu quan hệ** khi có: dấu $=$ thẳng cột thì mắt đọc *theo cột* để
 * thấy vế nào đứng yên và vế nào đang đổi. Đây là cách sách toán xếp một chuỗi biến
 * đổi, và `derivation` đã chọn đúng như vậy (`align: 'relation'`) — không phải
 * chuyện thẩm mỹ.
 */

const LINE_GAP = ROW * 0.28;
const RULE_GAP = FONT * 2.2;
export const RULE_SIZE = FONT * 0.62;
const COND_SIZE = FONT * 0.6;

export interface PlacedLine {
  readonly row: AlgebraRow;
  readonly glyphs: readonly PlacedGlyph[];
  readonly rules: readonly PlacedRule[];
  readonly paths: readonly PlacedPath[];
  readonly boxes: readonly NodeBox[];
  /** Hộp bao cả dòng — chỗ neo `[[a1|dòng thứ hai]]`. */
  readonly box: NodeBox;
  /** Chỗ in tên luật, nếu có. */
  readonly label: { readonly x: number; readonly y: number; readonly text: string } | null;
}

export interface Layout {
  readonly lines: readonly PlacedLine[];
  /** Dòng chữ đỏ dưới hình: điều kiện AL-08, rồi món nợ nghiệm ngoại lai. */
  readonly notes: readonly { readonly x: number; readonly y: number; readonly text: string }[];
  readonly width: number;
  readonly height: number;
}

/** Bề ngang phần đứng **trước** dấu quan hệ — thứ mọi dòng phải gióng theo. */
function leadWidth(row: AlgebraRow): number {
  return row.expr.k === 'rel' ? measure(toBox(row.expr.lhs)).w : 0;
}

export function layout(model: AlgebraModel): Layout {
  const rows = model.rows;
  const maxLead = Math.max(0, ...rows.map(leadWidth));

  const lines: PlacedLine[] = [];
  let y = 0;
  let right = 0;

  for (const row of rows) {
    const box = toBox(row.expr);
    const m = measure(box);
    const x = maxLead - leadWidth(row);
    const baseline = y + m.above;
    const p = place(box, x, baseline);

    lines.push({
      row,
      glyphs: p.glyphs,
      rules: p.rules,
      paths: p.paths,
      boxes: p.boxes,
      box: {
        id: row.id,
        x: round(x),
        y: round(y),
        width: round(Math.max(m.w, FONT * 0.5)),
        height: round(m.above + m.below),
      },
      label: null,
    });

    right = Math.max(right, x + m.w);
    y += m.above + m.below + LINE_GAP;
  }

  // Cột luật đứng sau dòng rộng nhất, nên nó không bao giờ đè lên công thức.
  const labelX = round(right + RULE_GAP);
  const withLabels: PlacedLine[] = lines.map((line) => {
    const text = line.row.note ?? line.row.ruleLabel;
    if (model.config.show_rules === false || text === null) return line;
    return {
      ...line,
      label: { x: labelX, y: round(line.box.y + line.box.height * 0.72), text },
    };
  });

  // Nhãn luật là **chữ giao diện tiếng Việt**, không phải chữ toán — đo bằng
  // `estimateTextWidth`, hàm sinh ra cho đúng việc này và cố ý ước dôi. Đo bằng bảng
  // chữ của engine thì thiếu chỗ và "nhân phân phối" hiện ra "nhân phân phố".
  const labelRight = withLabels.reduce(
    (acc, l) =>
      l.label === null ? acc : Math.max(acc, l.label.x + estimateTextWidth(l.label.text, RULE_SIZE)),
    right,
  );

  // Hai loại dòng đỏ, và chúng nói hai chuyện khác nhau:
  //
  //   - **điều kiện** (AL-08): bước chỉ đúng khi điều kiện đúng — một *giả thiết*;
  //   - **nghiệm ngoại lai**: bước đúng nhưng nới rộng tập nghiệm — một *món nợ*,
  //     phải trả bằng một lượt thử lại về sau.
  //
  // Gộp chúng vào một dòng là nói người đọc rằng chúng cùng loại. Không cùng.
  const notes: Array<{ x: number; y: number; text: string }> = [];
  const pushNote = (text: string): void => {
    notes.push({ x: 0, y: round(y + COND_SIZE * 0.8), text });
    y += COND_SIZE * 1.6;
  };
  if (model.conditions.length > 0) pushNote(`với ${model.conditions.join(', ')}`);
  if (model.extraneous.length > 0) pushNote('nghiệm có thể ngoại lai — phải thử lại');

  return {
    lines: withLabels,
    notes,
    width: round(
      Math.max(labelRight, ...notes.map((n) => estimateTextWidth(n.text, COND_SIZE))),
    ),
    height: round(y),
  };
}

/** Hộp của một danh tính — dùng chung cho `elementBoxes` và hit-test. */
export function boxOf(box: Layout, id: string): NodeBox | null {
  for (const line of box.lines) {
    if (line.box.id === id) return line.box;
    for (const b of line.boxes) if (b.id === id) return b;
  }
  return null;
}

/** Mọi danh tính **được vẽ**, đọc từ layout chứ không từ model (bài học M46). */
export function drawnIds(box: Layout): Set<string> {
  const out = new Set<string>();
  for (const line of box.lines) {
    out.add(line.box.id);
    for (const b of line.boxes) out.add(b.id);
  }
  return out;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000 + 0;
}
