import { useState } from "react";

import {
  canCompleteExportedRun,
  describeApiError,
  describeErrorCode,
  describeExportStatus,
  describeRunStatus,
  isCompletedExportStatus,
  isCompletedRunStatus,
  isFailedExportStatus,
  isRunningExportStatus,
} from "../../api";
import type { Export, PipelineRun } from "../../api";
import { Button } from "../../components/common/Button";
import { DataList } from "../../components/common/DataList";
import { Notice } from "../../components/common/Notice";
import { Panel } from "../../components/common/Panel";
import { StatusBadge } from "../../components/common/StatusBadge";
import { Empty, FatalError, InlineError, Loading } from "../../components/common/UiStates";
import { useDashboard } from "../dashboard/dashboardQuery";
import { ExportManifestPanel } from "./ExportManifestPanel";
import { useTrackedExport, useTrackedRun } from "./exportQueries";
import { useCompleteRun, useCreateExport } from "./useExportActions";
import "./ExportsScreen.css";

function actionError(error: unknown) {
  const failure = describeApiError(error);
  return <InlineError message={`${failure.message} ${failure.action} Kod: ${failure.code}.`} />;
}

function RunSummary({ run }: { run: PipelineRun }) {
  const status = describeRunStatus(run.status);
  return (
    <Panel
      aside={<StatusBadge srLabel="Status runu:" tone={status.tone}>{status.label}</StatusBadge>}
      description="Eksport obejmie wyłącznie klatki zaakceptowane w tym runie."
      eyebrow="Run"
      title="Źródło eksportu"
    >
      <DataList
        items={[
          { label: "ID runu", value: <code className="df-exports__path">{run.id}</code> },
          { label: "Wersja CAS", value: run.version },
          { label: "Rewizja weryfikacji", value: run.review_revision },
          {
            label: "Klatki ukończone / zaplanowane",
            value: `${String(run.completed_frames)} / ${String(run.total_frames)}`,
          },
        ]}
        layout="columns"
      />
    </Panel>
  );
}

interface ExportStatusPanelProps {
  activeExport: Export;
  busy: boolean;
  completeError: unknown;
  completing: boolean;
  onComplete: () => void;
  onNewExport: () => void;
  run: PipelineRun;
  starting: boolean;
  startError: unknown;
}

function ExportStatusPanel({
  activeExport,
  busy,
  completeError,
  completing,
  onComplete,
  onNewExport,
  run,
  starting,
  startError,
}: ExportStatusPanelProps) {
  const presentation = describeExportStatus(activeExport.status);
  const canComplete = canCompleteExportedRun(run.status, activeExport.status);
  const runClosed = isCompletedRunStatus(run.status);
  const terminalFailure = isFailedExportStatus(activeExport.status)
    ? describeErrorCode(activeExport.error_code)
    : null;

  return (
    <Panel
      aside={<StatusBadge srLabel="Status eksportu:" tone={presentation.tone}>{presentation.label}</StatusBadge>}
      description="Status jest odpytywany wyłącznie do zakończenia lub niepowodzenia eksportu."
      eyebrow="Eksport"
      title="Bieżący eksport"
    >
      <div className="df-exports__status">
        <DataList
          items={[
            { label: "ID eksportu", value: <code className="df-exports__path">{activeExport.id}</code> },
            { label: "Rewizja wejścia", value: activeExport.input_revision },
          ]}
          layout="columns"
        />

        {terminalFailure === null ? null : (
          <Notice title={terminalFailure.message} tone="error">
            {terminalFailure.action} Kod: {activeExport.error_code ?? "unknown_error"}.
          </Notice>
        )}

        {runClosed ? (
          <Notice title="Run został zamknięty">
            Backend potwierdził terminalny status runu. Eksport i jego manifest pozostają
            niezmienione.
          </Notice>
        ) : null}

        {startError === null ? null : actionError(startError)}
        {completeError === null ? null : actionError(completeError)}

        <div className="df-exports__actions">
          {isCompletedExportStatus(activeExport.status) || isFailedExportStatus(activeExport.status) ? (
            <Button
              disabled={busy || runClosed}
              loading={starting}
              loadingLabel="Uruchamianie nowego eksportu…"
              onClick={onNewExport}
              variant="secondary"
            >
              Uruchom nowy eksport
            </Button>
          ) : null}
          {canComplete ? (
            <Button
              disabled={busy}
              loading={completing}
              loadingLabel="Zamykanie runu…"
              onClick={onComplete}
            >
              Zamknij run
            </Button>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}

export function ExportsScreen() {
  const [exportId, setExportId] = useState<string | null>(null);
  const [trackedRunId, setTrackedRunId] = useState<string | null>(null);
  const dashboard = useDashboard();
  const exportQuery = useTrackedExport(exportId);
  const runQuery = useTrackedRun(trackedRunId);
  const createMutation = useCreateExport((created) => {
    setTrackedRunId(created.run_id);
    setExportId(created.id);
  });
  const completeMutation = useCompleteRun();

  if (dashboard.isPending) {
    return <Loading label="Ładowanie runu do eksportu…" />;
  }
  if (dashboard.isError) {
    const failure = describeApiError(dashboard.error);
    return (
      <FatalError
        description={`${failure.message} ${failure.action}`}
        onRetry={() => void dashboard.refetch()}
        title="Nie udało się wczytać źródła eksportu"
      />
    );
  }

  const dashboardRun = dashboard.data.run;
  const run = trackedRunId === null ? dashboardRun : (runQuery.data ?? dashboardRun);

  if (run === null) {
    return (
      <Empty
        description="Nie ma aktywnego runu do eksportu. Uruchom przetwarzanie materiału i zaakceptuj przynajmniej jedną klatkę."
        title="Brak runu do eksportu"
      />
    );
  }

  if (trackedRunId !== null && runQuery.isError) {
    const failure = describeApiError(runQuery.error);
    return (
      <FatalError
        description={`${failure.message} ${failure.action}`}
        onRetry={() => void runQuery.refetch()}
        title="Nie udało się odświeżyć runu"
      />
    );
  }

  const startExport = () => createMutation.mutate(run.id);
  const activeExport = exportQuery.data;
  const busy = createMutation.isPending || completeMutation.isPending;

  return (
    <div className="df-exports">
      <RunSummary run={run} />

      {exportId === null ? (
        <Panel
          description="Backend utworzy niezmienną migawkę bieżącej rewizji w formacie COCO."
          eyebrow="Eksport"
          title="Nowy eksport COCO"
        >
          <div className="df-exports__start">
            <p>Ścieżkę wyniku wybiera backend w obrębie workspace. Nie podajesz jej ręcznie.</p>
            {createMutation.error === null ? null : actionError(createMutation.error)}
            <Button
              disabled={busy}
              loading={createMutation.isPending}
              loadingLabel="Uruchamianie eksportu COCO…"
              onClick={startExport}
            >
              Uruchom eksport COCO
            </Button>
          </div>
        </Panel>
      ) : exportQuery.isError ? (
        <FatalError
          description={`${describeApiError(exportQuery.error).message} ${describeApiError(exportQuery.error).action}`}
          onRetry={() => void exportQuery.refetch()}
          title="Nie udało się wczytać statusu eksportu"
        />
      ) : exportQuery.isPending || activeExport === undefined ? (
        <Panel eyebrow="Eksport" title="Bieżący eksport">
          <Loading label="Ładowanie statusu eksportu…" />
        </Panel>
      ) : (
        <>
          <ExportStatusPanel
            activeExport={activeExport}
            busy={busy}
            completeError={completeMutation.error}
            completing={completeMutation.isPending}
            onComplete={() =>
              completeMutation.mutate({ expectedVersion: run.version, runId: run.id })
            }
            onNewExport={startExport}
            run={run}
            startError={createMutation.error}
            starting={createMutation.isPending}
          />
          {isCompletedExportStatus(activeExport.status) ? (
            <ExportManifestPanel completedExport={activeExport} />
          ) : isRunningExportStatus(activeExport.status) ? (
            <Loading label="Eksport COCO jest przygotowywany…" />
          ) : null}
        </>
      )}
    </div>
  );
}
