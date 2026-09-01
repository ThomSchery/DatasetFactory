from __future__ import annotations

import contextlib
import re
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from backend.app.access.ocr import OcrEngine, OcrProcessError
from backend.app.access.store.repositories.checkpoints import CheckpointReservationError
from backend.app.access.store.repositories.frames import (
    FrameNotFoundError,
    FramePage,
    FrameRepository,
)
from backend.app.access.store.repositories.runs import (
    ActiveRunError,
    RunCompletionPreconditionError,
    RunNotFoundError,
    RunPage,
    RunProfileNotFoundError,
    RunRecord,
    RunRepository,
    RunSourceError,
    RunVersionConflictError,
    RunVideoNotFoundError,
)
from backend.app.engines.definition import OcrProvenance
from backend.app.managers.workflow.recovery import RecoveryResult, WorkflowRecovery
from backend.app.managers.workflow.state_machine import InvalidTransitionError, RunStatus
from backend.app.managers.workflow.worker import WorkflowWorker

TESSERACT_QUALITY_WARNING = (
    "Eksperymentalny Tesseract nie przeszedł bramki jakości; każdy wynik OCR "
    "wymaga pełnej ręcznej weryfikacji."
)
FAILED_GATE_WARNING = (
    "Silnik OCR nie przeszedł bramki jakości; każdy wynik OCR wymaga pełnej ręcznej weryfikacji."
)
UNKNOWN_GATE_WARNING = (
    "Bramka jakości silnika OCR nie została zmierzona; każdy wynik OCR wymaga "
    "pełnej ręcznej weryfikacji."
)
EXPERIMENTAL_WARNING = (
    "Silnik OCR działa w trybie eksperymentalnym; każdy wynik OCR wymaga ręcznej weryfikacji."
)
QUALITY_GATES = frozenset({"passed", "failed", "unknown"})
MIN_PAGE_SEGMENTATION_MODE = 0
MAX_PAGE_SEGMENTATION_MODE = 13


def quality_warning(provenance: OcrProvenance) -> str:
    """Derive the user-facing warning from what the engine reports, never from policy.

    The workflow records and shows the quality gate (HANDOFF Gate 2); it does not
    demand a particular verdict. A clean, non-experimental engine warrants no warning.
    """
    if provenance.quality_gate == "failed":
        return (
            TESSERACT_QUALITY_WARNING
            if provenance.engine_id == "tesseract" and provenance.experimental
            else FAILED_GATE_WARNING
        )
    if provenance.quality_gate == "unknown":
        return UNKNOWN_GATE_WARNING
    return EXPERIMENTAL_WARNING if provenance.experimental else ""


class WorkflowError(RuntimeError):
    def __init__(self, code: str, *, details: dict[str, Any] | None = None) -> None:
        super().__init__(code)
        self.code = code
        self.details = details or {}


class DatasetWorkflow:
    """Expose the durable run use cases while delegating persistence and execution."""

    def __init__(
        self,
        runs: RunRepository,
        frames: FrameRepository,
        recovery: WorkflowRecovery,
        worker: WorkflowWorker,
        ocr: OcrEngine,
    ) -> None:
        self._runs = runs
        self._frames = frames
        self._recovery = recovery
        self._worker = worker
        self._ocr = ocr
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="dataset-workflow")
        self._lock = threading.Lock()
        self._closed = False

    def recover_startup(self) -> RecoveryResult:
        return self._recovery.recover_startup()

    def create_run(self, *, profile_id: str, video_id: str, interval_ms: int) -> RunRecord:
        if interval_ms <= 0:
            raise WorkflowError("invalid_interval", details={"field": "interval_ms"})
        try:
            context = self._runs.creation_context(profile_id, video_id)
        except RunProfileNotFoundError as exc:
            raise WorkflowError("profile_not_found") from exc
        except RunVideoNotFoundError as exc:
            raise WorkflowError("video_not_found") from exc
        if (context.profile_width, context.profile_height) != (
            context.video_width,
            context.video_height,
        ):
            raise WorkflowError("profile_resolution_mismatch")
        try:
            provenance = self._ocr.describe(context.allowed_chars)
        except (OcrProcessError, ValueError) as exc:
            code = exc.code if isinstance(exc, OcrProcessError) else "ocr_configuration_invalid"
            raise WorkflowError(code) from exc
        self._require_complete_provenance(provenance)
        return self._runs.create(
            profile_id=profile_id,
            video_id=video_id,
            interval_ms=interval_ms,
            duration_ms=context.duration_ms,
            provenance=provenance,
            warning=quality_warning(provenance),
        )

    def start(self, run_id: str, *, expected_version: int) -> RunRecord:
        allowed_from: frozenset[RunStatus] = frozenset({"queued"})
        self._require_activation_allowed(run_id, expected_version, allowed_from)
        self._require_available_source(run_id, expected_version)
        try:
            record = self._runs.activate(
                run_id,
                expected_version=expected_version,
                allowed_from=allowed_from,
                increment_attempt=False,
            )
        except Exception as exc:
            raise self._translate(exc) from exc
        self._submit(run_id)
        return record

    def pause(self, run_id: str, *, expected_version: int) -> RunRecord:
        try:
            return self._runs.request_pause(run_id, expected_version=expected_version)
        except Exception as exc:
            raise self._translate(exc) from exc

    def resume(self, run_id: str, *, expected_version: int) -> RunRecord:
        # Order matters: transition, then version, then source, and only then the
        # reconciliation, which deletes dependent drafts and must never touch a live run.
        allowed_from: frozenset[RunStatus] = frozenset({"paused", "failed", "cancelled"})
        self._require_activation_allowed(run_id, expected_version, allowed_from)
        reservation = None
        try:
            reservation = self._runs.reserve_resume(
                run_id,
                expected_version=expected_version,
                allowed_from=allowed_from,
            )
            # The global slot is acquired before any source/checkpoint verification.
            # These operations are read-only and run without a database transaction.
            self._runs.source_snapshot(run_id)
            plan = self._recovery.plan_resume(reservation)
            record = self._recovery.commit_resume(reservation, plan)
        except Exception as exc:
            translated = self._translate(exc)
            if reservation is not None:
                # A cleanup persistence failure must not replace the controlled
                # error that caused this resume attempt to fail. The reservation
                # remains recoverable by the existing startup owner rules.
                with contextlib.suppress(Exception):
                    self._runs.fail_reserved_resume(reservation, translated.code)
            raise translated from exc
        self._submit(run_id)
        return record

    def cancel(self, run_id: str, *, expected_version: int) -> RunRecord:
        try:
            record = self._runs.request_cancel(run_id, expected_version=expected_version)
        except Exception as exc:
            raise self._translate(exc) from exc
        if record.status == "running":
            self._worker.cancel_current()
        return record

    def complete(self, run_id: str, *, expected_version: int) -> RunRecord:
        record = self.get_run(run_id)
        if record.status != "review_ready":
            raise WorkflowError("invalid_transition")
        if record.version != expected_version:
            raise WorkflowError("version_conflict")
        try:
            return self._runs.complete(run_id, expected_version=expected_version)
        except Exception as exc:
            raise self._translate(exc) from exc

    def get_run(self, run_id: str) -> RunRecord:
        try:
            return self._runs.get(run_id)
        except RunNotFoundError as exc:
            raise WorkflowError("run_not_found") from exc

    def list_runs(self, *, page: int, page_size: int) -> RunPage:
        if page < 1 or not 1 <= page_size <= 100:
            raise WorkflowError("invalid_pagination")
        return self._runs.list(page=page, page_size=page_size)

    def list_frames(
        self,
        run_id: str,
        *,
        review_status: str | None,
        page: int,
        page_size: int,
    ) -> FramePage:
        if page < 1 or not 1 <= page_size <= 100:
            raise WorkflowError("invalid_pagination")
        if review_status not in {None, "pending", "accepted", "rejected"}:
            raise WorkflowError("invalid_review_status")
        try:
            return self._frames.list(
                run_id,
                review_status=review_status,  # type: ignore[arg-type]
                page=page,
                page_size=page_size,
            )
        except FrameNotFoundError as exc:
            raise WorkflowError("run_not_found") from exc

    def shutdown(self) -> None:
        with self._lock:
            if self._closed:
                return
            self._closed = True
        active_id = self._runs.request_shutdown_pause()
        self._executor.shutdown(wait=True, cancel_futures=False)
        if active_id is not None and self._runs.control_requested(active_id) is not None:
            self._runs.acknowledge_control(active_id)

    def _submit(self, run_id: str) -> None:
        # Every accepted activation submits. `activate()` already guarantees a single
        # `running` row, `process()` is idempotent because it starts from
        # `reconcile_run`, and the single-worker executor serialises the jobs. Gating on
        # a still-draining predecessor would leave the run `running` with no worker: the
        # worker commits `paused`/`cancelled`/`failed` before its future is marked done.
        with self._lock:
            if self._closed:
                self._runs.fail(run_id, "worker_unavailable")
                raise WorkflowError("worker_unavailable")
            self._executor.submit(self._worker.process, run_id)

    def _require_activation_allowed(
        self,
        run_id: str,
        expected_version: int,
        allowed_from: frozenset[RunStatus],
    ) -> None:
        """Reject the request before any state-changing step. `activate` re-checks
        both conditions atomically, so this guard only decides what runs at all."""
        record = self.get_run(run_id)
        if record.resume_token is not None:
            raise WorkflowError("version_conflict")
        if record.status not in allowed_from:
            raise WorkflowError("invalid_transition")
        if record.version != expected_version:
            raise WorkflowError("version_conflict")

    def _require_available_source(self, run_id: str, expected_version: int) -> None:
        try:
            self._runs.source_snapshot(run_id)
        except RunNotFoundError as exc:
            raise WorkflowError("run_not_found") from exc
        except RunSourceError as exc:
            # The controlled failure is durable, but the caller gets an error envelope:
            # 202 belongs to a run that actually started (TECH_PLAN §5).
            try:
                self._runs.fail_before_activation(
                    run_id,
                    expected_version=expected_version,
                    error_code=exc.code,
                )
            except Exception as transition_error:
                raise self._translate(transition_error) from transition_error
            raise WorkflowError(exc.code) from exc

    @staticmethod
    def _require_complete_provenance(provenance: OcrProvenance) -> None:
        if type(provenance) is not OcrProvenance:
            raise WorkflowError(
                "ocr_provenance_incomplete",
                details={"fields": ["provenance"]},
            )

        fields = (
            "engine_id",
            "engine_version",
            "runtime_sha256",
            "model_sha256",
            "config_hash",
            "experimental",
            "quality_gate",
            "language",
            "page_segmentation_mode",
        )
        try:
            values = {field: getattr(provenance, field) for field in fields}
        except Exception as exc:
            raise WorkflowError(
                "ocr_provenance_incomplete",
                details={"fields": ["provenance"]},
            ) from exc

        invalid = []
        for field in ("engine_id", "engine_version", "language"):
            value = values[field]
            if type(value) is not str or not value.strip():
                invalid.append(field)
        for field in ("runtime_sha256", "model_sha256", "config_hash"):
            value = values[field]
            if type(value) is not str or re.fullmatch(r"[0-9a-f]{64}", value) is None:
                invalid.append(field)
        quality_gate = values["quality_gate"]
        if type(quality_gate) is not str or quality_gate not in QUALITY_GATES:
            invalid.append("quality_gate")
        if type(values["experimental"]) is not bool:
            invalid.append("experimental")
        psm = values["page_segmentation_mode"]
        if (
            type(psm) is not int
            or psm < MIN_PAGE_SEGMENTATION_MODE
            or psm > MAX_PAGE_SEGMENTATION_MODE
        ):
            invalid.append("page_segmentation_mode")
        if invalid:
            raise WorkflowError("ocr_provenance_incomplete", details={"fields": invalid})

    @staticmethod
    def _translate(error: Exception) -> WorkflowError:
        if isinstance(error, RunNotFoundError):
            return WorkflowError("run_not_found")
        if isinstance(error, RunVersionConflictError):
            return WorkflowError("version_conflict")
        if isinstance(error, RunSourceError):
            return WorkflowError(error.code)
        if isinstance(error, CheckpointReservationError):
            return WorkflowError("version_conflict")
        if isinstance(error, ActiveRunError):
            return WorkflowError("active_run")
        if isinstance(error, RunCompletionPreconditionError):
            return WorkflowError("invalid_transition")
        if isinstance(error, InvalidTransitionError):
            return WorkflowError("invalid_transition")
        return WorkflowError("workflow_persistence_failed")
