import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import type { Annotation, BBox, Category } from "../../api";
import { Button } from "../../components/common/Button";
import { StatusBadge } from "../../components/common/StatusBadge";
import { TextField } from "../../components/common/TextField";
import { geometryDraft, parseGeometryDraft, type GeometryDraft } from "./geometryForm";
import { resolvePopoverPlacement, sourceBoxToRendered, type PopoverPlacement } from "./popoverPlacement";

const GEOMETRY_FIELDS = ["x", "y", "width", "height"] as const;

interface AnnotationPopoverProps {
  annotation: Annotation;
  busyKey: string | null;
  categories: readonly Category[];
  disabled: boolean;
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
  categoryBaselineName: string;
  categoryId: string;
  draft: GeometryDraft;
  geometryBaseline: GeometryDraft;
  geometryError: string | null;
  query: string;
}

function initialFormState(annotation: Annotation, categoryName: string): FormState {
  const baseline = geometryDraft(annotation);
  return {
    categoryBaselineId: annotation.category_id,
    categoryBaselineName: categoryName,
    categoryId: annotation.category_id,
    draft: baseline,
    geometryBaseline: baseline,
    geometryError: null,
    query: categoryName,
  };
}

function syncFormState(
  current: FormState,
  annotation: Annotation,
  categoryName: string,
  frameSize: { height: number; width: number },
): FormState {
  const nextGeometryBaseline = geometryDraft(annotation);
  const nextDraft = { ...current.draft };

  for (const field of GEOMETRY_FIELDS) {
    if (current.draft[field] === current.geometryBaseline[field]) {
      nextDraft[field] = nextGeometryBaseline[field];
    }
  }

  const categoryClean =
    current.categoryId === current.categoryBaselineId &&
    current.query === current.categoryBaselineName;
  return {
    categoryBaselineId: annotation.category_id,
    categoryBaselineName: categoryName,
    categoryId: categoryClean ? annotation.category_id : current.categoryId,
    draft: nextDraft,
    geometryBaseline: nextGeometryBaseline,
    geometryError:
      current.geometryError === null
        ? null
        : parseGeometryDraft(nextDraft, frameSize).error,
    query: categoryClean ? categoryName : current.query,
  };
}

export function AnnotationPopover({
  annotation,
  busyKey,
  categories,
  disabled,
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
  const [form, setForm] = useState<FormState>(() => initialFormState(annotation, categoryName));
  const [activeIndex, setActiveIndex] = useState(0);
  const [geometryOpen, setGeometryOpen] = useState(false);
  const [placement, setPlacement] = useState<PopoverPlacement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const displayedDraft = geometryPreview === null ? form.draft : geometryDraft(geometryPreview);
  const filteredCategories = useMemo(() => {
    const query = form.query.trim().toLocaleLowerCase("pl");
    const filtered = query === ""
      ? [...categories]
      : categories.filter((category) => category.name.toLocaleLowerCase("pl").includes(query));
    return filtered.sort((first, second) => {
      if (first.id === form.categoryId) return -1;
      if (second.id === form.categoryId) return 1;
      return first.name.localeCompare(second.name, "pl");
    });
  }, [categories, form.categoryId, form.query]);

  useEffect(() => {
    setForm((current) => syncFormState(current, annotation, categoryName, frameSize));
  }, [
    annotation.category_id,
    annotation.height,
    annotation.width,
    annotation.x,
    annotation.y,
    categoryName,
    frameSize.height,
    frameSize.width,
  ]);

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
    activeIndex,
    annotation.height,
    annotation.width,
    annotation.x,
    annotation.y,
    filteredCategories.length,
    frameSize.height,
    frameSize.width,
    geometryOpen,
  ]);

  function choose(category: Category): void {
    setForm((current) => ({ ...current, categoryId: category.id, query: category.name }));
  }

  function saveCategory(): void {
    const active = filteredCategories[activeIndex];
    const categoryId = active?.id ?? form.categoryId;
    if (categoryId === annotation.category_id) {
      onClose();
      return;
    }
    onCategoryChange(categoryId);
  }

  function handleClassKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) =>
        Math.min(Math.max(current + direction, 0), Math.max(0, filteredCategories.length - 1)),
      );
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      saveCategory();
    }
  }

  return (
    <div
      aria-label={`Edytuj anotację ${categoryName}`}
      className="df-annotation-popover"
      data-side={placement?.side}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
      ref={popoverRef}
      role="dialog"
      style={placement === null ? { visibility: "hidden" } : { left: placement.left, top: placement.top }}
    >
      <header className="df-annotation-popover__header">
        <strong>Anotacja</strong>
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

      <TextField
        autoFocus
        autoComplete="off"
        disabled={disabled}
        label="Klasa"
        onChange={(event) => {
          setForm((current) => ({ ...current, query: event.target.value }));
          setActiveIndex(0);
        }}
        onKeyDown={handleClassKeyDown}
        value={form.query}
      />
      <ul aria-label="Pasujące klasy" className="df-annotation-popover__options" role="listbox">
        {filteredCategories.map((category, index) => (
          <li aria-selected={index === activeIndex} key={category.id} role="option">
            <Button
              disabled={disabled}
              onClick={() => {
                choose(category);
                setActiveIndex(index);
              }}
              size="sm"
              variant={index === activeIndex ? "primary" : "secondary"}
            >
              {category.name}
            </Button>
          </li>
        ))}
      </ul>

      <div className="df-annotation-popover__actions">
        <Button disabled={disabled} loading={busyKey === `delete:${annotation.id}`} onClick={onDelete} size="sm" variant="muted">
          Usuń
        </Button>
        <Button aria-label="Zapisz klasę" disabled={disabled || filteredCategories.length === 0} loading={busyKey === `category:${annotation.id}`} onClick={saveCategory} size="sm">
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
      <p className="df-annotation-popover__hint"><kbd>Esc</kbd> zamyka bez zmian</p>
    </div>
  );
}
