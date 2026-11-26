from __future__ import annotations

import contextlib
import re
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from backend.app.access.ocr import OcrEngine, OcrProcessError
from backend.app.access.store.ocr_regions import RegionOcrSnapshot
from backend.app.access.store.repositories.checkpoints import CheckpointReservationError
from backend.app.access.store.repositories.frames import (
    FrameNotFoundError,
    FramePage,
    FrameRepository,
)
from backend.app.access.store.repositories.runs import (
    ActiveRunError,
    RegionOcrDraft,
    RunCompletionPreconditionError,
    RunExportRunningError,
    RunInProgressError,
    RunNotFoundError,
    RunPage,
    RunProfileChangedError,
    RunProfileNotFoundError,
    RunRecord,
    RunRepository,
    RunSourceError,
    RunVersionConflictError,
    RunVideoNotFoundError,
)
from backend.app.access.store.run_artifacts import RunArtifacts
from backend.app.engines.definition import DEFAULT_OCR_TEXT_LAYOUT, OcrProvenance
from backend.app.engines.runstate import InvalidTransitionError, RunStatus
from backend.app.managers.workflow.recovery import RecoveryResult, WorkflowRecovery
from backend.app.managers.workflow.worker import WorkflowWorker

FAILED_GATE_WARNING = (
    "{engine} nie przeszedł bramki jakości; każdy wynik OCR wymaga pełnej ręcznej weryfikacji."
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
        # Named by what the engine reports about itself — the workflow knows no engine.
        label = "Eksperymentalny silnik OCR" if provenance.experimental else "Silnik OCR"
        return FAILED_GATE_WARNING.format(engine=f"{label} ({provenance.engine_id})")
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
        artifacts: RunArtifacts,
    ) -> None:
        self._runs = runs
        self._frames = frames
        self._recovery = recovery
        self._worker = worker
        self._ocr = ocr
        self._artifacts = artifacts
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="dataset-workflow")
        self._lock = threading.Lock()
        self._closed = False
        # Runs whose worker job is executing right now. The database already refuses to
        # delete a `running` run; this also covers the moment after the worker commits
        # `paused`/`cancelled`/`failed` and before its job has returned. Its own lock:
        # `_submit` holds `_lock` while an executor may run the job inline.
        self._processing: set[str] = set()
        self._processing_lock = threading.Lock()

    def recover_startup(self) -> RecoveryResult:
        return self._recovery.recover_startup()

    def create_run(self, *, profile_id: str, video_id: str, interval_ms: int) -> RunRecord:
        if interval_ms <= 0:
            raise WorkflowError("invalid_interval", details={"field": "interval_ms"})
        for _ in range(3):
            record = self._try_create_run(
                profile_id=profile_id, video_id=video_id, interval_ms=interval_ms
            )
            if record is not None:
                return record
        raise WorkflowError("profile_changed_during_run_creation")

    def _try_create_run(
        self, *, profile_id: str, video_id: str, interval_ms: int
    ) -> RunRecord | None:
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
        try:
            region_snapshots = tuple(
                self._region_ocr_snapshot(region, context.allowed_chars, provenance)
                for region in context.regions
            )
        except (OcrProcessError, ValueError) as exc:
            code = exc.code if isinstance(exc, OcrProcessError) else "ocr_configuration_invalid"
            raise WorkflowError(code) from exc
        try:
            return self._runs.create(
                profile_id=profile_id,
                video_id=video_id,
                interval_ms=interval_ms,
                duration_ms=context.duration_ms,
                provenance=provenance,
                region_ocr_snapshots=region_snapshots,
                expected_profile_version=context.profile_version,
                warning=quality_warning(provenance),
            )
        except RunProfileChangedError:
            return None

    def _region_ocr_snapshot(
        self,
        region: RegionOcrDraft,
        profile_allowed_chars: tuple[str, ...],
        fallback_provenance: OcrProvenance,
    ) -> RegionOcrSnapshot:
        if (region.allowed_chars is None) != (region.text_layout is None):
            raise ValueError("incomplete region OCR configuration")
        allowed_chars = region.allowed_chars or profile_allowed_chars
        provenance = (
            fallback_provenance
            if region.allowed_chars is None
            else self._ocr.describe(allowed_chars, region.text_layout)
        )
        self._require_complete_provenance(provenance)
        return RegionOcrSnapshot(
            region_id=region.region_id,
            region_name=region.region_name,
            bbox=region.bbox,
            allowed_chars=allowed_chars,
            text_layout=region.text_layout or DEFAULT_OCR_TEXT_LAYOUT,
            provenance=provenance,
            uses_profile_fallback=region.allowed_chars is None,
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

    def delete_run(self, run_id: str, *, expected_version: int) -> None:
        """Delete an idle run, everything derived from it, and its files."""
        with self._processing_lock:
            if run_id in self._processing:
                raise WorkflowError("run_in_progress")
        try:
            export_ids = self._runs.delete(run_id, expected_version=expected_version)
        except Exception as exc:
            raise self._translate(exc) from exc
        # The rows are gone, so the run is deleted even if a file is still held open;
        # `remove` logs what it left and the startup sweep finishes the job.
        self._artifacts.remove(run_id, export_ids)

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
            self._executor.submit(self._process, run_id)

    def _process(self, run_id: str) -> None:
        with self._processing_lock:
            self._processing.add(run_id)
        try:
            self._worker.process(run_id)
        finally:
            with self._processing_lock:
                self._processing.discard(run_id)

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
        if isinstance(error, RunInProgressError):
            return WorkflowError("run_in_progress")
        if isinstance(error, RunExportRunningError):
            return WorkflowError("export_running")
        if isinstance(error, RunCompletionPreconditionError):
            return WorkflowError("invalid_transition")
        if isinstance(error, InvalidTransitionError):
            return WorkflowError("invalid_transition")
        return WorkflowError("workflow_persistence_failed")
