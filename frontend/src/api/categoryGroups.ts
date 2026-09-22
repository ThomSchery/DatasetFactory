import type { Category, CategoryInput } from "./types";

/*
 * How a profile's classes are grouped for a human, in one place.
 *
 * FE-018 B splits the single `ZNAKI` group. `_CHARACTER_CATEGORIES` in the
 * definition engine is `-/0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ`: ten digits,
 * twenty-six letters, and two characters that are neither. `-` and `/` get a
 * group of their own rather than being filed under digits or letters, which
 * would be untrue, or hidden, which would take away classes the operator
 * actually annotates with.
 *
 * This module is the single answer for both screens that show the split — the
 * annotation panel and the game profile screen — and for the FE-016 warning
 * about a class changing group, which now compares group identifiers rather
 * than `kind`: renaming `7` to `A` keeps `kind: "character"` and still moves
 * the class from `Liczby` to `Litery`.
 */

export type CategoryGroupId = "game" | "digits" | "letters" | "symbols";

export interface CategoryGroupDescriptor {
  id: CategoryGroupId;
  label: string;
}

/** The four groups, in the order every list shows them. */
export const CATEGORY_GROUPS: readonly CategoryGroupDescriptor[] = [
  { id: "game", label: "Pola HUD (gra)" },
  { id: "digits", label: "Liczby" },
  { id: "letters", label: "Litery" },
  { id: "symbols", label: "Symbole" },
];

const DIGIT = /^[0-9]$/;
const LETTER = /^[A-Z]$/;

/**
 * Which group a class belongs to.
 *
 * Anything the engine would accept as a character but this function does not
 * recognise falls into `Symbole`, so a class can never disappear from the list
 * because the alphabet grew a member this file has not heard of.
 */
export function categoryGroupIdOf(category: Category | CategoryInput): CategoryGroupId {
  if (category.kind === "game") {
    return "game";
  }
  const name = category.name.trim();
  if (DIGIT.test(name)) {
    return "digits";
  }
  return LETTER.test(name) ? "letters" : "symbols";
}

export function categoryGroupLabelOf(category: Category | CategoryInput): string {
  const id = categoryGroupIdOf(category);
  return CATEGORY_GROUPS.find((group) => group.id === id)?.label ?? id;
}

export interface CategoryGroup<TItem> {
  id: CategoryGroupId;
  items: readonly TItem[];
  label: string;
}

/**
 * The profile's classes in the four groups, each mapped by the caller.
 *
 * Order inside a group is the profile's own, so a class sits where the operator
 * is used to finding it. An empty group is dropped rather than rendered: a
 * profile with no letters has no `Litery` heading at all.
 */
export function groupCategories<TItem>(
  categories: readonly Category[],
  toItem: (category: Category) => TItem,
): readonly CategoryGroup<TItem>[] {
  return CATEGORY_GROUPS.map((group) => ({
    id: group.id,
    items: categories
      .filter((category) => categoryGroupIdOf(category) === group.id)
      .map((category) => toItem(category)),
    label: group.label,
  })).filter((group) => group.items.length > 0);
}
