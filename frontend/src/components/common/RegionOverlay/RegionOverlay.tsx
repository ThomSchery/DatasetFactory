import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

import {
  clampRectToSource,
  clientPointToSource,
  isDrawableRect,
  rectFromPoints,
  sourceViewBox,
  type SourcePoint,
  type SourceRect,
  type SourceSize,
} from "./geometry";
import "./RegionOverlay.css";

export type { SourceRect, SourceSize } from "./geometry";

export interface OverlayShape extends SourceRect {
  id: string;
  /** Human name; the overlay appends the geometry to build the accessible name. */
  label: string;
  /** `brand` is a shape the user owns, `muted` one they only inspect. */
  tone?: "brand" | "muted";
}

export interface RegionOverlayProps {
  /** Disables drawing, selection and removal without unmounting the picture. */
  disabled?: boolean;
  imageAlt: string;
  /** Opaque asset URL from the API layer. Never a filesystem path. */
  imageUrl: string;
  /** Accessible name of the set of rectangles. */
  label: string;
  onImageError?: () => void;
  /** Absent means the surface is read-only: existing shapes, no new ones. */
  onDraw?: (rect: SourceRect) => void;
  /** Absent means shapes cannot be removed from the surface. */
  onRemove?: (id: string) => void;
  onSelect?: (id: string) => void;
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
  current: SourcePoint;
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
  imageAlt,
  imageUrl,
  label,
  onDraw,
  onImageError,
  onRemove,
  onSelect,
  onSourceResolved,
  selectedId = null,
  shapes = [],
  source,
}: RegionOverlayProps) {
  const surfaceRef = useRef<SVGSVGElement | null>(null);
  const optionRefs = useRef(new Map<string, SVGGElement>());
  const [draft, setDraft] = useState<Draft | null>(null);

  const canDraw = onDraw !== undefined && !disabled && source !== null;
  const canInteract = !disabled;

  function pointFrom(event: PointerEvent<SVGSVGElement>): SourcePoint | null {
    const surface = surfaceRef.current;
    if (surface === null || source === null) {
      return null;
    }
    const box = surface.getBoundingClientRect();
    return clientPointToSource(
      { x: event.clientX, y: event.clientY },
      { left: box.left, top: box.top, width: box.width, height: box.height },
      source,
    );
  }

  function handlePointerDown(event: PointerEvent<SVGSVGElement>) {
    // Only the bare surface starts a drawing. A press that lands on an existing
    // shape is a selection, so shapes stay clickable without swallowing drags.
    if (!canDraw || event.target !== surfaceRef.current) {
      return;
    }
    const point = pointFrom(event);
    if (point === null) {
      return;
    }
    setDraft({ origin: point, current: point });
    if (surfaceRef.current !== null) {
      capturePointer(surfaceRef.current, event.pointerId, true);
    }
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    if (draft === null) {
      return;
    }
    const point = pointFrom(event);
    if (point !== null) {
      setDraft({ origin: draft.origin, current: point });
    }
  }

  function handlePointerUp(event: PointerEvent<SVGSVGElement>) {
    if (surfaceRef.current !== null) {
      capturePointer(surfaceRef.current, event.pointerId, false);
    }
    if (draft === null || source === null) {
      return;
    }
    const point = pointFrom(event) ?? draft.current;
    const rect = clampRectToSource(rectFromPoints(draft.origin, point), source);
    setDraft(null);
    // A click that never moved is not a zero-area region, it is not a region.
    if (isDrawableRect(rect)) {
      onDraw?.(rect);
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

  const surfaceClasses = [
    "df-region-overlay__surface",
    canDraw ? "df-region-overlay__surface--drawable" : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="df-region-overlay" data-disabled={disabled || undefined}>
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
        <svg
          aria-label={label}
          className={surfaceClasses}
          onPointerCancel={() => {
            setDraft(null);
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
          {shapes.map((shape, index) => (
            <ShapeOption
              index={index}
              key={shape.id}
              onKeyDown={handleKeyDown}
              onSelect={canInteract ? onSelect : undefined}
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
      )}
    </div>
  );
}

interface ShapeOptionProps {
  index: number;
  onKeyDown: (event: KeyboardEvent<SVGGElement>, shape: OverlayShape, index: number) => void;
  onSelect?: (id: string) => void;
  refCallback: (element: SVGGElement | null) => void;
  selected: boolean;
  shape: OverlayShape;
  tabbable: boolean;
}

/** Geometry belongs in the name: a rectangle is not describable by its label alone. */
function shapeName(shape: OverlayShape): string {
  return `${shape.label}: x ${shape.x}, y ${shape.y}, szerokość ${shape.width}, wysokość ${shape.height}`;
}

function ShapeOption({
  index,
  onKeyDown,
  onSelect,
  refCallback,
  selected,
  shape,
  tabbable,
}: ShapeOptionProps): ReactNode {
  const classes = [
    "df-region-overlay__shape",
    `df-region-overlay__shape--${shape.tone ?? "brand"}`,
  ].join(" ");

  return (
    <g
      aria-label={shapeName(shape)}
      aria-selected={selected}
      className={classes}
      data-selected={selected || undefined}
      onClick={() => {
        onSelect?.(shape.id);
      }}
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
    </g>
  );
}
