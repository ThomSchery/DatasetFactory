import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import {
  activateProfile,
  categoryGroupIdOf,
  categoryGroupLabelOf,
  categoryInputFromName,
  categoryNameConflictFromError,
  describeApiError,
  getProfile,
  groupCategories,
  invalidateFor,
  isVersionConflict,
  listProfiles,
  queryKeys,
  renameProfileCategory,
} from "../../api";
import type { Category, RenameCategoryRequest } from "../../api";
import { Button } from "../../components/common/Button";
import { CollapsibleGroup } from "../../components/common/CollapsibleGroup";
import { DataList } from "../../components/common/DataList";
import { Notice } from "../../components/common/Notice";
import { Panel } from "../../components/common/Panel";
import { StatusBadge } from "../../components/common/StatusBadge";
import { TextField } from "../../components/common/TextField";
import { Empty, FatalError, InlineError, Loading } from "../../components/common/UiStates";
import { ProfileCreateScreen } from "./ProfileCreateScreen";
import { ProfileRegionAdder } from "./ProfileRegionAdder";
import "./ProfilesScreen.css";

function formatCreatedAt(value: string): string {
  return new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

function renameFailureMessage(error: unknown): string {
  const conflict = categoryNameConflictFromError(error);
  if (conflict !== null) {
    return `Klasa „${conflict.name}” już istnieje w tym profilu. Podaj inną nazwę.`;
  }
  if (isVersionConflict(error)) {
    return "Profil zmienił się w innej karcie. Odśwież widok i spróbuj ponownie.";
  }
  const failure = describeApiError(error);
  return `${failure.message} ${failure.action}`;
}

export function ProfilesScreen({ initialCreate = false }: { initialCreate?: boolean }) {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(initialCreate);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameValidation, setRenameValidation] = useState<string | null>(null);
  const [collapsedCategoryGroups, setCollapsedCategoryGroups] = useState<ReadonlySet<string>>(
    new Set(),
  );

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
  const rename = useMutation({
    mutationFn: ({
      categoryId,
      profileId,
      request,
    }: {
      categoryId: string;
      profileId: string;
      request: RenameCategoryRequest;
    }) => renameProfileCategory(profileId, categoryId, request),
    onSuccess: async (profile) => {
      setEditingCategoryId(null);
      setRenameDraft("");
      setRenameValidation(null);
      await invalidateFor(queryClient, { type: "profile-category-renamed", profileId: profile.id });
    },
  });

  useEffect(() => {
    setEditingCategoryId(null);
    setRenameDraft("");
    setRenameValidation(null);
    setCollapsedCategoryGroups(new Set());
    rename.reset();
    // `rename` changes identity on each render. The selected profile is the
    // deliberate boundary that closes an open row editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  function beginRename(category: Category) {
    rename.reset();
    setEditingCategoryId(category.id);
    setRenameDraft(category.name);
    setRenameValidation(null);
  }

  function cancelRename() {
    rename.reset();
    setEditingCategoryId(null);
    setRenameDraft("");
    setRenameValidation(null);
  }

  function saveRename(category: Category) {
    if (detail.data === undefined) {
      return;
    }
    const categoryInput = categoryInputFromName(renameDraft);
    if (categoryInput === null) {
      setRenameValidation("Podaj nazwę klasy od 1 do 200 znaków.");
      return;
    }
    setRenameValidation(null);
    rename.mutate({
      categoryId: category.id,
      profileId: detail.data.id,
      request: { ...categoryInput, expected_version: detail.data.version },
    });
  }

  function toggleCategoryGroup(groupId: string): void {
    setCollapsedCategoryGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }

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
          description="Istniejące regiony pozostają tylko do odczytu; możesz dodać następny dla przyszłych runów. Nazwy klas możesz porządkować bez zmiany istniejących anotacji."
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
              <ProfileRegionAdder profile={detail.data} />
              <Notice title="Ukończone eksporty pozostają niezmienne">
                Zmiana nazwy klasy pojawi się w przyszłych eksportach. Nie modyfikuje paczek już
                zapisanych w workspace.
              </Notice>
              <div aria-label="Klasy profilu" className="df-profile-collection__categories">
                {groupCategories(detail.data.categories, (category) => category).map((group) => (
                  <CollapsibleGroup
                    key={group.id}
                    label={group.label}
                    onToggle={() => toggleCategoryGroup(group.id)}
                    open={!collapsedCategoryGroups.has(group.id)}
                  >
                    <ul className="df-profile-collection__category-list">
                      {group.items.map((category) => {
                        const target = categoryInputFromName(renameDraft);
                        const editing = editingCategoryId === category.id;
                        const unchanged =
                          target !== null &&
                          target.name === category.name &&
                          target.kind === category.kind;
                        return (
                          <li
                            className={
                              editing
                                ? "df-profile-collection__category df-profile-collection__category--editing"
                                : "df-profile-collection__category"
                            }
                            key={category.id}
                          >
                            {editing ? (
                              <div className="df-profile-collection__category-editor">
                                <TextField
                                  autoFocus
                                  disabled={rename.isPending}
                                  error={
                                    renameValidation ??
                                    (rename.isError
                                      ? renameFailureMessage(rename.error)
                                      : undefined)
                                  }
                                  label={`Nowa nazwa klasy ${category.name}`}
                                  maxLength={200}
                                  onChange={(event) => {
                                    setRenameDraft(event.target.value);
                                    setRenameValidation(null);
                                    rename.reset();
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                      event.preventDefault();
                                      saveRename(category);
                                    }
                                    if (event.key === "Escape") {
                                      cancelRename();
                                    }
                                  }}
                                  value={renameDraft}
                                />
                                {target !== null &&
                                categoryGroupIdOf(target) !== categoryGroupIdOf(category) ? (
                                  <Notice title="Klasa zmieni grupę" tone="warning">
                                    Po zapisaniu klasa przejdzie z „
                                    {categoryGroupLabelOf(category)}” do „
                                    {categoryGroupLabelOf(target)}”.
                                  </Notice>
                                ) : null}
                                <div className="df-profile-collection__category-actions">
                                  <Button
                                    disabled={rename.isPending || target === null || unchanged}
                                    loading={rename.isPending}
                                    loadingLabel="Zapisywanie nazwy…"
                                    onClick={() => saveRename(category)}
                                    size="sm"
                                  >
                                    Zapisz nazwę
                                  </Button>
                                  <Button
                                    disabled={rename.isPending}
                                    onClick={cancelRename}
                                    size="sm"
                                    variant="secondary"
                                  >
                                    Anuluj
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <span className="df-profile-collection__category-name">
                                  {category.name}
                                </span>
                                <div className="df-profile-collection__category-actions">
                                  <StatusBadge tone="neutral">
                                    {category.kind === "character" ? "OCR" : "Gra"}
                                  </StatusBadge>
                                  <Button
                                    aria-label={`Zmień nazwę klasy ${category.name}`}
                                    disabled={rename.isPending}
                                    onClick={() => beginRename(category)}
                                    size="sm"
                                    variant="secondary"
                                  >
                                    Zmień nazwę
                                  </Button>
                                </div>
                              </>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </CollapsibleGroup>
                ))}
              </div>
            </div>
          ) : null}
        </Panel>
      )}
    </div>
  );
}
