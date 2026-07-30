import type { TSchema } from '@sinclair/typebox';
import type { Scene } from './scene.js';
import type { ValidationIssue } from './issues.js';
import type { SceneValidator } from './validator.js';
import type { EngineBounds } from './bounds.js';

/**
 * Phần schema mà mỗi engine tự khai.
 *
 * `packages/schema` **không** import engine nào; engine nạp vào validator từ
 * bên ngoài. Đây là điều kiện để:
 *   - Player lazy-load engine theo `engines_used[]` (D-10, NFR-P3),
 *   - CLI nạp engine trong Node mà không kéo theo DOM,
 *   - thêm engine ở P2/P3 không phải sửa core.
 *
 * Đây mới là *một mảnh* của interface Engine đầy đủ (§3 plan) — phần renderer,
 * command, analyzer đến ở M1/M3 và không thuộc tầng schema.
 */
export interface EngineSchemaFragment {
  readonly id: string;
  /** Schema cho `scene.config`. */
  readonly configSchema: TSchema;
  /**
   * Schema từng loại element, **khoá theo trường `type`** — không phải một union.
   *
   * Union thì Ajv validate mọi nhánh rồi đổ ra toàn bộ lỗi của tất cả các nhánh:
   * một tile gõ sai một trường sinh ra 13 dòng lỗi, trong đó 11 dòng nói về
   * `region` và `piece`. Phân biệt trước theo `type` cho đúng một lỗi, đúng chỗ —
   * điều kiện để AUT-04 click-to-jump có nghĩa.
   */
  readonly elementSchemas: Readonly<Record<string, TSchema>>;
  readonly bounds: EngineBounds;
  /**
   * Kiểm bound phụ thuộc nội dung mà JSON Schema không diễn đạt được
   * (số ô = rows × cols, số tile, số cạnh...). NFR-P4.
   */
  checkBounds(scene: Scene, path: string): ValidationIssue[];
  /**
   * Id của các element **ngầm định** do `config` sinh ra chứ không nằm trong
   * `elements[]` — ví dụ ô bàn cờ sinh từ `rows`/`cols`.
   *
   * ANC-02 cần biết tập này, nếu không thì anchor trỏ tới `cell-0-0` sẽ bị báo
   * sai là anchor rot.
   */
  implicitElementIds(scene: Scene): Set<string>;
  /**
   * Nửa còn lại của `implicitElementIds`: id **có khai trong `elements[]`** mà
   * view hiện tại **không vẽ**.
   *
   * Có những element mà một view cố ý bỏ qua, và bỏ qua là đúng: phổ thắng–thua
   * của engine game vẽ **thế cờ**, không vẽ từng đống; view chấm của engine set
   * vẽ một chấm cho mỗi quan hệ thuộc, nên phần tử không thuộc tập nào không có
   * chấm nào. Không phải lỗi renderer — đó là ý nghĩa của view.
   *
   * Nhưng nó **là** lỗi khi một anchor trỏ vào đó, và đó chính là lớp lỗi mà
   * ANC-02 không nhìn thấy: id tồn tại, `validate` xanh, rê chuột không sáng gì.
   * Khai ra ở đây thì tầng structure bắt được, và chốt canh danh tính biết đây là
   * sự thật đã khai chứ không phải nợ.
   *
   * Tuỳ chọn: engine không khai thì mặc định "view nào cũng vẽ mọi element".
   */
  undrawnElementIds?(scene: Scene): Set<string>;
  /**
   * Tra validator built-in theo id (BD-04), kể cả dạng có tham số
   * (`pieces-per-row:2`). Trả `null` khi engine không biết id đó — validate biến
   * điều đó thành lỗi, thay vì để một ràng buộc gõ sai im lặng không chạy.
   */
  resolveValidator(id: string): SceneValidator | null;
  /** Danh sách id hợp lệ, dùng trong thông báo lỗi. */
  readonly validatorIds: readonly string[];
}

export type EngineRegistry = ReadonlyMap<string, EngineSchemaFragment>;

export function createEngineRegistry(
  fragments: readonly EngineSchemaFragment[],
): EngineRegistry {
  const map = new Map<string, EngineSchemaFragment>();
  for (const fragment of fragments) {
    if (map.has(fragment.id)) {
      throw new Error(`Engine "${fragment.id}" bị đăng ký hai lần`);
    }
    map.set(fragment.id, fragment);
  }
  return map;
}
