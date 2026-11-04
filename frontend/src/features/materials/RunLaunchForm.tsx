import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";

import {
  createRun,
  describeApiError,
  invalidateFor,
  listMaterials,
  listProfiles,
  queryKeys,
} from "../../api";
import type { PipelineRun } from "../../api";
import { Button } from "../../components/common/Button";
import { Panel } from "../../components/common/Panel";
import { SelectField } from "../../components/common/SelectField";
import { TextField } from "../../components/common/TextField";
import { Empty, FatalError, InlineError, Loading } from "../../components/common/UiStates";
import { DEFAULT_INTERVAL_MS, runLaunchSchema, type RunLaunchValues } from "./schemas";
import "./MaterialsScreen.css";

/**
 * `POST /runs` — profile, material and sampling interval (CF-02.1/3).
 *
 * The run is created in `queued`; it is the dashboard's run panel that starts
 * it, because starting is what acquires the single global run slot and can
 * answer `409 active_run`.
 *
 * The profile collection supplies the choices; selection also drives the
 * adjacent reference image in Run Setup.
 */
export function RunLaunchForm({ onCreated, onProfileChange }: { onCreated?: (run: PipelineRun) => void; onProfileChange?: (profileId: string) => void }) {
  const queryClient = useQueryClient();

  const materials = useQuery({
    queryKey: queryKeys.materialList({ page: 1, page_size: 100 }),
    queryFn: ({ signal }) => listMaterials({ page: 1, page_size: 100 }, signal),
  });
  const profile = useQuery({
    queryKey: queryKeys.profiles(),
    queryFn: ({ signal }) => listProfiles(signal),
  });

  const form = useForm<RunLaunchValues>({
    resolver: zodResolver(runLaunchSchema),
    defaultValues: { profile_id: "", video_id: "", interval_ms: DEFAULT_INTERVAL_MS },
  });

  const mutation = useMutation({
    mutationFn: (values: RunLaunchValues) =>
      createRun({
        profile_id: values.profile_id,
        video_id: values.video_id,
        interval_ms: values.interval_ms,
      }),
    onSuccess: async (run) => {
      // A dashboard request started before POST can still be in flight. With
      // no cached result Query may otherwise reuse it and publish old state.
      await queryClient.cancelQueries({ queryKey: queryKeys.dashboard(), exact: true });
      await invalidateFor(queryClient, { type: "run-created" });
      onCreated?.(run);
    },
  });

  const failure = mutation.isError ? describeApiError(mutation.error) : null;

  if (materials.isPending || profile.isPending) {
    return (
      <Panel eyebrow="Run" title="Uruchomienie runu">
        <Loading label="Ładowanie materiałów i profilu…" />
      </Panel>
    );
  }

  if (materials.isError || profile.isError) {
    const error = describeApiError(materials.error ?? profile.error);
    return (
      <Panel eyebrow="Run" title="Uruchomienie runu">
        <FatalError
          description={`${error.message} ${error.action}`}
          onRetry={() => {
            void materials.refetch();
            void profile.refetch();
          }}
          title="Nie udało się wczytać danych do uruchomienia runu"
        />
      </Panel>
    );
  }

  const materialOptions = materials.data.items.map((material) => ({
    label: `${material.basename} — ${String(material.width)}×${String(material.height)}`,
    value: material.id,
  }));
  const profileOptions = profile.data.map((item) => ({ label: item.name, value: item.id }));

  if (materialOptions.length === 0 || profileOptions.length === 0) {
    return (
      <Panel eyebrow="Run" title="Uruchomienie runu">
        <Empty
          description={
            profileOptions.length === 0
              ? "Run potrzebuje profilu gry. Utwórz profil, zanim uruchomisz przetwarzanie."
              : "Run potrzebuje materiału. Zaimportuj plik wideo powyżej."
          }
          title="Brak danych do uruchomienia runu"
        />
      </Panel>
    );
  }

  return (
    <Panel
      description="Run przetwarza wybrany materiał regionami z profilu, klatka po klatce."
      eyebrow="Run"
      title="Uruchomienie runu"
    >
      <form
        noValidate
        onSubmit={form.handleSubmit((values) => {
          mutation.mutate(values);
        })}
      >
        <SelectField
          {...form.register("video_id")}
          error={form.formState.errors.video_id?.message}
          label="Materiał"
          options={materialOptions}
          placeholder="Wybierz materiał"
        />

        <SelectField
          {...form.register("profile_id")}
          onChange={(event) => {
            void form.register("profile_id").onChange(event);
            onProfileChange?.(event.target.value);
          }}
          description="W v1 rozdzielczość materiału musi zgadzać się z rozdzielczością profilu."
          error={form.formState.errors.profile_id?.message}
          label="Profil gry"
          options={profileOptions}
          placeholder="Wybierz profil"
        />

        <TextField
          {...form.register("interval_ms")}
          description="Co ile milisekund pobrać klatkę. Domyślnie 1000 ms."
          error={form.formState.errors.interval_ms?.message}
          inputMode="numeric"
          label="Interwał próbkowania (ms)"
          width="short"
        />

        <div className="df-materials__actions">
          <Button loading={mutation.isPending} loadingLabel="Tworzenie runu…" type="submit">
            Utwórz run
          </Button>
        </div>
      </form>

      {failure === null ? null : (
        <div className="df-materials__feedback">
          <InlineError message={`${failure.message} ${failure.action}`} />
          <p className="df-materials__code">
            Kod błędu: <code>{failure.code}</code>
          </p>
        </div>
      )}
    </Panel>
  );
}
