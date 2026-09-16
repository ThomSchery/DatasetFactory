import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";

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
import type { CreateExportRequest, Export, ExportFormat, PipelineRun } from "../../api";
import { Button } from "../../components/common/Button";
import { DataList } from "../../components/common/DataList";
import { Notice } from "../../components/common/Notice";
import { Panel } from "../../components/common/Panel";
import { SelectField } from "../../components/common/SelectField";
import { StatusBadge } from "../../components/common/StatusBadge";
import { TextField } from "../../components/common/TextField";
import { Empty, FatalError, InlineError, Loading } from "../../components/common/UiStates";
import { useDashboard } from "../dashboard/dashboardQuery";
import { ExportManifestPanel } from "./ExportManifestPanel";
import { useLatestExport, useTrackedExport, useTrackedRun } from "./exportQueries";
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
}

function ExportStatusPanel({
  activeExport,
  busy,
  completeError,
  completing,
  onComplete,
  onNewExport,
  run,
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

        {completeError === null ? null : actionError(completeError)}

        <div className="df-exports__actions">
          {isCompletedExportStatus(activeExport.status) || isFailedExportStatus(activeExport.status) ? (
            <Button
              disabled={busy || runClosed}
              onClick={onNewExport}
              variant="secondary"
            >
              Skonfiguruj nowy eksport
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [startingFresh, setStartingFresh] = useState(false);
  const [format, setFormat] = useState<ExportFormat>("coco");
  const [trainPercent, setTrainPercent] = useState("80");
  const [validPercent, setValidPercent] = useState("10");
  const [testPercent, setTestPercent] = useState("10");
  const [seed, setSeed] = useState("0");
  const [formError, setFormError] = useState<string | null>(null);
  const rawExportId = searchParams.get("export_id");
  const exportId = rawExportId?.trim() || null;
  const hasExportLocator = rawExportId !== null;
  const invalidExportLocator = hasExportLocator && exportId === null;
  const dashboard = useDashboard(!hasExportLocator);
  const exportQuery = useTrackedExport(exportId);
  const trackedRunId = exportQuery.data?.run_id ?? null;
  const runQuery = useTrackedRun(trackedRunId);
  const dashboardRunId = dashboard.data?.run?.id ?? null;
  const latestExportQuery = useLatestExport(
    hasExportLocator || startingFresh ? null : dashboardRunId,
  );
  const createMutation = useCreateExport((created) => {
    setStartingFresh(false);
    setSearchParams({ export_id: created.id });
  });
  const completeMutation = useCompleteRun();

  useEffect(() => {
    if (!hasExportLocator && !startingFresh && latestExportQuery.data != null) {
      setSearchParams({ export_id: latestExportQuery.data.id }, { replace: true });
    }
  }, [hasExportLocator, latestExportQuery.data, setSearchParams, startingFresh]);

  if (invalidExportLocator) {
    return (
      <FatalError
        description="Parametr export_id musi zawierać niepusty identyfikator eksportu. Otwórz ekran bez parametru, aby odtworzyć najnowszy eksport aktywnego runu."
        title="Nieprawidłowy identyfikator eksportu"
      />
    );
  }

  if (hasExportLocator) {
    if (exportQuery.isError) {
      const failure = describeApiError(exportQuery.error);
      return (
        <FatalError
          description={`${failure.message} ${failure.action}`}
          onRetry={() => void exportQuery.refetch()}
          title="Nie udało się wczytać statusu eksportu"
        />
      );
    }
    if (exportQuery.isPending || exportQuery.data === undefined) {
      return <Loading label="Ładowanie statusu eksportu…" />;
    }
    if (runQuery.isError) {
      const failure = describeApiError(runQuery.error);
      return (
        <FatalError
          description={`${failure.message} ${failure.action}`}
          onRetry={() => void runQuery.refetch()}
          title="Nie udało się odświeżyć runu"
        />
      );
    }
    if (runQuery.isPending || runQuery.data === undefined) {
      return <Loading label="Ładowanie runu eksportu…" />;
    }
  }

  if (!hasExportLocator && dashboard.isPending) {
    return <Loading label="Ładowanie runu do eksportu…" />;
  }
  if (!hasExportLocator && dashboard.isError) {
    const failure = describeApiError(dashboard.error);
    return (
      <FatalError
        description={`${failure.message} ${failure.action}`}
        onRetry={() => void dashboard.refetch()}
        title="Nie udało się wczytać źródła eksportu"
      />
    );
  }

  const dashboardRun = dashboard.data?.run ?? null;
  const run = hasExportLocator ? (runQuery.data ?? null) : dashboardRun;

  if (run === null) {
    return (
      <Empty
        description="Nie ma aktywnego runu do eksportu. Uruchom przetwarzanie materiału i zaakceptuj przynajmniej jedną klatkę."
        title="Brak runu do eksportu"
      />
    );
  }

  if (!hasExportLocator && !startingFresh && latestExportQuery.isError) {
    const failure = describeApiError(latestExportQuery.error);
    return (
      <FatalError
        description={`${failure.message} ${failure.action}`}
        onRetry={() => void latestExportQuery.refetch()}
        title="Nie udało się odtworzyć ostatniego eksportu"
      />
    );
  }

  if (!hasExportLocator && !startingFresh && latestExportQuery.isPending) {
    return <Loading label="Sprawdzanie ostatniego eksportu…" />;
  }

  if (!hasExportLocator && !startingFresh && latestExportQuery.data !== null) {
    return <Loading label="Przywracanie ostatniego eksportu…" />;
  }

  const startExport = () => {
    let request: CreateExportRequest = { run_id: run.id, format };
    if (format === "roboflow_coco") {
      const values = [trainPercent, validPercent, testPercent].map(Number);
      const seedValue = Number(seed);
      if (
        values.some((value) => !Number.isFinite(value) || value < 0 || value > 100) ||
        Math.abs(values.reduce((sum, value) => sum + value, 0) - 100) > Number.EPSILON
      ) {
        setFormError("Proporcje train, valid i test muszą być liczbami od 0 do 100 i razem dawać 100%.");
        return;
      }
      if (!Number.isSafeInteger(seedValue)) {
        setFormError("Ziarno podziału musi być liczbą całkowitą.");
        return;
      }
      request = {
        ...request,
        seed: seedValue,
        split: { train: values[0] / 100, valid: values[1] / 100, test: values[2] / 100 },
      };
    }
    setFormError(null);
    createMutation.mutate(request);
  };
  const configureNewExport = () => {
    createMutation.reset();
    setFormError(null);
    setStartingFresh(true);
    setSearchParams({});
  };
  const activeExport = hasExportLocator ? exportQuery.data : undefined;
  const busy = createMutation.isPending || completeMutation.isPending;

  return (
    <div className="df-exports">
      <RunSummary run={run} />

      {!hasExportLocator ? (
        <Panel
          description="Backend utworzy niezmienną migawkę bieżącej rewizji w wybranym wariancie COCO."
          eyebrow="Eksport"
          title="Nowy eksport"
        >
          <div className="df-exports__start">
            <SelectField
              description="Wariant DatasetFactory zachowuje dotychczasowy układ. Roboflow tworzy katalogi train, valid i test."
              disabled={busy}
              label="Wariant eksportu"
              onChange={(event) => {
                setFormat(event.target.value as ExportFormat);
                setFormError(null);
                createMutation.reset();
              }}
              options={[
                { label: "COCO — DatasetFactory", value: "coco" },
                { label: "Roboflow COCO — train / valid / test", value: "roboflow_coco" },
              ]}
              value={format}
            />
            {format === "roboflow_coco" ? (
              <div className="df-exports__split-fields">
                <TextField
                  disabled={busy}
                  label="Train (%)"
                  max={100}
                  min={0}
                  onChange={(event) => {
                    setTrainPercent(event.target.value);
                    setFormError(null);
                  }}
                  step={1}
                  type="number"
                  value={trainPercent}
                  width="short"
                />
                <TextField
                  disabled={busy}
                  label="Valid (%)"
                  max={100}
                  min={0}
                  onChange={(event) => {
                    setValidPercent(event.target.value);
                    setFormError(null);
                  }}
                  step={1}
                  type="number"
                  value={validPercent}
                  width="short"
                />
                <TextField
                  disabled={busy}
                  label="Test (%)"
                  max={100}
                  min={0}
                  onChange={(event) => {
                    setTestPercent(event.target.value);
                    setFormError(null);
                  }}
                  step={1}
                  type="number"
                  value={testPercent}
                  width="short"
                />
                <TextField
                  description="Ten sam run, podział i ziarno dają ten sam przydział klatek."
                  disabled={busy}
                  label="Ziarno podziału"
                  onChange={(event) => {
                    setSeed(event.target.value);
                    setFormError(null);
                  }}
                  step={1}
                  type="number"
                  value={seed}
                  width="short"
                />
                {formError === null ? null : <InlineError message={formError} />}
              </div>
            ) : null}
            <p>Ścieżkę wyniku wybiera backend w obrębie workspace. Nie podajesz jej ręcznie.</p>
            {createMutation.error === null ? null : actionError(createMutation.error)}
            <Button
              disabled={busy}
              loading={createMutation.isPending}
              loadingLabel="Uruchamianie eksportu…"
              onClick={startExport}
            >
              Uruchom eksport
            </Button>
          </div>
        </Panel>
      ) : activeExport === undefined ? null : (
        <>
          <ExportStatusPanel
            activeExport={activeExport}
            busy={busy}
            completeError={completeMutation.error}
            completing={completeMutation.isPending}
            onComplete={() =>
              completeMutation.mutate({ expectedVersion: run.version, runId: run.id })
            }
            onNewExport={configureNewExport}
            run={run}
          />
          {isCompletedExportStatus(activeExport.status) ? (
            <ExportManifestPanel completedExport={activeExport} />
          ) : isRunningExportStatus(activeExport.status) ? (
            <Loading label="Eksport jest przygotowywany…" />
          ) : null}
        </>
      )}
    </div>
  );
}
