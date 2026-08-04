"""Control-plane contract regressions found by the cold review of TK-004."""

from __future__ import annotations

import dataclasses
import threading
import time
from collections.abc import Callable
from concurrent.futures import Future
from pathlib import Path
from typing import Any, cast

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import CheckConstraint, Table, create_engine, func, inspect, select, text
from sqlalchemy.orm import Session

from backend.app.access.store.database import Database
from backend.app.access.store.models import (
    Frame,
    OcrObservation,
    PipelineRun,
    RegionSample,
    StageCheckpoint,
    VideoAsset,
)
from backend.app.access.store.repositories.checkpoints import (
    CheckpointRepository,
    FrameInvalidation,
    ReconciliationPlan,
)
from backend.app.access.store.repositories.frames import FrameRepository
from backend.app.access.store.repositories.runs import (
    ResumeReservation,
    RunRecord,
    RunRepository,
)
from backend.app.access.store.workspace import Workspace
from backend.app.composition import CompositionRoot
from backend.app.engines.definition import DatasetDefinitionEngine, OcrProvenance
from backend.app.main import create_app
from backend.app.managers.workflow.manager import DatasetWorkflow, WorkflowError
from backend.app.managers.workflow.recovery import WorkflowRecovery
from backend.app.managers.workflow.state_machine import RunStatus
from backend.app.managers.workflow.worker import WorkflowWorker
from backend.tests.test_durable_workflow import (
    StubMediaAccess,
    StubOcrEngine,
    _create_run,
    _seed,
    _wait_status,
)


class SlowAcknowledgeRunRepository(RunRepository):
    """Widen the real window between the durable status commit and worker exit.

    The worker commits ``paused``/``cancelled`` inside ``acknowledge_control`` and
    only afterwards unwinds far enough for the executor to mark its future done.
    The delay makes that existing window observable instead of racing it.
    """

    def __init__(self, database: Database, delay_seconds: float) -> None:
        super().__init__(database)
        self._delay_seconds = delay_seconds

    def acknowledge_control(self, run_id: str) -> RunRecord:
        record = super().acknowledge_control(run_id)
        time.sleep(self._delay_seconds)
        return record


class InlineExecutor:
    """Hand back an already-finished future, like a job that ended before submit returned."""

    def submit(self, function: Callable[..., None], *arguments: Any) -> Future[None]:
        future: Future[None] = Future()
        try:
            function(*arguments)
        except BaseException as error:  # mirror ThreadPoolExecutor semantics
            future.set_exception(error)
        else:
            future.set_result(None)
        return future

    def shutdown(self, wait: bool = True, cancel_futures: bool = False) -> None:
        del wait, cancel_futures


class ParkedExecutor:
    """Accept work without running it so race assertions observe the active run."""

    def submit(self, function: Callable[..., None], *arguments: Any) -> Future[None]:
        del function, arguments
        return Future()

    def shutdown(self, wait: bool = True, cancel_futures: bool = False) -> None:
        del wait, cancel_futures


class ResumeRaceRunRepository(RunRepository):
    """Place both requests beyond the read-only source check before activation."""

    def __init__(
        self,
        database: Database,
        source_checked: threading.Barrier,
        winner_activated: threading.Event,
    ) -> None:
        super().__init__(database)
        self._source_checked = source_checked
        self._winner_activated = winner_activated

    def reserve_resume(
        self,
        run_id: str,
        *,
        expected_version: int,
        allowed_from: frozenset[RunStatus],
    ) -> ResumeReservation:
        self._source_checked.wait(timeout=5)
        return super().reserve_resume(
            run_id,
            expected_version=expected_version,
            allowed_from=allowed_from,
        )


class ResumeRaceRecovery(WorkflowRecovery):
    """Expose a destructive late reconcile after the winner becomes active."""

    def __init__(
        self,
        runs: RunRepository,
        checkpoints: CheckpointRepository,
        database: Database,
        winner_activated: threading.Event,
    ) -> None:
        super().__init__(runs, checkpoints)
        self._database = database
        self._winner_activated = winner_activated
        self._calls_lock = threading.Lock()
        self._calls = 0
        self.loser_reconciled = threading.Event()

    def plan_resume(
        self,
        reservation: ResumeReservation,
    ) -> ReconciliationPlan:
        with self._calls_lock:
            self._calls += 1
            late_reconcile = self._calls > 1
        if late_reconcile:
            self.loser_reconciled.set()
        return super().plan_resume(reservation)

    def commit_resume(
        self,
        reservation: ResumeReservation,
        plan: ReconciliationPlan,
    ) -> RunRecord:
        record = super().commit_resume(reservation, plan)
        self._winner_activated.set()
        return record


class BlockingReservationRunRepository(RunRepository):
    """Hold the owner after durable reservation but before reconciliation."""

    def __init__(self, database: Database) -> None:
        super().__init__(database)
        self.reserved = threading.Event()
        self.release = threading.Event()

    def reserve_resume(
        self,
        run_id: str,
        *,
        expected_version: int,
        allowed_from: frozenset[RunStatus],
    ) -> Any:
        reservation = super().reserve_resume(
            run_id,
            expected_version=expected_version,
            allowed_from=allowed_from,
        )
        self.reserved.set()
        assert self.release.wait(5), "test did not release the reserved resume"
        return reservation


class SourceBarrierRunRepository(RunRepository):
    """Release a fixed set of resume requests after every source check completed."""

    def __init__(self, database: Database, source_checked: threading.Barrier) -> None:
        super().__init__(database)
        self._source_checked = source_checked

    def reserve_resume(
        self,
        run_id: str,
        *,
        expected_version: int,
        allowed_from: frozenset[RunStatus],
    ) -> ResumeReservation:
        self._source_checked.wait(timeout=5)
        return super().reserve_resume(
            run_id,
            expected_version=expected_version,
            allowed_from=allowed_from,
        )


class FailAfterFirstInvalidationCheckpointRepository(CheckpointRepository):
    """Inject a failure after the first frame mutation, inside either implementation."""

    def __init__(self, database: Database, workspace: Workspace) -> None:
        super().__init__(database, workspace)
        self._applied = 0

    def _fail_after_first(self) -> None:
        self._applied += 1
        if self._applied == 1:
            raise RuntimeError("injected failure after first frame invalidation")

    def _apply_invalidation(
        self,
        session: Session,
        run_id: str,
        invalidation: FrameInvalidation,
    ) -> None:
        super()._apply_invalidation(session, run_id, invalidation)
        self._fail_after_first()


class BlockingAtomicPlanCheckpointRepository(CheckpointRepository):
    """Expose the uncommitted plan so a second connection can observe the old state."""

    def __init__(self, database: Database, workspace: Workspace) -> None:
        super().__init__(database, workspace)
        self.plan_applied = threading.Event()
        self.release_commit = threading.Event()

    def _apply_plan(self, session: Session, plan: ReconciliationPlan) -> None:
        super()._apply_plan(session, plan)
        self.plan_applied.set()
        assert self.release_commit.wait(5), "test did not release atomic plan commit"


class ExplodingHashCheckpointRepository(CheckpointRepository):
    def is_valid(self, checkpoint: Any) -> bool:
        del checkpoint
        raise RuntimeError("injected artifact hashing failure")


class FailAfterPlanningRecovery(WorkflowRecovery):
    def plan_resume(self, reservation: ResumeReservation) -> ReconciliationPlan:
        super().plan_resume(reservation)
        raise RuntimeError("injected failure after read-only reconciliation plan")


def _install(
    composition: CompositionRoot,
    media: StubMediaAccess,
    ocr: StubOcrEngine,
    *,
    runs: RunRepository | None = None,
    heartbeat_interval_seconds: float = 0.05,
    shutdown_previous: bool = True,
) -> tuple[DatasetWorkflow, RunRepository]:
    if shutdown_previous:
        composition.dataset_workflow.shutdown()
    run_repository = runs or RunRepository(composition.database)
    frames = FrameRepository(composition.database)
    checkpoints = CheckpointRepository(composition.database, composition.workspace)
    recovery = WorkflowRecovery(run_repository, checkpoints)
    worker = WorkflowWorker(
        run_repository,
        frames,
        checkpoints,
        recovery,
        media,
        ocr,
        DatasetDefinitionEngine(),
        composition.logger,
        heartbeat_interval_seconds=heartbeat_interval_seconds,
    )
    workflow = DatasetWorkflow(run_repository, frames, recovery, worker, ocr)
    composition.dataset_workflow = workflow
    return workflow, run_repository


def _build_workflow(
    composition: CompositionRoot,
    runs: RunRepository,
    *,
    recovery: WorkflowRecovery | None = None,
    checkpoints: CheckpointRepository | None = None,
) -> DatasetWorkflow:
    frames = FrameRepository(composition.database)
    effective_checkpoints = checkpoints or CheckpointRepository(
        composition.database, composition.workspace
    )
    effective_recovery = recovery or WorkflowRecovery(runs, effective_checkpoints)
    ocr = StubOcrEngine()
    worker = WorkflowWorker(
        runs,
        frames,
        effective_checkpoints,
        effective_recovery,
        StubMediaAccess(composition),
        ocr,
        DatasetDefinitionEngine(),
        composition.logger,
        heartbeat_interval_seconds=0.05,
    )
    workflow = DatasetWorkflow(runs, frames, effective_recovery, worker, ocr)
    workflow._executor.shutdown(wait=True)
    workflow._executor = ParkedExecutor()  # type: ignore[assignment]
    return workflow


def _prepare_failed_completed_run(
    composition: CompositionRoot,
    tmp_path: Path,
    *,
    corrupt_ocr_checkpoint: bool,
    duration_ms: int = 1000,
    inactive_status: str = "failed",
) -> tuple[dict[str, Any], RunRecord]:
    seeded = _seed(composition, tmp_path, duration_ms=duration_ms)
    _install(composition, StubMediaAccess(composition), StubOcrEngine())
    app = create_app(composition.settings, composition=composition)
    with TestClient(app) as client:
        created = _create_run(client, seeded)
        assert _start(client, created).status_code == 202
        _wait_status(client, created["id"], "review_ready")
    with composition.database.session() as session:
        run = session.get(PipelineRun, created["id"])
        assert run is not None
        run.status = inactive_status
        run.error_code = "seeded_retryable_failure"
        run.current_stage = None
        run.current_frame_index = None
        run.version += 1
        if corrupt_ocr_checkpoint:
            checkpoints = tuple(
                session.scalars(
                    select(StageCheckpoint).where(
                        StageCheckpoint.run_id == created["id"],
                        StageCheckpoint.stage == "ocr",
                    )
                )
            )
            assert checkpoints
            for checkpoint in checkpoints:
                checkpoint.artifact_hash = "0" * 64
    failed = composition.dataset_workflow.get_run(created["id"])
    assert failed.status == inactive_status
    return created, failed


def _durable_frame_state(
    composition: CompositionRoot,
    run_id: str,
) -> tuple[str, int, bool]:
    with composition.database.session() as session:
        frame = session.scalar(select(Frame).where(Frame.run_id == run_id, Frame.frame_index == 0))
        assert frame is not None
        observations = session.scalar(select(func.count(OcrObservation.id)))
        checkpoint = session.get(StageCheckpoint, (run_id, 0, "ocr"))
        return frame.stage_status, int(observations or 0), checkpoint is not None


def _run_durable_state(
    composition: CompositionRoot,
    run_id: str,
) -> tuple[tuple[str, ...], int, tuple[int, ...]]:
    with composition.database.session() as session:
        stages = tuple(
            session.scalars(
                select(Frame.stage_status).where(Frame.run_id == run_id).order_by(Frame.frame_index)
            )
        )
        observations = int(
            session.scalar(
                select(func.count(OcrObservation.id))
                .join(RegionSample, RegionSample.id == OcrObservation.sample_id)
                .join(Frame, Frame.id == RegionSample.frame_id)
                .where(Frame.run_id == run_id)
            )
            or 0
        )
        ocr_checkpoints = tuple(
            session.scalars(
                select(StageCheckpoint.frame_index)
                .where(
                    StageCheckpoint.run_id == run_id,
                    StageCheckpoint.stage == "ocr",
                )
                .order_by(StageCheckpoint.frame_index)
            )
        )
        return stages, observations, ocr_checkpoints


def _assert_resume_reservation_cleared(
    composition: CompositionRoot,
    run_id: str,
) -> None:
    with composition.database.session() as session:
        run = session.get(PipelineRun, run_id)
        assert run is not None
        assert (run.workflow_slot, run.resume_token, run.resume_owner) == (None, None, None)


def _start(client: TestClient, run: dict[str, Any]) -> Any:
    return client.post(
        f"/api/v1/runs/{run['id']}/start",
        json={"expected_version": run["version"]},
    )


def test_resume_inside_the_worker_exit_window_still_schedules_the_worker(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    """F1: a resume accepted while the previous worker future is still alive must run."""
    seeded = _seed(composition, tmp_path)
    media = StubMediaAccess(composition, block_sample=True)
    _install(
        composition,
        media,
        StubOcrEngine(),
        runs=SlowAcknowledgeRunRepository(composition.database, 1.0),
    )
    app = create_app(composition.settings, composition=composition)

    with TestClient(app) as client:
        created = _create_run(client, seeded)
        assert _start(client, created).status_code == 202
        assert media.sample_started.wait(2)

        current = client.get(f"/api/v1/runs/{created['id']}").json()
        pause = client.post(
            f"/api/v1/runs/{created['id']}/pause",
            json={"expected_version": current["version"]},
        )
        assert pause.status_code == 202, pause.text
        media.release_sample.set()
        media.block_sample = False
        paused = _wait_status(client, created["id"], "paused")

        resumed = client.post(
            f"/api/v1/runs/{created['id']}/resume",
            json={"expected_version": paused["version"]},
        )
        assert resumed.status_code == 202, resumed.text
        _wait_status(client, created["id"], "review_ready", timeout_seconds=10)

        # The single active slot must be free for the next run.
        following = _create_run(client, seeded)
        assert _start(client, following).status_code == 202
        _wait_status(client, following["id"], "review_ready", timeout_seconds=10)


def test_submitting_an_already_finished_job_does_not_deadlock_the_caller(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    """F1b: future bookkeeping must never re-enter the manager lock on the calling thread."""
    seeded = _seed(composition, tmp_path)
    workflow, runs = _install(composition, StubMediaAccess(composition), StubOcrEngine())
    workflow._executor = InlineExecutor()  # type: ignore[assignment]
    record = workflow.create_run(
        profile_id=seeded.profile_id,
        video_id=seeded.video_id,
        interval_ms=1000,
    )
    runs.activate(
        record.id,
        expected_version=record.version,
        allowed_from=frozenset({"queued"}),
        increment_attempt=False,
    )
    finished = threading.Event()

    def submit_twice() -> None:
        workflow._submit(record.id)
        workflow._submit(record.id)
        finished.set()

    caller = threading.Thread(target=submit_twice, daemon=True)
    caller.start()
    try:
        deadlocked = not finished.wait(5)
    finally:
        # A deadlocked caller keeps the manager lock forever, so shutdown would block
        # too. Hand the fixture a fresh workflow instead of closing the poisoned one.
        _install(
            composition,
            StubMediaAccess(composition),
            StubOcrEngine(),
            shutdown_previous=False,
        )
    assert not deadlocked, "submitting an already finished job deadlocked the calling thread"
    caller.join(timeout=1)


def test_worker_progress_does_not_invalidate_the_version_held_by_a_poller(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    """F2: control endpoints carry user intent, so worker progress must not bump version."""
    seeded = _seed(composition, tmp_path, duration_ms=60_000)
    media = StubMediaAccess(composition, sample_delay_seconds=0.02)
    _install(composition, media, StubOcrEngine())
    app = create_app(composition.settings, composition=composition)

    with TestClient(app) as client:
        created = _create_run(client, seeded)
        assert created["total_frames"] == 60
        assert _start(client, created).status_code == 202
        assert media.sample_started.wait(2)

        # The UI polls every two seconds (CONTEXT FE-03), so the version a client holds
        # is always older than the worker's progress.
        polled = client.get(f"/api/v1/runs/{created['id']}").json()
        assert polled["status"] == "running"
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            moving = client.get(f"/api/v1/runs/{created['id']}").json()
            if moving["completed_frames"] > polled["completed_frames"]:
                break
            time.sleep(0.01)
        else:
            raise AssertionError("progress never advanced; the run was frozen, not polled")

        paused = client.post(
            f"/api/v1/runs/{created['id']}/pause",
            json={"expected_version": polled["version"]},
        )
        assert paused.status_code == 202, paused.text
        stopped = _wait_status(client, created["id"], "paused")
        assert 0 < stopped["completed_frames"] < stopped["total_frames"]


PASSING_PROVENANCE = OcrProvenance(
    engine_id="future-char-detector",
    engine_version="v1.0.0",
    runtime_sha256="a" * 64,
    model_sha256="b" * 64,
    config_hash="c" * 64,
    experimental=False,
    quality_gate="passed",
    language="eng",
    page_segmentation_mode=7,
)


class UnhashableStr(str):
    __hash__ = None  # type: ignore[assignment]


class ExplodingHashStr(str):
    def __hash__(self) -> int:
        raise TypeError("hostile provenance hash")


class ExplodingStripStr(str):
    def strip(self, chars: str | None = None) -> str:
        del chars
        raise RuntimeError("hostile provenance strip")


def test_create_run_propagates_a_passing_quality_gate_instead_of_requiring_failure(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    """F3: HANDOFF says the workflow records and shows the gate, not that it demands FAIL."""
    seeded = _seed(composition, tmp_path)
    _install(
        composition, StubMediaAccess(composition), StubOcrEngine(provenance=PASSING_PROVENANCE)
    )
    app = create_app(composition.settings, composition=composition)

    with TestClient(app) as client:
        created = _create_run(client, seeded)
        assert created["ocr_engine"] == "future-char-detector"
        assert created["experimental"] is False
        assert created["quality_gate"] == "passed"
        assert created["warning"] == ""
        assert _start(client, created).status_code == 202
        finished = _wait_status(client, created["id"], "review_ready")
        assert finished["quality_gate"] == "passed"
        assert finished["experimental"] is False

        frames = client.get(f"/api/v1/runs/{created['id']}/frames").json()
        assert frames["items"][0]["quality_gate"] == "passed"
        assert frames["items"][0]["experimental"] is False
        assert frames["items"][0]["warning"] == ""

    with composition.database.session() as session:
        checkpoints = tuple(
            session.scalars(select(StageCheckpoint).where(StageCheckpoint.run_id == created["id"]))
        )
        observations = tuple(session.scalars(select(OcrObservation)))
        assert len(checkpoints) == 3
        assert all(item.quality_gate == "passed" for item in checkpoints)
        assert all(item.experimental is False for item in checkpoints)
        assert observations
        assert all(item.quality_gate == "passed" for item in observations)
        assert all(item.experimental is False for item in observations)


def test_worker_does_not_call_expensive_describe_again_for_each_frame(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    """Final review 3: describe measures create-run provenance exactly once."""
    seeded = _seed(composition, tmp_path)
    ocr = StubOcrEngine()
    _install(composition, StubMediaAccess(composition), ocr)
    app = create_app(composition.settings, composition=composition)

    with TestClient(app) as client:
        created = _create_run(client, seeded)
        assert ocr.describe_calls == 1
        assert _start(client, created).status_code == 202
        _wait_status(client, created["id"], "review_ready")

    assert ocr.detect_calls == 1
    assert ocr.describe_calls == 1, "worker repeated create-run provenance measurement"


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("runtime_sha256", ""),
        ("model_sha256", "   "),
        ("engine_version", ""),
        ("config_hash", ""),
        ("engine_id", ""),
        ("language", ""),
    ],
)
def test_create_run_rejects_provenance_that_cannot_be_trusted(
    composition: CompositionRoot,
    tmp_path: Path,
    field: str,
    value: str,
) -> None:
    """F3: completeness of the provenance is what must be enforced, not a chosen verdict."""
    seeded = _seed(composition, tmp_path)
    incomplete = dataclasses.replace(PASSING_PROVENANCE, **{field: value})  # type: ignore[arg-type]
    _install(composition, StubMediaAccess(composition), StubOcrEngine(provenance=incomplete))
    app = create_app(composition.settings, composition=composition)

    with TestClient(app) as client:
        response = client.post(
            "/api/v1/runs",
            json={
                "profile_id": seeded.profile_id,
                "video_id": seeded.video_id,
                "interval_ms": 1000,
            },
        )
    assert response.status_code == 400, response.text
    assert response.json()["error"]["code"] == "ocr_provenance_incomplete"


@pytest.mark.parametrize(
    ("field", "value"),
    [
        pytest.param("engine_id", None, id="none-text"),
        pytest.param("engine_version", "   ", id="whitespace-text"),
        pytest.param("runtime_sha256", "g" * 64, id="non-hex-runtime-hash"),
        pytest.param("runtime_sha256", "A" * 64, id="uppercase-runtime-hash"),
        pytest.param("runtime_sha256", "a" * 63, id="short-runtime-hash"),
        pytest.param("model_sha256", None, id="none-model-hash"),
        pytest.param("config_hash", 7, id="non-string-config-hash"),
        pytest.param("config_hash", "not-a-sha256", id="invalid-config-hash"),
        pytest.param("config_hash", "C" * 64, id="uppercase-config-hash"),
        pytest.param("language", b"eng", id="non-string-language"),
        pytest.param("engine_id", ExplodingStripStr("engine"), id="hostile-strip-subclass"),
        pytest.param(
            "runtime_sha256",
            ExplodingStripStr("a" * 64),
            id="runtime-hash-str-subclass",
        ),
        pytest.param("quality_gate", "green", id="unknown-quality-gate"),
        pytest.param("quality_gate", ["passed"], id="unhashable-quality-gate"),
        pytest.param(
            "quality_gate",
            UnhashableStr("passed"),
            id="unhashable-str-quality-gate",
        ),
        pytest.param(
            "quality_gate",
            ExplodingHashStr("passed"),
            id="hostile-hash-quality-gate",
        ),
        pytest.param("experimental", 1, id="non-bool-experimental"),
        pytest.param("page_segmentation_mode", True, id="bool-psm"),
        pytest.param("page_segmentation_mode", "7", id="string-psm"),
        pytest.param("page_segmentation_mode", -1, id="negative-psm"),
        pytest.param("page_segmentation_mode", 14, id="psm-above-tesseract-range"),
    ],
)
def test_create_run_rejects_invalid_runtime_provenance_without_persistence(
    composition: CompositionRoot,
    tmp_path: Path,
    field: str,
    value: object,
) -> None:
    """Final review 2: the untrusted engine boundary is typed and fail-closed."""
    seeded = _seed(composition, tmp_path)
    invalid = dataclasses.replace(
        PASSING_PROVENANCE,
        **{field: value},  # type: ignore[arg-type]
    )
    _install(composition, StubMediaAccess(composition), StubOcrEngine(provenance=invalid))
    app = create_app(composition.settings, composition=composition)

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post(
            "/api/v1/runs",
            json={
                "profile_id": seeded.profile_id,
                "video_id": seeded.video_id,
                "interval_ms": 1000,
            },
        )

    assert response.status_code == 400, response.text
    assert response.json()["error"]["code"] == "ocr_provenance_incomplete"
    assert field in response.json()["error"]["details"]["fields"]
    with composition.database.session() as session:
        assert session.scalar(select(func.count(PipelineRun.id))) == 0


@pytest.mark.parametrize(
    "hostile",
    [
        pytest.param(object(), id="plain-object"),
        pytest.param({"quality_gate": "passed"}, id="mapping"),
        pytest.param(object.__new__(OcrProvenance), id="exact-provenance-missing-attributes"),
    ],
)
def test_create_run_rejects_non_provenance_objects_without_attribute_access(
    composition: CompositionRoot,
    tmp_path: Path,
    hostile: object,
) -> None:
    seeded = _seed(composition, tmp_path)
    ocr = StubOcrEngine(provenance=cast(OcrProvenance, hostile))
    _install(composition, StubMediaAccess(composition), ocr)
    app = create_app(composition.settings, composition=composition)

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post(
            "/api/v1/runs",
            json={
                "profile_id": seeded.profile_id,
                "video_id": seeded.video_id,
                "interval_ms": 1000,
            },
        )

    assert response.status_code == 400, response.text
    assert response.json()["error"]["code"] == "ocr_provenance_incomplete"
    with composition.database.session() as session:
        assert session.scalar(select(func.count(PipelineRun.id))) == 0


def test_start_on_a_running_run_is_rejected_before_the_source_is_inspected(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    """F4: the transition gate comes first, so a live run keeps the active slot."""
    seeded = _seed(composition, tmp_path)
    media = StubMediaAccess(composition, block_sample=True)
    _install(composition, media, StubOcrEngine())
    app = create_app(composition.settings, composition=composition)

    with TestClient(app) as client:
        created = _create_run(client, seeded)
        assert _start(client, created).status_code == 202
        assert media.sample_started.wait(2)
        seeded.source.unlink()

        try:
            live = client.get(f"/api/v1/runs/{created['id']}").json()
            again = client.post(
                f"/api/v1/runs/{created['id']}/start",
                json={"expected_version": live["version"]},
            )
            assert again.status_code == 409, again.text
            assert again.json()["error"]["code"] == "invalid_transition"
            assert client.get(f"/api/v1/runs/{created['id']}").json()["status"] == "running"
        finally:
            # Never leave the worker parked in the stub, or shutdown would block.
            media.release_sample.set()
        _wait_status(client, created["id"], "review_ready")


def test_resume_on_a_running_run_does_not_reconcile_before_the_transition_gate(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    """F4: reconciliation deletes drafts, so it must never run against a live run."""
    seeded = _seed(composition, tmp_path, duration_ms=10_000)
    media = StubMediaAccess(composition, sample_delay_seconds=0.3)
    _install(composition, media, StubOcrEngine())
    app = create_app(composition.settings, composition=composition)

    with TestClient(app) as client:
        created = _create_run(client, seeded)
        assert _start(client, created).status_code == 202
        # Frame 0 must be durable while later frames keep the run running.
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            if client.get(f"/api/v1/runs/{created['id']}").json()["completed_frames"] >= 1:
                break
            time.sleep(0.02)
        else:
            raise AssertionError("frame 0 never completed")

        with composition.database.session() as session:
            checkpoint = session.get(StageCheckpoint, (created["id"], 0, "ocr"))
            assert checkpoint is not None
            checkpoint.artifact_hash = "0" * 64

        live = client.get(f"/api/v1/runs/{created['id']}").json()
        assert live["status"] == "running"
        rejected = client.post(
            f"/api/v1/runs/{created['id']}/resume",
            json={"expected_version": live["version"]},
        )
        assert rejected.status_code == 409, rejected.text
        assert rejected.json()["error"]["code"] == "invalid_transition"

        with composition.database.session() as session:
            frame = session.scalar(
                select(Frame).where(Frame.run_id == created["id"], Frame.frame_index == 0)
            )
            assert frame is not None
            assert frame.stage_status == "review_pending", "reconciliation rolled back a live run"
            assert session.get(StageCheckpoint, (created["id"], 0, "ocr")) is not None


def test_two_concurrent_resumes_fence_reconciliation_before_activation(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    """Final review 1: only the atomic winner may reconcile and activate."""
    seeded = _seed(composition, tmp_path)
    _install(composition, StubMediaAccess(composition), StubOcrEngine())
    app = create_app(composition.settings, composition=composition)

    with TestClient(app) as client:
        created = _create_run(client, seeded)
        assert _start(client, created).status_code == 202
        _wait_status(client, created["id"], "review_ready")

    with composition.database.session() as session:
        run = session.get(PipelineRun, created["id"])
        assert run is not None
        run.status = "failed"
        run.error_code = "seeded_retryable_failure"
        run.current_stage = None
        run.current_frame_index = None
        run.version += 1
    failed = composition.dataset_workflow.get_run(created["id"])
    assert failed.status == "failed"

    with composition.database.session() as session:
        frame = session.scalar(
            select(Frame).where(Frame.run_id == created["id"], Frame.frame_index == 0)
        )
        checkpoint = session.get(StageCheckpoint, (created["id"], 0, "ocr"))
        assert frame is not None and frame.stage_status == "review_pending"
        assert checkpoint is not None
        original_checkpoint_hash = checkpoint.artifact_hash
        observation_count = session.scalar(select(func.count(OcrObservation.id)))
        assert observation_count

    composition.dataset_workflow.shutdown()
    source_checked = threading.Barrier(2)
    winner_activated = threading.Event()
    runs = ResumeRaceRunRepository(
        composition.database,
        source_checked,
        winner_activated,
    )
    frames = FrameRepository(composition.database)
    checkpoints = CheckpointRepository(composition.database, composition.workspace)
    recovery = ResumeRaceRecovery(
        runs,
        checkpoints,
        composition.database,
        winner_activated,
    )
    worker = WorkflowWorker(
        runs,
        frames,
        checkpoints,
        recovery,
        StubMediaAccess(composition),
        StubOcrEngine(),
        DatasetDefinitionEngine(),
        composition.logger,
        heartbeat_interval_seconds=0.05,
    )
    workflow = DatasetWorkflow(runs, frames, recovery, worker, StubOcrEngine())
    workflow._executor.shutdown(wait=True)
    workflow._executor = ParkedExecutor()  # type: ignore[assignment]
    composition.dataset_workflow = workflow

    outcomes: dict[str, tuple[str, str]] = {}
    unexpected: list[BaseException] = []

    def resume(label: str) -> None:
        try:
            record = workflow.resume(created["id"], expected_version=failed.version)
            outcomes[label] = ("ok", record.status)
        except WorkflowError as error:
            outcomes[label] = ("error", error.code)
        except BaseException as error:
            unexpected.append(error)

    winner = threading.Thread(target=resume, args=("winner",), name="resume-winner")
    loser = threading.Thread(target=resume, args=("loser",), name="resume-loser")
    winner.start()
    loser.start()
    winner.join(timeout=10)
    loser.join(timeout=10)

    assert not winner.is_alive() and not loser.is_alive()
    assert not unexpected
    assert sorted(outcomes.values()) == [
        ("error", "version_conflict"),
        ("ok", "running"),
    ]
    assert workflow.get_run(created["id"]).status == "running"
    assert not recovery.loser_reconciled.is_set(), "loser entered destructive reconciliation"

    with composition.database.session() as session:
        frame = session.scalar(
            select(Frame).where(Frame.run_id == created["id"], Frame.frame_index == 0)
        )
        checkpoint = session.get(StageCheckpoint, (created["id"], 0, "ocr"))
        assert frame is not None and frame.stage_status == "review_pending"
        assert checkpoint is not None and checkpoint.artifact_hash == original_checkpoint_hash
        assert session.scalar(select(func.count(OcrObservation.id))) == observation_count


def test_two_different_runs_compete_for_one_global_resume_preparation_slot(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    """Third review HIGH 1: the loser must fail before touching its own run."""
    first_created, first_failed = _prepare_failed_completed_run(
        composition,
        tmp_path,
        corrupt_ocr_checkpoint=False,
    )
    second_created, second_failed = _prepare_failed_completed_run(
        composition,
        tmp_path,
        corrupt_ocr_checkpoint=True,
    )
    composition.dataset_workflow.shutdown()

    owner_runs = BlockingReservationRunRepository(composition.database)
    owner = _build_workflow(composition, owner_runs)
    composition.dataset_workflow = owner
    contender = _build_workflow(composition, RunRepository(composition.database))
    outcomes: dict[str, tuple[str, str]] = {}

    def resume_owner() -> None:
        try:
            outcomes["first"] = (
                "ok",
                owner.resume(first_created["id"], expected_version=first_failed.version).status,
            )
        except WorkflowError as error:
            outcomes["first"] = ("error", error.code)

    thread = threading.Thread(target=resume_owner)
    thread.start()
    assert owner_runs.reserved.wait(5), "first run never reserved preparation"
    try:
        contender.resume(second_created["id"], expected_version=second_failed.version)
    except WorkflowError as error:
        outcomes["second"] = ("error", error.code)
    else:
        outcomes["second"] = ("ok", "running")
    finally:
        owner_runs.release.set()
    thread.join(timeout=10)

    assert not thread.is_alive()
    assert outcomes == {
        "first": ("ok", "running"),
        "second": ("error", "active_run"),
    }
    second_after = contender.get_run(second_created["id"])
    assert (second_after.status, second_after.version, second_after.resume_token) == (
        "failed",
        second_failed.version,
        None,
    )
    assert _run_durable_state(composition, second_created["id"]) == (
        ("review_pending",),
        1,
        (0,),
    )


def test_multiframe_reconciliation_rolls_back_the_entire_plan_on_mid_apply_error(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    """Third review HIGH 2: no committed invalidation prefix may survive an error."""
    created, cancelled = _prepare_failed_completed_run(
        composition,
        tmp_path,
        corrupt_ocr_checkpoint=True,
        duration_ms=2000,
        inactive_status="cancelled",
    )
    composition.dataset_workflow.shutdown()
    runs = RunRepository(composition.database)
    checkpoints = FailAfterFirstInvalidationCheckpointRepository(
        composition.database,
        composition.workspace,
    )
    recovery = WorkflowRecovery(runs, checkpoints)
    workflow = _build_workflow(
        composition,
        runs,
        recovery=recovery,
        checkpoints=checkpoints,
    )
    composition.dataset_workflow = workflow

    with pytest.raises(WorkflowError) as caught:
        workflow.resume(created["id"], expected_version=cancelled.version)

    assert caught.value.code == "workflow_persistence_failed"
    after = workflow.get_run(created["id"])
    assert (
        after.status,
        after.error_code,
        after.version,
        after.workflow_slot,
        after.resume_token,
    ) == (
        "failed",
        "workflow_persistence_failed",
        cancelled.version + 1,
        None,
        None,
    )
    assert _run_durable_state(composition, created["id"]) == (
        ("review_pending", "review_pending"),
        2,
        (0, 1),
    )


def test_error_after_read_only_plan_releases_slot_without_changing_data(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    created, failed = _prepare_failed_completed_run(
        composition,
        tmp_path,
        corrupt_ocr_checkpoint=True,
        duration_ms=2000,
    )
    composition.dataset_workflow.shutdown()
    runs = RunRepository(composition.database)
    checkpoints = CheckpointRepository(composition.database, composition.workspace)
    recovery = FailAfterPlanningRecovery(runs, checkpoints)
    workflow = _build_workflow(
        composition,
        runs,
        recovery=recovery,
        checkpoints=checkpoints,
    )
    composition.dataset_workflow = workflow

    with pytest.raises(WorkflowError) as caught:
        workflow.resume(created["id"], expected_version=failed.version)

    assert caught.value.code == "workflow_persistence_failed"
    after = workflow.get_run(created["id"])
    assert (
        after.status,
        after.error_code,
        after.version,
        after.workflow_slot,
        after.resume_token,
    ) == (
        "failed",
        "workflow_persistence_failed",
        failed.version + 1,
        None,
        None,
    )
    assert _run_durable_state(composition, created["id"]) == (
        ("review_pending", "review_pending"),
        2,
        (0, 1),
    )


def test_resume_plan_and_activation_are_observable_as_one_atomic_commit(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    created, cancelled = _prepare_failed_completed_run(
        composition,
        tmp_path,
        corrupt_ocr_checkpoint=True,
        duration_ms=2000,
        inactive_status="cancelled",
    )
    composition.dataset_workflow.shutdown()
    runs = RunRepository(composition.database)
    checkpoints = BlockingAtomicPlanCheckpointRepository(
        composition.database,
        composition.workspace,
    )
    recovery = WorkflowRecovery(runs, checkpoints)
    workflow = _build_workflow(
        composition,
        runs,
        recovery=recovery,
        checkpoints=checkpoints,
    )
    composition.dataset_workflow = workflow
    outcome: list[RunRecord | WorkflowError] = []

    def resume() -> None:
        try:
            outcome.append(workflow.resume(created["id"], expected_version=cancelled.version))
        except WorkflowError as error:
            outcome.append(error)

    thread = threading.Thread(target=resume)
    thread.start()
    assert checkpoints.plan_applied.wait(5), "plan was never applied inside the transaction"
    # A separate WAL reader sees the complete old state, never terminal+deleted data.
    before_commit = workflow.get_run(created["id"])
    assert (before_commit.status, before_commit.workflow_slot) == ("cancelled", 1)
    assert _run_durable_state(composition, created["id"]) == (
        ("review_pending", "review_pending"),
        2,
        (0, 1),
    )
    checkpoints.release_commit.set()
    thread.join(timeout=10)

    assert not thread.is_alive()
    assert len(outcome) == 1 and isinstance(outcome[0], RunRecord)
    after = outcome[0]
    assert (after.status, after.version, after.workflow_slot, after.resume_token) == (
        "running",
        cancelled.version + 1,
        1,
        None,
    )
    assert _run_durable_state(composition, created["id"]) == (
        ("cropped", "cropped"),
        0,
        (),
    )


def test_startup_recovers_crash_after_atomic_commit_before_worker_submit(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    created, failed = _prepare_failed_completed_run(
        composition,
        tmp_path,
        corrupt_ocr_checkpoint=True,
        duration_ms=2000,
    )
    composition.dataset_workflow.shutdown()
    crashed_runs = RunRepository(composition.database, process_instance_id="crashed-process")
    checkpoints = CheckpointRepository(composition.database, composition.workspace)
    crashed_recovery = WorkflowRecovery(crashed_runs, checkpoints)
    reservation = crashed_runs.reserve_resume(
        created["id"],
        expected_version=failed.version,
        allowed_from=frozenset({"paused", "failed", "cancelled"}),
    )
    crashed_runs.source_snapshot(created["id"])
    plan = crashed_recovery.plan_resume(reservation)
    committed = crashed_recovery.commit_resume(reservation, plan)
    assert (committed.status, committed.workflow_slot, committed.resume_token) == (
        "running",
        1,
        None,
    )

    restarted_runs = RunRepository(composition.database, process_instance_id="restarted-process")
    restarted = WorkflowRecovery(restarted_runs, checkpoints)
    result = restarted.recover_startup()

    assert (result.paused_runs, result.invalidated_frames) == (1, 0)
    paused = restarted_runs.get(created["id"])
    assert (paused.status, paused.workflow_slot, paused.resume_token) == ("paused", None, None)
    assert _run_durable_state(composition, created["id"]) == (
        ("cropped", "cropped"),
        0,
        (),
    )


@pytest.mark.parametrize("inactive_status", ["failed", "paused", "cancelled"])
@pytest.mark.parametrize("source_state", ["missing", "changed"])
def test_resume_source_failure_persists_matching_failure_without_touching_data(
    composition: CompositionRoot,
    tmp_path: Path,
    source_state: str,
    inactive_status: str,
) -> None:
    created, inactive = _prepare_failed_completed_run(
        composition,
        tmp_path,
        corrupt_ocr_checkpoint=False,
        inactive_status=inactive_status,
    )
    before_data = _run_durable_state(composition, created["id"])
    composition.dataset_workflow.shutdown()
    with composition.database.session() as session:
        run = session.get(PipelineRun, created["id"])
        assert run is not None
        video = session.get(VideoAsset, run.video_id)
        assert video is not None
        source = Path(video.local_path)
    if source_state == "missing":
        source.unlink()
    else:
        source.write_bytes(b"changed-after-import")
    runs = RunRepository(composition.database)
    workflow = _build_workflow(composition, runs)
    composition.dataset_workflow = workflow
    app = create_app(composition.settings, composition=composition)

    with TestClient(app) as client:
        response = client.post(
            f"/api/v1/runs/{created['id']}/resume",
            json={"expected_version": inactive.version},
        )
        polled = client.get(f"/api/v1/runs/{created['id']}")

    expected_error = f"source_{source_state}"
    assert response.status_code == 409, response.text
    assert response.json()["error"]["code"] == expected_error
    assert polled.status_code == 200, polled.text
    assert (polled.json()["status"], polled.json()["error_code"]) == (
        "failed",
        expected_error,
    )
    after = workflow.get_run(created["id"])
    assert (
        after.status,
        after.error_code,
        after.version,
        after.workflow_slot,
        after.resume_token,
    ) == (
        "failed",
        expected_error,
        inactive.version + 1,
        None,
        None,
    )
    _assert_resume_reservation_cleared(composition, created["id"])
    assert _run_durable_state(composition, created["id"]) == before_data


@pytest.mark.parametrize("inactive_status", ["failed", "paused", "cancelled"])
def test_resume_hashing_failure_persists_matching_failure_without_touching_data(
    composition: CompositionRoot,
    tmp_path: Path,
    inactive_status: str,
) -> None:
    created, inactive = _prepare_failed_completed_run(
        composition,
        tmp_path,
        corrupt_ocr_checkpoint=False,
        inactive_status=inactive_status,
    )
    before_data = _run_durable_state(composition, created["id"])
    composition.dataset_workflow.shutdown()
    runs = RunRepository(composition.database)
    checkpoints = ExplodingHashCheckpointRepository(
        composition.database,
        composition.workspace,
    )
    recovery = WorkflowRecovery(runs, checkpoints)
    workflow = _build_workflow(
        composition,
        runs,
        recovery=recovery,
        checkpoints=checkpoints,
    )
    composition.dataset_workflow = workflow
    app = create_app(composition.settings, composition=composition)

    with TestClient(app) as client:
        response = client.post(
            f"/api/v1/runs/{created['id']}/resume",
            json={"expected_version": inactive.version},
        )
        polled = client.get(f"/api/v1/runs/{created['id']}")

    expected_error = "workflow_persistence_failed"
    assert response.status_code == 500, response.text
    assert response.json()["error"]["code"] == expected_error
    assert polled.status_code == 200, polled.text
    assert (polled.json()["status"], polled.json()["error_code"]) == (
        "failed",
        expected_error,
    )
    after = workflow.get_run(created["id"])
    assert (
        after.status,
        after.error_code,
        after.version,
        after.workflow_slot,
        after.resume_token,
    ) == (
        "failed",
        expected_error,
        inactive.version + 1,
        None,
        None,
    )
    _assert_resume_reservation_cleared(composition, created["id"])
    assert _run_durable_state(composition, created["id"]) == before_data


def test_live_unique_index_rejects_two_global_slot_owners_across_connections(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    first_created, _ = _prepare_failed_completed_run(
        composition,
        tmp_path,
        corrupt_ocr_checkpoint=False,
    )
    second_created, _ = _prepare_failed_completed_run(
        composition,
        tmp_path,
        corrupt_ocr_checkpoint=False,
    )
    composition.dataset_workflow.shutdown()
    statement = text(
        "UPDATE pipeline_runs SET workflow_slot=1, resume_token=:token, "
        "resume_owner=:owner WHERE id=:run_id"
    )
    with composition.database.engine.begin() as first_connection:
        first_connection.execute(
            statement,
            {"token": "first-token", "owner": "first-owner", "run_id": first_created["id"]},
        )
    with (
        pytest.raises(Exception) as caught,
        composition.database.engine.begin() as second_connection,
    ):
        second_connection.execute(
            statement,
            {
                "token": "second-token",
                "owner": "second-owner",
                "run_id": second_created["id"],
            },
        )
    assert type(caught.value).__name__ == "IntegrityError"


def test_reserved_resume_blocks_fresh_version_cancel_before_reconciliation(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    """Rereview HIGH: cancel may not steal a run whose resume owns the durable fence."""
    created, failed = _prepare_failed_completed_run(
        composition,
        tmp_path,
        corrupt_ocr_checkpoint=True,
    )
    composition.dataset_workflow.shutdown()
    owner_runs = BlockingReservationRunRepository(composition.database)
    owner = _build_workflow(composition, owner_runs)
    composition.dataset_workflow = owner
    contender_runs = RunRepository(composition.database)
    contender_recovery = WorkflowRecovery(
        contender_runs,
        CheckpointRepository(composition.database, composition.workspace),
    )
    contender = _build_workflow(composition, contender_runs, recovery=contender_recovery)
    outcomes: dict[str, tuple[str, str]] = {}

    def resume_owner() -> None:
        try:
            outcomes["resume"] = (
                "ok",
                owner.resume(created["id"], expected_version=failed.version).status,
            )
        except WorkflowError as error:
            outcomes["resume"] = ("error", error.code)

    thread = threading.Thread(target=resume_owner)
    thread.start()
    assert owner_runs.reserved.wait(5), "resume never persisted its reservation"
    assert contender_recovery.recover_startup().paused_runs == 0
    fresh = contender.get_run(created["id"])
    try:
        contender.cancel(created["id"], expected_version=fresh.version)
    except WorkflowError as error:
        outcomes["cancel"] = ("error", error.code)
    else:
        outcomes["cancel"] = ("ok", "cancelled")
    finally:
        owner_runs.release.set()
    thread.join(timeout=10)

    assert not thread.is_alive()
    assert outcomes == {
        "cancel": ("error", "version_conflict"),
        "resume": ("ok", "running"),
    }
    assert owner.get_run(created["id"]).status == "running"
    # The winning resume may now invalidate the deliberately corrupt OCR result.
    assert _durable_frame_state(composition, created["id"]) == ("cropped", 0, False)


@pytest.mark.parametrize("operation", ["pause", "start", "resume"])
def test_reserved_resume_blocks_fresh_version_lifecycle_from_another_root(
    composition: CompositionRoot,
    tmp_path: Path,
    operation: str,
) -> None:
    """Rereview HIGH: every public lifecycle mutation respects the durable owner token."""
    created, failed = _prepare_failed_completed_run(
        composition,
        tmp_path,
        corrupt_ocr_checkpoint=False,
    )
    composition.dataset_workflow.shutdown()
    owner_runs = BlockingReservationRunRepository(composition.database)
    owner = _build_workflow(composition, owner_runs)
    composition.dataset_workflow = owner
    contender = _build_workflow(composition, RunRepository(composition.database))
    owner_outcome: list[tuple[str, str]] = []

    def resume_owner() -> None:
        try:
            owner_outcome.append(
                ("ok", owner.resume(created["id"], expected_version=failed.version).status)
            )
        except WorkflowError as error:
            owner_outcome.append(("error", error.code))

    thread = threading.Thread(target=resume_owner)
    thread.start()
    assert owner_runs.reserved.wait(5), "resume never persisted its reservation"
    fresh = contender.get_run(created["id"])
    try:
        with pytest.raises(WorkflowError) as caught:
            getattr(contender, operation)(created["id"], expected_version=fresh.version)
        assert caught.value.code == "version_conflict"
        assert _durable_frame_state(composition, created["id"]) == ("review_pending", 1, True)
    finally:
        owner_runs.release.set()
    thread.join(timeout=10)

    assert not thread.is_alive()
    assert owner_outcome == [("ok", "running")]
    assert _durable_frame_state(composition, created["id"]) == ("review_pending", 1, True)


def test_startup_clears_crashed_resume_reservation_and_retry_can_claim_it(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    """Rereview HIGH: a process crash after reservation leaves no permanent lock."""
    created, failed = _prepare_failed_completed_run(
        composition,
        tmp_path,
        corrupt_ocr_checkpoint=False,
    )
    composition.dataset_workflow.shutdown()
    crashed_runs = RunRepository(composition.database, process_instance_id="crashed-process")
    reservation = crashed_runs.reserve_resume(
        created["id"],
        expected_version=failed.version,
        allowed_from=frozenset({"paused", "failed", "cancelled"}),
    )
    assert reservation.token

    runs = RunRepository(composition.database, process_instance_id="restarted-process")
    checkpoints = CheckpointRepository(composition.database, composition.workspace)
    recovery = WorkflowRecovery(runs, checkpoints)
    recovered = recovery.recover_startup()
    assert recovered.paused_runs == 0
    assert runs.get(created["id"]).resume_token is None

    workflow = _build_workflow(composition, runs, recovery=recovery)
    composition.dataset_workflow = workflow
    resumed = workflow.resume(created["id"], expected_version=reservation.version)
    assert resumed.status == "running"
    assert resumed.version == reservation.version + 1
    assert resumed.attempt == failed.attempt + 1
    assert resumed.resume_token is None


@pytest.mark.parametrize(
    ("field", "value"),
    [("token", "stale-token"), ("owner", "foreign-owner")],
)
def test_invalidation_rejects_stale_or_foreign_reservation_atomically(
    composition: CompositionRoot,
    tmp_path: Path,
    field: str,
    value: str,
) -> None:
    """Rereview HIGH: token/version/status are checked in the deleting transaction."""
    created, failed = _prepare_failed_completed_run(
        composition,
        tmp_path,
        corrupt_ocr_checkpoint=False,
    )
    composition.dataset_workflow.shutdown()
    runs = RunRepository(composition.database)
    reservation = runs.reserve_resume(
        created["id"],
        expected_version=failed.version,
        allowed_from=frozenset({"paused", "failed", "cancelled"}),
    )
    checkpoints = CheckpointRepository(composition.database, composition.workspace)

    stale = dataclasses.replace(reservation, **{field: value})  # type: ignore[arg-type]
    plan = ReconciliationPlan(
        run_id=created["id"],
        invalidations=(
            FrameInvalidation(
                frame_index=0,
                stage="ocr",
                expected_frame_stage="review_pending",
            ),
        ),
    )
    with pytest.raises(Exception) as caught:
        checkpoints.commit_resume(
            stale,
            plan,
        )

    assert type(caught.value).__name__ == "CheckpointReservationError"
    assert _durable_frame_state(composition, created["id"]) == ("review_pending", 1, True)


def test_fail_reserved_resume_never_overwrites_a_stale_or_foreign_fence(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    created, failed = _prepare_failed_completed_run(
        composition,
        tmp_path,
        corrupt_ocr_checkpoint=False,
    )
    before_data = _run_durable_state(composition, created["id"])
    composition.dataset_workflow.shutdown()
    runs = RunRepository(composition.database)
    reservation = runs.reserve_resume(
        created["id"],
        expected_version=failed.version,
        allowed_from=frozenset({"paused", "failed", "cancelled"}),
    )

    stale_reservations = (
        dataclasses.replace(reservation, token="stale-token"),
        dataclasses.replace(reservation, owner="foreign-owner"),
        dataclasses.replace(reservation, version=reservation.version + 1),
        dataclasses.replace(reservation, allowed_from=frozenset({"cancelled"})),
    )
    for stale in stale_reservations:
        assert not runs.fail_reserved_resume(stale, "workflow_persistence_failed")

    unchanged = runs.get(created["id"])
    assert (
        unchanged.status,
        unchanged.error_code,
        unchanged.version,
        unchanged.workflow_slot,
        unchanged.resume_token,
    ) == (
        "failed",
        "seeded_retryable_failure",
        reservation.version,
        1,
        reservation.token,
    )
    assert _run_durable_state(composition, created["id"]) == before_data
    assert runs.release_resume(reservation)


def test_three_same_version_resumes_have_one_durable_winner(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    """Rereview HIGH: one CAS winner and two clean losers, independent of thread names."""
    created, failed = _prepare_failed_completed_run(
        composition,
        tmp_path,
        corrupt_ocr_checkpoint=False,
    )
    composition.dataset_workflow.shutdown()
    runs = SourceBarrierRunRepository(composition.database, threading.Barrier(3))
    workflow = _build_workflow(composition, runs)
    composition.dataset_workflow = workflow
    outcomes: list[tuple[str, str]] = []
    outcome_lock = threading.Lock()

    def resume() -> None:
        try:
            outcome = ("ok", workflow.resume(created["id"], expected_version=failed.version).status)
        except WorkflowError as error:
            outcome = ("error", error.code)
        with outcome_lock:
            outcomes.append(outcome)

    threads = [threading.Thread(target=resume) for _ in range(3)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=10)

    assert not any(thread.is_alive() for thread in threads)
    assert sorted(outcomes) == [
        ("error", "version_conflict"),
        ("error", "version_conflict"),
        ("ok", "running"),
    ]
    assert workflow.get_run(created["id"]).version == failed.version + 1
    assert _durable_frame_state(composition, created["id"]) == ("review_pending", 1, True)


@pytest.mark.parametrize("source_state", ["missing", "changed"])
def test_start_reports_source_drift_as_an_error_envelope(
    composition: CompositionRoot,
    tmp_path: Path,
    source_state: str,
) -> None:
    """F5: 202 is reserved for a run that actually started (TECH_PLAN §5)."""
    seeded = _seed(composition, tmp_path)
    _install(composition, StubMediaAccess(composition), StubOcrEngine())
    app = create_app(composition.settings, composition=composition)

    with TestClient(app) as client:
        created = _create_run(client, seeded)
        if source_state == "missing":
            seeded.source.unlink()
        else:
            seeded.source.write_bytes(b"changed-source-with-a-different-fingerprint")
        started = _start(client, created)
        assert started.status_code == 409, started.text
        assert started.json()["error"]["code"] == f"source_{source_state}"

        # The controlled failure is still durable and visible.
        current = client.get(f"/api/v1/runs/{created['id']}").json()
        assert current["status"] == "failed"
        assert current["error_code"] == f"source_{source_state}"


def test_models_declare_the_unique_index_that_guards_the_global_workflow_slot(
    composition: CompositionRoot,
) -> None:
    """F6: the only hard guarantee of one active run must not live in the migration alone."""
    engine = create_engine(composition.settings.database_url)
    try:
        inspector = inspect(engine)
        live = {index["name"] for index in inspector.get_indexes("pipeline_runs")}
        live_checks = {
            constraint["name"] for constraint in inspector.get_check_constraints("pipeline_runs")
        }
    finally:
        engine.dispose()
    declared = {index.name for index in cast(Table, PipelineRun.__table__).indexes}
    declared_checks = {
        constraint.name
        for constraint in cast(Table, PipelineRun.__table__).constraints
        if isinstance(constraint, CheckConstraint)
    }

    assert "uq_pipeline_runs_global_workflow_slot" in declared
    assert declared == live
    assert "ck_pipeline_workflow_slot" in declared_checks
    assert declared_checks == live_checks


def test_frames_not_sampled_yet_report_no_dimensions_instead_of_a_placeholder(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    """F9: the 1x1 row placeholder must not reach the client as a real frame size."""
    seeded = _seed(composition, tmp_path)
    media = StubMediaAccess(composition, block_sample=True)
    _install(composition, media, StubOcrEngine())
    app = create_app(composition.settings, composition=composition)

    with TestClient(app) as client:
        created = _create_run(client, seeded)
        assert _start(client, created).status_code == 202
        assert media.sample_started.wait(2)
        try:
            pending = client.get(f"/api/v1/runs/{created['id']}/frames").json()["items"][0]
            assert pending["stage_status"] == "pending"
            assert pending["width"] is None
            assert pending["height"] is None
        finally:
            media.release_sample.set()

        _wait_status(client, created["id"], "review_ready")
        sampled = client.get(f"/api/v1/runs/{created['id']}/frames").json()["items"][0]
        assert (sampled["width"], sampled["height"]) == (1280, 852)
