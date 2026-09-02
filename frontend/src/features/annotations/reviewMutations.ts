import {
  createAnnotation,
  copyPreviousAnnotations,
  deleteAnnotation,
  reviewFrame,
  updateAnnotation,
  type BBox,
  type CopyPreviousAnnotationsResult,
  type CopyPreviousScope,
  type ReviewDecision,
} from "../../api";

export type ReviewMutationIntent =
  | { annotationId: string; categoryId: string; expectedVersion: number; kind: "category" }
  | { annotationId: string; bbox: BBox; expectedVersion: number; kind: "geometry" }
  | { annotationId: string; expectedVersion: number; kind: "delete" }
  | { bbox: BBox; categoryId: string; expectedVersion: number; kind: "create" }
  | {
      categoryId?: string;
      expectedVersion: number;
      kind: "copy-previous";
      scope: CopyPreviousScope;
    }
  | { decision: ReviewDecision; expectedVersion: number; kind: "review" };

/** Shared mutation scope used to serialize every write on one review screen. */
export function reviewMutationKey(runId: string): readonly ["annotation-review", string, "write"] {
  return ["annotation-review", runId, "write"];
}

/** One transport path for all seven FE-001-F4 writes. */
export async function executeReviewMutation(
  frameId: string,
  intent: ReviewMutationIntent,
): Promise<void | CopyPreviousAnnotationsResult> {
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
    case "copy-previous":
      return copyPreviousAnnotations(frameId, {
        scope: intent.scope,
        ...(intent.categoryId === undefined ? {} : { category_id: intent.categoryId }),
        expected_version: intent.expectedVersion,
      });
    case "review":
      await reviewFrame(frameId, {
        decision: intent.decision,
        expected_version: intent.expectedVersion,
      });
  }
}
