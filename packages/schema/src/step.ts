import { Type, type Static } from '@sinclair/typebox';
import { ANCHOR_KEY_PATTERN, EntityId, LangString } from './common.js';
import { Scene } from './scene.js';

/**
 * Quan hệ giữa step và cha của nó (§4.3).
 *
 * - `seq`           — bước kế tiếp tuyến tính.
 * - `case`          — rẽ nhánh xét trường hợp; nhiều con cùng cha, mỗi con có `case_label`.
 * - `contradiction` — nhánh kết thúc bằng mâu thuẫn; là leaf, đánh dấu ✗.
 * - `merge_ref`     — leaf trỏ về step "tổng hợp" chung; xem `merge_target`.
 */
export const EdgeType = Type.Union([
  Type.Literal('seq'),
  Type.Literal('case'),
  Type.Literal('contradiction'),
  Type.Literal('merge_ref'),
]);
export type EdgeType = Static<typeof EdgeType>;

/**
 * Anchor: liên kết hai chiều giữa span văn bản và tập Element (§4.5).
 *
 * P1 chỉ có dạng danh sách id. ANC-03 (selector query) sẽ thêm một biến thể ở P2;
 * bọc trong object ngay từ bây giờ để lúc đó không phải nâng major schema.
 */
export const Anchor = Type.Object(
  {
    ids: Type.Array(EntityId, { minItems: 1 }),
  },
  { additionalProperties: false },
);
export type Anchor = Static<typeof Anchor>;

/**
 * PRN-04 — view song ánh: hai cấu hình cạnh nhau + ánh xạ id ↔ id.
 *
 * Scene thứ hai nằm **bên trong** object này, không nằm cạnh `scene` như một
 * trường ngang hàng. Một cảnh thứ hai không kèm ánh xạ thì chỉ là hai hình đặt
 * gần nhau, và người đọc không có cách nào biết cái nào ứng với cái nào — đúng
 * thứ mà bài đếm bằng song ánh cần nói. Lồng vào trong thì hai thứ đó không thể
 * lệch nhau: khai cái này là khai cả cái kia.
 *
 * `pairs` cho phép nhiều-về-một: đếm $k$-về-$1$ ("mỗi hình bên phải ứng với đúng
 * $k$ hình bên trái, nên $|A| = k|B|$") là kỹ thuật đếm hai chiều chuẩn mực, và
 * cấm nó đi thì mất hẳn một họ bài. Validate chỉ **cảnh báo** khi ánh xạ không
 * đơn ánh, để tác giả biết mình đang khai một thứ mạnh hơn cái tên gọi.
 */
export const Bijection = Type.Object(
  {
    /** Cấu hình bên phải. Bên trái là `scene` của chính step. */
    scene: Scene,
    /** Mỗi cặp: `[id bên trái, id bên phải]`. */
    pairs: Type.Array(Type.Tuple([EntityId, EntityId]), { minItems: 1, maxItems: 200 }),
    /** Nhãn hai pane, ví dụ "Xâu nhị phân" ↔ "Đường đi lưới". */
    label_left: Type.Optional(LangString),
    label_right: Type.Optional(LangString),
  },
  { additionalProperties: false },
);
export type Bijection = Static<typeof Bijection>;

export const Step = Type.Object(
  {
    id: EntityId,
    parent: Type.Union([EntityId, Type.Null()]),
    edge_type: EdgeType,

    /** Bắt buộc khi `edge_type: "case"` — kiểm ở tầng structure, không ở JSON Schema. */
    case_label: Type.Optional(LangString),

    /**
     * Bắt buộc khi `edge_type: "merge_ref"`: id của step tổng hợp (DAT-10).
     * Giữ cấu trúc là **cây + tham chiếu**, không phải DAG thật.
     */
    merge_target: Type.Optional(EntityId),

    narrative: Type.Optional(LangString),
    anchors: Type.Optional(
      Type.Record(Type.String({ pattern: ANCHOR_KEY_PATTERN }), Anchor),
    ),

    /** Vắng mặt chỉ hợp lệ với `merge_ref` (node con trỏ, không có hình riêng). */
    scene: Type.Optional(Scene),

    /** PRN-04. Cần `scene` — kiểm ở tầng structure, không ở JSON Schema. */
    bijection: Type.Optional(Bijection),

    /** Trạng thái panel nguyên lý gắn với step (invariant strip, partition view...). */
    widget_state: Type.Optional(Type.Record(Type.String(), Type.Unknown())),

    /** NFR-A3. Vắng mặt thì Player sinh fallback tóm tắt đếm element theo loại. */
    alt_text: Type.Optional(LangString),

    /** Không hiển thị cho người học; phục vụ chính chủ và pipeline. */
    author_notes: Type.Optional(Type.String()),

    /**
     * Ràng buộc mà step này **cố ý** vi phạm.
     *
     * Lời giải thường phải bày ra đúng thứ mà sandbox cấm: bài $R(3,3)=6$ kết
     * luận bằng một tam giác đơn sắc, trong khi sandbox lấy "không có tam giác
     * đơn sắc" làm luật chơi. Không có trường này thì tác giả phải sống chung với
     * cảnh báo vĩnh viễn, và cảnh báo mà ai cũng bỏ qua thì không còn là cảnh báo.
     *
     * Khai ở đây biến chủ đích thành thứ đọc được. Đổi lại, validate sẽ báo khi
     * khai **thừa** — step không còn vi phạm nữa mà khai báo vẫn nằm đó là dấu
     * hiệu scene đã đổi mà lời giải chưa theo kịp.
     */
    expects_violation: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),

    /**
     * Khẳng định về scene mà validate phải kiểm được — biểu thức DSL trả `true`.
     *
     * `{{expr}}` trong narrative lo phần "in ra một con số": chữ và hình thành
     * cùng một giá trị nên không thể lệch. Nhưng lời giải còn khẳng định những
     * thứ **suy ra** từ scene chứ không đọc thẳng ra được — "cần ít nhất $3$
     * bước" là một mệnh đề về $3$ nghịch thế, không phải là chính số đó. Chỗ ấy
     * nội suy không với tới, và đó đúng là chỗ bài `sorting-adjacent-swaps` sai
     * suốt nhiều commit.
     *
     * Khai ở đây thì con số trong đề bài buộc phải khớp scene, và ngày nào ai đó
     * sửa scene mà quên sửa lời giải thì validate đỏ ngay — thay vì để người đọc
     * phát hiện hộ.
     */
    claims: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { maxItems: 8 })),

    /**
     * AUT-09: cổng khoá publish. Draft từ LLM vào kho với `verified: false`;
     * chính chủ phải bật tay từng step trong Studio. Lưu trong file để git diff
     * đọc được ai đã duyệt cái gì ở commit nào.
     */
    verified: Type.Optional(Type.Boolean({ default: false })),
  },
  { additionalProperties: false },
);

export interface Step {
  id: string;
  parent: string | null;
  edge_type: EdgeType;
  case_label?: { vi: string; en?: string };
  merge_target?: string;
  narrative?: { vi: string; en?: string };
  anchors?: Record<string, Anchor>;
  scene?: Scene;
  bijection?: {
    scene: Scene;
    pairs: [string, string][];
    label_left?: { vi: string; en?: string };
    label_right?: { vi: string; en?: string };
  };
  widget_state?: Record<string, unknown>;
  alt_text?: { vi: string; en?: string };
  author_notes?: string;
  expects_violation?: string[];
  claims?: string[];
  verified?: boolean;
}
