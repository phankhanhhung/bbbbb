import type { Scene } from '@combviz/schema';
import { other, type Command, type CommandRegistry, type Move, type PlayPlayer } from './command.js';
import type { SolveResult } from './solve.js';
import { createTrail, stepTrail, type Trail } from './trail.js';

/**
 * **Một ván chơi** (GM-01, GM-02) — lớp biến engine thành game luân phiên.
 *
 * Trước lớp này, engine game là một *widget bốc đống*: thế là đa tập số nguyên, luật
 * thuộc tám họ đóng, và không có khái niệm lượt, người thắng, hay ván. `schema.ts` của
 * chính nó ghi thẳng rằng Chomp, Hackenbush, cờ trên đồ thị *"thế không phải đa tập số,
 * chấm hết"* và kết bằng *"Đó là GM-01 thật sự, và nó vẫn còn nợ."* Đây là chỗ trả.
 *
 * ## Nó không biết engine nào
 *
 * Cả tệp này không nhắc tên một engine nào, và đó là điều kiện để nó dùng được cho cả
 * bốn substrate (đống, bàn cờ, đồ thị, và thứ chưa có). Luật vào qua {@link PlayRules};
 * thế là một `Scene` bất kỳ; nước đi là một `Move` bất kỳ.
 *
 * ## Lượt đi **không** nằm trong scene
 *
 * `toMove` suy từ `first` và số nước đã đi, không phải một trường trong `Scene`. Hai
 * lý do, và cái thứ hai mới nặng:
 *
 *   - Nhét nó vào scene nghĩa là schema của *board* và *graph* mọc thêm một trường chỉ
 *     có nghĩa khi bài ấy là một game — đúng kiểu trường ma mà kho này đã dọn nhiều lần.
 *   - Suy ra thì nó **tất định**: cùng một dãy nước cho cùng một lượt, không có đường
 *     nào để hai bên lệch nhau.
 *
 * Cái giá phải trả, nói thẳng: ván **luân phiên nghiêm ngặt**. Không có nước "pass",
 * không có đi hai lần. Ghi vào §16 chứ không giấu.
 *
 * ## Kết thúc là **quy ước**, không phải script
 *
 * Hết nước ⇒ người đang đi **thua** (normal play) hoặc **thắng** (misère). Đó là quy
 * ước của lý thuyết trò chơi tổ hợp, nó đóng, và nó phủ trọn cả bốn game của M78. Cho
 * tác giả viết một hàm `terminal` riêng là mở một cửa mà chưa game nào cần đi qua.
 */

/**
 * Trần số nước một ván.
 *
 * Không phải trần kỹ thuật — snapshot scene bị chặn cỡ bởi NFR-P4 nên $200$ cái vẫn
 * rẻ. Nó là hàng rào cho **luật hỏng**: một họ luật sinh ra nước không giảm thế sẽ cho
 * hai bên đi qua lại vô hạn, và người học thấy một ván không bao giờ kết thúc mà không
 * ai nói cho họ biết vì sao. Chạm trần thì ván dừng và **nói ra**.
 */
export const PLAY_LIMIT = 200;

/**
 * Luật chơi — thứ duy nhất mà phiên chơi cần biết về game cụ thể.
 *
 * `legalMoves` nhận `player`, và tham số ấy **không phải trang trí**: game partizan
 * (Hackenbush xanh-đỏ) cho hai bên hai tập nước khác hẳn nhau. Họ luật impartial thì
 * bỏ qua nó — nhưng chữ ký phải mang nó từ ngày đầu, vì thêm một tham số sau nghĩa là
 * sửa mọi chỗ gọi.
 */
export interface PlayRules {
  legalMoves(scene: Scene, player: PlayPlayer): readonly Move[];
  /**
   * **Lối B** — script tự trả về scene mới (`apply: "script"`).
   *
   * Vắng mặt là lối A: nước đi mang theo `command` và phiên chơi áp bằng registry.
   * Lối A giữ nguyên mọi bảo đảm của lớp lệnh; lối B đánh đổi ba thứ, và cả ba được
   * bịt bằng cổng ngay trong {@link playMove} chứ không bằng lời dặn:
   *
   *   - **tất định** — chạy hai lần, so byte; lệch thì từ chối nước;
   *   - **hợp lệ** — scene trả ra phải cùng `engine` với scene vào;
   *   - **ghi ván** — không có lệnh để ghi, nên draft ghi theo *id nước*.
   *
   * `null` nghĩa là nước không áp được, y hệt `CommandDef.apply`.
   */
  applyMove?(scene: Scene, move: Move): Scene | null;
  /**
   * Trần số thế mà solver chung được duyệt cho họ luật này (GM-03).
   *
   * Khai ở **họ luật** chứ không phải một hằng số toàn cục, vì con số hợp lý phụ thuộc
   * hình dạng thế: một bàn Chomp $6\times6$ có chưa tới một nghìn thế, còn một đồ thị
   * mười đỉnh thì có thể hàng triệu. Vắng thì dùng trần mặc định.
   */
  readonly solverBound?: number;
  /**
   * Đường tắt: họ luật **tự trả lời được** ai thắng.
   *
   * Có vì lý thuyết đôi khi rẻ hơn duyệt hàng trăm nghìn thế: bốc đống trả lời bằng
   * vài phép XOR (Sprague–Grundy), còn duyệt lùi thì ra cùng một câu sau vài giây. Trả
   * `null` nghĩa là "ca này tôi không biết" và solver chung duyệt như thường — nên một
   * họ luật có công thức cho *một phần* các thế vẫn khai được.
   */
  solve?(scene: Scene, toMove: PlayPlayer, misere: boolean): SolveResult | null;
  /**
   * Bên này **là ai**, nói bằng lời của trò chơi.
   *
   * Giao diện gọi hai bên là "Người 1"/"Người 2" và với game impartial thì thế là đủ.
   * Với Hackenbush thì không: một bên *là* cạnh xanh và bên kia *là* cạnh cam, và người
   * chơi cần đọc ra điều đó ở chỗ chỉ lượt chứ không phải suy từ việc bấm thử.
   *
   * Câu ấy **phải** đến từ họ luật, không từ CSS: `styles.css` viết thẳng rằng nó *"chỉ
   * được nói về khung, không được nói về hình"*, và màu quân là chuyện của hình. Vắng
   * thì giao diện chỉ hiện "Người 1"/"Người 2".
   */
  sideName?(player: PlayPlayer): string;
}

export interface PlayMoveRecord {
  readonly moveId: string;
  readonly label: string;
  readonly by: PlayPlayer;
  /** Lệnh đã chạy; `null` ở lối B. */
  readonly command: Command | null;
  /**
   * Thế **sau** nước này.
   *
   * Lưu snapshot đầy đủ, cùng lý lẽ đã ghi ở `history.ts`: scene bị chặn cỡ bởi NFR-P4
   * nên snapshot rẻ, còn dựng lại bằng cách chạy lại cả ván thì tốn đúng chỗ hay được
   * gọi nhất (mỗi lần vẽ lịch sử, mỗi lần ghi draft).
   */
  readonly scene: Scene;
}

export interface PlaySession {
  readonly initial: Scene;
  readonly scene: Scene;
  readonly first: PlayPlayer;
  readonly misere: boolean;
  readonly history: readonly PlayMoveRecord[];
  /** Bên sắp đi. Suy từ `first` và `history.length` — xem chú thích đầu tệp. */
  readonly toMove: PlayPlayer;
  /** Nước hợp lệ của bên sắp đi. Rỗng ⇔ ván đã xong. */
  readonly moves: readonly Move[];
  readonly over: boolean;
  /** `null` khi ván chưa xong. */
  readonly winner: PlayPlayer | null;
  /** Vì sao ván dừng — `null` khi chưa dừng. Chạm trần cũng nói ra ở đây. */
  readonly ended: string | null;
  /** Những thế đã đặt chân (SBX-06). Undo rồi thử lối khác vẫn còn dấu. */
  readonly trail: Trail;
}

const moverAt = (first: PlayPlayer, plies: number): PlayPlayer =>
  plies % 2 === 0 ? first : other(first);

/**
 * **Quy ước kết thúc** — ai thắng khi bên sắp đi hết nước.
 *
 * Một dòng, và nó có tên riêng vì nó có **hai** chỗ gọi: phiên chơi ({@link settle}) và
 * solver ({@link solveGame}). Viết nó hai lần thì hai lần ấy khớp nhau hôm nay và lệch
 * nhau vào ngày ai đó sửa một lần — và triệu chứng sẽ là "solver bảo Left thắng, chơi
 * thật thì Right thắng", một câu không ai lần ngược được về đây.
 */
export const terminalWinner = (toMove: PlayPlayer, misere: boolean): PlayPlayer =>
  misere ? toMove : other(toMove);

/**
 * Đóng ván lại nếu bên sắp đi hết nước.
 *
 * Một chỗ duy nhất biết quy ước normal/misère. Rải nó ra hai chỗ (lúc mở ván và lúc đi
 * một nước) là cách chắc nhất để misère đúng ở chỗ này và sai ở chỗ kia.
 */
function settle(
  scene: Scene,
  toMove: PlayPlayer,
  misere: boolean,
  rules: PlayRules,
): { moves: readonly Move[]; over: boolean; winner: PlayPlayer | null; ended: string | null } {
  const moves = rules.legalMoves(scene, toMove);
  if (moves.length > 0) return { moves, over: false, winner: null, ended: null };
  return {
    moves,
    over: true,
    // Normal play: hết nước thì **thua**. Misère: hết nước thì **thắng**, vì người
    // vừa đi mới là người lấy nước cuối cùng.
    winner: terminalWinner(toMove, misere),
    ended: 'hết nước đi',
  };
}

export function createPlay(
  initial: Scene,
  rules: PlayRules,
  options: { first?: PlayPlayer; misere?: boolean } = {},
): PlaySession {
  const first = options.first ?? 'left';
  const misere = options.misere === true;
  return {
    initial,
    scene: initial,
    first,
    misere,
    history: [],
    toMove: first,
    // Hỏi ngay từ đầu: một thế mở màn **đã** hết nước là một ván hợp lệ (bàn Chomp
    // $1\times1$ chẳng hạn), và bỏ qua chỗ này thì nó hiện ra như một ván đang chờ.
    ...settle(initial, first, misere, rules),
    trail: createTrail(initial),
  };
}

export interface PlayOutcome {
  readonly session: PlaySession;
  /** `null` khi đi được; ngược lại là **chữ**, để giao diện nói ra thay vì rung im. */
  readonly refusal: string | null;
}

/**
 * Đi một nước, theo **id** chứ không theo object.
 *
 * Id đến từ danh sách mà chính phiên này vừa phát ra (`session.moves`), nên đi một nước
 * không có trong danh sách là chuyện không xảy ra được — thay vì một `Move` do phía gọi
 * tự dựng, vốn là đường để giao diện "thắng" bằng một nước luật cấm.
 */
export function playMove(
  session: PlaySession,
  moveId: string,
  rules: PlayRules,
  registry: CommandRegistry,
): PlayOutcome {
  if (session.over) return { session, refusal: 'ván đã kết thúc' };

  const move = session.moves.find((m) => m.id === moveId);
  if (!move) return { session, refusal: `không có nước đi "${moveId}" ở thế này` };

  if (session.history.length >= PLAY_LIMIT) {
    return {
      session: { ...session, over: true, ended: `ván quá ${PLAY_LIMIT} nước — luật không đóng lại` },
      refusal: `ván quá ${PLAY_LIMIT} nước`,
    };
  }

  const applied = applyMoveTo(session.scene, move, rules, registry);
  if ('refusal' in applied) return { session, refusal: applied.refusal };
  const next = applied.scene;

  const by = session.toMove;
  const record: PlayMoveRecord = {
    moveId: move.id,
    label: move.label,
    by,
    command: move.command ?? null,
    scene: next,
  };
  const history = [...session.history, record];
  const toMove = moverAt(session.first, history.length);

  return {
    session: {
      ...session,
      scene: next,
      history,
      toMove,
      ...settle(next, toMove, session.misere, rules),
      trail: stepTrail(session.trail, next, move.label),
    },
    refusal: null,
  };
}

/**
 * Áp **một** nước — chỗ duy nhất mà hai lối rẽ nhau.
 *
 * Gom vào một hàm chứ không rải ra hai nhánh ở chỗ gọi: hai lối áp nước là hai chỗ để
 * lệch nhau, và cách rẻ nhất để chúng không lệch là chúng chỉ gặp nhau đúng ở đây.
 *
 * Xuất ra vì {@link solveGame} gọi thẳng nó. Solver duyệt hàng trăm nghìn cạnh và không
 * đọc lịch sử, vết chân, hay undo — dựng nguyên một `PlaySession` cho mỗi cạnh đắt gấp
 * bốn lần mà không dùng đến ba phần tư thứ dựng ra. Nhưng nó phải áp nước **y hệt**
 * người chơi, kể cả cổng tất định của lối B, nên nó đi qua đúng hàm này.
 */
export function applyMoveTo(
  scene: Scene,
  move: Move,
  rules: PlayRules,
  registry: CommandRegistry,
): { scene: Scene } | { refusal: string } {
  if (move.command) {
    const def = Object.hasOwn(registry, move.command.type)
      ? registry[move.command.type]
      : undefined;
    if (!def) return { refusal: `engine không có lệnh "${move.command.type}"` };
    const next = def.apply(scene, move.command.params);
    return next ? { scene: next } : { refusal: `lệnh "${move.command.type}" không áp được` };
  }

  if (!rules.applyMove) {
    return { refusal: `nước "${move.id}" không mang lệnh, mà luật cũng không có cách áp` };
  }

  const once = rules.applyMove(scene, move);
  if (!once) return { refusal: `không áp được nước "${move.id}"` };

  // **Cổng tất định của lối B.** Chạy lại và so byte. Một script không tất định làm
  // hỏng replay, golden và cả `toDraftSteps` — nhưng nó hỏng chúng *về sau*, ở một chỗ
  // không ai nối lại được với nguyên nhân. Bắt tại đây thì nó hỏng đúng một nước đi, và
  // nói ra là hỏng vì cái gì.
  const twice = rules.applyMove(scene, move);
  if (!twice || JSON.stringify(twice) !== JSON.stringify(once)) {
    return { refusal: `script không tất định: cùng một nước cho hai kết quả khác nhau` };
  }
  if (once.engine !== scene.engine) {
    return { refusal: `script đổi engine từ "${scene.engine}" sang "${once.engine}"` };
  }
  return { scene: once };
}

/** Về lại thế mở màn. Vết chân **giữ nguyên** — đã tới đâu thì vẫn là đã tới. */
export function resetPlay(session: PlaySession, rules: PlayRules): PlaySession {
  return {
    ...session,
    scene: session.initial,
    history: [],
    toMove: session.first,
    ...settle(session.initial, session.first, session.misere, rules),
  };
}

/** Lùi một nước. `null` khi chưa đi nước nào. */
export function undoMove(session: PlaySession, rules: PlayRules): PlaySession | null {
  if (session.history.length === 0) return null;
  const history = session.history.slice(0, -1);
  const scene = history.at(-1)?.scene ?? session.initial;
  const toMove = moverAt(session.first, history.length);
  return {
    ...session,
    scene,
    history,
    toMove,
    ...settle(scene, toMove, session.misere, rules),
  };
}

/**
 * Chạy lại một dãy nước từ thế mở màn.
 *
 * Đây vừa là tính năng (xem lại ván) vừa là **phép đo**: cùng dãy id cho cùng một scene,
 * tới từng byte. Chốt canh gọi thẳng nó, và lối B phải qua được nó y như lối A.
 */
export function replayPlay(
  initial: Scene,
  moveIds: readonly string[],
  rules: PlayRules,
  registry: CommandRegistry,
  options: { first?: PlayPlayer; misere?: boolean } = {},
): { session: PlaySession; refusal: string | null } {
  let session = createPlay(initial, rules, options);
  for (const [i, id] of moveIds.entries()) {
    const out = playMove(session, id, rules, registry);
    if (out.refusal !== null) {
      return { session, refusal: `nước ${i + 1} ("${id}"): ${out.refusal}` };
    }
    session = out.session;
  }
  return { session, refusal: null };
}

export interface DraftStep {
  readonly narrative: string;
  readonly scene: Scene;
}

/**
 * Ghi ván thành chuỗi step nháp (GM-04).
 *
 * Đây là chỗ một buổi nghịch biến thành nội dung: tác giả chơi thử một ván hay, bấm một
 * nút, và có sẵn bộ khung lời giải. Narrative là **nháp** — nhãn nước cộng tên bên đi —
 * chứ không phải câu hoàn chỉnh; bịa ra một câu nghe như đã viết xong là cách chắc nhất
 * để nó được xuất bản mà không ai đọc lại.
 *
 * Chạy được cho **cả hai lối** vì mỗi bản ghi đã mang sẵn scene sau nước ấy.
 */
export function toDraftSteps(session: PlaySession): readonly DraftStep[] {
  return session.history.map((record) => ({
    narrative: `${record.by === 'left' ? 'Người 1' : 'Người 2'}: ${record.label}`,
    scene: record.scene,
  }));
}
