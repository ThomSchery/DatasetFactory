from __future__ import annotations

from dataclasses import dataclass
from typing import ClassVar

from backend.app.access.store.repositories.checkpoints import (
    STAGES,
    CheckpointRecord,
    CheckpointRepository,
    FrameInvalidation,
    ReconciliationPlan,
)
from backend.app.access.store.repositories.runs import (
    ResumeReservation,
    RunRecord,
    RunRepository,
)


@dataclass(frozen=True)
class RecoveryResult:
    paused_runs: int
    invalidated_frames: int


class WorkflowRecovery:
    """Reconcile durable checkpoints and pause runs orphaned by process restart."""

    _REQUIRED_BY_FRAME_STAGE: ClassVar[dict[str, tuple[str, ...]]] = {
        "pending": (),
        "sampled": ("sample",),
        "cropped": ("sample", "crop"),
        "ocr_complete": ("sample", "crop", "ocr"),
        "review_pending": ("sample", "crop", "ocr"),
    }

    def __init__(self, runs: RunRepository, checkpoints: CheckpointRepository) -> None:
        self._runs = runs
        self._checkpoints = checkpoints

    def recover_startup(self) -> RecoveryResult:
        # A token belongs to an in-process request. After process restart no caller can
        # still own it, so release it before reconciling orphaned running work.
        self._runs.clear_stale_resume_reservations()
        running = self._runs.running_ids()
        invalidated = 0
        for run_id in running:
            invalidated += self.reconcile_run(run_id)
            self._runs.pause_orphan(run_id)
        return RecoveryResult(paused_runs=len(running), invalidated_frames=invalidated)

    def reconcile_run(self, run_id: str) -> int:
        plan = self.plan_reconciliation(run_id)
        self._checkpoints.apply_running_plan(run_id, plan)
        return len(plan.invalidations)

    def plan_resume(self, reservation: ResumeReservation) -> ReconciliationPlan:
        self._runs.validate_resume_reservation(reservation)
        return self.plan_reconciliation(reservation.run_id)

    def commit_resume(
        self,
        reservation: ResumeReservation,
        plan: ReconciliationPlan,
    ) -> RunRecord:
        self._checkpoints.commit_resume(reservation, plan)
        return self._runs.get(reservation.run_id)

    def plan_reconciliation(self, run_id: str) -> ReconciliationPlan:
        """Hash and validate every frame read-only, without holding a DB transaction."""
        run = self._runs.get(run_id)
        completed = {
            (checkpoint.frame_index, checkpoint.stage): checkpoint
            for checkpoint in self._checkpoints.completed_for_run(run_id)
        }
        invalidations: list[FrameInvalidation] = []
        for frame_index, frame_stage in self._checkpoints.frame_stages(run_id):
            required = self._REQUIRED_BY_FRAME_STAGE.get(frame_stage, STAGES)
            for stage in required:
                checkpoint = completed.get((frame_index, stage))
                if checkpoint is None or not self._checkpoint_is_valid(checkpoint, run):
                    invalidations.append(
                        FrameInvalidation(
                            frame_index=frame_index,
                            stage=stage,
                            expected_frame_stage=frame_stage,
                        )
                    )
                    break
        return ReconciliationPlan(run_id=run_id, invalidations=tuple(invalidations))

    def _checkpoint_is_valid(self, checkpoint: CheckpointRecord, run: RunRecord) -> bool:
        return (
            checkpoint.ocr_engine == run.ocr_engine
            and checkpoint.ocr_engine_version == run.ocr_engine_version
            and checkpoint.ocr_runtime_sha256 == run.ocr_runtime_sha256
            and checkpoint.ocr_model_sha256 == run.ocr_model_sha256
            and checkpoint.ocr_config_hash == run.ocr_config_hash
            and checkpoint.ocr_language == run.ocr_language
            and checkpoint.ocr_page_segmentation_mode == run.ocr_page_segmentation_mode
            and checkpoint.experimental == run.experimental
            and checkpoint.quality_gate == run.quality_gate
            and checkpoint.warning == run.warning
            and self._checkpoints.is_valid(checkpoint)
        )
