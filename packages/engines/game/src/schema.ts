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
  /**
   * View `spectrum-2d` vẽ lưới $(N+1) \times (N+1)$ — trần cho $N$.
   *
   * Thấp hơn `maxSpectrum` nhiều, và không phải vì tốn tính: $24$ cho $625$ ô,
   * DP chạy trong chớp mắt. Trần này là **trần đọc được**. Theo quy ước G-10 một
   * ô là $44$px, nên $N = 24$ đã là $1100$px bề ngang; quá đó thì Player buộc
   * phải co cả hình lại và người học mất chính thứ cần thấy — từng ô.
   */
  maxSpectrum2d: 24,
} as const;

/**
 * Một **thành viên** của họ luật — tập đóng, có tham số.
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
 *   - Tám thành viên dưới đây, cộng phép **hợp** ở `GameRule`, phủ trọn họ game
 *     bốc đống kinh điển: Nim, bốc $1..k$, bốc theo tập, "bốc tối đa nửa đống",
 *     trò Grundy, Wythoff, trò Euclid, Nim Lasker, Nim Fibonacci.
 *
 * Cái giá phải trả, nói thẳng, và **không** được nói giảm: thế phải là **đa tập số
 * nguyên**, cộng nhiều nhất một con số nhớ về nước vừa đi, và hai bên phải cùng
 * luật. Ngoài đó thì nằm ngoài:
 *
 *   - **Chomp, Hackenbush, lật đồng xu, cờ trên đồ thị, game bàn cờ, game tô màu**
 *     — thế không phải đa tập số, chấm hết.
 *   - **Game partizan** — solver giả định hai bên cùng luật.
 *
 * Đó là GM-01 thật sự, và nó vẫn còn nợ.
 */
const SUBTRACT = Type.Object(
  {
    type: Type.Literal('subtract'),
    /** Bốc từ **một** đống, số lượng trong khoảng này. */
    min: Type.Integer({ minimum: 1, default: 1 }),
    /** Vắng nghĩa là không giới hạn — đó chính là Nim. */
    max: Type.Optional(Type.Integer({ minimum: 1 })),
  },
  { additionalProperties: false },
);

const SUBTRACT_SET = Type.Object(
  {
    type: Type.Literal('subtract-set'),
    /** Chỉ được bốc đúng những số này. */
    allowed: Type.Array(Type.Integer({ minimum: 1 }), { minItems: 1, maxItems: 12 }),
  },
  { additionalProperties: false },
);

const SUBTRACT_FRACTION = Type.Object(
  {
    /**
     * Bốc tối đa **một phần** của đống: $1 \le k \le \lfloor n/d \rfloor$.
     *
     * $d = 2$ là "bốc tối đa nửa đống", cách phát biểu rất hay gặp và nhìn qua
     * tưởng khai được bằng `subtract`. Không: cận ở đây **phụ thuộc thế**, và
     * điều đó đổi hẳn lời giải — thế thua là $n = 2^m - 1$ ($1, 3, 7, 15, 31$),
     * trong khi mọi `subtract` có `max` cố định đều cho một cấp số cộng.
     */
    type: Type.Literal('subtract-fraction'),
    denominator: Type.Integer({ minimum: 2, maximum: 12 }),
  },
  { additionalProperties: false },
);

const SPLIT_UNEQUAL = Type.Object(
  {
    /** Chia một đống thành hai phần **khác nhau**, cùng khác rỗng (trò Grundy). */
    type: Type.Literal('split-unequal'),
  },
  { additionalProperties: false },
);

const SPLIT_ANY = Type.Object(
  {
    /**
     * Chia một đống thành hai phần khác rỗng, **cho phép bằng nhau**.
     *
     * Khác `split-unequal` đúng ở nước $n \to (n/2, n/2)$, và một nước ấy đổi
     * hẳn bảng Grundy: trò Grundy có $g(4) = 0$, còn nhánh chia của Nim Lasker
     * cần $2+2$ để $g(4) = 3$. Nên đây là **hai** thành viên, không phải một
     * thành viên với một cờ bật tắt.
     */
    type: Type.Literal('split-any'),
  },
  { additionalProperties: false },
);

const SUBTRACT_EQUAL_PAIR = Type.Object(
  {
    /**
     * Bốc **cùng một số** viên từ hai đống khác nhau (GM-05) ⇒ **Wythoff**.
     *
     * Đây là thành viên đầu tiên mà một nước đụng *hai* đống, và nó phá một giả
     * định êm ái của bốn thành viên đầu: rằng ván là **tổng** của các trò con độc
     * lập. Wythoff không phải thế, nên Sprague–Grundy **không** áp dụng và solver
     * phải duyệt lùi trên cả thế. Xem `isLocalRule` trong `solver.ts` — chỗ đó là
     * nơi duy nhất biết sự khác biệt ấy.
     */
    type: Type.Literal('subtract-equal-pair'),
  },
  { additionalProperties: false },
);

const SUBTRACT_AT_MOST_MULTIPLE = Type.Object(
  {
    /**
     * Bốc tối đa `multiplier` lần số viên **đối thủ vừa bốc** (GM-09) ⇒ **Nim Fibonacci**.
     *
     * Đây là thành viên đầu tiên mà thế cờ **không đủ** để mô tả ván: hai bàn cùng
     * $20$ viên có thể khác nhau hoàn toàn, tuỳ đối thủ vừa bốc $1$ hay $7$. Nên
     * luật này kéo theo một trường mới ở `config`, `last_take`, và một khoá trạng
     * thái mới trong solver — chứ không chỉ thêm một nhánh sinh nước.
     *
     * Nước **mở màn** được bốc bao nhiêu cũng được, trừ cả đống: không có "nước
     * trước" để lấy cận, mà cho bốc hết thì ván kết thúc trước khi bắt đầu.
     *
     * Với `multiplier = 2` đây đúng là Nim Fibonacci, và thế thua là các số
     * Fibonacci — một phát biểu mà view `spectrum` biến thành một vệt để nhìn.
     */
    type: Type.Literal('subtract-at-most-multiple'),
    multiplier: Type.Integer({ minimum: 2, maximum: 5 }),
  },
  { additionalProperties: false },
);

const SUBTRACT_MULTIPLE_OF_OTHER = Type.Object(
  {
    /**
     * Bốc một **bội số dương của đống khác** ra khỏi đống này (GM-06) ⇒ **trò Euclid**.
     *
     * Nước đi từ đống này đọc cỡ đống kia, nên tập nước hợp lệ của một đống
     * **không** là hàm của riêng đống ấy. Cùng lý do với `subtract-equal-pair`:
     * luật toàn cục, không có Grundy.
     */
    type: Type.Literal('subtract-multiple-of-other'),
  },
  { additionalProperties: false },
);

const ATOMS = [
  SUBTRACT,
  SUBTRACT_SET,
  SUBTRACT_FRACTION,
  SPLIT_UNEQUAL,
  SPLIT_ANY,
  SUBTRACT_EQUAL_PAIR,
  SUBTRACT_MULTIPLE_OF_OTHER,
  SUBTRACT_AT_MOST_MULTIPLE,
] as const;

/** Một thành viên đơn của họ luật. `union` **không** nằm ở đây — xem `GameRule`. */
export const GameRuleAtom = Type.Union([...ATOMS]);
export type GameRuleAtom = Static<typeof GameRuleAtom>;

/**
 * Luật đi: một thành viên, hoặc **hợp** của vài thành viên (GM-07).
 *
 * Nim Lasker là "bốc **hoặc** chia", và trước GM-07 thì `rule` là một thành viên
 * đơn nên phát biểu ấy không viết ra được. `union` chỉ nhận **atom**, không nhận
 * `union` lồng: hợp của hợp vẫn là hợp, nên cho lồng chỉ thêm một cách viết cùng
 * một thứ — và một cách viết thêm là một chỗ nữa để hai bên hiểu khác nhau.
 */
export const GameRule = Type.Union([
  ...ATOMS,
  Type.Object(
    {
      type: Type.Literal('union'),
      of: Type.Array(GameRuleAtom, { minItems: 2, maxItems: 3 }),
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
    /**
     * Ba view, và chúng trả lời ba câu hỏi khác nhau.
     *
     *   - `piles` — "thế hiện tại thế nào".
     *   - `spectrum` — "quy luật là gì", cho thế **một** đống: một dải ô.
     *   - `spectrum-2d` — "quy luật là gì", cho thế **hai** đống: một lưới ô
     *     (GM-08). Wythoff và trò Euclid không có view thứ hai vì quy luật của
     *     chúng là quy luật của một **cặp**; ép vào một dải thì không còn gì để
     *     nhìn, mà "nhìn ra quy luật" đúng là toàn bộ giá trị sư phạm ở đây.
     */
    view: Type.Optional(
      Type.Union(
        [Type.Literal('piles'), Type.Literal('spectrum'), Type.Literal('spectrum-2d')],
        { default: 'piles' },
      ),
    ),
    /**
     * Với `spectrum`: vẽ các thế một đống từ $0$ tới số này.
     * Với `spectrum-2d`: vẽ lưới $(a,b)$ với $0 \le a, b \le$ số này.
     */
    spectrum_to: Type.Optional(
      Type.Integer({ minimum: 1, maximum: GAME_LIMITS.maxSpectrum }),
    ),
    /**
     * Số viên **đối thủ vừa bốc** — chỉ có nghĩa với luật đọc lịch sử (GM-09).
     *
     * Vắng nghĩa là **nước mở màn**: chưa ai đi, nên chưa có cận nào. Trường này
     * là một phần của *thế cờ*, không phải một tuỳ chọn hiển thị; lệnh `game/take`
     * tự ghi lại nó sau mỗi nước, nếu không thì sandbox sẽ cho đi những nước mà
     * luật cấm.
     */
    last_take: Type.Optional(Type.Integer({ minimum: 1 })),
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
