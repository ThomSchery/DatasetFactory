import { z } from "zod";

/*
 * Client-side validation only (FE-05). It mirrors what `POST /profiles`
 * enforces so a mistake costs no round trip; Pydantic and
 * `DatasetDefinitionEngine` validate the same contract independently and their
 * verdict is the one that counts. Nothing here reinterprets a backend error
 * code — those go through `api/messages.ts` verbatim.
 *
 * Deliberately absent: whether the file exists, whether it decodes as an
 * image, and what its dimensions are. Only the backend can answer that, and
 * guessing would produce a second, quieter contract.
 */

/**
 * The same shape as the twin in `features/materials/schemas.ts`, mirroring a
 * different backend check: `Path(reference_image_path).is_absolute()` in
 * `profile_use_cases.create_profile`, which answers `reference_path_not_absolute`.
 */
const ABSOLUTE_PATH = /^([a-zA-Z]:[\\/]|\\\\|\/)/;

/**
 * The closed alphabet `_CHARACTER_CATEGORIES` in
 * `backend/app/engines/definition/engine.py`. A base class is one OCR
 * character, so it is chosen from this set rather than typed — a free-text
 * field would let the user write a name the backend can only reject.
 */
export const CHARACTER_CLASS_ALPHABET: readonly string[] = [
  ..."-/0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
];

const CHARACTER_CLASSES = new Set(CHARACTER_CLASS_ALPHABET);

/** `_require_unique` compares case-folded names. */
function hasDuplicateNames(names: readonly string[]): number | null {
  const seen = new Set<string>();
  for (const [index, name] of names.entries()) {
    const normalized = name.trim().toLowerCase();
    if (seen.has(normalized)) {
      return index;
    }
    seen.add(normalized);
  }
  return null;
}

const boundedName = (missing: string, tooLong: string) =>
  z.string().trim().min(1, missing).max(200, tooLong);

/**
 * A region as the editor holds it: source pixels plus a client-side `id` so
 * React and the overlay can key it. The `id` is dropped on the way to the API,
 * which mints its own.
 */
export const regionSchema = z.object({
  id: z.string().min(1),
  name: boundedName("Nazwij region.", "Nazwa regionu może mieć najwyżej 200 znaków."),
  // `RegionRequest`: x/y are `ge=0`, width/height are `gt=0`.
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  width: z.number().int().positive("Region musi mieć dodatnią szerokość."),
  height: z.number().int().positive("Region musi mieć dodatnią wysokość."),
});

export type RegionValue = z.infer<typeof regionSchema>;

export const categorySchema = z
  .object({
    name: boundedName("Nazwij klasę.", "Nazwa klasy może mieć najwyżej 200 znaków."),
    kind: z.enum(["character", "game"]),
  })
  .refine((category) => category.kind !== "character" || CHARACTER_CLASSES.has(category.name), {
    message: "Klasa bazowa musi być jednym znakiem z alfabetu OCR.",
    path: ["name"],
  });

export type CategoryValue = z.infer<typeof categorySchema>;

export const profileCreateSchema = z
  .object({
    name: boundedName("Podaj nazwę profilu.", "Nazwa profilu może mieć najwyżej 200 znaków."),
    reference_image_path: z
      .string()
      .trim()
      .min(1, "Podaj ścieżkę do obrazu referencyjnego.")
      .regex(ABSOLUTE_PATH, "Ścieżka musi być bezwzględna, np. D:\\gry\\hud.png."),
    // `Field(min_length=1)` on both collections, and `regions_required` /
    // `categories_required` in the definition engine behind it.
    regions: z.array(regionSchema).min(1, "Zaznacz przynajmniej jeden region HUD na obrazie."),
    categories: z.array(categorySchema).min(1, "Dodaj przynajmniej jedną klasę."),
  })
  .superRefine((profile, ctx) => {
    const duplicateRegion = hasDuplicateNames(profile.regions.map((region) => region.name));
    if (duplicateRegion !== null) {
      ctx.addIssue({
        code: "custom",
        message: "Nazwy regionów muszą być unikalne w profilu.",
        path: ["regions"],
      });
    }
    const duplicateCategory = hasDuplicateNames(profile.categories.map((category) => category.name));
    if (duplicateCategory !== null) {
      ctx.addIssue({
        code: "custom",
        message: "Nazwy klas muszą być unikalne w profilu.",
        path: ["categories"],
      });
    }
  });

export type ProfileCreateValues = z.input<typeof profileCreateSchema>;

/** True when adding `name` would collide with one already in `existing`. */
export function isDuplicateName(existing: readonly string[], name: string): boolean {
  return hasDuplicateNames([...existing, name]) !== null;
}
