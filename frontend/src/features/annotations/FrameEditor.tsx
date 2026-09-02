import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import {
  describeApiError,
  describeErrorCode,
  describeFrameStage,
  describeReviewStatus,
  frameImageUrl,
  frameReviewCapabilities,
  getFrame,
  invalidateFor,
  isActiveAnnotation,
  isVersionConflict,
  queryKeys,
  type Annotation,
  type BBox,
  type ErrorPresentation,
  type GameProfile,
} from "../../api";
import { Button } from "../../components/common/Button";
import { DataList } from "../../components/common/DataList";
import { Notice } from "../../components/common/Notice";
import { Panel } from "../../components/common/Panel";
import { RegionOverlay, type OverlayShape } from "../../components/common/RegionOverlay";
import { SelectField } from "../../components/common/SelectField";
import { StatusBadge } from "../../components/common/StatusBadge";
import { TextField } from "../../components/common/TextField";
import { FatalError, InlineError, Loading } from "../../components/common/UiStates";
import { AnnotationList } from "./AnnotationList";
import { ClassList } from "./ClassList";
import {
  EMPTY_GEOMETRY_DRAFT,
  geometryDraft,
  parseGeometryDraft,
  type GeometryDraft,
} from "./geometryForm";
import {
  executeReviewMutation,
  reviewMutationKey,
  type ReviewMutationIntent,
} from "./reviewMutations";

interface FrameEditorProps {
  frameId: string;
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
    case "review":
      return `review:${intent.decision}`;
  }
}

function errorMessage(error: ErrorPresentation): string {
  return `${error.message} ${error.action} Kod: ${error.code}.`;
}

export function FrameEditor({ frameId, profile, runId }: FrameEditorProps) {
  const frameQuery = useQuery({
    queryKey: queryKeys.frame(frameId),
    queryFn: ({ signal }) => getFrame(frameId, signal),
  });

  if (frameQuery.isPending) {
    return (
      <div className="df-review-workspace__query-state">
        <Loading label="Ładowanie wybranej klatki…" />
      </div>
    );
  }
  if (frameQuery.isError) {
    const error = describeApiError(frameQuery.error);
    return (
      <div className="df-review-workspace__query-state">
        <FatalError
          description={errorMessage(error)}
          onRetry={() => {
            void frameQuery.refetch();
          }}
          title="Nie udało się pobrać klatki"
        />
      </div>
    );
  }

  return <LoadedFrameEditor frame={frameQuery.data} profile={profile} runId={runId} />;
}

interface LoadedFrameEditorProps {
  frame: Awaited<ReturnType<typeof getFrame>>;
  profile: GameProfile;
  runId: string;
}

interface RedrawMode {
  annotationId: string;
  kind: "redraw";
}

interface GeometryPreview {
  annotationId: string;
  bbox: BBox;
}

function LoadedFrameEditor({ frame, profile, runId }: LoadedFrameEditorProps) {
  const queryClient = useQueryClient();
  const imageErrorCopy = describeErrorCode("frame_image_not_found");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [redrawMode, setRedrawMode] = useState<RedrawMode | null>(null);
  const [geometryPreview, setGeometryPreview] = useState<GeometryPreview | null>(null);
  const [newCategoryId, setNewCategoryId] = useState(profile.categories[0]?.id ?? "");
  const [newGeometry, setNewGeometry] = useState<GeometryDraft>(() => ({
    ...EMPTY_GEOMETRY_DRAFT,
  }));
  const [newGeometryError, setNewGeometryError] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const [imageAttempt, setImageAttempt] = useState(0);
  const [actionError, setActionError] = useState<ErrorPresentation | null>(null);
  const [invalidIds, setInvalidIds] = useState<readonly string[]>([]);
  const capabilities = frameReviewCapabilities(frame.stage_status, frame.review_status);
  const activeAnnotations = useMemo(
    () => frame.annotations.filter(isActiveAnnotation),
    [frame.annotations],
  );
  const categoryById = useMemo(
    () => new Map(profile.categories.map((category) => [category.id, category.name])),
    [profile.categories],
  );

  const mutation = useMutation<void, unknown, ReviewMutationIntent>({
    mutationKey: reviewMutationKey(runId),
    mutationFn: (intent) => executeReviewMutation(frame.id, intent),
    onError: async (error, intent) => {
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
    onSuccess: async (_data, intent) => {
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
      if (intent.kind === "create") {
        setNewGeometry({ ...EMPTY_GEOMETRY_DRAFT });
        setNewGeometryError(null);
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
  const stage = describeFrameStage(frame.stage_status);
  const review = describeReviewStatus(frame.review_status);
  const editorDisabled = !capabilities.canEdit || mutation.isPending;
  const redrawTarget =
    redrawMode === null ? undefined : activeAnnotations.find((item) => item.id === redrawMode.annotationId);
  const redrawTargetLabel =
    redrawTarget === undefined
      ? null
      : `${categoryById.get(redrawTarget.category_id) ?? redrawTarget.category_id} (${redrawTarget.id})`;
  const canDirectEdit = capabilities.canEdit && redrawMode === null;

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
    setGeometryPreview({ annotationId, bbox });
  }

  function commitAnnotationGeometry(annotationId: string, bbox: BBox): void {
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
    if (newCategoryId !== "") {
      submit({
        bbox,
        categoryId: newCategoryId,
        expectedVersion: frame.version,
        kind: "create",
      });
    }
  }

  function selectAnnotation(annotationId: string): void {
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
      <Panel
        aside={
          <StatusBadge srLabel="Status weryfikacji:" tone={review.tone}>
            {review.label}
          </StatusBadge>
        }
        className="df-review-workspace__preview"
        description="Współrzędne bbox są pikselami naturalnego obrazu klatki. Boksy mogą się nakładać."
        eyebrow={`Klatka ${frame.frame_index}`}
        title="Obraz i bbox"
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

        {capabilities.canEdit ? (
          <div className="df-review-create">
            <SelectField
              disabled={mutation.isPending}
              label="Klasa nowego bbox"
              onChange={(event) => {
                setNewCategoryId(event.target.value);
              }}
              options={profile.categories.map((category) => ({
                label: category.name,
                value: category.id,
              }))}
              value={newCategoryId}
            />
            <p>
              {redrawTargetLabel === null
                ? "Przeciągnij na obrazie, aby dodać ręczny bbox."
                : `Tryb zmiany geometrii: ${redrawTargetLabel}. Przeciągnij na obrazie, aby zastąpić bbox tej anotacji.`}
            </p>
            <div className="df-review-annotations__geometry">
              {(["x", "y", "width", "height"] as const).map((field) => (
                <TextField
                  disabled={mutation.isPending}
                  inputMode="numeric"
                  key={field}
                  label={`Nowy ${field}`}
                  onChange={(event) => {
                    setNewGeometry((current) => ({
                      ...current,
                      [field]: event.target.value,
                    }));
                    setNewGeometryError(null);
                  }}
                  type="number"
                  value={newGeometry[field]}
                  width="short"
                />
              ))}
            </div>
            {newGeometryError === null ? null : (
              <p className="df-review-annotations__invalid" role="alert">
                {newGeometryError}
              </p>
            )}
            <Button
              disabled={mutation.isPending}
              loading={currentBusyKey === "create"}
              onClick={() => {
                const parsed = parseGeometryDraft(newGeometry, {
                  width: frame.width,
                  height: frame.height,
                });
                setNewGeometryError(parsed.error);
                if (parsed.bbox !== null && newCategoryId !== "") {
                  submit({
                    bbox: parsed.bbox,
                    categoryId: newCategoryId,
                    expectedVersion: frame.version,
                    kind: "create",
                  });
                }
              }}
              variant="secondary"
            >
              Dodaj bbox z pól
            </Button>
          </div>
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

        <div className="df-review-decisions">
          {capabilities.canAccept ? (
            <Button
              disabled={mutation.isPending || activeAnnotations.length === 0}
              loading={currentBusyKey === "review:accept"}
              onClick={() => {
                submit({ decision: "accept", expectedVersion: frame.version, kind: "review" });
              }}
              title={activeAnnotations.length === 0 ? "Akceptacja wymaga aktywnej anotacji" : undefined}
            >
              Zaakceptuj klatkę
            </Button>
          ) : null}
          {capabilities.canReject ? (
            <Button
              disabled={mutation.isPending}
              loading={currentBusyKey === "review:reject"}
              onClick={() => {
                submit({ decision: "reject", expectedVersion: frame.version, kind: "review" });
              }}
              variant="secondary"
            >
              Odrzuć klatkę
            </Button>
          ) : null}
          {capabilities.canReopen ? (
            <Button
              disabled={mutation.isPending}
              loading={currentBusyKey === "review:reopen"}
              onClick={() => {
                submit({ decision: "reopen", expectedVersion: frame.version, kind: "review" });
              }}
            >
              Otwórz ponownie
            </Button>
          ) : null}
        </div>
      </Panel>

      <Panel
        aside={
          <StatusBadge srLabel="Aktywne anotacje:" tone="neutral">
            {activeAnnotations.length}
          </StatusBadge>
        }
        className="df-review-workspace__inspector"
        description="Każdą operację v1 wykonasz z klawiatury bez trafiania w bbox na obrazie."
        eyebrow="Inspektor"
        title="Anotacje"
      >
        <ClassList
          annotations={activeAnnotations}
          categories={profile.categories}
          disabled={editorDisabled}
          onSelect={selectAnnotation}
          selectedId={selectedId}
        />
        <details className="df-review-legacy-inspector" open>
          <summary>Pełny inspektor anotacji</summary>
        <AnnotationList
          annotations={activeAnnotations}
          busyKey={currentBusyKey}
          categories={profile.categories}
          disabled={editorDisabled}
          drawTargetId={redrawMode?.annotationId ?? null}
          frameSize={{ width: frame.width, height: frame.height }}
          geometryPreview={geometryPreview}
          invalidIds={invalidSet}
          onCategoryChange={(annotation, categoryId) => {
            submit({
              annotationId: annotation.id,
              categoryId,
              expectedVersion: annotation.version,
              kind: "category",
            });
          }}
          onDelete={(annotation) => {
            submit({
              annotationId: annotation.id,
              expectedVersion: annotation.version,
              kind: "delete",
            });
          }}
          onGeometryChange={(annotation, bbox) => {
            changeAnnotationGeometry(annotation, bbox);
          }}
          onSelect={selectAnnotation}
          onToggleDrawTarget={(annotationId) => {
            setSelectedId(annotationId);
            setRedrawMode((current) =>
              current?.annotationId === annotationId
                ? null
                : { annotationId, kind: "redraw" },
            );
          }}
          selectedId={selectedId}
        />
        </details>
      </Panel>
    </>
  );
}
