import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  categoryNameConflictFromError,
  describeApiError,
  createProfileCategory,
  describeErrorCode,
  frameImageUrl,
  frameReviewCapabilities,
  getFrame,
  getPreviousFrameClasses,
  invalidateFor,
  isActiveAnnotation,
  isVersionConflict,
  queryKeys,
  type Annotation,
  type BBox,
  type CategoryInput,
  type ErrorPresentation,
  type FrameCounts,
  type FrameSummary,
  type GameProfile,
  type ReviewStatusFilter,
} from "../../api";
import { Button } from "../../components/common/Button";
import {
  GroupedOptionList,
  SHORTCUT_SCOPE_ATTRIBUTE,
} from "../../components/common/GroupedOptionList";
import { Notice } from "../../components/common/Notice";
import { Panel } from "../../components/common/Panel";
import {
  fitsInSource,
  nudgeRect,
  RegionOverlay,
  sourceRectsEqual,
  type NudgeDirection,
  type OverlayShape,
} from "../../components/common/RegionOverlay";
import { StatusBadge } from "../../components/common/StatusBadge";
import { FatalError, InlineError, Loading } from "../../components/common/UiStates";
import {
  ANNOTATION_POPOVER_SCOPE_ATTRIBUTE,
  AnnotationPopover,
  type CategoryConflictRecovery,
} from "./AnnotationPopover";
import { ClassList } from "./ClassList";
import {
  copyPreviousTarget,
  PREVIOUS_CLASS_LIST_LABEL,
  previousClassIds,
  previousClassOptionGroups,
} from "./copySelection";
import { FrameToolbar } from "./FrameToolbar";
import {
  executeReviewMutation,
  reviewMutationKey,
  type ReviewMutationIntent,
  type ReviewMutationResult,
} from "./reviewMutations";

interface FrameEditorProps {
  counts: FrameCounts;
  disabled: boolean;
  filter: ReviewStatusFilter;
  frameId: string;
  frames: readonly FrameSummary[];
  /**
   * The class a drawn box is saved with, remembered across frames (FE-017 D).
   *
   * It lives above this component because this component is rebuilt for every
   * frame, and the rule is "the last class used in this editor session" — a
   * session being the run the operator is working through, not the frame they
   * happen to be on. `null` means nothing has been assigned yet in this
   * session, and the first profile class by `ordinal` is used instead.
   */
  lastUsedCategoryId: string | null;
  onCategoryUsed: (categoryId: string) => void;
  onFilterChange: (filter: ReviewStatusFilter) => void;
  onSelect: (frameId: string) => void;
  profile: GameProfile;
  runId: string;
}

type CreateCategoryAssignment =
  | { bbox: BBox; expectedVersion: number; kind: "draft" }
  | { annotationId: string; expectedVersion: number; kind: "existing" };

interface CreateCategoryIntent {
  assignment: CreateCategoryAssignment;
  category: CategoryInput;
  kind: "create-category";
}

type EditorMutationIntent = ReviewMutationIntent | CreateCategoryIntent;

interface CreateCategoryMutationResult {
  assignment: ReviewMutationResult;
  categoryId: string;
  kind: "category-created";
}

type EditorMutationResult = ReviewMutationResult | CreateCategoryMutationResult;

function busyKey(intent: EditorMutationIntent | undefined): string | null {
  if (intent === undefined) {
    return null;
  }
  switch (intent.kind) {
    case "category":
      return `category:${intent.annotationId}`;
    case "geometry":
      return `geometry:${intent.annotationId}`;
    case "delete":
      return `delete:${intent.annotationId}`;
    case "create":
      return "create";
    case "create-category":
      return "create-category";
    case "copy-previous":
      return "copy-previous";
    case "review":
      return `review:${intent.decision}`;
  }
}

function errorMessage(error: ErrorPresentation): string {
  return `${error.message} ${error.action} Kod: ${error.code}.`;
}

export function FrameEditor({
  counts,
  disabled,
  filter,
  frameId,
  frames,
  lastUsedCategoryId,
  onCategoryUsed,
  onFilterChange,
  onSelect,
  profile,
  runId,
}: FrameEditorProps) {
  const frameQuery = useQuery({
    queryKey: queryKeys.frame(frameId),
    queryFn: ({ signal }) => getFrame(frameId, signal),
  });

  if (frameQuery.isPending) {
    return (
      <>
        <FrameToolbar
          counts={counts}
          disabled={disabled}
          filter={filter}
          frames={frames}
          onFilterChange={onFilterChange}
          onSelect={onSelect}
          selectedId={frameId}
        />
        <div className="df-review-workspace__query-state">
          <Loading label="Ładowanie wybranej klatki…" />
        </div>
      </>
    );
  }
  if (frameQuery.isError) {
    const error = describeApiError(frameQuery.error);
    return (
      <>
        <FrameToolbar
          counts={counts}
          disabled={disabled}
          filter={filter}
          frames={frames}
          onFilterChange={onFilterChange}
          onSelect={onSelect}
          selectedId={frameId}
        />
        <div className="df-review-workspace__query-state">
          <FatalError
            description={errorMessage(error)}
            onRetry={() => {
              void frameQuery.refetch();
            }}
            title="Nie udało się pobrać klatki"
          />
        </div>
      </>
    );
  }

  return (
    <LoadedFrameEditor
      counts={counts}
      disabled={disabled}
      filter={filter}
      frame={frameQuery.data}
      frameRefreshing={frameQuery.isFetching}
      frames={frames}
      lastUsedCategoryId={lastUsedCategoryId}
      onCategoryUsed={onCategoryUsed}
      onFilterChange={onFilterChange}
      onSelect={onSelect}
      profile={profile}
      runId={runId}
    />
  );
}

interface LoadedFrameEditorProps extends Omit<FrameEditorProps, "frameId"> {
  frame: Awaited<ReturnType<typeof getFrame>>;
  frameRefreshing: boolean;
}

interface GeometryPreview {
  annotationId: string;
  bbox: BBox;
}

function successfulMutationClearsCategoryConflict(
  intent: EditorMutationIntent,
  selectedId: string | null,
  geometryPreview: GeometryPreview | null,
): boolean {
  switch (intent.kind) {
    case "create-category":
    case "create":
      return true;
    case "delete":
      return selectedId === intent.annotationId;
    case "category":
      return (
        selectedId === intent.annotationId && geometryPreview?.annotationId !== intent.annotationId
      );
    case "copy-previous":
    case "geometry":
    case "review":
      return false;
  }
}

interface ManipulationBaseline {
  annotationId: string;
  preview: GeometryPreview | null;
  selectionEpoch: number;
}

interface SelectionContext {
  annotationId: string | null;
  epoch: number;
}

interface EditorMutationRequest {
  intent: EditorMutationIntent;
  selectionContext: SelectionContext;
}

function mutationOwnsSelectionContext(
  mutationSelectionContext: SelectionContext,
  current: SelectionContext,
): boolean {
  // IDs can recur after a deselect/reselect cycle. The epoch makes ownership
  // about the exact interaction context that launched the request, not merely
  // an annotation that happens to have the same identifier now.
  return (
    mutationSelectionContext.annotationId === current.annotationId &&
    mutationSelectionContext.epoch === current.epoch
  );
}

const DRAFT_ANNOTATION_ID = "new-annotation-draft";

/**
 * The four numbers a region is, and nothing a helper happened to spread in.
 *
 * `parseGeometryDraft` produced a clean `BBox` as a side effect of parsing the
 * four form fields, and every geometry request went through it. With the form
 * gone, gesture helpers hand back `{ ...rect }` of whatever they were given —
 * an `Annotation` keeps its `id`, `version` and `status` that way — so the
 * narrowing the parser used to do happens here instead, at the same boundary:
 * the preview the overlay draws and the body the PATCH carries.
 */
function toBBox(rect: BBox): BBox {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

function nudgeDirection(key: string): NudgeDirection | null {
  switch (key) {
    case "ArrowUp":
      return "up";
    case "ArrowDown":
      return "down";
    case "ArrowLeft":
      return "left";
    case "ArrowRight":
      return "right";
    default:
      return null;
  }
}

function LoadedFrameEditor({
  counts,
  disabled,
  filter,
  frame,
  frameRefreshing,
  frames,
  lastUsedCategoryId,
  onCategoryUsed,
  onFilterChange,
  onSelect,
  profile,
  runId,
}: LoadedFrameEditorProps) {
  const queryClient = useQueryClient();
  const imageErrorCopy = describeErrorCode("frame_image_not_found");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [geometryPreview, setGeometryPreview] = useState<GeometryPreview | null>(null);
  const manipulationBaselineRef = useRef<ManipulationBaseline | null>(null);
  const selectionContextRef = useRef<SelectionContext>({ annotationId: null, epoch: 0 });
  const [draftBBox, setDraftBBox] = useState<BBox | null>(null);
  const [imageError, setImageError] = useState(false);
  const [imageAttempt, setImageAttempt] = useState(0);
  const [actionError, setActionError] = useState<ErrorPresentation | null>(null);
  const [categoryActionError, setCategoryActionError] = useState<ErrorPresentation | null>(null);
  const [categoryConflict, setCategoryConflict] = useState<CategoryConflictRecovery | null>(null);
  const createdCategoryRef = useRef(false);
  const [invalidIds, setInvalidIds] = useState<readonly string[]>([]);
  /*
   * `null` is "the operator has not touched the picker", not "nothing is
   * selected" — the default depends on a query that resolves after mount, and
   * storing the default into state on arrival would need an effect that then
   * has to avoid overwriting a real choice. Keeping the two apart makes the
   * default derived and the choice explicit.
   */
  const [copySelection, setCopySelection] = useState<readonly string[] | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  /*
   * The annotation the editor labelled by itself, and the class it chose.
   *
   * FE-017 D saves a drawn box immediately, which means a class nobody pointed
   * at reaches the dataset unless the mistake is obvious at once. This is what
   * makes it obvious: while it is set, the panel names the class it assigned and
   * a single click on any other class replaces it. It is cleared the moment the
   * operator confirms or changes the class, deletes the box, or moves on.
   */
  const [autoAssigned, setAutoAssigned] = useState<{
    annotationId: string;
    categoryId: string;
  } | null>(null);
  /*
   * An annotation the backend has confirmed but this frame read does not list
   * yet.
   *
   * FE-017 D creates on the draw and then selects what the backend minted, so
   * between the `201` and the frame that contains it the box belongs to
   * nothing: the local draft is gone, the stored frame has not caught up, and
   * the reconciliation below would read that as "the target is gone" and drop
   * the selection — taking the panel and its "assigned for you" notice with it.
   * Holding the confirmed row here closes that window without patching the
   * query cache, and it costs nothing once the refetch lands, because the
   * effect below drops it the moment the frame says the same thing.
   */
  const [pendingCreated, setPendingCreated] = useState<Annotation | null>(null);
  const capabilities = frameReviewCapabilities(frame.stage_status, frame.review_status);
  const activeAnnotations = useMemo(() => {
    const stored = frame.annotations.filter(isActiveAnnotation);
    return pendingCreated === null || stored.some((item) => item.id === pendingCreated.id)
      ? stored
      : [...stored, pendingCreated];
  }, [frame.annotations, pendingCreated]);

  useEffect(() => {
    if (
      pendingCreated !== null &&
      frame.annotations.some((item) => item.id === pendingCreated.id)
    ) {
      setPendingCreated(null);
    }
  }, [frame.annotations, pendingCreated]);
  const categoryById = useMemo(
    () => new Map(profile.categories.map((category) => [category.id, category.name])),
    [profile.categories],
  );
  /*
   * The class a drawn box is saved with (FE-017 D).
   *
   * Last class assigned in this editor session, and the first profile class by
   * `ordinal` before there is one. Chosen because it is the only rule the
   * operator can predict without looking anything up: frames are annotated in
   * runs of the same class, and the panel names the class it assigned, so the
   * next default is on screen before the next box is drawn.
   *
   * `profile.categories` arrives ordered by `ordinal` (the profile repository
   * orders it), so `[0]` is the first class of the profile and not whichever
   * row the backend happened to return first. `undefined` means the profile has
   * no classes at all, and nothing can be saved.
   */
  const defaultCategoryId = useMemo(() => {
    const remembered = profile.categories.find((category) => category.id === lastUsedCategoryId);
    return (remembered ?? profile.categories[0])?.id;
  }, [lastUsedCategoryId, profile.categories]);

  /*
   * What a copy from the previous frame would find. The backend owns the
   * "previous in time" rule, so this is a read of the same thing
   * `copy-previous` writes from, rather than a second implementation of it
   * here: the frame list this screen holds is filtered by review status and
   * therefore knows a different neighbour than the copy does.
   */
  const previousClassesQuery = useQuery({
    queryKey: queryKeys.framePreviousClasses(frame.id),
    queryFn: ({ signal }) => getPreviousFrameClasses(frame.id, signal),
  });
  const previousClasses = previousClassesQuery.data;
  const copyOfferedIds = useMemo(
    () => previousClassIds(profile.categories, previousClasses?.classes ?? []),
    [previousClasses?.classes, profile.categories],
  );
  const copyGroups = useMemo(
    () => previousClassOptionGroups(profile.categories, previousClasses?.classes ?? []),
    [previousClasses?.classes, profile.categories],
  );
  /*
   * The HUD level preselected whole, which is the request the panel sent by
   * default before the picker existed — now intersected with what the source
   * actually has, so the default cannot itself ask for a class that is not
   * there.
   */
  const copyDefaultSelection = useMemo(() => {
    const gameIds = new Set(
      profile.categories
        .filter((category) => category.kind === "game")
        .map((category) => category.id),
    );
    return copyOfferedIds.filter((id) => gameIds.has(id));
  }, [copyOfferedIds, profile.categories]);
  const copyEffectiveSelection = useMemo(() => {
    const offered = new Set(copyOfferedIds);
    return (copySelection ?? copyDefaultSelection).filter((id) => offered.has(id));
  }, [copyDefaultSelection, copyOfferedIds, copySelection]);

  function updateSelectionContext(annotationId: string | null): void {
    const current = selectionContextRef.current;
    if (annotationId === current.annotationId) {
      return;
    }
    selectionContextRef.current = {
      annotationId,
      epoch: current.epoch + 1,
    };
    manipulationBaselineRef.current = null;
  }

  function closeSelectionContext(): void {
    selectionContextRef.current = {
      annotationId: null,
      epoch: selectionContextRef.current.epoch + 1,
    };
    manipulationBaselineRef.current = null;
  }

  useEffect(() => {
    updateSelectionContext(selectedId);
  }, [selectedId]);

  /*
   * "Assigned for you" is about the box that was just drawn, so it ends when
   * the selection leaves it — by any route, including a deselect. One effect
   * rather than a clear at every call site: enumerating the ways a selection
   * can end is what failed repeatedly in this epic.
   */
  useEffect(() => {
    setAutoAssigned((current) =>
      current === null || current.annotationId === selectedId ? current : null,
    );
  }, [selectedId]);

  const mutation = useMutation<EditorMutationResult, unknown, EditorMutationRequest>({
    mutationKey: reviewMutationKey(runId),
    mutationFn: async ({ intent }) => {
      createdCategoryRef.current = false;
      if (intent.kind !== "create-category") {
        return executeReviewMutation(frame.id, intent);
      }

      const category = await createProfileCategory(profile.id, intent.category);
      createdCategoryRef.current = true;
      if (intent.assignment.kind === "draft") {
        const assignment = await executeReviewMutation(frame.id, {
          bbox: intent.assignment.bbox,
          categoryId: category.id,
          expectedVersion: intent.assignment.expectedVersion,
          kind: "create",
        });
        return { assignment, categoryId: category.id, kind: "category-created" };
      }
      const assignment = await executeReviewMutation(frame.id, {
        annotationId: intent.assignment.annotationId,
        categoryId: category.id,
        expectedVersion: intent.assignment.expectedVersion,
        kind: "category",
      });
      return { assignment, categoryId: category.id, kind: "category-created" };
    },
    onError: async (error, { intent, selectionContext: mutationSelectionContext }) => {
      if (intent.kind === "copy-previous") {
        setCopyFeedback(null);
      }
      const presentation = describeApiError(error);
      const authoritativeConflict = categoryNameConflictFromError(error);
      if (
        intent.kind === "category" ||
        intent.kind === "create" ||
        intent.kind === "create-category"
      ) {
        setActionError(null);
        if (
          mutationOwnsSelectionContext(mutationSelectionContext, selectionContextRef.current)
        ) {
          setCategoryActionError(presentation);
        }
      } else {
        setActionError(presentation);
      }
      if (presentation.code === "bbox_invalid") {
        // A newer bbox verdict replaces the whole previous verdict atomically.
        setInvalidIds(presentation.annotationIds);
      }
      const invalidations: Promise<void>[] = [];
      if (createdCategoryRef.current || presentation.code === "category_name_exists") {
        invalidations.push(
          invalidateFor(queryClient, {
            type: "profile-category-created",
            profileId: profile.id,
          }),
        );
      }
      if (isVersionConflict(error)) {
        // Explicit stale-frame reload. `invalidateFor` owns the central key map
        // and waits for the active frame/list refetch; no cache value is patched.
        invalidations.push(
          invalidateFor(queryClient, {
            type: intent.kind === "review" ? "frame-reviewed" : "annotation-changed",
            frameId: frame.id,
            runId,
          }),
        );
      }
      await Promise.all(invalidations);
      if (
        intent.kind === "create-category" &&
        presentation.code === "category_name_exists" &&
        mutationOwnsSelectionContext(mutationSelectionContext, selectionContextRef.current)
      ) {
        const refreshedProfile = queryClient.getQueryData<GameProfile>(queryKeys.profile(profile.id));
        const exactConflict = refreshedProfile?.categories.find(
          (category) => category.name === intent.category.name,
        );
        // `details` names the winner authoritatively; the exact-name match is
        // the best a backend without them allows. Neither one hitting means
        // the winner is genuinely unknown — the panel says that rather than
        // selecting something the backend never confirmed.
        const winner = authoritativeConflict ?? exactConflict;
        setCategoryConflict(
          winner === undefined || winner === null
            ? { kind: "unidentified", rejectedName: intent.category.name }
            : { category: winner, kind: "identified" },
        );
      }
    },
    onSuccess: async (data, { intent, selectionContext: mutationSelectionContext }) => {
      const reviewResult = data.kind === "category-created" ? data.assignment : data;
      setActionError(null);
      const ownsSelectionContext = mutationOwnsSelectionContext(
        mutationSelectionContext,
        selectionContextRef.current,
      );
      if (ownsSelectionContext) {
        setCategoryActionError(null);
      }
      if (
        ownsSelectionContext &&
        successfulMutationClearsCategoryConflict(intent, selectedId, geometryPreview)
      ) {
        setCategoryConflict(null);
      }
      if (intent.kind === "review") {
        setInvalidIds([]);
      } else if (intent.kind === "geometry" || intent.kind === "delete") {
        setInvalidIds((current) => current.filter((id) => id !== intent.annotationId));
      }
      if (intent.kind === "delete") {
        setSelectedId((current) => (current === intent.annotationId ? null : current));
        setAutoAssigned((current) =>
          current?.annotationId === intent.annotationId ? null : current,
        );
        // A deleted box must not be resurrected by the row held above while the
        // frame catches up.
        setPendingCreated((current) =>
          current?.id === intent.annotationId ? null : current,
        );
      }
      if (intent.kind === "category") {
        const annotationId = intent.annotationId;
        onCategoryUsed(intent.categoryId);
        // The operator has now said what the class is, so the "assigned for
        // you" state is over for this box whether or not the panel stays open.
        setAutoAssigned((current) => (current?.annotationId === annotationId ? null : current));
        setSelectedId((current) =>
          current === annotationId &&
          geometryPreview?.annotationId !== annotationId
            ? null
            : current,
        );
      }
      if (
        intent.kind === "create-category" &&
        ownsSelectionContext &&
        data.kind === "category-created"
      ) {
        onCategoryUsed(data.categoryId);
      }
      if (intent.kind === "create-category" && intent.assignment.kind === "existing") {
        const annotationId = intent.assignment.annotationId;
        setAutoAssigned((current) => (current?.annotationId === annotationId ? null : current));
        setSelectedId((current) =>
          current === annotationId &&
          geometryPreview?.annotationId !== annotationId
            ? null
            : current,
        );
      }
      if (intent.kind === "create-category" && intent.assignment.kind === "draft") {
        setDraftBBox(null);
        updateSelectionContext(null);
        setSelectedId(null);
      }
      if (intent.kind === "create") {
        setDraftBBox(null);
        onCategoryUsed(intent.categoryId);
        /*
         * FE-017 D: the box is already saved, so the panel moves onto the real
         * annotation rather than closing. The context guard is what keeps a
         * late response from selecting a box the operator has already walked
         * away from — a click outside during the request closes the context,
         * and this `create` no longer owns it (FE-015-FIX2).
         */
        if (ownsSelectionContext && data.kind === "created") {
          setPendingCreated(data.annotation);
          updateSelectionContext(data.annotation.id);
          setSelectedId(data.annotation.id);
          setAutoAssigned({ annotationId: data.annotation.id, categoryId: intent.categoryId });
        } else {
          updateSelectionContext(null);
          setSelectedId(null);
        }
      }
      if (reviewResult.kind === "copied") {
        const copied = reviewResult.result;
        setCopyFeedback(
          copied.copied === 0
            ? // The picker offers only classes the previous frame holds, so
              // this is now a race: the source changed between the read that
              // built the list and this request.
              "Poprzednia klatka już nie ma anotacji w zaznaczonych klasach. Nic nie zmieniono."
            : `Skopiowano: ${copied.copied}. Zastąpiono: ${copied.replaced}.`,
        );
      }
      await Promise.all([
        invalidateFor(queryClient, {
          type: intent.kind === "review" ? "frame-reviewed" : "annotation-changed",
          frameId: frame.id,
          runId,
        }),
        ...(intent.kind === "create-category"
          ? [
              invalidateFor(queryClient, {
                type: "profile-category-created",
                profileId: profile.id,
              }),
            ]
          : []),
      ]);
      if (intent.kind === "geometry") {
        setGeometryPreview(null);
      }
    },
    onSettled: () => {
      createdCategoryRef.current = false;
    },
  });

  /*
   * The panel has a target or it has nothing, and everything raised for that
   * target goes when the target does. A draft lives in `draftBBox` and a saved
   * annotation lives in the frame, so "abandoned" and "gone from the refetched
   * frame" are one event here rather than two call sites to keep in step —
   * enumerating the ways a context can end is what failed six times in this
   * epic.
   *
   * FE-015 A1 made this the only cleanup there is. The panel used to be
   * unmounted along with the selection, which took the class conflict and its
   * alert away for free; a permanently mounted panel keeps whatever it is
   * handed, so `categoryActionError` belongs here next to `categoryConflict`.
   *
   * The two guards are about server truth and apply only to the half that has
   * any: an annotation missing from a frame that is mid-refetch, or mid-write,
   * is not yet known to be gone. A draft is local state, so its absence is
   * never in doubt.
   */
  const selectionTargetMissing =
    selectedId !== null &&
    (selectedId === DRAFT_ANNOTATION_ID
      ? draftBBox === null
      : !frameRefreshing &&
        !mutation.isPending &&
        !activeAnnotations.some((annotation) => annotation.id === selectedId));

  useEffect(() => {
    if (!selectionTargetMissing) {
      return;
    }

    closeSelectionContext();
    setSelectedId(null);
    setCategoryActionError(null);
    setCategoryConflict(null);
    setGeometryPreview((current) =>
      current?.annotationId === selectedId ? null : current,
    );
  }, [selectedId, selectionTargetMissing]);

  const currentBusyKey = mutation.isPending ? busyKey(mutation.variables.intent) : null;
  const invalidSet = useMemo(() => new Set(invalidIds), [invalidIds]);
  const selectedAnnotation =
    selectedId === null
      ? undefined
      : activeAnnotations.find((annotation) => annotation.id === selectedId);
  const previewedAnnotation =
    geometryPreview === null
      ? undefined
      : activeAnnotations.find((annotation) => annotation.id === geometryPreview.annotationId);
  /*
   * Geometry the operator moved but has not saved. Measured against the stored
   * annotation rather than against how the preview was produced: a preview that
   * a refetch has caught up with is not unsaved work, and a mouse gesture whose
   * `pointerup` never arrives is — the same resting state keyboard nudging
   * introduced. Anything non-null here is work that would vanish silently.
   */
  const unsavedGeometry: BBox | null =
    geometryPreview !== null &&
    previewedAnnotation !== undefined &&
    !sourceRectsEqual(previewedAnnotation, geometryPreview.bbox)
      ? geometryPreview.bbox
      : null;
  /*
   * A preview the stored annotation has caught up with is no longer a preview.
   * The form used to keep this true field by field: a field the operator had
   * not touched followed the server baseline, so a later server move was the
   * number the panel showed and saved. The overlay has no such per-field
   * notion, so the preview itself steps aside once it says the same thing as
   * the annotation — otherwise the next refetch would leave the overlay on a
   * stale rectangle, flag it as unsaved work nobody did, and let `Enter` push
   * it back over the newer geometry.
   */
  useEffect(() => {
    if (
      geometryPreview !== null &&
      previewedAnnotation !== undefined &&
      sourceRectsEqual(previewedAnnotation, geometryPreview.bbox)
    ) {
      setGeometryPreview(null);
    }
  }, [geometryPreview, previewedAnnotation]);
  const shapes: OverlayShape[] = activeAnnotations.map((annotation) => {
    const categoryName = categoryById.get(annotation.category_id) ?? annotation.category_id;
    const confidenceLabel =
      annotation.source === "ocr" && annotation.confidence !== null
        ? ` · ${Math.round(annotation.confidence * 100)}%`
        : "";
    const sourceLabel = annotation.source === "ocr" ? "OCR" : "ręczna";
    const geometry =
      geometryPreview?.annotationId === annotation.id ? geometryPreview.bbox : annotation;
    return {
      id: annotation.id,
      detailLabel:
        annotation.source === "ocr" && annotation.confidence !== null
          ? `Confidence OCR ${Math.round(annotation.confidence * 100)}%`
          : undefined,
      displayLabel: `${categoryName}${confidenceLabel}`,
      label: `${categoryName}, źródło ${sourceLabel}`,
      sourceKind: annotation.source,
      tone: invalidSet.has(annotation.id) ? "error" : "brand",
      x: geometry.x,
      y: geometry.y,
      width: geometry.width,
      height: geometry.height,
    };
  });
  if (draftBBox !== null) {
    shapes.push({
      ...draftBBox,
      displayLabel: "Box",
      id: DRAFT_ANNOTATION_ID,
      label: "Box — wybierz klasę",
      tone: "draft",
    });
  }
  const draftAnnotation: Annotation | undefined =
    draftBBox === null
      ? undefined
      : {
          ...draftBBox,
          // No class until a human picks one. A default here would be a label
          // nobody chose, one save away from the dataset.
          category_id: "",
          confidence: null,
          id: DRAFT_ANNOTATION_ID,
          observation_id: null,
          source: "manual",
          status: "proposed",
          version: 0,
        };
  const popoverAnnotation = selectedId === DRAFT_ANNOTATION_ID ? draftAnnotation : selectedAnnotation;
  const editorDisabled = !capabilities.canEdit || mutation.isPending;
  const canDirectEdit = capabilities.canEdit;
  const copyTarget = copyPreviousTarget(copyEffectiveSelection, profile.categories);
  /*
   * Three answers the backend gives, and the panel says something different
   * about each: the route has not answered yet, there is no previous frame at
   * all, or there is one and it carries nothing. `frame.frame_index === 0` used
   * to stand in for the middle one — which is the same rule the backend owns,
   * restated here, and wrong for a run whose frame indices have gaps.
   */
  const previousFrameKnown = previousClasses !== undefined;
  const hasPreviousFrame = previousClasses?.previous_frame_id !== null;
  const copyDisabled =
    !previousFrameKnown ||
    !hasPreviousFrame ||
    copyOfferedIds.length === 0 ||
    !capabilities.canEdit ||
    mutation.isPending ||
    copyTarget === null;
  const copyStatus = ((): string | null => {
    if (previousClassesQuery.isError) {
      return errorMessage(describeApiError(previousClassesQuery.error));
    }
    if (!previousFrameKnown) {
      return "Sprawdzanie, które klasy ma poprzednia klatka…";
    }
    if (!hasPreviousFrame) {
      return "To pierwsza klatka runu — brak wcześniejszej klatki do skopiowania.";
    }
    if (copyOfferedIds.length === 0) {
      return `Poprzednia klatka (nr ${String(previousClasses.previous_frame_index)}) nie ma żadnych anotacji — nie ma czego powtórzyć.`;
    }
    if (!capabilities.canEdit) {
      return "Kopiowanie wymaga oczekującej klatki gotowej do weryfikacji.";
    }
    if (copyTarget === null) {
      return "Zaznacz co najmniej jedną klasę albo całą grupę do powtórzenia.";
    }
    return copyFeedback;
  })();

  function copyPrevious(): void {
    if (copyDisabled || copyTarget === null) {
      return;
    }
    setActionError(null);
    setCopyFeedback(null);
    mutateWithCurrentSelectionContext({
      expectedVersion: frame.version,
      kind: "copy-previous",
      target: copyTarget,
    });
  }

  /*
   * FE-015 A3 retired the review shortcuts `A`, `X` and `R`. What is left here
   * is not a shortcut in that sense: the arrows edit a live preview and `Enter`
   * commits the edit they built. Removing `Enter` too would leave the arrows
   * with no keyboard way to reach the API, so it survives — unadvertised on the
   * button, but still the commit for a geometry preview.
   */
  useEffect(() => {
    function handleGeometryKey(event: globalThis.KeyboardEvent): void {
      const target = event.target;
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        (target instanceof HTMLElement &&
          (target.isContentEditable ||
            ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName) ||
            // A custom option list owns its keystrokes the way a native
            // `<select>` did; it says so with the attribute rather than by
            // being recognisable by tag name.
            target.closest(`[${SHORTCUT_SCOPE_ATTRIBUTE}]`) !== null))
      ) {
        return;
      }
      const direction = nudgeDirection(event.key);
      if (canDirectEdit && !editorDisabled && selectedId !== null) {
        if (direction !== null) {
          const currentBBox =
            selectedId === DRAFT_ANNOTATION_ID
              ? draftBBox
              : geometryPreview?.annotationId === selectedId
                ? geometryPreview.bbox
                : selectedAnnotation;
          if (currentBBox !== null && currentBBox !== undefined) {
            const nextBBox = nudgeRect(
              currentBBox,
              direction,
              event.shiftKey ? 10 : 1,
              { width: frame.width, height: frame.height },
            );
            if (!sourceRectsEqual(currentBBox, nextBBox)) {
              event.preventDefault();
              previewAnnotationGeometry(selectedId, nextBBox);
              return;
            }
          }
        } else if (event.key === "Enter") {
          /*
           * `Enter` inside the docked panel belongs to whatever the operator
           * has focused: "Usuń" or "Zapisz klasę". Only `Enter` from outside
           * the panel commits the preview. The guard above excludes fields and
           * the class picker, but buttons still need the explicit panel
           * boundary.
           */
          const insidePanel =
            target instanceof Element &&
            target.closest(`[${ANNOTATION_POPOVER_SCOPE_ATTRIBUTE}]`) !== null;
          if (!insidePanel && geometryPreview?.annotationId === selectedId) {
            event.preventDefault();
            commitAnnotationGeometry(selectedId, geometryPreview.bbox);
            return;
          }
        }
      }
    }

    window.addEventListener("keydown", handleGeometryKey);
    return () => {
      window.removeEventListener("keydown", handleGeometryKey);
    };
  }, [
    canDirectEdit,
    draftBBox,
    editorDisabled,
    frame.height,
    frame.width,
    geometryPreview,
    selectedAnnotation,
    selectedId,
  ]);

  function submit(intent: EditorMutationIntent): void {
    setActionError(null);
    setCategoryActionError(null);
    mutateWithCurrentSelectionContext(intent);
  }

  function mutateWithCurrentSelectionContext(intent: EditorMutationIntent): void {
    mutation.mutate({
      intent,
      selectionContext: { ...selectionContextRef.current },
    });
  }

  function annotationById(annotationId: string): Annotation | undefined {
    return activeAnnotations.find((annotation) => annotation.id === annotationId);
  }

  function changeAnnotationGeometry(annotation: Annotation, bbox: BBox): void {
    submit({
      annotationId: annotation.id,
      bbox,
      expectedVersion: annotation.version,
      kind: "geometry",
    });
  }

  function previewAnnotationGeometry(annotationId: string, bbox: BBox): void {
    if (annotationId === DRAFT_ANNOTATION_ID) {
      setDraftBBox(toBBox(bbox));
      return;
    }
    setGeometryPreview({ annotationId, bbox: toBBox(bbox) });
  }

  function previewManipulationGeometry(annotationId: string, bbox: BBox): void {
    const selectionContext = selectionContextRef.current;
    if (annotationId !== selectionContext.annotationId) {
      return;
    }
    manipulationBaselineRef.current ??= {
      annotationId,
      preview: geometryPreview,
      selectionEpoch: selectionContext.epoch,
    };
    if (
      manipulationBaselineRef.current.annotationId !== annotationId ||
      manipulationBaselineRef.current.selectionEpoch !== selectionContext.epoch
    ) {
      return;
    }
    previewAnnotationGeometry(annotationId, bbox);
  }

  function cancelManipulationGeometry(annotationId: string): void {
    const baseline = manipulationBaselineRef.current;
    if (baseline?.annotationId !== annotationId) {
      return;
    }
    manipulationBaselineRef.current = null;
    const selectionContext = selectionContextRef.current;
    if (
      annotationId === selectionContext.annotationId &&
      baseline.selectionEpoch === selectionContext.epoch
    ) {
      setGeometryPreview(baseline.preview);
    }
  }

  function commitManipulationGeometry(annotationId: string, bbox: BBox): void {
    const baseline = manipulationBaselineRef.current;
    if (baseline?.annotationId !== annotationId) {
      return;
    }
    manipulationBaselineRef.current = null;
    const selectionContext = selectionContextRef.current;
    if (
      annotationId === selectionContext.annotationId &&
      baseline.selectionEpoch === selectionContext.epoch
    ) {
      commitAnnotationGeometry(annotationId, bbox);
    }
  }

  function commitAnnotationGeometry(annotationId: string, rect: BBox): void {
    const bbox = toBBox(rect);
    if (annotationId === DRAFT_ANNOTATION_ID) {
      setDraftBBox(bbox);
      return;
    }
    const annotation = annotationById(annotationId);
    if (annotation === undefined) {
      setGeometryPreview(null);
      return;
    }
    if (!fitsInSource(bbox, { width: frame.width, height: frame.height })) {
      /*
       * The verdict the backend would return for this rectangle, reached
       * without spending a request — and without discarding the move. A box
       * that starts outside the frame walks back into it one step at a time,
       * so an early `Enter` has to explain itself rather than silently reset
       * the box to where the nudging started.
       */
      setActionError({
        ...describeErrorCode("bbox_invalid"),
        annotationIds: [annotationId],
        code: "bbox_invalid",
        details: {},
        requestId: null,
      });
      return;
    }
    changeAnnotationGeometry(annotation, bbox);
  }

  /*
   * FE-017 D: a drawn box is saved at once, with the default class.
   *
   * The operator chose this over keeping a draft, knowing the risk that a class
   * nobody pointed at reaches the dataset; `autoAssigned` is what makes that
   * visible immediately rather than in the export. The draft still exists here
   * as the in-flight rectangle, and it survives a failed `POST` — which turns
   * the old "choose a class, then save" panel into the recovery path for a
   * create the backend refused.
   */
  function handleDraw(bbox: BBox): void {
    const drawn = toBBox(bbox);
    setActionError(null);
    setCategoryActionError(null);
    setCategoryConflict(null);
    setAutoAssigned(null);
    setDraftBBox(drawn);
    updateSelectionContext(DRAFT_ANNOTATION_ID);
    setSelectedId(DRAFT_ANNOTATION_ID);
    if (defaultCategoryId === undefined) {
      // Nothing to save against: `Annotation.category_id` is `NOT NULL`, so the
      // box stays a draft and the panel says the profile has no classes.
      return;
    }
    mutateWithCurrentSelectionContext({
      bbox: drawn,
      categoryId: defaultCategoryId,
      expectedVersion: frame.version,
      kind: "create",
    });
  }

  function selectAnnotation(annotationId: string): void {
    setCategoryActionError(null);
    if (annotationId !== selectionContextRef.current.annotationId) {
      setCategoryConflict(null);
    }
    updateSelectionContext(annotationId);
    if (annotationId !== DRAFT_ANNOTATION_ID) {
      setDraftBBox(null);
    }
    setSelectedId(annotationId);
    setGeometryPreview((current) =>
      current?.annotationId === annotationId ? current : null,
    );
  }

  function removeAnnotation(annotationId: string): void {
    if (annotationId === DRAFT_ANNOTATION_ID) {
      // Abandoning the box is the end of its context, not a list of things to
      // reset: dropping the target is all this does, and the reconciliation
      // above owns the selection and everything scoped to it.
      setDraftBBox(null);
      return;
    }
    const annotation = annotationById(annotationId);
    if (annotation !== undefined) {
      submit({
        annotationId,
        expectedVersion: annotation.version,
        kind: "delete",
      });
    }
  }

  return (
    <>
      <FrameToolbar
        actions={
          <>
            {capabilities.canAccept ? (
              <Button
                aria-label="Zaakceptuj klatkę"
                data-preserve-annotation-preview={unsavedGeometry !== null || undefined}
                disabled={
                  mutation.isPending ||
                  activeAnnotations.length === 0 ||
                  unsavedGeometry !== null
                }
                loading={currentBusyKey === "review:accept"}
                onClick={() => {
                  submit({ decision: "accept", expectedVersion: frame.version, kind: "review" });
                }}
                size="sm"
                title={
                  unsavedGeometry !== null
                    ? "Najpierw zapisz albo porzuć niezapisane przesunięcie bboxa"
                    : activeAnnotations.length === 0
                      ? "Akceptacja wymaga aktywnej anotacji"
                      : undefined
                }
              >
                Zaakceptuj
              </Button>
            ) : null}
            {capabilities.canReject ? (
              <Button
                aria-label="Odrzuć klatkę"
                disabled={mutation.isPending}
                loading={currentBusyKey === "review:reject"}
                onClick={() => {
                  submit({ decision: "reject", expectedVersion: frame.version, kind: "review" });
                }}
                size="sm"
                variant="secondary"
              >
                Odrzuć
              </Button>
            ) : null}
            {capabilities.canReopen ? (
              <Button
                disabled={mutation.isPending}
                loading={currentBusyKey === "review:reopen"}
                onClick={() => {
                  submit({ decision: "reopen", expectedVersion: frame.version, kind: "review" });
                }}
                size="sm"
              >
                Otwórz ponownie
              </Button>
            ) : null}
          </>
        }
        counts={counts}
        disabled={disabled || mutation.isPending}
        filter={filter}
        frames={frames}
        onFilterChange={onFilterChange}
        onSelect={onSelect}
        selectedId={frame.id}
      />

      <aside
        aria-label="Panele bieżącej klatki"
        className="df-review-workspace__side-column"
      >
        <Panel
          aside={
            <StatusBadge srLabel="Aktywne anotacje:" tone="neutral">
              {activeAnnotations.length}
            </StatusBadge>
          }
          className="df-review-workspace__inspector"
          title="Anotacje na klatce"
        >
          <ClassList
            annotations={activeAnnotations}
            categories={profile.categories}
            disabled={editorDisabled}
            onSelect={selectAnnotation}
            selectedId={selectedId}
          />
          {capabilities.terminal ? (
            <Notice title="Klatka zaakceptowana" tone="info">
              Zaakceptowana klatka jest terminalna i pozostaje zamrożona dla trwałości snapshotu eksportu.
            </Notice>
          ) : null}
          {capabilities.canReopen ? (
            <Notice title="Klatka odrzucona" tone="warning">
              Edycja jest zamrożona. Użyj „Otwórz ponownie”, aby wrócić do statusu oczekującego.
            </Notice>
          ) : null}
          {!capabilities.canEdit && !capabilities.frozen ? (
            <Notice title="OCR jeszcze trwa" tone="warning">
              Edytor odblokuje się dopiero po osiągnięciu etapu gotowego do weryfikacji.
            </Notice>
          ) : null}
          {unsavedGeometry === null ? null : (
            <Notice title="Niezapisane przesunięcie bboxa" tone="warning">
              Zaznacz ten bbox i naciśnij <kbd>Enter</kbd>, aby zapisać przesunięcie, albo kliknij
              poza panelem, aby je porzucić. Akceptacja klatki jest zablokowana, dopóki przesunięcie
              nie zostanie rozstrzygnięte — zaakceptowana klatka jest terminalna.
            </Notice>
          )}
          {actionError === null ? null : <InlineError message={errorMessage(actionError)} />}
          {imageError ? (
            <div className="df-review-image-error">
              <InlineError
                message={`${imageErrorCopy.message} ${imageErrorCopy.action} Kod: frame_image_not_found.`}
              />
              <Button
                disabled={mutation.isPending}
                onClick={() => {
                  setImageAttempt((current) => current + 1);
                }}
                size="sm"
                variant="secondary"
              >
                Spróbuj ponownie załadować obraz
              </Button>
            </div>
          ) : null}
        </Panel>

        <AnnotationPopover
          annotation={popoverAnnotation}
          autoAssignedCategoryName={
            popoverAnnotation !== undefined &&
            autoAssigned?.annotationId === popoverAnnotation.id
              ? (categoryById.get(autoAssigned.categoryId) ?? autoAssigned.categoryId)
              : undefined
          }
          busyKey={currentBusyKey}
          categories={profile.categories}
          categoryConflict={categoryConflict}
          categoryError={categoryActionError === null ? null : errorMessage(categoryActionError)}
          disabled={editorDisabled}
          draft={selectedId === DRAFT_ANNOTATION_ID}
          hasUnsavedGeometry={
            popoverAnnotation !== undefined &&
            selectedId !== DRAFT_ANNOTATION_ID &&
            geometryPreview?.annotationId === popoverAnnotation.id &&
            unsavedGeometry !== null
          }
          key={popoverAnnotation?.id ?? "empty"}
          onCategoryChange={(categoryId) => {
            if (popoverAnnotation === undefined) {
              return;
            }
            if (selectedId === DRAFT_ANNOTATION_ID && draftBBox !== null) {
              submit({
                bbox: draftBBox,
                categoryId,
                expectedVersion: frame.version,
                kind: "create",
              });
              return;
            }
            submit({
              annotationId: popoverAnnotation.id,
              categoryId,
              expectedVersion: popoverAnnotation.version,
              kind: "category",
            });
          }}
          onCategoryFilterChange={() => {
            setCategoryActionError(null);
            // Keep the rejected normalized name as a local deny-list entry.
            // AnnotationPopover compares it with the current proposal, so a
            // genuinely different intent is available immediately while
            // filtering away and back cannot restart the same `409` loop.
            setCategoryConflict((current) => (current?.kind === "unidentified" ? current : null));
          }}
          onClose={() => {
            setCategoryActionError(null);
            setCategoryConflict(null);
            closeSelectionContext();
            setDraftBBox(null);
            setSelectedId(null);
            setGeometryPreview(null);
          }}
          onCreateCategory={(category) => {
            if (popoverAnnotation === undefined) {
              return;
            }
            if (selectedId === DRAFT_ANNOTATION_ID && draftBBox !== null) {
              submit({
                assignment: {
                  bbox: draftBBox,
                  expectedVersion: frame.version,
                  kind: "draft",
                },
                category,
                kind: "create-category",
              });
              return;
            }
            submit({
              assignment: {
                annotationId: popoverAnnotation.id,
                expectedVersion: popoverAnnotation.version,
                kind: "existing",
              },
              category,
              kind: "create-category",
            });
          }}
          onDelete={() => {
            if (popoverAnnotation === undefined) {
              return;
            }
            removeAnnotation(popoverAnnotation.id);
          }}
        />

        {/*
          FE-019 moved this panel out from inside the annotation popover's own
          markup, so it is no longer inside `popoverRef` there. Without
          `exemptFromOutsideClick`, working the picker here would register as
          an outside pointerdown and silently discard whatever the operator
          was mid-edit on in "Anotacja" — see AnnotationPopover's outside-close
          handler.
        */}
        <Panel
          className="df-review-copy"
          description={
            previousFrameKnown && hasPreviousFrame
              ? `Źródłem jest klatka ${String(previousClasses.previous_frame_index)} — poprzednia w czasie, niezależnie od aktywnego filtra statusu.`
              : "Źródłem jest poprzednia klatka w czasie, niezależnie od aktywnego filtra statusu."
          }
          exemptFromOutsideClick
          title="Powtórz z poprzedniej klatki"
        >
          {/*
            The panel keeps the explanation that distinguishes a missing source
            from an empty source, but the picker appears only when there is
            something real to choose. An empty filter would imply a typo.
          */}
          {copyOfferedIds.length === 0 ? null : (
            <GroupedOptionList
              disabled={!capabilities.canEdit || mutation.isPending}
              emptyMessage="Żadna klasa z poprzedniej klatki nie pasuje do wpisanego tekstu."
              filterLabel="Filtruj klasy"
              groups={copyGroups}
              label={PREVIOUS_CLASS_LIST_LABEL}
              mode="multiple"
              onChange={(selection) => {
                setCopySelection(selection);
                setCopyFeedback(null);
              }}
              selectedIds={copyEffectiveSelection}
            />
          )}
          <Button
            disabled={copyDisabled}
            loading={currentBusyKey === "copy-previous"}
            onClick={copyPrevious}
            size="sm"
            variant="secondary"
          >
            Powtórz
          </Button>
          <p aria-live="polite" className="df-review-copy__status">
            {copyStatus}
          </p>
        </Panel>
      </aside>

      <section
        aria-label={`Podgląd klatki ${frame.frame_index}`}
        className="df-review-workspace__preview"
      >

        <RegionOverlay
          cornerLabel={`Klatka ${String(frame.frame_index)}`}
          disabled={editorDisabled}
          imageAlt={`Klatka ${frame.frame_index} runu ${runId}`}
          imageUrl={frameImageUrl(frame.id, imageAttempt === 0 ? undefined : imageAttempt)}
          interactionMode="draw"
          key={`frame-image-${String(imageAttempt)}`}
          label="Bbox anotacji na klatce"
          onDraw={capabilities.canEdit ? handleDraw : undefined}
          onImageError={() => {
            setImageError(true);
          }}
          onSourceResolved={() => {
            setImageError(false);
          }}
          onRemove={capabilities.canEdit ? removeAnnotation : undefined}
          onSelect={selectAnnotation}
          onShapeChange={canDirectEdit ? previewManipulationGeometry : undefined}
          onShapeChangeCancel={canDirectEdit ? cancelManipulationGeometry : undefined}
          onShapeChangeEnd={canDirectEdit ? commitManipulationGeometry : undefined}
          selectedId={selectedId}
          shapes={shapes}
          source={{ width: frame.width, height: frame.height }}
        />
      </section>
    </>
  );
}
