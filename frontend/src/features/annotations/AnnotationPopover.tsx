import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  categoryInputFromName,
  isDuplicateCategoryName,
  type Annotation,
  type Category,
  type CategoryInput,
} from "../../api";
import { Button } from "../../components/common/Button";
import { GroupedOptionList } from "../../components/common/GroupedOptionList";
import { isOverlayPanPointerDown } from "../../components/common/RegionOverlay";
import { StatusBadge } from "../../components/common/StatusBadge";
import { InlineError } from "../../components/common/UiStates";
import { copyOptionGroups } from "./copySelection";

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
  categoryError: string | null;
  disabled: boolean;
  draft?: boolean;
  hasUnsavedGeometry: boolean;
  onCategoryChange: (categoryId: string) => void;
  onCategoryFilterChange: () => void;
  onClose: () => void;
  onCreateCategory: (category: CategoryInput) => void;
  onDelete: () => void;
}

interface FormState {
  categoryBaselineId: string;
  categoryId: string;
}

function initialFormState(categoryId: string): FormState {
  return {
    categoryBaselineId: categoryId,
    categoryId,
  };
}

function syncFormState(current: FormState, categoryId: string): FormState {
  const categoryClean = current.categoryId === current.categoryBaselineId;
  return {
    categoryBaselineId: categoryId,
    categoryId: categoryClean ? categoryId : current.categoryId,
  };
}

export function AnnotationPopover({
  annotation,
  busyKey,
  categories,
  categoryError,
  disabled,
  draft = false,
  hasUnsavedGeometry,
  onCategoryChange,
  onCategoryFilterChange,
  onClose,
  onCreateCategory,
  onDelete,
}: AnnotationPopoverProps) {
  const categoryName = categories.find((category) => category.id === annotation.category_id)?.name ?? annotation.category_id;
  const [form, setForm] = useState<FormState>(() => initialFormState(annotation.category_id));
  const [categoryQuery, setCategoryQuery] = useState("");
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const classGroups = useMemo(() => copyOptionGroups(categories), [categories]);
  const proposedCategory = categoryInputFromName(categoryQuery);
  const canCreateCategory =
    proposedCategory !== null &&
    !isDuplicateCategoryName(
      categories.map((category) => category.name),
      proposedCategory.name,
    );

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
    setForm((current) => syncFormState(current, annotation.category_id));
  }, [annotation.category_id]);

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
        filterMaxLength={200}
        filterAction={
          canCreateCategory ? (
            <Button
              aria-label={`Utwórz i przypisz klasę „${proposedCategory.name}”`}
              className="df-annotation-popover__create-class"
              disabled={disabled}
              loading={busyKey === "create-category"}
              loadingLabel="Tworzenie i przypisywanie klasy…"
              onClick={() => {
                onCreateCategory(proposedCategory);
              }}
              size="sm"
              variant="secondary"
            >
              <span>Utwórz i przypisz klasę</span>
              <span aria-hidden="true" className="df-annotation-popover__create-class-name">
                „{proposedCategory.name}”
              </span>
            </Button>
          ) : null
        }
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
        onFilterChange={(value) => {
          setCategoryQuery(value);
          onCategoryFilterChange();
        }}
        selectedIds={form.categoryId === "" ? [] : [form.categoryId]}
      />

      {categoryError === null ? null : <InlineError message={categoryError} />}

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

      {!hasUnsavedGeometry ? null : (
        <p className="df-annotation-popover__unsaved">
          <StatusBadge srLabel="Stan geometrii:" tone="warning">
            Niezapisane
          </StatusBadge>
          <span>
            Przesunięcie bboxa nie jest jeszcze zapisane. Naciśnij <kbd>Enter</kbd>, aby je zapisać.
          </span>
        </p>
      )}
    </div>
  );
}
