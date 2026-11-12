import { useState } from "react";

import { Button } from "../../components/common/Button";
import { CollapsibleGroup } from "../../components/common/CollapsibleGroup";
import { GroupedOptionList } from "../../components/common/GroupedOptionList";
import { Icon } from "../../components/common/Icon";
import { Panel } from "../../components/common/Panel";
import { TextField } from "../../components/common/TextField";
import { InlineError } from "../../components/common/UiStates";
import type { DraftCategory, DraftRegion } from "./profileDraft";
import { CHARACTER_CLASS_ALPHABET, categoryGroupIdOf, categoryGroupLabelOf } from "../../api";
import { OCR_PAGE_SEGMENTATION_OPTIONS } from "./schemas";
import { DEFAULT_REGION_PAGE_SEGMENTATION_MODE } from "./schemas";
import "./ClassGroupsPanel.css";

export interface ClassGroupsPanelProps {
  categories: readonly DraftCategory[];
  /** The region whose character set the checkboxes act on; `null` for none. */
  region: DraftRegion | null;
  onAllowedCharsChange: (allowedChars: string) => void;
  onPageSegmentationModeChange: (mode: number) => void;
  onRemoveCategory: (key: string) => void;
  onRenameCategory: (key: string, name: string) => void;
  customOpen: boolean;
  onToggleCustom: () => void;
  disabled?: boolean;
}

const GROUPS: readonly { id: string; label: string; test: (name: string) => boolean }[] = [
  { id: "digits", label: "Numbers", test: (name) => /^[0-9]$/.test(name) },
  { id: "letters", label: "Letters", test: (name) => /^[A-Z]$/.test(name) },
  { id: "symbols", label: "Symbols", test: (name) => !/^[0-9A-Z]$/.test(name) },
];

/**
 * The four class groups the Figma document stacks under Annotations (FE-022:
 * always on screen, inactive until a region is selected).
 *
 *  - `Custom` holds the classes the operator named on a box. They are verified
 *    by hand, never read by OCR, so they carry rename and delete, not a
 *    checkbox.
 *  - `Numbers`, `Letters` and `Symbols` are the OCR alphabet, and their
 *    checkboxes are the selected region's `allowed_chars`.
 *  - The rest of a region's OCR settings — the text layout (PSM) and the names
 *    of the character classes — fold away under "OCR settings".
 */
export function ClassGroupsPanel({
  categories,
  region,
  onAllowedCharsChange,
  onPageSegmentationModeChange,
  onRemoveCategory,
  onRenameCategory,
  customOpen,
  onToggleCustom,
  disabled = false,
}: ClassGroupsPanelProps) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const custom = categories.filter((category) => category.kind === "game");
  const characters = categories.filter((category) => category.kind === "character");
  const selected =
    region === null
      ? ""
      : (region.allowed_chars ?? characters.map((category) => category.name).join(""));
  const unsupported =
    region === null
      ? []
      : [...new Set([...selected])].filter(
          (char) => !characters.some((category) => category.name === char),
        );
  const characterDisabled = disabled || region === null;
  const psm = region?.page_segmentation_mode ?? DEFAULT_REGION_PAGE_SEGMENTATION_MODE;

  function renameRow(category: DraftCategory) {
    const editing = editingKey === category.key;
    const nextKind = CHARACTER_CLASS_ALPHABET.includes(editingName.trim()) ? "character" : "game";
    const finish = () => {
      if (editingName.trim() === "") return;
      onRenameCategory(category.key, editingName.trim());
      setEditingKey(null);
    };
    const movesGroup =
      editingName.trim() !== "" &&
      categoryGroupIdOf({ name: editingName.trim(), kind: nextKind }) !== categoryGroupIdOf(category);
    return (
      <li
        className={editing ? "df-class-groups__row df-class-groups__row--editing" : "df-class-groups__row"}
        key={category.key}
      >
        {editing ? (
          <div className="df-class-groups__rename">
            <TextField
              autoComplete="off"
              autoFocus
              disabled={disabled}
              hideLabel
              label={`New name of class ${category.name}`}
              onChange={(event) => setEditingName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  finish();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setEditingKey(null);
                }
              }}
              value={editingName}
            />
          </div>
        ) : (
          <span className="df-class-groups__name">{category.name}</span>
        )}
        <div className="df-class-groups__actions">
          {editing ? (
            <>
              {/* FE-025: icon actions that fit the row; Enter and Escape do the same. */}
              <Button
                aria-label={`Save the new name of class ${category.name}`}
                disabled={disabled || editingName.trim() === ""}
                onClick={finish}
                title="Save the name (Enter)"
                variant="muted"
              >
                <Icon name="check" />
              </Button>
              <Button
                aria-label={`Cancel renaming class ${category.name}`}
                disabled={disabled}
                onClick={() => setEditingKey(null)}
                title="Cancel (Escape)"
                variant="muted"
              >
                <Icon name="close" />
              </Button>
            </>
          ) : (
            <Button
              aria-label={`Rename class ${category.name}`}
              disabled={disabled}
              onClick={() => {
                setEditingName(category.name);
                setEditingKey(category.key);
              }}
              title={`Rename class ${category.name}`}
              variant="muted"
            >
              <Icon name="edit" />
            </Button>
          )}
          {category.kind === "game" && !editing ? (
            <Button
              aria-label={`Remove class ${category.name} from the profile`}
              disabled={disabled}
              onClick={() => onRemoveCategory(category.key)}
              title={`Remove class ${category.name}`}
              variant="muted"
            >
              <Icon name="trash" />
            </Button>
          ) : null}
        </div>
        {editing && movesGroup ? (
          <p className="df-class-groups__note df-class-groups__move" role="status">
            Moves the class from {categoryGroupLabelOf(category)} to{" "}
            {categoryGroupLabelOf({ name: editingName.trim(), kind: nextKind })}.
          </p>
        ) : null}
      </li>
    );
  }

  return (
    <Panel className="df-class-groups" hideTitle radius="sm" title="Classes">
      <div className="df-class-groups__group">
        <CollapsibleGroup label="Custom" onToggle={onToggleCustom} open={customOpen}>
          {custom.length === 0 ? (
            <p className="df-class-groups__note">Name a drawn box to add a class here.</p>
          ) : (
            <ul className="df-class-groups__list">{custom.map(renameRow)}</ul>
          )}
        </CollapsibleGroup>
      </div>

      <GroupedOptionList
        disabled={characterDisabled}
        emptyMessage="No character class in the profile."
        filterLabel="Filter characters"
        groups={GROUPS.map((group) => ({
          id: group.id,
          label: group.label,
          options: characters
            .filter((category) => group.test(category.name))
            .map((category) => ({ id: category.name, label: category.name })),
        }))}
        initiallyCollapsedGroupIds={GROUPS.map((group) => group.id)}
        inline
        label={
          region === null
            ? "Characters OCR reads — select a region first"
            : `Characters OCR reads in region ${region.name}`
        }
        mode="multiple"
        onChange={(ids) => {
          // Profile order, not click order: the backend normalises the
          // whitelist the same way, so the two never disagree.
          onAllowedCharsChange(
            characters
              .filter((category) => ids.includes(category.name))
              .map((category) => category.name)
              .join(""),
          );
        }}
        selectedIds={[...selected]}
      />

      {region !== null && unsupported.length > 0 ? (
        <InlineError
          message={`The region reads characters outside the profile classes: ${unsupported.join(" ")}. Add these classes or remove them from the range.`}
        />
      ) : null}
      {region !== null && selected.length === 0 ? (
        <InlineError message="A region needs at least one character before the profile can be saved." />
      ) : null}

      <div className="df-class-groups__group">
        <CollapsibleGroup
          label="OCR settings"
          onToggle={() => setSettingsOpen((open) => !open)}
          open={settingsOpen}
        >
          {region === null ? (
            <p className="df-class-groups__note">Select a region to change how OCR reads it.</p>
          ) : (
            <>
              {region.allowed_chars === null ? (
                <p className="df-class-groups__note">
                  The region inherits the OCR settings. Changing a character or the layout saves
                  its own settings.
                </p>
              ) : null}
              <GroupedOptionList
                disabled={disabled}
                emptyMessage="No layout matches."
                filterLabel="Text layout (PSM)"
                groups={[
                  {
                    id: "psm",
                    label: "Tesseract page segmentation",
                    options: OCR_PAGE_SEGMENTATION_OPTIONS.map((option) => ({
                      id: option.value,
                      label: option.label,
                    })),
                  },
                ]}
                label="OCR text layout"
                mode="single"
                onChange={(ids) => {
                  const [first] = ids;
                  if (first !== undefined) {
                    onPageSegmentationModeChange(Number(first));
                  }
                }}
                placeholder={
                  OCR_PAGE_SEGMENTATION_OPTIONS.find((option) => option.value === String(psm))
                    ?.label ?? "Text layout (PSM)"
                }
                selectedIds={[String(psm)]}
              />
            </>
          )}
          <p className="df-class-groups__subtitle">Character class names</p>
          <ul className="df-class-groups__list">{characters.map(renameRow)}</ul>
        </CollapsibleGroup>
      </div>
    </Panel>
  );
}
