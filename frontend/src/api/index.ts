export { API_BASE_PATH, apiRequest, buildUrl } from "./client";
export type { QueryParams, RequestOptions } from "./client";

export {
  ApiError,
  ApiTransportError,
  annotationIdsFromError,
  apiErrorFromBody,
  isApiError,
  isApiTransportError,
} from "./errors";
export type { ErrorDetails } from "./errors";

export * from "./endpoints";

export {
  describeApiError,
  describeErrorCode,
  describeRunStage,
  describeRunStatus,
  hasErrorCopy,
} from "./messages";
export type { ErrorCopy, ErrorPresentation, RunStatusCopy } from "./messages";

export {
  invalidateFor,
  invalidationKeys,
  queryKeys,
} from "./queryKeys";
export type { MutationEvent } from "./queryKeys";

export { ocrProvenanceOf, requiresOcrWarning } from "./ocrQuality";
export type { OcrProvenanceView } from "./ocrQuality";

export {
  RUN_POLL_INTERVAL_MS,
  TERMINAL_EXPORT_STATUSES,
  TERMINAL_RUN_STATUSES,
  availableRunActions,
  exportPollInterval,
  isTerminalExportStatus,
  isTerminalRunStatus,
  runPollInterval,
} from "./runStatus";
export type { RunAction, TerminalRunStatus } from "./runStatus";

export type * from "./types";
