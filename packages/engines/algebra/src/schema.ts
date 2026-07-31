import { Type, type Static } from '@sinclair/typebox';

/**
 * Bound (NFR-P4).
 *
 * `maxDepth` không phải để tiết kiệm bộ nhớ mà vì **printer**: mỗi tầng phân số lồng
 * làm cỡ chữ giảm một nấc và chiều cao dòng tăng, và quá sáu tầng thì không đọc được
 * trên iPad — thiết bị đích của NFR-P1..P3.
 *
 * `maxDegree` là cận cho Schwartz–Zippel ở `check.ts`: xác suất phép kiểm bỏ sót một
 * bước sai là $\le d/p$ mỗi lần thử.
 */
export const ALGEBRA_LIMITS = {
  maxNodes: 120,
  maxDepth: 6,
  maxSteps: 12,
  maxVars: 6,
  maxDegree: 64,
  maxSourceLength: 200,
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
