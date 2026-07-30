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
    /**
     * GR-07 — vẽ **cùng một đồ thị** dưới dạng ma trận kề thay vì đỉnh–cạnh.
     *
     * Không phải hai engine, cũng không phải hai scene: cùng dữ liệu, cùng id.
     * Ô $(u,v)$ mang **đúng id của cạnh** nối chúng, nên anchor trỏ vào một cạnh
     * làm sáng cả đoạn thẳng lẫn ô ma trận mà không cần khai gì thêm — đó là
     * "đồng bộ hai chiều" của GR-07, ở dạng rẻ nhất và khó sai nhất.
     *
     * Giá trị sư phạm nằm ở chỗ nó là cầu sang đếm hai chiều: tổng theo hàng là
     * bậc đỉnh, tổng cả bảng là hai lần số cạnh, và bổ đề bắt tay hiện ra thành
     * một bảng đối xứng chứ không phải một công thức.
     */
    view: Type.Optional(
      Type.Union([Type.Literal('node-link'), Type.Literal('matrix')], {
        default: 'node-link',
      }),
    ),
    /** Với `view: "matrix"`: hiện tổng hàng (bậc đỉnh) và tổng cả bảng. */
    show_sums: Type.Optional(Type.Boolean({ default: false })),
    /**
     * GR-09 — vẽ **mã Prüfer** của cây thành một hàng ô dưới hình.
     *
     * Đây là nửa còn lại của một song ánh: bên trên là cây, bên dưới là dãy, và
     * cả hai cùng nằm trong một khung. Mỗi ô mang màu của đỉnh nó trỏ tới, nên
     * "đỉnh $5$ xuất hiện hai lần" đọc được bằng mắt — mà đó chính là bổ đề bậc
     * $=$ số lần $+\,1$. Ô thứ $i$ có id `prufer-<i>` nên neo được vào narrative.
     *
     * Đồ thị không phải cây thì hàng ô ấy **không** vẽ; hình nói ra lý do.
     */
    show_prufer: Type.Optional(Type.Boolean({ default: false })),
    /**
     * GR-10 — vẽ **đường kính** của cây thành một dải chạy dưới các cạnh, và
     * khoanh đỉnh **tâm** nằm trên dải ấy.
     *
     * Mệnh đề "tâm nằm giữa đường kính" là một dòng chữ trong sách và một hình vẽ
     * ở đây; hình thì kiểm được bằng mắt. Trọng tâm cố ý **không** vẽ lên dải: nó
     * thường không nằm trên đường kính, và vẽ nó ở đó sẽ gợi ý một quan hệ không
     * có. Đồ thị không phải cây thì không vẽ gì.
     */
    show_diameter: Type.Optional(Type.Boolean({ default: false })),
    /**
     * GR-05 — tô **mặt** của hình phẳng.
     *
     * Nửa còn lại của GR-05: đã có chứng chỉ phẳng (hình không giao điểm) và chặn
     * Euler; thiếu là bản thân các mặt. Bật cờ này thì mỗi mặt trong được tô nền,
     * và bài tô bản đồ — bao gồm định lý bốn màu — thành một thứ nghịch được thay
     * vì một câu phải tin.
     *
     * Hình còn cạnh cắt nhau thì **không** tô gì: khi ấy "mặt" chưa có nghĩa.
     */
    show_faces: Type.Optional(Type.Boolean({ default: false })),
    /**
     * Màu của từng mặt, tra theo id `face-0`, `face-1`, … (GR-05).
     *
     * Mặt **không** nằm trong file như đỉnh và cạnh — nó là thứ suy ra từ hình,
     * nên nó không mang được `color_class` của riêng mình. Bảng thưa này là chỗ
     * gắn màu vào, cùng khuôn với `cell_overrides` của board.
     *
     * Mặt ngoài mang id `face-outer` và tô được như mọi mặt khác: trong bài tô bản
     * đồ thì "biển" cũng là một vùng phải tô.
     */
    face_colors: Type.Optional(
      Type.Record(Type.String({ pattern: '^face-(\\d+|outer)$' }), Type.Integer({
        minimum: 1,
        maximum: MAX_COLOR_CLASS,
      })),
    ),
  },
  { additionalProperties: false },
);
export type GraphConfig = Static<typeof GraphConfig>;

export const GraphElement = Type.Union([VertexElement, EdgeElement]);

export const COLOR_CLASS_MAX = MAX_COLOR_CLASS;
