import type { Category, CopyPreviousAnnotationsRequest } from "../../api";

import type { GroupedOptionGroup } from "../../components/common/GroupedOptionList";

/** The two levels the copy picker offers, in the order the panel shows them. */
export const COPY_GROUPS: readonly { id: "game" | "character"; label: string }[] = [
  { id: "game", label: "Pola HUD (gra)" },
  { id: "character", label: "Znaki" },
];

/** Everything a copy request needs beyond the frame version. */
export type CopyPreviousTarget = Pick<
  CopyPreviousAnnotationsRequest,
  "category_id" | "category_ids" | "scope"
>;

export function copyOptionGroups(
  categories: readonly Category[],
): readonly GroupedOptionGroup[] {
  return COPY_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    options: categories
      .filter((category) => category.kind === group.id)
      .map((category) => ({ id: category.id, label: category.name })),
  })).filter((group) => group.options.length > 0);
}

/** All classes of a kind, in profile order, so the default selection is stable. */
export function categoryIdsOfKind(
  categories: readonly Category[],
  kind: Category["kind"],
): readonly string[] {
  return categories.filter((category) => category.kind === kind).map((category) => category.id);
}

function sameMembers(selected: ReadonlySet<string>, candidate: readonly string[]): boolean {
  return (
    candidate.length > 0 &&
    candidate.length === selected.size &&
    candidate.every((id) => selected.has(id))
  );
}

/**
 * Maps a picker selection onto the narrowest request that expresses it.
 *
 * A whole group is still `game`/`character` and a single class is still
 * `category`, so the shapes the backend has always answered keep their exact
 * meaning; only an arbitrary subset needs the `categories` list. `null` means
 * the selection is empty and there is nothing to ask for.
 */
export function copyPreviousTarget(
  selectedIds: readonly string[],
  categories: readonly Category[],
): CopyPreviousTarget | null {
  const selected = new Set(selectedIds.filter((id) => categories.some((item) => item.id === id)));
  if (selected.size === 0) {
    return null;
  }
  if (sameMembers(selected, categoryIdsOfKind(categories, "game"))) {
    return { scope: "game" };
  }
  if (sameMembers(selected, categoryIdsOfKind(categories, "character"))) {
    return { scope: "character" };
  }
  const ordered = categories.filter((item) => selected.has(item.id)).map((item) => item.id);
  const [only] = ordered;
  if (ordered.length === 1 && only !== undefined) {
    return { category_id: only, scope: "category" };
  }
  return { category_ids: ordered, scope: "categories" };
}
