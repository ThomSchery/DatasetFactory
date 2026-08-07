import { useNavigate } from "react-router";

import { describeApiError } from "../../api";
import type { Dashboard, PipelineRun, RunAction } from "../../api";
import { annotationsPath } from "../../app/navigation";
import { DataList } from "../../components/common/DataList";
import { Panel } from "../../components/common/Panel";
import { Empty, FatalError, Loading } from "../../components/common/UiStates";
import { OcrQualityWarning } from "./OcrQualityWarning";
import { RunPanel } from "./RunPanel";
import { SystemStatusPanel } from "./SystemStatusPanel";
import { useDashboard } from "./dashboardQuery";
import "./DashboardScreen.css";

function ProjectPanel({ dashboard }: { dashboard: Dashboard }) {
  const { profile, project } = dashboard;

  if (project === null && profile === null) {
    return (
      <Panel eyebrow="Projekt" title="Aktywny projekt">
        <Empty
          description="Instalacja jest pusta: nie ma jeszcze projektu ani profilu gry. Utwórz profil, a potem zaimportuj materiał."
          title="Brak aktywnego projektu"
        />
      </Panel>
    );
  }

  return (
    <Panel eyebrow="Projekt" title="Aktywny projekt">
      <DataList
        items={[
          { label: "Projekt", value: project?.name ?? "Brak projektu" },
          { label: "Profil gry", value: profile?.name ?? "Brak profilu" },
          {
            label: "Rozdzielczość profilu",
            value:
              profile === null
                ? "—"
                : `${String(profile.source_width)} × ${String(profile.source_height)}`,
          },
          { label: "Wersja profilu", value: profile?.version ?? "—" },
        ]}
        layout="columns"
      />
    </Panel>
  );
}

function FrameCountsPanel({ dashboard }: { dashboard: Dashboard }) {
  const counts = dashboard.frame_counts;

  return (
    <Panel
      description="Klatki aktywnego runu pogrupowane po statusie weryfikacji."
      eyebrow="Klatki"
      title="Klatki wg statusu"
    >
      <DataList
        items={[
          { label: "Oczekujące", value: counts.pending },
          { label: "Zaakceptowane", value: counts.accepted },
          { label: "Odrzucone", value: counts.rejected },
          {
            // TECH_PLAN §5 and TK-008: this counts frames that exist, which is
            // not `run.total_frames`, the number the run plans to produce.
            hint: "Liczba klatek, które już powstały. To nie jest liczba klatek zaplanowanych dla runu.",
            label: "Razem istniejących",
            value: counts.total,
          },
        ]}
        layout="columns"
      />
    </Panel>
  );
}

/**
 * The first screen: active project and run, frame counts per status and the
 * state of the local dependencies (CF-07).
 *
 * One query drives all of it, polled every 2 s only while the run is in a
 * status that can still change on its own — see `dashboardQuery.ts`.
 */
export function DashboardScreen() {
  const navigate = useNavigate();
  const dashboard = useDashboard();

  const onTransitioned = (run: PipelineRun, action: RunAction) => {
    // `runId` lives in the URL and nowhere else (FE-04), so starting a run is
    // what puts it there.
    if (action === "start") {
      void navigate(annotationsPath(run.id));
    }
  };

  if (dashboard.isPending) {
    return <Loading label="Ładowanie stanu systemu…" />;
  }

  if (dashboard.isError) {
    const failure = describeApiError(dashboard.error);
    return (
      <FatalError
        description={`${failure.message} ${failure.action}`}
        onRetry={() => void dashboard.refetch()}
        title="Nie udało się wczytać dashboardu"
      />
    );
  }

  const data = dashboard.data;

  return (
    <div className="df-dashboard">
      <OcrQualityWarning run={data.run} />

      <ProjectPanel dashboard={data} />

      {data.run === null ? (
        <Panel eyebrow="Run" title="Aktywny run">
          <Empty
            description="Żaden run nie jest w toku. Zaimportuj materiał i uruchom run na ekranie Materiały."
            title="Brak aktywnego runu"
          />
        </Panel>
      ) : (
        <RunPanel onTransitioned={onTransitioned} run={data.run} />
      )}

      <FrameCountsPanel dashboard={data} />

      <SystemStatusPanel system={data.system} />
    </div>
  );
}
