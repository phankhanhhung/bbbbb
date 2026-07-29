import { Type, type Static } from '@sinclair/typebox';
import { defineElement, EntityId } from '@combviz/schema';

/**
 * Bound của Set engine (NFR-P4).
 *
 * `maxVennSets = 3` không phải giới hạn kỹ thuật mà là **sự thật hình học**: bốn
 * tập không vẽ được bằng bốn hình tròn sao cho đủ 15 vùng giao. Vượt ba tập thì
 * bảng incidence là cách trình bày duy nhất còn đọc được — và engine nói thẳng
 * điều đó thay vì vẽ ra một hình sai.
 */
export const SET_LIMITS = {
  maxTokens: 60,
  maxSets: 8,
  maxVennSets: 3,
} as const;

/**
 * Hai view của cùng một dữ liệu (ST-01).
 *
 * SRS nói rõ view nào là chủ lực: *"trong lời giải thi đấu thật, bảng thuộc/không
 * thuộc và đếm hai chiều xuất hiện nhiều hơn hẳn sơ đồ Venn; Venn giữ vai trò
 * minh họa nhập môn."* Vì vậy `matrix` là mặc định, không phải `venn`.
 */
export const SetConfig = Type.Object(
  {
    view: Type.Union([Type.Literal('matrix'), Type.Literal('venn')], {
      default: 'matrix',
    }),
    /** Hiện tổng hàng/cột ở view `matrix` — đếm hai chiều (PRN-03). */
    show_sums: Type.Optional(Type.Boolean({ default: false })),
    caption: Type.Optional(Type.String({ maxLength: 48 })),
  },
  { additionalProperties: false },
);
export type SetConfig = Static<typeof SetConfig>;

/**
 * Một phần tử của tập nền, kèm **danh sách tập chứa nó**.
 *
 * Quan hệ thuộc nằm ở phía phần tử chứ không ở phía tập. Lý do là ràng buộc của
 * schema: một mảng id trong `token` thì `implicitElementIds` và ANC-02 kiểm được
 * bằng cùng bộ máy đang có, còn nếu để `set.members[]` thì cùng một quan hệ được
 * khai hai nơi và sẽ có ngày lệch nhau.
 */
export const TokenElement = defineElement('token', {
  label: Type.Optional(Type.String({ maxLength: 12 })),
  /** Id của các `set` chứa phần tử này. */
  sets: Type.Array(EntityId, { maxItems: SET_LIMITS.maxSets }),
});

export const SetElement = defineElement('set', {
  label: Type.Optional(Type.String({ maxLength: 12 })),
  /** Thứ tự cột ở view `matrix`, thứ tự vòng tròn ở view `venn`. */
  order: Type.Integer({ minimum: 0, maximum: SET_LIMITS.maxSets - 1 }),
});

export const SetSceneElement = Type.Union([TokenElement, SetElement]);
