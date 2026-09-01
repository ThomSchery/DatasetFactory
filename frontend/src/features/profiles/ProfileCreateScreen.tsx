import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";

import {
  createProfile,
  createReferenceFrame,
  createReferencePreview,
  describeApiError,
  invalidateFor,
  listMaterials,
  queryKeys,
  referenceAssetUrl,
} from "../../api";
import { Button } from "../../components/common/Button";
import { DataList } from "../../components/common/DataList";
import { Panel } from "../../components/common/Panel";
import { SelectField } from "../../components/common/SelectField";
import type { SourceSize } from "../../components/common/RegionOverlay";
import { TextField } from "../../components/common/TextField";
import { Empty, FatalError, InlineError, Loading } from "../../components/common/UiStates";
import { CategoryEditor } from "./CategoryEditor";
import { RegionEditor } from "./RegionEditor";
import { profileCreateSchema, type ProfileCreateValues } from "./schemas";
import "./ProfileCreateScreen.css";

/*
 * CF-01: name and absolute reference path, regions drawn on the reference
 * image, base and per-game classes, then one atomic `POST /profiles`. The
 * preview is staged first through `POST /profiles/reference-preview`, so a
 * fresh installation can draw regions before any profile exists.
 */

/** Narrows whatever the resolver put on a field to its message. */
function messageOf(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === "string" ? message : undefined;
  }
  return undefined;
}

type PreviewSource =
  | { kind: "manual"; path: string }
  | { kind: "material"; videoId: string; timestampMs: number };

export function ProfileCreateScreen({ onCancel }: { onCancel?: () => void } = {}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [source, setSource] = useState<SourceSize | null>(null);
  const [sourceMode, setSourceMode] = useState<"material" | "manual">("material");
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [timestampSeconds, setTimestampSeconds] = useState("0");
  const [selectionError, setSelectionError] = useState<string | null>(null);

  const form = useForm<ProfileCreateValues>({
    defaultValues: { categories: [], name: "", reference_image_path: "", regions: [] },
    resolver: zodResolver(profileCreateSchema),
  });

  const regions = form.watch("regions");
  const categories = form.watch("categories");

  const materials = useQuery({
    queryKey: queryKeys.materialList({ page: 1, page_size: 100 }),
    queryFn: ({ signal }) => listMaterials({ page: 1, page_size: 100 }, signal),
  });

  const previewMutation = useMutation({
    mutationFn: (previewSource: PreviewSource) =>
      previewSource.kind === "manual"
        ? createReferencePreview({ reference_image_path: previewSource.path })
        : createReferenceFrame({
            video_id: previewSource.videoId,
            timestamp_ms: previewSource.timestampMs,
          }),
    onSuccess: () => {
      setSelectionError(null);
      setSource(null);
      form.setValue("regions", [], { shouldValidate: form.formState.isSubmitted });
    },
  });

  const mutation = useMutation({
    mutationFn: (values: ProfileCreateValues) =>
      createProfile({
        categories: values.categories.map((category) => ({
          kind: category.kind,
          name: category.name.trim(),
        })),
        name: values.name.trim(),
        ...(sourceMode === "manual"
          ? { reference_image_path: values.reference_image_path.trim() }
          : { reference_asset_id: previewMutation.data?.asset_id as string }),
        // The client-side `id` exists only to key React and the overlay; the
        // backend mints the durable one.
        regions: values.regions.map((region) => ({
          height: region.height,
          name: region.name.trim(),
          width: region.width,
          x: region.x,
          y: region.y,
        })),
      }),
    onSuccess: async () => {
      await invalidateFor(queryClient, { type: "profile-created" });
      // CF-01.6 — a saved profile leads straight to importing material.
      void navigate("/materials");
    },
  });

  const failure = mutation.isError ? describeApiError(mutation.error) : null;
  const previewFailure = previewMutation.isError
    ? describeApiError(previewMutation.error)
    : null;
  const busy = mutation.isPending || previewMutation.isPending;
  const preview = previewMutation.data ?? null;
  const regionsError = messageOf(form.formState.errors.regions);

  const referencePathField = form.register("reference_image_path");

  /** Revalidates only once the user has already seen the form's verdict. */
  const revalidate = { shouldValidate: form.formState.isSubmitted };

  const resetPreview = () => {
    previewMutation.reset();
    setSelectionError(null);
    setSource(null);
    form.setValue("regions", [], revalidate);
  };

  const requestMaterialPreview = () => {
    const material = materials.data?.items.find((item) => item.id === selectedMaterialId);
    if (material === undefined) {
      setSelectionError("Wybierz zaimportowany materiał.");
      return;
    }
    if (!material.available) {
      setSelectionError("Plik wybranego materiału nie jest już dostępny.");
      return;
    }
    const seconds = Number(timestampSeconds.replace(",", "."));
    if (!Number.isFinite(seconds) || seconds < 0 || seconds * 1000 >= material.duration_ms) {
      setSelectionError(
        `Podaj moment od 0 do mniej niż ${(material.duration_ms / 1000).toFixed(3)} s.`,
      );
      return;
    }
    previewMutation.mutate({
      kind: "material",
      videoId: material.id,
      timestampMs: Math.round(seconds * 1000),
    });
  };

  return (
    <form
      className="df-profiles"
      noValidate
      onSubmit={(event) => {
        // The reference image lives outside the form's values, so its verdict
        // has to be raised next to the form's own — not only once the schema
        // already passed.
        setSelectionError(
          preview === null ? "Najpierw przygotuj podgląd obrazu referencyjnego." : null,
        );
        void form.handleSubmit((values) => {
          if (preview === null) {
            return;
          }
          mutation.mutate(values);
        })(event);
      }}
    >
      <Panel
        description="Wybierz moment z zaimportowanego materiału. Klatka zachowa jego rozdzielczość i stanie się obrazem profilu."
        eyebrow="Profil gry"
        title="Obraz referencyjny"
      >
        <TextField
          {...form.register("name")}
          autoComplete="off"
          description="Widoczna nazwa profilu; musi być unikalna w projekcie."
          error={form.formState.errors.name?.message}
          label="Nazwa profilu"
          placeholder="Gra testowa"
          spellCheck={false}
        />
        {sourceMode === "material" ? (
          <div className="df-profiles__reference-source">
            {materials.isPending ? <Loading label="Ładowanie materiałów…" /> : null}
            {materials.isError ? (
              <FatalError
                description={(() => {
                  const materialFailure = describeApiError(materials.error);
                  return `${materialFailure.message} ${materialFailure.action}`;
                })()}
                onRetry={() => void materials.refetch()}
                title="Nie udało się pobrać materiałów"
              />
            ) : null}
            {materials.isSuccess && materials.data.items.length === 0 ? (
              <Empty
                description="Zaimportuj nagranie na ekranie Materiały albo skorzystaj z alternatywnej ścieżki poniżej."
                title="Brak zaimportowanych materiałów"
              />
            ) : null}
            {materials.isSuccess && materials.data.items.length > 0 ? (
              <>
                <SelectField
                  disabled={busy}
                  label="Materiał źródłowy"
                  onChange={(event) => {
                    setSelectedMaterialId(event.target.value);
                    resetPreview();
                  }}
                  options={materials.data.items.map((material) => ({
                    label: `${material.basename} — ${String(material.width)} × ${String(material.height)} px`,
                    value: material.id,
                  }))}
                  placeholder="Wybierz materiał"
                  value={selectedMaterialId}
                />
                <TextField
                  autoComplete="off"
                  description="Sekundy od początku nagrania; możesz podać część dziesiętną."
                  disabled={busy}
                  inputMode="decimal"
                  label="Moment klatki (s)"
                  onChange={(event) => {
                    setTimestampSeconds(event.target.value);
                    resetPreview();
                  }}
                  value={timestampSeconds}
                  width="short"
                />
                <Button
                  disabled={mutation.isPending}
                  loading={previewMutation.isPending}
                  loadingLabel="Wycinanie klatki…"
                  onClick={requestMaterialPreview}
                  type="button"
                  variant="secondary"
                >
                  Wytnij i pokaż klatkę
                </Button>
              </>
            ) : null}
            <Button
              disabled={busy}
              onClick={() => {
                setSourceMode("manual");
                resetPreview();
              }}
              type="button"
              variant="secondary"
            >
              Użyj ścieżki ręcznej
            </Button>
          </div>
        ) : (
          <div className="df-profiles__reference-source">
            <TextField
              {...referencePathField}
              autoComplete="off"
              description="Alternatywna bezwzględna ścieżka do klatki referencyjnej z HUD."
              disabled={busy}
              error={form.formState.errors.reference_image_path?.message}
              label="Ścieżka obrazu referencyjnego"
              onChange={(event) => {
                void referencePathField.onChange(event);
                if (preview !== null || previewMutation.isError) {
                  resetPreview();
                }
              }}
              placeholder="D:\gry\hud.png"
              spellCheck={false}
            />
            <Button
              disabled={mutation.isPending}
              loading={previewMutation.isPending}
              loadingLabel="Wczytywanie podglądu…"
              onClick={() => {
                const path = form.getValues("reference_image_path").trim();
                if (path === "") {
                  form.setError("reference_image_path", {
                    message: "Podaj ścieżkę do obrazu referencyjnego.",
                  });
                  return;
                }
                void form.trigger("reference_image_path").then((valid) => {
                  if (valid) {
                    previewMutation.mutate({ kind: "manual", path });
                  }
                });
              }}
              type="button"
              variant="secondary"
            >
              Wczytaj podgląd
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                setSourceMode("material");
                resetPreview();
              }}
              type="button"
              variant="secondary"
            >
              Wybierz klatkę z materiału
            </Button>
          </div>
        )}
        {selectionError === null ? null : <InlineError message={selectionError} />}
      </Panel>

      <Panel
        description="Region wskazuje OCR fragment klatki do odczytu. Współrzędne są zapisywane w pikselach źródłowych obrazu, więc zmiana rozmiaru okna ich nie przesuwa."
        eyebrow="Profil gry"
        title="Regiony HUD"
      >
        {preview === null ? (
          <>
            <Empty
              description="Przygotuj podgląd powyżej, żeby zaznaczyć regiony w naturalnych wymiarach obrazu."
              title="Wczytaj obraz do rysowania"
            />
            {regionsError === undefined ? null : <InlineError message={regionsError} />}
          </>
        ) : null}

        {previewFailure === null ? null : (
          <InlineError message={`${previewFailure.message} ${previewFailure.action}`} />
        )}

        {preview !== null ? (
          <>
            <DataList
              items={[
                {
                  hint: "Wymiary naturalne obrazu, w których zapisywane są regiony.",
                  label: "Rozdzielczość",
                  value: `${String(preview.width)} × ${String(preview.height)} px`,
                },
                { label: "Zaznaczone regiony", value: String(regions.length) },
              ]}
              layout="columns"
            />
            <RegionEditor
              assetUrl={referenceAssetUrl(preview.asset_id)}
              disabled={busy}
              error={regionsError}
              onChange={(next) => {
                form.setValue("regions", next, revalidate);
              }}
              onSourceResolved={setSource}
              regions={regions}
              source={source}
            />
          </>
        ) : null}
      </Panel>

      <Panel
        description="Klasy bazowe to znaki, które zwraca OCR. Klasy per gra nazywają pojęcia specyficzne dla tytułu."
        eyebrow="Profil gry"
        title="Klasy"
      >
        <CategoryEditor
          categories={categories}
          disabled={busy}
          error={messageOf(form.formState.errors.categories)}
          onChange={(next) => {
            form.setValue("categories", next, revalidate);
          }}
        />
      </Panel>

      <div className="df-profiles__actions">
        <Button
          disabled={previewMutation.isPending}
          loading={mutation.isPending}
          loadingLabel="Zapisywanie profilu…"
          type="submit"
        >
          Utwórz profil
        </Button>
        {onCancel === undefined ? null : (
          <Button disabled={busy} onClick={onCancel} type="button" variant="secondary">
            Wróć do profili
          </Button>
        )}
      </div>

      {failure === null ? null : (
        <div className="df-profiles__feedback">
          <InlineError message={`${failure.message} ${failure.action}`} />
          <p className="df-profiles__code">
            Kod błędu: <code>{failure.code}</code>
          </p>
        </div>
      )}
    </form>
  );
}
