import type { Scene } from '@combviz/schema';
import { walk, type Expr, type TermId } from './expr.js';
import { drawnIds, elementId, layout, parseElementId } from './layout.js';
import { readAlgebra, type AlgebraModel } from './model.js';

/**
 * Tiểu sử một hạng tử (AL-13) — *"con số này từ đâu ra?"*
 *
 * Câu hỏi ấy là câu lớp học hỏi nhiều nhất trước một chuỗi biến đổi, và engine **đã**
 * có sẵn câu trả lời từ M46: `AlgebraRow.trace` ghi nút cũ đi đâu, `TermId` bền qua
 * mọi dòng (DAT-11/12). Chỉ là chưa ai hỏi. Cho tới M62 thì `trace` chỉ được dùng để
 * sinh choreography — tính ra rồi vứt đi phần còn lại.
 *
 * ## `trace` chỉ ghi chỗ **đổi**, nên phép nối phải tự suy phần còn lại
 *
 * `model.ts` dựng `trace` từ ba nguồn: `dup` (nút nhân bản), `merged` (nhiều nút gộp
 * một, hoặc gộp về `''` nghĩa là biến mất), và một vòng quét cuối bắt những nút có ở
 * dòng trước mà không có ở dòng sau. Nút **đi tiếp nguyên vẹn** không có mặt trong ba
 * nguồn ấy — và đó là đa số nút của mọi dòng.
 *
 * Nên quy tắc nối có hai vế, và vế thứ hai mới là vế gánh việc:
 *
 * ```
 * trace.has(id) ? trace.get(id) : (dòng sau còn id ? [id] : [])
 * ```
 *
 * Bỏ vế thứ hai thì phả hệ của mọi hạng tử đứt ngay dòng đầu tiên nó không bị luật
 * chạm tới — tức là gần như luôn luôn. Chốt canh bẻ đúng vế ấy.
 *
 * ## Đi **cả hai chiều**
 *
 * Chạm vào một hạng tử ở dòng cuối thì câu hỏi là "nó từ đâu ra" (lên trên); chạm vào
 * dòng đầu thì câu hỏi là "rồi nó thành cái gì" (xuống dưới). Không có cách nào đoán
 * người ta đang hỏi chiều nào, và cũng không cần đoán: cả hai chiều đều là *cùng một*
 * phả hệ, và tô cả hai cho thấy trọn đời của hạng tử ấy.
 *
 * Chiều lên là **nghịch ảnh** của `trace`, không phải một bảng thứ hai. Một nút gộp từ
 * ba nút thì đi lên ra ba tổ tiên — và đó đúng là thứ cần thấy khi hỏi $2ab$ từ đâu ra.
 */

/** `TermId` của mọi nút trong một cây. */
function idsOf(e: Expr): Set<TermId> {
  const out = new Set<TermId>();
  walk(e, (n) => out.add(n.id));
  return out;
}

/**
 * Phả hệ của `id` tại dòng `rowIndex`: dòng → tập `TermId` thuộc phả hệ ở dòng ấy.
 *
 * Rỗng khi `rowIndex` ngoài phạm vi hoặc `id` không có ở dòng ấy. Dòng nào không có
 * hậu duệ (hạng tử đã biến mất) thì **không có mặt** trong map, chứ không phải có mặt
 * với tập rỗng: "không còn ở đây" và "ở đây rỗng" là hai câu khác nhau.
 */
export function lineageOf(
  model: AlgebraModel,
  rowIndex: number,
  id: TermId,
): ReadonlyMap<number, ReadonlySet<TermId>> {
  const out = new Map<number, ReadonlySet<TermId>>();
  const rows = model.rows;
  const start = rows[rowIndex];
  if (!start || !idsOf(start.expr).has(id)) return out;

  out.set(rowIndex, new Set([id]));

  // Xuống dưới: `trace` của dòng $k$ nói nút của dòng $k-1$ đi đâu.
  let living: ReadonlySet<TermId> = new Set([id]);
  for (let k = rowIndex + 1; k < rows.length; k += 1) {
    const row = rows[k];
    if (!row) break;
    const present = idsOf(row.expr);
    const next = new Set<TermId>();
    for (const from of living) {
      const moved = row.trace.get(from);
      if (moved !== undefined) for (const to of moved) next.add(to);
      else if (present.has(from)) next.add(from);
    }
    if (next.size === 0) break;
    out.set(k, next);
    living = next;
  }

  // Lên trên: nghịch ảnh của `trace`.
  living = new Set([id]);
  for (let k = rowIndex; k > 0; k -= 1) {
    const row = rows[k];
    const above = rows[k - 1];
    if (!row || !above) break;
    const present = idsOf(above.expr);
    const back = new Set<TermId>();
    for (const [from, to] of row.trace) {
      if (to.some((t) => living.has(t))) back.add(from);
    }
    for (const one of living) {
      // Không ai khai nó đổi, mà dòng trên có nó ⇒ nó vốn đã ở đó.
      if (present.has(one)) back.add(one);
    }
    if (back.size === 0) break;
    out.set(k - 1, back);
    living = back;
  }

  return out;
}

/**
 * ### Một lớp canh **đã bị gỡ**, và vì sao
 *
 * Bản đầu có thêm điều kiện `&& !trace.has(one)` ở nhánh tự nối ngược chiều, với lý lẽ:
 * một `TermId` có thể vừa là **khoá** của `trace` vừa còn sống ở dòng dưới với chính
 * tên ấy, nên không kiểm thì phả hệ cộng thêm một tổ tiên mà `trace` đã nói rõ rồi.
 *
 * Bẻ nó ra thì **14/14 test vẫn xanh** — không phải vì test yếu, mà vì hình ấy không
 * tồn tại. Chỗ duy nhất sinh ra "khoá mà vẫn sống" là `dup`, và `dup` ghi
 * `trace.set(from, [from, to])` — tức `from` nằm trong chính danh sách đích, nên vòng
 * lặp nghịch ảnh đã bắt nó, và cộng thêm lần nữa vào một `Set` không đổi gì. `merged`
 * và vòng quét cuối chỉ khai những id **không còn** ở dòng sau.
 *
 * Nên nó là một nhánh không đầu vào nào với tới. Giữ thì có một dòng mãi mãi không ai
 * kiểm được (bài học M48 lật ngược: lần này là *code* rỗng chứ không phải *test* rỗng);
 * gỡ thì mất một lớp canh giả. Gỡ, và ghi lại đây để lần sau ai đó thấy thiếu thì biết
 * nó đã được cân nhắc.
 */

/**
 * Phả hệ dưới dạng **danh tính vẽ ra** — thứ Player đưa thẳng vào `ctx.highlight`.
 *
 * `null` khi `id` không phải một hạng tử (chạm vào chỗ trống, vào nhãn luật, vào hộp
 * dòng) hoặc scene không đọc được. `null` chứ không phải tập rỗng: Player phân biệt
 * "chạm trúng một hạng tử đứng một mình" với "chạm hụt", và cái sau phải **xoá** vệt
 * đang sáng chứ không phải thay nó bằng một vệt rỗng.
 *
 * Lọc qua `drawnIds`: một nút có trong cây mà không có mực (hệ số $1$ bị bỏ ở tầng
 * hiển thị) thì tên nó không trỏ vào đâu, và đưa vào `highlight` là đưa một id chết —
 * cùng lớp với lỗi mà `anchor/undrawn-element` (`schema/structure.ts`) chặn ở phía
 * anchor tác giả khai, và với chốt canh *"mọi đích của mọi pha đều là danh tính có
 * mực"* ở phía choreography sinh lúc chạy.
 *
 * (Bản trước gọi cả hai là chốt canh `element-identity` — một cái tên không tồn tại ở
 *  đâu trong repo. Xem `choreography.ts` và §51.8.)
 */
export function algebraLineage(scene: Scene, drawnId: string): ReadonlySet<string> | null {
  const at = parseElementId(drawnId);
  if (at === null) return null;

  const model = readAlgebra(scene);
  if (model.refusal !== null) return null;

  const lineage = lineageOf(model, at.row, at.term);
  if (lineage.size === 0) return null;

  const drawn = drawnIds(layout(model));
  const out = new Set<string>();
  for (const [row, terms] of lineage) {
    for (const term of terms) {
      const id = elementId(row, term);
      if (drawn.has(id)) out.add(id);
    }
  }
  return out.size === 0 ? null : out;
}
