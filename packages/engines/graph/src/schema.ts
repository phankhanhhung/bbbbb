import { Type, type Static } from '@sinclair/typebox';
import { defineElement, EntityId, MAX_COLOR_CLASS } from '@combviz/schema';

/**
 * Bound của Graph engine (NFR-P4).
 *
 * `maxHamiltonVertices` không phải giới hạn nội dung mà là giới hạn **thuật
 * toán**: backtracking Hamilton là bài toán NP, 20 đỉnh đã là ranh giới giữa
 * "vài trăm ms" và "treo máy". Vượt ngưỡng thì GR-04 từ chối kèm thông báo rõ,
 * không phải chạy rồi hy vọng.
 */
export const GRAPH_LIMITS = {
  maxVertices: 300,
  maxEdges: 1000,
  maxHamiltonVertices: 20,
  maxPlanarityVertices: 100,
} as const;

/**
 * Toạ độ đỉnh là **nội dung sư phạm**, không phải trang trí (GR-02).
 *
 * Vị trí đỉnh mang nghĩa: hai hàng thì thấy ngay đồ thị hai phía, vòng tròn thì
 * thấy tính đối xứng. Vì vậy toạ độ nằm trong file và Player **không** chạy
 * physics — layout tự động chỉ là công cụ nháp trong Studio, kết quả bake thành
 * số tĩnh.
 *
 * Đơn vị: khoảng cách đỉnh chuẩn = 10 đơn vị scene (quy ước ở `StrokeTokens`).
 */
export const VertexElement = defineElement('vertex', {
  pos: Type.Tuple([Type.Number(), Type.Number()]),
  label: Type.Optional(Type.String({ maxLength: 24 })),
  shape: Type.Optional(
    Type.Union([Type.Literal('circle'), Type.Literal('square'), Type.Literal('diamond')]),
  ),
});

export const EdgeElement = defineElement('edge', {
  u: EntityId,
  v: EntityId,
  directed: Type.Optional(Type.Boolean({ default: false })),
  /**
   * Thứ tự trong bó cạnh song song. Cạnh thứ k giữa cùng một cặp đỉnh được vẽ
   * cong ra xa dần — cần cho các bài đếm dùng multigraph, và cần cả cho khuyên
   * (`u == v`).
   */
  multi_index: Type.Optional(Type.Integer({ minimum: 0, maximum: 8, default: 0 })),
  weight: Type.Optional(Type.Number()),
  label: Type.Optional(Type.String({ maxLength: 16 })),
  style: Type.Optional(
    Type.Union([Type.Literal('solid'), Type.Literal('dashed'), Type.Literal('dotted')]),
  ),
});

export const GraphConfig = Type.Object(
  {
    /** Nhãn đỉnh hiện mặc định hay không. */
    show_labels: Type.Optional(Type.Boolean({ default: true })),
    /** GR-03: hiện badge bậc đỉnh. */
    show_degrees: Type.Optional(Type.Boolean({ default: false })),
    /** Khung nhìn suy ra từ toạ độ đỉnh; lề quanh chúng. */
    padding: Type.Optional(Type.Number({ minimum: 0, default: 6 })),
  },
  { additionalProperties: false },
);
export type GraphConfig = Static<typeof GraphConfig>;

export const GraphElement = Type.Union([VertexElement, EdgeElement]);

export const COLOR_CLASS_MAX = MAX_COLOR_CLASS;
