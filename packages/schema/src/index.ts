export {
  LangString,
  Slug,
  EntityId,
  Point,
  SLUG_PATTERN,
  ENTITY_ID_PATTERN,
  ANCHOR_KEY_PATTERN,
  SEMVER_PATTERN,
} from './common.js';

export {
  GLOBAL_BOUNDS,
  MAX_COLOR_CLASS,
  type EngineBounds,
} from './bounds.js';

export {
  ElementBaseProps,
  defineElement,
  FORBIDDEN_STYLE_KEYS,
} from './element.js';

export { Scene, Viewport, type SceneElement } from './scene.js';
export { Step, EdgeType, Anchor } from './step.js';
export {
  Problem,
  Solution,
  Invariant,
  SandboxConfig,
  ProblemSource,
} from './problem.js';

export {
  parseAnchorMarkup,
  stripAnchorMarkup,
  type AnchorSpan,
} from './anchor-markup.js';

export {
  createEngineRegistry,
  type EngineSchemaFragment,
  type EngineRegistry,
} from './engine-registry.js';

export {
  hasErrors,
  formatIssue,
  type Severity,
  type ValidationIssue,
  type ValidationResult,
} from './issues.js';

export { checkStructure } from './structure.js';
export { createValidator, type Validator } from './validate.js';

/**
 * Phiên bản schema hiện tại.
 *
 * Giữ ở `0.x` cho tới hết M5 — trong giai đoạn 5 bài soạn tay, schema còn phải
 * đổi theo thực tế và việc hứa tương thích lúc này là hứa suông. Freeze lên
 * `1.0.0` là một gate có chủ đích (G-C), đi kèm `combviz migrate`.
 */
export const SCHEMA_VERSION = '0.1.0';
