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
  annotation?: Annotation;
  /**
   * Set while this annotation carries a class the editor picked for it.
   *
   * FE-017 D saves a box the moment it is drawn, so a class nobody pointed at
   * can reach the dataset. Two things follow from this prop, and they are the
   * counterweight the ticket requires: the panel names that class outright, and
   * a single click on any other class replaces it — no separate save step,
   * because there is no considered choice here to protect.
   */
  autoAssignedCategoryName?: string;
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
  autoAssignedCategoryName,
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
  const categoryId = annotation?.category_id ?? "";
  const categoryName =
    annotation === undefined
      ? ""
      : categories.find((category) => category.id === categoryId)?.name ?? categoryId;
  const [form, setForm] = useState<FormState>(() => initialFormState(categoryId));
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
      // `clientHeight` rather than `innerHeight`: a horizontal scrollbar takes
      // height off the viewport, and a panel capped against `innerHeight` puts
      // its last row underneath that scrollbar (FE-017 A).
      const availableHeight = Math.max(
        0,
        Math.floor(
          document.documentElement.clientHeight - popover.getBoundingClientRect().top,
        ),
      );
      const nextValue = `${String(availableHeight)}px`;
      if (popover.style.getPropertyValue(VIEWPORT_ROOM_PROPERTY) !== nextValue) {
        popover.style.setProperty(VIEWPORT_ROOM_PROPERTY, nextValue);
      }
    };

    updateViewportRoom();
    window.addEventListener("resize", updateViewportRoom);
    window.addEventListener("scroll", updateViewportRoom, { passive: true });

    // The panel follows the inspector in the side column. Its available room
    // therefore changes when that preceding panel changes height; observing
    // the inspector (never the constrained panel itself) keeps the measurement
    // current without creating a resize feedback loop.
    const layoutAnchor = popover.previousElementSibling;
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateViewportRoom);
    if (observer !== null && layoutAnchor instanceof Element) {
      observer.observe(layoutAnchor);
    }

    return () => {
      window.removeEventListener("resize", updateViewportRoom);
      window.removeEventListener("scroll", updateViewportRoom);
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    setForm((current) => syncFormState(current, categoryId));
  }, [categoryId]);

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
    if (annotation === undefined) {
      return;
    }
    const annotationId = annotation.id;
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
          annotationId
      ) {
        return;
      }
      if (
        target instanceof Element &&
        (target
          .closest("[data-annotation-selection-target]")
          ?.getAttribute("data-annotation-selection-target") === annotationId ||
          target.closest("[data-preserve-annotation-preview]") !== null)
      ) {
        return;
      }
      // FE-019: "Powtórz z poprzedniej klatki" now sits in its own sibling
      // panel outside this popover's DOM, but it works alongside an open edit
      // rather than replacing it — engaging its picker must not discard the
      // edit in progress here.
      if (target instanceof Element && target.closest("[data-outside-click-exempt]") !== null) {
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
  }, [annotation]);

  const justDrawn = autoAssignedCategoryName !== undefined;

  function saveCategory(categoryId: string): void {
    if (annotation === undefined || categoryId === "") {
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
      aria-label={
        annotation === undefined
          ? "Anotacja bez zaznaczenia"
          : draft
            ? "Wybierz klasę dla nowego bbox"
            : `Edytuj anotację ${categoryName}`
      }
      className="df-annotation-popover"
      data-annotation-popover="panel"
      ref={popoverRef}
      role={annotation === undefined ? "region" : "dialog"}
    >
      <header className="df-annotation-popover__header">
        {/*
          A box saved a moment ago by the draw gesture is still "the new box" to
          the operator, even though it is already in the database — so the
          heading follows the moment rather than the persistence state.
        */}
        <strong>
          {draft || justDrawn ? "Nowa anotacja · box" : "Anotacja"}
        </strong>
        {/*
          FE-017 B struck the `OCR`/`Ręczna` badge in both places the operator
          marked up, here and in the class rows. The OCR confidence stays: it is
          a number about this one box, not the provenance label that was cut.

          FE-017 D adds the class the editor assigned by itself. It sits in the
          header rather than in a block of its own because the panel is capped
          to the viewport on the shortest supported window, and anything with
          its own height pushes the action row out of sight — the failure
          FE-010-FIX1 was about. A badge on a row that already exists costs
          nothing.
        */}
        {autoAssignedCategoryName === undefined &&
        (annotation === undefined ||
          annotation.source !== "ocr" ||
          annotation.confidence === null) ? null : (
          <span className="df-annotation-popover__badges">
            {autoAssignedCategoryName === undefined ? null : (
              <StatusBadge srLabel="Klasa wybrana automatycznie:" tone="brand">
                przypisano: {autoAssignedCategoryName}
              </StatusBadge>
            )}
            {annotation !== undefined &&
            annotation.source === "ocr" &&
            annotation.confidence !== null ? (
              <StatusBadge srLabel="Confidence OCR:" tone="neutral">
                {Math.round(annotation.confidence * 100)}%
              </StatusBadge>
            ) : null}
          </span>
        )}
      </header>

      <GroupedOptionList
        autoFocus={annotation !== undefined}
        defaultOpen
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
          annotation !== undefined && canCreateCategory ? (
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
        key={annotation?.id ?? "empty"}
        label="Klasy profilu"
        mode="single"
        onChange={(selection) => {
          const next = selection[0] ?? "";
          setForm((current) => ({ ...current, categoryId: next }));
          /*
           * One click is the whole correction for a class the editor assigned
           * by itself. Elsewhere selection deliberately does not save —
           * GroupedOptionList never lets focus choose, so a freshly drawn box
           * cannot get a class nobody indicated. Here the box already has
           * exactly such a class, so a click is the operator overruling it, and
           * making them click twice would be asking them to confirm a value
           * they never chose.
           */
          if (justDrawn && next !== "") {
            saveCategory(next);
          }
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
        <Button
          disabled={disabled || annotation === undefined}
          loading={annotation !== undefined && busyKey === `delete:${annotation.id}`}
          onClick={onDelete}
          size="sm"
          variant="muted"
        >
          {/*
            "Porzuć box" now removes a saved annotation as well as a draft: the
            box the operator is abandoning exists in the database the moment it
            is drawn (FE-017 D), and `FrameEditor.removeAnnotation` sends the
            versioned `DELETE` for it.
          */}
          {draft || justDrawn ? "Porzuć box" : "Usuń"}
        </Button>
        <Button
          /*
           * Reported, implemented as asked: "Zmień nazwę" here reassigns this
           * one box, while the identically worded action on the profile screen
           * (FE-016) renames a class across the whole profile. The accessible
           * name contains the visible label, as WCAG 2.5.3 requires, and then
           * says which of the two this is.
           */
          aria-label={draft ? "Zapisz klasę" : "Zmień nazwę: przypisz inną klasę do tego boxa"}
          disabled={disabled || annotation === undefined || form.categoryId === ""}
          loading={
            annotation !== undefined &&
            (draft ? busyKey === "create" : busyKey === `category:${annotation.id}`)
          }
          onClick={() => {
            saveCategory(form.categoryId);
          }}
          size="sm"
        >
          {draft ? "Zapisz" : "Zmień nazwę"}
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
