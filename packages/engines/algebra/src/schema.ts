import { Type, type Static } from '@sinclair/typebox';

/**
 * Bound (NFR-P4).
 *
 * **Trần đọc được đo bằng kích thước vẽ ra, không bằng độ sâu cây.** Bản đầu khai
 * `maxDepth: 6` với chú thích nói rằng nó đứng thay cho chiều cao dòng và cỡ chữ. Nó
 * không đứng thay được, và số đo nói rõ:
 *
 * | | `depth` | cao/ô | chữ nhỏ nhất |
 * |---|---:|---:|---:|
 * | phân thức lồng 3 tầng | 6 | 1,69 | 2,76 |
 * | kết quả nhân liên hợp (mẫu có căn lồng) | 9 | **1,66** | **4,10** |
 *
 * Cái thứ hai **thấp hơn** và **chữ to hơn**, mà bị từ chối. Vì `add` tốn một tầng và
 * tốn $0$ chiều cao, còn căn lồng thì gần như miễn phí cả hai chiều — nên đếm tầng là
 * đếm nhầm vật. Nay đo thẳng thứ cần đo: `maxHeightCells` và `maxWidthCells`, tính
 * bằng ô theo quy ước G-10.
 *
 * `maxDepth` vẫn còn nhưng đổi vai: **chỉ** chặn đệ quy bệnh lý trong `measure`/`place`,
 * nên đặt cao hẳn cho khỏi lẫn với trần đọc được.
 *
 * Không có trần cỡ chữ: `typeset.ts` có sàn `SIZE_FLOOR`, nên cỡ chữ nhỏ nhất là một
 * hằng số — kiểm nó thành kiểm một tautology.
 *
 * ### Hai con số lấy từ đâu
 *
 * Liên phân số lồng $n$ tầng, đo sau khi cài sàn cỡ chữ:
 *
 * | tầng | 3 | 4 | 5 | 6 | 7 |
 * |---|---:|---:|---:|---:|---:|
 * | cao (ô) | 1,74 | 2,14 | 2,53 | 2,93 | 3,33 |
 * | chữ nhỏ nhất | 3,00 | 3,00 | 3,00 | 3,00 | 3,00 |
 *
 * `maxHeightCells: 3` cho qua tới **tầng 6** — trần cũ dừng ở tầng 3, nên đây là nâng
 * ba bậc. Căn lồng thì tầng 6 mới cao $1{,}50$ ô, tức là không bị trần này chạm tới:
 * đúng như nó phải thế, vì căn lồng đọc được thật.
 *
 * `maxWidthCells: 12` so với thứ rộng nhất viết ra được trong thực tế: khai triển
 * $(a+b)^6$ đo $7{,}78$ ô, cả kho 91 bài đo $7{,}06$ ô. Bề ngang phải có trần **riêng**
 * vì Player co cả hình cho vừa khung — một dòng quá rộng không tràn ra ngoài mà làm
 * *mọi thứ* nhỏ lại, nên sàn cỡ chữ ở đơn vị scene không cứu được.
 *
 * `maxDegree` là cận cho Schwartz–Zippel ở `check.ts`: xác suất phép kiểm bỏ sót một
 * bước sai là $\le d/p$ mỗi lần thử.
 */
export const ALGEBRA_LIMITS = {
  maxNodes: 120,
  maxDepth: 24,
  maxSteps: 12,
  maxVars: 6,
  maxDegree: 64,
  maxSourceLength: 200,
  maxHeightCells: 3,
  maxWidthCells: 12,
} as const;

export const AlgebraStep = Type.Object(
  {
    /** Tên luật, phải có trong `RULES` (`rules.ts`). */
    rule: Type.String({ minLength: 1, maxLength: 24 }),
    /** Đường dẫn tới cây con: `""` là gốc, `"L"`/`"R"` là hai vế, rồi chỉ số con. */
    at: Type.String({ maxLength: 40 }),
    arg: Type.Optional(Type.String({ maxLength: 40 })),
    /** Ghi chú đè lên nhãn luật. **Chữ trơn** — nó vào giao diện nguyên văn. */
    note: Type.Optional(Type.String({ maxLength: 32 })),
  },
  { additionalProperties: false },
);
export type AlgebraStep = Static<typeof AlgebraStep>;

export const AlgebraConfig = Type.Object(
  {
    /**
     * Biểu thức gốc, viết bằng cú pháp mặt: `"(x + 1)^2 = x^2 + 1"`.
     *
     * **Không có nhân ngầm** — `2x` là lỗi, phải viết `2*x`. Nhân ngầm kéo theo `xy`
     * là một biến hay hai biến nhân nhau, tức mơ hồ ngay ở ký tự thứ hai.
     */
    start: Type.String({ minLength: 1, maxLength: ALGEBRA_LIMITS.maxSourceLength }),
    steps: Type.Optional(Type.Array(AlgebraStep, { maxItems: ALGEBRA_LIMITS.maxSteps })),
    /** Hiện cột tên luật bên phải mỗi dòng. */
    show_rules: Type.Optional(Type.Boolean({ default: true })),
    caption: Type.Optional(Type.String({ maxLength: 48 })),
  },
  { additionalProperties: false },
);
export type AlgebraConfig = Static<typeof AlgebraConfig>;

/**
 * Engine **không có loại element nào** — như `longdiv`.
 *
 * Cả bảng suy từ `config`; khai element bằng tay là mở đúng cái khe mà engine này
 * sinh ra để bịt.
 */
export const ALGEBRA_ELEMENT_SCHEMAS: Readonly<Record<string, never>> = {};
