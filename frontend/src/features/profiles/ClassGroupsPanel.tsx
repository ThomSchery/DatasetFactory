import { useState } from "react";

import { Button } from "../../components/common/Button";
import { CollapsibleGroup } from "../../components/common/CollapsibleGroup";
import { GroupedOptionList } from "../../components/common/GroupedOptionList";
import { Panel } from "../../components/common/Panel";
import { SelectField } from "../../components/common/SelectField";
import { TextField } from "../../components/common/TextField";
import { Empty, InlineError } from "../../components/common/UiStates";
import type { DraftCategory, DraftRegion } from "./profileDraft";
import { CHARACTER_CLASS_ALPHABET } from "../../api";
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
 * The four class groups the Figma document stacks under the Annotations panel.
 *
 * `Custom` and the three character groups mean different things, and the panel
 * says so rather than drawing one list of identical checkboxes:
 *
 *  - `Custom` holds the classes the operator named on a box. They are verified
 *    by hand, never read by OCR, so a checkbox next to them would claim a
 *    recognition setting that does not exist.
 *  - `Numbers`, `Letters` and `Symbols` are the OCR alphabet, and their
 *    checkboxes are the selected region's `allowed_chars` — exactly the
 *    "wybór rozpoznawanych znaków" the design means.
 *
 * With no region selected the character groups have nothing to act on, and the
 * panel says that instead of showing boxes whose state means nothing.
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
  const [characterNamesOpen, setCharacterNamesOpen] = useState(false);
  const custom = categories.filter((category) => category.kind === "game");
  const characters = categories.filter((category) => category.kind === "character");
  const selected = region === null ? "" : (region.allowed_chars ?? characters.map((category) => category.name).join(""));
  const unsupported =
    region === null
      ? []
      : [...new Set([...selected])].filter(
          (char) => !characters.some((category) => category.name === char),
        );

  function renameRow(category: DraftCategory) {
    const editing = editingKey === category.key;
    const nextKind = CHARACTER_CLASS_ALPHABET.includes(editingName.trim()) ? "character" : "game";
    const finish = () => {
      if (editingName.trim() === "") return;
      onRenameCategory(category.key, editingName.trim());
      setEditingKey(null);
    };
    return (
      <li className="df-class-groups__custom-row" key={category.key}>
        {editing ? (
          <div>
            <TextField
              autoComplete="off" autoFocus disabled={disabled}
              label={`Nowa nazwa klasy ${category.name}`}
              onChange={(event) => setEditingName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") { event.preventDefault(); finish(); }
                if (event.key === "Escape") { event.preventDefault(); setEditingKey(null); }
              }}
              value={editingName}
            />
            {editingName.trim() !== "" && nextKind !== category.kind ? (
              <p>Klasa zmieni grupę: {category.kind === "game" ? "Custom → OCR" : "OCR → Custom"}.</p>
            ) : null}
          </div>
        ) : <span className="df-class-groups__custom-name">{category.name}</span>}
        <div className="df-class-groups__custom-actions">
          {editing ? (
            <>
              <Button disabled={disabled || editingName.trim() === ""} onClick={finish} size="sm">Gotowe</Button>
              <Button disabled={disabled} onClick={() => setEditingKey(null)} size="sm" variant="secondary">Anuluj</Button>
            </>
          ) : (
            <Button aria-label={`Zmień nazwę klasy ${category.name}`} disabled={disabled}
              onClick={() => { setEditingName(category.name); setEditingKey(category.key); }} size="sm" variant="muted">
              Zmień nazwę
            </Button>
          )}
          {category.kind === "game" ? (
            <Button aria-label={`Usuń klasę ${category.name} z profilu`} disabled={disabled}
              onClick={() => onRemoveCategory(category.key)} size="sm" variant="secondary">Usuń</Button>
          ) : null}
        </div>
      </li>
    );
  }

  return (
    <Panel
      description="Custom to klasy nazwane na zrzucie. Pozostałe grupy wybierają znaki, które OCR ma rozpoznawać w zaznaczonym regionie."
      eyebrow="Profil"
      title="Klasy"
    >
      <CollapsibleGroup label="Custom" onToggle={onToggleCustom} open={customOpen}>
        {custom.length === 0 ? (
          <Empty
            description="Narysuj box na zrzucie i nazwij go — nazwa pojawi się tutaj jako klasa."
            title="Custom jest puste"
          />
        ) : (
          <ul className="df-class-groups__custom">
            {custom.map(renameRow)}
          </ul>
        )}
      </CollapsibleGroup>

      <CollapsibleGroup label="Nazwy klas OCR" open={characterNamesOpen} onToggle={() => setCharacterNamesOpen((open) => !open)}>
        <ul className="df-class-groups__custom">{characters.map(renameRow)}</ul>
      </CollapsibleGroup>

      {region === null ? (
        <Empty
          description="Zaznacz region na zrzucie albo na liście Annotations, żeby wybrać znaki, które OCR ma w nim czytać."
          title="Brak zaznaczonego regionu"
        />
      ) : (
        <>
          {region.allowed_chars === null ? (
            <p>Region dziedziczy konfigurację OCR. Zmiana znaku lub układu zapisze własne ustawienia.</p>
          ) : null}
          <GroupedOptionList
            disabled={disabled}
            emptyMessage="Żaden znak nie pasuje do filtra."
            filterLabel="Filtruj znaki"
            groups={GROUPS.map((group) => ({
              id: group.id,
              label: group.label,
              options: characters
                .filter((category) => group.test(category.name))
                .map((category) => ({ id: category.name, label: category.name })),
            })).filter((group) => group.options.length > 0)}
            label={`Znaki rozpoznawane w regionie ${region.name}`}
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
          {unsupported.length === 0 ? null : (
            <InlineError
              message={`Region czyta znaki spoza klas profilu: ${unsupported.join(" ")}. Dodaj te klasy albo usuń je z zakresu.`}
            />
          )}
          {selected.length === 0 ? (
            <InlineError message="Region musi mieć co najmniej jeden znak, żeby dało się zapisać profil." />
          ) : null}
          <SelectField
            description="Jak Tesseract ma czytać układ tego regionu. Tryb 0 nie rozpoznaje znaków i dlatego go tu nie ma."
            disabled={disabled}
            label="Układ tekstu OCR"
            onChange={(event) => {
              onPageSegmentationModeChange(Number(event.target.value));
            }}
            options={OCR_PAGE_SEGMENTATION_OPTIONS}
            value={String(region.page_segmentation_mode ?? DEFAULT_REGION_PAGE_SEGMENTATION_MODE)}
          />
        </>
      )}
    </Panel>
  );
}
