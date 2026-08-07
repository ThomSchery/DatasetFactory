/*
 * The coordinate transformation, isolated from React and from the DOM.
 *
 * Every rectangle this project stores is expressed in the *source* pixels of
 * the image — `naturalWidth` × `naturalHeight` — never in the pixels the
 * browser happens to be displaying. A region tells the pipeline where to crop,
 * so a coordinate that drifts with the window size would silently offset every
 * crop of every frame of every run made with that profile.
 *
 * The mechanism is a single `viewBox` derived from the natural dimensions:
 * SVG then renders source coordinates directly and no rendering code scales
 * anything. Only pointer input has to cross the boundary, and that is exactly
 * what `clientPointToSource` does — one function, tested on its own rather
 * than through pixels on a screen.
 */

export interface SourceSize {
  width: number;
  height: number;
}

export interface SourcePoint {
  x: number;
  y: number;
}

/** Top-left origin, source pixels — the same shape as TECH_PLAN §4 `BBox`. */
export interface SourceRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The part of a `DOMRect` this module needs, so callers can supply a literal. */
export interface RenderedBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ClientPoint {
  x: number;
  y: number;
}

/**
 * The `viewBox` that makes source coordinates the SVG user unit. Paired with
 * `preserveAspectRatio="none"` this is an exact linear map from the rendered
 * box onto the source, which is precisely the map `clientPointToSource`
 * inverts — the render and the arithmetic cannot disagree.
 */
export function sourceViewBox(source: SourceSize): string {
  return `0 0 ${source.width} ${source.height}`;
}

function clamp(value: number, max: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.min(Math.max(value, 0), max);
}

/**
 * A pointer position in viewport coordinates, expressed in source pixels.
 *
 * `box` is the rendered geometry of the drawing surface. The same click on the
 * same part of the picture yields the same source coordinate whatever `box`
 * measures, which is the property the whole feature rests on.
 *
 * Integers, because `RegionRequest` on the backend is `int` and a fractional
 * pixel has no meaning to a crop.
 */
export function clientPointToSource(
  point: ClientPoint,
  box: RenderedBox,
  source: SourceSize,
): SourcePoint {
  // A surface that has not been laid out yet has no scale to invert.
  if (box.width <= 0 || box.height <= 0) {
    return { x: 0, y: 0 };
  }
  const ratioX = (point.x - box.left) / box.width;
  const ratioY = (point.y - box.top) / box.height;
  return {
    x: Math.round(clamp(ratioX * source.width, source.width)),
    y: Math.round(clamp(ratioY * source.height, source.height)),
  };
}

/** The rectangle spanned by two corners, in any drag direction. */
export function rectFromPoints(origin: SourcePoint, current: SourcePoint): SourceRect {
  return {
    x: Math.min(origin.x, current.x),
    y: Math.min(origin.y, current.y),
    width: Math.abs(current.x - origin.x),
    height: Math.abs(current.y - origin.y),
  };
}

/** Trims a rectangle to the image. Mirrors the backend's `region_out_of_bounds`. */
export function clampRectToSource(rect: SourceRect, source: SourceSize): SourceRect {
  const x = clamp(rect.x, source.width);
  const y = clamp(rect.y, source.height);
  return {
    x,
    y,
    width: clamp(rect.width, source.width - x),
    height: clamp(rect.height, source.height - y),
  };
}

/** Positive width and height. Mirrors `Field(gt=0)` on `RegionRequest`. */
export function isDrawableRect(rect: SourceRect): boolean {
  return rect.width > 0 && rect.height > 0;
}

/**
 * Mirrors `DatasetDefinitionEngine._validate_region`: non-negative origin,
 * positive extent, and the far edge inside the image. The backend runs this
 * check against the real image and its verdict is the one that counts; this
 * copy only spares the user a round trip.
 */
export function fitsInSource(rect: SourceRect, source: SourceSize): boolean {
  return (
    rect.x >= 0 &&
    rect.y >= 0 &&
    isDrawableRect(rect) &&
    rect.x + rect.width <= source.width &&
    rect.y + rect.height <= source.height
  );
}
