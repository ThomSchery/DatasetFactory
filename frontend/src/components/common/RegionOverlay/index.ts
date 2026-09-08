export { RegionOverlay } from "./RegionOverlay";
export type { OverlayShape, RegionOverlayProps } from "./RegionOverlay";
export {
  clampRectToSource,
  clientPointToSource,
  fitsInSource,
  isDrawableRect,
  nudgeRect,
  rectFromPoints,
  sourceRectsEqual,
  sourceViewBox,
} from "./geometry";
export type {
  ClientPoint,
  NudgeDirection,
  RenderedBox,
  SourcePoint,
  SourceRect,
  SourceSize,
} from "./geometry";
export { isOverlayPanPointerDown } from "./panIntent";
