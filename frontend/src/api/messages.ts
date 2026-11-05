import { annotationIdsFromError, isApiError, isApiTransportError } from "./errors";
import type { ErrorDetails } from "./errors";
import type { ExportStatus, RunStatus } from "./types";

/*
 * Central translation of backend error codes into English copy plus a
 * suggested action (FE-001-F1 §Logika.6; English since FE-022). No feature
 * invents its own wording, and no feature reinterprets a code into its own
 * domain meaning (`react-coding-standards.md` §3).
 *
 * Two sources feed this one dictionary:
 *   1. `error.code` from the TECH_PLAN §5 envelope,
 *   2. `error_code` on a finished export from `GET /exports/{id}` —
 *      `export_revision_conflict`, `export_source_missing` and
 *      `export_process_interrupted` are never envelope codes.
 * Both render identically because both go through `describeErrorCode`.
 */

export interface ErrorCopy {
  message: string;
  action: string;
}

const ERROR_COPY: Readonly<Record<string, ErrorCopy>> = {
  // --- optimistic concurrency and review gates (TK-005, TK-007) ---
  version_conflict: {
    message: "The data changed in the meantime and your version is out of date.",
    action: "Refresh the view and repeat the operation on the current state.",
  },
  review_locked: {
    message: "The frame already has a review decision and is frozen.",
    action: "An accepted frame cannot change. Unlock a rejected frame with Reopen.",
  },
  frame_not_reviewable: {
    message: "The frame has not finished OCR yet, so it cannot be reviewed.",
    action: "Wait until the frame reaches review_pending and try again.",
  },
  invalid_review_transition: {
    message: "This review decision is not allowed in the frame's current state.",
    action: "Only a rejected frame can be reopened.",
  },
  bbox_invalid: {
    message: "Some boxes extend beyond the frame.",
    action: "Fix the geometry of the marked boxes and repeat the operation.",
  },
  no_annotations: {
    message: "The frame has no annotations, so it cannot be accepted.",
    action: "Add at least one box or reject the frame.",
  },
  empty_patch: {
    message: "The annotation change request has no field to change.",
    action: "Change the class or the box geometry before saving.",
  },
  category_not_allowed: {
    message: "The chosen class does not belong to this run's profile.",
    action: "Choose a class defined in the game profile.",
  },
  previous_frame_not_found: {
    message: "This frame has no earlier frame in the run.",
    action: "Choose a later frame or edit this group by hand.",
  },

  // --- run lifecycle ---
  active_run: {
    message: "Another run is already active.",
    action: "Pause or finish the current run before starting another one.",
  },
  invalid_transition: {
    message: "This operation is not allowed in the run's current status.",
    action: "Refresh the run status and choose an operation available in that state.",
  },
  source_missing: {
    message: "The source file no longer exists at its saved path.",
    action: "Put the file back in the same place or import the material again.",
  },
  source_changed: {
    message: "The source file changed since it was imported.",
    action: "Import the material again so the run works on a consistent file.",
  },
  invalid_interval: {
    message: "The sample rate is outside the allowed range.",
    action: "Enter an interval greater than zero.",
  },
  profile_changed_during_run_creation: {
    message: "The profile changed while the run was being created.",
    action: "Try again.",
  },
  profile_resolution_mismatch: {
    message: "The material resolution does not match the profile resolution.",
    action:
      "Choose a material with the profile's resolution or create a profile for this resolution.",
  },
  worker_unavailable: {
    message: "The worker that processes runs is unavailable.",
    action: "Check that the backend is running and try again.",
  },
  ocr_provenance_unknown: {
    message: "The run cannot start because the verified Tesseract runtime or model is missing.",
    action:
      "Install Tesseract as described in TD-015 and set its paths and SHA-256 sums in the configuration.",
  },
  ocr_provenance_mismatch: {
    message:
      "The run cannot start because the Tesseract runtime or model does not match the pinned SHA-256 sum.",
    action:
      "Install the verified Tesseract version from TD-015 or correct the pinned sums in the configuration.",
  },
  ocr_configuration_invalid: {
    message: "The run cannot start because the Tesseract configuration is incomplete or invalid.",
    action:
      "Install Tesseract as described in TD-015 and complete the paths, version and SHA-256 sums in the configuration.",
  },

  // --- profiles ---
  profile_name_exists: {
    message: "A profile with this name already exists.",
    action: "Enter a different profile name.",
  },
  // One wording for both recoveries. The panel selects the existing class only
  // when the backend names it; claiming a selection here would be a lie on the
  // path where the winner stays unknown (FE-013-FIX2).
  category_name_exists: {
    message: "A class with this name already exists in the profile.",
    action:
      "The list was refreshed. Pick the existing class from the list and save the assignment, or enter a different name.",
  },
  category_used_by_regions: {
    message: "This class cannot change because region OCR ranges use it.",
    action: "First change the character range of the regions named by the name field.",
  },
  // A whole-profile save that asked to drop a class `annotations` still point
  // at. `Annotation.category_id` is RESTRICT, so there is no version of this
  // that keeps both the deletion and the review work; the copy says so rather
  // than suggesting a retry.
  category_in_use: {
    message: "This class cannot be removed because saved annotations use it.",
    action: "Keep the class in the profile or save the definition as a new profile with Save as.",
  },
  // The add-a-region twin of `category_name_exists`. `hud_regions` carries
  // `UniqueConstraint(profile_id, name)` and the backend names the region that
  // already holds the name, so the screen can point at it.
  region_name_exists: {
    message: "A region with this name already exists in this profile.",
    action: "Enter a different region name.",
  },
  region_persistence_failed: {
    message: "The region could not be saved.",
    action: "Try again; if the error returns, check that the workspace database is available.",
  },
  regions_required: {
    message: "A profile needs at least one HUD region.",
    action: "Draw a region on the reference image.",
  },
  categories_required: {
    message: "A profile needs at least one class.",
    action: "Add a base class or a game-specific class.",
  },
  region_out_of_bounds: {
    message: "The region extends beyond the reference image.",
    action: "Fit the region inside the image.",
  },
  unsupported_reference_image: {
    message: "The reference image format is not supported.",
    action: "Choose an image in a supported format.",
  },
  // Added in FE-001-F3. `POST /profiles` answers with every code
  // `DatasetDefinitionEngine.validate_profile`, `ReferenceImageProbe` and
  // `ProfileUseCases.create_profile` can raise, and each one names a different
  // repair — folding them into the generic fallback would hide which.
  reference_path_not_absolute: {
    message: "The reference image path must be absolute.",
    action: "Enter the full local path to the image file.",
  },
  invalid_reference_image: {
    message: "The chosen file is not a valid image.",
    action: "Choose an undamaged screenshot file.",
  },
  reference_image_unreadable: {
    message: "The reference image could not be read from disk.",
    action: "Check the file permissions and try again.",
  },
  invalid_source_dimensions: {
    message: "The reference image has invalid dimensions.",
    action: "Choose an image with a positive width and height.",
  },
  profile_name_required: {
    message: "A profile needs a name.",
    action: "Enter a profile name.",
  },
  profile_name_too_long: {
    message: "The profile name is too long.",
    action: "Shorten the name to 200 characters.",
  },
  invalid_region_name: {
    message: "The region name is empty or too long.",
    action: "Name the region with 1 to 200 characters.",
  },
  invalid_region_bbox: {
    message: "The region has invalid geometry.",
    action: "A region needs a positive width and height and a non-negative origin.",
  },
  duplicate_region_name: {
    message: "Two regions have the same name.",
    action: "Region names must be unique within the profile.",
  },
  invalid_category_name: {
    message: "The class name is empty or too long.",
    action: "Name the class with 1 to 200 characters.",
  },
  invalid_category_kind: {
    message: "The class kind is not recognised.",
    action: "Choose a base class or a game-specific class.",
  },
  invalid_character_category: {
    message: "The base class is not part of the OCR alphabet.",
    action: "A base class is one character from A–Z, 0–9, “-” and “/”.",
  },
  duplicate_category_name: {
    message: "Two classes have the same name.",
    action: "Class names must be unique within the profile.",
  },
  reference_asset_copy_failed: {
    message: "The reference image could not be copied into the workspace.",
    action: "Check disk space and workspace permissions, then save again.",
  },
  reference_source_required: {
    message: "No reference image source was given.",
    action: "Choose a material and a moment, or use an absolute image path.",
  },
  invalid_frame_timestamp: {
    message: "The chosen moment is outside the material's duration.",
    action: "Choose a moment between the start and the end of the material.",
  },
  ffmpeg_unavailable: {
    message: "FFmpeg is unavailable, so the reference frame cannot be extracted.",
    action: "Install FFmpeg or correct its path in the configuration and try again.",
  },
  frame_extraction_timeout: {
    message: "Extracting the reference frame took too long.",
    action: "Check the material and try again with a different moment.",
  },
  reference_frame_extraction_failed: {
    message: "A valid reference frame could not be extracted from the material.",
    action: "Choose a different moment or use an image path instead.",
  },
  reference_frame_resolution_mismatch: {
    message: "The extracted frame has different dimensions than the imported material.",
    action: "Import the material again, then choose the frame again.",
  },
  profile_persistence_failed: {
    message: "Saving the profile failed and nothing was stored.",
    action: "Try again; if the error returns, check the backend logs.",
  },
  category_persistence_failed: {
    message: "The new class could not be saved.",
    action: "Try again; if the error returns, check the backend logs.",
  },

  // --- materials ---
  unsupported_media: {
    message: "The video file format is not supported.",
    action: "Use a file from the mp4/mov or matroska/webm family.",
  },
  media_too_large: {
    message: "The video file is larger than allowed.",
    action: "Choose a smaller file or trim the material before importing.",
  },
  media_too_long: {
    message: "The material is longer than allowed.",
    action: "Shorten the recording and import it again.",
  },
  disk_space: {
    message: "There is not enough disk space to process this material.",
    action: "Free up space in the workspace and repeat the import.",
  },
  media_path_not_absolute: {
    message: "The file path must be absolute.",
    action: "Enter the full local path to the video file.",
  },
  // TECH_PLAN §5 lists only 400/404 for `POST /materials`; the backend also
  // answers 503 and 504 here (`backend/app/api/materials.py`).
  ffprobe_unavailable: {
    message: "FFmpeg/ffprobe is unavailable, so the material cannot be checked.",
    action: "Install FFmpeg or correct its path in the configuration and try again.",
  },
  ffprobe_timeout: {
    message: "Analysing the material with ffprobe took too long.",
    action: "Check that the file is not damaged and repeat the import.",
  },
  // FE-022: the native "open file" dialog behind `POST /local-files/pick`.
  file_picker_unavailable: {
    message: "The system file dialog could not be opened.",
    action: "Use Enter path to type the full path to the file.",
  },
  file_picker_busy: {
    message: "A file dialog is already open.",
    action: "Finish or close the open dialog first.",
  },

  // --- exports ---
  export_running: {
    message: "An export of this run is already running.",
    action: "Wait for it to finish before starting another one.",
  },
  no_accepted_frames: {
    message: "The run has no accepted frame to export.",
    action: "Accept at least one frame in review.",
  },
  export_revision_conflict: {
    message: "The review state changed during the export, so nothing was written.",
    action: "Run the export again so it covers the current revision.",
  },
  export_source_missing: {
    message: "A frame source file went missing during the export.",
    action: "Restore the missing run artifacts and repeat the export.",
  },
  export_process_interrupted: {
    message: "The export process was interrupted before it finished.",
    action: "Run the export again; the unfinished result was not published.",
  },
  export_unavailable: {
    message: "The export service is unavailable.",
    action: "Check that the backend is running and try again.",
  },

  // --- not found ---
  run_not_found: {
    message: "Run not found.",
    action: "Go back to the list and choose an existing run.",
  },
  frame_not_found: { message: "Frame not found.", action: "Refresh the frame list." },
  frame_image_not_found: {
    message: "Frame image not found.",
    action: "Check the workspace or run the material again.",
  },
  annotation_not_found: {
    message: "Annotation not found.",
    action: "Refresh the frame — the annotation may have been deleted.",
  },
  profile_not_found: { message: "Profile not found.", action: "Choose an existing game profile." },
  video_not_found: { message: "Material not found.", action: "Choose an existing material." },
  export_not_found: { message: "Export not found.", action: "Go back to the export list." },
  asset_not_found: {
    message: "Reference image not found.",
    action: "Create the profile again with an available image.",
  },
  route_not_found: {
    message: "This API address does not exist.",
    action: "Report the problem — the frontend called an endpoint that does not exist.",
  },

  // --- generic ---
  validation_error: {
    message: "The request did not pass API validation.",
    action: "Correct the marked fields and submit again.",
  },
  dependency_unavailable: {
    message: "A critical local dependency is unavailable.",
    action: "Check the database and the workspace directory.",
  },
  internal_error: {
    message: "An unexpected application error occurred.",
    action: "Try again; if the error returns, check the backend logs.",
  },
};

const FALLBACK_COPY: ErrorCopy = {
  message: "The operation failed.",
  action: "Try again; if the error returns, check the backend logs.",
};

const TRANSPORT_COPY: ErrorCopy = {
  message: "The local API could not be reached.",
  action: "Check that the DatasetFactory backend is running and try again.",
};

/** Copy for a bare code, e.g. the `error_code` field of a failed export. */
export function describeErrorCode(code: string | null | undefined): ErrorCopy {
  if (code === null || code === undefined || code === "") {
    return FALLBACK_COPY;
  }
  return ERROR_COPY[code] ?? FALLBACK_COPY;
}

export function hasErrorCopy(code: string): boolean {
  return code in ERROR_COPY;
}

/*
 * Run status and stage copy lives here rather than in a feature for a
 * structural reason, not an editorial one: `src/test/architecture.test.ts`
 * keeps run status literals inside `src/api/`, so any table keyed by them has
 * to live in this layer. The tones are `StatusBadge` tones.
 */

export interface RunStatusCopy {
  label: string;
  tone: "neutral" | "brand" | "success" | "warning" | "error";
}

const RUN_STATUS_COPY: Readonly<Record<RunStatus, RunStatusCopy>> = {
  queued: { label: "Queued", tone: "neutral" },
  running: { label: "Running", tone: "brand" },
  paused: { label: "Paused", tone: "warning" },
  review_ready: { label: "Ready for review", tone: "brand" },
  completed: { label: "Completed", tone: "success" },
  failed: { label: "Failed", tone: "error" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export function describeRunStatus(status: RunStatus): RunStatusCopy {
  return RUN_STATUS_COPY[status];
}

const EXPORT_STATUS_COPY: Readonly<Record<ExportStatus, RunStatusCopy>> = {
  running: { label: "Running", tone: "brand" },
  completed: { label: "Completed", tone: "success" },
  failed: { label: "Failed", tone: "error" },
};

export function describeExportStatus(status: ExportStatus): RunStatusCopy {
  return EXPORT_STATUS_COPY[status];
}

/**
 * `PipelineRun.current_stage` is a free-form string the worker writes
 * (`backend/app/access/store/repositories/{runs,checkpoints}.py`), not a closed
 * enum in the contract. Known values get English copy; anything else is shown
 * verbatim rather than hidden, so a new worker stage stays visible.
 */
const RUN_STAGE_COPY: Readonly<Record<string, string>> = {
  sampling: "Sampling",
  sample: "Sampling",
  crop: "HUD regions",
  ocr: "OCR",
  review: "Review",
};

export function describeRunStage(stage: string | null): string | null {
  if (stage === null || stage === "") {
    return null;
  }
  return RUN_STAGE_COPY[stage] ?? stage;
}

export interface ErrorPresentation extends ErrorCopy {
  code: string;
  /** Untouched `details` from the envelope; never flattened on the way here. */
  details: ErrorDetails;
  /** `details.annotation_ids` for `bbox_invalid`; empty otherwise. */
  annotationIds: string[];
  requestId: string | null;
}

/**
 * The one function a UI layer calls to render any thrown error. Preserves
 * `details` so a screen can act on it — the review screen highlights exactly
 * the boxes named by `annotationIds` rather than showing a generic message.
 */
export function describeApiError(error: unknown): ErrorPresentation {
  if (isApiError(error)) {
    return {
      ...describeErrorCode(error.code),
      code: error.code,
      details: error.details,
      annotationIds: annotationIdsFromError(error),
      requestId: error.requestId === "" ? null : error.requestId,
    };
  }
  if (isApiTransportError(error)) {
    return {
      ...TRANSPORT_COPY,
      code: "transport_error",
      details: {},
      annotationIds: [],
      requestId: null,
    };
  }
  return {
    ...FALLBACK_COPY,
    code: "unknown_error",
    details: {},
    annotationIds: [],
    requestId: null,
  };
}
