import {
  availableRunActions,
  describeApiError,
  describeErrorCode,
  describeRunStage,
  describeRunStatus,
} from "../../api";
import type { PipelineRun, RunAction } from "../../api";
import { Button } from "../../components/common/Button";
import { StatusBadge } from "../../components/common/StatusBadge";
import { InlineError, Progress } from "../../components/common/UiStates";
import { useRunActions } from "./useRunActions";
import "./RunPanel.css";

const ACTION_LABELS: Readonly<Record<RunAction, string>> = {
  start: "Start",
  pause: "Pause",
  resume: "Resume",
  cancel: "Cancel",
};

export interface RunPanelProps {
  title?: string;
  /** Called after a transition the backend confirmed, e.g. to navigate away. */
  onTransitioned?: (run: PipelineRun, action: RunAction) => void;
  run: PipelineRun;
}

/**
 * The active run, compact (FE-022): it sits under the Run button inside the
 * Run Setup panel rather than as a full-width panel, and keeps everything the
 * operator needs to steer the run — status, stage, progress and the controls.
 *
 * Progress counts frames the run has finished against the frames it planned
 * (`total_frames`), never the frame rows that already exist.
 */
export function RunPanel({ onTransitioned, run, title = "Active run" }: RunPanelProps) {
  const status = describeRunStatus(run.status);
  const stage = describeRunStage(run.current_stage);
  const actions = availableRunActions(run.status);
  const mutation = useRunActions(onTransitioned);

  const failure = run.error_code === null ? null : describeErrorCode(run.error_code);
  const mutationError = mutation.isError ? describeApiError(mutation.error) : null;

  return (
    <section aria-label={title} className="df-run-panel">
      <div className="df-run-panel__heading">
        <span className="df-run-panel__title">{title}</span>
        <StatusBadge srLabel="Run status:" tone={status.tone}>
          {status.label}
        </StatusBadge>
      </div>
      <p className="df-run-panel__meta">Run {run.id}</p>
      <p className="df-run-panel__meta">
        {stage ?? "No stage"} · {String(run.interval_ms)} ms · attempt {String(run.attempt)}
      </p>
      <Progress
        label={`Frames ${String(run.completed_frames)} / ${String(run.total_frames)}`}
        max={run.total_frames}
        value={run.completed_frames}
      />

      {failure === null ? null : (
        // The stable `error_code` is shown alongside the copy: it is what the
        // user quotes in a bug report.
        <InlineError message={`${failure.message} ${failure.action} Code: ${String(run.error_code)}.`} />
      )}

      {actions.length === 0 ? null : (
        <div className="df-run-panel__actions">
          {actions.map((action) => (
            <Button
              key={action}
              // Every control sends the same `expected_version`, so a second one
              // in flight would only earn a `409 version_conflict`.
              disabled={mutation.isPending}
              loading={mutation.isPending && mutation.variables?.action === action}
              onClick={() => {
                mutation.mutate({
                  action,
                  expectedVersion: run.version,
                  runId: run.id,
                });
              }}
              size="sm"
              variant="secondary"
            >
              {ACTION_LABELS[action]}
            </Button>
          ))}
        </div>
      )}

      {mutationError === null ? null : (
        <InlineError message={`${mutationError.message} ${mutationError.action}`} />
      )}
    </section>
  );
}
