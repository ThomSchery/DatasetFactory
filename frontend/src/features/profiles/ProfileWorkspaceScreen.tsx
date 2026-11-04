import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useBlocker } from "react-router";

import {
  activateProfile,
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
import { Button } from "../../components/common/Button";
import { Dialog } from "../../components/common/Dialog";
import { Icon } from "../../components/common/Icon";
import { Notice } from "../../components/common/Notice";
import { Panel } from "../../components/common/Panel";
import { RegionOverlay, type OverlayShape, type SourceRect, type SourceSize } from "../../components/common/RegionOverlay";
import { StatusBadge } from "../../components/common/StatusBadge";
import { TextField } from "../../components/common/TextField";
import { Empty, FatalError, InlineError, Loading } from "../../components/common/UiStates";
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

type PendingSwitch = { kind: "profile"; profileId: string } | { kind: "new" } | { kind: "image" };

export interface ProfileWorkspaceScreenProps {
  /** Opens on an empty draft instead of the active profile. */
  initialCreate?: boolean;
}

export function ProfileWorkspaceScreen({ initialCreate = false }: ProfileWorkspaceScreenProps) {
  const queryClient = useQueryClient();

  const [draft, setDraft] = useState<ProfileDraft>(emptyDraft);
  const [baseline, setBaseline] = useState<ProfileDraft>(draft);
  const [openProfileId, setOpenProfileId] = useState<string | null>(null);
  const [wantedProfileId, setWantedProfileId] = useState<string | null>(null);
  const [startedBlank, setStartedBlank] = useState(initialCreate);
  const [selectedRegionKey, setSelectedRegionKey] = useState<string | null>(null);
  const [drawMode, setDrawMode] = useState(false);
  const [sketch, setSketch] = useState<SourceRect | null>(null);
  const [sketchName, setSketchName] = useState("");
  const [sketchError, setSketchError] = useState<string | undefined>(undefined);
  const [source, setSource] = useState<SourceSize | null>(null);
  const [imagePath, setImagePath] = useState("");
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

  const activate = useMutation({
    mutationFn: activateProfile,
    onSuccess: async () => {
      await invalidateFor(queryClient, { type: "profile-selected" });
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
    },
  });

  const busy = save.isPending || saveAs.isPending || preview.isPending || activate.isPending;
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
    activate.reset();
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
      setImagePath("");
      preview.reset();
      return;
    }
    const path = imagePath.trim();
    if (path !== "") {
      preview.mutate(path);
    }
  }

  function acceptSketch() {
    if (sketch === null) {
      return;
    }
    const name = sketchName.trim();
    if (name === "") {
      setSketchError("Nazwij region, zanim go zatwierdzisz.");
      return;
    }
    if (hasRegionNamed(draft, name)) {
      setSketchError("Region o tej nazwie już istnieje w tym profilu.");
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
        height: region.height,
        id: region.key,
        label: region.name,
        width: region.width,
        x: region.x,
        y: region.y,
      }),
    ),
    ...(sketch === null
      ? []
      : [
          {
            height: sketch.height,
            id: SKETCH_ID,
            label: "Nowy region, czeka na nazwę",
            tone: "draft" as const,
            width: sketch.width,
            x: sketch.x,
            y: sketch.y,
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
      setSaveAsError("Podaj nazwę nowego profilu.");
      return;
    }
    const taken = profiles.data?.some(
      (profile) => profile.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (taken === true) {
      setSaveAsError("Profil o tej nazwie już istnieje. Wybierz inną nazwę.");
      return;
    }
    if (draft.regions.length === 0) {
      setSaveAsError("Narysuj przynajmniej jeden region, zanim zapiszesz profil.");
      return;
    }
    saveAs.mutate({ current: draft, name });
  }

  return (
    <div className="df-profile-workspace">
      <div className="df-profile-workspace__controls">
        <Panel
          aside={
            dirty ? (
              <StatusBadge srLabel="Stan draftu:" tone="warning">
                Niezapisane zmiany
              </StatusBadge>
            ) : null
          }
          description="Wybierz profil, żeby wczytać jego zrzut, regiony i klasy, albo zacznij nowy."
          eyebrow="Profil"
          title={draft.profileId === null ? "Nowy profil" : draft.name}
        >
          {profiles.isPending ? <Loading label="Ładowanie profili…" /> : null}
          {profiles.isError ? (
            <FatalError
              description={(() => {
                const failure = describeApiError(profiles.error);
                return `${failure.message} ${failure.action}`;
              })()}
              onRetry={() => void profiles.refetch()}
              title="Nie udało się wczytać profili"
            />
          ) : null}
          {profiles.isSuccess ? (
            <>
              <ProfileSearchField
                disabled={busy}
                onSelect={(profileId) => {
                  requestSwitch({ kind: "profile", profileId });
                }}
                profiles={profiles.data}
                selectedId={draft.profileId}
              />
              <div className="df-profile-workspace__profile-actions">
                <Button
                  disabled={busy}
                  onClick={() => {
                    requestSwitch({ kind: "new" });
                  }}
                  size="sm"
                  variant="secondary"
                >
                  <Icon name="plus" />
                  Nowy profil
                </Button>
                {draft.profileId === null ||
                profiles.data.find((profile) => profile.id === draft.profileId)?.active ===
                  true ? null : (
                  <Button
                    disabled={busy}
                    loading={activate.isPending}
                    loadingLabel="Ustawianie profilu…"
                    onClick={() => {
                      activate.mutate(draft.profileId as string);
                    }}
                    size="sm"
                    variant="secondary"
                  >
                    Ustaw jako aktywny
                  </Button>
                )}
              </div>
              {activate.isError ? (
                <InlineError
                  message={(() => {
                    const failure = describeApiError(activate.error);
                    return `${failure.message} ${failure.action}`;
                  })()}
                />
              ) : null}
            </>
          ) : null}
          {detail.isPending && targetId !== null ? (
            <Loading label="Ładowanie definicji profilu…" />
          ) : null}
          {detail.isError ? (
            <FatalError
              description={(() => {
                const failure = describeApiError(detail.error);
                return `${failure.message} ${failure.action}`;
              })()}
              onRetry={() => void detail.refetch()}
              title="Nie udało się wczytać definicji profilu"
            />
          ) : null}
        </Panel>

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

        {draft.profileId !== null ? (
          <Notice title="Ustawienia regionu obowiązują od kolejnego runu">
            Zapis nie przelicza istniejących klatek, próbek ani obserwacji. Ukończone runy zachowują swoją geometrię.
          </Notice>
        ) : null}

        <div className="df-profile-workspace__save">
          <Button
            disabled={!canSave || editingDisabled || sketch !== null}
            loading={save.isPending}
            loadingLabel="Zapisywanie profilu…"
            onClick={() => {
              save.mutate(draft);
            }}
          >
            <Icon name="save" />
            Save profile
          </Button>
          <Button
            disabled={editingDisabled || draft.referenceAssetId === null || sketch !== null}
            onClick={() => {
              setSaveAsName(draft.profileId === null ? draft.name : `${draft.name} (kopia)`);
              setSaveAsError(undefined);
              saveAs.reset();
              setSaveAsOpen(true);
            }}
            variant="secondary"
          >
            <Icon name="plus" />
            Save as
          </Button>
        </div>

        {sketch !== null ? (
          <Notice title="Niezatwierdzony szkic">{"Zatwierd\u017a lub odrzu\u0107 szkic, aby zapisa\u0107 profil."}</Notice>
        ) : null}

        {draft.profileId === null && draft.referenceAssetId !== null ? (
          <Notice title="Ten profil jeszcze nie istnieje">
            Zapisz definicję przez „Save as”, żeby nadać jej nazwę. „Save profile” nadpisuje
            wybrany profil i dlatego jest dostępne dopiero po zapisaniu.
          </Notice>
        ) : null}

        {dirty ? (
          <p className="df-profile-workspace__dirty" role="status">
            Draft różni się od zapisanego profilu. Zapisz go albo odrzuć zmiany, zanim przejdziesz
            dalej.
          </p>
        ) : null}

        {renamedOcrBlockers.length > 0 ? (
          <InlineError message={`Najpierw zmień zakres znaków OCR w regionach: ${renamedOcrBlockers.map((region) => `„${region.name}”`).join(", ")}.`} />
        ) : null}

        {regionConflict === null ? null : (
          <InlineError
            message={`Region „${regionConflict.name}” już istnieje w tym profilu. Zmień nazwę i zapisz ponownie.`}
          />
        )}
        {inUse.length === 0 ? null : (
          <Notice title="Klasy są używane przez anotacje" tone="warning">
            Nie można usunąć: {inUse.map((category) => category.name).join(", ")}. Przywróć je w
            profilu albo zapisz tę definicję jako nowy profil przez „Save as”.
          </Notice>
        )}
        {saveFailure === null || inUse.length > 0 || regionConflict !== null ? null : (
          <InlineError
            message={
              isVersionConflict(save.error)
                ? "Profil zmienił się w innej karcie. Wczytaj go ponownie i powtórz zmiany — draft zostaje tutaj."
                : `${saveFailure.message} ${saveFailure.action}`
            }
          />
        )}

        <Notice title="Ukończone eksporty pozostają niezmienne">
          Zmiana nazwy klasy pojawi się w przyszłych eksportach. Nie modyfikuje paczek już
          zapisanych w workspace, a identyfikator klasy przeżywa zmianę nazwy, więc istniejące
          anotacje dalej na nią wskazują.
        </Notice>

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

      <div className="df-profile-workspace__canvas">
        {draft.referenceAssetUrl === null ? (
          <Panel
            description="Materiałem referencyjnym profilu jest zrzut ekranu z HUD-em. Podaj bezwzględną ścieżkę do pliku JPG lub PNG."
            eyebrow="Profil"
            title="Dodaj zrzut ekranu"
          >
            <Empty
              description="Bez zrzutu nie ma układu współrzędnych, w którym dałoby się zapisać regiony."
              title="Brak zrzutu do rysowania"
            />
            <TextField
              autoComplete="off"
              disabled={editingDisabled}
              label="Ścieżka zrzutu ekranu"
              onChange={(event) => {
                setImagePath(event.target.value);
              }}
              placeholder="D:\gry\hud.png"
              spellCheck={false}
              value={imagePath}
            />
            <Button
              disabled={editingDisabled || imagePath.trim() === ""}
              loading={preview.isPending}
              loadingLabel="Wczytywanie zrzutu…"
              onClick={() => {
                requestSwitch({ kind: "image" });
              }}
            >
              <Icon name="image" />
              Wczytaj zrzut
            </Button>
            {previewFailure === null ? null : (
              <InlineError message={`${previewFailure.message} ${previewFailure.action}`} />
            )}
          </Panel>
        ) : (
          <Panel
            description="Przeciągnij prostokąt, żeby narysować region. Strzałki chodzą po regionach, Enter zaznacza, Delete usuwa zaznaczony."
            eyebrow="Profil"
            title="Zrzut referencyjny"
          >
            <Button aria-pressed={drawMode} disabled={editingDisabled} onClick={() => setDrawMode((active) => !active)} size="sm" variant="secondary">
              Draw region
            </Button>
            <RegionOverlay
              interactionMode={drawMode ? "draw" : "select"}
              disabled={editingDisabled}
              imageAlt={
                draft.profileId === null
                  ? "Zrzut ekranu nowego profilu z zaznaczonymi regionami"
                  : `Zrzut referencyjny profilu ${draft.name} z zaznaczonymi regionami`
              }
              imageUrl={draft.referenceAssetUrl}
              label="Regiony HUD na zrzucie referencyjnym"
              onDraw={(rect) => {
                setSketch(rect);
                setSketchName(nextRegionName(draft));
                setSketchError(undefined);
                setSelectedRegionKey(null);
                // The design puts the cursor in the name field the moment a
                // box exists, so naming is one gesture rather than a hunt.
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
              onShapeChangeEnd={(id, rect) => {
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
            />
            <div className="df-profile-workspace__image-swap">
              <TextField
                autoComplete="off"
                description="Nowy zrzut zastąpi obecny i usunie narysowane regiony — ich współrzędne należą do poprzedniego obrazu."
                disabled={editingDisabled}
                label="Zmień zrzut ekranu"
                onChange={(event) => {
                  setImagePath(event.target.value);
                }}
                placeholder="D:\gry\hud.png"
                spellCheck={false}
                value={imagePath}
              />
              <Button
                disabled={editingDisabled || imagePath.trim() === ""}
                loading={preview.isPending}
                loadingLabel="Wczytywanie zrzutu…"
                onClick={() => {
                  requestSwitch({ kind: "image" });
                }}
                variant="secondary"
              >
                Wczytaj inny zrzut
              </Button>
              {previewFailure === null ? null : (
                <InlineError message={`${previewFailure.message} ${previewFailure.action}`} />
              )}
            </div>
          </Panel>
        )}
      </div>

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
              Anuluj
            </Button>
            <Button
              disabled={saveAs.isPending}
              loading={saveAs.isPending}
              loadingLabel="Tworzenie profilu…"
              onClick={() => {
                submitSaveAs();
              }}
            >
              Zapisz jako nowy profil
            </Button>
          </>
        }
        description="Nowy profil dostanie własną kopię zrzutu i własne identyfikatory. Profil, z którego wyszedł, zostaje bez zmian."
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
          label="Nazwa nowego profilu"
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
              variant="secondary"
            >
              Wróć do draftu
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
              Odrzuć zmiany
            </Button>
          </>
        }
        description="Draft bieżącego profilu nie został zapisany. Odrzucenie usunie go bezpowrotnie."
        onClose={() => {
          if (blocker.state === "blocked") blocker.reset();
          setPending(null);
        }}
        open={pending !== null || blocker.state === "blocked"}
        title="Niezapisane zmiany"
      >
        <p className="df-profile-workspace__confirm">
          Zapisz draft przez „Save profile” albo „Save as”, jeżeli chcesz go zachować.
        </p>
      </Dialog>
    </div>
  );

}

/** The id the unsaved sketch carries on the overlay; never a region key. */
const SKETCH_ID = "sketch";
