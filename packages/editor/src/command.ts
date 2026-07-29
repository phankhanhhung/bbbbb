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
