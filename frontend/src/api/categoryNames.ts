import type { CategoryInput } from "./types";

/** The exact character alphabet accepted by DatasetDefinitionEngine. */
export const CHARACTER_CLASS_ALPHABET: readonly string[] = [
  ..."-/0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
];

const CHARACTER_CLASSES = new Set(CHARACTER_CLASS_ALPHABET);

/**
 * A cheap hint for deciding whether the create affordance is useful.
 *
 * This is deliberately not Python `str.casefold()`: browsers expose no
 * equivalent Unicode table. The backend owns duplicate detection and a 409
 * returns the authoritative existing category to the picker.
 */
export function categoryNameDuplicateHintKey(value: string): string {
  return value.trim().toLocaleLowerCase("pl");
}

export function looksLikeDuplicateCategoryName(
  existing: readonly string[],
  candidate: string,
): boolean {
  const candidateHint = categoryNameDuplicateHintKey(candidate);
  return existing.some((name) => categoryNameDuplicateHintKey(name) === candidateHint);
}

/**
 * Turns the filter text into the category contract without asking the operator
 * for a domain detail the name already determines. Lowercase ASCII letters
 * are canonicalised to the uppercase character alphabet; all other names are
 * game-specific categories and keep their casing.
 */
export function categoryInputFromName(value: string): CategoryInput | null {
  const name = value.trim();
  const codePoints = [...name];
  if (name === "" || codePoints.length > 200) {
    return null;
  }

  // The accepted domain decision is intentionally ASCII-only. Unicode
  // uppercasing would silently turn ſ into S and ı into I.
  const canonicalName = /^[a-z]$/.test(name) ? name.toUpperCase() : name;
  if (codePoints.length === 1 && CHARACTER_CLASSES.has(canonicalName)) {
    return { kind: "character", name: canonicalName };
  }
  return { kind: "game", name };
}
