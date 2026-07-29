export {
  command,
  defineCommand,
  type Command,
  type CommandDef,
  type CommandRegistry,
} from './command.js';

export {
  createEditorState,
  execute,
  undo,
  redo,
  canUndo,
  canRedo,
  reset,
  HISTORY_LIMIT,
  type EditorState,
  type ExecuteResult,
  type HistoryEntry,
} from './history.js';

export { allocateId, allocateIds } from './ids.js';

export {
  applySelection,
  modeFromEvent,
  EMPTY_SELECTION,
  type Selection,
  type SelectMode,
} from './selection.js';

export { type HitTest, type ScenePoint } from './hit-test.js';
