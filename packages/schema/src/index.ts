export {
  LangString,
  langValues,
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
export { Step, EdgeType, Anchor, Bijection, Choreography, ChoreographyPhase } from './step.js';
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
  parseValueMarkup,
  renderValueMarkup,
  stripValueMarkup,
  type ValueSpan,
} from './value-markup.js';

export { stripBoldMarkup, toReadableMath, toSearchableText, unhandledMathCommands } from './math-text.js';

export {
  createEngineRegistry,
  type EngineSchemaFragment,
  type EngineRegistry,
  type PlayBlock,
} from './engine-registry.js';

export {
  hasErrors,
  formatIssue,
  type Severity,
  type ValidationIssue,
  type ValidationResult,
} from './issues.js';

export {
  parseValidatorId,
  type SceneValidator,
  type ValidatorOutcome,
} from './validator.js';

export {
  buildTree,
  childrenOf,
  pathTo,
  breadcrumb,
  branchPointAbove,
  nextStep,
  isBranchPoint,
  isClosedBranch,
  isMergeTarget,
  preorder,
  type SolutionTree,
} from './tree.js';

export { checkStructure } from './structure.js';
export { createValidator, type Validator } from './validate.js';
export { SCHEMA_VERSION } from './version.js';
export { formatProblem } from './format.js';
export {
  migrateProblem,
  isReadableVersion,
  MIGRATIONS,
  type Migration,
  type MigrateResult,
} from './migrate.js';

