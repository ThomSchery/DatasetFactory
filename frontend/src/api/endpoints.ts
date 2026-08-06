import { apiRequest, buildUrl } from "./client";
import type {
  Annotation,
  CreateAnnotationRequest,
  CreateExportRequest,
  CreateMaterialRequest,
  CreateProfileRequest,
  CreateRunRequest,
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

// --- profiles -------------------------------------------------------------

/** `POST /profiles` → `201` */
export function createProfile(body: CreateProfileRequest): Promise<GameProfile> {
  return apiRequest<GameProfile>("/profiles", { method: "POST", body });
}

/** `GET /profiles/current` → profile or `null` */
export function getCurrentProfile(signal?: AbortSignal): Promise<GameProfile | null> {
  return apiRequest<GameProfile | null>("/profiles/current", { signal });
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
export function frameImageUrl(frameId: string): string {
  return buildUrl(`/frames/${encodeURIComponent(frameId)}/image`);
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

/** `GET /exports/{id}` — status, `input_revision`, `error_code`, manifest, output. */
export function getExport(exportId: string, signal?: AbortSignal): Promise<Export> {
  return apiRequest<Export>(`/exports/${encodeURIComponent(exportId)}`, { signal });
}
