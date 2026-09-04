import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import {
  describeApiError,
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
import { RegionOverlay, type OverlayShape } from "../../components/common/RegionOverlay";
import { StatusBadge } from "../../components/common/StatusBadge";
import { FatalError, InlineError, Loading } from "../../components/common/UiStates";
import { AnnotationPopover } from "./AnnotationPopover";
import { ClassList } from "./ClassList";
import { categoryIdsOfKind, copyOptionGroups, copyPreviousTarget } from "./copySelection";
import { FrameToolbar } from "./FrameToolbar";
import { geometryDraft, parseGeometryDraft } from "./geometryForm";
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

function busyKey(intent: ReviewMutationIntent | undefined): string | null {
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
}

interface RedrawMode {
  annotationId: string;
  kind: "redraw";
}

interface GeometryPreview {
  annotationId: string;
  bbox: BBox;
}

const DRAFT_ANNOTATION_ID = "new-annotation-draft";

function LoadedFrameEditor({
  counts,
  disabled,
  filter,
  frame,
  frames,
  onFilterChange,
  onSelect,
  profile,
  runId,
}: LoadedFrameEditorProps) {
  const queryClient = useQueryClient();
  const imageErrorCopy = describeErrorCode("frame_image_not_found");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [redrawMode, setRedrawMode] = useState<RedrawMode | null>(null);
  const [geometryPreview, setGeometryPreview] = useState<GeometryPreview | null>(null);
  const [draftBBox, setDraftBBox] = useState<BBox | null>(null);
  const [imageError, setImageError] = useState(false);
  const [imageAttempt, setImageAttempt] = useState(0);
  const [actionError, setActionError] = useState<ErrorPresentation | null>(null);
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

  const mutation = useMutation<void | CopyPreviousAnnotationsResult, unknown, ReviewMutationIntent>({
    mutationKey: reviewMutationKey(runId),
    mutationFn: (intent) => executeReviewMutation(frame.id, intent),
    onError: async (error, intent) => {
      if (intent.kind === "copy-previous") {
        setCopyFeedback(null);
      }
      if (intent.kind === "geometry") {
        setGeometryPreview(null);
      }
      const presentation = describeApiError(error);
      setActionError(presentation);
      if (presentation.code === "bbox_invalid") {
        // A newer bbox verdict replaces the whole previous verdict atomically.
        setInvalidIds(presentation.annotationIds);
      }
      if (isVersionConflict(error)) {
        // Explicit stale-frame reload. `invalidateFor` owns the central key map
        // and waits for the active frame/list refetch; no cache value is patched.
        await invalidateFor(queryClient, {
          type: intent.kind === "review" ? "frame-reviewed" : "annotation-changed",
          frameId: frame.id,
          runId,
        });
      }
    },
    onSuccess: async (data, intent) => {
      setActionError(null);
      if (intent.kind === "review") {
        setInvalidIds([]);
      } else if (intent.kind === "geometry" || intent.kind === "delete") {
        setInvalidIds((current) => current.filter((id) => id !== intent.annotationId));
      }
      setRedrawMode(null);
      if (intent.kind === "delete") {
        setSelectedId((current) => (current === intent.annotationId ? null : current));
      }
      if (intent.kind === "category") {
        setSelectedId((current) => (current === intent.annotationId ? null : current));
      }
      if (intent.kind === "create") {
        setDraftBBox(null);
        setSelectedId(null);
      }
      if (intent.kind === "copy-previous" && data !== undefined) {
        setCopyFeedback(
          data.copied === 0
            ? "Poprzednia klatka nie ma anotacji w tej grupie. Nic nie zmieniono."
            : `Skopiowano: ${data.copied}. Zastąpiono: ${data.replaced}.`,
        );
      }
      await invalidateFor(queryClient, {
        type: intent.kind === "review" ? "frame-reviewed" : "annotation-changed",
        frameId: frame.id,
        runId,
      });
      if (intent.kind === "geometry") {
        setGeometryPreview(null);
      }
    },
  });

  const currentBusyKey = mutation.isPending ? busyKey(mutation.variables) : null;
  const invalidSet = useMemo(() => new Set(invalidIds), [invalidIds]);
  const selectedAnnotation =
    selectedId === null
      ? undefined
      : activeAnnotations.find((annotation) => annotation.id === selectedId);
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
  const canDirectEdit = capabilities.canEdit && redrawMode === null;
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
      const key = event.key.toLocaleLowerCase("pl");
      if (
        key === "a" &&
        capabilities.canAccept &&
        activeAnnotations.length > 0 &&
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
    capabilities.canAccept,
    capabilities.canReject,
    copyDisabled,
    copySelection,
    frame.version,
    mutation,
    profile.categories,
  ]);

  function submit(intent: ReviewMutationIntent): void {
    setActionError(null);
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
      setDraftBBox(bbox);
      return;
    }
    setGeometryPreview({ annotationId, bbox });
  }

  function commitAnnotationGeometry(annotationId: string, bbox: BBox): void {
    if (annotationId === DRAFT_ANNOTATION_ID) {
      setDraftBBox(bbox);
      return;
    }
    const annotation = annotationById(annotationId);
    if (annotation === undefined) {
      setGeometryPreview(null);
      return;
    }
    const parsed = parseGeometryDraft(geometryDraft(bbox), {
      width: frame.width,
      height: frame.height,
    });
    if (parsed.bbox === null) {
      setGeometryPreview(null);
      return;
    }
    changeAnnotationGeometry(annotation, parsed.bbox);
  }

  function handleDraw(bbox: BBox): void {
    if (redrawMode !== null) {
      const annotation = annotationById(redrawMode.annotationId);
      if (annotation !== undefined) {
        changeAnnotationGeometry(annotation, bbox);
      }
      return;
    }
    setActionError(null);
    setDraftBBox(bbox);
    setSelectedId(DRAFT_ANNOTATION_ID);
  }

  function selectAnnotation(annotationId: string): void {
    if (annotationId !== DRAFT_ANNOTATION_ID) {
      setDraftBBox(null);
    }
    setSelectedId(annotationId);
    setGeometryPreview((current) =>
      current?.annotationId === annotationId ? current : null,
    );
    // Selection means inspection. It cancels redraw so a later gesture cannot
    // silently PATCH the previously armed annotation.
    setRedrawMode(null);
  }

  return (
    <>
      <FrameToolbar
        actions={
          <>
            {capabilities.canAccept ? (
              <Button
                aria-label="Zaakceptuj klatkę"
                disabled={mutation.isPending || activeAnnotations.length === 0}
                loading={currentBusyKey === "review:accept"}
                onClick={() => {
                  submit({ decision: "accept", expectedVersion: frame.version, kind: "review" });
                }}
                size="sm"
                title={activeAnnotations.length === 0 ? "Akceptacja wymaga aktywnej anotacji" : "Skrót: A"}
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

      <section
        aria-label={`Podgląd klatki ${frame.frame_index}`}
        className="df-review-workspace__preview"
      >

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

        <RegionOverlay
          disabled={editorDisabled}
          imageAlt={`Klatka ${frame.frame_index} runu ${runId}`}
          imageUrl={frameImageUrl(frame.id, imageAttempt === 0 ? undefined : imageAttempt)}
          interactionMode="draw"
          key={`frame-image-${String(imageAttempt)}`}
          label="Bbox anotacji na klatce"
          floatingLayer={
            popoverAnnotation === undefined ? null : (
              <AnnotationPopover
                annotation={popoverAnnotation}
                busyKey={currentBusyKey}
                categories={profile.categories}
                disabled={editorDisabled}
                draft={selectedId === DRAFT_ANNOTATION_ID}
                drawing={
                  selectedId !== DRAFT_ANNOTATION_ID &&
                  redrawMode?.annotationId === popoverAnnotation.id
                }
                frameSize={{ height: frame.height, width: frame.width }}
                geometryPreview={
                  selectedId !== DRAFT_ANNOTATION_ID &&
                  geometryPreview?.annotationId === popoverAnnotation.id
                    ? geometryPreview.bbox
                    : null
                }
                invalid={
                  selectedId === DRAFT_ANNOTATION_ID
                    ? false
                    : invalidSet.has(popoverAnnotation.id)
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
                onClose={() => {
                  setDraftBBox(null);
                  setSelectedId(null);
                  setGeometryPreview(null);
                  setRedrawMode(null);
                }}
                onDelete={() => {
                  if (selectedId === DRAFT_ANNOTATION_ID) {
                    setDraftBBox(null);
                    setSelectedId(null);
                    return;
                  }
                  submit({
                    annotationId: popoverAnnotation.id,
                    expectedVersion: popoverAnnotation.version,
                    kind: "delete",
                  });
                }}
                onGeometryChange={(bbox) => {
                  if (selectedId === DRAFT_ANNOTATION_ID) {
                    setDraftBBox(bbox);
                    return;
                  }
                  changeAnnotationGeometry(popoverAnnotation, bbox);
                }}
                onToggleDrawTarget={() => {
                  if (selectedId === DRAFT_ANNOTATION_ID) {
                    setDraftBBox(null);
                    setSelectedId(null);
                    return;
                  }
                  setRedrawMode((current) =>
                    current?.annotationId === popoverAnnotation.id
                      ? null
                      : { annotationId: popoverAnnotation.id, kind: "redraw" },
                  );
                }}
              />
            )
          }
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
          onShapeChange={canDirectEdit ? previewAnnotationGeometry : undefined}
          onShapeChangeCancel={canDirectEdit ? () => setGeometryPreview(null) : undefined}
          onShapeChangeEnd={canDirectEdit ? commitAnnotationGeometry : undefined}
          selectedId={selectedId}
          shapes={shapes}
          source={{ width: frame.width, height: frame.height }}
        />

      </section>

    </>
  );
}
