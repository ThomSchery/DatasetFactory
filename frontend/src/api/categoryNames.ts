import type { CategoryInput } from "./types";

/** The exact character alphabet accepted by DatasetDefinitionEngine. */
export const CHARACTER_CLASS_ALPHABET: readonly string[] = [
  ..."-/0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
];

const CHARACTER_CLASSES = new Set(CHARACTER_CLASS_ALPHABET);

/**
 * The closest browser-side equivalent of Python's `str.casefold()` used by
 * `_require_unique`. JavaScript has no complete Unicode case-folding API, so
 * the backend remains authoritative for uncommon scripts.
 */
export function caseFoldCategoryName(value: string): string {
  return value.trim().toLowerCase().replaceAll("ß", "ss").replaceAll("ς", "σ");
}

export function isDuplicateCategoryName(
  existing: readonly string[],
  candidate: string,
): boolean {
  const foldedCandidate = caseFoldCategoryName(candidate);
  return existing.some((name) => caseFoldCategoryName(name) === foldedCandidate);
}

/**
 * Turns the filter text into the category contract without asking the operator
 * for a domain detail the name already determines. Lowercase ASCII letters
 * are canonicalised to the uppercase character alphabet; all other names are
 * game-specific categories and keep their casing.
 */
export function categoryInputFromName(value: string): CategoryInput | null {
  const name = value.trim();
  if (name === "" || name.length > 200) {
    return null;
  }

  const uppercase = name.toLocaleUpperCase("en-US");
  if ([...name].length === 1 && [...uppercase].length === 1 && CHARACTER_CLASSES.has(uppercase)) {
    return { kind: "character", name: uppercase };
  }
  return { kind: "game", name };
}
