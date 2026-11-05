import { useId } from "react";

import { Button } from "../../components/common/Button";
import { Icon } from "../../components/common/Icon";
import { Panel } from "../../components/common/Panel";
import { TextField } from "../../components/common/TextField";
import { InlineError } from "../../components/common/UiStates";
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
 * `Annotations` from the Figma document (FE-022): the class field on top, the
 * regions of the current screenshot as a compact list of name and count, and
 * Reject / Accept under it.
 *
 * The field names the box that was just drawn — focus lands there the moment a
 * box exists, and existing class names are offered as suggestions. With a
 * region selected instead, the same field renames that region. Accept turns
 * the sketch into a region (a new name adds a `Custom` class), Reject drops the
 * sketch and nothing else.
 *
 * The rows are the profile's real regions, never sample values. The count is
 * the size of the region's OCR character set, the only number a region has.
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
  const suggestionsId = useId();
  const selected = regions.find((region) => region.key === selectedKey) ?? null;
  const naming = sketch !== null;
  const renameEmpty = !naming && selected !== null && selected.name.trim() === "";

  return (
    <Panel className="df-annotations" title="Annotations">
      <datalist id={suggestionsId}>
        {categories.map((category) => (
          <option key={category.key} value={category.name} />
        ))}
      </datalist>
      <TextField
        autoComplete="off"
        disabled={disabled || (!naming && selected === null)}
        error={naming ? sketchError : undefined}
        hideLabel
        label={naming ? "Name of the drawn region" : "Region name"}
        list={suggestionsId}
        onChange={(event) => {
          if (naming) {
            onSketchNameChange(event.target.value);
          } else if (selected !== null) {
            onRename(selected.key, event.target.value);
          }
        }}
        onKeyDown={(event) => {
          if (!naming) {
            return;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            onAccept();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            onReject();
          }
        }}
        placeholder={naming ? "Class name" : "Draw a region on the screenshot"}
        ref={nameInputRef}
        spellCheck={false}
        value={naming ? sketchName : (selected?.name ?? "")}
      />

      <ul aria-label="Regions on this screenshot" className="df-annotations__list">
        {regions.length === 0 ? (
          <li className="df-annotations__empty">No regions yet.</li>
        ) : (
          regions.map((region) => (
            <li
              className="df-annotations__row"
              data-selected={region.key === selectedKey || undefined}
              key={region.key}
            >
              <Button
                aria-label={`Select region ${region.name}`}
                aria-pressed={region.key === selectedKey}
                className="df-annotations__row-select"
                disabled={disabled}
                onClick={() => {
                  onSelect(region.key);
                }}
                variant="muted"
              >
                <span className="df-annotations__row-name">{region.name}</span>
                <span className="df-annotations__row-detail">
                  ({region.allowed_chars === null ? "all" : region.allowed_chars.length})
                </span>
              </Button>
              <Button
                aria-label={`Delete region ${region.name}`}
                className="df-annotations__row-delete"
                disabled={disabled}
                onClick={() => {
                  onRemove(region.key);
                }}
                title={`Delete region ${region.name}`}
                variant="muted"
              >
                <Icon name="trash" />
              </Button>
            </li>
          ))
        )}
      </ul>

      {renameEmpty ? <InlineError message="A region needs a name before the profile can be saved." /> : null}

      <div className="df-annotations__actions">
        <Button disabled={disabled || !naming} onClick={onReject}>
          Reject
        </Button>
        <Button disabled={disabled || !naming} onClick={onAccept}>
          Accept
        </Button>
      </div>
    </Panel>
  );
}
