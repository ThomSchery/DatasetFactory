import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";

import {
  createProfile,
  createReferencePreview,
  describeApiError,
  invalidateFor,
  referenceAssetUrl,
} from "../../api";
import { Button } from "../../components/common/Button";
import { DataList } from "../../components/common/DataList";
import { Panel } from "../../components/common/Panel";
import type { SourceSize } from "../../components/common/RegionOverlay";
import { TextField } from "../../components/common/TextField";
import { Empty, InlineError } from "../../components/common/UiStates";
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

export function ProfileCreateScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [source, setSource] = useState<SourceSize | null>(null);

  const form = useForm<ProfileCreateValues>({
    defaultValues: { categories: [], name: "", reference_image_path: "", regions: [] },
    resolver: zodResolver(profileCreateSchema),
  });

  const regions = form.watch("regions");
  const categories = form.watch("categories");

  const previewMutation = useMutation({
    mutationFn: (referenceImagePath: string) =>
      createReferencePreview({ reference_image_path: referenceImagePath }),
    onSuccess: () => {
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
        reference_image_path: values.reference_image_path.trim(),
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

  return (
    <form
      className="df-profiles"
      noValidate
      onSubmit={form.handleSubmit((values) => {
        mutation.mutate(values);
      })}
    >
      <Panel
        description="Backend czyta plik w miejscu i sam kopiuje go do katalogu roboczego — nie ma uploadu."
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
        <TextField
          {...referencePathField}
          autoComplete="off"
          description="Bezwzględna ścieżka do klatki referencyjnej z HUD."
          disabled={busy}
          error={form.formState.errors.reference_image_path?.message}
          label="Ścieżka obrazu referencyjnego"
          onChange={(event) => {
            void referencePathField.onChange(event);
            if (preview !== null || previewMutation.isError) {
              previewMutation.reset();
              setSource(null);
              form.setValue("regions", [], revalidate);
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
            void form.trigger("reference_image_path").then((valid) => {
              if (valid) {
                previewMutation.mutate(form.getValues("reference_image_path").trim());
              }
            });
          }}
          type="button"
          variant="secondary"
        >
          Wczytaj podgląd
        </Button>
      </Panel>

      <Panel
        description="Region wskazuje OCR fragment klatki do odczytu. Współrzędne są zapisywane w pikselach źródłowych obrazu, więc zmiana rozmiaru okna ich nie przesuwa."
        eyebrow="Profil gry"
        title="Regiony HUD"
      >
        {preview === null ? (
          <>
            <Empty
              description="Wpisz bezwzględną ścieżkę powyżej i wczytaj podgląd, żeby zaznaczyć regiony w naturalnych wymiarach obrazu."
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
