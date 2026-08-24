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
import {
  EMPTY_GEOMETRY_DRAFT,
  parseGeometryDraft,
  type GeometryDraft,
} from "./geometryForm";
import { executeReviewMutation, type ReviewMutationIntent } from "./reviewMutations";

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

function LoadedFrameEditor({ frame, profile, runId }: LoadedFrameEditorProps) {
  const queryClient = useQueryClient();
  const imageErrorCopy = describeErrorCode("frame_image_not_found");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawTargetId, setDrawTargetId] = useState<string | null>(null);
  const [newCategoryId, setNewCategoryId] = useState(profile.categories[0]?.id ?? "");
  const [newGeometry, setNewGeometry] = useState<GeometryDraft>(() => ({
    ...EMPTY_GEOMETRY_DRAFT,
  }));
  const [newGeometryError, setNewGeometryError] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
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
    mutationFn: (intent) => executeReviewMutation(frame.id, intent),
    onError: async (error, intent) => {
      const presentation = describeApiError(error);
      setActionError(presentation);
      setInvalidIds(presentation.annotationIds);
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
      setInvalidIds([]);
      setDrawTargetId(null);
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
    },
  });

  const currentBusyKey = mutation.isPending ? busyKey(mutation.variables) : null;
  const invalidSet = useMemo(() => new Set(invalidIds), [invalidIds]);
  const shapes: OverlayShape[] = activeAnnotations.map((annotation) => {
    const categoryName = categoryById.get(annotation.category_id) ?? annotation.category_id;
    const sourceLabel = annotation.source === "ocr" ? "OCR" : "manual";
    return {
      id: annotation.id,
      label: `${categoryName}, źródło ${sourceLabel}`,
      tone: invalidSet.has(annotation.id) ? "error" : "brand",
      x: annotation.x,
      y: annotation.y,
      width: annotation.width,
      height: annotation.height,
    };
  });
  const stage = describeFrameStage(frame.stage_status);
  const review = describeReviewStatus(frame.review_status);
  const editorDisabled = !capabilities.canEdit || mutation.isPending;

  function submit(intent: ReviewMutationIntent): void {
    setActionError(null);
    setInvalidIds([]);
    mutation.mutate(intent);
  }

  function annotationById(annotationId: string): Annotation | undefined {
    return activeAnnotations.find((annotation) => annotation.id === annotationId);
  }

  function handleDraw(bbox: BBox): void {
    if (drawTargetId !== null) {
      const annotation = annotationById(drawTargetId);
      if (annotation !== undefined) {
        submit({
          annotationId: annotation.id,
          bbox,
          expectedVersion: annotation.version,
          kind: "geometry",
        });
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

  return (
    <>
      <Panel
        aside={
          <StatusBadge srLabel="Status weryfikacji:" tone={review.tone}>
            {review.label}
          </StatusBadge>
        }
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
              {drawTargetId === null
                ? "Przeciągnij na obrazie, aby dodać ręczny bbox."
                : "Przeciągnij na obrazie, aby zastąpić geometrię zaznaczonej anotacji."}
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
          <InlineError
            message={`${imageErrorCopy.message} ${imageErrorCopy.action} Kod: frame_image_not_found.`}
          />
        ) : null}

        <RegionOverlay
          disabled={editorDisabled}
          imageAlt={`Klatka ${frame.frame_index} runu ${runId}`}
          imageUrl={frameImageUrl(frame.id)}
          label="Bbox anotacji na klatce"
          onDraw={capabilities.canEdit ? handleDraw : undefined}
          onImageError={() => {
            setImageError(true);
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
          onSelect={setSelectedId}
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
        description="Każdą operację v1 wykonasz z klawiatury bez trafiania w bbox na obrazie."
        eyebrow="Inspektor"
        title="Anotacje"
      >
        <AnnotationList
          annotations={activeAnnotations}
          busyKey={currentBusyKey}
          categories={profile.categories}
          disabled={editorDisabled}
          drawTargetId={drawTargetId}
          frameSize={{ width: frame.width, height: frame.height }}
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
            submit({
              annotationId: annotation.id,
              bbox,
              expectedVersion: annotation.version,
              kind: "geometry",
            });
          }}
          onSelect={setSelectedId}
          onToggleDrawTarget={(annotationId) => {
            setDrawTargetId((current) => (current === annotationId ? null : annotationId));
            setSelectedId(annotationId);
          }}
          selectedId={selectedId}
        />
      </Panel>
    </>
  );
}
