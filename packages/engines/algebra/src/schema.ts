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
 * ### `maxWidthCells: 13` — và vì sao đúng $13$
 *
 * Con số cũ là $12$, và nó **không phải một số đo** — nó là một số chọn ở M49. Hậu quả
 * đo được ở M55: $(a+b+c)^3$ khai triển rộng $12{,}55$ ô nên **bị từ chối**, trong khi
 * $(a+b)^7$ rộng $11{,}75$ ô thì lọt. Tức là một hằng đẳng thức sách giáo khoa bị chặn
 * còn một thứ hiếm hơn nhiều thì qua — thứ tự ưu tiên ngược với thực tế dạy học.
 *
 * Bề ngang phải có trần **riêng** vì Player **co** cả hình cho vừa pane và không bao
 * giờ giãn (`render/scale.ts`): một dòng quá rộng không tràn ra ngoài, nó làm *mọi thứ*
 * nhỏ lại — kể cả các step khác của cùng bài, vì hệ số co dùng chung. Nên sàn cỡ chữ ở
 * đơn vị scene (`SIZE_FLOOR`) không cứu được: nó canh đơn vị scene, còn cái đau là số
 * pixel cuối cùng.
 *
 * Đo cỡ chữ **thật trên màn hình** ($22$px ở tỉ lệ đầy đủ, co theo `pane / (44·W)`):
 *
 * | rộng (ô) | ĐT 360px | ĐT 390px | tablet | desktop |
 * |---:|---:|---:|---:|---:|
 * | 12 | 13,7px | 14,9px | 22px | 22px |
 * | 12,55 | 13,1px | 14,3px | 22px | 22px |
 * | **13** | **12,6px** | 13,8px | 22px | 22px |
 * | 13,62 | 12,0px | 13,1px | 22px | 22px |
 * | 14 | 11,7px | 12,8px | 22px | 22px |
 *
 * $13$ là bề rộng **cuối cùng** còn giữ chữ trên $12$px ở màn hẹp nhất, và ngay dưới nó
 * mọi thứ tuột xuống dưới ngưỡng ấy. Nó cho qua $(a+b+c)^3$ ($12{,}55$) và $a^9-b^9$ đã
 * phân tích ($12{,}32$), vẫn chặn $(a+b)^8$ ($13{,}62$).
 *
 * Cả kho hiện đo tối đa $7{,}06$ ô, trung vị $2{,}30$ ô — nên trần này **không** chạm
 * vào nội dung thật; nó là hàng rào cho thứ luật có thể sinh ra.
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
  maxWidthCells: 13,
  /** Số phương trình tối đa trong một hệ (M59) — bốn dòng đã kín chiều cao dòng. */
  maxRelations: 4,
} as const;

export const AlgebraStep = Type.Object(
  {
    /** Tên luật, phải có trong `RULES` (`rules.ts`). */
    rule: Type.String({ minLength: 1, maxLength: 24 }),
    /**
     * Cây con để áp luật, khai theo **một trong hai** lối:
     *
     * - **vị trí** — `""` là gốc, `"L"`/`"R"` là hai vế, rồi chỉ số con: `"L.0.1"`;
     * - **nội dung** — `"@abs(x - 2)"`: cây con nào khớp mẫu ấy. Từ chối khi không có
     *   hoặc có nhiều hơn một chỗ khớp.
     *
     * Lối thứ hai có vì đường dẫn theo vị trí **dịch chỗ** khi một luật trả về `add`
     * vào trong một `add` (xem `resolveAt` ở `model.ts`). Trần dài hơn `arg` vì một
     * mẫu là cả một biểu thức.
     */
    at: Type.String({ maxLength: 64 }),
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
    /**
     * Vẽ **trục số** dưới những dòng là một tập nghiệm đọc ra được (AL-15).
     *
     * Mặc định **tắt**, và đó là một quyết định chứ không phải một sự dè dặt: trục số
     * chỉ có nghĩa ở bài bất phương trình, và bật sẵn cho cả kho là thêm một dải trắng
     * dưới mỗi dòng của 80 bài không cần nó. Tắt sẵn cũng có nghĩa **không golden nào
     * đổi** khi mục này ra đời.
     *
     * Dòng nào không ở dạng chuẩn (một vế là biến trần, vế kia là hằng) thì **không vẽ
     * gì**, im lặng — xem `solutionset.ts`.
     */
    show_sets: Type.Optional(Type.Boolean({ default: false })),
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
