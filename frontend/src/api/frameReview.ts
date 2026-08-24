import type {
  Annotation,
  FrameStage,
  ReviewDecision,
  ReviewStatus,
} from "./types";

export type ReviewStatusFilter = ReviewStatus | "all";

export const DEFAULT_REVIEW_STATUS_FILTER: ReviewStatusFilter = "pending";

export const REVIEW_STATUS_FILTER_OPTIONS: readonly {
  label: string;
  value: ReviewStatusFilter;
}[] = [
  { label: "Wszystkie", value: "all" },
  { label: "Oczekujące", value: "pending" },
  { label: "Zaakceptowane", value: "accepted" },
  { label: "Odrzucone", value: "rejected" },
];

const REVIEW_STATUSES = new Set<ReviewStatus>(["pending", "accepted", "rejected"]);

export function parseReviewStatusFilter(value: string): ReviewStatusFilter {
  if (value === "all") {
    return value;
  }
  return REVIEW_STATUSES.has(value as ReviewStatus) ? (value as ReviewStatus) : "pending";
}

export function reviewStatusQuery(filter: ReviewStatusFilter): ReviewStatus | undefined {
  return filter === "all" ? undefined : filter;
}

export interface StatusPresentation {
  label: string;
  tone: "neutral" | "brand" | "success" | "warning" | "error";
}

const REVIEW_STATUS_COPY: Readonly<Record<ReviewStatus, StatusPresentation>> = {
  pending: { label: "Oczekująca", tone: "brand" },
  accepted: { label: "Zaakceptowana", tone: "success" },
  rejected: { label: "Odrzucona", tone: "error" },
};

const FRAME_STAGE_COPY: Readonly<Record<FrameStage, StatusPresentation>> = {
  pending: { label: "Oczekuje", tone: "neutral" },
  sampled: { label: "Spróbkowana", tone: "neutral" },
  cropped: { label: "Regiony HUD", tone: "neutral" },
  ocr_complete: { label: "OCR ukończony", tone: "brand" },
  review_pending: { label: "Gotowa do weryfikacji", tone: "brand" },
};

export function describeReviewStatus(status: ReviewStatus): StatusPresentation {
  return REVIEW_STATUS_COPY[status];
}

export function describeFrameStage(stage: FrameStage): StatusPresentation {
  return FRAME_STAGE_COPY[stage];
}

export interface FrameReviewCapabilities {
  canAccept: boolean;
  canEdit: boolean;
  canReject: boolean;
  canReopen: boolean;
  frozen: boolean;
  terminal: boolean;
}

/** The review state machine stays in the API/domain layer, never in React. */
export function frameReviewCapabilities(
  stage: FrameStage,
  status: ReviewStatus,
): FrameReviewCapabilities {
  const ready = stage === "review_pending";
  const pending = status === "pending";
  return {
    canAccept: ready && pending,
    canEdit: ready && pending,
    canReject: ready && pending,
    canReopen: status === "rejected",
    frozen: status !== "pending",
    terminal: status === "accepted",
  };
}

export function isActiveAnnotation(annotation: Annotation): boolean {
  return annotation.status !== "deleted";
}

export function decisionLabel(decision: ReviewDecision): string {
  switch (decision) {
    case "accept":
      return "Zaakceptuj klatkę";
    case "reject":
      return "Odrzuć klatkę";
    case "reopen":
      return "Otwórz ponownie";
  }
}
