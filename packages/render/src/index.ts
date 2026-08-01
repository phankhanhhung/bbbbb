export {
  el,
  keyed,
  text,
  walk,
  collectKeys,
  type SvgNode,
  type AttrValue,
} from './svg-node.js';

export {
  createContext,
  fillForClass,
  inkForClass,
  strokeForClass,
  patternId,
  patternDefs,
  decorationAttrs,
  decorationForAny,
  elementDecoration,
  groupAttrs,
  type RenderContext,
  type ContextOptions,
} from './context.js';

export {
  EMPTY_ATLAS,
  UNITS_PER_EX,
  labelScale,
  lookupLabel,
  labelWidth,
  labelAscent,
  labelDescent,
  placeLabel,
  missingLabel,
  type LabelAtlas,
  type LabelEntry,
  type LabelNode,
  type PlaceOptions,
} from './labels.js';

export {
  CELL_PX,
  UNITS_PER_CELL,
  matchScale,
  PREFERRED_SCALE,
  MAX_CANVAS_VH,
  sceneBoxStyle,
  widestWidth,
  type SceneBoxStyle,
} from './scale.js';

export { estimateTextWidth } from './text.js';
export { nodeBox, nodeCentre, type Box } from './box.js';

export { lerpNumber, lerpColor, lerpStructuredString, lerpAttr } from './lerp.js';
export { easeInOutCubic, easingOf, clamp01, type EasingFn } from './easing.js';
export { canonicalStringify, hashString, hashScene } from './hash.js';
export { diffNodes, isEmptyDiff, type NodeDiff } from './diff.js';
export { interpolateNodes } from './interpolate.js';
export {
  timelineLength,
  phaseProgress,
  activePhases,
  applyChoreography,
  type Phase,
  type Choreography,
  type PositionLookup,
  type BoxLookup,
} from './choreography.js';
export { toSvgString, serializeNode, type SerializeOptions } from './serialize.js';
export { watermarkNodes } from './watermark.js';
export {
  createRenderer,
  type EngineRenderer,
  type SceneRenderer,
  type SceneBox,
} from './renderer.js';
