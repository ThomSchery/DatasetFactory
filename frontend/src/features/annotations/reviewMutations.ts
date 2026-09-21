import {
  createAnnotation,
  copyPreviousAnnotations,
  deleteAnnotation,
  reviewFrame,
  updateAnnotation,
  type Annotation,
  type BBox,
  type CopyPreviousAnnotationsResult,
  type ReviewDecision,
} from "../../api";
import type { CopyPreviousTarget } from "./copySelection";

export type ReviewMutationIntent =
  | { annotationId: string; categoryId: string; expectedVersion: number; kind: "category" }
  | { annotationId: string; bbox: BBox; expectedVersion: number; kind: "geometry" }
  | { annotationId: string; expectedVersion: number; kind: "delete" }
  | { bbox: BBox; categoryId: string; expectedVersion: number; kind: "create" }
  | { expectedVersion: number; kind: "copy-previous"; target: CopyPreviousTarget }
  | { decision: ReviewDecision; expectedVersion: number; kind: "review" };

/**
 * What a settled write hands back, tagged so the caller does not have to infer
 * the shape from the intent it sent.
 *
 * `created` exists because FE-017 D saves a box the moment it is drawn: the
 * editor has to select the annotation the backend just minted, and that means
 * knowing its id rather than waiting for the frame refetch to reveal it.
 */
export type ReviewMutationResult =
  | { annotation: Annotation; kind: "created" }
  | { kind: "copied"; result: CopyPreviousAnnotationsResult }
  | { kind: "none" };

/** Shared mutation scope used to serialize every write on one review screen. */
export function reviewMutationKey(runId: string): readonly ["annotation-review", string, "write"] {
  return ["annotation-review", runId, "write"];
}

/** One transport path for all seven FE-001-F4 writes. */
export async function executeReviewMutation(
  frameId: string,
  intent: ReviewMutationIntent,
): Promise<ReviewMutationResult> {
  switch (intent.kind) {
    case "category":
      await updateAnnotation(intent.annotationId, {
        category_id: intent.categoryId,
        expected_version: intent.expectedVersion,
      });
      return { kind: "none" };
    case "geometry":
      await updateAnnotation(intent.annotationId, {
        bbox: intent.bbox,
        expected_version: intent.expectedVersion,
      });
      return { kind: "none" };
    case "delete":
      await deleteAnnotation(intent.annotationId, intent.expectedVersion);
      return { kind: "none" };
    case "create": {
      const annotation = await createAnnotation(frameId, {
        bbox: intent.bbox,
        category_id: intent.categoryId,
        expected_version: intent.expectedVersion,
      });
      return { annotation, kind: "created" };
    }
    case "copy-previous":
      return {
        kind: "copied",
        result: await copyPreviousAnnotations(frameId, {
          ...intent.target,
          expected_version: intent.expectedVersion,
        }),
      };
    case "review":
      await reviewFrame(frameId, {
        decision: intent.decision,
        expected_version: intent.expectedVersion,
      });
      return { kind: "none" };
  }
}
