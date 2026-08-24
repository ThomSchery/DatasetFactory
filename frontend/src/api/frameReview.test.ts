import { describe, expect, it } from "vitest";

import {
  frameReviewCapabilities,
  parseReviewStatusFilter,
  reviewStatusQuery,
} from "./frameReview";

describe("frame review policy", () => {
  it("keeps accepted terminal and rejected reachable only through reopen", () => {
    expect(frameReviewCapabilities("review_pending", "accepted")).toEqual({
      canAccept: false,
      canEdit: false,
      canReject: false,
      canReopen: false,
      frozen: true,
      terminal: true,
    });
    expect(frameReviewCapabilities("review_pending", "rejected")).toMatchObject({
      canEdit: false,
      canReopen: true,
      frozen: true,
      terminal: false,
    });
  });

  it("does not expose editing before the review_pending stage", () => {
    expect(frameReviewCapabilities("ocr_complete", "pending")).toMatchObject({
      canAccept: false,
      canEdit: false,
      canReject: false,
    });
  });

  it("maps the explicit all filter to an omitted API query", () => {
    expect(parseReviewStatusFilter("all")).toBe("all");
    expect(reviewStatusQuery("all")).toBeUndefined();
    expect(parseReviewStatusFilter("rejected")).toBe("rejected");
    expect(reviewStatusQuery("rejected")).toBe("rejected");
  });
});
