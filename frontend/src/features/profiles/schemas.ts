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

export const OCR_PAGE_SEGMENTATION_OPTIONS = [
  { value: "3", label: "3 — Automatic page layout" },
  { value: "4", label: "4 — A column of text of variable sizes" },
  { value: "6", label: "6 — One uniform block of text" },
  { value: "7", label: "7 — One text line" },
  { value: "8", label: "8 — One word" },
  { value: "10", label: "10 — One character" },
  { value: "11", label: "11 — Sparse text lines or fragments (verified for HUD)" },
  { value: "12", label: "12 — Sparse text with orientation detection" },
  { value: "13", label: "13 — Raw single line" },
] as const;

export const DEFAULT_REGION_PAGE_SEGMENTATION_MODE = 7;

const OCR_PAGE_SEGMENTATION_MODES = new Set<number>(
  OCR_PAGE_SEGMENTATION_OPTIONS.map((option) => Number(option.value)),
);

export function characterClassesOf(
  categories: readonly { kind: "character" | "game"; name: string }[],
): string[] {
  return categories
    .filter((category) => category.kind === "character")
    .map((category) => category.name);
}

export function regionOcrValidation(
  allowedChars: string,
  pageSegmentationMode: number,
  characterClasses: readonly string[],
): { allowedChars?: string; pageSegmentationMode?: string } {
  const errors: { allowedChars?: string; pageSegmentationMode?: string } = {};
  if (allowedChars.length === 0) {
    errors.allowedChars = "Enter at least one allowed character.";
  } else {
    const available = new Set(characterClasses);
    const unsupported = [...new Set([...allowedChars].filter((char) => !available.has(char)))];
    if (unsupported.length > 0) {
      errors.allowedChars = `Characters outside the profile classes: ${unsupported.join(" ")}. Add the classes or remove these characters from the range.`;
    }
  }
  if (!OCR_PAGE_SEGMENTATION_MODES.has(pageSegmentationMode)) {
    errors.pageSegmentationMode = "Choose a supported text layout.";
  }
  return errors;
}

/**
 * Mirrors Python `str.casefold()`, which `_require_unique` uses server side.
 * `toLowerCase` is not the same mapping: it leaves `ß` and final `ς` alone,
 * where casefold folds them onto `ss` and `σ`. Without the extra folds the
 * inline check would call `Straße`/`STRASSE` distinct and let the form pass,
 * only for the backend to reject the profile as a duplicate. JavaScript has no
 * full case-folding primitive, so exotic scripts can still differ — the
 * backend stays the authority and its error is surfaced as-is.
 */
function caseFold(value: string): string {
  return value.normalize("NFKC").toLowerCase().replaceAll("ß", "ss").replaceAll("ς", "σ");
}

/** `_require_unique` compares case-folded names. */
function hasDuplicateNames(names: readonly string[]): number | null {
  const seen = new Set<string>();
  for (const [index, name] of names.entries()) {
    const normalized = caseFold(name.trim());
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
  name: boundedName("Name the region.", "A region name can have at most 200 characters."),
  // `RegionRequest`: x/y are `ge=0`, width/height are `gt=0`.
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  width: z.number().int().positive("A region needs a positive width."),
  height: z.number().int().positive("A region needs a positive height."),
  allowed_chars: z.string().min(1, "Enter at least one allowed character."),
  page_segmentation_mode: z
    .number()
    .int()
    .refine((value) => OCR_PAGE_SEGMENTATION_MODES.has(value), {
      message: "Choose a supported text layout.",
    }),
});

export type RegionValue = z.infer<typeof regionSchema>;

export const categorySchema = z
  .object({
    name: boundedName("Name the class.", "A class name can have at most 200 characters."),
    kind: z.enum(["character", "game"]),
  })
  .refine((category) => category.kind !== "character" || CHARACTER_CLASSES.has(category.name), {
    message: "A base class must be one character of the OCR alphabet.",
    path: ["name"],
  });

export type CategoryValue = z.infer<typeof categorySchema>;

export const profileCreateSchema = z
  .object({
    name: boundedName("Enter a profile name.", "A profile name can have at most 200 characters."),
    reference_image_path: z
      .string()
      .trim()
      .refine(
        (value) => value === "" || ABSOLUTE_PATH.test(value),
        "The path must be absolute, e.g. D:\\games\\hud.png.",
      ),
    // `Field(min_length=1)` on both collections, and `regions_required` /
    // `categories_required` in the definition engine behind it.
    regions: z.array(regionSchema).min(1, "Draw at least one HUD region on the image."),
    categories: z.array(categorySchema).min(1, "Add at least one class."),
  })
  .superRefine((profile, ctx) => {
    const duplicateRegion = hasDuplicateNames(profile.regions.map((region) => region.name));
    if (duplicateRegion !== null) {
      ctx.addIssue({
        code: "custom",
        message: "Region names must be unique within the profile.",
        path: ["regions"],
      });
    }
    const duplicateCategory = hasDuplicateNames(profile.categories.map((category) => category.name));
    if (duplicateCategory !== null) {
      ctx.addIssue({
        code: "custom",
        message: "Class names must be unique within the profile.",
        path: ["categories"],
      });
    }
    const characterClasses = characterClassesOf(profile.categories);
    profile.regions.forEach((region, index) => {
      const errors = regionOcrValidation(
        region.allowed_chars,
        region.page_segmentation_mode,
        characterClasses,
      );
      if (errors.allowedChars !== undefined) {
        ctx.addIssue({
          code: "custom",
          message: errors.allowedChars,
          path: ["regions", index, "allowed_chars"],
        });
      }
    });
  });

export type ProfileCreateValues = z.input<typeof profileCreateSchema>;

/** True when adding `name` would collide with one already in `existing`. */
export function isDuplicateName(existing: readonly string[], name: string): boolean {
  return hasDuplicateNames([...existing, name]) !== null;
}
