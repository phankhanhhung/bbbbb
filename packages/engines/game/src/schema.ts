import { Type, type Static } from '@sinclair/typebox';
import { defineElement } from '@combviz/schema';

/**
 * Bound của Game engine (NFR-P4, GM-03).
 *
 * `maxStates` là con số quan trọng nhất: solver duyệt lùi toàn bộ không gian
 * trạng thái, nên nó phải **từ chối** trước khi treo máy. SRS cho phép tới $10^6$
 * ở GM-03; ta chặn thấp hơn nhiều vì bài minh hoạ không cần lớn, còn một bài lỡ
 * khai to sẽ làm đơ trình duyệt của người học chứ không phải của tác giả.
 */
export const GAME_LIMITS = {
  maxPiles: 8,
  maxPerPile: 200,
  maxStates: 200_000,
  /** View `spectrum` vẽ tối đa ngần này ô. */
  maxSpectrum: 60,
} as const;

/**
 * Luật đi — tập **đóng**, có tham số.
 *
 * Đây là quyết định trung tâm của engine này, và nó **cố ý đi ngược GM-01**.
 *
 * SRS đòi "định nghĩa game bằng rule script sandboxed", tức mở DSL-03: một ngôn
 * ngữ *có trạng thái*, chạy trong Web Worker với budget riêng (NFR-S2). Ba lý do
 * để không làm thế ở đây:
 *
 *   - R-2 trong sổ rủi ro là "DSL phình thành ngôn ngữ lập trình", và đối sách
 *     ghi rõ là **grammar đóng**. Mở một ngôn ngữ có trạng thái là đi thẳng vào
 *     rủi ro đó.
 *   - Engine dãy đã có tiền lệ: `COMBINE_RULES` là enum đóng, kèm ghi chú rằng
 *     cho nhập biểu thức là "mở cửa hậu cho DSL-03".
 *   - Ba luật dưới đây phủ gần hết game tổ hợp thi đấu: bốc theo khoảng, bốc
 *     theo tập cho trước, và chia đống. Nim, bài bốc sỏi, trò Grundy đều nằm
 *     trong đó.
 *
 * Cái giá phải trả, nói thẳng: game có luật riêng — cờ trên đồ thị, trò chơi tô
 * màu, Chomp — **không** khai được ở đây. Đó là GM-01 thật sự, và nó vẫn còn nợ.
 */
export const GameRule = Type.Union([
  Type.Object(
    {
      type: Type.Literal('subtract'),
      /** Bốc từ **một** đống, số lượng trong khoảng này. */
      min: Type.Integer({ minimum: 1, default: 1 }),
      /** Vắng nghĩa là không giới hạn — đó chính là Nim. */
      max: Type.Optional(Type.Integer({ minimum: 1 })),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      type: Type.Literal('subtract-set'),
      /** Chỉ được bốc đúng những số này. */
      allowed: Type.Array(Type.Integer({ minimum: 1 }), { minItems: 1, maxItems: 12 }),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      /** Chia một đống thành hai phần **khác nhau**, cùng khác rỗng (trò Grundy). */
      type: Type.Literal('split-unequal'),
    },
    { additionalProperties: false },
  ),
]);
export type GameRule = Static<typeof GameRule>;

export const GameConfig = Type.Object(
  {
    rule: GameRule,
    /**
     * Ai lấy nước cuối cùng thì **thua**.
     *
     * Không phải một biến thể vụn vặt: "người lấy viên cuối cùng thua" là cách
     * phát biểu rất hay gặp, và lời giải của nó khác hẳn — lý thuyết Grundy
     * (XOR) **không** áp dụng cho misère, nên solver phải đi đường khác.
     */
    misere: Type.Optional(Type.Boolean({ default: false })),
    view: Type.Optional(
      Type.Union([Type.Literal('piles'), Type.Literal('spectrum')], { default: 'piles' }),
    ),
    /** Với `spectrum`: vẽ các thế một đống từ $0$ tới số này. */
    spectrum_to: Type.Optional(
      Type.Integer({ minimum: 1, maximum: GAME_LIMITS.maxSpectrum }),
    ),
    /** Hiện giá trị Grundy dưới mỗi đống. Vô nghĩa ở chế độ misère. */
    show_grundy: Type.Optional(Type.Boolean({ default: false })),
    caption: Type.Optional(Type.String({ maxLength: 48 })),
  },
  { additionalProperties: false },
);
export type GameConfig = Static<typeof GameConfig>;

/** Một đống. Thứ tự đống không mang nghĩa — game này là trò trên đa tập. */
export const PileElement = defineElement('pile', {
  count: Type.Integer({ minimum: 0, maximum: GAME_LIMITS.maxPerPile }),
  label: Type.Optional(Type.String({ maxLength: 12 })),
});

export const GameElement = Type.Union([PileElement]);
