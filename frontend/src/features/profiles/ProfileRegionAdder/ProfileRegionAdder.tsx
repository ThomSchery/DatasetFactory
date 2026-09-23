import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";

import {
  addProfileRegion,
  describeApiError,
  invalidateFor,
  isApiError,
  isVersionConflict,
  referenceAssetUrl,
  regionNameConflictFromError,
  updateProfileRegionOcrConfig,
  type AddRegionRequest,
  type GameProfile,
  type Region,
  type UpdateRegionOcrConfigRequest,
} from "../../../api";
import { Button } from "../../../components/common/Button";
import { Notice } from "../../../components/common/Notice";
import {
  RegionOverlay,
  type OverlayShape,
  type SourceRect,
} from "../../../components/common/RegionOverlay";
import { TextField } from "../../../components/common/TextField";
import { InlineError } from "../../../components/common/UiStates";
import { RegionOcrConfigFields } from "../RegionOcrConfigFields";
import {
  characterClassesOf,
  DEFAULT_REGION_PAGE_SEGMENTATION_MODE,
  OCR_PAGE_SEGMENTATION_OPTIONS,
  regionOcrValidation,
} from "../schemas";
import "./ProfileRegionAdder.css";

const DRAFT_ID = "new-profile-region";

function failureMessage(error: unknown): string {
  const conflict = regionNameConflictFromError(error);
  if (conflict !== null) {
    return `Region „${conflict.name}” już istnieje w tym profilu. Podaj inną nazwę.`;
  }
  if (isVersionConflict(error)) {
    return "Profil zmienił się w innej karcie. Odśwież widok i spróbuj ponownie.";
  }
  if (isApiError(error) && error.code === "active_run") {
    return "Nie można teraz zmienić ustawień regionu. Dokończ niedokończony run tego profilu — wznów go, jeśli został zatrzymany — i spróbuj ponownie.";
  }
  if (isApiError(error) && error.code === "region_allowed_chars_not_in_profile") {
    return "Zakres zawiera znak bez odpowiadającej klasy profilu. Dodaj klasę albo usuń znak z zakresu.";
  }
  if (isApiError(error) && error.code === "invalid_region_page_segmentation_mode") {
    return "Wybrany układ tekstu nie jest obsługiwany. Wybierz jedną z opisanych opcji.";
  }
  const failure = describeApiError(error);
  return `${failure.message} ${failure.action}`;
}

function draftValidation(
  name: string,
  rect: SourceRect | null,
  profile: GameProfile,
): string | null {
  const normalizedName = name.trim();
  if (normalizedName.length === 0) {
    return "Nazwij nowy region.";
  }
  if ([...normalizedName].length > 200) {
    return "Nazwa regionu może mieć najwyżej 200 znaków.";
  }
  if (rect === null) {
    return "Narysuj nowy region na obrazie referencyjnym.";
  }
  if (
    rect.x < 0 ||
    rect.y < 0 ||
    rect.width <= 0 ||
    rect.height <= 0 ||
    rect.x + rect.width > profile.source_width ||
    rect.y + rect.height > profile.source_height
  ) {
    return "Region musi mieścić się w granicach obrazu referencyjnego.";
  }
  return null;
}

function psmLabel(value: number): string {
  return (
    OCR_PAGE_SEGMENTATION_OPTIONS.find((option) => Number(option.value) === value)?.label ??
    `Tryb ${String(value)}`
  );
}

export function ProfileRegionAdder({ profile }: { profile: GameProfile }) {
  const queryClient = useQueryClient();
  const characterClasses = characterClassesOf(profile.categories);
  const defaultAllowedChars = characterClasses.join("");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [draft, setDraft] = useState<SourceRect | null>(null);
  const [allowedChars, setAllowedChars] = useState(defaultAllowedChars);
  const [pageSegmentationMode, setPageSegmentationMode] = useState(
    DEFAULT_REGION_PAGE_SEGMENTATION_MODE,
  );
  const [validation, setValidation] = useState<string | null>(null);
  const [ocrValidation, setOcrValidation] = useState<ReturnType<typeof regionOcrValidation>>({});
  const [editingRegionId, setEditingRegionId] = useState<string | null>(null);
  const [editAllowedChars, setEditAllowedChars] = useState("");
  const [editPageSegmentationMode, setEditPageSegmentationMode] = useState(
    DEFAULT_REGION_PAGE_SEGMENTATION_MODE,
  );
  const [editValidation, setEditValidation] = useState<ReturnType<typeof regionOcrValidation>>({});

  const addition = useMutation({
    mutationFn: (request: AddRegionRequest) => addProfileRegion(profile.id, request),
    onSuccess: async (updated) => {
      cancelAddition();
      await invalidateFor(queryClient, { type: "profile-region-added", profileId: updated.id });
    },
  });

  const update = useMutation({
    mutationFn: ({
      regionId,
      request,
    }: {
      regionId: string;
      request: UpdateRegionOcrConfigRequest;
    }) => updateProfileRegionOcrConfig(profile.id, regionId, request),
    onSuccess: async (updated) => {
      cancelEdit();
      await invalidateFor(queryClient, {
        type: "profile-region-ocr-updated",
        profileId: updated.id,
      });
    },
  });

  useEffect(() => {
    setAdding(false);
    setName("");
    setDraft(null);
    setAllowedChars(defaultAllowedChars);
    setPageSegmentationMode(DEFAULT_REGION_PAGE_SEGMENTATION_MODE);
    setValidation(null);
    setOcrValidation({});
    setEditingRegionId(null);
    setEditValidation({});
    addition.reset();
    update.reset();
    // The selected profile is the deliberate boundary of unfinished drafts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id]);

  const shapes: OverlayShape[] = profile.regions.map((region) => ({
    ...region,
    label: region.name,
    tone: "muted",
  }));
  if (draft !== null) {
    shapes.push({
      ...draft,
      displayLabel: name.trim() || "Nowy region",
      id: DRAFT_ID,
      label: name.trim() || "Nowy region",
      tone: "draft",
    });
  }

  function cancelAddition(): void {
    setAdding(false);
    setName("");
    setDraft(null);
    setAllowedChars(defaultAllowedChars);
    setPageSegmentationMode(DEFAULT_REGION_PAGE_SEGMENTATION_MODE);
    setValidation(null);
    setOcrValidation({});
    addition.reset();
  }

  function beginAddition(): void {
    cancelEdit();
    setAdding(true);
    setAllowedChars(defaultAllowedChars);
    addition.reset();
  }

  function saveAddition(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const geometryError = draftValidation(name, draft, profile);
    const settingsError = regionOcrValidation(
      allowedChars,
      pageSegmentationMode,
      characterClasses,
    );
    setValidation(geometryError);
    setOcrValidation(settingsError);
    if (
      geometryError !== null ||
      settingsError.allowedChars !== undefined ||
      settingsError.pageSegmentationMode !== undefined ||
      draft === null
    ) {
      return;
    }
    addition.mutate({
      ...draft,
      allowed_chars: allowedChars,
      expected_version: profile.version,
      name: name.trim(),
      page_segmentation_mode: pageSegmentationMode,
    });
  }

  function beginEdit(region: Region): void {
    cancelAddition();
    update.reset();
    setEditingRegionId(region.id);
    setEditAllowedChars(region.allowed_chars ?? defaultAllowedChars);
    setEditPageSegmentationMode(
      region.page_segmentation_mode ?? DEFAULT_REGION_PAGE_SEGMENTATION_MODE,
    );
    setEditValidation({});
  }

  function cancelEdit(): void {
    setEditingRegionId(null);
    setEditAllowedChars("");
    setEditPageSegmentationMode(DEFAULT_REGION_PAGE_SEGMENTATION_MODE);
    setEditValidation({});
    update.reset();
  }

  function saveEdit(region: Region): void {
    const settingsError = regionOcrValidation(
      editAllowedChars,
      editPageSegmentationMode,
      characterClasses,
    );
    setEditValidation(settingsError);
    if (
      settingsError.allowedChars !== undefined ||
      settingsError.pageSegmentationMode !== undefined
    ) {
      return;
    }
    update.mutate({
      regionId: region.id,
      request: {
        allowed_chars: editAllowedChars,
        expected_version: profile.version,
        page_segmentation_mode: editPageSegmentationMode,
      },
    });
  }

  return (
    <section aria-label="Regiony HUD profilu" className="df-profile-region-adder">
      <div className="df-profile-region-adder__header">
        <div>
          <h3>Regiony HUD</h3>
          <p>{String(profile.regions.length)} zapisanych regionów</p>
        </div>
        {adding ? null : (
          <Button
            disabled={update.isPending}
            onClick={beginAddition}
            size="sm"
            variant="secondary"
          >
            Dodaj region
          </Button>
        )}
      </div>

      <Notice title="Ustawienia regionu obowiązują od kolejnego runu">
        Dodanie regionu lub zmiana jego OCR nie przelicza istniejących klatek, próbek ani
        obserwacji. Nową konfigurację utrwalą dopiero kolejne runy.
      </Notice>

      <RegionOverlay
        disabled={addition.isPending || update.isPending}
        imageAlt={`Klatka referencyjna profilu ${profile.name}`}
        imageUrl={referenceAssetUrl(profile.reference_asset_id)}
        interactionMode={adding ? "draw" : "select"}
        label={
          adding
            ? `Regiony HUD profilu ${profile.name}; narysuj nowy region`
            : `Regiony HUD profilu ${profile.name}`
        }
        onDraw={
          adding
            ? (rect) => {
                setDraft(rect);
                setValidation(null);
                addition.reset();
              }
            : undefined
        }
        selectedId={draft === null ? null : DRAFT_ID}
        shapes={shapes}
        source={{ width: profile.source_width, height: profile.source_height }}
      />

      {adding ? (
        <form className="df-profile-region-adder__form" onSubmit={saveAddition}>
          <p className="df-profile-region-adder__hint">
            Przeciągnij prostokąt na obrazie. Kolejny prostokąt zastąpi bieżący szkic przed
            zapisem.
          </p>
          <TextField
            disabled={addition.isPending}
            error={validation ?? undefined}
            label="Nazwa nowego regionu"
            maxLength={200}
            onChange={(event) => {
              setName(event.target.value);
              setValidation(null);
              addition.reset();
            }}
            value={name}
          />
          <RegionOcrConfigFields
            allowedChars={allowedChars}
            allowedCharsError={ocrValidation.allowedChars}
            characterClasses={characterClasses}
            disabled={addition.isPending}
            onAllowedCharsChange={(value) => {
              setAllowedChars(value);
              setOcrValidation({});
              addition.reset();
            }}
            onPageSegmentationModeChange={(value) => {
              setPageSegmentationMode(value);
              setOcrValidation({});
              addition.reset();
            }}
            pageSegmentationMode={pageSegmentationMode}
            pageSegmentationModeError={ocrValidation.pageSegmentationMode}
          />
          {draft === null ? null : (
            <p className="df-profile-region-adder__geometry">
              x {String(draft.x)}, y {String(draft.y)}, {String(draft.width)} ×{" "}
              {String(draft.height)} px
            </p>
          )}
          {addition.isError ? <InlineError message={failureMessage(addition.error)} /> : null}
          <div className="df-profile-region-adder__actions">
            <Button
              disabled={addition.isPending}
              onClick={cancelAddition}
              size="sm"
              variant="secondary"
            >
              Anuluj
            </Button>
            <Button
              disabled={addition.isPending || draft === null || name.trim() === ""}
              loading={addition.isPending}
              loadingLabel="Zapisywanie regionu…"
              size="sm"
              type="submit"
            >
              Zapisz region
            </Button>
          </div>
        </form>
      ) : null}

      <ul className="df-profile-region-adder__regions">
        {profile.regions.map((region) => {
          const editing = editingRegionId === region.id;
          const effectiveAllowedChars = region.allowed_chars ?? defaultAllowedChars;
          const effectivePsm =
            region.page_segmentation_mode ?? DEFAULT_REGION_PAGE_SEGMENTATION_MODE;
          return (
            <li className="df-profile-region-adder__region" key={region.id}>
              <div className="df-profile-region-adder__region-summary">
                <div>
                  <strong>{region.name}</strong>
                  <span>
                    x {String(region.x)}, y {String(region.y)}, {String(region.width)} ×{" "}
                    {String(region.height)} px
                  </span>
                  <span>
                    Znaki: {effectiveAllowedChars || "brak"} · {psmLabel(effectivePsm)}
                    {region.allowed_chars === null ? " · konfiguracja odziedziczona" : ""}
                  </span>
                </div>
                {editing ? null : (
                  <Button
                    aria-label={`Edytuj OCR regionu ${region.name}`}
                    disabled={addition.isPending || update.isPending}
                    onClick={() => beginEdit(region)}
                    size="sm"
                    variant="secondary"
                  >
                    Edytuj OCR
                  </Button>
                )}
              </div>
              {editing ? (
                <div className="df-profile-region-adder__edit-form">
                  <RegionOcrConfigFields
                    allowedChars={editAllowedChars}
                    allowedCharsError={editValidation.allowedChars}
                    characterClasses={characterClasses}
                    disabled={update.isPending}
                    onAllowedCharsChange={(value) => {
                      setEditAllowedChars(value);
                      setEditValidation({});
                      update.reset();
                    }}
                    onPageSegmentationModeChange={(value) => {
                      setEditPageSegmentationMode(value);
                      setEditValidation({});
                      update.reset();
                    }}
                    pageSegmentationMode={editPageSegmentationMode}
                    pageSegmentationModeError={editValidation.pageSegmentationMode}
                  />
                  {update.isError ? <InlineError message={failureMessage(update.error)} /> : null}
                  <div className="df-profile-region-adder__actions">
                    <Button
                      disabled={update.isPending}
                      onClick={cancelEdit}
                      size="sm"
                      variant="secondary"
                    >
                      Anuluj
                    </Button>
                    <Button
                      disabled={update.isPending}
                      loading={update.isPending}
                      loadingLabel="Zapisywanie ustawień…"
                      onClick={() => saveEdit(region)}
                      size="sm"
                    >
                      Zapisz ustawienia
                    </Button>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
