import { useEffect, useRef, useState } from "react";

import {
  describeReviewStatus,
  REVIEW_STATUS_FILTER_OPTIONS,
  type FrameCounts,
  type FrameSummary,
  type ReviewStatusFilter,
} from "../../api";
import { Button } from "../../components/common/Button";
import { GroupedOptionList } from "../../components/common/GroupedOptionList";
import { Icon } from "../../components/common/Icon";

/*
 * The two halves of what used to be one toolbar (FE-022, Figma Review
 * 576/768): "Review frames" with the filter pills on one row above the
 * workspace, and ← n/N → at the top of the left column. The counter opens the
 * frame picker; the decisions moved into the Annotations panel.
 */

interface ReviewHeaderProps {
  counts: FrameCounts;
  disabled: boolean;
  filter: ReviewStatusFilter;
  onFilterChange: (filter: ReviewStatusFilter) => void;
}

export function ReviewHeader({ counts, disabled, filter, onFilterChange }: ReviewHeaderProps) {
  return (
    <div className="df-review-header">
      <h1 className="df-review-header__title">Review frames</h1>
      <div aria-label="Frame status filter" className="df-review-frame-filters" role="group">
        {REVIEW_STATUS_FILTER_OPTIONS.map((option) => {
          const count = option.value === "all" ? counts.total : counts[option.value];
          return (
            <Button
              aria-label={`${option.label} ${String(count)}`}
              aria-pressed={filter === option.value}
              className="df-review-frame-filters__pill"
              disabled={disabled}
              key={option.value}
              onClick={() => {
                onFilterChange(option.value);
              }}
            >
              {option.label} ({count})
            </Button>
          );
        })}
      </div>
    </div>
  );
}

interface FrameNavigatorProps {
  disabled: boolean;
  frames: readonly FrameSummary[];
  onSelect: (frameId: string) => void;
  selectedId: string | null;
}

function frameOptionLabel(frame: FrameSummary): string {
  const review = describeReviewStatus(frame.review_status);
  return `Frame ${frame.frame_index} · ${(frame.timestamp_ms / 1000).toFixed(3)} s · ${review.label.toLocaleLowerCase("en")}`;
}

export function FrameNavigator({ disabled, frames, onSelect, selectedId }: FrameNavigatorProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLButtonElement>(null);
  const selectedIndex = frames.findIndex((frame) => frame.id === selectedId);
  const selectedPosition = selectedIndex < 0 ? 0 : selectedIndex + 1;

  useEffect(() => {
    if (!pickerOpen) {
      return;
    }
    function onPointerDown(event: PointerEvent) {
      const container = containerRef.current;
      if (container !== null && !container.contains(event.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [pickerOpen]);

  return (
    <div
      aria-label="Frame navigation"
      className="df-review-nav"
      data-preserve-annotation-preview="true"
      onKeyDown={(event) => {
        if (event.key === "Escape" && pickerOpen) {
          event.stopPropagation();
          setPickerOpen(false);
          counterRef.current?.focus();
        }
      }}
      ref={containerRef}
      role="group"
    >
      <Button
        aria-label="Previous frame"
        className="df-review-nav__step"
        disabled={disabled || selectedIndex <= 0}
        onClick={() => {
          const previous = frames[selectedIndex - 1];
          if (previous !== undefined) {
            onSelect(previous.id);
          }
        }}
        title="Previous frame"
      >
        <Icon name="arrow-left" />
      </Button>
      <Button
        aria-expanded={pickerOpen}
        aria-haspopup="listbox"
        aria-label={`Frame ${String(selectedPosition)} of ${String(frames.length)} — choose a frame`}
        className="df-review-nav__counter"
        data-frame-id={selectedId ?? undefined}
        disabled={disabled || frames.length === 0}
        onClick={() => {
          setPickerOpen((open) => !open);
        }}
        ref={counterRef}
        title="Choose a frame"
      >
        {selectedPosition}/{frames.length}
      </Button>
      <Button
        aria-label="Next frame"
        className="df-review-nav__step"
        disabled={disabled || selectedIndex < 0 || selectedIndex + 1 >= frames.length}
        onClick={() => {
          const next = frames[selectedIndex + 1];
          if (next !== undefined) {
            onSelect(next.id);
          }
        }}
        title="Next frame"
      >
        <Icon name="arrow-right" />
      </Button>
      {pickerOpen ? (
        <div className="df-review-nav__picker">
          <GroupedOptionList
            autoFocus
            defaultOpen
            disabled={disabled}
            emptyMessage="No frame matches."
            filterLabel="Choose frame"
            groups={[
              {
                id: "frames",
                label: "Frames",
                options: frames.map((frame) => ({
                  id: frame.id,
                  label: frameOptionLabel(frame),
                })),
              },
            ]}
            label="Frames of this run"
            mode="single"
            onChange={(ids) => {
              const [first] = ids;
              if (first !== undefined) {
                onSelect(first);
                setPickerOpen(false);
                counterRef.current?.focus();
              }
            }}
            selectedIds={selectedId === null ? [] : [selectedId]}
          />
        </div>
      ) : null}
    </div>
  );
}
