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
  strokeForClass,
  patternId,
  patternDefs,
  highlightAttrs,
  type RenderContext,
  type ContextOptions,
} from './context.js';

export { lerpNumber, lerpColor, lerpStructuredString, lerpAttr } from './lerp.js';
export { easeInOutCubic, easingOf, clamp01, type EasingFn } from './easing.js';
export { canonicalStringify, hashString, hashScene } from './hash.js';
export { diffNodes, isEmptyDiff, type NodeDiff } from './diff.js';
export { interpolateNodes } from './interpolate.js';
export { toSvgString, serializeNode, type SerializeOptions } from './serialize.js';
export {
  createRenderer,
  type EngineRenderer,
  type SceneRenderer,
} from './renderer.js';
