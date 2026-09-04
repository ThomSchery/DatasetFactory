from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

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


class ReviewStageError(RuntimeError):
    pass


class ReviewEmptyPatchError(ValueError):
    pass


class ReviewCategoryError(ValueError):
    pass


class ReviewNoAnnotationsError(ValueError):
    pass


class ReviewTransitionError(RuntimeError):
    pass


class ReviewPreviousFrameError(RuntimeError):
    pass


class ReviewCopyBBoxError(ValueError):
    def __init__(self, annotation_ids: tuple[str, ...]) -> None:
        super().__init__("bbox_invalid")
        self.annotation_ids = annotation_ids


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


@dataclass(frozen=True)
class CopyPreviousResult:
    copied: int
    replaced: int
    frame_version: int


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

    def create_manual(
        self,
        frame_id: str,
        *,
        annotation_id: str,
        category_id: str,
        x: int,
        y: int,
        width: int,
        height: int,
        expected_version: int,
    ) -> StoredAnnotation:
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
            if frame.review_status != "pending":
                raise ReviewLockedError
            # Checked inside the write transaction too: a worker reaching the frame
            # concurrently would rewrite its OCR proposals and drop a box accepted
            # here on the strength of a stage read taken in another session.
            if frame.stage_status != "review_pending":
                raise ReviewStageError
            self._require_allowed_category(session, category_id, run.profile_id)
            annotation = Annotation(
                id=annotation_id,
                frame_id=frame.id,
                category_id=category_id,
                x=x,
                y=y,
                width=width,
                height=height,
                confidence=None,
                source="manual",
                observation_id=None,
                status="proposed",
                version=1,
            )
            session.add(annotation)
            frame.version += 1
            run.review_revision += 1
            session.flush()
            return self._stored_annotation(annotation)

    def update(
        self,
        annotation_id: str,
        *,
        category_id: str | None,
        bbox: tuple[int, int, int, int] | None,
        expected_version: int,
    ) -> StoredFrameReview:
        with self._database.session() as session:
            # Own guard rather than trust of the single caller: a no-op patch must
            # not bump `review_revision`, which would fail a concurrent export draft
            # with `export_revision_conflict` for a mutation that changed nothing.
            if category_id is None and bbox is None:
                raise ReviewEmptyPatchError
            session.connection().exec_driver_sql("BEGIN IMMEDIATE")
            annotation, frame, run = self._mutation_rows(session, annotation_id)
            self._require_annotation_mutation(annotation, frame, expected_version)
            if category_id is not None:
                self._require_allowed_category(session, category_id, run.profile_id)
                annotation.category_id = category_id
            if bbox is not None:
                annotation.x, annotation.y, annotation.width, annotation.height = bbox
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
            if decision == "reopen":
                if frame.review_status == "accepted":
                    raise ReviewLockedError
                if frame.review_status != "rejected":
                    raise ReviewTransitionError
                frame.review_status = "pending"
                frame.version += 1
                run.review_revision += 1
                session.flush()
                return self._frame_record(session, frame, run)
            if frame.review_status != "pending":
                raise ReviewLockedError
            # Checked inside the write transaction too: a worker committing OCR for
            # this frame concurrently would reset `review_status` back to `pending`
            # and undo the decision recorded here on the strength of a stale stage read.
            if frame.stage_status != "review_pending":
                raise ReviewStageError
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

    def copy_previous(
        self,
        frame_id: str,
        *,
        scope: str,
        category_id: str | None,
        category_ids: tuple[str, ...] | None = None,
        expected_version: int,
    ) -> CopyPreviousResult:
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
            if frame.review_status != "pending":
                raise ReviewLockedError
            if frame.stage_status != "review_pending":
                raise ReviewStageError

            previous = session.scalar(
                select(Frame)
                .where(Frame.run_id == frame.run_id, Frame.frame_index < frame.frame_index)
                .order_by(Frame.frame_index.desc())
                .limit(1)
            )
            if previous is None:
                raise ReviewPreviousFrameError

            category_filter: ColumnElement[bool]
            if scope == "category":
                if category_id is None:
                    raise ReviewCategoryError
                self._require_allowed_category(session, category_id, run.profile_id)
                category_filter = Category.id == category_id
            elif scope == "categories":
                # Every identifier is validated before the first write, so a
                # list containing one class from another profile leaves the
                # target frame and its version untouched.
                if not category_ids:
                    raise ReviewCategoryError
                for item in category_ids:
                    self._require_allowed_category(session, item, run.profile_id)
                category_filter = Category.id.in_(tuple(category_ids))
            else:
                category_filter = Category.kind == scope

            source_annotations = tuple(
                session.scalars(
                    select(Annotation)
                    .join(Category, Annotation.category_id == Category.id)
                    .where(
                        Annotation.frame_id == previous.id,
                        Annotation.status != "deleted",
                        Category.profile_id == run.profile_id,
                        category_filter,
                    )
                    .order_by(Annotation.created_at, Annotation.id)
                )
            )
            if not source_annotations:
                return CopyPreviousResult(copied=0, replaced=0, frame_version=frame.version)

            invalid_ids = tuple(
                annotation.id
                for annotation in source_annotations
                if annotation.x < 0
                or annotation.y < 0
                or annotation.width <= 0
                or annotation.height <= 0
                or annotation.x + annotation.width > frame.width
                or annotation.y + annotation.height > frame.height
            )
            if invalid_ids:
                raise ReviewCopyBBoxError(invalid_ids)

            target_annotations = tuple(
                session.scalars(
                    select(Annotation)
                    .join(Category, Annotation.category_id == Category.id)
                    .where(
                        Annotation.frame_id == frame.id,
                        Annotation.status != "deleted",
                        Category.profile_id == run.profile_id,
                        category_filter,
                    )
                )
            )
            for annotation in target_annotations:
                annotation.status = "deleted"
                annotation.version += 1
            for source in source_annotations:
                session.add(
                    Annotation(
                        id=str(uuid4()),
                        frame_id=frame.id,
                        category_id=source.category_id,
                        x=source.x,
                        y=source.y,
                        width=source.width,
                        height=source.height,
                        confidence=None,
                        source="manual",
                        observation_id=None,
                        status="proposed",
                        version=1,
                    )
                )
            frame.version += 1
            run.review_revision += 1
            session.flush()
            return CopyPreviousResult(
                copied=len(source_annotations),
                replaced=len(target_annotations),
                frame_version=frame.version,
            )

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
        if frame.review_status != "pending":
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
            AnnotationRepository._stored_annotation(item)
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

    @staticmethod
    def _require_allowed_category(
        session: Session,
        category_id: str,
        profile_id: str,
    ) -> None:
        allowed = session.scalar(
            select(func.count())
            .select_from(Category)
            .where(Category.id == category_id, Category.profile_id == profile_id)
        )
        if not allowed:
            raise ReviewCategoryError

    @staticmethod
    def _stored_annotation(item: Annotation) -> StoredAnnotation:
        return StoredAnnotation(
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
