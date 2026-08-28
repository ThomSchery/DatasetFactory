from __future__ import annotations

import hashlib
import shutil
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any, cast
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError

from backend.app.access.media.processing import (
    CropRegion,
    MediaProcessingError,
    RegionCrop,
    SampledFrame,
)
from backend.app.access.ocr import OcrProcessError
from backend.app.access.store.models import (
    Annotation,
    Category,
    Frame,
    GameProfile,
    HudRegion,
    OcrObservation,
    PipelineRun,
    Project,
    ReferenceAsset,
    RegionSample,
    StageCheckpoint,
    VideoAsset,
)
from backend.app.access.store.repositories.checkpoints import (
    CheckpointArtifact,
    CheckpointArtifactError,
    CheckpointRepository,
)
from backend.app.access.store.repositories.frames import FrameRepository
from backend.app.access.store.repositories.runs import RunRepository
from backend.app.composition import CompositionRoot
from backend.app.engines.definition import (
    BBox,
    DatasetDefinitionEngine,
    OcrCandidate,
    OcrProvenance,
)
from backend.app.main import create_app
from backend.app.managers.workflow.manager import DatasetWorkflow
from backend.app.managers.workflow.recovery import WorkflowRecovery
from backend.app.managers.workflow.state_machine import InvalidTransitionError
from backend.app.managers.workflow.worker import WorkflowWorker

FIXTURES = Path("backend/tests/fixtures")


@dataclass(frozen=True)
class SeededWorkflow:
    profile_id: str
    video_id: str
    source: Path


class StubOcrEngine:
    def __init__(self, *, empty: bool = False, provenance: OcrProvenance | None = None) -> None:
        self.empty = empty
        self.cancelled = threading.Event()
        self.describe_calls = 0
        self.detect_calls = 0
        self._provenance = provenance or OcrProvenance(
            engine_id="tesseract",
            engine_version="v5.5.3-test",
            runtime_sha256="1" * 64,
            model_sha256="2" * 64,
            config_hash="3" * 64,
            experimental=True,
            quality_gate="failed",
            language="eng",
            page_segmentation_mode=7,
        )

    def describe(self, allowed_chars: object) -> OcrProvenance:
        del allowed_chars
        self.describe_calls += 1
        return self._provenance

    def detect_characters(
        self,
        crop_relpath: Path,
        allowed_chars: object,
    ) -> tuple[OcrCandidate, ...]:
        del crop_relpath, allowed_chars
        self.detect_calls += 1
        if self.empty:
            return ()
        return (OcrCandidate("0", BBox(4, 5, 12, 20), 0.91, self._provenance),)

    def cancel_current(self) -> None:
        self.cancelled.set()


def test_worker_require_provenance_rejects_mismatched_ocr_candidates() -> None:
    expected = StubOcrEngine().describe(())
    mismatched = replace(expected, runtime_sha256="9" * 64)
    candidates = StubOcrEngine(provenance=mismatched).detect_characters(
        Path("workspace/crop.png"),
        (),
    )

    with pytest.raises(OcrProcessError, match="ocr_provenance_mismatch") as caught:
        WorkflowWorker._require_provenance(candidates, expected)

    assert caught.value.code == "ocr_provenance_mismatch"
    assert caught.value.retryable is False


def test_worker_ocr_path_rejects_mismatched_provenance_before_persistence(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    seeded = _seed(composition, tmp_path)
    expected_ocr = StubOcrEngine()
    initial_workflow, _, _ = _install_workflow(
        composition,
        StubMediaAccess(composition),
        expected_ocr,
    )
    record = initial_workflow.create_run(
        profile_id=seeded.profile_id,
        video_id=seeded.video_id,
        interval_ms=1000,
    )
    initial_workflow.shutdown()

    mismatched = replace(expected_ocr.describe(()), runtime_sha256="9" * 64)
    mismatched_ocr = StubOcrEngine(provenance=mismatched)
    _install_workflow(
        composition,
        StubMediaAccess(composition),
        mismatched_ocr,
    )
    app = create_app(composition.settings, composition=composition)

    with TestClient(app) as client:
        started = client.post(
            f"/api/v1/runs/{record.id}/start",
            json={"expected_version": record.version},
        )
        assert started.status_code == 202
        failed = _wait_status(client, record.id, "failed")
        assert failed["error_code"] == "ocr_provenance_mismatch"

    assert mismatched_ocr.detect_calls == 1
    with composition.database.session() as session:
        assert session.scalar(select(func.count()).select_from(OcrObservation)) == 0
        assert (
            session.scalar(
                select(func.count())
                .select_from(StageCheckpoint)
                .where(StageCheckpoint.run_id == record.id, StageCheckpoint.stage == "ocr")
            )
            == 0
        )


class StubMediaAccess:
    def __init__(
        self,
        composition: CompositionRoot,
        *,
        block_sample: bool = False,
        sample_delay_seconds: float = 0.0,
    ) -> None:
        self._workspace = composition.workspace
        self.block_sample = block_sample
        self.sample_delay_seconds = sample_delay_seconds
        self.sample_started = threading.Event()
        self.release_sample = threading.Event()
        self.cancelled = threading.Event()
        self.sample_calls = 0
        self.crop_calls = 0

    def sample_frame(
        self,
        video: Path,
        timestamp_ms: int,
        output_relpath: Path,
    ) -> SampledFrame:
        del video
        output = self._workspace.resolve_relpath(output_relpath)
        output.parent.mkdir(parents=True, exist_ok=True)
        self.sample_calls += 1
        self.sample_started.set()
        if self.block_sample:
            while not self.release_sample.wait(0.01):
                if self.cancelled.is_set():
                    raise MediaProcessingError("frame_cancelled")
        elif self.sample_delay_seconds:
            time.sleep(self.sample_delay_seconds)
        shutil.copyfile(FIXTURES / "video/synthetic-frame.png", output)
        return SampledFrame(output_relpath, 1280, 852, timestamp_ms)

    def crop_regions(
        self,
        frame_relpath: Path,
        regions: tuple[CropRegion, ...],
    ) -> tuple[RegionCrop, ...]:
        del frame_relpath
        self.crop_calls += 1
        results: list[RegionCrop] = []
        for region in regions:
            output = self._workspace.resolve_relpath(region.output_relpath)
            output.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(FIXTURES / "hud-crops/00-health.png", output)
            results.append(
                RegionCrop(
                    region.region_id,
                    region.output_relpath,
                    region.bbox.width,
                    region.bbox.height,
                )
            )
        return tuple(results)

    def cancel_current(self) -> None:
        self.cancelled.set()


def _seed(
    composition: CompositionRoot,
    tmp_path: Path,
    *,
    duration_ms: int = 1000,
) -> SeededWorkflow:
    project_id = str(uuid4())
    asset_id = str(uuid4())
    profile_id = str(uuid4())
    region_id = str(uuid4())
    category_id = str(uuid4())
    video_id = str(uuid4())
    source = tmp_path / f"{video_id}.mp4"
    source.write_bytes(b"durable-workflow-source")
    stat = source.stat()
    fingerprint = hashlib.sha256(f"{stat.st_size}:{stat.st_mtime_ns}".encode()).hexdigest()
    reference_relpath = f"assets/references/{asset_id}.png"
    reference = composition.workspace.resolve_relpath(reference_relpath)
    shutil.copyfile(FIXTURES / "video/synthetic-frame.png", reference)
    with composition.database.session() as session:
        session.add(Project(id=project_id, name="Project", workspace_path="D:/workspace"))
        session.add(
            ReferenceAsset(
                id=asset_id,
                relpath=reference_relpath,
                content_type="image/png",
                size_bytes=reference.stat().st_size,
                status="ready",
            )
        )
        session.flush()
        session.add(
            GameProfile(
                id=profile_id,
                project_id=project_id,
                name=f"Profile {profile_id}",
                normalized_name=f"profile-{profile_id}",
                reference_asset_id=asset_id,
                source_width=1280,
                source_height=852,
                version=1,
            )
        )
        session.add(
            VideoAsset(
                id=video_id,
                project_id=project_id,
                local_path=str(source.resolve()),
                size_bytes=stat.st_size,
                duration_ms=duration_ms,
                width=1280,
                height=852,
                fingerprint=fingerprint,
            )
        )
        session.flush()
        session.add(
            HudRegion(
                id=region_id,
                profile_id=profile_id,
                name="health",
                x=40,
                y=32,
                width=420,
                height=96,
            )
        )
        session.add(
            Category(
                id=category_id,
                profile_id=profile_id,
                name="0",
                kind="character",
                ordinal=0,
            )
        )
    return SeededWorkflow(profile_id, video_id, source)


def _install_workflow(
    composition: CompositionRoot,
    media: StubMediaAccess,
    ocr: StubOcrEngine,
    *,
    heartbeat_interval_seconds: float = 0.05,
) -> tuple[DatasetWorkflow, RunRepository, WorkflowRecovery]:
    composition.dataset_workflow.shutdown()
    runs = RunRepository(composition.database)
    frames = FrameRepository(composition.database)
    checkpoints = CheckpointRepository(composition.database, composition.workspace)
    recovery = WorkflowRecovery(runs, checkpoints)
    worker = WorkflowWorker(
        runs,
        frames,
        checkpoints,
        recovery,
        media,
        ocr,
        DatasetDefinitionEngine(),
        composition.logger,
        heartbeat_interval_seconds=heartbeat_interval_seconds,
    )
    workflow = DatasetWorkflow(runs, frames, recovery, worker, ocr)
    composition.dataset_workflow = workflow
    return workflow, runs, recovery


def _create_run(client: TestClient, seeded: SeededWorkflow) -> dict[str, Any]:
    response = client.post(
        "/api/v1/runs",
        json={
            "profile_id": seeded.profile_id,
            "video_id": seeded.video_id,
            "interval_ms": 1000,
        },
    )
    assert response.status_code == 201, response.text
    return cast(dict[str, Any], response.json())


def _wait_status(
    client: TestClient,
    run_id: str,
    expected: str,
    *,
    timeout_seconds: float = 5,
) -> dict[str, Any]:
    deadline = time.monotonic() + timeout_seconds
    last: dict[str, Any] = {}
    while time.monotonic() < deadline:
        response = client.get(f"/api/v1/runs/{run_id}")
        assert response.status_code == 200
        last = response.json()
        if last["status"] == expected:
            return last
        time.sleep(0.02)
    raise AssertionError(f"run did not reach {expected}; last={last}")


@pytest.mark.parametrize("empty", [False, True], ids=["one-observation", "no-readings"])
def test_run_api_persists_and_exposes_failed_experimental_provenance(
    composition: CompositionRoot,
    tmp_path: Path,
    empty: bool,
) -> None:
    seeded = _seed(composition, tmp_path)
    media = StubMediaAccess(composition)
    ocr = StubOcrEngine(empty=empty)
    _install_workflow(composition, media, ocr)
    app = create_app(composition.settings, composition=composition)

    with TestClient(app) as client:
        created = _create_run(client, seeded)
        assert created["status"] == "queued"
        assert created["ocr_engine"] == "tesseract"
        assert created["experimental"] is True
        assert created["quality_gate"] == "failed"
        assert created["warning"]
        started = client.post(
            f"/api/v1/runs/{created['id']}/start",
            json={"expected_version": created["version"]},
        )
        assert started.status_code == 202
        completed = _wait_status(client, created["id"], "review_ready")
        assert completed["total_frames"] == 1
        assert completed["completed_frames"] == 1
        assert completed["current_stage"] == "review"
        assert completed["current_frame_index"] is None
        assert completed["error_code"] is None
        assert isinstance(completed["version"], int)
        assert completed["experimental"] is True
        assert completed["quality_gate"] == "failed"
        assert completed["warning"]

        frames = client.get(f"/api/v1/runs/{created['id']}/frames?page_size=100")
        assert frames.status_code == 200
        assert frames.json()["total"] == 1
        assert frames.json()["items"][0]["quality_gate"] == "failed"
        assert frames.json()["items"][0]["experimental"] is True
        assert frames.json()["items"][0]["warning"]

        too_large = client.get(f"/api/v1/runs/{created['id']}/frames?page_size=101")
        assert too_large.status_code == 400

    with composition.database.session() as session:
        checkpoints = tuple(
            session.scalars(select(StageCheckpoint).where(StageCheckpoint.run_id == created["id"]))
        )
        observations = tuple(session.scalars(select(OcrObservation)))
        assert len(checkpoints) == 3
        assert all(item.experimental is True for item in checkpoints)
        assert all(item.quality_gate == "failed" and item.warning for item in checkpoints)
        assert len(observations) == (0 if empty else 1)
        assert all(item.experimental is True for item in observations)
        assert all(item.quality_gate == "failed" and item.warning for item in observations)


def test_two_real_parallel_start_requests_reserve_exactly_one_active_run(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    seeded = _seed(composition, tmp_path)
    media = StubMediaAccess(composition, block_sample=True)
    ocr = StubOcrEngine()
    _install_workflow(composition, media, ocr)
    app = create_app(composition.settings, composition=composition)

    with TestClient(app) as client:
        first = _create_run(client, seeded)
        second = _create_run(client, seeded)
        barrier = threading.Barrier(3)

        def start(run: dict[str, Any]) -> tuple[int, dict[str, Any]]:
            barrier.wait()
            response = client.post(
                f"/api/v1/runs/{run['id']}/start",
                json={"expected_version": run["version"]},
            )
            return response.status_code, response.json()

        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(start, run) for run in (first, second)]
            barrier.wait()
            results = [future.result(timeout=5) for future in futures]

        assert sorted(status for status, _ in results) == [202, 409]
        conflict = next(body for status, body in results if status == 409)
        assert conflict["error"]["code"] == "active_run"
        winner = next(body for status, body in results if status == 202)
        assert media.sample_started.wait(2)
        current = client.get(f"/api/v1/runs/{winner['id']}").json()
        cancelled = client.post(
            f"/api/v1/runs/{winner['id']}/cancel",
            json={"expected_version": current["version"]},
        )
        assert cancelled.status_code == 202
        _wait_status(client, winner["id"], "cancelled")


def test_pause_resume_expected_version_heartbeat_and_clean_shutdown(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    seeded = _seed(composition, tmp_path)
    media = StubMediaAccess(composition, block_sample=True)
    ocr = StubOcrEngine()
    workflow, runs, _ = _install_workflow(
        composition,
        media,
        ocr,
        heartbeat_interval_seconds=0.05,
    )
    app = create_app(composition.settings, composition=composition)

    with TestClient(app) as client:
        created = _create_run(client, seeded)
        start = client.post(
            f"/api/v1/runs/{created['id']}/start",
            json={"expected_version": created["version"]},
        )
        assert start.status_code == 202
        assert media.sample_started.wait(2)
        first_heartbeat = runs.get(created["id"]).last_heartbeat_at
        time.sleep(0.15)
        second_heartbeat = runs.get(created["id"]).last_heartbeat_at
        assert first_heartbeat is not None and second_heartbeat is not None
        assert second_heartbeat > first_heartbeat

        current = client.get(f"/api/v1/runs/{created['id']}").json()
        stale = client.post(
            f"/api/v1/runs/{created['id']}/pause",
            json={"expected_version": current["version"] - 1},
        )
        assert stale.status_code == 409
        assert stale.json()["error"]["code"] == "version_conflict"
        pause = client.post(
            f"/api/v1/runs/{created['id']}/pause",
            json={"expected_version": current["version"]},
        )
        assert pause.status_code == 202
        media.release_sample.set()
        paused = _wait_status(client, created["id"], "paused")
        assert media.crop_calls == 0

        media.block_sample = False
        resumed = client.post(
            f"/api/v1/runs/{created['id']}/resume",
            json={"expected_version": paused["version"]},
        )
        assert resumed.status_code == 202
        assert resumed.json()["attempt"] == 2
        _wait_status(client, created["id"], "review_ready")

    # A second run proves clean shutdown requests pause and never starts its next stage.
    seeded_two = _seed(composition, tmp_path)
    media_two = StubMediaAccess(composition, block_sample=True)
    workflow.shutdown()
    workflow_two, runs_two, _ = _install_workflow(composition, media_two, StubOcrEngine())
    record = workflow_two.create_run(
        profile_id=seeded_two.profile_id,
        video_id=seeded_two.video_id,
        interval_ms=1000,
    )
    workflow_two.start(record.id, expected_version=record.version)
    assert media_two.sample_started.wait(2)
    shutdown_thread = threading.Thread(target=workflow_two.shutdown)
    shutdown_thread.start()
    deadline = time.monotonic() + 2
    while time.monotonic() < deadline and runs_two.control_requested(record.id) != "pause":
        time.sleep(0.01)
    assert runs_two.control_requested(record.id) == "pause"
    assert shutdown_thread.is_alive()
    media_two.release_sample.set()
    shutdown_thread.join(timeout=3)
    assert not shutdown_thread.is_alive()
    assert runs_two.get(record.id).status == "paused"
    assert media_two.crop_calls == 0


def test_restart_reconciles_all_crash_windows_without_duplicates(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    seeded = _seed(composition, tmp_path)
    media = StubMediaAccess(composition)
    ocr = StubOcrEngine()
    _, _, recovery = _install_workflow(composition, media, ocr)
    app = create_app(composition.settings, composition=composition)

    with TestClient(app) as client:
        for stage, window in (
            (stage, window)
            for stage in ("sample", "crop", "ocr")
            for window in ("artifact_without_commit", "commit_without_hash", "wrong_hash")
        ):
            created = _create_run(client, seeded)
            started = client.post(
                f"/api/v1/runs/{created['id']}/start",
                json={"expected_version": created["version"]},
            )
            assert started.status_code == 202
            completed = _wait_status(client, created["id"], "review_ready")
            with composition.database.session() as session:
                checkpoint = session.get(StageCheckpoint, (created["id"], 0, stage))
                assert checkpoint is not None
                if window == "artifact_without_commit":
                    session.delete(checkpoint)
                elif window == "commit_without_hash":
                    checkpoint.artifact_hash = None
                else:
                    checkpoint.artifact_hash = "0" * 64
                run = session.get(PipelineRun, created["id"])
                assert run is not None
                run.status = "running"
                run.workflow_slot = 1
                run.current_stage = stage
                run.version = completed["version"] + 1

            result = recovery.recover_startup()
            assert result.paused_runs == 1
            assert result.invalidated_frames == 1
            paused = client.get(f"/api/v1/runs/{created['id']}").json()
            assert paused["status"] == "paused"
            resume = client.post(
                f"/api/v1/runs/{created['id']}/resume",
                json={"expected_version": paused["version"]},
            )
            assert resume.status_code == 202
            _wait_status(client, created["id"], "review_ready")

            with composition.database.session() as session:
                frame_ids = tuple(
                    session.scalars(select(Frame.id).where(Frame.run_id == created["id"]))
                )
                assert len(frame_ids) == 1
                assert (
                    session.scalar(
                        select(func.count())
                        .select_from(StageCheckpoint)
                        .where(StageCheckpoint.run_id == created["id"])
                    )
                    == 3
                )
                sample_ids = select(RegionSample.id).where(RegionSample.frame_id == frame_ids[0])
                assert (
                    session.scalar(
                        select(func.count())
                        .select_from(OcrObservation)
                        .where(OcrObservation.sample_id.in_(sample_ids))
                    )
                    == 1
                )
                assert (
                    session.scalar(
                        select(func.count())
                        .select_from(Annotation)
                        .where(Annotation.frame_id == frame_ids[0])
                    )
                    == 1
                )


def test_recovery_rolls_back_only_the_damaged_frame_and_checkpoint_key_is_unique(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    seeded = _seed(composition, tmp_path, duration_ms=2000)
    _, _, recovery = _install_workflow(
        composition,
        StubMediaAccess(composition),
        StubOcrEngine(),
    )
    app = create_app(composition.settings, composition=composition)

    with TestClient(app) as client:
        created = _create_run(client, seeded)
        started = client.post(
            f"/api/v1/runs/{created['id']}/start",
            json={"expected_version": created["version"]},
        )
        assert started.status_code == 202
        completed = _wait_status(client, created["id"], "review_ready")

        with composition.database.session() as session:
            frames = tuple(
                session.scalars(
                    select(Frame).where(Frame.run_id == created["id"]).order_by(Frame.frame_index)
                )
            )
            assert len(frames) == 2
            healthy_frame_id = frames[1].id
            healthy_observation_ids = tuple(
                session.scalars(
                    select(OcrObservation.id)
                    .join(RegionSample, OcrObservation.sample_id == RegionSample.id)
                    .where(RegionSample.frame_id == healthy_frame_id)
                )
            )
            healthy_annotation_ids = tuple(
                session.scalars(
                    select(Annotation.id).where(Annotation.frame_id == healthy_frame_id)
                )
            )
            damaged = session.get(StageCheckpoint, (created["id"], 0, "ocr"))
            assert damaged is not None
            damaged.artifact_hash = "0" * 64
            duplicate = StageCheckpoint(
                run_id=created["id"],
                frame_index=1,
                stage="ocr",
                attempt=1,
                status="completed",
                artifact_relpath=damaged.artifact_relpath,
                artifact_hash=damaged.artifact_hash,
                error_code=None,
                ocr_engine=damaged.ocr_engine,
                ocr_engine_version=damaged.ocr_engine_version,
                ocr_runtime_sha256=damaged.ocr_runtime_sha256,
                ocr_model_sha256=damaged.ocr_model_sha256,
                ocr_config_hash=damaged.ocr_config_hash,
                ocr_language=damaged.ocr_language,
                ocr_page_segmentation_mode=damaged.ocr_page_segmentation_mode,
                experimental=damaged.experimental,
                quality_gate=damaged.quality_gate,
                warning=damaged.warning,
            )
            with pytest.raises(IntegrityError), session.begin_nested():
                session.add(duplicate)
                session.flush()
            run = session.get(PipelineRun, created["id"])
            assert run is not None
            run.status = "running"
            run.workflow_slot = 1
            run.current_stage = "ocr"
            run.current_frame_index = 0
            run.version = completed["version"] + 1

        result = recovery.recover_startup()
        assert result.invalidated_frames == 1
        with composition.database.session() as session:
            healthy_frame = session.get(Frame, healthy_frame_id)
            assert healthy_frame is not None
            assert healthy_frame.stage_status == "review_pending"
            assert (
                tuple(
                    session.scalars(
                        select(OcrObservation.id)
                        .join(RegionSample, OcrObservation.sample_id == RegionSample.id)
                        .where(RegionSample.frame_id == healthy_frame_id)
                    )
                )
                == healthy_observation_ids
            )
            assert (
                tuple(
                    session.scalars(
                        select(Annotation.id).where(Annotation.frame_id == healthy_frame_id)
                    )
                )
                == healthy_annotation_ids
            )

        paused = client.get(f"/api/v1/runs/{created['id']}").json()
        resumed = client.post(
            f"/api/v1/runs/{created['id']}/resume",
            json={"expected_version": paused["version"]},
        )
        assert resumed.status_code == 202
        final = _wait_status(client, created["id"], "review_ready")
        assert final["completed_frames"] == 2


@pytest.mark.parametrize("source_state", ["missing", "changed"])
def test_source_drift_sets_controlled_failed_status_without_deleting_data(
    composition: CompositionRoot,
    tmp_path: Path,
    source_state: str,
) -> None:
    seeded = _seed(composition, tmp_path)
    _install_workflow(composition, StubMediaAccess(composition), StubOcrEngine())
    app = create_app(composition.settings, composition=composition)

    with TestClient(app) as client:
        created = _create_run(client, seeded)
        if source_state == "missing":
            seeded.source.unlink()
        else:
            seeded.source.write_bytes(b"changed-source-with-a-different-fingerprint")
        started = client.post(
            f"/api/v1/runs/{created['id']}/start",
            json={"expected_version": created["version"]},
        )
        assert started.status_code == 409
        assert started.json()["error"]["code"] == f"source_{source_state}"
        current = client.get(f"/api/v1/runs/{created['id']}").json()
        assert current["status"] == "failed"
        assert current["error_code"] == f"source_{source_state}"

    with composition.database.session() as session:
        assert session.get(PipelineRun, created["id"]) is not None
        assert session.get(VideoAsset, seeded.video_id) is not None
        assert session.get(GameProfile, seeded.profile_id) is not None


def test_checkpoint_path_escape_is_rejected_before_mkdir(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    outside = tmp_path / "outside"
    checkpoints = CheckpointRepository(composition.database, composition.workspace)
    with pytest.raises(CheckpointArtifactError) as error:
        checkpoints.publish_manifest(
            run_id="../../outside",
            frame_index=0,
            stage="ocr",
            payload={},
        )
    assert "artifact_path_invalid" in str(error.value)
    assert not outside.exists()


def test_commit_ocr_rejects_review_pending_before_deleting_annotations(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    seeded = _seed(composition, tmp_path)
    _install_workflow(composition, StubMediaAccess(composition), StubOcrEngine())
    app = create_app(composition.settings, composition=composition)
    with TestClient(app) as client:
        created = _create_run(client, seeded)
        started = client.post(
            f"/api/v1/runs/{created['id']}/start",
            json={"expected_version": created["version"]},
        )
        assert started.status_code == 202
        _wait_status(client, created["id"], "review_ready")

    frames = FrameRepository(composition.database)
    with composition.database.session() as session:
        before = tuple(session.scalars(select(Annotation.id)))
    with pytest.raises(InvalidTransitionError):
        frames.commit_ocr(
            created["id"],
            0,
            (),
            CheckpointArtifact("runs/unused.json", "0" * 64),
            "",
        )
    with composition.database.session() as session:
        assert tuple(session.scalars(select(Annotation.id))) == before


def test_recovery_skips_reviewed_frames_without_changing_review_state_or_revision(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    seeded = _seed(composition, tmp_path, duration_ms=2000)
    _, _, recovery = _install_workflow(
        composition,
        StubMediaAccess(composition),
        StubOcrEngine(),
    )
    app = create_app(composition.settings, composition=composition)
    with TestClient(app) as client:
        created = _create_run(client, seeded)
        started = client.post(
            f"/api/v1/runs/{created['id']}/start",
            json={"expected_version": created["version"]},
        )
        assert started.status_code == 202
        completed = _wait_status(client, created["id"], "review_ready")

    with composition.database.session() as session:
        frames = tuple(
            session.scalars(
                select(Frame).where(Frame.run_id == created["id"]).order_by(Frame.frame_index)
            )
        )
        assert len(frames) == 2
        frames[0].review_status = "accepted"
        frames[1].review_status = "rejected"
        for annotation in session.scalars(
            select(Annotation).where(Annotation.frame_id == frames[0].id)
        ):
            annotation.status = "accepted"
        for frame_index in (0, 1):
            checkpoint = session.get(StageCheckpoint, (created["id"], frame_index, "ocr"))
            assert checkpoint is not None
            checkpoint.artifact_hash = "0" * 64
        run = session.get(PipelineRun, created["id"])
        assert run is not None
        run.review_revision = 2
        run.status = "running"
        run.workflow_slot = 1
        run.current_stage = "ocr"
        run.version = completed["version"] + 1
        frame_ids = tuple(frame.id for frame in frames)
        annotation_ids = tuple(
            session.scalars(
                select(Annotation.id)
                .where(Annotation.frame_id.in_(frame_ids))
                .order_by(Annotation.id)
            )
        )

    first = recovery.recover_startup()
    assert first.invalidated_frames == 0
    assert first.skipped_reviewed_frames == 2
    with composition.database.session() as session:
        run = session.get(PipelineRun, created["id"])
        assert run is not None
        assert run.review_revision == 2
        assert "Recovery warning:" not in run.warning
        assert run.recovery_skipped_frames == 2
        persisted = tuple(
            session.scalars(
                select(Frame).where(Frame.run_id == created["id"]).order_by(Frame.frame_index)
            )
        )
        assert tuple(frame.review_status for frame in persisted) == ("accepted", "rejected")
        assert (
            tuple(
                session.scalars(
                    select(Annotation.id)
                    .where(Annotation.frame_id.in_(frame_ids))
                    .order_by(Annotation.id)
                )
            )
            == annotation_ids
        )
        first_warning = run.warning
        run.status = "running"
        run.workflow_slot = 1
        run.current_stage = "ocr"

    with TestClient(app) as client:
        public_run = client.get(f"/api/v1/runs/{created['id']}").json()
        assert "skipped 2 reviewed frame(s)" in public_run["warning"]

    second = recovery.recover_startup()
    assert second == first
    assert second.invalidated_frames == 0
    assert second.skipped_reviewed_frames == 2
    with composition.database.session() as session:
        run = session.get(PipelineRun, created["id"])
        assert run is not None
        assert run.review_revision == 2
        assert run.warning == first_warning
        assert run.recovery_skipped_frames == 2
        persisted = tuple(
            session.scalars(
                select(Frame).where(Frame.run_id == created["id"]).order_by(Frame.frame_index)
            )
        )
        assert tuple(frame.review_status for frame in persisted) == ("accepted", "rejected")


def test_recovery_after_reopen_preserves_manual_annotations_and_review_revision(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    seeded = _seed(composition, tmp_path)
    _, _, recovery = _install_workflow(
        composition,
        StubMediaAccess(composition),
        StubOcrEngine(),
    )
    app = create_app(composition.settings, composition=composition)
    with TestClient(app) as client:
        created = _create_run(client, seeded)
        started = client.post(
            f"/api/v1/runs/{created['id']}/start",
            json={"expected_version": created["version"]},
        )
        assert started.status_code == 202
        completed = _wait_status(client, created["id"], "review_ready")
        with composition.database.session() as session:
            frame = session.scalar(select(Frame).where(Frame.run_id == created["id"]))
            category = session.scalar(
                select(Category).where(Category.profile_id == seeded.profile_id)
            )
            assert frame is not None
            assert category is not None
            frame_id = frame.id
            frame_version = frame.version
            category_id = category.id

        rejected = client.post(
            f"/api/v1/frames/{frame_id}/review",
            json={"decision": "reject", "expected_version": frame_version},
        )
        assert rejected.status_code == 200, rejected.text
        reopened = client.post(
            f"/api/v1/frames/{frame_id}/review",
            json={"decision": "reopen", "expected_version": rejected.json()["version"]},
        )
        assert reopened.status_code == 200, reopened.text
        manual = client.post(
            f"/api/v1/frames/{frame_id}/annotations",
            json={
                "category_id": category_id,
                "bbox": {"x": 700, "y": 500, "width": 20, "height": 20},
                "expected_version": reopened.json()["version"],
            },
        )
        assert manual.status_code == 201, manual.text
        manual_id = manual.json()["id"]

    with composition.database.session() as session:
        checkpoint = session.get(StageCheckpoint, (created["id"], 0, "ocr"))
        run = session.get(PipelineRun, created["id"])
        assert checkpoint is not None
        assert run is not None
        checkpoint.artifact_hash = "0" * 64
        review_revision = run.review_revision
        assert review_revision == 3
        run.status = "running"
        run.workflow_slot = 1
        run.current_stage = "ocr"
        run.version = completed["version"] + 1

    first = recovery.recover_startup()
    assert first.invalidated_frames == 1
    assert first.skipped_reviewed_frames == 0
    with composition.database.session() as session:
        run = session.get(PipelineRun, created["id"])
        frame = session.get(Frame, frame_id)
        assert run is not None
        assert frame is not None
        assert run.review_revision == review_revision
        assert frame.review_status == "pending"
        annotations = tuple(
            session.scalars(
                select(Annotation).where(Annotation.frame_id == frame_id).order_by(Annotation.id)
            )
        )
        assert [(item.id, item.source) for item in annotations] == [(manual_id, "manual")]
        stable_frame_state = (frame.stage_status, frame.review_status, frame.version)
        stable_annotations = tuple(
            (item.id, item.source, item.status, item.version) for item in annotations
        )
        run.status = "running"
        run.workflow_slot = 1
        run.current_stage = "ocr"

    second = recovery.recover_startup()
    assert second.invalidated_frames == 0
    assert second.skipped_reviewed_frames == 0
    with composition.database.session() as session:
        run = session.get(PipelineRun, created["id"])
        frame = session.get(Frame, frame_id)
        assert run is not None
        assert frame is not None
        assert run.review_revision == review_revision
        assert (frame.stage_status, frame.review_status, frame.version) == stable_frame_state
        assert (
            tuple(
                (item.id, item.source, item.status, item.version)
                for item in session.scalars(
                    select(Annotation)
                    .where(Annotation.frame_id == frame_id)
                    .order_by(Annotation.id)
                )
            )
            == stable_annotations
        )


@dataclass(frozen=True)
class ReopenedFrame:
    run_id: str
    frame_id: str
    category_id: str
    manual_id: str
    review_revision: int
    run_version: int


def _reject_reopen_and_draw(
    composition: CompositionRoot,
    client: TestClient,
    seeded: SeededWorkflow,
) -> ReopenedFrame:
    """Drive one frame to `review_pending`, reject it, reopen it and draw a box."""
    created = _create_run(client, seeded)
    started = client.post(
        f"/api/v1/runs/{created['id']}/start",
        json={"expected_version": created["version"]},
    )
    assert started.status_code == 202
    completed = _wait_status(client, created["id"], "review_ready")
    with composition.database.session() as session:
        frame = session.scalar(select(Frame).where(Frame.run_id == created["id"]))
        category = session.scalar(select(Category).where(Category.profile_id == seeded.profile_id))
        assert frame is not None
        assert category is not None
        frame_id = frame.id
        frame_version = frame.version
        category_id = category.id

    rejected = client.post(
        f"/api/v1/frames/{frame_id}/review",
        json={"decision": "reject", "expected_version": frame_version},
    )
    assert rejected.status_code == 200, rejected.text
    reopened = client.post(
        f"/api/v1/frames/{frame_id}/review",
        json={"decision": "reopen", "expected_version": rejected.json()["version"]},
    )
    assert reopened.status_code == 200, reopened.text
    manual = client.post(
        f"/api/v1/frames/{frame_id}/annotations",
        json={
            "category_id": category_id,
            "bbox": {"x": 700, "y": 500, "width": 20, "height": 20},
            "expected_version": reopened.json()["version"],
        },
    )
    assert manual.status_code == 201, manual.text

    with composition.database.session() as session:
        run = session.get(PipelineRun, created["id"])
        assert run is not None
        return ReopenedFrame(
            run_id=created["id"],
            frame_id=frame_id,
            category_id=category_id,
            manual_id=manual.json()["id"],
            review_revision=run.review_revision,
            run_version=completed["version"] + 1,
        )


def _crash_on_the_ocr_checkpoint(composition: CompositionRoot, reopened: ReopenedFrame) -> None:
    with composition.database.session() as session:
        checkpoint = session.get(StageCheckpoint, (reopened.run_id, 0, "ocr"))
        run = session.get(PipelineRun, reopened.run_id)
        assert checkpoint is not None
        assert run is not None
        checkpoint.artifact_hash = "0" * 64
        run.status = "running"
        run.workflow_slot = 1
        run.current_stage = "ocr"
        run.version = reopened.run_version


def _annotation_sources(composition: CompositionRoot, frame_id: str) -> list[tuple[str, str]]:
    with composition.database.session() as session:
        return [
            (item.id, item.source)
            for item in session.scalars(
                select(Annotation).where(Annotation.frame_id == frame_id).order_by(Annotation.id)
            )
        ]


def test_worker_resume_after_reopen_recovery_keeps_the_manual_annotation(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    seeded = _seed(composition, tmp_path)
    _, _, recovery = _install_workflow(
        composition,
        StubMediaAccess(composition),
        StubOcrEngine(),
    )
    app = create_app(composition.settings, composition=composition)
    with TestClient(app) as client:
        reopened = _reject_reopen_and_draw(composition, client, seeded)
    _crash_on_the_ocr_checkpoint(composition, reopened)

    first = recovery.recover_startup()
    assert first.invalidated_frames == 1
    assert first.skipped_reviewed_frames == 0
    assert _annotation_sources(composition, reopened.frame_id) == [(reopened.manual_id, "manual")]

    with TestClient(app) as client:
        paused = client.get(f"/api/v1/runs/{reopened.run_id}").json()
        resumed = client.post(
            f"/api/v1/runs/{reopened.run_id}/resume",
            json={"expected_version": paused["version"]},
        )
        assert resumed.status_code == 202, resumed.text
        _wait_status(client, reopened.run_id, "review_ready")

        # The resume is the step the reconciliation exists to enable, and the step
        # that used to delete the box: `commit_ocr` rewrites the OCR proposals only.
        detail = client.get(f"/api/v1/frames/{reopened.frame_id}").json()
        assert detail["stage_status"] == "review_pending"
        assert detail["review_status"] == "pending"
        assert [item["id"] for item in detail["annotations"] if item["source"] == "manual"] == [
            reopened.manual_id
        ]
        assert any(item["source"] == "ocr" for item in detail["annotations"])
        assert detail["review_revision"] == reopened.review_revision

    with composition.database.session() as session:
        run = session.get(PipelineRun, reopened.run_id)
        assert run is not None
        assert run.review_revision == reopened.review_revision
        run.status = "running"
        run.workflow_slot = 1
        run.current_stage = "ocr"
    after_resume = _annotation_sources(composition, reopened.frame_id)

    second = recovery.recover_startup()
    assert second.invalidated_frames == 0
    assert second.skipped_reviewed_frames == 0
    assert _annotation_sources(composition, reopened.frame_id) == after_resume
    with composition.database.session() as session:
        run = session.get(PipelineRun, reopened.run_id)
        assert run is not None
        assert run.review_revision == reopened.review_revision


def test_accept_succeeds_when_only_manual_annotations_survive_the_resume(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    seeded = _seed(composition, tmp_path)
    ocr = StubOcrEngine()
    _, _, recovery = _install_workflow(composition, StubMediaAccess(composition), ocr)
    app = create_app(composition.settings, composition=composition)
    with TestClient(app) as client:
        reopened = _reject_reopen_and_draw(composition, client, seeded)
    _crash_on_the_ocr_checkpoint(composition, reopened)
    assert recovery.recover_startup().invalidated_frames == 1

    # The re-run reads nothing this time, so the manual box is the frame's only
    # annotation — `accept` still has an active annotation to work with.
    ocr.empty = True
    with TestClient(app) as client:
        paused = client.get(f"/api/v1/runs/{reopened.run_id}").json()
        resumed = client.post(
            f"/api/v1/runs/{reopened.run_id}/resume",
            json={"expected_version": paused["version"]},
        )
        assert resumed.status_code == 202, resumed.text
        _wait_status(client, reopened.run_id, "review_ready")
        assert _annotation_sources(composition, reopened.frame_id) == [
            (reopened.manual_id, "manual")
        ]

        detail = client.get(f"/api/v1/frames/{reopened.frame_id}").json()
        accepted = client.post(
            f"/api/v1/frames/{reopened.frame_id}/review",
            json={"decision": "accept", "expected_version": detail["version"]},
        )
        assert accepted.status_code == 200, accepted.text
        assert accepted.json()["review_status"] == "accepted"
        assert [item["status"] for item in accepted.json()["annotations"]] == ["accepted"]


def test_first_commit_ocr_deletes_ocr_proposals_but_keeps_manual_annotations(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    seeded = _seed(composition, tmp_path)
    _install_workflow(composition, StubMediaAccess(composition), StubOcrEngine())
    app = create_app(composition.settings, composition=composition)
    with TestClient(app) as client:
        created = _create_run(client, seeded)
        started = client.post(
            f"/api/v1/runs/{created['id']}/start",
            json={"expected_version": created["version"]},
        )
        assert started.status_code == 202
        _wait_status(client, created["id"], "review_ready")

    manual_id = str(uuid4())
    stale_ocr_id = str(uuid4())
    # Roll the frame back to `cropped` by hand: no recovery machinery involved, so
    # what follows is an ordinary first-time OCR commit on the frame.
    with composition.database.session() as session:
        frame = session.scalar(select(Frame).where(Frame.run_id == created["id"]))
        category = session.scalar(select(Category).where(Category.profile_id == seeded.profile_id))
        assert frame is not None
        assert category is not None
        frame_id = frame.id
        image_relpath = frame.image_relpath
        frame.stage_status = "cropped"
        session.execute(delete(Annotation).where(Annotation.frame_id == frame_id))
        session.flush()
        for annotation_id, source in ((manual_id, "manual"), (stale_ocr_id, "ocr")):
            session.add(
                Annotation(
                    id=annotation_id,
                    frame_id=frame_id,
                    category_id=category.id,
                    x=700,
                    y=500,
                    width=20,
                    height=20,
                    confidence=None,
                    source=source,
                    observation_id=None,
                    status="proposed",
                    version=1,
                )
            )

    checkpoints = CheckpointRepository(composition.database, composition.workspace)
    FrameRepository(composition.database).commit_ocr(
        created["id"],
        0,
        (),
        checkpoints.hash_artifact(image_relpath),
        "",
    )

    assert _annotation_sources(composition, frame_id) == [(manual_id, "manual")]
    with composition.database.session() as session:
        frame = session.get(Frame, frame_id)
        assert frame is not None
        assert frame.stage_status == "review_pending"


def test_recovery_skip_then_resume_checkpoint_remains_valid_on_second_restart(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    seeded = _seed(composition, tmp_path, duration_ms=2000)
    _, _, recovery = _install_workflow(
        composition,
        StubMediaAccess(composition),
        StubOcrEngine(),
    )
    app = create_app(composition.settings, composition=composition)
    with TestClient(app) as client:
        created = _create_run(client, seeded)
        started = client.post(
            f"/api/v1/runs/{created['id']}/start",
            json={"expected_version": created["version"]},
        )
        assert started.status_code == 202
        completed = _wait_status(client, created["id"], "review_ready")

        with composition.database.session() as session:
            frames = tuple(
                session.scalars(
                    select(Frame).where(Frame.run_id == created["id"]).order_by(Frame.frame_index)
                )
            )
            assert len(frames) == 2
            frames[0].review_status = "accepted"
            accepted_checkpoint = session.get(StageCheckpoint, (created["id"], 0, "ocr"))
            pending_checkpoint = session.get(StageCheckpoint, (created["id"], 1, "sample"))
            assert accepted_checkpoint is not None
            assert pending_checkpoint is not None
            accepted_checkpoint.artifact_hash = "0" * 64
            pending_checkpoint.artifact_hash = "0" * 64
            run = session.get(PipelineRun, created["id"])
            assert run is not None
            ocr_warning = run.warning
            review_revision = run.review_revision
            run.status = "running"
            run.workflow_slot = 1
            run.current_stage = "sampling"
            run.version = completed["version"] + 1

        first = recovery.recover_startup()
        assert first.invalidated_frames == 1
        assert first.skipped_reviewed_frames == 1
        paused = client.get(f"/api/v1/runs/{created['id']}").json()
        assert "skipped 1 reviewed frame(s)" in paused["warning"]
        resumed = client.post(
            f"/api/v1/runs/{created['id']}/resume",
            json={"expected_version": paused["version"]},
        )
        assert resumed.status_code == 202
        _wait_status(client, created["id"], "review_ready")

        with composition.database.session() as session:
            run = session.get(PipelineRun, created["id"])
            assert run is not None
            assert run.warning == ocr_warning
            assert run.review_revision == review_revision
            pending_frame = session.scalar(
                select(Frame).where(Frame.run_id == created["id"], Frame.frame_index == 1)
            )
            assert pending_frame is not None
            assert pending_frame.review_status == "pending"
            pending_annotation_ids = tuple(
                session.scalars(
                    select(Annotation.id)
                    .where(Annotation.frame_id == pending_frame.id)
                    .order_by(Annotation.id)
                )
            )
            assert pending_annotation_ids
            new_checkpoints = tuple(
                session.scalars(
                    select(StageCheckpoint).where(
                        StageCheckpoint.run_id == created["id"],
                        StageCheckpoint.frame_index == 1,
                    )
                )
            )
            assert len(new_checkpoints) == 3
            assert all(checkpoint.warning == ocr_warning for checkpoint in new_checkpoints)
            run.status = "running"
            run.workflow_slot = 1
            run.current_stage = "ocr"

        second = recovery.recover_startup()
        assert second.invalidated_frames == 0
        assert second.skipped_reviewed_frames == 1
        with composition.database.session() as session:
            run = session.get(PipelineRun, created["id"])
            assert run is not None
            assert run.warning == ocr_warning
            assert run.review_revision == review_revision
            pending_frame = session.scalar(
                select(Frame).where(Frame.run_id == created["id"], Frame.frame_index == 1)
            )
            assert pending_frame is not None
            assert pending_frame.review_status == "pending"
            assert (
                tuple(
                    session.scalars(
                        select(Annotation.id)
                        .where(Annotation.frame_id == pending_frame.id)
                        .order_by(Annotation.id)
                    )
                )
                == pending_annotation_ids
            )


def test_ocr_warning_containing_recovery_literal_remains_valid_provenance(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    seeded = _seed(composition, tmp_path)
    _, _, recovery = _install_workflow(
        composition,
        StubMediaAccess(composition),
        StubOcrEngine(),
    )
    app = create_app(composition.settings, composition=composition)
    with TestClient(app) as client:
        created = _create_run(client, seeded)
        started = client.post(
            f"/api/v1/runs/{created['id']}/start",
            json={"expected_version": created["version"]},
        )
        assert started.status_code == 202
        _wait_status(client, created["id"], "review_ready")

    literal_warning = "Native OCR warning with Recovery warning: preserved verbatim."
    with composition.database.session() as session:
        run = session.get(PipelineRun, created["id"])
        assert run is not None
        run.warning = literal_warning
        for checkpoint in session.scalars(
            select(StageCheckpoint).where(StageCheckpoint.run_id == created["id"])
        ):
            checkpoint.warning = literal_warning

    first = recovery.plan_reconciliation(created["id"])
    second = recovery.plan_reconciliation(created["id"])
    assert first == second
    assert first.invalidations == ()
    assert first.skipped_reviewed_frames == ()
