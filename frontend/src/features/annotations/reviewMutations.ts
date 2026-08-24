import {
  createAnnotation,
  deleteAnnotation,
  reviewFrame,
  updateAnnotation,
  type BBox,
  type ReviewDecision,
} from "../../api";

export type ReviewMutationIntent =
  | { annotationId: string; categoryId: string; expectedVersion: number; kind: "category" }
  | { annotationId: string; bbox: BBox; expectedVersion: number; kind: "geometry" }
  | { annotationId: string; expectedVersion: number; kind: "delete" }
  | { bbox: BBox; categoryId: string; expectedVersion: number; kind: "create" }
  | { decision: ReviewDecision; expectedVersion: number; kind: "review" };

/** One transport path for all seven FE-001-F4 writes. */
export async function executeReviewMutation(
  frameId: string,
  intent: ReviewMutationIntent,
): Promise<void> {
  switch (intent.kind) {
    case "category":
      await updateAnnotation(intent.annotationId, {
        category_id: intent.categoryId,
        expected_version: intent.expectedVersion,
      });
      return;
    case "geometry":
      await updateAnnotation(intent.annotationId, {
        bbox: intent.bbox,
        expected_version: intent.expectedVersion,
      });
      return;
    case "delete":
      await deleteAnnotation(intent.annotationId, intent.expectedVersion);
      return;
    case "create":
      await createAnnotation(frameId, {
        bbox: intent.bbox,
        category_id: intent.categoryId,
        expected_version: intent.expectedVersion,
      });
      return;
    case "review":
      await reviewFrame(frameId, {
        decision: intent.decision,
        expected_version: intent.expectedVersion,
      });
  }
}
