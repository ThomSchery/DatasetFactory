import { apiRequest, buildUrl } from "./client";
import type {
  Annotation,
  CreateAnnotationRequest,
  CreateExportRequest,
  CreateMaterialRequest,
  CreateProfileRequest,
  CreateRunRequest,
  Dashboard,
  Export,
  FrameDetail,
  FrameSummary,
  GameProfile,
  Health,
  ListFramesQuery,
  ListMaterialsQuery,
  Material,
  Page,
  PipelineRun,
  ProfileSummary,
  ReferencePreview,
  ReferencePreviewRequest,
  ReviewFrameRequest,
  UpdateAnnotationRequest,
  VersionedMutationRequest,
} from "./types";

/*
 * One typed function per implemented TECH_PLAN §5 endpoint. Nothing here
 * interprets a status, retries, or invents a field the backend does not send.
 *
 * The two image endpoints — `GET /assets/references/{asset_id}` and
 * `GET /frames/{id}/image` — stream binary via `FileResponse` and are consumed
 * as `<img src>`, so they are exposed as URL builders rather than fetches.
 */

// --- system ---------------------------------------------------------------

/** `GET /health` */
export function getHealth(signal?: AbortSignal): Promise<Health> {
  return apiRequest<Health>("/health", { signal });
}

/**
 * `GET /dashboard` — read-only; answers `200` with nulls on an empty install
 * and never `503` (TK-008). Added here in FE-001-F2, after the backend router
 * landed; FE-001-F1 deliberately shipped without it.
 */
export function getDashboard(signal?: AbortSignal): Promise<Dashboard> {
  return apiRequest<Dashboard>("/dashboard", { signal });
}

// --- profiles -------------------------------------------------------------

/** `POST /profiles/reference-preview` → `201` with an ephemeral opaque asset. */
export function createReferencePreview(body: ReferencePreviewRequest): Promise<ReferencePreview> {
  return apiRequest<ReferencePreview>("/profiles/reference-preview", { method: "POST", body });
}

/** `POST /profiles` → `201` */
export function createProfile(body: CreateProfileRequest): Promise<GameProfile> {
  return apiRequest<GameProfile>("/profiles", { method: "POST", body });
}

/** `GET /profiles/current` → profile or `null` */
export function getCurrentProfile(signal?: AbortSignal): Promise<GameProfile | null> {
  return apiRequest<GameProfile | null>("/profiles/current", { signal });
}

/** `GET /profiles` — every profile in the one local project. */
export function listProfiles(signal?: AbortSignal): Promise<ProfileSummary[]> {
  return apiRequest<ProfileSummary[]>("/profiles", { signal });
}

/** `POST /profiles/{profile_id}/activate` — persist the project selection. */
export function activateProfile(profileId: string): Promise<GameProfile> {
  return apiRequest<GameProfile>(`/profiles/${encodeURIComponent(profileId)}/activate`, {
    method: "POST",
  });
}

/** `GET /profiles/{profile_id}` → the exact full profile assigned to a run. */
export function getProfile(profileId: string, signal?: AbortSignal): Promise<GameProfile> {
  return apiRequest<GameProfile>(`/profiles/${encodeURIComponent(profileId)}`, { signal });
}

/** `GET /assets/references/{asset_id}` — opaque UUID resolved through the DB. */
export function referenceAssetUrl(assetId: string): string {
  return buildUrl(`/assets/references/${encodeURIComponent(assetId)}`);
}

// --- materials ------------------------------------------------------------

/** `POST /materials` → `201` */
export function createMaterial(body: CreateMaterialRequest): Promise<Material> {
  return apiRequest<Material>("/materials", { method: "POST", body });
}

/** `GET /materials` — `page_size` is capped at 100 by the backend. */
export function listMaterials(
  query: ListMaterialsQuery = {},
  signal?: AbortSignal,
): Promise<Page<Material>> {
  return apiRequest<Page<Material>>("/materials", { query: { ...query }, signal });
}

// --- runs -----------------------------------------------------------------

/** `POST /runs` → `201 PipelineRun(queued)` */
export function createRun(body: CreateRunRequest): Promise<PipelineRun> {
  return apiRequest<PipelineRun>("/runs", { method: "POST", body });
}

/** `POST /runs/{id}/start` → `202` */
export function startRun(runId: string, body: VersionedMutationRequest): Promise<PipelineRun> {
  return apiRequest<PipelineRun>(`/runs/${encodeURIComponent(runId)}/start`, {
    method: "POST",
    body,
  });
}

/** `POST /runs/{id}/pause` → `202` */
export function pauseRun(runId: string, body: VersionedMutationRequest): Promise<PipelineRun> {
  return apiRequest<PipelineRun>(`/runs/${encodeURIComponent(runId)}/pause`, {
    method: "POST",
    body,
  });
}

/** `POST /runs/{id}/resume` → `202` */
export function resumeRun(runId: string, body: VersionedMutationRequest): Promise<PipelineRun> {
  return apiRequest<PipelineRun>(`/runs/${encodeURIComponent(runId)}/resume`, {
    method: "POST",
    body,
  });
}

/** `POST /runs/{id}/cancel` → `202` */
export function cancelRun(runId: string, body: VersionedMutationRequest): Promise<PipelineRun> {
  return apiRequest<PipelineRun>(`/runs/${encodeURIComponent(runId)}/cancel`, {
    method: "POST",
    body,
  });
}

/** `POST /runs/{id}/complete` → `202 completed` (TK-009). */
export function completeRun(runId: string, body: VersionedMutationRequest): Promise<PipelineRun> {
  return apiRequest<PipelineRun>(`/runs/${encodeURIComponent(runId)}/complete`, {
    method: "POST",
    body,
  });
}

/** `GET /runs/{id}` */
export function getRun(runId: string, signal?: AbortSignal): Promise<PipelineRun> {
  return apiRequest<PipelineRun>(`/runs/${encodeURIComponent(runId)}`, { signal });
}

/** `GET /runs/{id}/frames` */
export function listRunFrames(
  runId: string,
  query: ListFramesQuery = {},
  signal?: AbortSignal,
): Promise<Page<FrameSummary>> {
  return apiRequest<Page<FrameSummary>>(`/runs/${encodeURIComponent(runId)}/frames`, {
    query: { ...query },
    signal,
  });
}

// --- frames ---------------------------------------------------------------

/** `GET /frames/{id}` — frame plus its current annotations and version. */
export function getFrame(frameId: string, signal?: AbortSignal): Promise<FrameDetail> {
  return apiRequest<FrameDetail>(`/frames/${encodeURIComponent(frameId)}`, { signal });
}

/** `GET /frames/{id}/image` — stream from a controlled relpath. */
export function frameImageUrl(frameId: string, attempt?: number): string {
  return buildUrl(
    `/frames/${encodeURIComponent(frameId)}/image`,
    attempt === undefined ? undefined : { attempt },
  );
}

/** `POST /frames/{id}/annotations` → `201` (TK-007). */
export function createAnnotation(
  frameId: string,
  body: CreateAnnotationRequest,
): Promise<Annotation> {
  return apiRequest<Annotation>(`/frames/${encodeURIComponent(frameId)}/annotations`, {
    method: "POST",
    body,
  });
}

/**
 * `POST /frames/{id}/review` with `decision: accept | reject | reopen`.
 *
 * `400 bbox_invalid` carries `details.annotation_ids` listing every box that
 * no longer fits the frame.
 */
export function reviewFrame(frameId: string, body: ReviewFrameRequest): Promise<FrameDetail> {
  return apiRequest<FrameDetail>(`/frames/${encodeURIComponent(frameId)}/review`, {
    method: "POST",
    body,
  });
}

// --- annotations ----------------------------------------------------------

/** `PATCH /annotations/{id}` — `category_id` and/or `bbox`; both absent is `empty_patch`. */
export function updateAnnotation(
  annotationId: string,
  body: UpdateAnnotationRequest,
): Promise<Annotation> {
  return apiRequest<Annotation>(`/annotations/${encodeURIComponent(annotationId)}`, {
    method: "PATCH",
    body,
  });
}

/** `DELETE /annotations/{id}` → `204`; `expected_version` travels as a query param. */
export async function deleteAnnotation(
  annotationId: string,
  expectedVersion: number,
): Promise<void> {
  await apiRequest<undefined>(`/annotations/${encodeURIComponent(annotationId)}`, {
    method: "DELETE",
    query: { expected_version: expectedVersion },
  });
}

// --- exports --------------------------------------------------------------

/** `POST /exports` → `202` */
export function createExport(body: CreateExportRequest): Promise<Export> {
  return apiRequest<Export>("/exports", { method: "POST", body });
}

/** `GET /exports/latest?run_id=` — newest immutable snapshot for one run or `null`. */
export function getLatestExport(runId: string, signal?: AbortSignal): Promise<Export | null> {
  return apiRequest<Export | null>("/exports/latest", {
    query: { run_id: runId },
    signal,
  });
}

/** `GET /exports/{id}` — status, `input_revision`, `error_code`, manifest, output. */
export function getExport(exportId: string, signal?: AbortSignal): Promise<Export> {
  return apiRequest<Export>(`/exports/${encodeURIComponent(exportId)}`, { signal });
}
