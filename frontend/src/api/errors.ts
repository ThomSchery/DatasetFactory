import { z } from "zod";

/**
 * TECH_PLAN §5 error envelope:
 * `{"error":{"code":"...","message":"...","details":{},"request_id":"uuid"}}`
 *
 * `details` is passed through untouched. `bbox_invalid` carries
 * `details.annotation_ids` naming every box that no longer fits the frame, and
 * the review screen has to highlight exactly those. Narrowing or dropping
 * `details` here would silently break that.
 */
const errorBodySchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).default({}),
  request_id: z.string().default(""),
});

const errorEnvelopeSchema = z.object({ error: errorBodySchema });

export type ErrorDetails = Readonly<Record<string, unknown>>;

/** A response the backend answered with a well-formed error envelope. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: ErrorDetails;
  readonly requestId: string;

  constructor(init: {
    status: number;
    code: string;
    message: string;
    details: ErrorDetails;
    requestId: string;
  }) {
    super(init.message);
    this.name = "ApiError";
    this.status = init.status;
    this.code = init.code;
    this.details = init.details;
    this.requestId = init.requestId;
  }
}

/**
 * The request never reached a backend that could answer in the contract — a
 * dropped connection, a non-JSON body, or a payload that is not an envelope.
 * Kept distinct from `ApiError` so the UI does not translate a transport
 * failure as if it were a domain code.
 */
export class ApiTransportError extends Error {
  readonly status: number | null;
  readonly cause: unknown;

  constructor(message: string, options: { status?: number | null; cause?: unknown } = {}) {
    super(message);
    this.name = "ApiTransportError";
    this.status = options.status ?? null;
    this.cause = options.cause;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function isApiTransportError(error: unknown): error is ApiTransportError {
  return error instanceof ApiTransportError;
}

/** A stale expected_version requires an explicit frame reload in review UI. */
export function isVersionConflict(error: unknown): boolean {
  return isApiError(error) && error.code === "version_conflict";
}

/** Builds an `ApiError` from a parsed body, or `null` if it is not an envelope. */
export function apiErrorFromBody(status: number, body: unknown): ApiError | null {
  const parsed = errorEnvelopeSchema.safeParse(body);
  if (!parsed.success) {
    return null;
  }
  const { code, message, details, request_id: requestId } = parsed.data.error;
  return new ApiError({ status, code, message, details, requestId });
}

/**
 * Reads `details.annotation_ids` off a `bbox_invalid` error. Returns an empty
 * array when the key is missing or malformed, so a caller can branch on length
 * instead of guarding the shape itself.
 */
export function annotationIdsFromError(error: unknown): string[] {
  if (!isApiError(error)) {
    return [];
  }
  const ids = error.details.annotation_ids;
  if (!Array.isArray(ids)) {
    return [];
  }
  return ids.filter((id): id is string => typeof id === "string");
}
