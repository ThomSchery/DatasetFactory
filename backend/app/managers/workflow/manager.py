from __future__ import annotations

import threading
from concurrent.futures import Future, ThreadPoolExecutor
from functools import partial
from typing import Any

from backend.app.access.ocr import OcrEngine
from backend.app.access.ocr.tesseract import OcrProcessError
from backend.app.access.store.repositories.frames import FramePage, FrameRepository
from backend.app.access.store.repositories.runs import (
    ActiveRunError,
    RunNotFoundError,
    RunProfileNotFoundError,
    RunRecord,
    RunRepository,
    RunSourceError,
    RunVersionConflictError,
    RunVideoNotFoundError,
)
from backend.app.managers.workflow.recovery import RecoveryResult, WorkflowRecovery
from backend.app.managers.workflow.state_machine import InvalidTransitionError
from backend.app.managers.workflow.worker import WorkflowWorker

TESSERACT_QUALITY_WARNING = (
    "Eksperymentalny Tesseract nie przeszedł bramki jakości; każdy wynik OCR "
    "wymaga pełnej ręcznej weryfikacji."
)


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
        self._futures: dict[str, Future[None]] = {}
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
        if not provenance.experimental or provenance.quality_gate != "failed":
            raise WorkflowError("ocr_quality_policy_mismatch")
        return self._runs.create(
            profile_id=profile_id,
            video_id=video_id,
            interval_ms=interval_ms,
            duration_ms=context.duration_ms,
            provenance=provenance,
            warning=TESSERACT_QUALITY_WARNING,
        )

    def start(self, run_id: str, *, expected_version: int) -> RunRecord:
        unavailable = self._source_failure(run_id, expected_version)
        if unavailable is not None:
            return unavailable
        try:
            record = self._runs.activate(
                run_id,
                expected_version=expected_version,
                allowed_from=frozenset({"queued"}),
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
        unavailable = self._source_failure(run_id, expected_version)
        if unavailable is not None:
            return unavailable
        self._recovery.reconcile_run(run_id)
        try:
            record = self._runs.activate(
                run_id,
                expected_version=expected_version,
                allowed_from=frozenset({"paused", "failed", "cancelled"}),
                increment_attempt=True,
            )
        except Exception as exc:
            raise self._translate(exc) from exc
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

    def get_run(self, run_id: str) -> RunRecord:
        try:
            return self._runs.get(run_id)
        except RunNotFoundError as exc:
            raise WorkflowError("run_not_found") from exc

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
        except Exception as exc:
            from backend.app.access.store.repositories.frames import FrameNotFoundError

            if isinstance(exc, FrameNotFoundError):
                raise WorkflowError("run_not_found") from exc
            raise

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
        with self._lock:
            if self._closed:
                self._runs.fail(run_id, "worker_unavailable")
                raise WorkflowError("worker_unavailable")
            existing = self._futures.get(run_id)
            if existing is not None and not existing.done():
                return
            future = self._executor.submit(self._worker.process, run_id)
            self._futures[run_id] = future
            future.add_done_callback(partial(self._forget, run_id))

    def _forget(self, run_id: str, completed: Future[None]) -> None:
        del completed
        with self._lock:
            self._futures.pop(run_id, None)

    def _source_failure(self, run_id: str, expected_version: int) -> RunRecord | None:
        try:
            self._runs.source_snapshot(run_id)
        except RunNotFoundError as exc:
            raise WorkflowError("run_not_found") from exc
        except RunSourceError as exc:
            try:
                return self._runs.fail_before_activation(
                    run_id,
                    expected_version=expected_version,
                    error_code=exc.code,
                )
            except Exception as transition_error:
                raise self._translate(transition_error) from transition_error
        return None

    @staticmethod
    def _translate(error: Exception) -> WorkflowError:
        if isinstance(error, RunNotFoundError):
            return WorkflowError("run_not_found")
        if isinstance(error, RunVersionConflictError):
            return WorkflowError("version_conflict")
        if isinstance(error, ActiveRunError):
            return WorkflowError("active_run")
        if isinstance(error, InvalidTransitionError):
            return WorkflowError("invalid_transition")
        return WorkflowError("workflow_persistence_failed")
