import { useNavigate } from "react-router";

import { describeApiError } from "../../api";
import type { PipelineRun, RunAction } from "../../api";
import { annotationsPath } from "../../app/navigation";
import { Panel } from "../../components/common/Panel";
import { Empty, FatalError, Loading } from "../../components/common/UiStates";
import { OcrQualityWarning } from "../dashboard/OcrQualityWarning";
import { RunPanel } from "../dashboard/RunPanel";
import { useDashboard } from "../dashboard/dashboardQuery";
import { MaterialImportForm } from "./MaterialImportForm";
import { MaterialList } from "./MaterialList";
import { RunLaunchForm } from "./RunLaunchForm";
import "./MaterialsScreen.css";

/**
 * The path from a video file to a running, observable run (CF-02).
 *
 * The run panel and the OCR warning are imported from the dashboard feature
 * rather than reimplemented: the dashboard owns the view of the active run
 * (CF-07), and a second copy is exactly how the persistent warning would go
 * missing on one screen.
 */
export function MaterialsScreen() {
  const navigate = useNavigate();
  const dashboard = useDashboard();

  const onTransitioned = (run: PipelineRun, action: RunAction) => {
    // Starting a run is what puts `runId` in the URL (FE-04, ticket §Logika.2).
    if (action === "start") {
      void navigate(annotationsPath(run.id));
    }
  };

  return (
    <div className="df-materials">
      <OcrQualityWarning run={dashboard.data?.run} />

      <MaterialImportForm />

      <MaterialList />

      <RunLaunchForm />

      {dashboard.isPending ? (
        <Panel eyebrow="Run" title="Aktywny run">
          <Loading label="Ładowanie stanu runu…" />
        </Panel>
      ) : null}

      {dashboard.isError ? (
        <Panel eyebrow="Run" title="Aktywny run">
          <FatalError
            description={(() => {
              const failure = describeApiError(dashboard.error);
              return `${failure.message} ${failure.action}`;
            })()}
            onRetry={() => void dashboard.refetch()}
            title="Nie udało się wczytać stanu runu"
          />
        </Panel>
      ) : null}

      {dashboard.isSuccess && dashboard.data.run === null ? (
        <Panel eyebrow="Run" title="Aktywny run">
          <Empty
            description="Utwórz run powyżej, a potem uruchom go tutaj. Uruchomienie przenosi na ekran anotacji."
            title="Brak aktywnego runu"
          />
        </Panel>
      ) : null}

      {dashboard.isSuccess && dashboard.data.run !== null ? (
        <RunPanel onTransitioned={onTransitioned} run={dashboard.data.run} />
      ) : null}
    </div>
  );
}
