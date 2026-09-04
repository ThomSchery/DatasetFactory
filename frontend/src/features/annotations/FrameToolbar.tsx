import type { ReactNode } from "react";

import {
  describeReviewStatus,
  REVIEW_STATUS_FILTER_OPTIONS,
  type FrameCounts,
  type FrameSummary,
  type ReviewStatusFilter,
} from "../../api";
import { Button } from "../../components/common/Button";
import { SelectField } from "../../components/common/SelectField";

interface FrameToolbarProps {
  actions?: ReactNode;
  counts: FrameCounts;
  disabled: boolean;
  filter: ReviewStatusFilter;
  frames: readonly FrameSummary[];
  onFilterChange: (filter: ReviewStatusFilter) => void;
  onSelect: (frameId: string) => void;
  selectedId: string | null;
}

function frameOptionLabel(frame: FrameSummary): string {
  const review = describeReviewStatus(frame.review_status);
  return `Klatka ${frame.frame_index} · ${(frame.timestamp_ms / 1000).toFixed(3)} s · ${review.label.toLocaleLowerCase("pl")}`;
}

export function FrameToolbar({
  actions,
  counts,
  disabled,
  filter,
  frames,
  onFilterChange,
  onSelect,
  selectedId,
}: FrameToolbarProps) {
  const selectedIndex = frames.findIndex((frame) => frame.id === selectedId);
  const selectedPosition = selectedIndex < 0 ? 0 : selectedIndex + 1;
  const selectValue = selectedIndex < 0 ? "" : frames[selectedIndex]?.id ?? "";

  return (
    <div className="df-review-toolbar">
      <div aria-label="Filtr statusu klatek" className="df-review-frame-filters" role="group">
        {REVIEW_STATUS_FILTER_OPTIONS.map((option) => (
          <Button
            aria-label={`${option.label} ${option.value === "all" ? counts.total : counts[option.value]}`}
            aria-pressed={filter === option.value}
            disabled={disabled}
            key={option.value}
            onClick={() => {
              onFilterChange(option.value);
            }}
            size="sm"
            variant={filter === option.value ? "primary" : "secondary"}
          >
            <span>{option.value === "accepted" ? "Zaakcept." : option.label}</span>
            <strong>{option.value === "all" ? counts.total : counts[option.value]}</strong>
          </Button>
        ))}
      </div>

      <div aria-label="Nawigacja po klatkach" className="df-review-toolbar__navigation" role="group">
        <Button
          aria-label="Poprzednia klatka"
          disabled={disabled || selectedIndex <= 0}
          onClick={() => {
            const previous = frames[selectedIndex - 1];
            if (previous !== undefined) {
              onSelect(previous.id);
            }
          }}
          size="sm"
          variant="secondary"
        >
          ←
        </Button>
        <div className="df-review-toolbar__frame-select">
          <SelectField
            disabled={disabled || frames.length === 0}
            label="Wybierz klatkę"
            onChange={(event) => {
              onSelect(event.target.value);
            }}
            options={frames.map((frame) => ({ label: frameOptionLabel(frame), value: frame.id }))}
            placeholder={frames.length === 0 ? "Brak klatek" : undefined}
            value={selectValue}
          />
        </div>
        <strong aria-label={`Pozycja ${selectedPosition} z ${frames.length}`}>
          {selectedPosition} / {frames.length}
        </strong>
        <Button
          aria-label="Następna klatka"
          disabled={disabled || selectedIndex < 0 || selectedIndex + 1 >= frames.length}
          onClick={() => {
            const next = frames[selectedIndex + 1];
            if (next !== undefined) {
              onSelect(next.id);
            }
          }}
          size="sm"
          variant="secondary"
        >
          →
        </Button>
      </div>

      <div className="df-review-toolbar__decisions">{actions}</div>
    </div>
  );
}
