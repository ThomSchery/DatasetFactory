import type {
  Annotation,
  Dashboard,
  Export,
  FrameDetail,
  FrameSummary,
  GameProfile,
  Health,
  Material,
  Page,
  PipelineRun,
  ProfileSummary,
} from "../api";

/*
 * Wire-shaped fixtures for the FE-001-F2 tests.
 *
 * These mirror what the FastAPI response models emit and nothing more. They
 * carry no behaviour: the stubbed `fetch` returns whichever fixture a test
 * hands it, so the tests never reimplement a backend rule (Gate 3 — a fake
 * client must not duplicate backend logic). The one rule a test does drive by
 * hand is the version bump on a transition, and it does so explicitly.
 */

export function healthFixture(overrides: Partial<Health> = {}): Health {
  const available = { available: true, critical: false, detail: "OK" };
  return {
    version: "0.1.0",
    status: "ok",
    database: { ...available, critical: true },
    workspace: { ...available, critical: true },
    ffmpeg: { ...available },
    tesseract: { ...available },
    gpu: { available: false, critical: false, detail: "Brak akceleracji CUDA." },
    ...overrides,
  };
}

/**
 * A Tesseract run as the backend renders it today: `experimental` with a failed
 * quality gate (CORE_FLOWS CF-03.4).
 */
export function runFixture(overrides: Partial<PipelineRun> = {}): PipelineRun {
  return {
    id: "run-1",
    profile_id: "profile-1",
    video_id: "video-1",
    interval_ms: 1000,
    status: "queued",
    error_code: null,
    last_heartbeat_at: null,
    attempt: 1,
    total_frames: 120,
    completed_frames: 0,
    current_stage: null,
    current_frame_index: null,
    version: 1,
    review_revision: 0,
    ocr_engine: "tesseract",
    ocr_engine_version: "5.4.1",
    ocr_runtime_sha256: "a".repeat(64),
    ocr_model_sha256: "b".repeat(64),
    ocr_config_hash: "c".repeat(64),
    ocr_language: "eng",
    ocr_page_segmentation_mode: 6,
    experimental: true,
    quality_gate: "failed",
    warning: "Tesseract jest adapterem eksperymentalnym.",
    ...overrides,
  };
}

/**
 * `GET /profiles/current` as `backend/app/api/profiles.py` renders it. The
 * asset is an opaque UUID and the URL is built from it by the backend, so a
 * test never spells a filesystem path.
 */
export function profileFixture(overrides: Partial<GameProfile> = {}): GameProfile {
  return {
    id: "profile-1",
    name: "Gra testowa",
    reference_asset_id: "asset-1",
    reference_asset_url: "/api/v1/assets/references/asset-1",
    source_width: 1920,
    source_height: 1080,
    version: 1,
    regions: [{ id: "region-1", name: "Pasek zdrowia", x: 10, y: 20, width: 100, height: 40 }],
    categories: [{ id: "category-1", name: "7", kind: "character" }],
    ...overrides,
  };
}

export function profileSummaryFixture(overrides: Partial<ProfileSummary> = {}): ProfileSummary {
  return {
    id: "profile-1",
    name: "Gra testowa",
    reference_asset_url: "/api/v1/assets/references/asset-1",
    source_width: 1920,
    source_height: 1080,
    region_count: 1,
    category_count: 1,
    created_at: "2026-08-07T09:00:00Z",
    active: true,
    ...overrides,
  };
}

export function materialFixture(overrides: Partial<Material> = {}): Material {
  return {
    id: "video-1",
    basename: "mecz.mp4",
    size_bytes: 2 * 1024 ** 3,
    duration_ms: 125_000,
    width: 1920,
    height: 1080,
    fingerprint: "d".repeat(64),
    available: true,
    created_at: "2026-08-07T09:00:00Z",
    ...overrides,
  };
}

export function dashboardFixture(overrides: Partial<Dashboard> = {}): Dashboard {
  return {
    project: { id: "project-1", name: "DatasetFactory" },
    profile: {
      id: "profile-1",
      name: "Gra testowa",
      source_width: 1920,
      source_height: 1080,
      version: 1,
      reference_asset_url: "/api/v1/assets/references/asset-1",
    },
    run: runFixture(),
    frame_counts: { pending: 12, accepted: 30, rejected: 3, total: 45 },
    system: healthFixture(),
    ...overrides,
  };
}

export function exportFixture(overrides: Partial<Export> = {}): Export {
  return {
    id: "export-1",
    run_id: "run-1",
    status: "completed",
    input_revision: 7,
    error_code: null,
    manifest: {
      annotation_sources: { ocr: 12, manual: 3 },
      annotations: "annotations.json",
      exported_at: "2026-08-24T12:00:00+00:00",
      images: "images",
      input_revision: 7,
      profile_id: "profile-1",
      run_id: "run-1",
      schema: "datasetfactory-coco-export-v1",
    },
    output_relpath: "exports/export-1",
    ...overrides,
  };
}

export function annotationFixture(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: "ann-1",
    category_id: "category-1",
    x: 100,
    y: 120,
    width: 40,
    height: 32,
    confidence: 0.91,
    source: "ocr",
    observation_id: "observation-1",
    status: "proposed",
    version: 3,
    ...overrides,
  };
}

export function frameSummaryFixture(overrides: Partial<FrameSummary> = {}): FrameSummary {
  return {
    id: "frame-1",
    frame_index: 17,
    timestamp_ms: 16_000,
    stage_status: "review_pending",
    review_status: "pending",
    width: 1920,
    height: 1080,
    version: 7,
    ocr_engine: "tesseract",
    experimental: true,
    quality_gate: "failed",
    warning: "Tesseract jest adapterem eksperymentalnym.",
    ...overrides,
  };
}

export function framePageFixture(
  overrides: Partial<Page<FrameSummary>> = {},
): Page<FrameSummary> {
  return {
    items: [frameSummaryFixture()],
    page: 1,
    page_size: 12,
    total: 1,
    ...overrides,
  };
}

export function frameDetailFixture(overrides: Partial<FrameDetail> = {}): FrameDetail {
  return {
    id: "frame-1",
    run_id: "run-1",
    frame_index: 17,
    timestamp_ms: 16_000,
    stage_status: "review_pending",
    review_status: "pending",
    width: 1920,
    height: 1080,
    version: 7,
    review_revision: 4,
    annotations: [annotationFixture()],
    ...overrides,
  };
}

/** What a fresh install answers: `200` with three nulls, not an error. */
export function emptyDashboard(): Dashboard {
  return {
    project: null,
    profile: null,
    run: null,
    frame_counts: { pending: 0, accepted: 0, rejected: 0, total: 0 },
    system: healthFixture(),
  };
}

/** The TECH_PLAN §5 error envelope, for a stubbed non-2xx response. */
export function errorEnvelope(
  code: string,
  message = "Operacja odrzucona.",
  details: Record<string, unknown> = {},
): unknown {
  return { error: { code, message, details, request_id: "req-1" } };
}
