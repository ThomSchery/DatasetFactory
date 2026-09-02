import type { Annotation, Category } from "../../api";
import { Button } from "../../components/common/Button";
import { StatusBadge } from "../../components/common/StatusBadge";

interface ClassListProps {
  annotations: readonly Annotation[];
  categories: readonly Category[];
  disabled: boolean;
  onSelect: (annotationId: string) => void;
  selectedId: string | null;
}

interface ClassGroup {
  annotations: Annotation[];
  category: Category | undefined;
  categoryId: string;
}

function classGroups(
  annotations: readonly Annotation[],
  categories: readonly Category[],
): ClassGroup[] {
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const groups = new Map<string, Annotation[]>();
  for (const annotation of annotations) {
    const group = groups.get(annotation.category_id) ?? [];
    group.push(annotation);
    groups.set(annotation.category_id, group);
  }
  return [...groups].map(([categoryId, groupedAnnotations]) => ({
    annotations: groupedAnnotations,
    category: categoryById.get(categoryId),
    categoryId,
  }));
}

/** Compact class summary. Selection is owned by FrameEditor and only passed through. */
export function ClassList({ annotations, categories, disabled, onSelect, selectedId }: ClassListProps) {
  const groups = classGroups(annotations, categories);
  if (groups.length === 0) {
    return (
      <p className="df-review-annotations__empty">
        Ta klatka nie ma aktywnych anotacji. Narysuj bbox albo odrzuć klatkę.
      </p>
    );
  }

  return (
    <ol aria-label="Klasy na bieżącej klatce" className="df-review-classes">
      {groups.map((group) => {
        const selectedIndex = group.annotations.findIndex((item) => item.id === selectedId);
        const selected = selectedIndex >= 0;
        const sources = new Set(group.annotations.map((annotation) => annotation.source));
        const label = group.category?.name ?? group.categoryId;
        return (
          <li className="df-review-classes__item" data-selected={selected || undefined} key={group.categoryId}>
            <Button
              aria-label={`Klasa ${label}, ${group.annotations.length} anotacji`}
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => {
                const nextIndex = selected ? (selectedIndex + 1) % group.annotations.length : 0;
                const next = group.annotations[nextIndex];
                if (next !== undefined) {
                  onSelect(next.id);
                }
              }}
              size="sm"
              variant={selected ? "primary" : "secondary"}
            >
              <span className="df-review-classes__name">{label}</span>
              <span aria-label="Liczba anotacji" className="df-review-classes__count">
                {group.annotations.length}
              </span>
            </Button>
            <span className="df-review-classes__sources">
              {sources.has("ocr") ? (
                <StatusBadge srLabel="Źródło:" tone="brand">OCR</StatusBadge>
              ) : null}
              {sources.has("manual") ? (
                <StatusBadge srLabel="Źródło:" tone="success">Ręczna</StatusBadge>
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
