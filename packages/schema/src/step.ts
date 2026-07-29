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

    /** Trạng thái panel nguyên lý gắn với step (invariant strip, partition view...). */
    widget_state: Type.Optional(Type.Record(Type.String(), Type.Unknown())),

    /** NFR-A3. Vắng mặt thì Player sinh fallback tóm tắt đếm element theo loại. */
    alt_text: Type.Optional(LangString),

    /** Không hiển thị cho người học; phục vụ chính chủ và pipeline. */
    author_notes: Type.Optional(Type.String()),

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
  widget_state?: Record<string, unknown>;
  alt_text?: { vi: string; en?: string };
  author_notes?: string;
  verified?: boolean;
}
