import type { Scene } from '@combviz/schema';
import type { Command, CommandRegistry } from './command.js';

/**
 * Lịch sử undo/redo (ENG-00: ≥ 50 bước).
 *
 * Lưu **snapshot scene đầy đủ**, không lưu lệnh nghịch đảo — cùng lý lẽ với
 * DAT-11: scene bị chặn kích thước bởi NFR-P4 nên snapshot rẻ, còn lệnh nghịch
 * đảo thì mỗi command phải cài thêm một hàm nữa và mỗi hàm đó là một chỗ để sai
 * mà không ai thấy cho tới lúc undo ra sai trạng thái.
 */
export const HISTORY_LIMIT = 60;

export interface HistoryEntry {
  readonly scene: Scene;
  /** Nhãn của lệnh đã dẫn tới scene này. Rỗng ở trạng thái khởi tạo. */
  readonly label: string;
}

export interface EditorState {
  readonly scene: Scene;
  readonly past: readonly HistoryEntry[];
  readonly future: readonly HistoryEntry[];
  /** Nhãn của lệnh vừa thực hiện, để UI hiện "Hoàn tác: đặt domino". */
  readonly lastLabel: string;
}

export function createEditorState(scene: Scene): EditorState {
  return { scene, past: [], future: [], lastLabel: '' };
}

export interface ExecuteResult {
  readonly state: EditorState;
  /** `false` khi lệnh không áp được — UI có thể rung nhẹ thay vì im lặng. */
  readonly applied: boolean;
}

export function execute(
  state: EditorState,
  registry: CommandRegistry,
  cmd: Command,
): ExecuteResult {
  const def = Object.hasOwn(registry, cmd.type) ? registry[cmd.type] : undefined;
  if (!def) return { state, applied: false };

  const next = def.apply(state.scene, cmd.params);
  if (!next) return { state, applied: false };

  const label = def.label(cmd.params, state.scene);
  const past = [...state.past, { scene: state.scene, label: state.lastLabel }];

  return {
    state: {
      scene: next,
      past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past,
      // Làm một việc mới thì nhánh redo cũ mất — đây là hành vi mong đợi ở mọi
      // trình soạn thảo, và giữ lại nó sẽ biến lịch sử thành cây mà không ai hỏi.
      future: [],
      lastLabel: label,
    },
    applied: true,
  };
}

export function undo(state: EditorState): EditorState {
  const previous = state.past[state.past.length - 1];
  if (!previous) return state;

  return {
    scene: previous.scene,
    past: state.past.slice(0, -1),
    future: [{ scene: state.scene, label: state.lastLabel }, ...state.future],
    lastLabel: previous.label,
  };
}

export function redo(state: EditorState): EditorState {
  const next = state.future[0];
  if (!next) return state;

  return {
    scene: next.scene,
    past: [...state.past, { scene: state.scene, label: state.lastLabel }],
    future: state.future.slice(1),
    lastLabel: next.label,
  };
}

export function canUndo(state: EditorState): boolean {
  return state.past.length > 0;
}

export function canRedo(state: EditorState): boolean {
  return state.future.length > 0;
}

/** Đặt lại về một scene mới, xoá lịch sử — dùng khi fork từ Player (PLY-05). */
export function reset(scene: Scene): EditorState {
  return createEditorState(scene);
}
