import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useNavigate, useSearchParams } from "react-router";

import {
  createRun,
  describeApiError,
  getProfile,
  invalidateFor,
  listMaterials,
  listProfiles,
  queryKeys,
  startRun,
} from "../../api";
import type { ErrorPresentation, PipelineRun, RunAction } from "../../api";
import { annotationsPath } from "../../app/navigation";
import { Button } from "../../components/common/Button";
import { Field } from "../../components/common/Field";
import { GroupedOptionList } from "../../components/common/GroupedOptionList";
import { Icon } from "../../components/common/Icon";
import { Panel } from "../../components/common/Panel";
import { TextField } from "../../components/common/TextField";
import { FatalError, InlineError, Loading } from "../../components/common/UiStates";
import { RunPanel } from "../dashboard/RunPanel";
import { useDashboard } from "../dashboard/dashboardQuery";
import { ReferenceImage } from "../profiles/ReferenceImage";
import { DEFAULT_INTERVAL_MS, runLaunchSchema, type RunLaunchValues } from "./schemas";
import "./RunSetupScreen.css";

interface LaunchResult {
  run: PipelineRun;
  /** Why the created run did not start; it stays queued with a Start control. */
  startError: unknown;
}

function errorText(error: ErrorPresentation): string {
  return `${error.message} ${error.action} Code: ${error.code}.`;
}

/**
 * Run Setup, as Figma draws it (FE-022): the "Run Setup" heading and a 205 px
 * panel — Source file, Profile, Sample rate and the Run button at its foot —
 * beside the preview of the chosen profile's screenshot. Below 768 px the
 * preview comes first, then the panel, then Run across the full width.
 *
 * Run creates the run and starts it. Starting acquires the single run slot and
 * may answer `409 active_run`; the run then waits, queued, in the compact
 * active-run block under the button. The two pickers are comboboxes, never
 * native `<select>`s.
 */
export function RunSetupScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const dashboard = useDashboard();
  const materials = useQuery({
    queryKey: queryKeys.materialList({ page: 1, page_size: 100 }),
    queryFn: ({ signal }) => listMaterials({ page: 1, page_size: 100 }, signal),
  });
  const profiles = useQuery({
    queryKey: queryKeys.profiles(),
    queryFn: ({ signal }) => listProfiles(signal),
  });
  const requestedProfileId = searchParams.get("profile");
  const [startError, setStartError] = useState<ErrorPresentation | null>(null);

  const form = useForm<RunLaunchValues>({
    resolver: zodResolver(runLaunchSchema),
    defaultValues: {
      profile_id: requestedProfileId ?? "",
      video_id: "",
      interval_ms: DEFAULT_INTERVAL_MS,
    },
  });
  const chosenProfileId = form.watch("profile_id");
  const activeProfileId = profiles.data?.find((profile) => profile.active)?.id ?? null;
  const previewProfileId = chosenProfileId !== "" ? chosenProfileId : activeProfileId;

  const preview = useQuery({
    enabled: previewProfileId !== null,
    queryKey: queryKeys.profile(previewProfileId ?? "none"),
    queryFn: ({ signal }) => getProfile(previewProfileId as string, signal),
  });

  const launch = useMutation({
    mutationFn: async (values: RunLaunchValues): Promise<LaunchResult> => {
      const run = await createRun({
        profile_id: values.profile_id,
        video_id: values.video_id,
        interval_ms: values.interval_ms,
      });
      // A dashboard request started before POST can still be in flight. With
      // no cached result Query may otherwise reuse it and publish old state.
      await queryClient.cancelQueries({ queryKey: queryKeys.dashboard(), exact: true });
      try {
        return { run: await startRun(run.id, { expected_version: run.version }), startError: null };
      } catch (error) {
        return { run, startError: error };
      }
    },
    onSuccess: async (result) => {
      await invalidateFor(queryClient, { type: "run-created" });
      if (result.startError !== null) {
        setStartError(describeApiError(result.startError));
        return;
      }
      await invalidateFor(queryClient, { type: "run-transitioned", runId: result.run.id });
      // Starting a run is what puts `runId` in the URL (FE-04).
      void navigate(annotationsPath(result.run.id));
    },
  });

  const onTransitioned = (run: PipelineRun, action: RunAction) => {
    if (action === "start") {
      void navigate(annotationsPath(run.id));
    }
  };

  const failure = launch.isError ? describeApiError(launch.error) : null;
  const loading = materials.isPending || profiles.isPending;
  const loadError = materials.error ?? profiles.error;
  const materialItems = materials.data?.items ?? [];
  const profileItems = profiles.data ?? [];

  const runButton = (
    <Button
      className="df-run-setup__run"
      disabled={loading || loadError !== null}
      form="df-run-setup-form"
      loading={launch.isPending}
      loadingLabel="Starting the run…"
      size="lg"
      type="submit"
    >
      <Icon name="run" />
      Run
    </Button>
  );

  return (
    <div className="df-run-setup">
      <h1 className="df-run-setup__heading">Run Setup</h1>

      <div className="df-run-setup__preview">
        {preview.isSuccess ? (
          <ReferenceImage
            alt={`Reference screenshot of profile ${preview.data.name}`}
            url={preview.data.reference_asset_url}
          />
        ) : (
          <div className="df-run-setup__placeholder">
            {preview.isPending && previewProfileId !== null ? (
              <Loading label="Loading the profile preview…" />
            ) : preview.isError ? (
              <InlineError message={errorText(describeApiError(preview.error))} />
            ) : (
              <p>Choose a profile to see its screenshot.</p>
            )}
          </div>
        )}
      </div>

      <Panel className="df-run-setup__column" hideTitle radius="sm" title="Run settings">
        <div className="df-run-setup__fields">
        {loading ? <Loading label="Loading source files and profiles…" /> : null}
        {loadError !== null ? (
          <FatalError
            description={errorText(describeApiError(loadError))}
            onRetry={() => {
              void materials.refetch();
              void profiles.refetch();
            }}
            title="Source files and profiles could not be loaded"
          />
        ) : null}
        <form
          className="df-run-setup__form"
          id="df-run-setup-form"
          noValidate
          onSubmit={form.handleSubmit((values) => {
            setStartError(null);
            launch.mutate(values);
          })}
        >
          <Controller
            control={form.control}
            name="video_id"
            render={({ field, fieldState }) => (
              <div className="df-run-setup__picker">
                <p className="df-run-setup__label">
                  <Icon name="folder" />
                  <span>Source file</span>
                </p>
                <GroupedOptionList
                  disabled={loading}
                  emptyMessage={
                    materialItems.length === 0
                      ? "No video imported yet. Add one on Upload."
                      : "No source file matches."
                  }
                  filterLabel="Source file"
                  groups={[
                    {
                      id: "materials",
                      label: "Imported videos",
                      options: materialItems.map((material) => ({
                        detail: `${String(material.width)}×${String(material.height)}`,
                        id: material.id,
                        label: material.basename,
                      })),
                    },
                  ]}
                  label="Imported videos"
                  mode="single"
                  onChange={(ids) => {
                    field.onChange(ids[0] ?? "");
                  }}
                  placeholder={
                    materialItems.find((item) => item.id === field.value)?.basename ??
                    "Choose a source file"
                  }
                  selectedIds={field.value === "" ? [] : [field.value]}
                />
                {fieldState.error === undefined ? null : (
                  <p className="df-run-setup__error" role="alert">
                    {fieldState.error.message}
                  </p>
                )}
              </div>
            )}
          />

          <Controller
            control={form.control}
            name="profile_id"
            render={({ field, fieldState }) => (
              <div className="df-run-setup__picker">
                <p className="df-run-setup__label">
                  <Icon name="profile" />
                  <span>Profile</span>
                </p>
                <GroupedOptionList
                  disabled={loading}
                  emptyMessage={
                    profileItems.length === 0
                      ? "No profile yet. Create one in Setup for scan."
                      : "No profile matches."
                  }
                  filterLabel="Profile"
                  groups={[
                    {
                      id: "profiles",
                      label: "Saved profiles",
                      options: profileItems.map((profile) => ({
                        id: profile.id,
                        label: profile.name,
                      })),
                    },
                  ]}
                  label="Saved profiles"
                  mode="single"
                  onChange={(ids) => {
                    field.onChange(ids[0] ?? "");
                  }}
                  placeholder={
                    profileItems.find((item) => item.id === field.value)?.name ??
                    "Choose a profile"
                  }
                  selectedIds={field.value === "" ? [] : [field.value]}
                />
                {fieldState.error === undefined ? null : (
                  <p className="df-run-setup__error" role="alert">
                    {fieldState.error.message}
                  </p>
                )}
              </div>
            )}
          />

          <TextField
            {...form.register("interval_ms")}
            description="Milliseconds between sampled frames."
            error={form.formState.errors.interval_ms?.message}
            inputMode="numeric"
            label="Sample rate"
            labelIcon="settings"
            suffix="ms"
          />
        </form>
        </div>

        <div className="df-run-setup__run-slot">{runButton}</div>

        {failure === null ? null : <InlineError message={errorText(failure)} />}
        {startError === null ? null : <InlineError message={errorText(startError)} />}

        {dashboard.isError ? (
          <InlineError message={errorText(describeApiError(dashboard.error))} />
        ) : null}
        {dashboard.isSuccess && dashboard.data.run !== null ? (
          <RunPanel onTransitioned={onTransitioned} run={dashboard.data.run} />
        ) : null}
      </Panel>
    </div>
  );
}
