export {
  command,
  defineCommand,
  other,
  type Command,
  type CommandDef,
  type CommandRegistry,
  type Move,
  type PlayPlayer,
} from './command.js';

export {
  solveGame,
  SOLVER_STATES,
  SOLVER_STATES_MAX,
  SOLVER_EDGES_PER_STATE,
  type SolveOptions,
  type SolveResult,
} from './solve.js';

export {
  createPlay,
  playMove,
  replayPlay,
  resetPlay,
  toDraftSteps,
  undoMove,
  PLAY_LIMIT,
  type DraftStep,
  type PlayMoveRecord,
  type PlayOutcome,
  type PlayRules,
  type PlaySession,
} from './play.js';

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
  createTrail,
  moveTrail,
  positionKey,
  stepTrail,
  trailFull,
  trailRows,
  TRAIL_LIMIT,
  type Trail,
  type TrailEdge,
  type TrailNode,
} from './trail.js';

export {
  applySelection,
  modeFromEvent,
  EMPTY_SELECTION,
  type Selection,
  type SelectMode,
} from './selection.js';

export { type HitTest, type ScenePoint } from './hit-test.js';

export {
  SELECT_TOOL,
  type SandboxTool,
  type SandboxToolsFn,
  type ToolAction,
} from './tool.js';
