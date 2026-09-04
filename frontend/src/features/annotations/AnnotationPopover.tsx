import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { Annotation, BBox, Category } from "../../api";
import { Button } from "../../components/common/Button";
import { GroupedOptionList } from "../../components/common/GroupedOptionList";
import { StatusBadge } from "../../components/common/StatusBadge";
import { TextField } from "../../components/common/TextField";
import { copyOptionGroups } from "./copySelection";
import { geometryDraft, parseGeometryDraft, type GeometryDraft } from "./geometryForm";
import { resolvePopoverPlacement, sourceBoxToRendered, type PopoverPlacement } from "./popoverPlacement";

const GEOMETRY_FIELDS = ["x", "y", "width", "height"] as const;

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

function initialFormState(annotation: Annotation): FormState {
  const baseline = geometryDraft(annotation);
  return {
    categoryBaselineId: annotation.category_id,
    categoryId: annotation.category_id,
    draft: baseline,
    geometryBaseline: baseline,
    geometryError: null,
  };
}

function syncFormState(
  current: FormState,
  annotation: Annotation,
  frameSize: { height: number; width: number },
): FormState {
  const nextGeometryBaseline = geometryDraft(annotation);
  const nextDraft = { ...current.draft };

  for (const field of GEOMETRY_FIELDS) {
    if (current.draft[field] === current.geometryBaseline[field]) {
      nextDraft[field] = nextGeometryBaseline[field];
    }
  }

  const categoryClean = current.categoryId === current.categoryBaselineId;
  return {
    categoryBaselineId: annotation.category_id,
    categoryId: categoryClean ? annotation.category_id : current.categoryId,
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
  const [form, setForm] = useState<FormState>(() => initialFormState(annotation));
  const [geometryOpen, setGeometryOpen] = useState(false);
  const [placement, setPlacement] = useState<PopoverPlacement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const displayedDraft = geometryPreview === null ? form.draft : geometryDraft(geometryPreview);
  const classGroups = useMemo(() => copyOptionGroups(categories), [categories]);

  useEffect(() => {
    setForm((current) => syncFormState(current, annotation, frameSize));
  }, [
    annotation.category_id,
    annotation.height,
    annotation.width,
    annotation.x,
    annotation.y,
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

  useLayoutEffect(() => {
    const popover = popoverRef.current;
    const container = popover?.parentElement;
    if (popover === null || container == null) {
      return;
    }
    const containerBox = container.getBoundingClientRect();
    const popoverBox = popover.getBoundingClientRect();
    const tokenGap = Number.parseFloat(
      getComputedStyle(container).getPropertyValue("--size-xs"),
    );
    const anchor = sourceBoxToRendered(annotation, frameSize, containerBox);
    const next = resolvePopoverPlacement(
      anchor,
      containerBox,
      { height: popoverBox.height, width: popoverBox.width },
      Number.isFinite(tokenGap) && tokenGap > 0 ? tokenGap : 8,
    );
    setPlacement(next);
  }, [
    annotation.height,
    annotation.width,
    annotation.x,
    annotation.y,
    classGroups,
    frameSize.height,
    frameSize.width,
    geometryOpen,
  ]);

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
      data-side={placement?.side}
      ref={popoverRef}
      role="dialog"
      style={placement === null ? { visibility: "hidden" } : { left: placement.left, top: placement.top }}
    >
      <header className="df-annotation-popover__header">
        <strong>{draft ? "Nowa anotacja · szkic" : "Anotacja"}</strong>
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
            ? "Brak takiej klasy w profilu. Wybierz istniejącą klasę albo porzuć szkic."
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
          {draft ? "Porzuć szkic" : "Usuń"}
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

      <details
        className="df-annotation-popover__geometry"
        open={invalid || undefined}
        onToggle={(event) => {
          setGeometryOpen(event.currentTarget.open);
        }}
      >
        <summary>
          x {displayedDraft.x} · y {displayedDraft.y} · w {displayedDraft.width} · h {displayedDraft.height}
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
              value={displayedDraft[field]}
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
