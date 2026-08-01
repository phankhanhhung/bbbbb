import type { Scene } from '@combviz/schema';
import { varsOf } from './expr.js';
import { evalReal, guardList, type Guard } from './check.js';
import { noteId } from './layout.js';
import { readAlgebra } from './model.js';
import { toPlain } from './parse.js';

/**
 * *"Thì sao nếu $x = 1$?"* — biến một dòng điều kiện thành một **điểm cụ thể** (AL-14).
 *
 * Dòng đỏ *"với $x - 1 \ne 0$"* đã có từ M50 và nó đúng, nhưng nó nói bằng thứ tiếng
 * của người đã hiểu. Người học nhìn nó và hỏi câu tiếp theo — *chuyện gì xảy ra ở chỗ
 * bị cấm* — mà dòng chữ ấy không trả lời được, và cũng không thể trả lời được: nó chỉ
 * là một chuỗi. Từ M64 điều kiện mang theo `Guard` của nó (`model.Condition`), nên câu
 * hỏi kia có chỗ để hỏi.
 *
 * ## Tìm điểm, không giải bất phương trình
 *
 * Engine này **không có bộ giải** và mục này không mở một cái. Nó quét một lưới hữu tỉ
 * nhỏ và trả về điểm đầu tiên làm điều kiện gãy. Không tìm được thì trả `null` và im —
 * bịa ra một điểm không kiểm chứng được thì tệ hơn im lặng, và đây đúng là chỗ dễ bịa.
 *
 * Thứ tự quét là một quyết định sư phạm: **mẫu số nhỏ trước, rồi tới trị tuyệt đối
 * nhỏ**. Nhờ vậy câu trả lời là *"tại $x = 1$"* chứ không phải *"tại $x = -23/4$"* —
 * cùng một sự thật, nhưng một cái dạy được và một cái thì không.
 */

/** Lưới hữu tỉ: mẫu $\le 4$, trị $\le 6$. Sắp sao cho số đẹp được thử trước. */
const GRID: readonly number[] = (() => {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const q of [1, 2, 3, 4]) {
    const at: number[] = [];
    for (let p = -6 * q; p <= 6 * q; p += 1) at.push(p / q);
    // Trong cùng một mẫu số: gần $0$ trước, và số dương trước số âm khi cùng khoảng
    // cách — $x = 1$ dễ đọc hơn $x = -1$.
    at.sort((a, b) => Math.abs(a) - Math.abs(b) || b - a);
    for (const v of at) {
      if (seen.has(v)) continue;
      seen.add(v);
      out.push(v);
    }
  }
  return out;
})();

/** Trần số biến: ba biến là $60^3$ điểm, và một cú chạm không được tốn ngần ấy. */
const MAX_VARS = 2;

/**
 * Điểm đầu tiên làm **một trong các** điều kiện gãy. `null` khi không có.
 *
 * Chỉ nhận điểm mà biểu thức điều kiện **xác định**: một điểm làm nó trả `null` cũng
 * làm `guardHolds` trả `false`, nhưng câu *"tại $x = 1$: không xác định"* không nói
 * được gì — nó chỉ dời câu hỏi đi một bước.
 */
export function violationOf(
  guards: readonly Guard[],
): { guard: Guard; env: Map<string, number>; value: number } | null {
  for (const guard of guards) {
    const names = [...varsOf(guard.expr)].sort();
    if (names.length === 0 || names.length > MAX_VARS) continue;

    for (const point of points(names)) {
      const v = evalReal(guard.expr, point);
      if (v === null) continue;
      const broken =
        guard.sign === '!=0' ? Math.abs(v) <= 1e-9 : guard.sign === '>=0' ? v < 0 : v > 0;
      if (broken) return { guard, env: point, value: v };
    }
  }
  return null;
}

/** Tích Descartes của lưới trên `names`, theo thứ tự "số đẹp trước". */
function* points(names: readonly string[]): Generator<Map<string, number>> {
  const first = names[0] as string;
  if (names.length === 1) {
    for (const v of GRID) yield new Map([[first, v]]);
    return;
  }
  const second = names[1] as string;
  for (const a of GRID) {
    for (const b of GRID) {
      yield new Map([
        [first, a],
        [second, b],
      ]);
    }
  }
}

/**
 * Chạm vào một dòng đỏ → câu trả lời, hoặc `null`.
 *
 * Chỉ nhận `noteId(i)`; mọi danh tính khác trả `null` để chỗ gọi đi tiếp sang phả hệ.
 * Và chỉ dòng **điều kiện** mới có chuyện để kể: dòng "nghiệm có thể ngoại lai" là một
 * món nợ về sau, không phải một chỗ cấm ở hiện tại — chạm vào nó không ra gì, đúng.
 */
export function algebraIncident(scene: Scene, elementId: string): { text: string } | null {
  const model = readAlgebra(scene);
  if (model.refusal !== null || model.conditions.length === 0) return null;
  // Dòng điều kiện luôn là dòng đỏ **đầu tiên** (`layout.ts` đẩy nó vào trước).
  if (elementId !== noteId(0)) return null;

  const found = violationOf(model.conditions.flatMap((c) => guardList(c.guard)));
  if (found === null) return null;

  const at = [...found.env].map(([n, v]) => `${n} = ${num(v)}`).join(', ');
  const lhs = toPlain(found.guard.expr).replace(/-/g, '−');
  const value = num(found.value);
  const why =
    found.guard.sign === '!=0'
      ? `${lhs} = 0 — chia cho không`
      : found.guard.sign === '>=0'
        ? `${lhs} = ${value} < 0`
        : `${lhs} = ${value} > 0`;
  return { text: `tại ${at}: ${why}` };
}

/** Số hữu tỉ mẫu nhỏ, in cho người đọc chứ không cho máy: `1`, `−3`, `1/2`. */
function num(v: number): string {
  const sign = v < 0 ? '−' : '';
  const a = Math.abs(v);
  if (Number.isInteger(a)) return `${sign}${a}`;
  for (const q of [2, 3, 4]) {
    if (Number.isInteger(a * q)) return `${sign}${a * q}/${q}`;
  }
  return `${sign}${a.toFixed(3)}`;
}
