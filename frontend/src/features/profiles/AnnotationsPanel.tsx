import { useId } from "react";

import { Button } from "../../components/common/Button";
import { GroupedOptionList } from "../../components/common/GroupedOptionList";
import { Panel } from "../../components/common/Panel";
import { TextField } from "../../components/common/TextField";
import { Empty, InlineError } from "../../components/common/UiStates";
import { groupCategories } from "../../api";
import type { Category } from "../../api";
import type { DraftCategory, DraftRegion } from "./profileDraft";
import "./AnnotationsPanel.css";

export interface AnnotationSketch {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AnnotationsPanelProps {
  regions: readonly DraftRegion[];
  categories: readonly DraftCategory[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onRemove: (key: string) => void;
  onRename: (key: string, name: string) => void;
  /** The box just drawn, waiting to be named; `null` when there is none. */
  sketch: AnnotationSketch | null;
  sketchName: string;
  onSketchNameChange: (name: string) => void;
  onAccept: () => void;
  onReject: () => void;
  /** Why the sketch cannot be accepted yet, if it cannot. */
  sketchError?: string;
  nameInputRef?: (element: HTMLInputElement | null) => void;
  disabled?: boolean;
}

/**
 * `Annotations` from the Figma document: everything defined on the current
 * screenshot, and the naming step a freshly drawn box goes through.
 *
 * The rows are the profile's real regions, never sample values — a list that
 * showed the design's own `health & armour (1)` would be a picture of a
 * product, not the product. The count beside each row is the size of the
 * region's OCR character set, which is the only number a region actually has.
 *
 * Accept is what turns a sketch into a region, and a name the profile does not
 * know yet into a `Custom` class. Reject drops the sketch and nothing else:
 * it is a local gesture, so it never reaches the backend.
 */
export function AnnotationsPanel({
  regions,
  categories,
  selectedKey,
  onSelect,
  onRemove,
  onRename,
  sketch,
  sketchName,
  onSketchNameChange,
  onAccept,
  onReject,
  sketchError,
  nameInputRef,
  disabled = false,
}: AnnotationsPanelProps) {
  const listId = useId();
  const selected = regions.find((region) => region.key === selectedKey) ?? null;
  const classGroups = groupCategories(
    categories.map(
      (category): Category => ({ id: category.key, kind: category.kind, name: category.name }),
    ),
    (category) => ({ id: category.id, label: category.name }),
  );

  return (
    <Panel
      description="Każdy wiersz to region zdefiniowany na bieżącym zrzucie."
      eyebrow="Profil"
      title="Annotations"
    >
      {sketch === null ? null : (
        <div className="df-annotations__sketch">
          <TextField
            autoComplete="off"
            description="Nazwa trafi do listy regionów, a nowa nazwa dopisze klasę do grupy Custom."
            disabled={disabled}
            error={sketchError}
            label="Nazwa narysowanego regionu"
            onChange={(event) => {
              onSketchNameChange(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onAccept();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                onReject();
              }
            }}
            ref={nameInputRef}
            spellCheck={false}
            value={sketchName}
          />
          {classGroups.length === 0 ? null : (
            <GroupedOptionList
              disabled={disabled}
              emptyMessage="Żadna klasa nie pasuje do wpisanej nazwy."
              filterLabel="Wybierz istniejącą klasę"
              groups={classGroups.map((group) => ({
                id: group.id,
                label: group.label,
                options: group.items.map((item) => ({ id: item.label, label: item.label })),
              }))}
              label="Istniejące klasy profilu"
              mode="single"
              onChange={(ids) => {
                const [first] = ids;
                if (first !== undefined) {
                  onSketchNameChange(first);
                }
              }}
              selectedIds={[sketchName]}
            />
          )}
          <div className="df-annotations__sketch-actions">
            <Button disabled={disabled} onClick={onReject} size="sm" variant="secondary">
              Reject
            </Button>
            <Button disabled={disabled} onClick={onAccept} size="sm">
              Accept
            </Button>
          </div>
        </div>
      )}

      {regions.length === 0 ? (
        <Empty
          description="Przeciągnij prostokąt na zrzucie, żeby wskazać fragment HUD, który ma trafić do datasetu."
          title="Ten zrzut nie ma jeszcze regionów"
        />
      ) : (
        <ul className="df-annotations__list" id={listId}>
          {regions.map((region) => (
            <li
              className="df-annotations__row"
              data-selected={region.key === selectedKey || undefined}
              key={region.key}
            >
              <Button
                aria-label={`Zaznacz region ${region.name}`}
                aria-pressed={region.key === selectedKey}
                className="df-annotations__row-select"
                disabled={disabled}
                onClick={() => {
                  onSelect(region.key);
                }}
                size="sm"
                variant="muted"
              >
                <span className="df-annotations__row-name">{region.name}</span>
                <span className="df-annotations__row-detail">
                  ({region.allowed_chars === null ? "domyślne" : region.allowed_chars.length})
                </span>
              </Button>
              <Button
                aria-label={`Usuń region ${region.name}`}
                disabled={disabled}
                onClick={() => {
                  onRemove(region.key);
                }}
                size="sm"
                variant="secondary"
              >
                Usuń
              </Button>
            </li>
          ))}
        </ul>
      )}

      {selected === null || sketch !== null ? null : (
        <div className="df-annotations__selected">
          <TextField
            autoComplete="off"
            disabled={disabled}
            label={`Nazwa regionu (x ${String(selected.x)}, y ${String(selected.y)}, ${String(selected.width)} × ${String(selected.height)} px)`}
            onChange={(event) => {
              onRename(selected.key, event.target.value);
            }}
            spellCheck={false}
            value={selected.name}
          />
          {selected.name.trim() === "" ? (
            <InlineError message="Region musi mieć nazwę, żeby dało się zapisać profil." />
          ) : null}
        </div>
      )}
    </Panel>
  );
}
