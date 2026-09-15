import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

import { Button } from "../Button/Button";

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
import { markOverlayPanPointerDown } from "./panIntent";
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
  /** `brand` is editable, `draft` unsaved, `muted` read-only, `error` invalid geometry. */
  tone?: "brand" | "draft" | "muted" | "error";
}

export interface RegionOverlayProps {
  /** Optional visual identifier pinned inside the picture; never participates in hit testing. */
  cornerLabel?: ReactNode;
  /** Disables drawing, selection and removal without unmounting the picture. */
  disabled?: boolean;
  imageAlt: string;
  /** Opaque asset URL from the API layer. Never a filesystem path. */
  imageUrl: string;
  /** `draw` lets a drag start over an existing shape; `select` preserves F3 selection. */
  interactionMode?: "select" | "draw";
  /** Accessible name of the set of rectangles. */
  label: string;
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

interface ViewTransform {
  scale: number;
  x: number;
  y: number;
}

interface ShapeContextMenu {
  left: number;
  shapeId: string;
  top: number;
}

interface PanGesture {
  buttonMask: number;
  originClient: SourcePoint;
  originView: ViewTransform;
  pointerId: number;
}

const FIT_VIEW: ViewTransform = { scale: 1, x: 0, y: 0 };
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.25;
const SPACE_INTERACTION_OWNER_SELECTOR = [
  "button",
  "input",
  "select",
  "summary",
  "textarea",
  '[contenteditable]:not([contenteditable="false"])',
  "[data-shortcut-scope]",
].join(", ");

type SpaceTargetIntent = "activation" | "editing" | "pan";

/** Resolves who owns Space before the global canvas shortcut can act on it. */
function spaceTargetIntent(event: globalThis.KeyboardEvent): SpaceTargetIntent {
  const target = event.target;
  const owner =
    target instanceof Element ? target.closest(SPACE_INTERACTION_OWNER_SELECTOR) : null;
  if (
    owner instanceof HTMLInputElement ||
    owner instanceof HTMLSelectElement ||
    owner instanceof HTMLTextAreaElement ||
    (owner instanceof HTMLElement && owner.isContentEditable)
  ) {
    return "editing";
  }
  if (owner !== null || event.defaultPrevented) {
    return "activation";
  }
  return "pan";
}

function rounded(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clampPan(
  point: SourcePoint,
  scale: number,
  viewport: { width: number; height: number },
): SourcePoint {
  if (scale <= 1 || viewport.width <= 0 || viewport.height <= 0) {
    return { x: 0, y: 0 };
  }
  return {
    x: rounded(Math.min(0, Math.max(viewport.width * (1 - scale), point.x))),
    y: rounded(Math.min(0, Math.max(viewport.height * (1 - scale), point.y))),
  };
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
  cornerLabel,
  disabled = false,
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
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<SVGSVGElement | null>(null);
  const optionRefs = useRef(new Map<string, SVGGElement>());
  const suppressCapturedClickRef = useRef(false);
  const pointerInsideRef = useRef(false);
  const spacePressedRef = useRef(false);
  const spaceUsedForPanRef = useRef(false);
  const panGestureRef = useRef<PanGesture | null>(null);
  const previousSelectedIdRef = useRef(selectedId);
  const viewRef = useRef<ViewTransform>(FIT_VIEW);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [manipulation, setManipulation] = useState<Manipulation | null>(null);
  const [cursorPoint, setCursorPoint] = useState<SourcePoint | null>(null);
  const [panMode, setPanMode] = useState(false);
  const [spacePressed, setSpacePressed] = useState(false);
  const [panning, setPanning] = useState(false);
  const [view, setView] = useState<ViewTransform>(FIT_VIEW);
  const [contextMenu, setContextMenu] = useState<ShapeContextMenu | null>(null);

  const canDraw = onDraw !== undefined && !disabled && source !== null;
  const canInteract = !disabled;
  const canEditShapes =
    onShapeChange !== undefined && onShapeChangeEnd !== undefined && canInteract && source !== null;
  const canGuide = canDraw || canEditShapes;

  function updateView(next: ViewTransform): void {
    viewRef.current = next;
    setView(next);
  }

  function finishPanGesture(suppressClick: boolean): boolean {
    const gesture = panGestureRef.current;
    if (gesture === null) {
      setPanning(false);
      return false;
    }
    // Relinquish ownership before asking the browser to release capture.
    // `releasePointerCapture` may synchronously emit `lostpointercapture`; that
    // reentrant handler must observe an already-finished gesture.
    panGestureRef.current = null;
    setPanning(false);
    suppressCapturedClickRef.current = suppressClick;
    if (surfaceRef.current !== null) {
      capturePointer(surfaceRef.current, gesture.pointerId, false);
    }
    return true;
  }

  function invalidatePanInteraction(): void {
    setPanMode(false);
    finishPanGesture(true);
  }

  function resetView(): void {
    invalidatePanInteraction();
    updateView(FIT_VIEW);
  }

  function zoomAtViewportCenter(direction: "in" | "out"): void {
    const viewport = viewportRef.current;
    if (viewport === null) {
      return;
    }
    const bounds = viewport.getBoundingClientRect();
    applyZoom(
      direction === "in" ? viewRef.current.scale * ZOOM_STEP : viewRef.current.scale / ZOOM_STEP,
      { x: bounds.width / 2, y: bounds.height / 2 },
      bounds,
    );
  }

  function applyZoom(
    requestedScale: number,
    anchor: SourcePoint,
    bounds: { width: number; height: number },
  ): void {
    const current = viewRef.current;
    const scale = rounded(Math.min(MAX_ZOOM, Math.max(1, requestedScale)));
    if (scale === current.scale) {
      return;
    }
    if (scale === 1) {
      resetView();
      return;
    }
    const contentPoint = {
      x: (anchor.x - current.x) / current.scale,
      y: (anchor.y - current.y) / current.scale,
    };
    const pan = clampPan(
      {
        x: anchor.x - contentPoint.x * scale,
        y: anchor.y - contentPoint.y * scale,
      },
      scale,
      bounds,
    );
    updateView({ scale, ...pan });
  }

  useLayoutEffect(() => {
    if (previousSelectedIdRef.current === selectedId) {
      return;
    }
    previousSelectedIdRef.current = selectedId;
    invalidatePanInteraction();
  }, [selectedId]);

  useEffect(() => {
    resetView();
  }, [imageUrl, source?.height, source?.width]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (surface === null || source === null) {
      return;
    }
    const handleWheel = (event: globalThis.WheelEvent) => {
      if (!event.ctrlKey || event.deltaY === 0) {
        return;
      }
      const viewport = viewportRef.current;
      if (viewport === null) {
        return;
      }
      const bounds = viewport.getBoundingClientRect();
      const requested =
        event.deltaY < 0
          ? viewRef.current.scale * ZOOM_STEP
          : event.deltaY > 0
            ? viewRef.current.scale / ZOOM_STEP
            : viewRef.current.scale;
      const scale = rounded(Math.min(MAX_ZOOM, Math.max(1, requested)));
      if (scale === viewRef.current.scale) {
        return;
      }
      event.preventDefault();
      const anchor = {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      };
      applyZoom(scale, anchor, bounds);
    };
    surface.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      surface.removeEventListener("wheel", handleWheel);
    };
  }, [source]);

  useLayoutEffect(() => {
    const menu = contextMenuRef.current;
    const viewport = viewportRef.current;
    if (contextMenu === null || menu === null || viewport === null) {
      return;
    }
    const menuBounds = menu.getBoundingClientRect();
    const viewportBounds = viewport.getBoundingClientRect();
    const left = Math.max(0, Math.min(contextMenu.left, viewportBounds.width - menuBounds.width));
    const top = Math.max(0, Math.min(contextMenu.top, viewportBounds.height - menuBounds.height));
    if (left !== contextMenu.left || top !== contextMenu.top) {
      setContextMenu({ ...contextMenu, left, top });
      return;
    }
    menu.querySelector<HTMLButtonElement>("[role='menuitem']")?.focus();
  }, [contextMenu]);

  useEffect(() => {
    if (contextMenu === null) {
      return;
    }
    const closeOnOutsidePointer = (event: globalThis.PointerEvent) => {
      if (event.target instanceof Node && !contextMenuRef.current?.contains(event.target)) {
        setContextMenu(null);
      }
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setContextMenu(null);
      }
    };
    const closeOnBlur = () => {
      setContextMenu(null);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("blur", closeOnBlur);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("blur", closeOnBlur);
    };
  }, [contextMenu]);

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.code !== "Space" && event.key !== " ") {
        return;
      }
      const targetIntent = spaceTargetIntent(event);
      if (targetIntent === "editing") {
        return;
      }
      if (!spacePressedRef.current) {
        spaceUsedForPanRef.current = false;
      }
      spacePressedRef.current = true;
      // Once this physical Space has armed a pan, it owns every later repeat of
      // the same hold. Auto-repeat keeps firing while the key is down, and the
      // natural release order — left button up, then Space — can drop the
      // pointer past the canvas edge before the key is up. Keep consuming those
      // repeats through keyup/blur so the document cannot scroll mid-hold,
      // regardless of where `pointerInsideRef` currently points.
      if (event.repeat && spaceUsedForPanRef.current) {
        event.preventDefault();
      }
      if (pointerInsideRef.current) {
        if (targetIntent === "pan") {
          event.preventDefault();
        }
        setSpacePressed(true);
      }
    };
    const releaseSpace = (event?: globalThis.KeyboardEvent) => {
      if (event !== undefined && event.code !== "Space" && event.key !== " ") {
        return;
      }
      const usedForPan = spaceUsedForPanRef.current;
      spacePressedRef.current = false;
      spaceUsedForPanRef.current = false;
      setSpacePressed(false);
      if (event !== undefined && usedForPan) {
        event.preventDefault();
      }
    };
    const handleBlur = () => {
      releaseSpace();
      invalidatePanInteraction();
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", releaseSpace);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", releaseSpace);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  useEffect(() => {
    const constrainView = () => {
      const viewport = viewportRef.current;
      const current = viewRef.current;
      if (viewport === null || current.scale === 1) {
        return;
      }
      const pan = clampPan(current, current.scale, viewport.getBoundingClientRect());
      if (pan.x !== current.x || pan.y !== current.y) {
        updateView({ ...current, ...pan });
      }
    };
    window.addEventListener("resize", constrainView);
    return () => {
      window.removeEventListener("resize", constrainView);
    };
  }, []);

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
    const wantsSpacePan = event.button === 0 && spacePressedRef.current;
    const wantsHandPan = event.button === 0 && panMode && viewRef.current.scale > 1;
    const wantsPan = event.button === 1 || wantsSpacePan || wantsHandPan;
    if (wantsPan) {
      markOverlayPanPointerDown(event.nativeEvent);
      event.preventDefault();
      if (wantsSpacePan) {
        spaceUsedForPanRef.current = true;
      }
      panGestureRef.current = {
        buttonMask: event.button === 1 ? 4 : 1,
        originClient: { x: event.clientX, y: event.clientY },
        originView: viewRef.current,
        pointerId: event.pointerId,
      };
      setPanning(true);
      if (surfaceRef.current !== null) {
        capturePointer(surfaceRef.current, event.pointerId, true);
      }
      return;
    }
    if (event.button !== 0) {
      return;
    }
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
    const point = pointFrom(event);
    setCursorPoint(canGuide ? point : null);
    const panGesture = panGestureRef.current;
    if (panGesture !== null && panGesture.pointerId === event.pointerId) {
      // `buttons` reflects the physical buttons still held during pointermove.
      // If the initiating button disappeared without an observed end event,
      // terminate the orphaned epoch rather than trusting stale coordinates.
      if ((event.buttons & panGesture.buttonMask) === 0) {
        finishPanGesture(true);
        return;
      }
      const viewport = viewportRef.current;
      if (viewport !== null) {
        const pan = clampPan(
          {
            x: panGesture.originView.x + event.clientX - panGesture.originClient.x,
            y: panGesture.originView.y + event.clientY - panGesture.originClient.y,
          },
          panGesture.originView.scale,
          viewport.getBoundingClientRect(),
        );
        updateView({ ...panGesture.originView, ...pan });
      }
      return;
    }
    if (manipulation !== null) {
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
    if (point !== null) {
      setDraft({ ...draft, current: point });
    }
  }

  function handlePointerUp(event: PointerEvent<SVGSVGElement>) {
    if (panGestureRef.current?.pointerId === event.pointerId) {
      finishPanGesture(true);
      return;
    }
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

  function openShapeContextMenu(shapeId: string, clientX: number, clientY: number): void {
    const viewport = viewportRef.current;
    if (viewport === null || onRemove === undefined || !canInteract) {
      return;
    }
    const bounds = viewport.getBoundingClientRect();
    setContextMenu({
      left: Math.max(0, clientX - bounds.left),
      shapeId,
      top: Math.max(0, clientY - bounds.top),
    });
  }

  function handleShapeContextMenu(event: MouseEvent<SVGGElement>, shape: OverlayShape): void {
    if (onRemove === undefined || !canInteract) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    openShapeContextMenu(shape.id, event.clientX, event.clientY);
  }

  function closeContextMenuOnFocusExit(event: FocusEvent<HTMLDivElement>): void {
    if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
      setContextMenu(null);
    }
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
        if ((event.shiftKey && event.key === "F10") || event.key === "ContextMenu") {
          event.preventDefault();
          const bounds = event.currentTarget.getBoundingClientRect();
          openShapeContextMenu(
            shape.id,
            bounds.left + bounds.width / 2,
            bounds.top + bounds.height / 2,
          );
        }
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
    spacePressed || panMode ? "df-region-overlay__surface--pan-ready" : null,
    panning ? "df-region-overlay__surface--panning" : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className="df-region-overlay"
      data-disabled={disabled || undefined}
      data-interaction-mode={interactionMode}
      data-pan-mode={panMode || undefined}
      data-panning={panning || undefined}
      data-zoomed={view.scale > 1 || undefined}
      ref={viewportRef}
    >
      <div
        className="df-region-overlay__zoom-stage"
        data-overlay-zoom-stage="true"
        style={
          {
            "--df-overlay-inverse-zoom": String(1 / view.scale),
            transform: `translate(${String(view.x)}px, ${String(view.y)}px) scale(${String(view.scale)})`,
          } as CSSProperties
        }
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
          onPointerCancel={(event) => {
            if (panGestureRef.current?.pointerId === event.pointerId) {
              finishPanGesture(false);
              return;
            }
            if (manipulation !== null) {
              onShapeChange?.(manipulation.shapeId, manipulation.originRect);
              onShapeChangeCancel?.(manipulation.shapeId);
            }
            setManipulation(null);
            setDraft(null);
            setCursorPoint(null);
            suppressCapturedClickRef.current = false;
          }}
          onLostPointerCapture={(event) => {
            if (panGestureRef.current?.pointerId === event.pointerId) {
              finishPanGesture(true);
            }
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
          onPointerEnter={() => {
            pointerInsideRef.current = true;
            if (spacePressedRef.current) {
              setSpacePressed(true);
            }
          }}
          onPointerLeave={() => {
            pointerInsideRef.current = false;
            setSpacePressed(false);
            setCursorPoint(null);
          }}
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
              onContextMenu={handleShapeContextMenu}
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
              zoom={view.scale}
            />
          ))}
          {!canGuide || panMode || cursorPoint === null ? null : (
            <g
              aria-hidden="true"
              className="df-region-overlay__crosshair"
              data-overlay-crosshair="true"
            >
              <line
                className="df-region-overlay__crosshair-line"
                x1={cursorPoint.x}
                x2={cursorPoint.x}
                y1={0}
                y2={source.height}
              />
              <line
                className="df-region-overlay__crosshair-line"
                x1={0}
                x2={source.width}
                y1={cursorPoint.y}
                y2={cursorPoint.y}
              />
            </g>
          )}
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
        </>
      )}
      </div>
      {cornerLabel === undefined ? null : (
        <span aria-hidden="true" className="df-region-overlay__corner-label">
          {cornerLabel}
        </span>
      )}
      {source === null ? null : (
        <div className="df-region-overlay__zoom-controls" data-preserve-annotation-preview="true">
          <Button
            aria-label="Pomniejsz kanwę"
            disabled={view.scale <= 1}
            onClick={() => {
              zoomAtViewportCenter("out");
            }}
            size="sm"
            variant="muted"
          >
            −
          </Button>
          <output aria-label="Powiększenie kanwy" className="df-region-overlay__zoom-value">
            {String(Math.round(view.scale * 100))}%
          </output>
          <Button
            aria-label="Powiększ kanwę"
            disabled={view.scale >= MAX_ZOOM}
            onClick={() => {
              zoomAtViewportCenter("in");
            }}
            size="sm"
            variant="muted"
          >
            +
          </Button>
          <Button
            aria-pressed={panMode}
            disabled={view.scale === 1}
            onClick={() => {
              setPanMode((current) => !current);
            }}
            size="sm"
            variant={panMode ? "primary" : "muted"}
          >
            {panMode ? "Zakończ przesuwanie" : "Przesuwaj kadr"}
          </Button>
          <Button
            aria-label="Dopasuj kanwę do widoku"
            disabled={view.scale === 1}
            onClick={resetView}
            size="sm"
            variant="muted"
          >
            RESET
          </Button>
        </div>
      )}
      {contextMenu === null ? null : (
        <div
          aria-label="Akcje bboxa"
          className="df-region-overlay__context-menu"
          data-preserve-annotation-preview="true"
          onBlur={closeContextMenuOnFocusExit}
          ref={contextMenuRef}
          role="menu"
          style={{ left: contextMenu.left, top: contextMenu.top }}
        >
          <Button
            onClick={() => {
              const shapeId = contextMenu.shapeId;
              setContextMenu(null);
              onRemove?.(shapeId);
            }}
            role="menuitem"
            size="sm"
            variant="muted"
          >
            Usuń
          </Button>
        </div>
      )}
    </div>
  );
}

interface ShapeOptionProps {
  editable: boolean;
  index: number;
  onKeyDown: (event: KeyboardEvent<SVGGElement>, shape: OverlayShape, index: number) => void;
  onContextMenu: (event: MouseEvent<SVGGElement>, shape: OverlayShape) => void;
  refCallback: (element: SVGGElement | null) => void;
  selected: boolean;
  shape: OverlayShape;
  tabbable: boolean;
  zoom: number;
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
  onContextMenu,
  refCallback,
  selected,
  shape,
  tabbable,
  zoom,
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
      onContextMenu={(event) => {
        onContextMenu(event, shape);
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
                  {...handleTargetRect(shape, corner, zoom)}
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
