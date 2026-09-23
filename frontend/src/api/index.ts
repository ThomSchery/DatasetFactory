export { API_BASE_PATH, apiRequest, buildUrl } from "./client";
export type { QueryParams, RequestOptions } from "./client";

export {
  CHARACTER_CLASS_ALPHABET,
  categoryNameDuplicateHintKey,
  categoryInputFromName,
  looksLikeDuplicateCategoryName,
} from "./categoryNames";

export {
  ApiError,
  ApiTransportError,
  annotationIdsFromError,
  apiErrorFromBody,
  categoryNameConflictFromError,
  isApiError,
  isApiTransportError,
  isVersionConflict,
  regionNameConflictFromError,
  regionOcrBlockersFromError,
} from "./errors";
export type {
  CategoryNameConflict,
  ErrorDetails,
  RegionNameConflict,
  RegionOcrBlocker,
} from "./errors";

export {
  CATEGORY_GROUPS,
  categoryGroupIdOf,
  categoryGroupLabelOf,
  groupCategories,
} from "./categoryGroups";
export type { CategoryGroupDescriptor, CategoryGroupId } from "./categoryGroups";

export * from "./endpoints";

export {
  describeApiError,
  describeErrorCode,
  describeExportStatus,
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

export {
  DEFAULT_REVIEW_STATUS_FILTER,
  REVIEW_STATUS_FILTER_OPTIONS,
  decisionLabel,
  describeFrameStage,
  describeReviewStatus,
  frameReviewCapabilities,
  isActiveAnnotation,
  parseReviewStatusFilter,
  reviewStatusQuery,
} from "./frameReview";
export type {
  FrameReviewCapabilities,
  ReviewStatusFilter,
  StatusPresentation,
} from "./frameReview";

export { ocrProvenanceOf, requiresOcrWarning } from "./ocrQuality";
export type { OcrProvenanceView } from "./ocrQuality";

export {
  RUN_POLL_INTERVAL_MS,
  TERMINAL_EXPORT_STATUSES,
  TERMINAL_RUN_STATUSES,
  availableRunActions,
  canCompleteExportedRun,
  exportPollInterval,
  isCompletedExportStatus,
  isCompletedRunStatus,
  isFailedExportStatus,
  isRunningExportStatus,
  isTerminalExportStatus,
  isTerminalRunStatus,
  runPollInterval,
} from "./runStatus";
export type { RunAction, TerminalRunStatus } from "./runStatus";

export type * from "./types";
