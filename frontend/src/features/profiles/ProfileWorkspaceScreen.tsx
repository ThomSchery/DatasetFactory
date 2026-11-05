import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useBlocker, useNavigate } from "react-router";

import {
  CHARACTER_CLASS_ALPHABET,
  categoriesInUseFromError,
  createProfile,
  createReferencePreview,
  describeApiError,
  getProfile,
  invalidateFor,
  isVersionConflict,
  listProfiles,
  queryKeys,
  referenceAssetUrl,
  regionNameConflictFromError,
  saveProfileDefinition,
} from "../../api";
import type { GameProfile } from "../../api";
import { runSetupPath } from "../../app/navigation";
import { Button } from "../../components/common/Button";
import { Dialog } from "../../components/common/Dialog";
import { FilePickerTile } from "../../components/common/FilePickerTile";
import { Icon } from "../../components/common/Icon";
import { RegionOverlay, type OverlayShape, type SourceRect, type SourceSize } from "../../components/common/RegionOverlay";
import { TextField } from "../../components/common/TextField";
import { FatalError, InlineError, Loading } from "../../components/common/UiStates";
import { useLocalFilePicker } from "../files";
import { AnnotationsPanel } from "./AnnotationsPanel";
import { ClassGroupsPanel } from "./ClassGroupsPanel";
import { ProfileSearchField } from "./ProfileSearchField";
import {
  createRequestFrom,
  draftFromProfile,
  emptyDraft,
  hasRegionNamed,
  isDirty,
  nextRegionName,
  saveRequestFrom,
  withAcceptedSketch,
  characterAlphabetOf,
  type ProfileDraft,
} from "./profileDraft";
import { DEFAULT_REGION_PAGE_SEGMENTATION_MODE } from "./schemas";
import "./ProfileWorkspaceScreen.css";

/*
 * One workspace for both "define a new profile" and "open an existing one",
 * which is what the user asked for and what the Figma document draws: the
 * panels never change, only what is loaded into them.
 *
 * Three rules shape the state in here:
 *
 *  1. The draft is local and the baseline is what the backend last confirmed.
 *     Dirty is the difference between them, so a save that fails leaves the
 *     draft exactly where the operator left it.
 *  2. A late answer may not land on a context that moved on. Every load checks
 *     the id it came back with against the one that is open now.
 *  3. Nothing is discarded silently. Switching profiles, starting a new one or
 *     replacing the screenshot while dirty asks first.
 */

type PendingSwitch =
  | { kind: "profile"; profileId: string }
  | { kind: "new" }
  | { kind: "image"; path: string };

export interface ProfileWorkspaceScreenProps {
  /** Opens on an empty draft instead of the active profile. */
  initialCreate?: boolean;
}

export function ProfileWorkspaceScreen({ initialCreate = false }: ProfileWorkspaceScreenProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [draft, setDraft] = useState<ProfileDraft>(emptyDraft);
  const [baseline, setBaseline] = useState<ProfileDraft>(draft);
  const [openProfileId, setOpenProfileId] = useState<string | null>(null);
  const [wantedProfileId, setWantedProfileId] = useState<string | null>(null);
  const [startedBlank, setStartedBlank] = useState(initialCreate);
  const [selectedRegionKey, setSelectedRegionKey] = useState<string | null>(null);
  const [drawMode, setDrawMode] = useState(false);
  const [geometryPreview, setGeometryPreview] = useState<{ id: string; rect: SourceRect } | null>(null);
  const [sketch, setSketch] = useState<SourceRect | null>(null);
  const [sketchName, setSketchName] = useState("");
  const [sketchError, setSketchError] = useState<string | undefined>(undefined);
  const [source, setSource] = useState<SourceSize | null>(null);
  const [changeImageOpen, setChangeImageOpen] = useState(false);
  const [pending, setPending] = useState<PendingSwitch | null>(null);
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [saveAsName, setSaveAsName] = useState("");
  const [saveAsError, setSaveAsError] = useState<string | undefined>(undefined);
  const [customOpen, setCustomOpen] = useState(true);
  const sketchInputRef = useRef<HTMLInputElement | null>(null);

  const profiles = useQuery({
    queryKey: queryKeys.profiles(),
    queryFn: ({ signal }) => listProfiles(signal),
  });

  // Which profile the workspace wants open: an explicit choice, else the
  // active one, unless the operator asked to start from a blank draft.
  const activeId = profiles.data?.find((profile) => profile.active)?.id ?? null;
  const targetId = startedBlank ? wantedProfileId : (wantedProfileId ?? activeId);

  const detail = useQuery({
    queryKey: queryKeys.profile(targetId ?? "none"),
    queryFn: ({ signal }) => getProfile(targetId as string, signal),
    enabled: targetId !== null,
  });

  const dirty = isDirty(draft, baseline);
  const hasUnsavedWork = dirty || sketch !== null;

  const load = useCallback((profile: GameProfile) => {
    const next = draftFromProfile(profile);
    setDraft(next);
    setBaseline(next);
    setOpenProfileId(profile.id);
    setSelectedRegionKey(null);
    setGeometryPreview(null);
    setSketch(null);
    setSketchName("");
    setSketchError(undefined);
    setSource({ width: profile.source_width, height: profile.source_height });
  }, []);

  useEffect(() => {
    const loaded = detail.data;
    if (loaded === undefined || targetId === null) {
      return;
    }
    // Rule 2: an answer that belongs to a profile the workspace has already
    // left must not overwrite the one that is open.
    if (loaded.id !== targetId || loaded.id === openProfileId) {
      return;
    }
    load(loaded);
  }, [detail.data, load, openProfileId, targetId]);

  const save = useMutation({
    mutationFn: (current: ProfileDraft) =>
      saveProfileDefinition(current.profileId as string, saveRequestFrom(current)),
    onSuccess: async (profile) => {
      load(profile);
      await invalidateFor(queryClient, {
        type: "profile-definition-saved",
        profileId: profile.id,
      });
    },
  });

  const saveAs = useMutation({
    mutationFn: ({ current, name }: { current: ProfileDraft; name: string }) =>
      createProfile(createRequestFrom(current, name)),
    onSuccess: async (profile) => {
      setSaveAsOpen(false);
      setSaveAsName("");
      setStartedBlank(false);
      setWantedProfileId(profile.id);
      load(profile);
      await invalidateFor(queryClient, { type: "profile-created" });
    },
  });

  const preview = useMutation({
    mutationFn: (path: string) => createReferencePreview({ reference_image_path: path }),
    onSuccess: (result) => {
      // Geometry is in the pixels of one picture. A different picture means
      // the old rectangles describe nothing, so they go rather than quietly
      // landing somewhere else.
      setDraft((current) => ({
        ...current,
        profileId: null,
        version: null,
        referenceAssetId: result.asset_id,
        referenceAssetUrl: referenceAssetUrl(result.asset_id),
        sourceWidth: result.width,
        sourceHeight: result.height,
        regions: [],
      }));
      setOpenProfileId(null);
      setWantedProfileId(null);
      setStartedBlank(true);
      setSelectedRegionKey(null);
      setSketch(null);
      setSource({ width: result.width, height: result.height });
      setChangeImageOpen(false);
    },
  });

  const busy = save.isPending || saveAs.isPending || preview.isPending;
  // A detail request can finish after the operator starts interacting. Until
  // its target is loaded, the previous draft must not be editable.
  const editingDisabled = busy || (!startedBlank && profiles.isPending) ||
    (targetId !== null && targetId !== openProfileId);
  const blocker = useBlocker(hasUnsavedWork || busy);

  useEffect(() => {
    if (!hasUnsavedWork && !busy) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsavedWork, busy]);

  useEffect(() => {
    if (!drawMode) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawMode(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawMode]);

  function requestSwitch(next: PendingSwitch) {
    if (next.kind === "profile" && next.profileId === openProfileId && !hasUnsavedWork) return;
    if (hasUnsavedWork) {
      setPending(next);
      return;
    }
    applySwitch(next);
  }

  function applySwitch(next: PendingSwitch) {
    setPending(null);
    save.reset();
    saveAs.reset();
    preview.reset();
    if (next.kind === "profile") {
      if (next.profileId === openProfileId) {
        setDraft(baseline);
        setSketch(null);
        setSketchName("");
        setSketchError(undefined);
        setSelectedRegionKey(null);
      }
      setStartedBlank(false);
      setWantedProfileId(next.profileId);
      return;
    }
    if (next.kind === "new") {
      const blank = emptyDraft();
      setDraft(blank);
      setBaseline(blank);
      setOpenProfileId(null);
      setWantedProfileId(null);
      setStartedBlank(true);
      setSelectedRegionKey(null);
      setSketch(null);
      setSource(null);
      preview.reset();
      return;
    }
    preview.mutate(next.path);
  }

  const imagePicker = useLocalFilePicker("image", (path) => {
    requestSwitch({ kind: "image", path });
  });

  function acceptSketch() {
    if (sketch === null) {
      return;
    }
    const name = sketchName.trim();
    if (name === "") {
      setSketchError("Name the region before accepting it.");
      return;
    }
    if (hasRegionNamed(draft, name)) {
      setSketchError("A region with this name already exists in this profile.");
      return;
    }
    const next = withAcceptedSketch(draft, sketch, name);
    setDraft(next);
    setSelectedRegionKey(next.regions[next.regions.length - 1].key);
    setSketch(null);
    setSketchName("");
    setSketchError(undefined);
  }

  function rejectSketch() {
    setSketch(null);
    setSketchName("");
    setSketchError(undefined);
  }

  const selectedRegion = draft.regions.find((region) => region.key === selectedRegionKey) ?? null;
  const shapes: OverlayShape[] = [
    ...draft.regions.map(
      (region): OverlayShape => ({
        displayLabel: region.name,
        ...(geometryPreview?.id === region.key ? geometryPreview.rect : region),
        id: region.key,
        label: region.name,
      }),
    ),
    ...(sketch === null
      ? []
      : [
          {
            ...(geometryPreview?.id === SKETCH_ID ? geometryPreview.rect : sketch),
            id: SKETCH_ID,
            label: "New region, waiting for a name",
            tone: "draft" as const,
          },
        ]),
  ];

  const saveFailure = save.isError ? describeApiError(save.error) : null;
  const inUse = categoriesInUseFromError(save.error);
  const regionConflict = regionNameConflictFromError(save.error);
  const saveAsFailure = saveAs.isError ? describeApiError(saveAs.error) : null;
  const previewFailure = preview.isError ? describeApiError(preview.error) : null;
  const canSave = draft.profileId !== null && draft.version !== null && dirty;
  const renamedOcrBlockers = draft.regions.filter((region) =>
    baseline.categories.some((original) => {
      if (original.kind !== "character" || region.allowed_chars === null || !region.allowed_chars.includes(original.name)) return false;
      const updated = draft.categories.find((category) => category.key === original.key);
      return updated === undefined || updated.name !== original.name || updated.kind !== original.kind;
    }),
  );

  function submitSaveAs() {
    if (busy) return;
    const name = saveAsName.trim();
    if (name === "") {
      setSaveAsError("Enter a name for the new profile.");
      return;
    }
    const taken = profiles.data?.some(
      (profile) => profile.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (taken === true) {
      setSaveAsError("A profile with this name already exists. Choose another name.");
      return;
    }
    if (draft.regions.length === 0) {
      setSaveAsError("Draw at least one region before saving the profile.");
      return;
    }
    saveAs.mutate({ current: draft, name });
  }

  const pickerError =
    imagePicker.error === null ? undefined : `${imagePicker.error.message} ${imagePicker.error.action}`;
  const imageError =
    previewFailure === null
      ? pickerError
      : `${previewFailure.message} ${previewFailure.action} Code: ${previewFailure.code}.`;
  const saveTitle =
    draft.profileId === null
      ? "A new profile is saved with Save as first"
      : sketch !== null
        ? "Accept or reject the drawn box first"
        : !dirty
          ? "No changes to save"
          : undefined;

  const imagePanel =
    draft.referenceAssetUrl === null ? (
      <div className="df-profile-workspace__empty-image">
        <FilePickerTile
          busy={imagePicker.picking || preview.isPending}
          busyLabel={preview.isPending ? "Loading the screenshot…" : "Waiting for the file dialog…"}
          disabled={editingDisabled}
          error={imageError}
          icon="image"
          label="Add screenshot (JPG/PNG)"
          onPath={(path) => {
            requestSwitch({ kind: "image", path });
          }}
          onPick={imagePicker.pick}
          pathLabel="Screenshot path"
          pathPlaceholder="D:\games\hud.png"
        />
      </div>
    ) : (
      <RegionOverlay
        disabled={editingDisabled}
        fill
        imageAlt={
          draft.profileId === null
            ? "Screenshot of the new profile with its regions"
            : `Reference screenshot of profile ${draft.name} with its regions`
        }
        imageUrl={draft.referenceAssetUrl}
        interactionMode={drawMode ? "draw" : "select"}
        label="HUD regions on the reference screenshot"
        onDraw={(rect) => {
          setSketch(rect);
          setSketchName(nextRegionName(draft));
          setSketchError(undefined);
          setSelectedRegionKey(null);
          // The design puts the cursor in the class field the moment a box
          // exists, so naming is one gesture rather than a hunt.
          window.requestAnimationFrame(() => {
            sketchInputRef.current?.focus();
            sketchInputRef.current?.select();
          });
        }}
        onRemove={(id) => {
          if (id === SKETCH_ID) {
            rejectSketch();
            return;
          }
          setDraft((current) => ({
            ...current,
            regions: current.regions.filter((region) => region.key !== id),
          }));
          setSelectedRegionKey((current) => (current === id ? null : current));
        }}
        onSelect={(id) => {
          if (id !== SKETCH_ID) {
            setSelectedRegionKey(id);
          }
        }}
        onShapeChange={drawMode ? undefined : (id, rect) => setGeometryPreview({ id, rect })}
        onShapeChangeCancel={() => setGeometryPreview(null)}
        onShapeChangeEnd={(id, rect) => {
          setGeometryPreview(null);
          if (id === SKETCH_ID) {
            setSketch(rect);
            return;
          }
          setDraft((current) => ({
            ...current,
            regions: current.regions.map((region) =>
              region.key === id ? { ...region, ...rect } : region,
            ),
          }));
        }}
        onSourceResolved={setSource}
        selectedId={sketch === null ? selectedRegionKey : SKETCH_ID}
        shapes={shapes}
        source={source}
        tools={
          <>
            <Button
              aria-label="Draw region"
              aria-pressed={drawMode}
              className="df-profile-workspace__tool"
              disabled={editingDisabled}
              onClick={() => setDrawMode((active) => !active)}
              size="sm"
              title="Draw region (Escape ends drawing)"
            >
              <Icon name="draw" />
            </Button>
            <Button
              aria-label="Change screenshot"
              className="df-profile-workspace__tool"
              disabled={editingDisabled}
              onClick={() => {
                imagePicker.reset();
                preview.reset();
                setChangeImageOpen(true);
              }}
              size="sm"
              title="Change screenshot"
            >
              <Icon name="image" />
            </Button>
          </>
        }
        trailing={
          <Button
            className="df-profile-workspace__run"
            disabled={draft.profileId === null}
            onClick={() => {
              void navigate(runSetupPath(draft.profileId));
            }}
            size="md"
            title={draft.profileId === null ? "Save the profile first" : "Run with this profile"}
          >
            <Icon name="run" />
            Run
          </Button>
        }
      />
    );

  return (
    <div className="df-profile-workspace">
      <section aria-label="Reference screenshot" className="df-profile-workspace__canvas">
        {imagePanel}
      </section>

      <div className="df-profile-workspace__controls">
        {profiles.isPending ? <Loading label="Loading profiles…" /> : null}
        {profiles.isError ? (
          <FatalError
            description={(() => {
              const failure = describeApiError(profiles.error);
              return `${failure.message} ${failure.action}`;
            })()}
            onRetry={() => void profiles.refetch()}
            title="Profiles could not be loaded"
          />
        ) : null}
        {profiles.isSuccess ? (
          <ProfileSearchField
            disabled={busy}
            onNew={() => {
              requestSwitch({ kind: "new" });
            }}
            onSelect={(profileId) => {
              requestSwitch({ kind: "profile", profileId });
            }}
            profiles={profiles.data}
            selectedId={draft.profileId}
            selectedName={draft.profileId === null ? null : draft.name}
          />
        ) : null}
        {detail.isPending && targetId !== null ? (
          <Loading label="Loading the profile definition…" />
        ) : null}
        {detail.isError ? (
          <FatalError
            description={(() => {
              const failure = describeApiError(detail.error);
              return `${failure.message} ${failure.action}`;
            })()}
            onRetry={() => void detail.refetch()}
            title="The profile definition could not be loaded"
          />
        ) : null}

        <AnnotationsPanel
          categories={draft.categories}
          disabled={editingDisabled}
          nameInputRef={(element) => {
            sketchInputRef.current = element;
          }}
          onAccept={acceptSketch}
          onReject={rejectSketch}
          onRemove={(key) => {
            setDraft((current) => ({
              ...current,
              regions: current.regions.filter((region) => region.key !== key),
            }));
            setSelectedRegionKey((current) => (current === key ? null : current));
          }}
          onRename={(key, name) => {
            setDraft((current) => ({
              ...current,
              regions: current.regions.map((region) =>
                region.key === key ? { ...region, name } : region,
              ),
            }));
          }}
          onSelect={setSelectedRegionKey}
          onSketchNameChange={(name) => {
            setSketchName(name);
            setSketchError(undefined);
          }}
          regions={draft.regions}
          selectedKey={selectedRegionKey}
          sketch={sketch}
          sketchError={sketchError}
          sketchName={sketchName}
        />

        <div className="df-profile-workspace__save">
          <Button
            disabled={!canSave || editingDisabled || sketch !== null}
            loading={save.isPending}
            loadingLabel="Saving the profile…"
            onClick={() => {
              save.mutate(draft);
            }}
            title={saveTitle}
            // Figma note: Save profile changes colour once the draft differs.
            variant={canSave && sketch === null ? "emphasis" : "secondary"}
          >
            <Icon name="save" />
            Save profile
          </Button>
          <Button
            disabled={editingDisabled || draft.referenceAssetId === null || sketch !== null}
            onClick={() => {
              setSaveAsName(draft.profileId === null ? draft.name : `${draft.name} (copy)`);
              setSaveAsError(undefined);
              saveAs.reset();
              setSaveAsOpen(true);
            }}
          >
            <Icon name="plus" />
            Save as
          </Button>
        </div>
        {/* COLOR-09: the filled Save profile is not the only sign of a dirty draft. */}
        {dirty ? (
          <p className="df-visually-hidden" role="status">
            Unsaved changes
          </p>
        ) : null}

        {renamedOcrBlockers.length > 0 ? (
          <InlineError message={`First change the OCR character range of these regions: ${renamedOcrBlockers.map((region) => `“${region.name}”`).join(", ")}.`} />
        ) : null}
        {regionConflict === null ? null : (
          <InlineError
            message={`Region “${regionConflict.name}” already exists in this profile. Rename it and save again.`}
          />
        )}
        {inUse.length === 0 ? null : (
          <InlineError
            message={`Saved annotations use these classes, so they cannot be removed: ${inUse.map((category) => category.name).join(", ")}. Restore them or save the definition as a new profile with Save as.`}
          />
        )}
        {saveFailure === null || inUse.length > 0 || regionConflict !== null ? null : (
          <InlineError
            message={
              isVersionConflict(save.error)
                ? "The profile changed in another tab. Load it again and repeat your changes — the draft stays here."
                : `${saveFailure.message} ${saveFailure.action}`
            }
          />
        )}

        <ClassGroupsPanel
          categories={draft.categories}
          customOpen={customOpen}
          disabled={editingDisabled}
          onAllowedCharsChange={(allowedChars) => {
            setDraft((current) => ({
              ...current,
              regions: current.regions.map((region) =>
                region.key === selectedRegionKey
                  ? { ...region, allowed_chars: allowedChars, page_segmentation_mode: region.page_segmentation_mode ?? DEFAULT_REGION_PAGE_SEGMENTATION_MODE }
                  : region,
              ),
            }));
          }}
          onPageSegmentationModeChange={(mode) => {
            setDraft((current) => ({
              ...current,
              regions: current.regions.map((region) =>
                region.key === selectedRegionKey
                  ? { ...region, allowed_chars: region.allowed_chars ?? characterAlphabetOf(current), page_segmentation_mode: mode }
                  : region,
              ),
            }));
          }}
          onRemoveCategory={(key) => {
            setDraft((current) => ({
              ...current,
              categories: current.categories.filter((category) => category.key !== key),
            }));
          }}
          onRenameCategory={(key, name) => {
            setDraft((current) => ({
              ...current,
              categories: current.categories.map((category) =>
                category.key === key ? { ...category, name, kind: CHARACTER_CLASS_ALPHABET.includes(name) ? "character" : "game" } : category,
              ),
            }));
          }}
          onToggleCustom={() => {
            setCustomOpen((open) => !open);
          }}
          region={selectedRegion}
        />
      </div>

      <Dialog
        actions={
          <Button
            onClick={() => {
              setChangeImageOpen(false);
            }}
          >
            Cancel
          </Button>
        }
        description="A new screenshot replaces this one and removes the drawn regions — their coordinates belong to the old picture."
        onClose={() => {
          setChangeImageOpen(false);
        }}
        open={changeImageOpen}
        title="Change screenshot"
      >
        {changeImageOpen ? (
        <FilePickerTile
          busy={imagePicker.picking || preview.isPending}
          busyLabel={preview.isPending ? "Loading the screenshot…" : "Waiting for the file dialog…"}
          disabled={editingDisabled}
          error={imageError}
          icon="image"
          label="Choose screenshot (JPG/PNG)"
          onPath={(path) => {
            requestSwitch({ kind: "image", path });
          }}
          onPick={imagePicker.pick}
          pathLabel="Screenshot path"
          pathPlaceholder="D:\games\hud.png"
        />
        ) : null}
      </Dialog>

      <Dialog
        actions={
          <>
            <Button
              disabled={saveAs.isPending}
              onClick={() => {
                setSaveAsOpen(false);
              }}
              variant="secondary"
            >
              Cancel
            </Button>
            <Button
              disabled={saveAs.isPending}
              loading={saveAs.isPending}
              loadingLabel="Creating the profile…"
              onClick={() => {
                submitSaveAs();
              }}
            >
              Save as new profile
            </Button>
          </>
        }
        description="The new profile gets its own copy of the screenshot and its own ids; the profile it came from stays unchanged. Region settings apply from the next run."
        onClose={() => {
          if (!saveAs.isPending) setSaveAsOpen(false);
        }}
        open={saveAsOpen}
        title="Save as"
      >
        <TextField
          autoComplete="off"
          autoFocus
          disabled={saveAs.isPending}
          error={saveAsError}
          label="New profile name"
          onChange={(event) => {
            setSaveAsName(event.target.value);
            setSaveAsError(undefined);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submitSaveAs();
            }
          }}
          spellCheck={false}
          value={saveAsName}
        />
        {saveAsFailure === null ? null : (
          <InlineError message={`${saveAsFailure.message} ${saveAsFailure.action}`} />
        )}
      </Dialog>

      <Dialog
        actions={
          <>
            <Button
              onClick={() => {
                if (blocker.state === "blocked") blocker.reset();
                setPending(null);
              }}
            >
              Back to the draft
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                if (blocker.state === "blocked") {
                  blocker.proceed();
                } else if (pending !== null) {
                  applySwitch(pending);
                }
              }}
            >
              Discard changes
            </Button>
          </>
        }
        description="The draft of this profile is not saved. Discarding it removes it for good."
        onClose={() => {
          if (blocker.state === "blocked") blocker.reset();
          setPending(null);
        }}
        open={pending !== null || blocker.state === "blocked"}
        title="Unsaved changes"
      >
        <p className="df-profile-workspace__confirm">
          Save the draft with Save profile or Save as if you want to keep it.
        </p>
      </Dialog>
    </div>
  );

}

/** The id the unsaved sketch carries on the overlay; never a region key. */
const SKETCH_ID = "sketch";
