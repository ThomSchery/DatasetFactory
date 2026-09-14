import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  categoryNameConflictFromError,
  describeApiError,
  createProfileCategory,
  describeErrorCode,
  describeFrameStage,
  frameImageUrl,
  frameReviewCapabilities,
  getFrame,
  invalidateFor,
  isActiveAnnotation,
  isVersionConflict,
  queryKeys,
  type Annotation,
  type BBox,
  type CategoryInput,
  type CopyPreviousAnnotationsResult,
  type ErrorPresentation,
  type FrameCounts,
  type FrameSummary,
  type GameProfile,
  type ReviewStatusFilter,
} from "../../api";
import { Button } from "../../components/common/Button";
import { DataList } from "../../components/common/DataList";
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
import { categoryIdsOfKind, copyOptionGroups, copyPreviousTarget } from "./copySelection";
import { FrameToolbar } from "./FrameToolbar";
import {
  executeReviewMutation,
  reviewMutationKey,
  type ReviewMutationIntent,
} from "./reviewMutations";

interface FrameEditorProps {
  counts: FrameCounts;
  disabled: boolean;
  filter: ReviewStatusFilter;
  frameId: string;
  frames: readonly FrameSummary[];
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
  // The HUD level is preselected whole, which is the request the panel sent by
  // default before the picker existed.
  const [copySelection, setCopySelection] = useState<readonly string[]>(() =>
    categoryIdsOfKind(profile.categories, "game"),
  );
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const capabilities = frameReviewCapabilities(frame.stage_status, frame.review_status);
  const activeAnnotations = useMemo(
    () => frame.annotations.filter(isActiveAnnotation),
    [frame.annotations],
  );
  const categoryById = useMemo(
    () => new Map(profile.categories.map((category) => [category.id, category.name])),
    [profile.categories],
  );

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

  const mutation = useMutation<void | CopyPreviousAnnotationsResult, unknown, EditorMutationIntent>({
    mutationKey: reviewMutationKey(runId),
    mutationFn: async (intent) => {
      createdCategoryRef.current = false;
      if (intent.kind !== "create-category") {
        return executeReviewMutation(frame.id, intent);
      }

      const category = await createProfileCategory(profile.id, intent.category);
      createdCategoryRef.current = true;
      if (intent.assignment.kind === "draft") {
        return executeReviewMutation(frame.id, {
          bbox: intent.assignment.bbox,
          categoryId: category.id,
          expectedVersion: intent.assignment.expectedVersion,
          kind: "create",
        });
      }
      return executeReviewMutation(frame.id, {
        annotationId: intent.assignment.annotationId,
        categoryId: category.id,
        expectedVersion: intent.assignment.expectedVersion,
        kind: "category",
      });
    },
    onError: async (error, intent) => {
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
        setCategoryActionError(presentation);
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
      if (intent.kind === "create-category" && presentation.code === "category_name_exists") {
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
    onSuccess: async (data, intent) => {
      setActionError(null);
      setCategoryActionError(null);
      if (successfulMutationClearsCategoryConflict(intent, selectedId, geometryPreview)) {
        setCategoryConflict(null);
      }
      if (intent.kind === "review") {
        setInvalidIds([]);
      } else if (intent.kind === "geometry" || intent.kind === "delete") {
        setInvalidIds((current) => current.filter((id) => id !== intent.annotationId));
      }
      if (intent.kind === "delete") {
        setSelectedId((current) => (current === intent.annotationId ? null : current));
      }
      if (intent.kind === "category") {
        const annotationId = intent.annotationId;
        setSelectedId((current) =>
          current === annotationId &&
          geometryPreview?.annotationId !== annotationId
            ? null
            : current,
        );
      }
      if (intent.kind === "create-category" && intent.assignment.kind === "existing") {
        const annotationId = intent.assignment.annotationId;
        setSelectedId((current) =>
          current === annotationId &&
          geometryPreview?.annotationId !== annotationId
            ? null
            : current,
        );
      }
      if (
        intent.kind === "create" ||
        (intent.kind === "create-category" && intent.assignment.kind === "draft")
      ) {
        setDraftBBox(null);
        updateSelectionContext(null);
        setSelectedId(null);
      }
      if (intent.kind === "copy-previous" && data !== undefined) {
        setCopyFeedback(
          data.copied === 0
            ? "Poprzednia klatka nie ma anotacji w tej grupie. Nic nie zmieniono."
            : `Skopiowano: ${data.copied}. Zastąpiono: ${data.replaced}.`,
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

  useEffect(() => {
    if (
      frameRefreshing ||
      mutation.isPending ||
      selectedId === null ||
      selectedId === DRAFT_ANNOTATION_ID ||
      activeAnnotations.some((annotation) => annotation.id === selectedId)
    ) {
      return;
    }

    closeSelectionContext();
    setSelectedId(null);
    setCategoryConflict(null);
    setGeometryPreview((current) =>
      current?.annotationId === selectedId ? null : current,
    );
  }, [activeAnnotations, frameRefreshing, mutation.isPending, selectedId]);

  const currentBusyKey = mutation.isPending ? busyKey(mutation.variables) : null;
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
  const stage = describeFrameStage(frame.stage_status);
  const editorDisabled = !capabilities.canEdit || mutation.isPending;
  const canDirectEdit = capabilities.canEdit;
  const copyTarget = copyPreviousTarget(copySelection, profile.categories);
  const copyDisabled =
    frame.frame_index === 0 ||
    !capabilities.canEdit ||
    mutation.isPending ||
    copyTarget === null;

  function copyPrevious(): void {
    if (copyDisabled || copyTarget === null) {
      return;
    }
    setActionError(null);
    setCopyFeedback(null);
    mutation.mutate({
      expectedVersion: frame.version,
      kind: "copy-previous",
      target: copyTarget,
    });
  }

  useEffect(() => {
    function handleReviewShortcut(event: globalThis.KeyboardEvent): void {
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
           * the panel commits the preview. The guard this branch shares with
           * the letter shortcuts excludes fields and the class picker, but
           * those shortcuts never consumed `Enter`, so buttons still need the
           * explicit panel boundary.
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
      const key = event.key.toLocaleLowerCase("pl");
      if (
        key === "a" &&
        capabilities.canAccept &&
        activeAnnotations.length > 0 &&
        // An accepted frame is terminal, so losing a nudge to it is
        // irreversible. The panel says why the shortcut does nothing.
        unsavedGeometry === null &&
        !mutation.isPending
      ) {
        event.preventDefault();
        setActionError(null);
        mutation.mutate({ decision: "accept", expectedVersion: frame.version, kind: "review" });
      } else if (key === "x" && capabilities.canReject && !mutation.isPending) {
        event.preventDefault();
        setActionError(null);
        mutation.mutate({ decision: "reject", expectedVersion: frame.version, kind: "review" });
      } else if (key === "r" && !copyDisabled) {
        const target = copyPreviousTarget(copySelection, profile.categories);
        if (target === null) {
          return;
        }
        event.preventDefault();
        setActionError(null);
        setCopyFeedback(null);
        mutation.mutate({
          expectedVersion: frame.version,
          kind: "copy-previous",
          target,
        });
      }
    }

    window.addEventListener("keydown", handleReviewShortcut);
    return () => {
      window.removeEventListener("keydown", handleReviewShortcut);
    };
  }, [
    activeAnnotations.length,
    canDirectEdit,
    capabilities.canAccept,
    capabilities.canReject,
    copyDisabled,
    copySelection,
    draftBBox,
    editorDisabled,
    frame.height,
    frame.version,
    frame.width,
    geometryPreview,
    mutation,
    profile.categories,
    selectedAnnotation,
    selectedId,
    unsavedGeometry,
  ]);

  function submit(intent: EditorMutationIntent): void {
    setActionError(null);
    setCategoryActionError(null);
    mutation.mutate(intent);
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

  function handleDraw(bbox: BBox): void {
    setActionError(null);
    setCategoryActionError(null);
    setDraftBBox(toBBox(bbox));
    updateSelectionContext(DRAFT_ANNOTATION_ID);
    setSelectedId(DRAFT_ANNOTATION_ID);
  }

  function selectAnnotation(annotationId: string): void {
    setCategoryActionError(null);
    updateSelectionContext(annotationId);
    if (annotationId !== DRAFT_ANNOTATION_ID) {
      setDraftBBox(null);
    }
    setSelectedId(annotationId);
    setGeometryPreview((current) =>
      current?.annotationId === annotationId ? current : null,
    );
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
                      : "Skrót: A"
                }
              >
                Zaakceptuj <kbd>A</kbd>
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
                title="Skrót: X"
                variant="secondary"
              >
                Odrzuć <kbd>X</kbd>
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
          description="Kliknij klasę, aby zaznaczyć jej bbox; kolejne kliknięcia przechodzą między wystąpieniami."
          eyebrow="Bieżąca klatka"
          title="Anotacje na klatce"
        >
          <ClassList
            annotations={activeAnnotations}
            categories={profile.categories}
            disabled={editorDisabled}
            onSelect={selectAnnotation}
            selectedId={selectedId}
          />
          <section aria-labelledby="copy-previous-heading" className="df-review-copy">
            <div>
              <h3 id="copy-previous-heading">Powtórz z poprzedniej klatki</h3>
              <p>Źródłem jest poprzednia klatka w czasie, niezależnie od aktywnego filtra statusu.</p>
            </div>
            <GroupedOptionList
              disabled={!capabilities.canEdit || mutation.isPending || frame.frame_index === 0}
              emptyMessage="Żadna klasa profilu nie pasuje do wpisanego tekstu."
              filterLabel="Filtruj klasy"
              groups={copyOptionGroups(profile.categories)}
              label="Grupa anotacji"
              mode="multiple"
              onChange={(selection) => {
                setCopySelection(selection);
                setCopyFeedback(null);
              }}
              selectedIds={copySelection}
            />
            <Button
              disabled={copyDisabled}
              loading={currentBusyKey === "copy-previous"}
              onClick={copyPrevious}
              size="sm"
              title="Skrót: R"
              variant="secondary"
            >
              Powtórz <kbd>R</kbd>
            </Button>
            <p aria-live="polite" className="df-review-copy__status">
              {frame.frame_index === 0
                ? "To pierwsza klatka runu — brak wcześniejszej klatki do skopiowania."
                : !capabilities.canEdit
                  ? "Kopiowanie wymaga oczekującej klatki gotowej do weryfikacji."
                  : copyTarget === null
                    ? "Zaznacz co najmniej jedną klasę albo całą grupę do powtórzenia."
                    : copyFeedback}
            </p>
          </section>
        </Panel>

        {popoverAnnotation === undefined ? null : (
          <AnnotationPopover
            annotation={popoverAnnotation}
            busyKey={currentBusyKey}
            categories={profile.categories}
            categoryConflict={categoryConflict}
            categoryError={
              categoryActionError === null ? null : errorMessage(categoryActionError)
            }
            disabled={editorDisabled}
            draft={selectedId === DRAFT_ANNOTATION_ID}
            hasUnsavedGeometry={
              selectedId !== DRAFT_ANNOTATION_ID &&
              geometryPreview?.annotationId === popoverAnnotation.id &&
              unsavedGeometry !== null
            }
            key={popoverAnnotation.id}
            onCategoryChange={(categoryId) => {
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
              setCategoryConflict((current) =>
                current?.kind === "unidentified" ? current : null,
              );
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
              if (selectedId === DRAFT_ANNOTATION_ID) {
                setDraftBBox(null);
                updateSelectionContext(null);
                setSelectedId(null);
                return;
              }
              submit({
                annotationId: popoverAnnotation.id,
                expectedVersion: popoverAnnotation.version,
                kind: "delete",
              });
            }}
          />
        )}

        <Panel className="df-review-workspace__details" title="Dane klatki">
          <DataList
            items={[
              { label: "Timestamp", value: `${(frame.timestamp_ms / 1000).toFixed(3)} s` },
              { label: "Wymiary", value: `${frame.width} × ${frame.height} px` },
              {
                label: "Etap",
                value: (
                  <StatusBadge srLabel="Etap:" tone={stage.tone}>
                    {stage.label}
                  </StatusBadge>
                ),
              },
              { label: "Wersja klatki", value: frame.version },
            ]}
            layout="columns"
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
          onRemove={
            capabilities.canEdit
              ? (annotationId) => {
                  if (annotationId === DRAFT_ANNOTATION_ID) {
                    setDraftBBox(null);
                    updateSelectionContext(null);
                    setSelectedId(null);
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
              : undefined
          }
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
