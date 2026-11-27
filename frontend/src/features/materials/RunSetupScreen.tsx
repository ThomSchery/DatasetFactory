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
import type { CreateRunRequest, ErrorPresentation, PipelineRun, RunAction } from "../../api";
import { annotationsPath } from "../../app/navigation";
import { Button } from "../../components/common/Button";
import { GroupedOptionList } from "../../components/common/GroupedOptionList";
import { Icon } from "../../components/common/Icon";
import { Panel } from "../../components/common/Panel";
import { RegionOverlay, type OverlayShape } from "../../components/common/RegionOverlay";
import { TextField } from "../../components/common/TextField";
import { FatalError, InlineError, Loading } from "../../components/common/UiStates";
import { RunPanel } from "../dashboard/RunPanel";
import { useDashboard } from "../dashboard/dashboardQuery";
import { formatDuration } from "./materialFormat";
import { textLayoutName } from "../profiles/schemas";
import { effectiveTextLayout, ScanRules } from "./ScanRules";
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

/** FE-038: the engine listed first on Run. */
const FIRST_OCR_ENGINE = "rapidocr";
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
  const [runRules, setRunRules] = useState<{ profileId: string; layouts: Record<string, string> }>({ profileId: "", layouts: {} });
  const layouts = runRules.profileId === preview.data?.id ? runRules.layouts : {};
  // FE-038: RapidOCR leads the list and nothing is chosen until the operator
  // picks an engine; the backend default is never pre-selected.
  const engines = [...(dashboard.data?.system.ocr_engines ?? [])].sort(
    (a, b) => Number(b.id === FIRST_OCR_ENGINE) - Number(a.id === FIRST_OCR_ENGINE),
  );
  const engineChoiceRequired = engines.some((engine) => engine.available);
  const engineId = form.watch("ocr_engine");
  const selectedEngine = engines.find((engine) => engine.id === engineId);
  // FE-038: scan rules exist only for an engine that reads the text layout;
  // any other engine detects text on its own, so every region is Automatic.
  const usesTextLayout = selectedEngine?.uses_text_layout === true;
  const previewShapes: OverlayShape[] = (preview.data?.regions ?? []).map((region) => ({
    displayLabel: selectedEngine === undefined
      ? region.name
      : `${region.name} · ${usesTextLayout ? textLayoutName(effectiveTextLayout(region, layouts)) : "Automatic"}`,
    height: region.height,
    id: region.id,
    label: region.name,
    width: region.width,
    x: region.x,
    y: region.y,
  }));

  const launch = useMutation({
    mutationFn: async (values: RunLaunchValues & Pick<CreateRunRequest, "region_text_layouts">): Promise<LaunchResult> => {
      const run = await createRun({
        profile_id: values.profile_id,
        video_id: values.video_id,
        interval_ms: values.interval_ms,
        ...(values.ocr_engine ? { ocr_engine: values.ocr_engine } : {}),
        ...(values.region_text_layouts ? { region_text_layouts: values.region_text_layouts } : {}),
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


  const failure = launch.isError ? describeApiError(launch.error) : null;
  const loading = materials.isPending || profiles.isPending;
  const loadError = materials.error ?? profiles.error;
  const materialItems = materials.data?.items ?? [];
  const profileItems = profiles.data ?? [];

  const selectedVideoId = form.watch("video_id");
  const selectedMaterial = materialItems.find((item) => item.id === selectedVideoId);
  const interval = Number(form.watch("interval_ms"));

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
            trailing={<span className="df-run-setup__hint">Each box is read with the rule set for it.</span>}
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
            if (engineChoiceRequired && !values.ocr_engine) {
              form.setError("ocr_engine", { type: "required", message: "Choose an OCR engine." });
              return;
            }
            setStartError(null);
            launch.mutate({
              ...values,
              ...(usesTextLayout && runRules.profileId === values.profile_id && Object.keys(layouts).length > 0
                ? { region_text_layouts: layouts } : {}),
            });
          }, (errors) => {
            // Every missing choice is named at once, the engine included.
            if (engineChoiceRequired && !form.getValues("ocr_engine") && errors.ocr_engine === undefined) {
              form.setError("ocr_engine", { type: "required", message: "Choose an OCR engine." });
            }
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
                  showSelectedDetail
                  filterLabel="Source file"
                  icon="search"
                  groups={[
                    {
                      id: "materials",
                      label: "Imported videos",
                      options: materialItems.map((material) => ({
                        detail: `${formatDuration(material.duration_ms)} · ${String(material.width)}×${String(material.height)}`,
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
                  showSelectedDetail
                  filterLabel="Profile"
                  icon="search"
                  groups={[
                    {
                      id: "profiles",
                      label: "Saved profiles",
                      options: profileItems.map((profile) => ({
                        id: profile.id,
                        label: profile.name,
                        detail: `${profile.region_count} regions`,
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
            render={({ field, fieldState }) => (
              <div className="df-run-setup__picker df-run-setup__picker--engine">
                <p className="df-run-setup__label">
                  <Icon name="setting" />
                  <span>OCR engine</span>
                </p>
                <div aria-label="OCR engine" className="df-run-setup__engines" role="group">
                  {engines.map((engine) => (
                    <Button
                      aria-pressed={field.value === engine.id}
                      className="df-run-setup__engine"
                      disabled={loading || !engine.available}
                      key={engine.id}
                      onClick={() => {
                        field.onChange(engine.id);
                        form.clearErrors("ocr_engine");
                      }}
                      variant="secondary"
                    >
                      <span aria-hidden="true" className="df-run-setup__radio" />
                      <span className="df-run-setup__engine-copy">
                        <strong>{engine.name}</strong>
                        <small>{engine.available
                          ? engine.uses_text_layout ? "Uses the region text layout" : "Automatic text detection"
                          : `Not available: ${engine.detail}`}</small>
                      </span>
                    </Button>
                  ))}
                </div>
                {engines.length === 0 ? <p className="df-run-setup__hint">No OCR engine is available.</p> : null}
                {fieldState.error === undefined ? null : (
                  <p className="df-run-setup__error" role="alert">
                    {fieldState.error.message}
                  </p>
                )}
              </div>
            )}
          />

          {usesTextLayout && preview.isSuccess && preview.data.regions.length > 0 ? (
            <ScanRules
              disabled={launch.isPending}
              key={preview.data.id}
              layouts={layouts}
              onChange={(next) => { setRunRules({ profileId: preview.data.id, layouts: next }); }}
              regions={preview.data.regions}
            />
          ) : null}

          <TextField
            {...form.register("interval_ms")}
            error={form.formState.errors.interval_ms?.message}
            inputMode="numeric"
            label="Sample rate"
            labelIcon="setting"
            suffix="ms"
          />
          <div aria-label="Sample rate presets" className="df-run-setup__rates" role="group">
            {[500, 1000, 2000].map((rate) => (
              <Button aria-pressed={Number(form.watch("interval_ms")) === rate} key={rate}
                onClick={() => { form.setValue("interval_ms", rate, { shouldValidate: true }); }}
                size="sm" variant="secondary">{rate}</Button>
            ))}
          </div>
        </form>
        </div>

        <div className="df-run-setup__run-slot">{runButton}</div>

        {selectedMaterial && interval > 0 && Number.isInteger(interval) && chosenProfileId && preview.isSuccess ? (
          <p className="df-run-setup__hint">
            {Math.max(1, Math.ceil(selectedMaterial.duration_ms / interval))} frames · {preview.data.regions.length} regions
            {selectedEngine ? ` · ${selectedEngine.name}` : ""}
          </p>
        ) : null}

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
