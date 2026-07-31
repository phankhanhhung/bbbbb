import { Type, type Static } from '@sinclair/typebox';

/**
 * Bound của Long division engine (NFR-P4).
 *
 * `maxDegree` đặt theo cái **nhìn được**, không theo cái tính được: bậc $8$ đã là
 * chín cột hạng tử trên một dòng, và trên iPad thì chữ bắt đầu co lại tới mức
 * không đọc nổi. Bài dùng bậc lớn hơn thì minh hoạ ở bậc nhỏ rồi lập luận tổng
 * quát bằng chữ — cách người ta vẽ trên bảng, và cũng là cách trung thực duy
 * nhất (`VIZ-COVERAGE.md` §6).
 */
export const LONGDIV_LIMITS = {
  maxDegree: 8,
  maxAbsCoefficient: 999,
} as const;

const Coefficient = Type.Integer({
  minimum: -LONGDIV_LIMITS.maxAbsCoefficient,
  maximum: LONGDIV_LIMITS.maxAbsCoefficient,
});

/**
 * Cấu hình một phép chia dọc.
 *
 * **Tác giả khai hai đa thức, engine dựng cả bảng.** Đây là quyết định trung tâm
 * và nó khác hẳn cách một bàn cờ được khai: ở board, tác giả đặt từng quân vào
 * từng ô, còn ở đây tác giả *không được phép* gõ tay các dòng trung gian. Lý do
 * không phải tiện tay — mà là **hình không thể nói dối**: mọi hạng tử trong bảng
 * là kết quả của chính thuật toán, nên không có khe nào cho một dòng gõ nhầm mà
 * validate vẫn xanh. Cùng loại quyết định với `coloring_preset` của board và với
 * bảng Grundy của game engine: thứ suy ra được thì đừng bắt người ta gõ.
 *
 * Hệ số theo **bậc giảm dần**, kể cả hệ số $0$: `[1, 0, 0, -1]` là $x^3 - 1$. Bắt
 * viết đủ vị trí là có chủ ý — nó chính là điều người học hay quên nhất khi chia
 * tay, và khai thiếu thì đa thức mang nghĩa khác chứ không phải "viết tắt".
 */
export const LongDivConfig = Type.Object(
  {
    /** Số bị chia $A$, hệ số bậc giảm dần. */
    dividend: Type.Array(Coefficient, {
      minItems: 1,
      maxItems: LONGDIV_LIMITS.maxDegree + 1,
    }),
    /** Số chia $B$, hệ số bậc giảm dần. Hệ số dẫn đầu phải khác $0$. */
    divisor: Type.Array(Coefficient, {
      minItems: 1,
      maxItems: LONGDIV_LIMITS.maxDegree + 1,
    }),
    /** Tên biến. Một ký tự, vì hạng tử chỉ có dạng $c\,x^k$. */
    variable: Type.Optional(Type.String({ minLength: 1, maxLength: 1, default: 'x' })),
    /**
     * Mũi tên "hạ hạng tử tiếp theo xuống".
     *
     * Bật mặc định vì nó là **thao tác** duy nhất của thuật toán không đọc được
     * từ vị trí các con số: hai dòng hiệu liền nhau khác nhau ở chỗ dòng sau có
     * thêm một hạng tử, mà thêm từ đâu thì chỉ mũi tên nói ra.
     */
    show_arrows: Type.Optional(Type.Boolean({ default: true })),
    caption: Type.Optional(Type.String({ maxLength: 48 })),
  },
  { additionalProperties: false },
);
export type LongDivConfig = Static<typeof LongDivConfig>;

/**
 * Engine này **không có loại element nào**, và đó là lời khai chứ không phải chỗ
 * bỏ trống.
 *
 * Mọi thứ vẽ ra đều suy từ `config`, nên `elements[]` của scene luôn rỗng và mọi
 * danh tính neo được đều là **ngầm định** — xem `implicitElementIds`. Cho tác giả
 * thêm element vào đây sẽ mở lại đúng cái khe mà quyết định trên vừa đóng.
 */
export const LONGDIV_ELEMENT_SCHEMAS: Readonly<Record<string, never>> = {};
