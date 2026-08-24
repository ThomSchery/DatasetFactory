import type { FrameSummary, Page } from "../../api";
import { describeFrameStage, describeReviewStatus } from "../../api";
import { Button } from "../../components/common/Button";
import { Panel } from "../../components/common/Panel";
import { StatusBadge } from "../../components/common/StatusBadge";

interface FrameListProps {
  frames: Page<FrameSummary>;
  onPageChange: (page: number) => void;
  onSelect: (frameId: string) => void;
  selectedId: string;
}

function timestampLabel(timestampMs: number): string {
  return `${(timestampMs / 1000).toFixed(3)} s`;
}

export function FrameList({ frames, onPageChange, onSelect, selectedId }: FrameListProps) {
  const pageCount = Math.max(1, Math.ceil(frames.total / frames.page_size));

  return (
    <Panel
      aside={
        <StatusBadge srLabel="Liczba klatek:" tone="neutral">
          {frames.total}
        </StatusBadge>
      }
      description="Lista nie pobiera obrazów. Otwiera jedną klatkę naraz."
      eyebrow="Run"
      title="Klatki"
    >
      <ol className="df-review-frames">
        {frames.items.map((frame) => {
          const stage = describeFrameStage(frame.stage_status);
          const review = describeReviewStatus(frame.review_status);
          const selected = frame.id === selectedId;
          return (
            <li
              aria-current={selected ? "true" : undefined}
              className="df-review-frames__item"
              data-selected={selected || undefined}
              key={frame.id}
            >
              <div className="df-review-frames__summary">
                <strong>Klatka {frame.frame_index}</strong>
                <span>{timestampLabel(frame.timestamp_ms)}</span>
              </div>
              <div className="df-review-frames__badges">
                <StatusBadge srLabel="Etap:" tone={stage.tone}>
                  {stage.label}
                </StatusBadge>
                <StatusBadge srLabel="Status weryfikacji:" tone={review.tone}>
                  {review.label}
                </StatusBadge>
              </div>
              <Button
                aria-pressed={selected}
                onClick={() => {
                  onSelect(frame.id);
                }}
                size="sm"
                variant={selected ? "primary" : "secondary"}
              >
                {selected ? "Otwarta" : "Otwórz"}
              </Button>
            </li>
          );
        })}
      </ol>

      <nav aria-label="Stronicowanie klatek" className="df-review-pagination">
        <Button
          disabled={frames.page <= 1}
          onClick={() => {
            onPageChange(frames.page - 1);
          }}
          size="sm"
          variant="secondary"
        >
          Poprzednia
        </Button>
        <span>
          Strona {frames.page} z {pageCount}
        </span>
        <Button
          disabled={frames.page >= pageCount}
          onClick={() => {
            onPageChange(frames.page + 1);
          }}
          size="sm"
          variant="secondary"
        >
          Następna
        </Button>
      </nav>
    </Panel>
  );
}
