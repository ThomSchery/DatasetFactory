import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { Annotation, BBox, Category } from "../../api";
import { Button } from "../../components/common/Button";
import { GroupedOptionList } from "../../components/common/GroupedOptionList";
import { isOverlayPanPointerDown } from "../../components/common/RegionOverlay";
import { StatusBadge } from "../../components/common/StatusBadge";
import { TextField } from "../../components/common/TextField";
import { copyOptionGroups } from "./copySelection";
import { geometryDraft, parseGeometryDraft, type GeometryDraft } from "./geometryForm";

const GEOMETRY_FIELDS = ["x", "y", "width", "height"] as const;
const VIEWPORT_ROOM_PROPERTY = "--df-annotation-popover-viewport-room";

/**
 * Marks the panel root for screen-level keyboard handlers.
 *
 * The frame editor binds `Enter` to committing a geometry preview, and every
 * button inside this panel already means something else by `Enter`. An explicit
 * attribute — the same contract `GroupedOptionList` uses for its shortcut scope
 * — says so without making a CSS class name load-bearing.
 */
export const ANNOTATION_POPOVER_SCOPE_ATTRIBUTE = "data-annotation-popover";

interface AnnotationPopoverProps {
  annotation: Annotation;
  busyKey: string | null;
  categories: readonly Category[];
  disabled: boolean;
  draft?: boolean;
  drawing: boolean;
  frameSize: { height: number; width: number };
  geometryPreview: BBox | null;
  invalid: boolean;
  onCategoryChange: (categoryId: string) => void;
  onClose: () => void;
  onDelete: () => void;
  onGeometryChange: (bbox: BBox) => void;
  onToggleDrawTarget: () => void;
}

interface FormState {
  categoryBaselineId: string;
  categoryId: string;
  draft: GeometryDraft;
  geometryBaseline: GeometryDraft;
  geometryError: string | null;
}

/** The geometry the panel is about: the unsaved preview when one exists. */
type EffectiveGeometry = Pick<Annotation, "height" | "width" | "x" | "y">;

function initialFormState(categoryId: string, geometry: EffectiveGeometry): FormState {
  const baseline = geometryDraft(geometry);
  return {
    categoryBaselineId: categoryId,
    categoryId,
    draft: baseline,
    geometryBaseline: baseline,
    geometryError: null,
  };
}

function syncFormState(
  current: FormState,
  categoryId: string,
  geometry: EffectiveGeometry,
  frameSize: { height: number; width: number },
): FormState {
  const nextGeometryBaseline = geometryDraft(geometry);
  const nextDraft = { ...current.draft };

  for (const field of GEOMETRY_FIELDS) {
    if (current.draft[field] === current.geometryBaseline[field]) {
      nextDraft[field] = nextGeometryBaseline[field];
    }
  }

  const categoryClean = current.categoryId === current.categoryBaselineId;
  return {
    categoryBaselineId: categoryId,
    categoryId: categoryClean ? categoryId : current.categoryId,
    draft: nextDraft,
    geometryBaseline: nextGeometryBaseline,
    geometryError:
      current.geometryError === null
        ? null
        : parseGeometryDraft(nextDraft, frameSize).error,
  };
}

export function AnnotationPopover({
  annotation,
  busyKey,
  categories,
  disabled,
  draft = false,
  drawing,
  frameSize,
  geometryPreview,
  invalid,
  onCategoryChange,
  onClose,
  onDelete,
  onGeometryChange,
  onToggleDrawTarget,
}: AnnotationPopoverProps) {
  const categoryName = categories.find((category) => category.id === annotation.category_id)?.name ?? annotation.category_id;
  /*
   * One geometry, three consumers. `geometryPreview` used to exist only between
   * `onShapeChange` and `onShapeChangeEnd` of a single mouse gesture; keyboard
   * nudging turned it into a state the operator sits in for as long as they
   * like. Feeding the baseline, the fields and the save button from the same
   * value is what removes the split where the panel showed one number and the
   * PATCH carried another.
   */
  const effectiveGeometry: EffectiveGeometry = geometryPreview ?? annotation;
  const [form, setForm] = useState<FormState>(() =>
    initialFormState(annotation.category_id, effectiveGeometry),
  );
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const classGroups = useMemo(() => copyOptionGroups(categories), [categories]);

  useLayoutEffect(() => {
    const popover = popoverRef.current;
    if (popover === null) {
      return;
    }

    const updateViewportRoom = () => {
      const availableHeight = Math.max(
        0,
        Math.floor(window.innerHeight - popover.getBoundingClientRect().top),
      );
      const nextValue = `${String(availableHeight)}px`;
      if (popover.style.getPropertyValue(VIEWPORT_ROOM_PROPERTY) !== nextValue) {
        popover.style.setProperty(VIEWPORT_ROOM_PROPERTY, nextValue);
      }
    };

    updateViewportRoom();
    window.addEventListener("resize", updateViewportRoom);
    window.addEventListener("scroll", updateViewportRoom, { passive: true });

    // The panel follows RegionOverlay in the preview grid. Its available room
    // therefore changes when the responsive canvas changes size; observing the
    // canvas (never the constrained panel itself) keeps the measurement
    // current without creating a resize feedback loop.
    const overlay = popover.previousElementSibling;
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateViewportRoom);
    if (observer !== null && overlay instanceof Element) {
      observer.observe(overlay);
    }

    return () => {
      window.removeEventListener("resize", updateViewportRoom);
      window.removeEventListener("scroll", updateViewportRoom);
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    setForm((current) =>
      syncFormState(current, annotation.category_id, effectiveGeometry, frameSize),
    );
  }, [
    annotation.category_id,
    effectiveGeometry.height,
    effectiveGeometry.width,
    effectiveGeometry.x,
    effectiveGeometry.y,
    frameSize.height,
    frameSize.width,
  ]);

  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    function handleOutsidePointerDown(event: Event): void {
      const popover = popoverRef.current;
      const target = event.target;
      if (popover === null || !(target instanceof Node)) {
        return;
      }
      if (popover.contains(target)) {
        return;
      }
      // Panning is a view-only gesture. RegionOverlay marks the exact native
      // pointerdown before it bubbles here so the panel and its unsaved
      // geometry preview survive without weakening ordinary outside-dismiss.
      if (isOverlayPanPointerDown(event)) {
        return;
      }
      // The bbox this popover edits is not "outside" it. Without this, the
      // first pixel of a drag on the edited box — or on an unsaved one —
      // would abandon it halfway through the gesture.
      if (
        target instanceof Element &&
        target.closest("[data-overlay-shape-id]")?.getAttribute("data-overlay-shape-id") ===
          annotation.id
      ) {
        return;
      }
      if (
        target instanceof Element &&
        (target
          .closest("[data-annotation-selection-target]")
          ?.getAttribute("data-annotation-selection-target") === annotation.id ||
          target.closest("[data-preserve-annotation-preview]") !== null)
      ) {
        return;
      }
      closeRef.current();
    }

    /*
     * Bubble phase on the document, and deliberately no `preventDefault` or
     * `stopPropagation`. React delegates to the root container, which sits
     * below `document`, so the drawing surface has already begun its gesture
     * by the time this runs: closing the popover is a second effect of the
     * same `pointerdown`, never a replacement for it. `pointerdown` rather
     * than `click`, because the click that ends the drawing gesture arrives
     * after this popover exists and would close it on sight.
     */
    document.addEventListener("pointerdown", handleOutsidePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointerDown);
    };
  }, [annotation.id]);

  function saveCategory(categoryId: string): void {
    if (categoryId === "") {
      return;
    }
    if (!draft && categoryId === annotation.category_id) {
      onClose();
      return;
    }
    onCategoryChange(categoryId);
  }

  return (
    <div
      aria-label={draft ? "Wybierz klasę dla nowego bbox" : `Edytuj anotację ${categoryName}`}
      className="df-annotation-popover"
      data-annotation-popover="panel"
      ref={popoverRef}
      role="dialog"
    >
      <header className="df-annotation-popover__header">
        <strong>{draft ? "Nowa anotacja · box" : "Anotacja"}</strong>
        <span className="df-annotation-popover__badges">
          <StatusBadge srLabel="Źródło:" tone={annotation.source === "ocr" ? "brand" : "success"}>
            {annotation.source === "ocr" ? "OCR" : "Ręczna"}
          </StatusBadge>
          {annotation.source === "ocr" && annotation.confidence !== null ? (
            <StatusBadge srLabel="Confidence OCR:" tone="neutral">
              {Math.round(annotation.confidence * 100)}%
            </StatusBadge>
          ) : null}
        </span>
      </header>

      <GroupedOptionList
        autoFocus
        disabled={disabled}
        emptyMessage={
          draft
            ? "Brak takiej klasy w profilu. Wybierz istniejącą klasę albo porzuć box."
            : "Brak takiej klasy w profilu. Wybierz istniejącą klasę."
        }
        filterLabel="Klasa"
        groups={classGroups}
        key={annotation.id}
        label="Klasy profilu"
        mode="single"
        onChange={(selection) => {
          setForm((current) => ({ ...current, categoryId: selection[0] ?? "" }));
        }}
        onConfirm={(selection) => {
          saveCategory(selection[0] ?? "");
        }}
        selectedIds={form.categoryId === "" ? [] : [form.categoryId]}
      />

      <div className="df-annotation-popover__actions">
        <Button disabled={disabled} loading={busyKey === `delete:${annotation.id}`} onClick={onDelete} size="sm" variant="muted">
          {draft ? "Porzuć box" : "Usuń"}
        </Button>
        <Button
          aria-label="Zapisz klasę"
          disabled={disabled || form.categoryId === ""}
          loading={draft ? busyKey === "create" : busyKey === `category:${annotation.id}`}
          onClick={() => {
            saveCategory(form.categoryId);
          }}
          size="sm"
        >
          Zapisz <kbd>Enter</kbd>
        </Button>
      </div>

      {geometryPreview === null ? null : (
        <p className="df-annotation-popover__unsaved">
          <StatusBadge srLabel="Stan geometrii:" tone="warning">
            Niezapisane
          </StatusBadge>
          <span>
            Przesunięcie bboxa nie jest jeszcze zapisane. Naciśnij <kbd>Enter</kbd>, aby je zapisać.
          </span>
        </p>
      )}

      <details
        className="df-annotation-popover__geometry"
        open={invalid || undefined}
      >
        <summary>
          x {form.draft.x} · y {form.draft.y} · w {form.draft.width} · h {form.draft.height}
        </summary>
        <div className="df-annotation-popover__geometry-fields">
          {GEOMETRY_FIELDS.map((field) => (
            <TextField
              disabled={disabled}
              inputMode="numeric"
              key={field}
              label={field}
              onChange={(event) => {
                setForm((current) => ({
                  ...current,
                  draft: { ...current.draft, [field]: event.target.value },
                  geometryError: null,
                }));
              }}
              type="number"
              value={form.draft[field]}
              width="short"
            />
          ))}
        </div>
        {invalid ? <p className="df-review-annotations__invalid">Boks poza granicami klatki. Popraw jego geometrię.</p> : null}
        {form.geometryError === null ? null : <p className="df-review-annotations__invalid" role="alert">{form.geometryError}</p>}
        <div className="df-annotation-popover__actions">
          <Button
            disabled={disabled}
            loading={busyKey === `geometry:${annotation.id}`}
            onClick={() => {
              const parsed = parseGeometryDraft(form.draft, frameSize);
              setForm((current) => ({ ...current, geometryError: parsed.error }));
              if (parsed.bbox !== null) {
                onGeometryChange(parsed.bbox);
              }
            }}
            size="sm"
            variant="secondary"
          >
            Zapisz geometrię
          </Button>
          <Button disabled={disabled} onClick={onToggleDrawTarget} size="sm" variant={drawing ? "primary" : "secondary"}>
            {drawing ? "Anuluj przerysowanie" : "Przerysuj bbox"}
          </Button>
        </div>
      </details>
    </div>
  );
}
