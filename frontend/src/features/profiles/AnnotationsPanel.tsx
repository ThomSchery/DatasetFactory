import { useEffect, useId, useState } from "react";

import { Button } from "../../components/common/Button";
import { GroupedOptionList } from "../../components/common/GroupedOptionList";
import { Panel } from "../../components/common/Panel";
import { TextField } from "../../components/common/TextField";
import { InlineError } from "../../components/common/UiStates";
import { regionCharacterCount, type DraftCategory, type DraftRegion } from "./profileDraft";
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
  onSelect: (key: string | null) => void;
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
 * FE-029: a row has no delete icon — a region is removed on the screenshot,
 * from its context menu or with Delete, where the operator sees what goes.
 */
export function AnnotationsPanel({
  regions,
  categories,
  selectedKey,
  onSelect,
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
  const [filter, setFilter] = useState("");
  const [marked, setMarked] = useState<readonly string[]>([]);
  useEffect(() => {
    if (selectedKey !== null) setMarked((current) => current.includes(selectedKey) ? current : [...current, selectedKey]);
  }, [selectedKey]);
  const visible = regions.filter((region) => region.name.toLocaleLowerCase().includes(filter.toLocaleLowerCase()));
  const selectedIds = marked.filter((key) => regions.some((region) => region.key === key));
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
        suffix={naming ? "↵" : undefined}
        spellCheck={false}
        value={naming ? sketchName : (selected?.name ?? "")}
      />

      {naming ? <p className="df-annotations__hint">Name the region, then Accept. Esc throws the box away.</p> : null}
      <div className="df-annotations__actions">
        <Button disabled={disabled || !naming} onClick={onReject}>
          Reject
        </Button>
        <Button disabled={disabled || !naming} onClick={onAccept}>
          Accept
        </Button>
      </div>

      <div className="df-annotations__filter">
        <TextField
          autoComplete="off"
          hideLabel
          label="Filter regions"
          onChange={(event) => { setFilter(event.target.value); }}
          placeholder={`Filter ${regions.length} regions`}
          value={filter}
        />
      </div>
      <div className="df-annotations__selection">
        <span className="df-annotations__selection-count">{selectedIds.length} of {regions.length}</span>
        <GroupedOptionList
          disabled={disabled}
          emptyMessage={regions.length === 0 ? "No regions yet." : "No regions match."}
          filterLabel="Regions on this screenshot"
          groups={[{ id: "regions", label: "Select all", options: visible.map((region) => ({
            // FE-029: the profile's own characters, counted once each.
            detail: `(${regionCharacterCount(region, categories) ?? "all"})`,
            id: region.key,
            label: region.name,
          })) }]}
          inline
          label="Regions on this screenshot"
          mode="multiple"
          onChange={(ids) => {
            setMarked(ids);
            const added = ids.find((id) => !selectedIds.includes(id));
            onSelect(added ?? (selectedKey !== null && ids.includes(selectedKey) ? selectedKey : ids.at(-1) ?? null));
          }}
          selectedIds={selectedIds}
        />
      </div>

      {renameEmpty ? <InlineError message="A region needs a name before the profile can be saved." /> : null}


    </Panel>
  );
}
