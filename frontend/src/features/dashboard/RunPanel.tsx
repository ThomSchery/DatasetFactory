import {
  availableRunActions,
  describeApiError,
  describeErrorCode,
  describeRunStage,
  describeRunStatus,
} from "../../api";
import type { PipelineRun, RunAction } from "../../api";
import { Button } from "../../components/common/Button";
import { DataList } from "../../components/common/DataList";
import { Panel } from "../../components/common/Panel";
import { StatusBadge } from "../../components/common/StatusBadge";
import { InlineError, Progress } from "../../components/common/UiStates";
import { useRunActions } from "./useRunActions";
import "./RunPanel.css";

const ACTION_LABELS: Readonly<Record<RunAction, string>> = {
  start: "Uruchom",
  pause: "Wstrzymaj",
  resume: "Wznów",
  cancel: "Anuluj",
};

export interface RunPanelProps {
  /** Called after a transition the backend confirmed, e.g. to navigate away. */
  onTransitioned?: (run: PipelineRun, action: RunAction) => void;
  run: PipelineRun;
}

/**
 * The active run: what it is doing, how far it got, and the four controls.
 *
 * Progress counts frames the run has finished against the frames it planned
 * (`total_frames`). That is a different number from the dashboard's
 * `frame_counts.total`, which counts frame rows that exist, and the two are
 * never presented as the same thing.
 */
export function RunPanel({ onTransitioned, run }: RunPanelProps) {
  const status = describeRunStatus(run.status);
  const stage = describeRunStage(run.current_stage);
  const actions = availableRunActions(run.status);
  const mutation = useRunActions(onTransitioned);

  const failure = run.error_code === null ? null : describeErrorCode(run.error_code);
  const mutationError = mutation.isError ? describeApiError(mutation.error) : null;

  return (
    <Panel
      aside={
        <StatusBadge srLabel="Status runu:" tone={status.tone}>
          {status.label}
        </StatusBadge>
      }
      eyebrow="Run"
      title="Aktywny run"
    >
      <DataList
        items={[
          { label: "Identyfikator", value: run.id },
          { label: "Etap", value: stage ?? "Brak etapu" },
          {
            hint: "Klatki ukończone wobec zaplanowanych dla tego runu.",
            label: "Klatki",
            value: `${String(run.completed_frames)} / ${String(run.total_frames)}`,
          },
          { label: "Interwał próbkowania", value: `${String(run.interval_ms)} ms` },
          { label: "Próba", value: run.attempt },
        ]}
        layout="columns"
      />

      <div className="df-run-panel__progress">
        <Progress
          label="Postęp klatek"
          max={run.total_frames}
          value={run.completed_frames}
        />
      </div>

      {failure === null ? null : (
        <div className="df-run-panel__failure">
          {/* The stable `error_code` is shown alongside the copy: it is what the
              user quotes in a bug report, and translating it away would lose it. */}
          <InlineError message={`${failure.message} ${failure.action}`} />
          <p className="df-run-panel__code">
            Kod błędu: <code>{run.error_code}</code>
          </p>
        </div>
      )}

      {actions.length === 0 ? (
        <p className="df-run-panel__no-actions">
          Ten status runu nie ma dostępnych operacji sterujących.
        </p>
      ) : (
        <div className="df-run-panel__actions">
          {actions.map((action) => (
            <Button
              key={action}
              // Every control sends the same `expected_version`, so a second one
              // in flight would only earn a `409 version_conflict`. All four are
              // disabled while any of them is pending (FE-06).
              disabled={mutation.isPending}
              loading={mutation.isPending && mutation.variables?.action === action}
              onClick={() => {
                mutation.mutate({
                  action,
                  expectedVersion: run.version,
                  runId: run.id,
                });
              }}
              variant={action === "cancel" ? "muted" : "primary"}
            >
              {ACTION_LABELS[action]}
            </Button>
          ))}
        </div>
      )}

      {mutationError === null ? null : (
        <div className="df-run-panel__error">
          <InlineError message={`${mutationError.message} ${mutationError.action}`} />
        </div>
      )}
    </Panel>
  );
}
