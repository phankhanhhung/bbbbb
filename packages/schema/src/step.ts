import { Type, type Static } from '@sinclair/typebox';
import { ANCHOR_KEY_PATTERN, EntityId, LangString } from './common.js';
import { Scene } from './scene.js';

/**
 * Quan hệ giữa step và cha của nó (§4.3).
 *
 * - `seq`           — bước kế tiếp tuyến tính.
 * - `case`          — rẽ nhánh xét trường hợp; nhiều con cùng cha, mỗi con có `case_label`.
 * - `contradiction` — nhánh kết thúc bằng mâu thuẫn; là leaf, đánh dấu ✗.
 * - `merge_ref`     — leaf trỏ về step "tổng hợp" chung; xem `merge_target`.
 */
export const EdgeType = Type.Union([
  Type.Literal('seq'),
  Type.Literal('case'),
  Type.Literal('contradiction'),
  Type.Literal('merge_ref'),
]);
export type EdgeType = Static<typeof EdgeType>;

/**
 * Anchor: liên kết hai chiều giữa span văn bản và tập Element (§4.5).
 *
 * P1 chỉ có dạng danh sách id. ANC-03 (selector query) sẽ thêm một biến thể ở P2;
 * bọc trong object ngay từ bây giờ để lúc đó không phải nâng major schema.
 */
export const Anchor = Type.Object(
  {
    ids: Type.Array(EntityId, { minItems: 1 }),
  },
  { additionalProperties: false },
);
export type Anchor = Static<typeof Anchor>;

/**
 * PRN-04 — view song ánh: hai cấu hình cạnh nhau + ánh xạ id ↔ id.
 *
 * Scene thứ hai nằm **bên trong** object này, không nằm cạnh `scene` như một
 * trường ngang hàng. Một cảnh thứ hai không kèm ánh xạ thì chỉ là hai hình đặt
 * gần nhau, và người đọc không có cách nào biết cái nào ứng với cái nào — đúng
 * thứ mà bài đếm bằng song ánh cần nói. Lồng vào trong thì hai thứ đó không thể
 * lệch nhau: khai cái này là khai cả cái kia.
 *
 * `pairs` cho phép nhiều-về-một: đếm $k$-về-$1$ ("mỗi hình bên phải ứng với đúng
 * $k$ hình bên trái, nên $|A| = k|B|$") là kỹ thuật đếm hai chiều chuẩn mực, và
 * cấm nó đi thì mất hẳn một họ bài. Validate chỉ **cảnh báo** khi ánh xạ không
 * đơn ánh, để tác giả biết mình đang khai một thứ mạnh hơn cái tên gọi.
 */
export const Bijection = Type.Object(
  {
    /** Cấu hình bên phải. Bên trái là `scene` của chính step. */
    scene: Scene,
    /** Mỗi cặp: `[id bên trái, id bên phải]`. */
    pairs: Type.Array(Type.Tuple([EntityId, EntityId]), { minItems: 1, maxItems: 200 }),
    /** Nhãn hai pane, ví dụ "Xâu nhị phân" ↔ "Đường đi lưới". */
    label_left: Type.Optional(LangString),
    label_right: Type.Optional(LangString),
  },
  { additionalProperties: false },
);
export type Bijection = Static<typeof Bijection>;

/**
 * GM-01/02 — step này **chơi được**: hai người luân phiên trên cùng một máy.
 *
 * Khối này cố ý **rất mỏng**, và đó là quyết định trung tâm của nó. Nó không mô tả
 * luật, không mô tả thế, không mô tả bàn. Thế là `scene` của chính step — một bàn cờ,
 * một đồ thị, một dãy đống — còn tham số của luật thì đã nằm trong `scene.config`, nơi
 * engine chủ vốn đã kiểm chúng. Khối này chỉ trả lời đúng một câu: *"chơi cái scene ấy
 * theo họ luật nào"*.
 *
 * Nhét luật vào đây sẽ là nguồn sự thật thứ hai bên cạnh `config`, và hai nguồn cho một
 * câu hỏi là lớp lỗi đắt nhất kho này từng gặp.
 *
 * **Vì sao là khối trên `step` chứ không phải trường trong `scene`:** một scene board
 * là một scene board dù có ai chơi nó hay không. Đẩy `rule`/`first` vào `board.config`
 * nghĩa là schema của 33 bài bàn cờ mọc thêm ba trường chỉ có nghĩa với những bài là
 * game. `bijection` đã là tiền lệ của đúng hình dạng này.
 *
 * **Lượt đi không có ở đây**, và đó không phải thiếu sót: nó suy từ `first` cộng số
 * nước đã đi (xem `editor/play.ts`). Một trường "đang tới lượt ai" trong dữ liệu là một
 * trường có thể lệch với dãy nước, mà dãy nước mới là thứ có thật.
 */
export const Play = Type.Object(
  {
    /**
     * Họ luật, do **engine chủ** đăng ký. Engine kiểm tên này ở `checkBounds`, không
     * kiểm ở JSON Schema: danh sách họ luật là chuyện của engine, và khai nó thành một
     * union ở đây là buộc schema chung phải biết mọi engine.
     */
    rule: Type.String({ minLength: 1, maxLength: 32 }),
    /** Bên đi trước. Tên theo quy ước CGT; giao diện gọi là "Người 1"/"Người 2". */
    first: Type.Optional(
      Type.Union([Type.Literal('left'), Type.Literal('right')], { default: 'left' }),
    ),
    /**
     * Ai đi nước **cuối cùng** thì **thua**.
     *
     * Đây là nơi duy nhất khai quy ước của một *ván*. Engine game có sẵn
     * `config.misere` cho phần phân tích Grundy của nó; khi cả hai cùng có mặt,
     * `checkBounds` của engine ấy bắt chúng phải khớp — một cross-check, không phải một
     * bản sao.
     */
    misere: Type.Optional(Type.Boolean({ default: false })),
    /**
     * Nước đi được áp bằng gì.
     *
     * `"command"` (mặc định): nước mang theo một lệnh của engine chủ, nên nó thuần và
     * replay được — thừa hưởng nguyên vẹn bảo đảm mà ENG-01 dựng cho lớp lệnh.
     *
     * `"script"`: luật tự trả về scene mới. Mạnh hơn, và **mất ba bảo đảm** mà phiên
     * chơi phải dựng cổng để bù (tất định, đúng engine, ghi ván theo id thay vì theo
     * lệnh — xem `editor/play.ts`). Validate cảnh báo khi bài chọn lối này, để chỗ đánh
     * đổi ấy có mặt trong bản duyệt chứ không nằm im trong một tệp script.
     */
    apply: Type.Optional(
      Type.Union([Type.Literal('command'), Type.Literal('script')], { default: 'command' }),
    ),
    /**
     * Trần số thế mà solver được duyệt cho bài này (GM-03).
     *
     * Vắng nghĩa là dùng trần của họ luật. Có mặt nghĩa là tác giả **hạ** nó xuống —
     * nâng lên thì engine vẫn kẹp theo trần của mình, vì cái treo máy người học là số
     * thế thật chứ không phải con số tác giả gõ.
     */
    solver_bound: Type.Optional(Type.Integer({ minimum: 1, maximum: 1_000_000 })),
  },
  { additionalProperties: false },
);
export type Play = Static<typeof Play>;

/**
 * Một **pha** của choreography (CHO-01..09).
 *
 * `anchor` **bắt buộc**, và đó là quyết định trung tâm của cả lớp này. CHO-07 nói
 * mỗi pha phải đồng bộ với một anchor hoặc một đoạn narrative, và NG-07 gọi thứ
 * không có ràng buộc ấy bằng đúng tên của nó: animation **trang trí**. Một pha
 * không nói được nó đang giải thích câu nào thì không phải một pha giải thích.
 *
 * Thời gian tính bằng **mili-giây trong timeline của step**, không phải giây thực
 * cũng không phải "beat" trừu tượng: CHO-08 đòi cùng `t` cho cùng khung ở mọi nơi,
 * nên đơn vị phải là một con số tuyệt đối mà cả Player lẫn render headless đọc
 * giống nhau.
 */
export const ChoreographyPhase = Type.Object(
  {
    id: EntityId,
    /**
     * `focus`/`dim` đổi cách vẽ; `show`/`hide` đổi độ hiện; `move` đưa element tới
     * chỗ của element khác; `morph` vừa đưa vừa biến hình (CHO-05).
     *
     * Tập **đóng**, cùng lý do đã ghi ở `GameRule` và `SPREAD_RULES`: cho tác giả
     * mô tả chuyển động bằng biểu thức là mở lại DSL-03 bằng cửa sau.
     */
    kind: Type.Union([
      Type.Literal("focus"),
      Type.Literal("dim"),
      Type.Literal("show"),
      Type.Literal("hide"),
      Type.Literal("move"),
      Type.Literal("morph"),
    ]),
    /** Element chịu tác động. Rỗng là vô nghĩa, nên tối thiểu một. */
    targets: Type.Array(EntityId, { minItems: 1, maxItems: 200 }),
    /** Đích của `move`/`morph`: id element mà target đi tới. */
    to: Type.Optional(EntityId),
    /**
     * **Nguồn** của `move`/`morph`: id element mà target *bay tới từ đó* (CHO-12).
     *
     * `to` và `from` là hai câu chuyện khác nhau, không phải hai cách nói một chuyện.
     * `to` là "vật này rời chỗ": nó rỗng chỗ cũ và đậu ở chỗ mới. `from` là "vật này
     * **đến**": chỗ cũ vẫn còn nguyên nội dung của nó, chỉ có vật này là mới tới.
     *
     * Chuỗi biến đổi đại số cần đúng vế thứ hai và **không có** vế thứ nhất: mọi dòng
     * đều ở lại trên màn hình, nên cho hạng tử dòng $k$ bay xuống dòng $k+1$ bằng `to`
     * sẽ đục một lỗ vào dòng $k$. Với `from` thì bản ở dòng $k+1$ xuất phát từ chỗ của
     * bản dòng $k$ rồi về chỗ của mình, và không ai mất gì.
     *
     * Chỉ đi được đường **toạ độ scene** (`boxOf`), không đi đường sao chép thuộc
     * tính: "bắt đầu ở chỗ khác" là một phát biểu về vị trí, mà vị trí thì chỉ có
     * `boxOf` nói được bằng thứ tiếng chung của mọi engine (G-10).
     */
    from: Type.Optional(EntityId),
    /** Mốc bắt đầu, ms tính từ đầu timeline của step. */
    at: Type.Integer({ minimum: 0, maximum: 60_000 }),
    /** Thời lượng, ms. `0` nghĩa là đổi tức thì — hợp lệ và hay dùng cho `show`. */
    duration: Type.Integer({ minimum: 0, maximum: 60_000 }),
    easing: Type.Optional(
      Type.Union([Type.Literal("linear"), Type.Literal("ease-in-out")], {
        default: "ease-in-out",
      }),
    ),
    /** CHO-07 — khoá anchor mà pha này giải thích. Bắt buộc, xem chú thích trên. */
    anchor: Type.String({ pattern: ANCHOR_KEY_PATTERN }),
    /**
     * Nhãn ngắn của pha — **chữ trơn**, và nay nó hiện ở **mọi** chế độ.
     *
     * Trước đây chỉ bộ đếm pha (giảm chuyển động) in nó ra; chế độ thường chỉ đưa
     * vào `aria-valuetext`. Nghĩa là người sáng mắt xem chuyển động mà không có chữ
     * nào giải thích — trong khi chữ **đã được viết sẵn** cho cả 87 pha của kho.
     */
    label: Type.Optional(LangString),
    /**
     * Dừng phát lại **sau** pha này, đợi người xem bấm tiếp (CHO-11).
     *
     * Một timeline chạy một mạch từ đầu đến cuối thì mọi pha trôi qua với tốc độ như
     * nhau, kể cả pha mang bước lập luận nặng nhất. `hold` là chỗ tác giả nói "đọc
     * cái này đã rồi hãy đi tiếp". Không phải chuyện tốc độ — chỉnh chậm lại thì cả
     * timeline chậm đều, mà thứ cần là **nhịp không đều**.
     *
     * Pha có `hold` bắt buộc có `label`: dừng lại mà không có gì để đọc là kẹt, không
     * phải nghỉ. Luật `lint/phase-hold-no-label` ép điều đó.
     */
    hold: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);
export type ChoreographyPhase = Static<typeof ChoreographyPhase>;

/**
 * Timeline nhiều pha của một step (CHO-01..CHO-10).
 *
 * **Không** nằm trong renderer. Renderer vẫn là `Scene → SvgNode[]` thuần; lớp
 * này đọc `(nodes, choreography, t)` và cũng thuần. Nhét thời gian vào renderer là
 * giết D-03, và kéo theo REN-01/02/04 — cùng một phép tính phải chạy được cả trong
 * browser lẫn trong Node.
 *
 * CHO-10: animation tự động giữa hai snapshot vẫn còn và vẫn là **fallback**. Có
 * `choreography` nghĩa là tác giả nói rõ chuyện gì xảy ra trong step; không có thì
 * Player vẫn nội suy hai snapshot như cũ, và đó không phải "đã có choreography".
 */
export const Choreography = Type.Object(
  {
    phases: Type.Array(ChoreographyPhase, { minItems: 1, maxItems: 40 }),
  },
  { additionalProperties: false },
);
export type Choreography = Static<typeof Choreography>;

export const Step = Type.Object(
  {
    id: EntityId,
    parent: Type.Union([EntityId, Type.Null()]),
    edge_type: EdgeType,

    /** Bắt buộc khi `edge_type: "case"` — kiểm ở tầng structure, không ở JSON Schema. */
    case_label: Type.Optional(LangString),

    /**
     * Bắt buộc khi `edge_type: "merge_ref"`: id của step tổng hợp (DAT-10).
     * Giữ cấu trúc là **cây + tham chiếu**, không phải DAG thật.
     */
    merge_target: Type.Optional(EntityId),

    narrative: Type.Optional(LangString),
    /**
     * `additionalProperties: false` trên Record khoá-pattern là **bắt buộc**, không
     * phải trang trí: JSON Schema chỉ kiểm các khoá *khớp* pattern, khoá lệch
     * pattern mặc định được thả qua cùng giá trị tuỳ ý của nó. Thiếu dòng này,
     * `anchors: {"BAD-KEY": 42}` đậu validate rồi nổ `TypeError` ở tầng structure —
     * cửa whitelist (DAT-20) hở đúng một khe.
     */
    anchors: Type.Optional(
      Type.Record(Type.String({ pattern: ANCHOR_KEY_PATTERN }), Anchor, {
        additionalProperties: false,
      }),
    ),

    /** Vắng mặt chỉ hợp lệ với `merge_ref` (node con trỏ, không có hình riêng). */
    scene: Type.Optional(Scene),

    /** PRN-04. Cần `scene` — kiểm ở tầng structure, không ở JSON Schema. */
    bijection: Type.Optional(Bijection),

    /** GM-01/02 — step chơi được. Cần `scene`; họ luật do engine chủ kiểm. */
    play: Type.Optional(Play),

    /**
     * CHO-01..10 — timeline nhiều pha. Ràng buộc chéo (anchor có thật, target có
     * thật, pha không tràn) kiểm ở tầng structure.
     */
    choreography: Type.Optional(Choreography),

    /** NFR-A3. Vắng mặt thì Player sinh fallback tóm tắt đếm element theo loại. */
    alt_text: Type.Optional(LangString),

    /** Không hiển thị cho người học; phục vụ chính chủ và pipeline. */
    author_notes: Type.Optional(Type.String()),

    /**
     * Ràng buộc mà step này **cố ý** vi phạm.
     *
     * Lời giải thường phải bày ra đúng thứ mà sandbox cấm: bài $R(3,3)=6$ kết
     * luận bằng một tam giác đơn sắc, trong khi sandbox lấy "không có tam giác
     * đơn sắc" làm luật chơi. Không có trường này thì tác giả phải sống chung với
     * cảnh báo vĩnh viễn, và cảnh báo mà ai cũng bỏ qua thì không còn là cảnh báo.
     *
     * Khai ở đây biến chủ đích thành thứ đọc được. Đổi lại, validate sẽ báo khi
     * khai **thừa** — step không còn vi phạm nữa mà khai báo vẫn nằm đó là dấu
     * hiệu scene đã đổi mà lời giải chưa theo kịp.
     */
    expects_violation: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),

    /**
     * Khẳng định về scene mà validate phải kiểm được — biểu thức DSL trả `true`.
     *
     * `{{expr}}` trong narrative lo phần "in ra một con số": chữ và hình thành
     * cùng một giá trị nên không thể lệch. Nhưng lời giải còn khẳng định những
     * thứ **suy ra** từ scene chứ không đọc thẳng ra được — "cần ít nhất $3$
     * bước" là một mệnh đề về $3$ nghịch thế, không phải là chính số đó. Chỗ ấy
     * nội suy không với tới, và đó đúng là chỗ bài `sorting-adjacent-swaps` sai
     * suốt nhiều commit.
     *
     * Khai ở đây thì con số trong đề bài buộc phải khớp scene, và ngày nào ai đó
     * sửa scene mà quên sửa lời giải thì validate đỏ ngay — thay vì để người đọc
     * phát hiện hộ.
     */
    claims: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { maxItems: 8 })),

    /**
     * AUT-09: cổng khoá publish. Draft từ LLM vào kho với `verified: false`;
     * chính chủ phải bật tay từng step trong Studio. Lưu trong file để git diff
     * đọc được ai đã duyệt cái gì ở commit nào.
     */
    verified: Type.Optional(Type.Boolean({ default: false })),
  },
  { additionalProperties: false },
);

export interface Step {
  id: string;
  parent: string | null;
  edge_type: EdgeType;
  case_label?: { vi: string; en?: string };
  merge_target?: string;
  narrative?: { vi: string; en?: string };
  anchors?: Record<string, Anchor>;
  scene?: Scene;
  choreography?: {
    phases: {
      id: string;
      kind: 'focus' | 'dim' | 'show' | 'hide' | 'move' | 'morph';
      targets: string[];
      to?: string;
      from?: string;
      at: number;
      duration: number;
      easing?: 'linear' | 'ease-in-out';
      anchor: string;
      label?: { vi: string; en?: string };
      hold?: boolean;
    }[];
  };
  bijection?: {
    scene: Scene;
    pairs: [string, string][];
    label_left?: { vi: string; en?: string };
    label_right?: { vi: string; en?: string };
  };
  play?: {
    rule: string;
    first?: 'left' | 'right';
    misere?: boolean;
    apply?: 'command' | 'script';
    solver_bound?: number;
  };
  alt_text?: { vi: string; en?: string };
  author_notes?: string;
  expects_violation?: string[];
  claims?: string[];
  verified?: boolean;
}
