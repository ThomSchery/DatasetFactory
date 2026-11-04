import { CHARACTER_CLASS_ALPHABET } from "../../api";
import type {
  CategoryKind,
  CreateProfileRequest,
  GameProfile,
  SaveProfileDefinitionRequest,
} from "../../api";
import { DEFAULT_REGION_PAGE_SEGMENTATION_MODE } from "./schemas";

/*
 * The profile workspace holds one draft and compares it against the baseline
 * it was loaded from. Everything in this module is pure, because the two
 * questions that matter — "is this dirty" and "what exactly gets sent" — are
 * the ones a component is worst at answering honestly.
 *
 * A region's `id` is the whole contract with the backend: present means an
 * existing row to update in place, absent means a row that does not exist yet.
 * `key` is separate and client-only, because a region drawn a second ago still
 * needs something stable for React and the overlay to hold on to.
 */

export interface DraftRegion {
  /** Client-side identity; never sent. */
  key: string;
  /** Durable identity, or `null` for a region drawn in this session. */
  id: string | null;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  allowed_chars: string | null;
  page_segmentation_mode: number | null;
}

export interface DraftCategory {
  key: string;
  id: string | null;
  name: string;
  kind: CategoryKind;
}

export interface ProfileDraft {
  /** `null` while the workspace is defining a profile that does not exist. */
  profileId: string | null;
  name: string;
  /** `expected_version` for the next save; `null` for an unsaved profile. */
  version: number | null;
  /** The asset the regions are drawn on: a stored one, or a staged preview. */
  referenceAssetId: string | null;
  referenceAssetUrl: string | null;
  sourceWidth: number | null;
  sourceHeight: number | null;
  regions: DraftRegion[];
  categories: DraftCategory[];
}

let counter = 0;

/** A key no server identifier can collide with. */
export function draftKey(prefix: string): string {
  counter += 1;
  return `${prefix}-${String(counter)}`;
}

/** Every OCR character class, which is what a fresh profile starts with. */
export function baseCharacterCategories(): DraftCategory[] {
  return CHARACTER_CLASS_ALPHABET.map((name) => ({
    key: draftKey("category"),
    id: null,
    name,
    kind: "character" as const,
  }));
}

/**
 * The starting point for a profile that does not exist yet.
 *
 * It carries the same panels as a loaded profile and the same base character
 * groups; only `Custom` is empty, because a custom class is one the operator
 * names on a box they drew.
 */
export function emptyDraft(): ProfileDraft {
  return {
    profileId: null,
    name: "",
    version: null,
    referenceAssetId: null,
    referenceAssetUrl: null,
    sourceWidth: null,
    sourceHeight: null,
    regions: [],
    categories: baseCharacterCategories(),
  };
}

export function draftFromProfile(profile: GameProfile): ProfileDraft {
  return {
    profileId: profile.id,
    name: profile.name,
    version: profile.version,
    referenceAssetId: profile.reference_asset_id,
    referenceAssetUrl: profile.reference_asset_url,
    sourceWidth: profile.source_width,
    sourceHeight: profile.source_height,
    regions: profile.regions.map((region) => ({
      key: draftKey("region"),
      id: region.id,
      name: region.name,
      x: region.x,
      y: region.y,
      width: region.width,
      height: region.height,
      allowed_chars: region.allowed_chars ?? null,
      page_segmentation_mode: region.page_segmentation_mode ?? null,
    })),
    categories: profile.categories.map((category) => ({
      key: draftKey("category"),
      id: category.id,
      name: category.name,
      kind: category.kind,
    })),
  };
}

/**
 * What the draft means, with the client-only parts removed.
 *
 * Comparing this rather than the draft itself is what keeps `key` — and the
 * order the overlay happens to hold regions in — out of the dirty decision.
 */
function comparable(draft: ProfileDraft): string {
  const regions = draft.regions
    .map((region) =>
      JSON.stringify([
        region.id ?? "",
        region.name.trim(),
        region.x,
        region.y,
        region.width,
        region.height,
        region.allowed_chars,
        region.page_segmentation_mode,
      ]),
    )
    .sort();
  const categories = draft.categories
    .map((category) => [category.id ?? "", category.name.trim(), category.kind].join("\u0000"))
    .sort();
  return JSON.stringify({
    categories,
    name: draft.name.trim(),
    profileId: draft.profileId,
    referenceAssetId: draft.referenceAssetId,
    regions,
  });
}

/** True when the draft says something different from what was loaded. */
export function isDirty(draft: ProfileDraft, baseline: ProfileDraft): boolean {
  return comparable(draft) !== comparable(baseline);
}

export function hasCategoryNamed(draft: ProfileDraft, name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return draft.categories.some((category) => category.name.trim().toLowerCase() === normalized);
}

export function hasRegionNamed(
  draft: ProfileDraft,
  name: string,
  exceptKey?: string,
): boolean {
  const normalized = name.trim().toLowerCase();
  return draft.regions.some(
    (region) => region.key !== exceptKey && region.name.trim().toLowerCase() === normalized,
  );
}

/** Every character class of the draft, in profile order, as one string. */
export function characterAlphabetOf(draft: ProfileDraft): string {
  return draft.categories
    .filter((category) => category.kind === "character")
    .map((category) => category.name)
    .join("");
}

/**
 * Accepting a drawn box: a region named by the operator, plus the class that
 * name refers to when it is one the profile does not have yet.
 *
 * A new class is `game`, not `character`: the character alphabet is closed and
 * belongs to OCR, while a box the operator named is something they will verify
 * by hand. That is the same distinction the backend enforces.
 */
export function withAcceptedSketch(
  draft: ProfileDraft,
  sketch: { x: number; y: number; width: number; height: number },
  name: string,
): ProfileDraft {
  const trimmed = name.trim();
  const region: DraftRegion = {
    key: draftKey("region"),
    id: null,
    name: trimmed,
    x: sketch.x,
    y: sketch.y,
    width: sketch.width,
    height: sketch.height,
    allowed_chars: characterAlphabetOf(draft),
    page_segmentation_mode: DEFAULT_REGION_PAGE_SEGMENTATION_MODE,
  };
  const categories = hasCategoryNamed(draft, trimmed)
    ? draft.categories
    : [
        ...draft.categories,
        { key: draftKey("category"), id: null, name: trimmed, kind: "game" as const },
      ];
  return { ...draft, categories, regions: [...draft.regions, region] };
}

export function saveRequestFrom(draft: ProfileDraft): SaveProfileDefinitionRequest {
  if (draft.version === null) {
    throw new Error("A profile that was never saved has no version to send");
  }
  return {
    expected_version: draft.version,
    regions: draft.regions.map((region) => ({
      allowed_chars: region.allowed_chars,
      height: region.height,
      id: region.id,
      name: region.name.trim(),
      page_segmentation_mode: region.page_segmentation_mode,
      width: region.width,
      x: region.x,
      y: region.y,
    })),
    categories: draft.categories.map((category) => ({
      id: category.id,
      kind: category.kind,
      name: category.name.trim(),
    })),
  };
}

/**
 * The same draft as a brand-new profile.
 *
 * Durable identifiers are dropped on the way: a copy must not inherit the ids
 * of the profile it came from, and the backend mints its own. The reference
 * asset travels as an identifier so the copy gets its own file rather than
 * sharing a row.
 */
export function createRequestFrom(draft: ProfileDraft, name: string): CreateProfileRequest {
  if (draft.referenceAssetId === null) {
    throw new Error("A profile cannot be created without a reference image");
  }
  return {
    name: name.trim(),
    reference_asset_id: draft.referenceAssetId,
    regions: draft.regions.map((region) => ({
      allowed_chars: region.allowed_chars,
      height: region.height,
      name: region.name.trim(),
      page_segmentation_mode: region.page_segmentation_mode,
      width: region.width,
      x: region.x,
      y: region.y,
    })),
    categories: draft.categories.map((category) => ({
      kind: category.kind,
      name: category.name.trim(),
    })),
  };
}

/** A default name for a freshly drawn box that no existing region holds. */
export function nextRegionName(draft: ProfileDraft): string {
  let ordinal = draft.regions.length + 1;
  while (hasRegionNamed(draft, `Region ${String(ordinal)}`)) {
    ordinal += 1;
  }
  return `Region ${String(ordinal)}`;
}
