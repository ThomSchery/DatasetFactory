/*
 * Wire types for `/api/v1`, mirrored from TECH_PLAN §5 and verified against the
 * FastAPI response models in `backend/app/api/`. Every DTO on the backend is
 * `extra='forbid'`, so these are exhaustive rather than partial views.
 *
 * `GET /dashboard` was absent in FE-001-F1 because no backend router served it.
 * TK-008 added `backend/app/api/dashboard.py`, so `Dashboard` below is typed
 * from that router, not from the prose in TECH_PLAN §5.
 */

/** TECH_PLAN §4 `RunStatus`. */
export type RunStatus =
  | "queued"
  | "running"
  | "paused"
  | "review_ready"
  | "completed"
  | "failed"
  | "cancelled";

/** TECH_PLAN §4 `FrameStage`. */
export type FrameStage = "pending" | "sampled" | "cropped" | "ocr_complete" | "review_pending";

/** TECH_PLAN §4 `ReviewStatus`. */
export type ReviewStatus = "pending" | "accepted" | "rejected";

/** TECH_PLAN §4 `BBox`: top-left origin, pixels, width/height > 0. */
export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Page<TItem> {
  items: TItem[];
  page: number;
  page_size: number;
  total: number;
}

// --- system ---------------------------------------------------------------

export interface DependencyStatus {
  available: boolean;
  critical: boolean;
  detail: string;
}

export interface Health {
  version: string;
  status: "ok" | "degraded" | "unavailable";
  database: DependencyStatus;
  workspace: DependencyStatus;
  ffmpeg: DependencyStatus;
  tesseract: DependencyStatus;
  gpu: DependencyStatus;
}

// --- profiles -------------------------------------------------------------

export type CategoryKind = "character" | "game";

export interface RegionInput {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CategoryInput {
  name: string;
  kind: CategoryKind;
}

export interface CreateProfileRequest {
  name: string;
  reference_image_path?: string;
  reference_asset_id?: string;
  regions: RegionInput[];
  categories: CategoryInput[];
}

export interface ReferencePreviewRequest {
  reference_image_path: string;
}

export interface ReferenceFrameRequest {
  video_id: string;
  timestamp_ms: number;
}

export interface ReferencePreview {
  asset_id: string;
  width: number;
  height: number;
}

export interface Region extends RegionInput {
  id: string;
}

export interface Category {
  id: string;
  name: string;
  kind: string;
}

export interface GameProfile {
  id: string;
  name: string;
  reference_asset_id: string;
  /** Opaque `/api/v1/assets/references/{id}` URL; never a filesystem path. */
  reference_asset_url: string;
  source_width: number;
  source_height: number;
  version: number;
  regions: Region[];
  categories: Category[];
}

export interface ProfileSummary {
  id: string;
  name: string;
  reference_asset_url: string;
  source_width: number;
  source_height: number;
  region_count: number;
  category_count: number;
  created_at: string;
  active: boolean;
}

// --- materials ------------------------------------------------------------

export interface CreateMaterialRequest {
  local_path: string;
}

export interface Material {
  id: string;
  basename: string;
  size_bytes: number;
  duration_ms: number;
  width: number;
  height: number;
  fingerprint: string;
  available: boolean;
  created_at: string;
}

// --- runs -----------------------------------------------------------------

export interface CreateRunRequest {
  profile_id: string;
  video_id: string;
  interval_ms?: number;
}

export interface VersionedMutationRequest {
  expected_version: number;
}

export interface PipelineRun {
  id: string;
  profile_id: string;
  video_id: string;
  interval_ms: number;
  status: RunStatus;
  error_code: string | null;
  last_heartbeat_at: string | null;
  attempt: number;
  total_frames: number;
  completed_frames: number;
  current_stage: string | null;
  current_frame_index: number | null;
  version: number;
  review_revision: number;
  ocr_engine: string;
  ocr_engine_version: string;
  ocr_runtime_sha256: string;
  ocr_model_sha256: string;
  ocr_config_hash: string;
  ocr_language: string;
  ocr_page_segmentation_mode: number;
  experimental: boolean;
  quality_gate: string;
  warning: string;
}

export interface RunSummary {
  id: string;
  profile_id: string;
  profile_name: string;
  interval_ms: number;
  status: RunStatus;
  total_frames: number;
  review_counts: {
    pending: number;
    accepted: number;
    rejected: number;
    total: number;
  };
  annotation_counts: {
    proposed: number;
    accepted: number;
    deleted: number;
  };
  exported: boolean;
  created_at: string;
}

export interface ListRunsQuery {
  page?: number;
  /** Backend caps this at 100. */
  page_size?: number;
}

export interface FrameSummary {
  id: string;
  frame_index: number;
  timestamp_ms: number;
  stage_status: FrameStage;
  review_status: ReviewStatus;
  width: number | null;
  height: number | null;
  version: number;
  ocr_engine: string;
  experimental: boolean;
  quality_gate: string;
  warning: string;
}

export interface ListFramesQuery {
  review_status?: ReviewStatus;
  page?: number;
  /** Backend caps this at 100. */
  page_size?: number;
}

export interface ListMaterialsQuery {
  page?: number;
  /** Backend caps this at 100. */
  page_size?: number;
}

// --- frames and annotations ----------------------------------------------

export type AnnotationSource = "ocr" | "manual";
export type AnnotationStatus = "proposed" | "accepted" | "deleted";

/**
 * Geometry is flat on the response — `x`/`y`/`width`/`height` — while requests
 * nest it under `bbox`. See `backend/app/api/annotations.py`.
 */
export interface Annotation {
  id: string;
  category_id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** `null` for manual boxes: a hand-drawn box has no OCR confidence. */
  confidence: number | null;
  source: AnnotationSource;
  observation_id: string | null;
  status: AnnotationStatus;
  version: number;
}

export interface FrameDetail {
  id: string;
  run_id: string;
  frame_index: number;
  timestamp_ms: number;
  stage_status: FrameStage;
  review_status: ReviewStatus;
  width: number;
  height: number;
  version: number;
  review_revision: number;
  annotations: Annotation[];
}

export interface CreateAnnotationRequest {
  category_id: string;
  bbox: BBox;
  expected_version: number;
}

export type CopyPreviousScope = "game" | "character" | "category";

export interface CopyPreviousAnnotationsRequest {
  scope: CopyPreviousScope;
  category_id?: string;
  expected_version: number;
}

export interface CopyPreviousAnnotationsResult {
  copied: number;
  replaced: number;
  frame_version: number;
}

/**
 * At least one of `category_id` or `bbox` must be present; an empty patch is
 * rejected with `400 empty_patch`.
 */
export interface UpdateAnnotationRequest {
  category_id?: string;
  bbox?: BBox;
  expected_version: number;
}

export type ReviewDecision = "accept" | "reject" | "reopen";

export interface ReviewFrameRequest {
  decision: ReviewDecision;
  expected_version: number;
}

// --- dashboard ------------------------------------------------------------

export interface DashboardProject {
  id: string;
  name: string;
}

/**
 * A summary, not the whole profile: regions and categories stay on
 * `GET /profiles/current`. `backend/app/api/dashboard.py` builds this shape.
 */
export interface DashboardProfile {
  id: string;
  name: string;
  source_width: number;
  source_height: number;
  version: number;
  reference_asset_url: string;
}

/**
 * Rows that exist in `frames` for the active run, grouped by `review_status`.
 * `total` is the sum of the three, so it counts frames the backend has
 * created — it is *not* `PipelineRun.total_frames`, which is how many frames
 * the run plans to produce (TECH_PLAN §5, TK-008).
 */
export interface FrameCounts {
  pending: number;
  accepted: number;
  rejected: number;
  total: number;
}

/**
 * `GET /dashboard`. `project`, `profile` and `run` are independently nullable:
 * an empty install answers `200` with three nulls, which is a valid initial
 * state rather than an error.
 *
 * `run` is byte-identical to `GET /runs/{id}` and `system` to `GET /health`,
 * both rendered by the same backend functions, so the OCR warning reaches this
 * screen in exactly the form the run screen sees.
 *
 * The run carried here is "active" by the backend's state machine, where only
 * `completed` is terminal — a `failed` or `cancelled` run is unfinished work
 * and still appears, with its `error_code`. That is a different question from
 * `TERMINAL_RUN_STATUSES`, which decides when polling stops.
 */
export interface Dashboard {
  project: DashboardProject | null;
  profile: DashboardProfile | null;
  run: PipelineRun | null;
  frame_counts: FrameCounts;
  system: Health;
}

// --- exports --------------------------------------------------------------

export type ExportStatus = "running" | "completed" | "failed";

export interface ExportManifest {
  annotation_sources: {
    manual: number;
    ocr: number;
  };
  annotations: string;
  exported_at: string;
  images: string;
  input_revision: number;
  profile_id: string;
  run_id: string;
  schema: string;
}

export interface CreateExportRequest {
  run_id: string;
}

export interface Export {
  id: string;
  run_id: string;
  status: ExportStatus;
  input_revision: number;
  /**
   * Failure reason of a finished export, not an HTTP envelope code. Carries
   * `export_revision_conflict`, `export_source_missing` and
   * `export_process_interrupted`.
   */
  error_code: string | null;
  manifest: ExportManifest | null;
  /** Relative to the workspace; the backend never returns an absolute path. */
  output_relpath: string | null;
}
