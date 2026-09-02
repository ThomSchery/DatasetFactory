import {
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

import {
  clampRectToSource,
  clientPointToSource,
  handleTargetRect,
  isDrawableRect,
  moveRectWithinSource,
  rectFromPoints,
  resizeCornerPoint,
  resizeRectFromCorner,
  smallestRectAtPoint,
  sourceRectsEqual,
  sourceViewBox,
  type ResizeCorner,
  type SourcePoint,
  type SourceRect,
  type SourceSize,
} from "./geometry";
import "./RegionOverlay.css";

export type { SourceRect, SourceSize } from "./geometry";

export interface OverlayShape extends SourceRect {
  /** Extra accessible detail appended after geometry. */
  detailLabel?: string;
  /** Short visible label rendered beside the rectangle. */
  displayLabel?: string;
  id: string;
  /** Human name; the overlay appends the geometry to build the accessible name. */
  label: string;
  /** Presentation-only provenance; gesture geometry never branches on it. */
  sourceKind?: "manual" | "ocr";
  /** `brand` is editable, `muted` read-only, `error` invalid geometry. */
  tone?: "brand" | "muted" | "error";
}

export interface RegionOverlayProps {
  /** Disables drawing, selection and removal without unmounting the picture. */
  disabled?: boolean;
  imageAlt: string;
  /** Opaque asset URL from the API layer. Never a filesystem path. */
  imageUrl: string;
  /** `draw` lets a drag start over an existing shape; `select` preserves F3 selection. */
  interactionMode?: "select" | "draw";
  /** Accessible name of the set of rectangles. */
  label: string;
  /** Interactive HTML rendered in the same positioned box as the image/SVG. */
  floatingLayer?: ReactNode;
  onImageError?: () => void;
  /** Absent means the surface is read-only: existing shapes, no new ones. */
  onDraw?: (rect: SourceRect) => void;
  /** Absent means shapes cannot be removed from the surface. */
  onRemove?: (id: string) => void;
  onSelect?: (id: string) => void;
  /** Live source-pixel geometry while the selected shape is manipulated. */
  onShapeChange?: (id: string, rect: SourceRect) => void;
  /** Final source-pixel geometry after a changed pointer gesture. */
  onShapeChangeEnd?: (id: string, rect: SourceRect) => void;
  /** Reverts a preview when a gesture is cancelled or did not change geometry. */
  onShapeChangeCancel?: (id: string) => void;
  /** Natural dimensions, reported once the browser has decoded the image. */
  onSourceResolved?: (source: SourceSize) => void;
  selectedId?: string | null;
  shapes?: readonly OverlayShape[];
  /**
   * Source pixel dimensions. `null` until they are known — the picture still
   * renders, the drawing surface does not, because without them there is no
   * coordinate system to draw in.
   */
  source: SourceSize | null;
}

interface Draft {
  origin: SourcePoint;
  originShapeId: string | null;
  current: SourcePoint;
}

interface Manipulation {
  corner: ResizeCorner | null;
  currentRect: SourceRect;
  /** Where the grab landed relative to the dragged corner; zero for a move. */
  grabOffset: SourcePoint;
  originPoint: SourcePoint;
  originRect: SourceRect;
  shapeId: string;
}

const RESIZE_CORNERS: readonly ResizeCorner[] = [
  "north-west",
  "north-east",
  "south-west",
  "south-east",
];

function shapeIdFromTarget(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) {
    return null;
  }
  return target.closest("[data-overlay-shape-id]")?.getAttribute("data-overlay-shape-id") ?? null;
}

function resizeCornerFromTarget(target: EventTarget | null): ResizeCorner | null {
  if (!(target instanceof Element)) {
    return null;
  }
  const value = target.closest("[data-overlay-handle]")?.getAttribute("data-overlay-handle");
  return RESIZE_CORNERS.find((corner) => corner === value) ?? null;
}

function pointIsInsideShape(point: SourcePoint, shape: SourceRect): boolean {
  const east = shape.x + Math.max(0, shape.width - 1);
  const south = shape.y + Math.max(0, shape.height - 1);
  return point.x > shape.x && point.x < east && point.y > shape.y && point.y < south;
}

/**
 * Pointer capture keeps a drag alive when it leaves the surface. It is a
 * progressive enhancement: engines without it — jsdom among them — still get a
 * correct rectangle from the events that do arrive, so a rejected capture is
 * not a failure worth propagating.
 */
function capturePointer(surface: SVGSVGElement, pointerId: number, capture: boolean): void {
  if (typeof pointerId !== "number") {
    return;
  }
  try {
    if (capture) {
      surface.setPointerCapture(pointerId);
    } else {
      surface.releasePointerCapture(pointerId);
    }
  } catch {
    // No capture available for this pointer; the drag still works.
  }
}

/**
 * A drawing surface for rectangles in source coordinates, layered over an
 * `<img>`.
 *
 * Three properties are the point of this component, and FE-001-F4 inherits all
 * three for its per-character review boxes:
 *
 *  1. **One `viewBox`, from the natural dimensions.** Shapes are emitted as
 *     source coordinates and rendered unscaled; a resize changes the CSS box
 *     and nothing else. There is no second scaling path to keep in step.
 *  2. **Rectangles are DOM elements**, following the ARIA `listbox`/`option`
 *     pattern with roving tabindex. Tests query them by role, and a keyboard
 *     user reaches every one of them — which matters most exactly where the
 *     mouse is worst, on boxes a dozen pixels wide.
 *  3. **Selecting and removing never require precision.** Arrow keys walk the
 *     set, `Delete` removes the focused shape, and the hit band around each
 *     edge keeps its width in CSS pixels through `vector-effect`.
 */
export function RegionOverlay({
  disabled = false,
  floatingLayer,
  imageAlt,
  imageUrl,
  interactionMode = "select",
  label,
  onDraw,
  onImageError,
  onRemove,
  onSelect,
  onShapeChange,
  onShapeChangeCancel,
  onShapeChangeEnd,
  onSourceResolved,
  selectedId = null,
  shapes = [],
  source,
}: RegionOverlayProps) {
  const surfaceRef = useRef<SVGSVGElement | null>(null);
  const optionRefs = useRef(new Map<string, SVGGElement>());
  const suppressCapturedClickRef = useRef(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [manipulation, setManipulation] = useState<Manipulation | null>(null);

  const canDraw = onDraw !== undefined && !disabled && source !== null;
  const canInteract = !disabled;
  const canEditShapes =
    onShapeChange !== undefined && onShapeChangeEnd !== undefined && canInteract && source !== null;

  function sourcePointAt(clientX: number, clientY: number): SourcePoint | null {
    const surface = surfaceRef.current;
    if (surface === null || source === null) {
      return null;
    }
    const box = surface.getBoundingClientRect();
    return clientPointToSource(
      { x: clientX, y: clientY },
      { left: box.left, top: box.top, width: box.width, height: box.height },
      source,
    );
  }

  function pointFrom(event: PointerEvent<SVGSVGElement>): SourcePoint | null {
    return sourcePointAt(event.clientX, event.clientY);
  }

  function selectShapeAt(clientX: number, clientY: number, fallbackId: string): void {
    const point = sourcePointAt(clientX, clientY);
    const hit = point === null ? undefined : smallestRectAtPoint(shapes, point);
    onSelect?.(hit?.id ?? fallbackId);
  }

  function rectForManipulation(current: Manipulation, point: SourcePoint): SourceRect {
    if (source === null) {
      return current.originRect;
    }
    if (current.corner !== null) {
      // The corner follows the pointer's *travel*, not its position: the first
      // pixel of movement is one pixel of resize however far from the corner
      // the handle was grabbed.
      const draggedCorner = {
        x: point.x - current.grabOffset.x,
        y: point.y - current.grabOffset.y,
      };
      return resizeRectFromCorner(current.originRect, current.corner, draggedCorner, source);
    }
    return moveRectWithinSource(
      current.originRect,
      {
        x: point.x - current.originPoint.x,
        y: point.y - current.originPoint.y,
      },
      source,
    );
  }

  function handlePointerDown(event: PointerEvent<SVGSVGElement>) {
    // If a browser omitted the click after the previous captured gesture, the
    // next physical pointerdown starts a new sequence and must not inherit its
    // deduplication marker.
    suppressCapturedClickRef.current = false;
    const point = pointFrom(event);
    if (canEditShapes && point !== null && selectedId !== null) {
      const targetCorner = resizeCornerFromTarget(event.target);
      const targetId = shapeIdFromTarget(event.target);
      const hitId = smallestRectAtPoint(shapes, point)?.id ?? targetId;
      const editId = targetCorner === null ? hitId : targetId;
      const shape = editId === selectedId ? shapes.find((item) => item.id === editId) : undefined;
      if (shape !== undefined) {
        event.preventDefault();
        // The strict interior belongs to move whatever the DOM was hit. Corner
        // targets no longer reach into it (`handleTargetRect`), so this is the
        // backstop rather than the only thing keeping a small box movable: it
        // still holds if a future target, or a browser's rounding, spills a
        // pixel inwards.
        const corner =
          targetCorner !== null && pointIsInsideShape(point, shape) ? null : targetCorner;
        const originRect: SourceRect = {
          x: shape.x,
          y: shape.y,
          width: shape.width,
          height: shape.height,
        };
        const cornerPoint = corner === null ? point : resizeCornerPoint(originRect, corner);
        setManipulation({
          corner,
          currentRect: originRect,
          grabOffset: { x: point.x - cornerPoint.x, y: point.y - cornerPoint.y },
          originPoint: point,
          originRect,
          shapeId: shape.id,
        });
        if (surfaceRef.current !== null) {
          capturePointer(surfaceRef.current, event.pointerId, true);
        }
        return;
      }
    }
    // Selection mode preserves F3: only the bare surface starts a drawing.
    // Explicit draw mode is for overlapping review boxes, where a drag must be
    // allowed to begin inside a shape. Pointer capture may retarget the later
    // click to the SVG, so the gesture remembers its originating shape.
    if (
      !canDraw ||
      (interactionMode === "select" && event.target !== surfaceRef.current)
    ) {
      return;
    }
    if (point === null) {
      return;
    }
    setDraft({
      origin: point,
      originShapeId: interactionMode === "draw" ? shapeIdFromTarget(event.target) : null,
      current: point,
    });
    if (surfaceRef.current !== null) {
      capturePointer(surfaceRef.current, event.pointerId, true);
    }
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    if (manipulation !== null) {
      const point = pointFrom(event);
      if (point !== null) {
        const currentRect = rectForManipulation(manipulation, point);
        setManipulation({ ...manipulation, currentRect });
        onShapeChange?.(manipulation.shapeId, currentRect);
      }
      return;
    }
    if (draft === null) {
      return;
    }
    const point = pointFrom(event);
    if (point !== null) {
      setDraft({ ...draft, current: point });
    }
  }

  function handlePointerUp(event: PointerEvent<SVGSVGElement>) {
    if (surfaceRef.current !== null) {
      capturePointer(surfaceRef.current, event.pointerId, false);
    }
    if (manipulation !== null) {
      const point = pointFrom(event);
      const rect = point === null ? manipulation.currentRect : rectForManipulation(manipulation, point);
      setManipulation(null);
      suppressCapturedClickRef.current = true;
      if (!sourceRectsEqual(rect, manipulation.originRect) && isDrawableRect(rect)) {
        onShapeChange?.(manipulation.shapeId, rect);
        onShapeChangeEnd?.(manipulation.shapeId, rect);
      } else {
        onShapeChange?.(manipulation.shapeId, manipulation.originRect);
        onShapeChangeCancel?.(manipulation.shapeId);
        selectShapeAt(event.clientX, event.clientY, manipulation.shapeId);
      }
      return;
    }
    if (draft === null || source === null) {
      return;
    }
    const point = pointFrom(event) ?? draft.current;
    const rect = clampRectToSource(rectFromPoints(draft.origin, point), source);
    setDraft(null);
    if (draft.originShapeId !== null) {
      // The browser click following captured pointerup can target either the
      // SVG or the original <g>. Suppress that one click in both cases: a
      // no-drag selection is emitted explicitly below, while a drag is solely
      // a draw operation.
      suppressCapturedClickRef.current = true;
    }
    if (isDrawableRect(rect)) {
      onDraw?.(rect);
    } else if (draft.originShapeId !== null) {
      selectShapeAt(event.clientX, event.clientY, draft.originShapeId);
    }
  }

  function focusShape(index: number) {
    const shape = shapes[index];
    if (shape === undefined) {
      return;
    }
    onSelect?.(shape.id);
    optionRefs.current.get(shape.id)?.focus?.();
  }

  function handleKeyDown(event: KeyboardEvent<SVGGElement>, shape: OverlayShape, index: number) {
    if (!canInteract) {
      return;
    }
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        focusShape(Math.min(index + 1, shapes.length - 1));
        return;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        focusShape(Math.max(index - 1, 0));
        return;
      case "Home":
        event.preventDefault();
        focusShape(0);
        return;
      case "End":
        event.preventDefault();
        focusShape(shapes.length - 1);
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        onSelect?.(shape.id);
        return;
      case "Delete":
      case "Backspace":
        event.preventDefault();
        onRemove?.(shape.id);
        return;
      default:
    }
  }

  const draftRect =
    draft === null || source === null
      ? null
      : clampRectToSource(rectFromPoints(draft.origin, draft.current), source);
  const renderedShapes = shapes.map((shape) =>
    manipulation?.shapeId === shape.id ? { ...shape, ...manipulation.currentRect } : shape,
  );

  const surfaceClasses = [
    "df-region-overlay__surface",
    canDraw ? "df-region-overlay__surface--drawable" : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className="df-region-overlay"
      data-disabled={disabled || undefined}
      data-interaction-mode={interactionMode}
    >
      <img
        alt={imageAlt}
        className="df-region-overlay__image"
        onError={onImageError}
        onLoad={(event) => {
          const image = event.currentTarget;
          onSourceResolved?.({ width: image.naturalWidth, height: image.naturalHeight });
        }}
        src={imageUrl}
      />
      {source === null ? null : (
        <>
        <svg
          aria-label={label}
          className={surfaceClasses}
          onPointerCancel={() => {
            if (manipulation !== null) {
              onShapeChange?.(manipulation.shapeId, manipulation.originRect);
              onShapeChangeCancel?.(manipulation.shapeId);
            }
            setManipulation(null);
            setDraft(null);
            suppressCapturedClickRef.current = false;
          }}
          onClickCapture={(event) => {
            if (suppressCapturedClickRef.current) {
              suppressCapturedClickRef.current = false;
              event.preventDefault();
              event.stopPropagation();
              return;
            }
            const fallbackId = shapeIdFromTarget(event.target);
            if (fallbackId !== null && canInteract) {
              event.preventDefault();
              event.stopPropagation();
              selectShapeAt(event.clientX, event.clientY, fallbackId);
            }
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          // `none` rather than the default `xMidYMid meet`: it makes the map
          // from the rendered box onto the viewBox exactly linear, and that is
          // the map `clientPointToSource` inverts. The element is laid out at
          // the picture's own aspect ratio, so nothing is distorted by it.
          preserveAspectRatio="none"
          ref={surfaceRef}
          role="listbox"
          viewBox={sourceViewBox(source)}
        >
          {renderedShapes.map((shape, index) => (
            <ShapeOption
              editable={canEditShapes && shape.id === selectedId}
              index={index}
              key={shape.id}
              onKeyDown={handleKeyDown}
              refCallback={(element) => {
                if (element === null) {
                  optionRefs.current.delete(shape.id);
                } else {
                  optionRefs.current.set(shape.id, element);
                }
              }}
              selected={shape.id === selectedId}
              shape={shape}
              tabbable={canInteract && (selectedId === null ? index === 0 : shape.id === selectedId)}
            />
          ))}
          {draftRect === null ? null : (
            <rect
              aria-hidden="true"
              className="df-region-overlay__draft"
              height={draftRect.height}
              width={draftRect.width}
              x={draftRect.x}
              y={draftRect.y}
            />
          )}
        </svg>
        <div aria-hidden="true" className="df-region-overlay__labels">
          {renderedShapes.map((shape) =>
            shape.displayLabel === undefined ? null : (
              <span
                className={`df-region-overlay__label df-region-overlay__label--${shape.sourceKind ?? "ocr"}`}
                data-overlay-label-for={shape.id}
                key={shape.id}
                style={
                  {
                    "--df-overlay-label-left": `${(shape.x / source.width) * 100}%`,
                    "--df-overlay-label-top": `${(shape.y / source.height) * 100}%`,
                  } as CSSProperties
                }
              >
                {shape.displayLabel}
              </span>
            ),
          )}
        </div>
        {floatingLayer}
        </>
      )}
    </div>
  );
}

interface ShapeOptionProps {
  editable: boolean;
  index: number;
  onKeyDown: (event: KeyboardEvent<SVGGElement>, shape: OverlayShape, index: number) => void;
  refCallback: (element: SVGGElement | null) => void;
  selected: boolean;
  shape: OverlayShape;
  tabbable: boolean;
}

/** Geometry belongs in the name: a rectangle is not describable by its label alone. */
function shapeName(shape: OverlayShape): string {
  const detail = shape.detailLabel === undefined ? "" : `. ${shape.detailLabel}`;
  return `${shape.label}: x ${shape.x}, y ${shape.y}, szerokość ${shape.width}, wysokość ${shape.height}${detail}`;
}

function ShapeOption({
  editable,
  index,
  onKeyDown,
  refCallback,
  selected,
  shape,
  tabbable,
}: ShapeOptionProps): ReactNode {
  const classes = [
    "df-region-overlay__shape",
    `df-region-overlay__shape--${shape.tone ?? "brand"}`,
    shape.sourceKind === undefined ? null : `df-region-overlay__shape--source-${shape.sourceKind}`,
  ].filter(Boolean).join(" ");

  return (
    <g
      aria-label={shapeName(shape)}
      aria-selected={selected}
      className={classes}
      data-editable={editable || undefined}
      data-overlay-shape-id={shape.id}
      data-selected={selected || undefined}
      onKeyDown={(event) => {
        onKeyDown(event, shape, index);
      }}
      ref={refCallback}
      role="option"
      tabIndex={tabbable ? 0 : -1}
    >
      <rect
        className="df-region-overlay__shape-fill"
        height={shape.height}
        width={shape.width}
        x={shape.x}
        y={shape.y}
      />
      {/* OVERLAY-06 permits an invisible layer that *is* the hit target; what it
          forbids is one that blocks clicks it does not use. This band catches
          only its own stroke, so the bare surface stays free for drawing. */}
      <rect
        className="df-region-overlay__shape-hit"
        height={shape.height}
        width={shape.width}
        x={shape.x}
        y={shape.y}
      />
      {editable
        ? RESIZE_CORNERS.map((corner) => {
            const marker = handleMarker(shape, corner);
            return (
              <g
                aria-hidden="true"
                className="df-region-overlay__shape-handle"
                data-overlay-handle={corner}
                key={corner}
              >
                <rect className="df-region-overlay__shape-handle-visual" {...marker} />
                <rect
                  className="df-region-overlay__shape-handle-hit"
                  {...handleTargetRect(shape, corner)}
                />
              </g>
            );
          })
        : null}
    </g>
  );
}

function handleMarker(shape: OverlayShape, corner: ResizeCorner): SourceRect {
  const east = shape.x + Math.max(0, shape.width - 1);
  const south = shape.y + Math.max(0, shape.height - 1);
  return {
    x: corner.endsWith("east") ? east : shape.x,
    y: corner.startsWith("south") ? south : shape.y,
    width: 1,
    height: 1,
  };
}
