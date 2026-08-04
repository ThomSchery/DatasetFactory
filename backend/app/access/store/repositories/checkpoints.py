from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, cast
from uuid import uuid4

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from backend.app.access.store.database import Database
from backend.app.access.store.models import (
    Annotation,
    Frame,
    OcrObservation,
    PipelineRun,
    RegionSample,
    StageCheckpoint,
)
from backend.app.access.store.repositories.runs import ResumeReservation
from backend.app.access.store.workspace import Workspace, WorkspaceError
from backend.app.managers.workflow.state_machine import (
    FrameStage,
    RunStatus,
    require_frame_transition,
    require_run_transition,
)

STAGES = ("sample", "crop", "ocr")


class CheckpointArtifactError(RuntimeError):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class CheckpointReservationError(RuntimeError):
    pass


@dataclass(frozen=True)
class FrameInvalidation:
    frame_index: int
    stage: str
    expected_frame_stage: str


@dataclass(frozen=True)
class ReconciliationPlan:
    run_id: str
    invalidations: tuple[FrameInvalidation, ...]
    skipped_reviewed_frames: tuple[int, ...] = ()


@dataclass(frozen=True)
class CheckpointArtifact:
    relpath: str
    sha256: str


@dataclass(frozen=True)
class CheckpointRecord:
    run_id: str
    frame_index: int
    stage: str
    attempt: int
    status: str
    artifact_relpath: str | None
    artifact_hash: str | None
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


class CheckpointRepository:
    """Publish/verify checkpoint artifacts and invalidate one damaged frame."""

    def __init__(self, database: Database, workspace: Workspace) -> None:
        self._database = database
        self._workspace = workspace

    def get(self, run_id: str, frame_index: int, stage: str) -> CheckpointRecord | None:
        with self._database.session() as session:
            checkpoint = session.get(StageCheckpoint, (run_id, frame_index, stage))
            return self._record(checkpoint) if checkpoint is not None else None

    def completed_for_run(self, run_id: str) -> tuple[CheckpointRecord, ...]:
        with self._database.session() as session:
            checkpoints = session.scalars(
                select(StageCheckpoint)
                .where(StageCheckpoint.run_id == run_id, StageCheckpoint.status == "completed")
                .order_by(StageCheckpoint.frame_index, StageCheckpoint.stage)
            )
            return tuple(self._record(checkpoint) for checkpoint in checkpoints)

    def frame_stages(self, run_id: str) -> tuple[tuple[int, str, str], ...]:
        with self._database.session() as session:
            return tuple(
                (frame.frame_index, frame.stage_status, frame.review_status)
                for frame in session.scalars(
                    select(Frame).where(Frame.run_id == run_id).order_by(Frame.frame_index)
                )
            )

    def hash_artifact(self, relpath: str | Path) -> CheckpointArtifact:
        try:
            path = self._workspace.resolve_relpath(relpath)
        except WorkspaceError as exc:
            raise CheckpointArtifactError("artifact_path_invalid") from exc
        if not path.is_file():
            raise CheckpointArtifactError("checkpoint_artifact_missing")
        return CheckpointArtifact(
            path.relative_to(self._workspace.root).as_posix(), self._sha256(path)
        )

    def publish_manifest(
        self,
        *,
        run_id: str,
        frame_index: int,
        stage: str,
        payload: dict[str, Any],
    ) -> CheckpointArtifact:
        if stage not in STAGES or frame_index < 0:
            raise CheckpointArtifactError("checkpoint_stage_invalid")
        relpath = Path("runs") / run_id / "checkpoints" / str(frame_index) / f"{stage}.json"
        try:
            output = self._workspace.resolve_relpath(relpath)
        except WorkspaceError as exc:
            raise CheckpointArtifactError("artifact_path_invalid") from exc
        try:
            output.parent.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            raise CheckpointArtifactError("checkpoint_output_unwritable") from exc
        temporary = output.with_name(f".{output.name}.{uuid4().hex}.tmp")
        owns_temporary = False
        try:
            content = json.dumps(
                payload,
                ensure_ascii=False,
                separators=(",", ":"),
                sort_keys=True,
            ).encode("utf-8")
            try:
                with temporary.open("xb") as stream:
                    owns_temporary = True
                    stream.write(content)
                    stream.flush()
                    os.fsync(stream.fileno())
                os.replace(temporary, output)
                owns_temporary = False
            except OSError as exc:
                raise CheckpointArtifactError("checkpoint_publish_failed") from exc
            return CheckpointArtifact(relpath.as_posix(), hashlib.sha256(content).hexdigest())
        finally:
            if owns_temporary:
                temporary.unlink(missing_ok=True)

    def is_valid(self, checkpoint: CheckpointRecord) -> bool:
        if (
            checkpoint.status != "completed"
            or checkpoint.artifact_relpath is None
            or checkpoint.artifact_hash is None
        ):
            return False
        try:
            path = self._workspace.resolve_relpath(checkpoint.artifact_relpath)
        except WorkspaceError:
            return False
        try:
            if not path.is_file() or self._sha256(path) != checkpoint.artifact_hash:
                return False
        except OSError:
            return False
        if checkpoint.stage != "crop":
            return True
        try:
            if path.stat().st_size > 1024 * 1024:
                return False
            payload = json.loads(path.read_text(encoding="utf-8"))
            artifacts = payload["artifacts"]
            if not isinstance(artifacts, list) or len(artifacts) > 10_000:
                return False
            for item in artifacts:
                if not isinstance(item, dict):
                    return False
                relpath = item.get("relpath")
                expected = item.get("sha256")
                if not isinstance(relpath, str) or not isinstance(expected, str):
                    return False
                artifact = self._workspace.resolve_relpath(relpath)
                if not artifact.is_file() or self._sha256(artifact) != expected:
                    return False
        except (OSError, UnicodeError, ValueError, KeyError, TypeError, WorkspaceError):
            return False
        return True

    def commit_resume(
        self,
        reservation: ResumeReservation,
        plan: ReconciliationPlan,
    ) -> None:
        """Atomically apply every invalidation and consume the global preparation slot."""
        if plan.run_id != reservation.run_id:
            raise CheckpointReservationError
        with self._database.session() as session:
            session.connection().exec_driver_sql("BEGIN IMMEDIATE")
            run = self._require_reservation(session, reservation)
            self._apply_plan(session, plan)
            # Re-check the same durable owner immediately before activation. The write
            # lock makes this stable, but keeping the assertion beside the commit
            # boundary documents and tests the invariant explicitly.
            self._require_reservation(session, reservation)
            current = cast(RunStatus, run.status)
            require_run_transition(current, "running")
            run.status = "running"
            run.error_code = None
            run.control_requested = None
            run.resume_token = None
            run.resume_owner = None
            run.last_heartbeat_at = datetime.now(UTC)
            run.current_stage = "sampling"
            run.current_frame_index = self._first_incomplete_frame(session, run)
            run.attempt += 1
            # `workflow_slot=1` is retained: preparation and execution are the same
            # globally unique durable slot. Reservation already performed the one bump.
            session.flush()

    def apply_running_plan(self, run_id: str, plan: ReconciliationPlan) -> None:
        """Apply worker/startup recovery as one short all-or-nothing DB transaction."""
        if plan.run_id != run_id:
            raise CheckpointReservationError
        with self._database.session() as session:
            session.connection().exec_driver_sql("BEGIN IMMEDIATE")
            run = session.get(PipelineRun, run_id)
            if (
                run is None
                or run.status != "running"
                or run.workflow_slot != 1
                or run.resume_token is not None
                or run.resume_owner is not None
            ):
                raise CheckpointReservationError
            self._apply_plan(session, plan)
            session.flush()

    def _apply_plan(self, session: Session, plan: ReconciliationPlan) -> None:
        for invalidation in plan.invalidations:
            self._apply_invalidation(session, plan.run_id, invalidation)
        if plan.skipped_reviewed_frames:
            run = session.get(PipelineRun, plan.run_id)
            if run is None:
                raise CheckpointReservationError
            base_warning = run.warning.split("Recovery warning:", 1)[0].rstrip()
            count = len(plan.skipped_reviewed_frames)
            recovery_warning = (
                f"Recovery warning: skipped {count} reviewed frame(s) with invalid artifacts."
            )
            run.warning = f"{base_warning}\n{recovery_warning}".lstrip()

    def _apply_invalidation(
        self,
        session: Session,
        run_id: str,
        invalidation: FrameInvalidation,
    ) -> None:
        if invalidation.stage not in STAGES:
            raise CheckpointArtifactError("checkpoint_stage_invalid")
        target_by_stage: dict[str, FrameStage] = {
            "sample": "pending",
            "crop": "sampled",
            "ocr": "cropped",
        }
        frame = session.scalars(
            select(Frame).where(
                Frame.run_id == run_id,
                Frame.frame_index == invalidation.frame_index,
            )
        ).one()
        if frame.stage_status != invalidation.expected_frame_stage:
            raise CheckpointReservationError
        if frame.review_status != "pending":
            raise CheckpointReservationError
        target = target_by_stage[invalidation.stage]
        current = frame.stage_status
        if current != target:
            require_frame_transition(
                current,  # type: ignore[arg-type]
                target,
                recovery=True,
            )
        session.execute(delete(Annotation).where(Annotation.frame_id == frame.id))
        if invalidation.stage in {"sample", "crop"}:
            session.execute(delete(RegionSample).where(RegionSample.frame_id == frame.id))
        else:
            sample_ids = select(RegionSample.id).where(RegionSample.frame_id == frame.id)
            session.execute(delete(OcrObservation).where(OcrObservation.sample_id.in_(sample_ids)))
            for sample in session.scalars(
                select(RegionSample).where(RegionSample.frame_id == frame.id)
            ):
                sample.stage_status = "cropped"
        start = STAGES.index(invalidation.stage)
        session.execute(
            delete(StageCheckpoint).where(
                StageCheckpoint.run_id == run_id,
                StageCheckpoint.frame_index == invalidation.frame_index,
                StageCheckpoint.stage.in_(STAGES[start:]),
            )
        )
        frame.stage_status = target
        frame.review_status = "pending"
        frame.version += 1

    @staticmethod
    def _require_reservation(
        session: Session,
        reservation: ResumeReservation,
    ) -> PipelineRun:
        run = session.get(PipelineRun, reservation.run_id)
        if (
            run is None
            or run.workflow_slot != 1
            or run.resume_token != reservation.token
            or run.resume_owner != reservation.owner
            or run.version != reservation.version
            or cast(RunStatus, run.status) not in reservation.allowed_from
        ):
            raise CheckpointReservationError
        return run

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
    def from_run(
        run: PipelineRun,
        *,
        frame_index: int,
        stage: str,
        artifact: CheckpointArtifact,
    ) -> StageCheckpoint:
        return StageCheckpoint(
            run_id=run.id,
            frame_index=frame_index,
            stage=stage,
            attempt=run.attempt,
            status="completed",
            artifact_relpath=artifact.relpath,
            artifact_hash=artifact.sha256,
            error_code=None,
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

    @staticmethod
    def _sha256(path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    @staticmethod
    def _record(checkpoint: StageCheckpoint) -> CheckpointRecord:
        return CheckpointRecord(
            run_id=checkpoint.run_id,
            frame_index=checkpoint.frame_index,
            stage=checkpoint.stage,
            attempt=checkpoint.attempt,
            status=checkpoint.status,
            artifact_relpath=checkpoint.artifact_relpath,
            artifact_hash=checkpoint.artifact_hash,
            ocr_engine=checkpoint.ocr_engine,
            ocr_engine_version=checkpoint.ocr_engine_version,
            ocr_runtime_sha256=checkpoint.ocr_runtime_sha256,
            ocr_model_sha256=checkpoint.ocr_model_sha256,
            ocr_config_hash=checkpoint.ocr_config_hash,
            ocr_language=checkpoint.ocr_language,
            ocr_page_segmentation_mode=checkpoint.ocr_page_segmentation_mode,
            experimental=checkpoint.experimental,
            quality_gate=checkpoint.quality_gate,
            warning=checkpoint.warning,
        )
