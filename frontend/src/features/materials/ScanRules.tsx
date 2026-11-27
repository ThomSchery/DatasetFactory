import { useState } from "react";

import type { Region } from "../../api";
import { Button } from "../../components/common/Button";
import { CollapsibleGroup } from "../../components/common/CollapsibleGroup";
import { OCR_TEXT_LAYOUT_CHOICES, readTextLayout, textLayoutName } from "../profiles/schemas";
import "./ScanRules.css";

interface ScanRulesProps {
  regions: readonly Region[];
  layouts: Readonly<Record<string, string>>;
  onChange: (layouts: Record<string, string>) => void;
  disabled?: boolean;
}

const OPTIONS = OCR_TEXT_LAYOUT_CHOICES;

export function effectiveTextLayout(region: Region, layouts: Readonly<Record<string, string>>): string {
  return readTextLayout(layouts[region.id] ?? region.text_layout);
}

/** Edits only the pending run request. No profile mutation is made here. */
export function ScanRules({ regions, layouts, onChange, disabled = false }: ScanRulesProps) {
  const [allOpen, setAllOpen] = useState(false);
  // FE-038: every region starts folded; the operator opens the one to change.
  const [openRegion, setOpenRegion] = useState<string | null>(null);
  const current = (region: Region) => effectiveTextLayout(region, layouts);
  const firstRule = regions[0] ? current(regions[0]) : undefined;
  const sharedRule = regions.every((region) => current(region) === firstRule) ? firstRule : undefined;

  const choices = (label: string, value: string | undefined, choose: (layout: string) => void) => (
    <div aria-label={label} className="df-scan-rules__options" role="group">
      {OPTIONS.map((option) => (
        <Button
          aria-pressed={value === option.value}
          className="df-scan-rules__option"
          disabled={disabled}
          key={option.value}
          onClick={() => choose(option.value)}
          variant="secondary"
        >
          <RuleGlyph layout={option.value} />
          <span>{textLayoutName(option.value)}</span>
        </Button>
      ))}
    </div>
  );

  return (
    <section aria-label="Scan rules" className="df-scan-rules">
      <p className="df-run-setup__label">Scan rules</p>
      <CollapsibleGroup
        label="Same rule for all regions"
        markerPlacement="end"
        onToggle={() => setAllOpen(!allOpen)}
        open={allOpen}
        toggleDisabled={disabled}
      >
        {choices("Text layout for all regions", sharedRule, (value) =>
          onChange(Object.fromEntries(regions.map((region) => [region.id, value]))),
        )}
      </CollapsibleGroup>
      <div className="df-scan-rules__regions">
        {regions.map((region) => {
          const layout = current(region);
          return (
            <CollapsibleGroup
              key={region.id}
              label={region.name}
              markerPlacement="end"
              onToggle={() => { setOpenRegion(openRegion === region.id ? null : region.id); }}
              open={openRegion === region.id}
              summary={
                <span className="df-scan-rules__summary">
                  <strong>{region.name}</strong>
                  <span className="df-scan-rules__rule-value">
                    <RuleGlyph layout={layout} />
                    {textLayoutName(layout)}
                  </span>
                </span>
              }
              toggleDisabled={disabled}
            >
              {choices(`Text layout for ${region.name}`, layout, (value) =>
                onChange({ ...layouts, [region.id]: value }),
              )}
            </CollapsibleGroup>
          );
        })}
      </div>
    </section>
  );
}

function RuleGlyph({ layout }: { layout: string }) {
  return <span aria-hidden="true" className="df-scan-rules__glyph" data-layout={layout}><i /><i /><i /></span>;
}
