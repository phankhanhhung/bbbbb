import type { Choreography, Scene } from '@combviz/schema';
import { nodeAt, walk, type Expr, type TermId } from './expr.js';
import { elementId, layout, type Layout } from './layout.js';
import { readAlgebra, type AlgebraModel } from './model.js';

/**
 * Choreography **sinh ra từ model** (AL-06) — không do tác giả gõ.
 *
 * Đặc tả §10 khai mục này từ đầu và nó chưa từng được cài. Hậu quả đo được: 39/39
 * step dùng engine đại số **không có một pha nào**, tức mọi hình đại số trong kho là
 * ảnh tĩnh — cả bộ máy timeline, nhãn pha và `hold` của M48 chưa chạm tới engine mới
 * nhất. Tác giả gõ tay thì cũng vô lý: chuỗi biến đổi là thứ engine *tính ra*, nên
 * nhịp của nó cũng phải suy ra từ đó, không thì hai bên lệch nhau ngay lần sửa đầu.
 *
 * ## Suy từ **hình dạng kết quả**, không từ bảng tên luật
 *
 * `model` đã ghi sẵn mọi thứ cần để kể chuyện, và ghi bằng cấu trúc chứ không bằng
 * tên: `at` là cây con bị áp luật, `trace` nói nút cũ đi đâu (rỗng = biến mất, một =
 * đi tiếp, nhiều = **tách ra**), `born` là nút mới. Một bảng `rule.id → kiểu chuyển
 * động` sẽ quên luật thứ 42; đọc cấu trúc thì luật mới có nhịp đúng ngay hôm nó ra
 * đời. Cùng bài học với `out.guard`/`out.binding` ở chốt canh M50.
 *
 * ## Vì sao không có `move`/`morph`
 *
 * Vì trong một chuỗi biến đổi **mọi dòng đều ở lại trên màn hình**. `move` hiện có
 * nghĩa "bay **tới**" một đích và đậu ở đó, nên muốn hạng tử dòng $k$ "bay xuống"
 * dòng $k+1$ thì phải lấy bản của dòng $k$ đi — và dòng $k$ thủng một lỗ. Thứ cần là
 * "bay **từ**", mà thêm nó là đổi lược đồ pha dùng chung cho cả chín engine. Không
 * lén làm ở đây. Nên chuyện "hạng tử này chính là hạng tử kia" được kể bằng `focus`
 * đồng thời ở cả hai dòng — nhờ `TermId` bền, bộ sinh biết chính xác cặp ấy.
 */

const STEP_MS = 1400;
const FOCUS_MS = 420;
const REVEAL_MS = 420;

/** Mọi danh tính vẽ ra trong một dòng. */
function idsOfRow(box: Layout, rowIndex: number): string[] {
  const line = box.lines[rowIndex];
  if (line === undefined) return [];
  return [...new Set(line.boxes.map((b) => b.id))];
}

/** `TermId` của mọi nút trong một cây con. */
function termsIn(e: Expr): Set<TermId> {
  const out = new Set<TermId>();
  walk(e, (n) => out.add(n.id));
  return out;
}

/**
 * Hạng tử ở dòng `rowIndex` **thật sự được vẽ** mang tên nào.
 *
 * Lọc qua `boxes` chứ không dựng tên từ `TermId`: nút có trong cây mà không có mực
 * (hệ số $1$ bị bỏ ở tầng hiển thị chẳng hạn) thì tên nó không trỏ vào đâu, và một
 * pha nhắm vào đó là một pha im lặng không làm gì — đúng loại lỗi mà chốt canh
 * `element-identity` sinh ra để chặn.
 */
function drawnAmong(box: Layout, rowIndex: number, terms: ReadonlySet<TermId>): string[] {
  const drawn = new Set(idsOfRow(box, rowIndex));
  return [...terms].map((t) => elementId(rowIndex, t)).filter((id) => drawn.has(id));
}

export interface AlgebraChoreographyOptions {
  /** Khoá anchor để mọi pha neo vào (CHO-07). Kho hiện dùng `a1` ở 39/39 step. */
  readonly anchor?: string;
}

/**
 * Sinh timeline cho một scene đại số. `undefined` khi không có gì để kể.
 */
export function algebraChoreography(
  scene: Scene,
  options: AlgebraChoreographyOptions = {},
): Choreography | undefined {
  const model = readAlgebra(scene);
  if (model.refusal !== null || model.rows.length < 2) return undefined;
  return choreographyOf(model, layout(model), options.anchor ?? 'a1');
}

/** Bản nhận sẵn model và layout — để chốt canh khỏi dựng lại hai lần. */
export function choreographyOf(
  model: AlgebraModel,
  box: Layout,
  anchor: string,
): Choreography | undefined {
  const phases: NonNullable<Choreography>['phases'][number][] = [];
  const push = (p: (typeof phases)[number]): void => {
    phases.push(p);
  };

  for (let k = 1; k < model.rows.length; k += 1) {
    const row = model.rows[k] as (typeof model.rows)[number];
    const prev = model.rows[k - 1] as (typeof model.rows)[number];
    const t = (k - 1) * STEP_MS;

    // 1. **Chỗ sắp đổi**, sáng lên ở dòng trên — và dừng lại ở đây.
    //
    // `hold` đặt đúng chỗ này chứ không rải đều: đây là khoảnh khắc người đọc cần để
    // nhìn ra *vì sao* luật áp được. Bấm tiếp thì dòng mới mới hiện. Không bao giờ
    // rơi vào pha cuối (luôn còn pha "hiện dòng" phía sau), nên không mắc lỗi
    // `hold-at-end` mà M48 đã đặt luật.
    const target = nodeAt(prev.expr, row.at);
    const changing = target === null ? [] : drawnAmong(box, k - 1, termsIn(target));
    if (changing.length > 0) {
      push({
        id: `s${k}-focus`,
        kind: 'focus',
        targets: changing.slice(0, 200),
        at: t,
        duration: FOCUS_MS,
        anchor,
        label: { vi: row.note ?? row.ruleLabel ?? 'biến đổi' },
        hold: true,
      });
    }

    // 2. Nút **biến mất** thì mờ đi trước khi dòng mới hiện — nếu không thì người đọc
    //    chỉ thấy dòng sau ngắn hơn mà không biết cái gì đã đi.
    const gone = drawnAmong(
      box,
      k - 1,
      new Set([...row.trace].filter(([, to]) => to.length === 0).map(([from]) => from)),
    );
    if (gone.length > 0) {
      push({
        id: `s${k}-gone`,
        kind: 'dim',
        targets: gone.slice(0, 200),
        at: t + FOCUS_MS,
        duration: 260,
        anchor,
      });
    }

    // 3. Dòng mới hiện ra — **kèm tên dòng**, vì nhãn luật đeo danh tính ấy. Thiếu nó
    //    thì khung đầu bày sẵn tên mọi phép biến đổi trong khi mới có một dòng.
    const arriving = [...idsOfRow(box, k), box.lines[k]?.box.id ?? `row${k}`];
    if (arriving.length > 0) {
      push({
        id: `s${k}-line`,
        kind: 'show',
        targets: arriving.slice(0, 200),
        at: t + FOCUS_MS + 180,
        duration: REVEAL_MS,
        anchor,
        label: { vi: `dòng ${k + 1}` },
      });
    }

    // 4. Chuyện riêng của bước này, đọc từ **cấu trúc** `trace`:
    //    một nút ra nhiều bản ⇒ nhân bản; nhiều nút về một ⇒ nhập lại; còn lại ⇒ mới.
    //    Cả ba đều tô sáng **đồng thời** nguồn ở dòng trên và đích ở dòng dưới, vì đó
    //    là cách duy nhất nói "hai chỗ này là một vật" khi không có `move`.
    const split = [...row.trace].filter(([, to]) => to.length > 1);
    const joined = [...row.trace].filter(([, to]) => to.length === 1);

    const highlight: string[] = [];
    let story: string | null = null;
    if (split.length > 0) {
      story = 'nhân bản';
      for (const [from, to] of split) {
        highlight.push(...drawnAmong(box, k - 1, new Set([from])));
        highlight.push(...drawnAmong(box, k, new Set(to)));
      }
    } else if (joined.length > 1) {
      story = 'gộp lại';
      for (const [from, to] of joined) {
        highlight.push(...drawnAmong(box, k - 1, new Set([from])));
        highlight.push(...drawnAmong(box, k, new Set(to)));
      }
    } else if (row.born.length > 0) {
      story = 'phần mới';
      highlight.push(...drawnAmong(box, k, new Set(row.born)));
    }

    const unique = [...new Set(highlight)];
    if (story !== null && unique.length > 0) {
      push({
        id: `s${k}-story`,
        kind: 'focus',
        targets: unique.slice(0, 200),
        at: t + FOCUS_MS + 180 + REVEAL_MS,
        duration: 360,
        anchor,
        label: { vi: story },
      });
    }
  }

  return phases.length === 0 ? undefined : { phases };
}

/** Mọi danh tính mà bộ sinh có thể nhắm tới — dùng cho chốt canh. */
export function choreographyTargets(spec: Choreography): Set<string> {
  const out = new Set<string>();
  for (const p of spec.phases) for (const t of p.targets) out.add(t);
  return out;
}
