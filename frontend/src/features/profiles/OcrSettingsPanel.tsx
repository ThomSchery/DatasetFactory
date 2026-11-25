import { Button } from "../../components/common/Button";
import { GroupedOptionList } from "../../components/common/GroupedOptionList";
import { Panel } from "../../components/common/Panel";
import { InlineError } from "../../components/common/UiStates";
import { regionCharacterCount, type DraftCategory, type DraftRegion } from "./profileDraft";
import {
  DEFAULT_REGION_PAGE_SEGMENTATION_MODE,
  OCR_PAGE_SEGMENTATION_OPTIONS,
} from "./schemas";
import "./OcrSettingsPanel.css";

export interface OcrSettingsPanelProps {
  categories: readonly DraftCategory[];
  /** The region whose OCR settings the panel edits; `null` for none. */
  region: DraftRegion | null;
  /** Every region of the draft, summarised while none is selected. */
  regions: readonly DraftRegion[];
  onAllowedCharsChange: (allowedChars: string) => void;
  onPageSegmentationModeChange: (mode: number) => void;
  onSelectRegion: (key: string) => void;
  disabled?: boolean;
}

const GROUPS: readonly { id: string; label: string; test: (name: string) => boolean }[] = [
  { id: "digits", label: "Numbers", test: (name) => /^[0-9]$/.test(name) },
  { id: "letters", label: "Letters", test: (name) => /^[A-Z]$/.test(name) },
  { id: "symbols", label: "Symbols", test: (name) => !/^[0-9A-Z]$/.test(name) },
];

function layoutLabel(mode: number | null): string {
  if (mode === null) {
    return "Layout inherited";
  }
  return (
    OCR_PAGE_SEGMENTATION_OPTIONS.find((option) => option.value === String(mode))?.short ??
    `Layout ${String(mode)}`
  );
}

/**
 * What OCR reads, and nothing else (FE-029).
 *
 * The regions themselves — where OCR reads — are drawn and named in
 * Annotations, and naming a box is also how a class is added, so this panel no
 * longer lists classes, renames them or deletes them. Deleting a region
 * deletes its class on save unless a box in Review uses it (FE-030, decided by
 * the backend, which knows the annotations). It answers one question per
 * region: which characters, in which text layout.
 *
 *  - With a region selected it edits that region: the text layout (PSM) and
 *    the characters OCR may read, as three collapsible groups whose header
 *    selects the whole group — the "super-category" the user asked for, so the
 *    alphabet never has to be scrolled as one list.
 *  - With none selected it summarises every region, and a row selects it.
 */
export function OcrSettingsPanel({
  categories,
  region,
  regions,
  onAllowedCharsChange,
  onPageSegmentationModeChange,
  onSelectRegion,
  disabled = false,
}: OcrSettingsPanelProps) {
  const characters = categories.filter((category) => category.kind === "character");

  if (region === null) {
    return (
      <Panel className="df-ocr-settings" radius="sm" title="OCR settings">
        {regions.length === 0 ? (
          <p className="df-ocr-settings__note">
            No regions yet. Draw one on the screenshot to tell OCR where to read.
          </p>
        ) : (
          <>
            <p className="df-ocr-settings__note">
              What OCR reads in each region. Select a region to change it.
            </p>
            <ul aria-label="OCR settings of every region" className="df-ocr-settings__summary">
              {regions.map((item) => {
                const count = regionCharacterCount(item, categories);
                const read =
                  count === null
                    ? `all ${String(characters.length)} characters`
                    : `${String(count)} of ${String(characters.length)} characters`;
                return (
                  <li key={item.key}>
                    <Button
                      aria-label={`${item.name}: ${read}, ${layoutLabel(item.page_segmentation_mode)}. Select the region`}
                      className="df-ocr-settings__summary-row"
                      disabled={disabled}
                      onClick={() => {
                        onSelectRegion(item.key);
                      }}
                      variant="muted"
                    >
                      <span className="df-ocr-settings__summary-name">{item.name}</span>
                      <span className="df-ocr-settings__summary-detail">{read}</span>
                      <span className="df-ocr-settings__summary-layout">
                        {layoutLabel(item.page_segmentation_mode)}
                      </span>
                    </Button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Panel>
    );
  }

  const selected = region.allowed_chars ?? characters.map((category) => category.name).join("");
  const unsupported = [...new Set([...selected])].filter(
    (char) => !characters.some((category) => category.name === char),
  );
  const psm = region.page_segmentation_mode ?? DEFAULT_REGION_PAGE_SEGMENTATION_MODE;

  return (
    <Panel
      aside={<span className="df-ocr-settings__region">{region.name}</span>}
      className="df-ocr-settings"
      radius="sm"
      title="OCR settings"
    >
      {region.allowed_chars === null || region.page_segmentation_mode === null ? (
        <p className="df-ocr-settings__note">
          The region inherits the OCR settings. Changing a character or the layout saves its own
          settings.
        </p>
      ) : null}

      <p className="df-ocr-settings__subtitle">Text layout</p>
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
              selectedLabel: option.short,
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
          OCR_PAGE_SEGMENTATION_OPTIONS.find((option) => option.value === String(psm))?.short ??
          "Text layout (PSM)"
        }
        selectedIds={[String(psm)]}
      />

      <p className="df-ocr-settings__subtitle">Characters OCR reads</p>
      <GroupedOptionList
        disabled={disabled}
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
        label={`Characters OCR reads in region ${region.name}`}
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

      {unsupported.length > 0 ? (
        <InlineError
          message={`The region reads characters outside the profile classes: ${unsupported.join(" ")}. Remove them from the range.`}
        />
      ) : null}
      {selected.length === 0 ? (
        <InlineError message="A region needs at least one character before the profile can be saved." />
      ) : null}
    </Panel>
  );
}
