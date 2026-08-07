import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";

import {
  createProfile,
  describeApiError,
  getCurrentProfile,
  invalidateFor,
  queryKeys,
  referenceAssetUrl,
} from "../../api";
import { Button } from "../../components/common/Button";
import { DataList } from "../../components/common/DataList";
import { Notice } from "../../components/common/Notice";
import { Panel } from "../../components/common/Panel";
import type { SourceSize } from "../../components/common/RegionOverlay";
import { TextField } from "../../components/common/TextField";
import { Empty, FatalError, InlineError, Loading } from "../../components/common/UiStates";
import { CategoryEditor } from "./CategoryEditor";
import { RegionEditor } from "./RegionEditor";
import { profileCreateSchema, type ProfileCreateValues } from "./schemas";
import "./ProfileCreateScreen.css";

/*
 * CF-01: name and absolute reference path, regions drawn on the reference
 * image, base and per-game classes, one atomic `POST /profiles`, and on
 * success the material import.
 *
 * One thing the contract does not yet allow, recorded in
 * `docs/tickets/FE-001/log.md`: the API serves a reference image only behind
 * the `asset_id` of a *saved* profile, while `POST /profiles` requires the
 * regions in the same request. So the picture drawn on here is the one the
 * current profile already staged, and the screen says so rather than implying
 * it is the file named in the path field.
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

  const currentProfile = useQuery({
    queryFn: ({ signal }) => getCurrentProfile(signal),
    queryKey: queryKeys.currentProfile(),
  });

  const form = useForm<ProfileCreateValues>({
    defaultValues: { categories: [], name: "", reference_image_path: "", regions: [] },
    resolver: zodResolver(profileCreateSchema),
  });

  const regions = form.watch("regions");
  const categories = form.watch("categories");

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
  const busy = mutation.isPending;
  const profile = currentProfile.data ?? null;

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
          {...form.register("reference_image_path")}
          autoComplete="off"
          description="Bezwzględna ścieżka do klatki referencyjnej z HUD."
          error={form.formState.errors.reference_image_path?.message}
          label="Ścieżka obrazu referencyjnego"
          placeholder="D:\gry\hud.png"
          spellCheck={false}
        />
      </Panel>

      <Panel
        description="Region wskazuje OCR fragment klatki do odczytu. Współrzędne są zapisywane w pikselach źródłowych obrazu, więc zmiana rozmiaru okna ich nie przesuwa."
        eyebrow="Profil gry"
        title="Regiony HUD"
      >
        {currentProfile.isPending ? <Loading label="Sprawdzanie bieżącego profilu…" /> : null}

        {currentProfile.isError ? (
          <FatalError
            description={describeApiError(currentProfile.error).message}
            onRetry={() => {
              void currentProfile.refetch();
            }}
            title="Nie udało się sprawdzić bieżącego profilu"
          />
        ) : null}

        {currentProfile.isSuccess && profile === null ? (
          <Empty
            description="API udostępnia obraz referencyjny dopiero po zapisaniu profilu, a zapis wymaga regionów w tym samym żądaniu. Pierwszy profil w instalacji trzeba więc na razie utworzyć poza tym ekranem."
            title="Nie ma obrazu, na którym można rysować"
          />
        ) : null}

        {currentProfile.isSuccess && profile !== null ? (
          <>
            <Notice title="Rysujesz na obrazie bieżącego profilu">
              Podgląd pochodzi z profilu „{profile.name}” ({profile.source_width} ×{" "}
              {profile.source_height} px), bo API serwuje obraz wyłącznie po identyfikatorze
              zapisanego zasobu. Jeśli plik z pola ścieżki ma inne wymiary, backend odrzuci regiony
              jako wykraczające poza obraz.
            </Notice>
            <DataList
              items={[
                { label: "Profil źródłowy podglądu", value: profile.name },
                {
                  hint: "Wymiary naturalne obrazu, w których zapisywane są regiony.",
                  label: "Rozdzielczość",
                  value: `${String(profile.source_width)} × ${String(profile.source_height)} px`,
                },
                { label: "Zaznaczone regiony", value: String(regions.length) },
              ]}
              layout="columns"
            />
            <RegionEditor
              assetUrl={referenceAssetUrl(profile.reference_asset_id)}
              disabled={busy}
              error={messageOf(form.formState.errors.regions)}
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
        <Button loading={busy} loadingLabel="Zapisywanie profilu…" type="submit">
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
