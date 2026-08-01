import type { Scene } from '@combviz/schema';

/**
 * **Vết chân người học** trong sandbox (SBX-06, M75).
 *
 * `history.ts` ghi một dòng: quá khứ, hiện tại, tương lai. Và nó ghi thẳng ra ở
 * chú thích của chính nó rằng làm một việc mới thì nhánh redo cũ **mất** — "giữ
 * lại nó sẽ biến lịch sử thành cây mà không ai hỏi". Mục này là lúc có người hỏi.
 *
 * Nghịch một bài tổ hợp không phải một dòng. Người học đặt ba quân, thấy tắc, lùi
 * hai bước, thử lối khác, tắc nữa, lùi tiếp. Cái *hình dạng* của lượt nghịch ấy —
 * đã đi tới đâu, rẽ ở chỗ nào, nhánh nào bỏ dở — là thứ duy nhất họ **không** thấy
 * được trong khi đang nghịch, vì undo vừa xoá nó đi.
 *
 * ## Nó không phải cái gì
 *
 * Không phải bộ giải, không phải gợi ý (NG-03 nguyên vẹn). Bản đồ này **chỉ chứa
 * những chỗ người học đã đặt chân**. Nó không biết đường nào tốt hơn, không đánh
 * dấu ngõ cụt, không đếm "còn bao xa". Mọi thông tin trên nó là thông tin người
 * học tự tạo ra — nên nó trả lời được đúng một câu hỏi, và là câu hỏi họ thật sự
 * hay hỏi: *"chỗ này mình thử rồi à?"*
 *
 * ## Gộp theo **vị trí**, không theo đường đi
 *
 * Hai thứ tự nước đi khác nhau dẫn tới cùng một thế là **một** nút. Đó là cả
 * điểm: không gộp thì bản đồ là một cái cây mọc mãi và không bao giờ nói được
 * "đây là chỗ cũ" — mà "đây là chỗ cũ" chính là thứ đáng tiền duy nhất ở đây.
 *
 * Khoá vị trí bỏ **thứ tự trong `elements`**: thêm A rồi B và thêm B rồi A cho ra
 * cùng một thế cờ, và mảng khác thứ tự thì không. Thứ tự ấy không mang nghĩa ở
 * engine nào — vị trí nằm trong `pos`/`cells`, thứ tự bước của engine đại số nằm
 * trong `config.steps` — nên bỏ nó là bỏ đúng phần nhiễu.
 */

export interface TrailEdge {
  /** Nhãn của lệnh đã đi cạnh này — cùng chuỗi mà lịch sử undo hiện. */
  readonly label: string;
  readonly to: string;
}

export interface TrailNode {
  readonly id: string;
  readonly scene: Scene;
  /** Số bước ít nhất **theo đúng đường người học đã đi**, không phải khoảng cách thật. */
  readonly depth: number;
  /** Số lần đặt chân. `> 1` nghĩa là đã quay lại đây. */
  readonly visits: number;
  readonly out: readonly TrailEdge[];
}

export interface Trail {
  readonly root: string;
  readonly at: string;
  readonly nodes: ReadonlyMap<string, TrailNode>;
}

/**
 * Trần số nút.
 *
 * Bản đồ là để **nhìn**, và bốn mươi chấm đã là nhiều hơn mắt đọc được trong một
 * liếc. Chạm trần thì thôi ghi nút mới và nói ra ({@link trailFull}) — im lặng
 * ngừng ghi là cách chắc nhất làm người ta tin vào một bản đồ đã hết đúng.
 */
export const TRAIL_LIMIT = 40;

/** Khoá vị trí: nội dung scene, `elements` sắp theo `id`. */
export function positionKey(scene: Scene): string {
  const elements = [...scene.elements].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return hash(canonical({ ...scene, elements } as unknown));
}

export function createTrail(scene: Scene): Trail {
  const id = positionKey(scene);
  return {
    root: id,
    at: id,
    nodes: new Map([[id, { id, scene, depth: 0, visits: 1, out: [] }]]),
  };
}

/**
 * Đi một bước: ghi cạnh từ chỗ đang đứng tới thế mới, rồi đứng ở thế mới.
 *
 * Gọi **sau** khi lệnh đã áp thành công. Lệnh bị từ chối không để lại vết — nó
 * không đưa người học đi đâu cả.
 */
export function stepTrail(trail: Trail, scene: Scene, label: string): Trail {
  const to = positionKey(scene);
  const from = trail.nodes.get(trail.at);
  if (!from) return trail;

  // Lệnh không đổi gì (đặt lại đúng thứ đang có): không có cạnh nào để ghi, và
  // một cạnh tự trỏ vào mình sẽ vẽ ra một vòng tròn không nói gì.
  if (to === trail.at) return trail;

  const nodes = new Map(trail.nodes);
  const seen = nodes.get(to);

  if (!seen && nodes.size >= TRAIL_LIMIT) {
    // Trần chạm: vẫn **đi**, chỉ không ghi thêm. Bản đồ đứng lại ở chỗ nó còn
    // đúng, và người học vẫn nghịch tiếp bình thường.
    return { ...trail, at: to };
  }

  nodes.set(to, {
    id: to,
    scene,
    // Sâu bao nhiêu tính theo đường **ngắn nhất đã biết**: quay lại một thế cũ
    // bằng một lối dài hơn không đẩy nó xuống dưới.
    depth: seen ? Math.min(seen.depth, from.depth + 1) : from.depth + 1,
    visits: (seen?.visits ?? 0) + 1,
    out: seen?.out ?? [],
    // Giữ `scene` **cũ** khi đã có: hai lối tới cùng vị trí cho hai object khác
    // nhau nhưng cùng nội dung, và đổi tham chiếu thì Player render lại một hình
    // y hệt.
    ...(seen ? { scene: seen.scene } : {}),
  });

  if (!from.out.some((e) => e.to === to && e.label === label)) {
    nodes.set(from.id, { ...from, out: [...from.out, { label, to }] });
  }

  return { ...trail, at: to, nodes };
}

/**
 * Đứng sang một nút **đã có** — undo, redo, hoặc chạm vào một chấm trên bản đồ.
 *
 * Không ghi cạnh và không tăng `visits`: lùi lại không phải một nước đi, và đếm
 * nó vào sẽ làm "đã tới đây mấy lần" nói dối ngay ở lần undo đầu tiên.
 */
export function moveTrail(trail: Trail, id: string): Trail {
  return trail.nodes.has(id) ? { ...trail, at: id } : trail;
}

/** Bản đồ đã đầy chưa — UI nói ra thay vì im lặng ngừng ghi. */
export const trailFull = (trail: Trail): boolean => trail.nodes.size >= TRAIL_LIMIT;

/**
 * Xếp nút thành hàng theo độ sâu, mỗi hàng sắp theo **thứ tự đặt chân**.
 *
 * Bố cục ở đây chứ không ở component: nó là một phép biến đổi thuần trên dữ
 * liệu, test được mà không cần dựng DOM, và cùng bài học đã trả tiền ở
 * `layout.ts` của engine đại số.
 */
export function trailRows(trail: Trail): readonly (readonly TrailNode[])[] {
  const order = [...trail.nodes.keys()];
  const rows: TrailNode[][] = [];
  for (const id of order) {
    const node = trail.nodes.get(id) as TrailNode;
    (rows[node.depth] ??= []).push(node);
  }
  return rows.map((row) => row ?? []);
}

/* ---------- chuẩn tắc hoá và băm ---------- */

/**
 * Chép lại `canonicalStringify`/`hashString` của `@combviz/render` thay vì import.
 *
 * `@combviz/editor` không phụ thuộc `@combviz/render` và **không nên**: tầng lệnh
 * chạy được ở nơi không có renderer nào (CLI, test, log thao tác của Studio), và
 * kéo cả tầng vẽ vào chỉ để lấy một hàm băm là đổi một dòng chép tay lấy một cạnh
 * phụ thuộc đi sai chiều. Đánh đổi ghi ra để không ai tưởng là sót.
 */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
}

function hash(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i += 1) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c + i;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  const hex = (n: number): string => (n >>> 0).toString(16).padStart(8, '0');
  return hex(h1) + hex(h2);
}
