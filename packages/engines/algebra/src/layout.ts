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
import { children, nodeAt, walk, type TermId } from './expr.js';
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

/**
 * **Mực giải thích** — thứ không thuộc về biểu thức mà thuộc về lời giải thích.
 *
 * Vẽ ở tầng bố cục chứ không ở renderer, vì nó là **hình học**: nó cần hộp bao của
 * từng hạng tử ở từng dòng, và đó đúng là thứ tầng này vừa tính xong. Renderer chỉ
 * biến nó thành node, và chỉ khi `ctx.explain` — golden với OG card render **không
 * qua** choreography nên mực này lọt vào ảnh tĩnh của cả kho nếu không có cửa ấy.
 */
export interface ExplainInk {
  /**
   * Sợi nối một hạng tử ở dòng $k-1$ với bản kế thừa của nó ở dòng $k$.
   *
   * Đây là **nội dung ngữ nghĩa của `move`** — "cái này thành cái kia" — mà không cần
   * chuyển động: đường vẽ làm việc chỉ chỗ thay cho quãng đường bay. `trace` cho sẵn
   * từng cặp, nên không phải suy từ chênh lệch hai ảnh như `interpolateNodes`.
   */
  readonly threads: readonly {
    readonly id: string;
    readonly step: number;
    readonly kind: 'split' | 'join' | 'carry';
    readonly x1: number;
    readonly y1: number;
    readonly x2: number;
    readonly y2: number;
  }[];
  /** Gạch chéo qua hạng tử sắp biến mất — §10 đã hứa và chưa từng vẽ. */
  readonly strikes: readonly {
    readonly id: string;
    readonly step: number;
    readonly x1: number;
    readonly y1: number;
    readonly x2: number;
    readonly y2: number;
  }[];
  /** Ngoặc nhọn dưới từng nhóm — cách nhóm là mẹo của bài, nên nó phải nhìn thấy được. */
  readonly braces: readonly {
    readonly id: string;
    readonly step: number;
    readonly x1: number;
    readonly x2: number;
    readonly y: number;
  }[];
  /** Sợi từ dòng điều kiện đỏ tới đúng cây con mà nó nói về. */
  readonly conditionLinks: readonly {
    readonly id: string;
    readonly x1: number;
    readonly y1: number;
    readonly x2: number;
    readonly y2: number;
  }[];
  /** Danh tính mực → chỉ số vai, để tô màu. */
  readonly roleOf: ReadonlyMap<string, number>;
}

export interface Layout {
  readonly lines: readonly PlacedLine[];
  /** Dòng chữ đỏ dưới hình: điều kiện AL-08, rồi món nợ nghiệm ngoại lai. */
  readonly notes: readonly { readonly x: number; readonly y: number; readonly text: string }[];
  readonly explain: ExplainInk;
  readonly width: number;
  readonly height: number;
}

/**
 * Danh tính của một hạng tử **trong một dòng cụ thể**.
 *
 * `TermId` bền qua các dòng — đó là cả thiết kế (DAT-11/12): $e_2$ ở dòng ba đúng là
 * nút $e_2$ của dòng một. Nhưng nó khiến **cùng một tên** nằm trên nhiều nút DOM, và
 * choreography địa chỉ hoá bằng tên: một pha chạm `e2` chạm mọi dòng còn chứa nó. Với
 * `focus` thì đó lại hay — hạng tử sáng lên ở mọi chỗ nó còn sống. Với `show` thì
 * hỏng: không hiện được dòng $k$ mà giữ dòng $k-1$ nguyên.
 *
 * Nên mực mang tên **theo dòng**, còn `TermId` vẫn nguyên trong model để `trace` nói
 * được ai là ai. Muốn hiệu ứng "sáng ở mọi dòng" thì pha khai nhiều đích — bộ sinh
 * làm được vì nó biết hạng tử sống ở những dòng nào.
 *
 * Dấu `-` chứ không phải `:`: `ENTITY_ID_PATTERN` không nhận dấu hai chấm.
 */
export const elementId = (rowIndex: number, term: string): string => `r${rowIndex}-${term}`;

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

  for (const [k, row] of rows.entries()) {
    const box = toBox(row.expr);
    const m = measure(box);
    const x = maxLead - leadWidth(row);
    const baseline = y + m.above;
    const p = place(box, x, baseline);
    const scope = (id: string | null): string | null => (id === null ? null : elementId(k, id));

    lines.push({
      row,
      glyphs: p.glyphs.map((g) => ({ ...g, owner: scope(g.owner) })),
      rules: p.rules.map((r) => ({ ...r, owner: scope(r.owner) })),
      paths: p.paths.map((q) => ({ ...q, owner: scope(q.owner) })),
      boxes: p.boxes.map((b) => ({ ...b, id: elementId(k, b.id) })),
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
    explain: explainInk(model, withLabels, notes),
    width: round(
      Math.max(labelRight, ...notes.map((n) => estimateTextWidth(n.text, COND_SIZE))),
    ),
    height: round(y),
  };
}

/**
 * Dựng mực giải thích từ model + hộp bao đã đặt.
 *
 * Mọi thứ ở đây đọc từ `trace`, `roles` và `at` — tức từ **cấu trúc kết quả**, không
 * từ tên luật. Luật thứ 42 ra đời là nó có sợi nối và gạch triệt tiêu ngay, không phải
 * chờ ai thêm một dòng vào bảng tra.
 */
function explainInk(
  model: AlgebraModel,
  lines: readonly PlacedLine[],
  notes: readonly { readonly x: number; readonly y: number; readonly text: string }[],
): ExplainInk {
  const threads: ExplainInk['threads'][number][] = [];
  const strikes: ExplainInk['strikes'][number][] = [];
  const braces: ExplainInk['braces'][number][] = [];
  const conditionLinks: ExplainInk['conditionLinks'][number][] = [];
  const roleOf = new Map<string, number>();

  const boxAt = (rowIndex: number, term: string): NodeBox | undefined =>
    lines[rowIndex]?.boxes.find((b) => b.id === elementId(rowIndex, term));

  /**
   * Chỉ **mảnh sơ cấp** mới có sợi nối và gạch triệt tiêu.
   *
   * `freshCopy` khai cặp cho *mọi* nút trong cây con nó sao, kể cả nút bao. Nối hai
   * nút bao với nhau thì sợi chạy từ giữa cả biểu thức tới giữa cả biểu thức — đúng
   * về dữ liệu, vô nghĩa với mắt, và mấy sợi ấy phủ kín hình. Nút không có con thì
   * nối được: nó là một vật người đọc chỉ tay vào được.
   */
  const leaves = model.rows.map((r) => {
    const out = new Set<TermId>();
    walk(r.expr, (n) => {
      if (children(n).length === 0) out.add(n.id);
    });
    return out;
  });
  const isLeaf = (rowIndex: number, term: TermId): boolean =>
    leaves[rowIndex]?.has(term) ?? false;

  for (let k = 1; k < model.rows.length; k += 1) {
    const row = model.rows[k] as AlgebraRow;

    // Vai: cùng một danh sách `TermId` tô được **cả hai dòng**, vì id bền qua các dòng.
    // Bước sau ghi đè bước trước trên dòng dùng chung — bước đang được kể thắng.
    row.roles.forEach((group, index) => {
      for (const term of group) {
        for (const r of [k - 1, k]) {
          if (boxAt(r, term)) roleOf.set(elementId(r, term), index);
        }
      }
    });

    // Nút **được áp luật** biến mất là chuyện cấu trúc — "chỗ này vừa được viết lại"
    // — chứ không phải một phép triệt tiêu. Gạch chéo qua nó là gạch qua cả biểu
    // thức, và pha `focus` đã nói đúng điều ấy rồi. Chỉ hậu duệ của nó mới bị gạch:
    // đó là ca `drop_unit` bỏ thừa số $1$, `cancel_common` rút một nhân tử.
    const rewritten = nodeAt(model.rows[k - 1]!.expr, row.at)?.id;
    // …và chỉ khi **chính nút ấy sống sót**. Nút được áp luật mà biến mất nghĩa là cả
    // cây con vừa bị viết lại — lúc ấy mọi lá bên trong "biến mất" theo, và gạch chéo
    // từng cái một là gạch nát cả dòng (`factor_by_grouping` dựng lại toàn bộ). Nút
    // ấy còn sống thì thứ mất đi thật sự là *bị triệt tiêu khỏi một biểu thức đang
    // đứng yên* — đúng ca `drop_unit` bỏ thừa số $1$, `cancel_common` rút nhân tử.
    const survives = rewritten !== undefined && boxAt(k, rewritten) !== undefined;

    for (const [from, to] of row.trace) {
      const source = boxAt(k - 1, from);
      if (!source) continue;

      // Rỗng ⇒ biến mất: gạch chéo qua chính nó.
      if (to.length === 0) {
        if (!survives || from === rewritten || !isLeaf(k - 1, from)) continue;
        strikes.push({
          id: `x${k}-${from}`,
          step: k,
          x1: round(source.x),
          y1: round(source.y + source.height),
          x2: round(source.x + source.width),
          y2: round(source.y),
        });
        continue;
      }

      // Còn lại ⇒ sợi nối tới từng bản kế thừa. Một nguồn ra nhiều bản là `split`;
      // nhiều nguồn về một bản là `join` — cả hai cùng một hình học, khác cái tên để
      // renderer chọn được nét.
      if (!isLeaf(k - 1, from)) continue;
      const kind = to.length > 1 ? 'split' : 'join';
      for (const [i, target] of to.entries()) {
        const dest = boxAt(k, target);
        if (!dest || !isLeaf(k, target)) continue;
        threads.push({
          id: `t${k}-${from}-${i}`,
          step: k,
          kind,
          x1: round(source.x + source.width / 2),
          y1: round(source.y + source.height),
          x2: round(dest.x + dest.width / 2),
          y2: round(dest.y),
        });
      }
    }

    // Ngoặc nhọn dưới từng nhóm: chỉ vẽ khi luật khai vai **và** mỗi vai nằm gọn trong
    // dòng nguồn — tức đúng ca `factor_by_grouping`, không phải mọi hằng đẳng thức.
    row.roles.forEach((group, index) => {
      const boxes = group.map((t) => boxAt(k - 1, t)).filter((b): b is NodeBox => b !== undefined);
      if (boxes.length < 2) return;
      const x1 = Math.min(...boxes.map((b) => b.x));
      const x2 = Math.max(...boxes.map((b) => b.x + b.width));
      const y = Math.max(...boxes.map((b) => b.y + b.height));
      braces.push({ id: `g${k}-${index}`, step: k, x1: round(x1), x2: round(x2), y: round(y + 0.6) });
    });
  }

  // Dòng đỏ điều kiện đang lơ lửng dưới hình, không dính vào gì. Nối nó với cây con
  // **cuối cùng bị áp luật** — chỗ gần nhất với thứ nó đang ràng buộc.
  const note = notes[0];
  const lastStep = model.rows.length - 1;
  if (note !== undefined && model.conditions.length > 0 && lastStep >= 1) {
    const anchorBox = lines[lastStep]?.box;
    if (anchorBox) {
      conditionLinks.push({
        id: 'condlink',
        x1: round(note.x + 1),
        y1: round(note.y - COND_SIZE * 0.8),
        x2: round(anchorBox.x + 1),
        y2: round(anchorBox.y + anchorBox.height),
      });
    }
  }

  return { threads, strikes, braces, conditionLinks, roleOf };
}

/** Hộp của một danh tính — dùng chung cho `elementBoxes` và hit-test. */
export function boxOf(box: Layout, id: string): NodeBox | null {
  for (const line of box.lines) {
    if (line.box.id === id) return line.box;
    for (const b of line.boxes) if (b.id === id) return b;
  }
  return null;
}

/**
 * Danh tính của **mực giải thích** — tách khỏi `drawnIds` một cách có chủ ý.
 *
 * `drawnIds` là tập neo được (`implicitElementIds`), và mực giải thích **không** thuộc
 * về nó: nó chỉ tồn tại khi `ctx.explain`, nên một anchor trỏ vào nó sẽ trỏ vào hư
 * không ở golden và OG card. Choreography thì nhắm được, vì Player vẽ với `explain`.
 */
export function explainIds(box: Layout): Set<string> {
  const e = box.explain;
  return new Set([
    ...e.threads.map((t) => t.id),
    ...e.strikes.map((s) => s.id),
    ...e.braces.map((g) => g.id),
    ...e.conditionLinks.map((c) => c.id),
  ]);
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
