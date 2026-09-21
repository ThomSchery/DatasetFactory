import type {
  Category,
  CopyPreviousAnnotationsRequest,
  PreviousFrameClass,
} from "../../api";

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

/**
 * Names the copy picker, and with it the number every row ends in.
 *
 * The count has to be readable as a count without repeating the word on each
 * row, so the unit lives here — in the collection's accessible name — and the
 * rows carry the digit.
 */
export const PREVIOUS_CLASS_LIST_LABEL =
  "Klasy z poprzedniej klatki i liczba ich wystąpień";

/**
 * The picker restricted to what the previous frame actually holds, with the
 * occurrence count on each class.
 *
 * Order and grouping come from the profile, so a class sits where the operator
 * is used to finding it; membership and counts come from the backend, which is
 * the only side that knows which frame is the temporal predecessor (FE-017 C).
 * A class the previous frame does not carry is absent rather than disabled:
 * a selectable row that cannot copy anything is what produced `copied: 0`
 * without explanation.
 */
export function previousClassOptionGroups(
  categories: readonly Category[],
  previousClasses: readonly PreviousFrameClass[],
): readonly GroupedOptionGroup[] {
  const countById = new Map(previousClasses.map((item) => [item.category_id, item.count]));
  return COPY_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    options: categories
      .filter((category) => category.kind === group.id && countById.has(category.id))
      .map((category) => ({
        /*
         * The bare count, not "3 wystąpienia": the side column is 288 px wide
         * and a spelled-out unit on every row left the class name with four
         * broken lines. The unit is said once, in the list's accessible name,
         * where it costs no width (`PREVIOUS_CLASS_LIST_LABEL`).
         */
        detail: String(countById.get(category.id) ?? 0),
        id: category.id,
        label: category.name,
      })),
  })).filter((group) => group.options.length > 0);
}

/** All classes of a kind, in profile order, so the default selection is stable. */
export function categoryIdsOfKind(
  categories: readonly Category[],
  kind: Category["kind"],
): readonly string[] {
  return categories.filter((category) => category.kind === kind).map((category) => category.id);
}

/**
 * The classes the picker may offer, in profile order.
 *
 * The default selection and the "is anything selectable" question both need
 * this, and both have to agree with `previousClassOptionGroups` about which
 * classes exist at all.
 */
export function previousClassIds(
  categories: readonly Category[],
  previousClasses: readonly PreviousFrameClass[],
): readonly string[] {
  const present = new Set(previousClasses.map((item) => item.category_id));
  return categories.filter((category) => present.has(category.id)).map((category) => category.id);
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
