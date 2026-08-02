import type { Scene } from '@combviz/schema';

/**
 * Command layer (ENG-01) — **mọi** thao tác chỉnh sửa đi qua đây, không có
 * đường nào mutate scene thẳng từ UI.
 *
 * Bốn thứ khác nhau đều là hàm của lớp này:
 *   - undo/redo (ENG-00),
 *   - log thao tác khi soạn bài (AUT-08),
 *   - no-code editor và bulk edit ở P2,
 *   - nước đi trong Game engine ở P3 (GM-01).
 *
 * Vì vậy command phải **deterministic và replay được**: không sinh id bên trong,
 * không đọc giờ, không random. Id do phía gọi cấp và nằm trong tham số — nếu
 * command tự sinh id, replay một chuỗi lệnh sẽ ra scene khác, và cả bốn thứ trên
 * đều hỏng cùng lúc.
 */
export interface Command<P = unknown> {
  readonly type: string;
  readonly params: P;
}

export interface CommandDef<P> {
  readonly type: string;
  /** Nhãn tiếng Việt hiện trong lịch sử undo. */
  label(params: P, scene: Scene): string;
  /**
   * Áp lệnh, trả về scene **mới**.
   *
   * Trả `null` khi lệnh không áp được (kéo quân ra ngoài bàn, xoá id không tồn
   * tại). `null` không phải lỗi — nó là "thao tác này không có nghĩa ở đây", và
   * lịch sử không ghi nhận gì.
   */
  apply(scene: Scene, params: P): Scene | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CommandRegistry = Readonly<Record<string, CommandDef<any>>>;

export function defineCommand<P>(def: CommandDef<P>): CommandDef<P> {
  return def;
}

export function command<P>(type: string, params: P): Command<P> {
  return { type, params };
}

/**
 * Hai bên của một ván (GM-01).
 *
 * Tên lấy theo quy ước lý thuyết trò chơi tổ hợp — Left và Right — chứ không phải
 * "người 1 / người 2". Lý do là **game partizan**: ở Hackenbush xanh-đỏ, bên xanh
 * *là* Left và bên đỏ *là* Right, và đó là hai vai có luật khác nhau chứ không phải
 * hai chỗ ngồi. Giao diện gọi họ là "Người 1"/"Người 2"; chỗ ấy là chuyện hiển thị,
 * còn ở đây là chuyện luật.
 */
export type PlayPlayer = 'left' | 'right';

export const other = (p: PlayPlayer): PlayPlayer => (p === 'left' ? 'right' : 'left');

/**
 * Một **nước đi hợp lệ** — `legal_moves(state, player)` trả về danh sách này.
 *
 * Nó cố ý **không** mang scene kết quả. Nước đi là một *ý định* ("ăn từ ô này"), còn
 * scene là *hậu quả*; gộp hai thứ nghĩa là mọi nước hợp lệ đều phải dựng sẵn một scene
 * ngay cả khi người chơi chỉ đang rê chuột qua để xem, và một bàn Chomp $6\times6$ có
 * $36$ nước.
 *
 * `command` là đường áp mặc định (lối A): nó phải có thật trong registry của engine
 * chủ, nên nước đi thừa hưởng nguyên vẹn tính thuần và replay được mà `Command` khai ở
 * trên — cùng thứ mà undo/redo, log soạn bài và ghi ván (GM-04) đều đứng lên. Vắng
 * `command` nghĩa là bài này dùng lối B (script tự trả scene), và lúc ấy phiên chơi
 * đòi thêm mấy cổng mà lối A không cần — xem `play.ts`.
 */
export interface Move {
  /**
   * Danh tính của nước đi **trong thế hiện tại**.
   *
   * Không bền qua các thế, và không cần bền: ghi ván lại (GM-04) là ghi *dãy* nước
   * theo thứ tự, nên mỗi id chỉ phải phân biệt được với các nước cùng thế. Bắt nó bền
   * toàn ván là đòi một thứ mà Chomp không có — sau một nhát ăn thì nửa bàn biến mất.
   */
  readonly id: string;
  readonly label: string;
  /** Lối A: lệnh áp nước. Vắng ⇒ lối B, phiên chơi hỏi script. */
  readonly command?: Command;
  /**
   * Element mà nước này đụng tới.
   *
   * Đây là chỗ nối vào hit-test: chạm một element ⇒ lọc lấy những nước có nó trong
   * `targets`. Nhờ vậy "chọn nước hợp lệ trực tiếp trên hình" không cần một lớp toạ độ
   * thứ hai — nó dùng đúng `HitTest` mà engine đã có.
   */
  readonly targets: readonly string[];
}
