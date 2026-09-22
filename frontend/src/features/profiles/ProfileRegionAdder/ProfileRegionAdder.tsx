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
  type AddRegionRequest,
  type GameProfile,
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
import "./ProfileRegionAdder.css";

const DRAFT_ID = "new-profile-region";

function failureMessage(error: unknown): string {
  const conflict = regionNameConflictFromError(error);
  if (conflict !== null) {
    return `Region „${conflict.name}” już istnieje w tym profilu. Podaj inną nazwę.`;
  }
  if (isVersionConflict(error)) {
    return "Profil zmienił się w innej karcie. Odśwież widok i narysuj region ponownie.";
  }
  if (isApiError(error) && error.code === "active_run") {
    return "Nie można teraz dodać regionu do tego profilu. Aktywny run czyta regiony podczas kadrowania, więc część jego klatek dostałaby nowy region, a część nie. Zatrzymaj lub dokończ run i spróbuj ponownie.";
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

export function ProfileRegionAdder({ profile }: { profile: GameProfile }) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [draft, setDraft] = useState<SourceRect | null>(null);
  const [validation, setValidation] = useState<string | null>(null);

  const addition = useMutation({
    mutationFn: (request: AddRegionRequest) => addProfileRegion(profile.id, request),
    onSuccess: async (updated) => {
      setAdding(false);
      setName("");
      setDraft(null);
      setValidation(null);
      await invalidateFor(queryClient, { type: "profile-region-added", profileId: updated.id });
    },
  });

  useEffect(() => {
    setAdding(false);
    setName("");
    setDraft(null);
    setValidation(null);
    addition.reset();
    // The selected profile is the deliberate boundary of an unfinished draft.
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

  function cancel(): void {
    setAdding(false);
    setName("");
    setDraft(null);
    setValidation(null);
    addition.reset();
  }

  function save(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const error = draftValidation(name, draft, profile);
    setValidation(error);
    if (error !== null || draft === null) {
      return;
    }
    addition.mutate({
      ...draft,
      expected_version: profile.version,
      name: name.trim(),
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
            onClick={() => {
              setAdding(true);
              addition.reset();
            }}
            size="sm"
            variant="secondary"
          >
            Dodaj region
          </Button>
        )}
      </div>

      {adding ? (
        <Notice title="Nowy region obowiązuje od kolejnego runu">
          Dodanie regionu nie tworzy brakujących region_samples, nie cofa przetworzonych klatek
          do kadrowania ani OCR i nie zmienia statusu runu. Użyją go dopiero kolejne runy.
        </Notice>
      ) : null}

      <RegionOverlay
        disabled={addition.isPending}
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
        <form className="df-profile-region-adder__form" onSubmit={save}>
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
              onClick={cancel}
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
    </section>
  );
}
