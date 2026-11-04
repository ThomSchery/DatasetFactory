import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { useState } from "react";

import { describeApiError, getCurrentProfile, getProfile, queryKeys } from "../../api";
import type { PipelineRun, RunAction } from "../../api";
import { annotationsPath } from "../../app/navigation";
import { Panel } from "../../components/common/Panel";
import { Empty, FatalError, Loading } from "../../components/common/UiStates";
import { OcrQualityWarning } from "../dashboard/OcrQualityWarning";
import { RunPanel } from "../dashboard/RunPanel";
import { useDashboard } from "../dashboard/dashboardQuery";
import { ReferenceImage } from "../profiles/ReferenceImage";
import { RunLaunchForm } from "./RunLaunchForm";
import "./RunSetupScreen.css";

/**
 * Run Setup, laid out as the Figma document draws it: a narrow column of
 * controls on the left and the image they describe filling the rest.
 *
 * The image is the reference frame of the profile the run will use, read from
 * `GET /profiles/current` — not a screenshot from the design. A profile that
 * does not exist yet shows why the column on the left cannot start a run,
 * instead of a placeholder that implies one is ready.
 */
export function RunSetupScreen() {
  const navigate = useNavigate();
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const dashboard = useDashboard();
  const profile = useQuery({
    queryKey: selectedProfileId === "" ? queryKeys.currentProfile() : queryKeys.profile(selectedProfileId),
    queryFn: ({ signal }) => selectedProfileId === "" ? getCurrentProfile(signal) : getProfile(selectedProfileId, signal),
  });

  const onTransitioned = (run: PipelineRun, action: RunAction) => {
    // Starting a run is what puts `runId` in the URL (FE-04, ticket §Logika.2).
    if (action === "start") {
      void navigate(annotationsPath(run.id));
    }
  };

  return (
    <div className="df-run-setup">
      <OcrQualityWarning run={dashboard.data?.run} />

      <div className="df-run-setup__workspace">
        <div className="df-run-setup__controls">
          <RunLaunchForm onProfileChange={setSelectedProfileId} />
        </div>

        <div className="df-run-setup__canvas">
          {profile.isPending ? <Loading label="Ładowanie profilu runu…" /> : null}
          {profile.isError ? (
            <FatalError
              description={(() => {
                const failure = describeApiError(profile.error);
                return `${failure.message} ${failure.action}`;
              })()}
              onRetry={() => void profile.refetch()}
              title="Nie udało się wczytać profilu"
            />
          ) : null}
          {profile.isSuccess && profile.data === null ? (
            <Empty
              description="Run czyta regiony z profilu gry. Zdefiniuj profil, żeby zobaczyć tu jego zrzut referencyjny."
              title="Brak profilu do pokazania"
            />
          ) : null}
          {profile.isSuccess && profile.data !== null ? (
            <ReferenceImage
              alt={`Zrzut referencyjny profilu ${profile.data.name}`}
              caption={`${profile.data.name} · ${String(profile.data.source_width)} × ${String(profile.data.source_height)} px`}
              url={profile.data.reference_asset_url}
            />
          ) : null}
        </div>
      </div>

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
            description="Utwórz run po lewej, a potem uruchom go tutaj. Uruchomienie przenosi na ekran anotacji."
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
