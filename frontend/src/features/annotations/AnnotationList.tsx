import { useEffect, useId, useState } from "react";

import type { Annotation, BBox, Category } from "../../api";
import { Button } from "../../components/common/Button";
import { SelectField } from "../../components/common/SelectField";
import { StatusBadge } from "../../components/common/StatusBadge";
import { TextField } from "../../components/common/TextField";
import { geometryDraft, parseGeometryDraft, type GeometryDraft } from "./geometryForm";

const GEOMETRY_FIELDS = ["x", "y", "width", "height"] as const;

interface AnnotationFormState {
  categoryBaselineId: string;
  categoryId: string;
  draft: GeometryDraft;
  geometryBaseline: GeometryDraft;
  geometryError: string | null;
}

function initialAnnotationFormState(annotation: Annotation): AnnotationFormState {
  const baseline = geometryDraft(annotation);
  return {
    categoryBaselineId: annotation.category_id,
    categoryId: annotation.category_id,
    draft: baseline,
    geometryBaseline: baseline,
    geometryError: null,
  };
}

function syncAnnotationFormState(
  current: AnnotationFormState,
  annotation: Annotation,
): AnnotationFormState {
  const nextGeometryBaseline = geometryDraft(annotation);
  const nextDraft = { ...current.draft };
  let draftChanged = false;

  for (const field of GEOMETRY_FIELDS) {
    const clean = current.draft[field] === current.geometryBaseline[field];
    if (clean && current.draft[field] !== nextGeometryBaseline[field]) {
      nextDraft[field] = nextGeometryBaseline[field];
      draftChanged = true;
    }
  }

  const categoryClean = current.categoryId === current.categoryBaselineId;
  const nextCategoryId = categoryClean ? annotation.category_id : current.categoryId;
  const baselineChanged = GEOMETRY_FIELDS.some(
    (field) => current.geometryBaseline[field] !== nextGeometryBaseline[field],
  );
  const categoryBaselineChanged = current.categoryBaselineId !== annotation.category_id;
  const categoryChanged = current.categoryId !== nextCategoryId;
  const nextGeometryError = draftChanged ? null : current.geometryError;

  if (
    !baselineChanged &&
    !categoryBaselineChanged &&
    !draftChanged &&
    !categoryChanged &&
    nextGeometryError === current.geometryError
  ) {
    return current;
  }

  return {
    categoryBaselineId: annotation.category_id,
    categoryId: nextCategoryId,
    draft: nextDraft,
    geometryBaseline: nextGeometryBaseline,
    geometryError: nextGeometryError,
  };
}

interface AnnotationListProps {
  annotations: readonly Annotation[];
  busyKey: string | null;
  categories: readonly Category[];
  disabled: boolean;
  drawTargetId: string | null;
  frameSize: { width: number; height: number };
  invalidIds: ReadonlySet<string>;
  onCategoryChange: (annotation: Annotation, categoryId: string) => void;
  onDelete: (annotation: Annotation) => void;
  onGeometryChange: (annotation: Annotation, bbox: BBox) => void;
  onSelect: (annotationId: string) => void;
  onToggleDrawTarget: (annotationId: string) => void;
  selectedId: string | null;
}

export function AnnotationList(props: AnnotationListProps) {
  if (props.annotations.length === 0) {
    return (
      <p className="df-review-annotations__empty">
        Ta klatka nie ma aktywnych anotacji. Narysuj bbox albo odrzuć klatkę.
      </p>
    );
  }

  return (
    <ol aria-label="Aktywne anotacje" className="df-review-annotations">
      {props.annotations.map((annotation) => (
        <AnnotationRow {...props} annotation={annotation} key={annotation.id} />
      ))}
    </ol>
  );
}

interface AnnotationRowProps extends Omit<AnnotationListProps, "annotations"> {
  annotation: Annotation;
}

function AnnotationRow({
  annotation,
  busyKey,
  categories,
  disabled,
  drawTargetId,
  frameSize,
  invalidIds,
  onCategoryChange,
  onDelete,
  onGeometryChange,
  onSelect,
  onToggleDrawTarget,
  selectedId,
}: AnnotationRowProps) {
  const [form, setForm] = useState(() => initialAnnotationFormState(annotation));
  const invalidDescriptionId = useId();
  const invalid = invalidIds.has(annotation.id);
  const selected = selectedId === annotation.id;
  const drawing = drawTargetId === annotation.id;
  const category = categories.find((item) => item.id === annotation.category_id);
  const categoryOptions = categories.map((item) => ({ label: item.name, value: item.id }));

  useEffect(() => {
    setForm((current) => syncAnnotationFormState(current, annotation));
  }, [
    annotation.category_id,
    annotation.height,
    annotation.width,
    annotation.x,
    annotation.y,
  ]);

  function setCoordinate(field: keyof GeometryDraft, value: string): void {
    setForm((current) => ({
      ...current,
      draft: { ...current.draft, [field]: value },
      geometryError: null,
    }));
  }

  return (
    <li
      aria-describedby={invalid ? invalidDescriptionId : undefined}
      aria-invalid={invalid || undefined}
      className="df-review-annotations__item"
      data-invalid={invalid || undefined}
      data-selected={selected || undefined}
    >
      <header className="df-review-annotations__header">
        <div>
          <strong>{category?.name ?? annotation.category_id}</strong>
          <p className="df-review-annotations__bbox">
            x {annotation.x}, y {annotation.y}, w {annotation.width}, h {annotation.height}
          </p>
        </div>
        <div className="df-review-annotations__badges">
          <StatusBadge srLabel="Źródło:" tone={annotation.source === "ocr" ? "brand" : "neutral"}>
            {annotation.source === "ocr" ? "OCR" : "Manual"}
          </StatusBadge>
          {annotation.source === "ocr" && annotation.confidence !== null ? (
            <StatusBadge srLabel="Confidence OCR:" tone="neutral">
              {Math.round(annotation.confidence * 100)}%
            </StatusBadge>
          ) : null}
          {invalid ? (
            <StatusBadge srLabel="Błąd:" tone="error">
              Niepoprawny bbox
            </StatusBadge>
          ) : null}
        </div>
      </header>

      {invalid ? (
        <p className="df-review-annotations__invalid" id={invalidDescriptionId}>
          Boks poza granicami klatki. Popraw jego geometrię.
        </p>
      ) : null}

      <SelectField
        disabled={disabled}
        label="Klasa"
        onChange={(event) => {
          const categoryId = event.target.value;
          setForm((current) => ({ ...current, categoryId }));
        }}
        options={categoryOptions}
        value={form.categoryId}
      />
      <Button
        disabled={disabled || form.categoryId === annotation.category_id}
        loading={busyKey === `category:${annotation.id}`}
        onClick={() => {
          onCategoryChange(annotation, form.categoryId);
        }}
        size="sm"
        variant="secondary"
      >
        Zapisz klasę
      </Button>

      <div className="df-review-annotations__geometry">
        {GEOMETRY_FIELDS.map((field) => (
          <TextField
            disabled={disabled}
            inputMode="numeric"
            key={field}
            label={field}
            onChange={(event) => {
              setCoordinate(field, event.target.value);
            }}
            type="number"
            value={form.draft[field]}
            width="short"
          />
        ))}
      </div>
      {form.geometryError === null ? null : (
        <p className="df-review-annotations__invalid" role="alert">
          {form.geometryError}
        </p>
      )}

      <div className="df-review-annotations__actions">
        <Button
          disabled={disabled}
          loading={busyKey === `select:${annotation.id}`}
          onClick={() => {
            onSelect(annotation.id);
          }}
          size="sm"
          variant={selected ? "primary" : "secondary"}
        >
          {selected ? "Zaznaczona" : "Zaznacz"}
        </Button>
        <Button
          disabled={disabled}
          loading={busyKey === `geometry:${annotation.id}`}
          onClick={() => {
            const parsed = parseGeometryDraft(form.draft, frameSize);
            setForm((current) => ({ ...current, geometryError: parsed.error }));
            if (parsed.bbox !== null) {
              onGeometryChange(annotation, parsed.bbox);
            }
          }}
          size="sm"
          variant="secondary"
        >
          Zapisz geometrię
        </Button>
        <Button
          disabled={disabled}
          onClick={() => {
            onToggleDrawTarget(annotation.id);
          }}
          size="sm"
          variant={drawing ? "primary" : "secondary"}
        >
          {drawing ? "Anuluj zmianę geometrii" : "Narysuj nową geometrię"}
        </Button>
        <Button
          disabled={disabled}
          loading={busyKey === `delete:${annotation.id}`}
          onClick={() => {
            onDelete(annotation);
          }}
          size="sm"
          variant="muted"
        >
          Usuń
        </Button>
      </div>
    </li>
  );
}
