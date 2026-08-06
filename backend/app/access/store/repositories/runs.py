from __future__ import annotations

import hashlib
import math
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal, cast
from uuid import uuid4

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.access.store.database import Database
from backend.app.access.store.models import (
    Category,
    Frame,
    GameProfile,
    PipelineRun,
    VideoAsset,
)
from backend.app.engines.definition import OcrProvenance
from backend.app.managers.workflow.state_machine import (
    NONTERMINAL_RUN_STATUSES,
    InvalidTransitionError,
    RunStatus,
    require_run_transition,
)

PROCESS_INSTANCE_ID = str(uuid4())


class RunNotFoundError(LookupError):
    pass


class RunProfileNotFoundError(LookupError):
    pass


class RunVideoNotFoundError(LookupError):
    pass


class RunVersionConflictError(RuntimeError):
    pass


class RunReservationConflictError(RunVersionConflictError):
    pass


class ActiveRunError(RuntimeError):
    pass


class RunSourceError(RuntimeError):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class RunCreationContext:
    profile_width: int
    profile_height: int
    video_width: int
    video_height: int
    duration_ms: int
    allowed_chars: tuple[str, ...]


@dataclass(frozen=True)
class RunRecord:
    id: str
    profile_id: str
    video_id: str
    interval_ms: int
    status: str
    error_code: str | None
    last_heartbeat_at: datetime | None
    attempt: int
    total_frames: int
    completed_frames: int
    current_stage: str | None
    current_frame_index: int | None
    workflow_slot: int | None
    resume_token: str | None
    version: int
    review_revision: int
    recovery_skipped_frames: int
    ocr_engine: str
    ocr_engine_version: str
    ocr_runtime_sha256: str
    ocr_model_sha256: str
    ocr_config_hash: str
    ocr_language: str
    ocr_page_segmentation_mode: int
    experimental: bool
    quality_gate: str
    warning: str


@dataclass(frozen=True)
class SourceSnapshot:
    path: Path
    size_bytes: int
    fingerprint: str


@dataclass(frozen=True)
class ResumeReservation:
    run_id: str
    token: str
    owner: str
    version: int
    allowed_from: frozenset[RunStatus]


class RunRepository:
    """Own durable run lifecycle, optimistic versions, and the global active slot."""

    def __init__(
        self, database: Database, *, process_instance_id: str = PROCESS_INSTANCE_ID
    ) -> None:
        self._database = database
        self._process_instance_id = process_instance_id

    def creation_context(self, profile_id: str, video_id: str) -> RunCreationContext:
        with self._database.session() as session:
            profile = session.get(GameProfile, profile_id)
            if profile is None:
                raise RunProfileNotFoundError
            video = session.get(VideoAsset, video_id)
            if video is None:
                raise RunVideoNotFoundError
            allowed = tuple(
                session.scalars(
                    select(Category.name)
                    .where(Category.profile_id == profile_id, Category.kind == "character")
                    .order_by(Category.ordinal)
                )
            )
            return RunCreationContext(
                profile.source_width,
                profile.source_height,
                video.width,
                video.height,
                video.duration_ms,
                allowed,
            )

    def create(
        self,
        *,
        profile_id: str,
        video_id: str,
        interval_ms: int,
        duration_ms: int,
        provenance: OcrProvenance,
        warning: str,
    ) -> RunRecord:
        total_frames = max(1, math.ceil(duration_ms / interval_ms))
        with self._database.session() as session:
            run = PipelineRun(
                id=str(uuid4()),
                profile_id=profile_id,
                video_id=video_id,
                interval_ms=interval_ms,
                status="queued",
                error_code=None,
                last_heartbeat_at=None,
                attempt=1,
                total_frames=total_frames,
                current_stage=None,
                current_frame_index=None,
                control_requested=None,
                workflow_slot=None,
                resume_token=None,
                resume_owner=None,
                ocr_engine=provenance.engine_id,
                ocr_engine_version=provenance.engine_version,
                ocr_runtime_sha256=provenance.runtime_sha256,
                ocr_model_sha256=provenance.model_sha256,
                ocr_config_hash=provenance.config_hash,
                ocr_language=provenance.language,
                ocr_page_segmentation_mode=provenance.page_segmentation_mode,
                experimental=provenance.experimental,
                quality_gate=provenance.quality_gate,
                warning=warning,
                version=1,
                review_revision=0,
                recovery_skipped_frames=0,
            )
            session.add(run)
            session.flush()
            return self._record(session, run)

    def get(self, run_id: str) -> RunRecord:
        with self._database.session() as session:
            run = session.get(PipelineRun, run_id)
            if run is None:
                raise RunNotFoundError
            return self._record(session, run)

    def active(self) -> RunRecord | None:
        """Read the one unfinished run a dashboard should show, or nothing.

        The single `workflow_slot` owner wins, so a run that is `running` or being
        resumed always beats an older unfinished one; otherwise the newest wins.
        """
        with self._database.session() as session:
            run = session.scalar(
                select(PipelineRun)
                .where(PipelineRun.status.in_(NONTERMINAL_RUN_STATUSES))
                .order_by(
                    PipelineRun.workflow_slot.desc(),
                    PipelineRun.created_at.desc(),
                    PipelineRun.id.desc(),
                )
                .limit(1)
            )
            if run is None:
                return None
            return self._record(session, run)

    def activate(
        self,
        run_id: str,
        *,
        expected_version: int,
        allowed_from: frozenset[RunStatus],
        increment_attempt: bool,
    ) -> RunRecord:
        try:
            with self._database.session() as session:
                session.connection().exec_driver_sql("BEGIN IMMEDIATE")
                run = session.get(PipelineRun, run_id)
                if run is None:
                    raise RunNotFoundError
                if run.version != expected_version:
                    raise RunVersionConflictError
                self._require_no_reservation(run)
                current = cast(RunStatus, run.status)
                if current not in allowed_from:
                    raise InvalidTransitionError(
                        aggregate="run",
                        current=current,
                        target="running",
                    )
                slot_owner = session.scalar(
                    select(PipelineRun.id)
                    .where(PipelineRun.workflow_slot == 1, PipelineRun.id != run_id)
                    .limit(1)
                )
                if slot_owner is not None:
                    raise ActiveRunError
                require_run_transition(current, "running")
                run.status = "running"
                run.workflow_slot = 1
                run.error_code = None
                run.control_requested = None
                run.resume_token = None
                run.resume_owner = None
                run.last_heartbeat_at = datetime.now(UTC)
                run.current_stage = "sampling"
                run.current_frame_index = self._first_incomplete_frame(session, run)
                if increment_attempt:
                    run.attempt += 1
                run.version += 1
                session.flush()
                return self._record(session, run)
        except IntegrityError as exc:
            if "pipeline_runs.workflow_slot" in str(exc.orig):
                raise ActiveRunError from exc
            raise

    def reserve_resume(
        self,
        run_id: str,
        *,
        expected_version: int,
        allowed_from: frozenset[RunStatus],
    ) -> ResumeReservation:
        """Persist the exclusive owner of resume preparation in one short CAS."""
        try:
            with self._database.session() as session:
                session.connection().exec_driver_sql("BEGIN IMMEDIATE")
                run = session.get(PipelineRun, run_id)
                if run is None:
                    raise RunNotFoundError
                if run.version != expected_version:
                    raise RunVersionConflictError
                if run.resume_token is not None:
                    raise RunReservationConflictError
                current = cast(RunStatus, run.status)
                if current not in allowed_from:
                    raise InvalidTransitionError(
                        aggregate="run",
                        current=current,
                        target="running",
                    )
                slot_owner = session.scalar(
                    select(PipelineRun.id)
                    .where(PipelineRun.workflow_slot == 1, PipelineRun.id != run_id)
                    .limit(1)
                )
                if slot_owner is not None:
                    raise ActiveRunError
                require_run_transition(current, "running")
                token = str(uuid4())
                run.workflow_slot = 1
                run.resume_token = token
                run.resume_owner = self._process_instance_id
                run.version += 1
                session.flush()
                return ResumeReservation(
                    run.id,
                    token,
                    self._process_instance_id,
                    run.version,
                    allowed_from,
                )
        except IntegrityError as exc:
            if "pipeline_runs.workflow_slot" in str(exc.orig):
                raise ActiveRunError from exc
            raise

    def validate_resume_reservation(self, reservation: ResumeReservation) -> None:
        """Fail before expensive reconciliation when the request no longer owns the run."""
        with self._database.session() as session:
            run = session.get(PipelineRun, reservation.run_id)
            if run is None:
                raise RunNotFoundError
            if (
                run.resume_token != reservation.token
                or run.resume_owner != reservation.owner
                or reservation.owner != self._process_instance_id
                or run.workflow_slot != 1
                or run.version != reservation.version
                or cast(RunStatus, run.status) not in reservation.allowed_from
            ):
                raise RunReservationConflictError

    def release_resume(self, reservation: ResumeReservation) -> bool:
        """Release only the caller's still-current token; never disturb a new owner."""
        with self._database.session() as session:
            session.connection().exec_driver_sql("BEGIN IMMEDIATE")
            run = session.get(PipelineRun, reservation.run_id)
            if (
                run is None
                or run.resume_token != reservation.token
                or run.resume_owner != reservation.owner
                or reservation.owner != self._process_instance_id
                or run.workflow_slot != 1
                or run.version != reservation.version
            ):
                return False
            run.resume_token = None
            run.resume_owner = None
            run.workflow_slot = None
            session.flush()
            return True

    def fail_reserved_resume(
        self,
        reservation: ResumeReservation,
        error_code: str,
    ) -> bool:
        """Consume the caller's reservation as a durable failure without another bump."""
        with self._database.session() as session:
            session.connection().exec_driver_sql("BEGIN IMMEDIATE")
            run = session.get(PipelineRun, reservation.run_id)
            if (
                run is None
                or run.resume_token != reservation.token
                or run.resume_owner != reservation.owner
                or reservation.owner != self._process_instance_id
                or run.workflow_slot != 1
                or run.version != reservation.version
                or cast(RunStatus, run.status) not in reservation.allowed_from
            ):
                return False
            run.status = "failed"
            run.error_code = error_code
            run.resume_token = None
            run.resume_owner = None
            run.workflow_slot = None
            session.flush()
            return True

    def clear_stale_resume_reservations(self) -> int:
        """Recover process-crashed preparation without changing optimistic versions."""
        with self._database.session() as session:
            session.connection().exec_driver_sql("BEGIN IMMEDIATE")
            reserved = tuple(
                session.scalars(
                    select(PipelineRun).where(
                        PipelineRun.resume_token.is_not(None),
                        or_(
                            PipelineRun.resume_owner.is_(None),
                            PipelineRun.resume_owner != self._process_instance_id,
                        ),
                    )
                )
            )
            for run in reserved:
                run.resume_token = None
                run.resume_owner = None
                run.workflow_slot = None
            session.flush()
            return len(reserved)

    def request_pause(self, run_id: str, *, expected_version: int) -> RunRecord:
        return self._request_control(
            run_id,
            expected_version=expected_version,
            requested="pause",
        )

    def request_cancel(self, run_id: str, *, expected_version: int) -> RunRecord:
        with self._database.session() as session:
            session.connection().exec_driver_sql("BEGIN IMMEDIATE")
            run = session.get(PipelineRun, run_id)
            if run is None:
                raise RunNotFoundError
            if run.version != expected_version:
                raise RunVersionConflictError
            self._require_no_reservation(run)
            current = cast(RunStatus, run.status)
            if current == "running":
                require_run_transition(current, "cancelled")
                run.control_requested = "cancel"
            else:
                require_run_transition(current, "cancelled")
                run.status = "cancelled"
                run.control_requested = None
                run.current_stage = None
                run.current_frame_index = None
            run.version += 1
            session.flush()
            return self._record(session, run)

    def request_shutdown_pause(self) -> str | None:
        with self._database.session() as session:
            session.connection().exec_driver_sql("BEGIN IMMEDIATE")
            run = session.scalar(
                select(PipelineRun).where(PipelineRun.status == "running").limit(1)
            )
            if run is None:
                return None
            run.control_requested = "pause"
            run.version += 1
            session.flush()
            return run.id

    def control_requested(self, run_id: str) -> str | None:
        with self._database.session() as session:
            run = session.get(PipelineRun, run_id)
            if run is None:
                raise RunNotFoundError
            return run.control_requested

    def acknowledge_control(self, run_id: str) -> RunRecord:
        with self._database.session() as session:
            session.connection().exec_driver_sql("BEGIN IMMEDIATE")
            run = session.get(PipelineRun, run_id)
            if run is None:
                raise RunNotFoundError
            if run.status != "running" or run.control_requested is None:
                return self._record(session, run)
            target: RunStatus = "paused" if run.control_requested == "pause" else "cancelled"
            require_run_transition("running", target)
            run.status = target
            run.workflow_slot = None
            run.control_requested = None
            run.current_stage = None
            run.current_frame_index = None
            run.version += 1
            session.flush()
            return self._record(session, run)

    def heartbeat(self, run_id: str) -> None:
        with self._database.session() as session:
            run = session.get(PipelineRun, run_id)
            if run is not None and run.status == "running":
                run.last_heartbeat_at = datetime.now(UTC)

    def update_progress(self, run_id: str, *, stage: str, frame_index: int) -> None:
        # `version` is the optimistic lock protecting client intent (start/pause/resume/
        # cancel), not a progress counter. Bumping it here would age out the version a
        # client just polled and reject every control request against a live run.
        with self._database.session() as session:
            run = session.get(PipelineRun, run_id)
            if run is None:
                raise RunNotFoundError
            if run.status != "running":
                return
            run.current_stage = stage
            run.current_frame_index = frame_index

    def finish_review_ready(self, run_id: str) -> RunRecord:
        return self._terminal_transition(run_id, "review_ready", None)

    def fail(self, run_id: str, error_code: str) -> RunRecord:
        return self._terminal_transition(run_id, "failed", error_code)

    def fail_before_activation(
        self,
        run_id: str,
        *,
        expected_version: int,
        error_code: str,
    ) -> RunRecord:
        with self._database.session() as session:
            session.connection().exec_driver_sql("BEGIN IMMEDIATE")
            run = session.get(PipelineRun, run_id)
            if run is None:
                raise RunNotFoundError
            if run.version != expected_version:
                raise RunVersionConflictError
            self._require_no_reservation(run)
            current = cast(RunStatus, run.status)
            if current != "failed":
                require_run_transition(current, "failed")
                run.status = "failed"
            run.error_code = error_code
            run.control_requested = None
            run.current_stage = None
            run.current_frame_index = None
            run.version += 1
            session.flush()
            return self._record(session, run)

    def source_snapshot(self, run_id: str) -> SourceSnapshot:
        with self._database.session() as session:
            row = session.execute(
                select(VideoAsset.local_path, VideoAsset.size_bytes, VideoAsset.fingerprint)
                .join(PipelineRun, PipelineRun.video_id == VideoAsset.id)
                .where(PipelineRun.id == run_id)
            ).one_or_none()
            if row is None:
                raise RunNotFoundError
            snapshot = SourceSnapshot(Path(row[0]), int(row[1]), str(row[2]))
        try:
            stat = snapshot.path.stat()
        except OSError as exc:
            raise RunSourceError("source_missing") from exc
        if not snapshot.path.is_file():
            raise RunSourceError("source_missing")
        fingerprint = hashlib.sha256(f"{stat.st_size}:{stat.st_mtime_ns}".encode()).hexdigest()
        if stat.st_size != snapshot.size_bytes or fingerprint != snapshot.fingerprint:
            raise RunSourceError("source_changed")
        return snapshot

    def running_ids(self) -> tuple[str, ...]:
        with self._database.session() as session:
            return tuple(
                session.scalars(select(PipelineRun.id).where(PipelineRun.status == "running"))
            )

    def pause_orphan(self, run_id: str) -> None:
        with self._database.session() as session:
            run = session.get(PipelineRun, run_id)
            if run is None or run.status != "running":
                return
            require_run_transition("running", "paused")
            run.status = "paused"
            run.workflow_slot = None
            run.control_requested = None
            run.current_stage = None
            run.current_frame_index = None
            run.version += 1

    def provenance(self, run_id: str) -> OcrProvenance:
        with self._database.session() as session:
            run = session.get(PipelineRun, run_id)
            if run is None:
                raise RunNotFoundError
            return self._provenance(run)

    def _request_control(
        self,
        run_id: str,
        *,
        expected_version: int,
        requested: str,
    ) -> RunRecord:
        with self._database.session() as session:
            session.connection().exec_driver_sql("BEGIN IMMEDIATE")
            run = session.get(PipelineRun, run_id)
            if run is None:
                raise RunNotFoundError
            if run.version != expected_version:
                raise RunVersionConflictError
            self._require_no_reservation(run)
            current = cast(RunStatus, run.status)
            # Only `running` may reach `paused`, so this guard already rejects every
            # other status.
            require_run_transition(current, "paused")
            run.control_requested = requested
            run.version += 1
            session.flush()
            return self._record(session, run)

    def _terminal_transition(
        self,
        run_id: str,
        target: RunStatus,
        error_code: str | None,
    ) -> RunRecord:
        with self._database.session() as session:
            session.connection().exec_driver_sql("BEGIN IMMEDIATE")
            run = session.get(PipelineRun, run_id)
            if run is None:
                raise RunNotFoundError
            self._require_no_reservation(run)
            if run.status != "running":
                return self._record(session, run)
            if run.control_requested == "cancel":
                target = "cancelled"
                error_code = None
            require_run_transition("running", target)
            run.status = target
            run.workflow_slot = None
            run.error_code = error_code
            run.control_requested = None
            run.current_stage = "review" if target == "review_ready" else None
            run.current_frame_index = None
            run.version += 1
            session.flush()
            return self._record(session, run)

    @staticmethod
    def _first_incomplete_frame(session: Session, run: PipelineRun) -> int:
        completed = set(
            session.scalars(
                select(Frame.frame_index).where(
                    Frame.run_id == run.id,
                    Frame.stage_status == "review_pending",
                )
            )
        )
        return next((index for index in range(run.total_frames) if index not in completed), 0)

    @staticmethod
    def _require_no_reservation(run: PipelineRun) -> None:
        if run.resume_token is not None:
            raise RunReservationConflictError

    @staticmethod
    def _provenance(run: PipelineRun) -> OcrProvenance:
        return OcrProvenance(
            engine_id=run.ocr_engine,
            engine_version=run.ocr_engine_version,
            runtime_sha256=run.ocr_runtime_sha256,
            model_sha256=run.ocr_model_sha256,
            config_hash=run.ocr_config_hash,
            experimental=run.experimental,
            quality_gate=cast(Literal["passed", "failed", "unknown"], run.quality_gate),
            language=run.ocr_language,
            page_segmentation_mode=run.ocr_page_segmentation_mode,
        )

    @staticmethod
    def _record(session: Session, run: PipelineRun) -> RunRecord:
        completed = int(
            session.scalar(
                select(func.count())
                .select_from(Frame)
                .where(Frame.run_id == run.id, Frame.stage_status == "review_pending")
            )
            or 0
        )
        return RunRecord(
            id=run.id,
            profile_id=run.profile_id,
            video_id=run.video_id,
            interval_ms=run.interval_ms,
            status=run.status,
            error_code=run.error_code,
            last_heartbeat_at=run.last_heartbeat_at,
            attempt=run.attempt,
            total_frames=run.total_frames,
            completed_frames=completed,
            current_stage=run.current_stage,
            current_frame_index=run.current_frame_index,
            workflow_slot=run.workflow_slot,
            resume_token=run.resume_token,
            version=run.version,
            review_revision=run.review_revision,
            recovery_skipped_frames=run.recovery_skipped_frames,
            ocr_engine=run.ocr_engine,
            ocr_engine_version=run.ocr_engine_version,
            ocr_runtime_sha256=run.ocr_runtime_sha256,
            ocr_model_sha256=run.ocr_model_sha256,
            ocr_config_hash=run.ocr_config_hash,
            ocr_language=run.ocr_language,
            ocr_page_segmentation_mode=run.ocr_page_segmentation_mode,
            experimental=run.experimental,
            quality_gate=run.quality_gate,
            warning=run.warning,
        )
