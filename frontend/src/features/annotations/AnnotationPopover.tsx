import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  categoryInputFromName,
  looksLikeDuplicateCategoryName,
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

/**
 * What the panel is allowed to claim after `category_name_exists`.
 *
 * `identified` carries the category the backend named as the winner of the
 * name, so the picker can reveal and select exactly that row. `unidentified`
 * is the honest state for a backend that rejects without `details` and whose
 * casefold the browser cannot reproduce: the winner is unknown, so the panel
 * selects nothing, says so, and shows the whole refreshed list instead. It
 * also remembers the normalized name that was rejected, so filtering away and
 * back cannot offer the same doomed create action again (FE-013-FIX2/FIX3).
 */
export type CategoryConflictRecovery =
  | { category: Pick<Category, "id" | "name">; kind: "identified" }
  | { kind: "unidentified"; rejectedName: string };

interface AnnotationPopoverProps {
  annotation: Annotation;
  busyKey: string | null;
  categories: readonly Category[];
  categoryConflict: CategoryConflictRecovery | null;
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
  categoryConflict,
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
  const repeatsUnidentifiedConflict =
    proposedCategory !== null &&
    categoryConflict?.kind === "unidentified" &&
    proposedCategory.name === categoryConflict.rejectedName;
  const canCreateCategory =
    proposedCategory !== null &&
    // The rejected normalized name is already taken by a class the browser
    // cannot point at. A different normalized proposal is a new intent, but
    // returning to this one must not buy another `409`.
    !repeatsUnidentifiedConflict &&
    !looksLikeDuplicateCategoryName(
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

  useEffect(() => {
    if (categoryConflict === null) {
      return;
    }
    if (categoryConflict.kind === "identified") {
      setCategoryQuery(categoryConflict.category.name);
      setForm((current) => ({ ...current, categoryId: categoryConflict.category.id }));
      return;
    }
    /*
     * The winner is unknown, so nothing here may look chosen. Clearing the
     * filter is the only way the blocking class is reachable at all: it is a
     * duplicate under the backend's casefold, not under the typed query, so
     * the query hides it.
     */
    setCategoryQuery("");
    setForm((current) => ({ ...current, categoryId: "" }));
  }, [categoryConflict]);

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
            ? "Brak takiej klasy w profilu. Utwórz ją i przypisz albo porzuć box."
            : "Brak takiej klasy w profilu. Utwórz ją i przypisz poniżej."
        }
        filterLabel="Klasa"
        filterMaxCodePoints={200}
        filterValue={categoryQuery}
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
