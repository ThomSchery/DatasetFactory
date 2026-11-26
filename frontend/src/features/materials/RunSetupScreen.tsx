import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useNavigate, useSearchParams } from "react-router";

import {
  createRun,
  describeApiError,
  getProfile,
  getRun,
  invalidateFor,
  listMaterials,
  listProfiles,
  queryKeys,
  runPollInterval,
  startRun,
} from "../../api";
import type { ErrorPresentation, PipelineRun, RunAction } from "../../api";
import { annotationsPath } from "../../app/navigation";
import { Button } from "../../components/common/Button";
import { Field } from "../../components/common/Field";
import { GroupedOptionList } from "../../components/common/GroupedOptionList";
import { Icon } from "../../components/common/Icon";
import { Panel } from "../../components/common/Panel";
import { RegionOverlay, type OverlayShape } from "../../components/common/RegionOverlay";
import { TextField } from "../../components/common/TextField";
import { FatalError, InlineError, Loading } from "../../components/common/UiStates";
import { RunPanel } from "../dashboard/RunPanel";
import { useDashboard } from "../dashboard/dashboardQuery";
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
 * FE-034: the preview is the Profile picture field — a read-only
 * `RegionOverlay` with the profile's regions, the same zoom tools and height.
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
  const [createdRun, setCreatedRun] = useState<PipelineRun | null>(null);
  const retainedRun = useQuery({
    queryKey: queryKeys.run(createdRun?.id ?? "none"),
    queryFn: ({ signal }) => getRun(createdRun!.id, signal),
    enabled: createdRun !== null,
    initialData: createdRun ?? undefined,
    refetchInterval: (query) => runPollInterval(query.state.data?.status),
  });
  const displayedCreatedRun = retainedRun.data ?? createdRun;

  const form = useForm<RunLaunchValues>({
    resolver: zodResolver(runLaunchSchema),
    defaultValues: {
      profile_id: requestedProfileId ?? "",
      video_id: "",
      interval_ms: DEFAULT_INTERVAL_MS,
      ocr_engine: "",
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
  /** The asset URL whose image failed to load, and a key that remounts it on retry. */
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const [imageReloadKey, setImageReloadKey] = useState(0);
  const previewShapes: OverlayShape[] = (preview.data?.regions ?? []).map((region) => ({
    displayLabel: region.name,
    height: region.height,
    id: region.id,
    label: region.name,
    width: region.width,
    x: region.x,
    y: region.y,
  }));

  const launch = useMutation({
    mutationFn: async (values: RunLaunchValues): Promise<LaunchResult> => {
      const run = await createRun({
        profile_id: values.profile_id,
        video_id: values.video_id,
        interval_ms: values.interval_ms,
        ...(values.ocr_engine ? { ocr_engine: values.ocr_engine } : {}),
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
        setCreatedRun(result.run);
        setStartError(describeApiError(result.startError));
        return;
      }
      await invalidateFor(queryClient, { type: "run-transitioned", runId: result.run.id });
      // Starting a run is what puts `runId` in the URL (FE-04).
      void navigate(annotationsPath(result.run.id));
    },
  });

  const onTransitioned = (run: PipelineRun, action: RunAction) => {
    if (run.id === createdRun?.id) {
      setCreatedRun(run);
      setStartError(null);
    }
    if (action === "start") {
      void navigate(annotationsPath(run.id));
    }
  };

  const engines = dashboard.data?.system.ocr_engines ?? [];
  const defaultEngine = engines.find((engine) => engine.default);

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
      <Icon name="play" />
      Run
    </Button>
  );

  return (
    <div className="df-run-setup">
      <h1 className="df-run-setup__heading">Run Setup</h1>

      {/* FE-034: the same picture field as Profile, read-only. */}
      <section aria-label="Reference screenshot" className="df-run-setup__preview">
        {preview.isSuccess && failedImageUrl === preview.data.reference_asset_url ? (
          <FatalError
            description="The image could not be loaded from the API. The file may have moved out of the workspace."
            onRetry={() => {
              setFailedImageUrl(null);
              setImageReloadKey((key) => key + 1);
            }}
            title="The image did not load"
          />
        ) : preview.isSuccess ? (
          <RegionOverlay
            fill
            imageAlt={`Reference screenshot of profile ${preview.data.name}`}
            imageUrl={preview.data.reference_asset_url}
            key={`${preview.data.reference_asset_url}#${String(imageReloadKey)}`}
            label="HUD regions on the reference screenshot"
            onImageError={() => {
              setFailedImageUrl(preview.data.reference_asset_url);
            }}
            shapes={previewShapes}
            source={{ width: preview.data.source_width, height: preview.data.source_height }}
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
      </section>

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
                  <Icon name="film" />
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
                  icon="search"
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
                  icon="search"
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

          <Controller
            control={form.control}
            name="ocr_engine"
            render={({ field }) => (
              <div className="df-run-setup__picker">
                <p className="df-run-setup__label">
                  <Icon name="setting" />
                  <span>OCR engine</span>
                </p>
                <GroupedOptionList
                  disabled={loading || engines.length === 0}
                  emptyMessage="No OCR engine is available."
                  filterLabel="OCR engine"
                  icon="search"
                  groups={[
                    {
                      id: "engines",
                      label: "Available engines",
                      options: engines
                        .filter((engine) => engine.available)
                        .map((engine) => ({
                          detail: engine.default ? "default" : undefined,
                          id: engine.id,
                          label: engine.name,
                        })),
                    },
                  ]}
                  label="Available engines"
                  mode="single"
                  onChange={(ids) => {
                    field.onChange(ids[0] ?? "");
                  }}
                  placeholder={
                    engines.find((engine) => engine.id === (field.value || defaultEngine?.id))
                      ?.name ?? "Choose an engine"
                  }
                  selectedIds={[field.value || defaultEngine?.id || ""].filter(Boolean)}
                />
                {engines
                  .filter((engine) => !engine.available)
                  .map((engine) => (
                    <p className="df-run-setup__hint" key={engine.id}>
                      {engine.name} is not available: {engine.detail}
                    </p>
                  ))}
              </div>
            )}
          />

          <TextField
            {...form.register("interval_ms")}
            description="Milliseconds between sampled frames."
            error={form.formState.errors.interval_ms?.message}
            inputMode="numeric"
            label="Sample rate"
            labelIcon="setting"
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
        {displayedCreatedRun !== null ? (
          <RunPanel title="Created run" onTransitioned={onTransitioned} run={displayedCreatedRun} />
        ) : null}
        {retainedRun.isError ? <InlineError message={errorText(describeApiError(retainedRun.error))} /> : null}
        {dashboard.isSuccess && dashboard.data.run !== null && dashboard.data.run.id !== displayedCreatedRun?.id ? (
          <RunPanel onTransitioned={onTransitioned} run={dashboard.data.run} />
        ) : null}
      </Panel>
    </div>
  );
}
