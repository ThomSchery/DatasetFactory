import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  activateProfile,
  describeApiError,
  getProfile,
  invalidateFor,
  listProfiles,
  queryKeys,
  referenceAssetUrl,
} from "../../api";
import { Button } from "../../components/common/Button";
import { DataList } from "../../components/common/DataList";
import { Panel } from "../../components/common/Panel";
import { RegionOverlay } from "../../components/common/RegionOverlay";
import { StatusBadge } from "../../components/common/StatusBadge";
import { Empty, FatalError, InlineError, Loading } from "../../components/common/UiStates";
import { ProfileCreateScreen } from "./ProfileCreateScreen";
import "./ProfilesScreen.css";

function formatCreatedAt(value: string): string {
  return new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

export function ProfilesScreen({ initialCreate = false }: { initialCreate?: boolean }) {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(initialCreate);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const profiles = useQuery({
    queryKey: queryKeys.profiles(),
    queryFn: ({ signal }) => listProfiles(signal),
  });
  const active = profiles.data?.find((profile) => profile.active) ?? profiles.data?.[0];
  const selectedId = previewId ?? active?.id ?? null;
  const detail = useQuery({
    queryKey: queryKeys.profile(selectedId ?? "none"),
    queryFn: ({ signal }) => getProfile(selectedId as string, signal),
    enabled: selectedId !== null,
  });

  const selection = useMutation({
    mutationFn: activateProfile,
    onSuccess: async (profile) => {
      setPreviewId(profile.id);
      await invalidateFor(queryClient, { type: "profile-selected" });
    },
  });
  const selectionFailure = selection.isError ? describeApiError(selection.error) : null;

  if (creating) {
    return <ProfileCreateScreen onCancel={() => setCreating(false)} />;
  }

  return (
    <div className="df-profile-collection">
      <Panel
        aside={<Button onClick={() => setCreating(true)}>Utwórz nowy profil</Button>}
        description="Aktywny profil jest domyślnym kontekstem nowych runów. Starsze profile i ich runy pozostają zachowane."
        eyebrow="Profile gier"
        title="Zapisane profile"
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
        {profiles.isSuccess && profiles.data.length === 0 ? (
          <Empty
            action={<Button onClick={() => setCreating(true)}>Utwórz pierwszy profil</Button>}
            description="Profil łączy obraz referencyjny, regiony HUD i klasy używane przez OCR."
            title="Brak profili gry"
          />
        ) : null}
        {profiles.isSuccess && profiles.data.length > 0 ? (
          <ul className="df-profile-collection__list">
            {profiles.data.map((profile) => (
              <li className="df-profile-collection__row" key={profile.id}>
                <div className="df-profile-collection__identity">
                  <div className="df-profile-collection__heading">
                    <strong>{profile.name}</strong>
                    {profile.active ? (
                      <StatusBadge srLabel="Wybór profilu:" tone="brand">
                        Aktywny
                      </StatusBadge>
                    ) : null}
                  </div>
                  <span className="df-profile-collection__meta">
                    {String(profile.source_width)}×{String(profile.source_height)} px ·{" "}
                    {String(profile.region_count)} regiony · {String(profile.category_count)} klas ·{" "}
                    {formatCreatedAt(profile.created_at)}
                  </span>
                </div>
                <div className="df-profile-collection__actions">
                  <Button
                    onClick={() => setPreviewId(profile.id)}
                    size="sm"
                    variant="secondary"
                  >
                    Podgląd
                  </Button>
                  {profile.active ? null : (
                    <Button
                      disabled={selection.isPending}
                      loading={selection.isPending && selection.variables === profile.id}
                      loadingLabel="Wybieranie…"
                      onClick={() => selection.mutate(profile.id)}
                      size="sm"
                    >
                      Ustaw aktywny
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        {selectionFailure === null ? null : (
          <InlineError message={`${selectionFailure.message} ${selectionFailure.action}`} />
        )}
      </Panel>

      {selectedId === null ? null : (
        <Panel
          description="Podgląd zapisanej definicji jest tylko do odczytu; profile nie mają wersjonowanej edycji."
          eyebrow="Definicja profilu"
          title={detail.data?.name ?? "Podgląd profilu"}
        >
          {detail.isPending ? <Loading label="Ładowanie definicji profilu…" /> : null}
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
          {detail.isSuccess ? (
            <div className="df-profile-collection__preview">
              <DataList
                items={[
                  {
                    label: "Rozdzielczość źródłowa",
                    value: `${String(detail.data.source_width)} × ${String(detail.data.source_height)} px`,
                  },
                  { label: "Regiony HUD", value: String(detail.data.regions.length) },
                  { label: "Klasy", value: String(detail.data.categories.length) },
                ]}
                layout="columns"
              />
              <RegionOverlay
                imageAlt={`Klatka referencyjna profilu ${detail.data.name}`}
                imageUrl={referenceAssetUrl(detail.data.reference_asset_id)}
                label={`Regiony HUD profilu ${detail.data.name}`}
                shapes={detail.data.regions.map((region) => ({
                  ...region,
                  label: region.name,
                  tone: "muted" as const,
                }))}
                source={{ width: detail.data.source_width, height: detail.data.source_height }}
              />
              <ul aria-label="Klasy profilu" className="df-profile-collection__categories">
                {detail.data.categories.map((category) => (
                  <li key={category.id}>
                    <span>{category.name}</span>
                    <StatusBadge tone="neutral">
                      {category.kind === "character" ? "OCR" : "Gra"}
                    </StatusBadge>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Panel>
      )}
    </div>
  );
}
