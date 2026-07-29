import { Type, type Static } from '@sinclair/typebox';
import { defineElement } from '@combviz/schema';

/**
 * Bound của Sequence engine (NFR-P4).
 *
 * `maxItems` đặt theo cái nhìn được, không theo cái tính được: một dãy 200 số
 * hiện trên iPad là một hàng chữ li ti không ai đọc nổi. Bài dùng $n$ lớn thì
 * minh hoạ ở $n$ nhỏ rồi lập luận tổng quát bằng chữ — đó là cách người ta vẽ
 * trên bảng, và cũng là cách trung thực duy nhất (xem `docs/VIZ-COVERAGE.md` §6).
 */
export const SEQUENCE_LIMITS = {
  maxItems: 60,
  /** Chấm sỏi vẽ rời từng viên tới ngưỡng này; trên đó hiện số. */
  maxDotsPerPile: 20,
  maxAbsValue: 1_000_000,
} as const;

/**
 * Hai chế độ hiển thị, **một** mô hình dữ liệu.
 *
 * Đây là quyết định trung tâm của engine này. Họ bài "dãy số / thao tác lặp"
 * thật ra là hai họ đội lốt nhau:
 *
 *   - **`sequence`** — thứ tự có nghĩa. "Dãy $a_1,\\dots,a_n$", "các số viết trên
 *     bảng theo hàng", hoán vị. Phép đổi chỗ có nghĩa, chỉ số có nghĩa.
 *   - **`piles`** — thứ tự **không** có nghĩa. "Có $n$ đống sỏi", đa tập các số.
 *     Gộp hai đống có nghĩa; hỏi "đống thứ ba" thì vô nghĩa.
 *
 * Chúng khác nhau ở *phép toán hợp lệ*, không khác ở dữ liệu: cả hai đều là một
 * danh sách các số. Tách thành hai engine sẽ nhân đôi renderer, DSL và validator
 * để phục vụ đúng một khác biệt — còn gộp làm một mà không khai mode thì Sandbox
 * không biết nên cho người học đổi chỗ hay gộp đống.
 *
 * Nên: một mô hình, một cờ, và cờ đó quyết định **cả hình vẽ lẫn tập lệnh**.
 */
export const SequenceConfig = Type.Object(
  {
    mode: Type.Union([Type.Literal('sequence'), Type.Literal('piles')], {
      default: 'sequence',
    }),
    /** Hiện chỉ số $1..n$ dưới từng ô. Vô nghĩa ở chế độ `piles`. */
    show_index: Type.Optional(Type.Boolean({ default: false })),
    /** Hiện tổng ở cuối hàng — đại lượng bất biến hay gặp nhất của họ bài này. */
    show_total: Type.Optional(Type.Boolean({ default: false })),
    /** Nhãn đặt trước hàng, ví dụ "Bảng:" hay "Đống sỏi:". */
    caption: Type.Optional(Type.String({ maxLength: 48 })),
  },
  { additionalProperties: false },
);
export type SequenceConfig = Static<typeof SequenceConfig>;

/**
 * Một số trong dãy, hoặc một đống sỏi.
 *
 * `pos` là **vị trí trong hàng**, và ở chế độ `sequence` nó cũng là chỉ số toán
 * học của phần tử. Không suy `pos` từ thứ tự trong mảng `elements[]`: thứ tự
 * mảng là chuyện của file (DAT-03 muốn diff git đọc được), còn vị trí là chuyện
 * của bài toán. Một phép đổi chỗ phải hiện ra trong diff dưới dạng hai `pos` đổi
 * cho nhau, không phải hai dòng bị hoán vị.
 */
export const ItemElement = defineElement('item', {
  value: Type.Number({
    minimum: -SEQUENCE_LIMITS.maxAbsValue,
    maximum: SEQUENCE_LIMITS.maxAbsValue,
  }),
  pos: Type.Integer({ minimum: 0, maximum: SEQUENCE_LIMITS.maxItems - 1 }),
  /** Nhãn thay cho số, khi phần tử không phải một số ("$a$", "đỏ"). */
  label: Type.Optional(Type.String({ maxLength: 12 })),
});

/**
 * Vạch ngăn giữa hai vị trí — "cắt dãy ở đây".
 *
 * Rẻ và dùng nhiều hơn tưởng: chia dãy thành khối là bước mở đầu của rất nhiều
 * lời giải (chia để trị, phân hoạch, Dirichlet trên các đoạn).
 */
export const CutElement = defineElement('cut', {
  /** Vạch nằm **trước** vị trí này. */
  before: Type.Integer({ minimum: 0, maximum: SEQUENCE_LIMITS.maxItems }),
  label: Type.Optional(Type.String({ maxLength: 16 })),
});

export const SequenceElement = Type.Union([ItemElement, CutElement]);
