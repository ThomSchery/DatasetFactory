from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.app.access.store.database import Database
from backend.app.access.store.models import Annotation, Category, Frame, PipelineRun


class AnnotationNotFoundError(LookupError):
    pass


class ReviewFrameNotFoundError(LookupError):
    pass


class ReviewVersionConflictError(RuntimeError):
    pass


class ReviewLockedError(RuntimeError):
    pass


class ReviewCategoryError(ValueError):
    pass


class ReviewNoAnnotationsError(ValueError):
    pass


class ReviewTransitionError(RuntimeError):
    pass


@dataclass(frozen=True)
class StoredAnnotation:
    id: str
    category_id: str
    x: int
    y: int
    width: int
    height: int
    confidence: float | None
    source: str
    observation_id: str | None
    status: str
    version: int


@dataclass(frozen=True)
class StoredFrameReview:
    id: str
    run_id: str
    frame_index: int
    timestamp_ms: int
    image_relpath: Path
    stage_status: str
    review_status: str
    width: int
    height: int
    version: int
    review_revision: int
    allowed_category_ids: frozenset[str]
    annotations: tuple[StoredAnnotation, ...]


class AnnotationRepository:
    """Persist review mutations with one SQLite write transaction per mutation."""

    def __init__(self, database: Database) -> None:
        self._database = database

    def frame(self, frame_id: str) -> StoredFrameReview:
        with self._database.session() as session:
            frame = session.get(Frame, frame_id)
            if frame is None:
                raise ReviewFrameNotFoundError
            run = session.get(PipelineRun, frame.run_id)
            if run is None:
                raise ReviewFrameNotFoundError
            return self._frame_record(session, frame, run)

    def frame_for_annotation(self, annotation_id: str) -> StoredFrameReview:
        with self._database.session() as session:
            annotation = session.get(Annotation, annotation_id)
            if annotation is None:
                raise AnnotationNotFoundError
            frame = session.get(Frame, annotation.frame_id)
            if frame is None:
                raise AnnotationNotFoundError
            run = session.get(PipelineRun, frame.run_id)
            if run is None:
                raise AnnotationNotFoundError
            return self._frame_record(session, frame, run)

    def update_category(
        self,
        annotation_id: str,
        *,
        category_id: str,
        expected_version: int,
    ) -> StoredFrameReview:
        with self._database.session() as session:
            session.connection().exec_driver_sql("BEGIN IMMEDIATE")
            annotation, frame, run = self._mutation_rows(session, annotation_id)
            self._require_annotation_mutation(annotation, frame, expected_version)
            allowed = session.scalar(
                select(func.count())
                .select_from(Category)
                .where(Category.id == category_id, Category.profile_id == run.profile_id)
            )
            if not allowed:
                raise ReviewCategoryError
            annotation.category_id = category_id
            annotation.version += 1
            run.review_revision += 1
            session.flush()
            return self._frame_record(session, frame, run)

    def tombstone(self, annotation_id: str, *, expected_version: int) -> StoredFrameReview:
        with self._database.session() as session:
            session.connection().exec_driver_sql("BEGIN IMMEDIATE")
            annotation, frame, run = self._mutation_rows(session, annotation_id)
            self._require_annotation_mutation(annotation, frame, expected_version)
            annotation.status = "deleted"
            annotation.version += 1
            run.review_revision += 1
            session.flush()
            return self._frame_record(session, frame, run)

    def review_frame(
        self,
        frame_id: str,
        *,
        decision: str,
        expected_version: int,
    ) -> StoredFrameReview:
        with self._database.session() as session:
            session.connection().exec_driver_sql("BEGIN IMMEDIATE")
            frame = session.get(Frame, frame_id)
            if frame is None:
                raise ReviewFrameNotFoundError
            run = session.get(PipelineRun, frame.run_id)
            if run is None:
                raise ReviewFrameNotFoundError
            if frame.version != expected_version:
                raise ReviewVersionConflictError
            if frame.review_status == "accepted":
                raise ReviewLockedError
            if frame.review_status != "pending":
                raise ReviewTransitionError
            active = tuple(
                session.scalars(
                    select(Annotation).where(
                        Annotation.frame_id == frame.id,
                        Annotation.status != "deleted",
                    )
                )
            )
            if decision == "accept":
                if not active:
                    raise ReviewNoAnnotationsError
                for annotation in active:
                    annotation.status = "accepted"
                frame.review_status = "accepted"
            elif decision == "reject":
                frame.review_status = "rejected"
            else:
                raise ReviewTransitionError
            frame.version += 1
            run.review_revision += 1
            session.flush()
            return self._frame_record(session, frame, run)

    @staticmethod
    def _mutation_rows(
        session: Session,
        annotation_id: str,
    ) -> tuple[Annotation, Frame, PipelineRun]:
        annotation = session.get(Annotation, annotation_id)
        if annotation is None:
            raise AnnotationNotFoundError
        frame = session.get(Frame, annotation.frame_id)
        if frame is None:
            raise AnnotationNotFoundError
        run = session.get(PipelineRun, frame.run_id)
        if run is None:
            raise AnnotationNotFoundError
        return annotation, frame, run

    @staticmethod
    def _require_annotation_mutation(
        annotation: Annotation,
        frame: Frame,
        expected_version: int,
    ) -> None:
        if annotation.version != expected_version:
            raise ReviewVersionConflictError
        if frame.review_status == "accepted":
            raise ReviewLockedError
        if annotation.status == "deleted":
            raise ReviewTransitionError

    @staticmethod
    def _frame_record(
        session: Session,
        frame: Frame,
        run: PipelineRun,
    ) -> StoredFrameReview:
        allowed = frozenset(
            session.scalars(select(Category.id).where(Category.profile_id == run.profile_id))
        )
        annotations = tuple(
            StoredAnnotation(
                id=item.id,
                category_id=item.category_id,
                x=item.x,
                y=item.y,
                width=item.width,
                height=item.height,
                confidence=item.confidence,
                source=item.source,
                observation_id=item.observation_id,
                status=item.status,
                version=item.version,
            )
            for item in session.scalars(
                select(Annotation)
                .where(Annotation.frame_id == frame.id)
                .order_by(Annotation.created_at, Annotation.id)
            )
        )
        return StoredFrameReview(
            id=frame.id,
            run_id=run.id,
            frame_index=frame.frame_index,
            timestamp_ms=frame.timestamp_ms,
            image_relpath=Path(frame.image_relpath),
            stage_status=frame.stage_status,
            review_status=frame.review_status,
            width=frame.width,
            height=frame.height,
            version=frame.version,
            review_revision=run.review_revision,
            allowed_category_ids=allowed,
            annotations=annotations,
        )
