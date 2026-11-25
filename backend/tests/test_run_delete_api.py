from __future__ import annotations

import logging
import shutil
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from backend.app.access.store.models import (
    Annotation,
    Export,
    Frame,
    GameProfile,
    PipelineRun,
    StageCheckpoint,
    VideoAsset,
)
from backend.app.access.store.run_artifacts import RunArtifacts, RunArtifactSweep
from backend.app.composition import CompositionRoot, build_composition
from backend.app.config import Settings
from backend.app.main import create_app
from backend.tests.conftest import AvailableResourceProbe
from backend.tests.test_run_completion_api import CompletionSeed, _seed_run


def _write(composition: CompositionRoot, relpath: str, payload: bytes = b"x") -> Path:
    path = composition.workspace.resolve_relpath(relpath)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)
    return path


def _seed_files(composition: CompositionRoot, seed: CompletionSeed) -> dict[str, Path]:
    files = {
        "frame": _write(composition, f"runs/{seed.run_id}/frames/00000000.jpg"),
        "crop": _write(composition, f"runs/{seed.run_id}/regions/00000000/region.png"),
        "checkpoint": _write(composition, f"runs/{seed.run_id}/checkpoints/0/sample.json"),
    }
    if seed.export_id is not None:
        files["export"] = _write(composition, f"exports/{seed.export_id}/manifest.json")
    return files


def _add_checkpoint(composition: CompositionRoot, run_id: str) -> None:
    with composition.database.session() as session:
        session.add(
            StageCheckpoint(
                run_id=run_id,
                frame_index=0,
                stage="sample",
                attempt=1,
                status="completed",
                artifact_relpath=f"runs/{run_id}/checkpoints/0/sample.json",
                ocr_engine="stub",
                ocr_engine_version="1.0",
                ocr_runtime_sha256="1" * 64,
                ocr_model_sha256="2" * 64,
                ocr_config_hash="3" * 64,
                ocr_language="eng",
                ocr_page_segmentation_mode=6,
                experimental=False,
                quality_gate="passed",
                warning="",
            )
        )


def _set_run(composition: CompositionRoot, run_id: str, **values: Any) -> None:
    with composition.database.session() as session:
        run = session.get(PipelineRun, run_id)
        assert run is not None
        for name, value in values.items():
            setattr(run, name, value)


def _count(composition: CompositionRoot, model: Any, **where: Any) -> int:
    with composition.database.session() as session:
        statement = select(func.count()).select_from(model)
        for name, value in where.items():
            statement = statement.where(getattr(model, name) == value)
        return int(session.scalar(statement) or 0)


def _delete(client: TestClient, run_id: str, expected_version: int = 3) -> Any:
    return client.delete(f"/api/v1/runs/{run_id}", params={"expected_version": expected_version})


def test_delete_run_removes_every_derived_row_and_file(
    settings: Settings,
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    seed = _seed_run(composition, tmp_path)
    _add_checkpoint(composition, seed.run_id)
    files = _seed_files(composition, seed)
    unrelated_export = _write(composition, f"exports/{uuid4()}/manifest.json")
    with composition.database.session() as session:
        run = session.get(PipelineRun, seed.run_id)
        assert run is not None
        profile_id, video_id = run.profile_id, run.video_id

    with TestClient(create_app(settings, composition=composition)) as client:
        listed = client.get("/api/v1/runs").json()
        response = _delete(client, seed.run_id)
        detail = client.get(f"/api/v1/runs/{seed.run_id}")
        after = client.get("/api/v1/runs").json()

    assert [item["version"] for item in listed["items"]] == [3]
    assert response.status_code == 204, response.text
    assert response.content == b""
    assert detail.status_code == 404
    assert after["items"] == []
    assert after["total"] == 0
    assert _count(composition, PipelineRun, id=seed.run_id) == 0
    assert _count(composition, Frame, run_id=seed.run_id) == 0
    assert _count(composition, Annotation, id=seed.annotation_id) == 0
    assert _count(composition, Export, run_id=seed.run_id) == 0
    assert _count(composition, StageCheckpoint, run_id=seed.run_id) == 0
    assert all(not path.exists() for path in files.values())
    assert not composition.workspace.resolve_relpath(f"runs/{seed.run_id}").exists()
    assert not composition.workspace.resolve_relpath(f"exports/{seed.export_id}").exists()
    # The run's inputs and everything outside it stay.
    assert _count(composition, GameProfile, id=profile_id) == 1
    assert _count(composition, VideoAsset, id=video_id) == 1
    assert unrelated_export.exists()


@pytest.mark.parametrize(
    "state",
    [
        {"status": "running", "workflow_slot": 1, "current_stage": "ocr"},
        {
            "status": "paused",
            "workflow_slot": 1,
            "current_stage": None,
            "resume_token": "token",
            "resume_owner": "owner",
        },
    ],
    ids=["running", "resume-reserved"],
)
def test_delete_run_refuses_a_run_that_is_processing(
    settings: Settings,
    composition: CompositionRoot,
    tmp_path: Path,
    state: dict[str, Any],
) -> None:
    seed = _seed_run(composition, tmp_path, export_status=None)
    _set_run(composition, seed.run_id, **state)
    files = _seed_files(composition, seed)

    with TestClient(create_app(settings, composition=composition)) as client:
        response = _delete(client, seed.run_id)

    assert response.status_code == 409, response.text
    assert response.json()["error"]["code"] == "run_in_progress"
    assert _count(composition, PipelineRun, id=seed.run_id) == 1
    assert _count(composition, Frame, run_id=seed.run_id) == 1
    assert all(path.exists() for path in files.values())


def test_delete_run_waits_for_a_worker_job_that_has_not_returned(
    settings: Settings,
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    # The worker commits `paused` before its job returns; until then the run stays.
    seed = _seed_run(composition, tmp_path, run_status="paused", export_status=None)
    composition.dataset_workflow._processing.add(seed.run_id)

    with TestClient(create_app(settings, composition=composition)) as client:
        refused = _delete(client, seed.run_id)
        composition.dataset_workflow._processing.discard(seed.run_id)
        accepted = _delete(client, seed.run_id)

    assert refused.status_code == 409, refused.text
    assert refused.json()["error"]["code"] == "run_in_progress"
    assert accepted.status_code == 204, accepted.text


@pytest.mark.parametrize("export_status", ["queued", "running"])
def test_delete_run_refuses_while_an_export_writes_its_files(
    settings: Settings,
    composition: CompositionRoot,
    tmp_path: Path,
    export_status: str,
) -> None:
    seed = _seed_run(composition, tmp_path, export_status=export_status)

    with TestClient(create_app(settings, composition=composition)) as client:
        response = _delete(client, seed.run_id)

    assert response.status_code == 409, response.text
    assert response.json()["error"]["code"] == "export_running"
    assert _count(composition, PipelineRun, id=seed.run_id) == 1
    assert _count(composition, Export, run_id=seed.run_id) == 1


def test_delete_run_requires_the_current_version_and_an_existing_run(
    settings: Settings,
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    seed = _seed_run(composition, tmp_path)

    with TestClient(create_app(settings, composition=composition)) as client:
        stale = _delete(client, seed.run_id, expected_version=2)
        missing = _delete(client, str(uuid4()))
        invalid = _delete(client, seed.run_id, expected_version=0)

    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "version_conflict"
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "run_not_found"
    assert invalid.status_code == 400
    assert _count(composition, PipelineRun, id=seed.run_id) == 1


@pytest.mark.parametrize("status", ["queued", "paused", "failed", "cancelled", "completed"])
def test_delete_run_accepts_every_idle_status(
    settings: Settings,
    composition: CompositionRoot,
    tmp_path: Path,
    status: str,
) -> None:
    seed = _seed_run(
        composition,
        tmp_path,
        run_status=status,
        export_status="completed" if status == "completed" else None,
    )

    with TestClient(create_app(settings, composition=composition)) as client:
        response = _delete(client, seed.run_id)

    assert response.status_code == 204, response.text
    assert _count(composition, PipelineRun, id=seed.run_id) == 0


def test_deleting_an_unfinished_run_frees_the_dashboard(
    settings: Settings,
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    seed = _seed_run(composition, tmp_path, run_status="paused", export_status=None)

    with TestClient(create_app(settings, composition=composition)) as client:
        before = client.get("/api/v1/dashboard").json()
        response = _delete(client, seed.run_id)
        after = client.get("/api/v1/dashboard").json()

    assert before["run"]["id"] == seed.run_id
    assert response.status_code == 204, response.text
    assert after["run"] is None


def test_remove_reports_and_logs_a_file_it_cannot_delete(
    composition: CompositionRoot,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    run_id = str(uuid4())
    held = _write(composition, f"runs/{run_id}/frames/00000000.jpg")
    sleeps: list[float] = []
    artifacts = RunArtifacts(
        composition.workspace,
        logging.getLogger("test.run_artifacts"),
        attempts=3,
        retry_delay_seconds=0.01,
        sleep=sleeps.append,
    )

    def locked(path: Any, *args: Any, **kwargs: Any) -> None:
        raise PermissionError(32, "The process cannot access the file", str(path))

    monkeypatch.setattr(shutil, "rmtree", locked)
    with caplog.at_level(logging.WARNING, logger="test.run_artifacts"):
        removal = artifacts.remove(run_id, ())

    assert removal.removed == 0
    assert removal.left_behind == (f"runs/{run_id}",)
    assert sleeps == [0.01, 0.01]
    assert held.exists()
    assert any(record.message == "run_files_left_behind" for record in caplog.records)


def test_sweep_removes_only_unowned_uuid_entries(composition: CompositionRoot) -> None:
    owned_run, orphan_run = str(uuid4()), str(uuid4())
    owned_export, orphan_export, staging = str(uuid4()), str(uuid4()), str(uuid4())
    kept = [
        _write(composition, f"runs/{owned_run}/frames/00000000.jpg"),
        _write(composition, "runs/notes/readme.txt"),
        _write(composition, f"exports/{owned_export}/manifest.json"),
        _write(composition, f"exports/.{staging}-partial/manifest.json"),
    ]
    gone = [
        _write(composition, f"runs/{orphan_run}/frames/00000000.jpg"),
        _write(composition, f"exports/{orphan_export}/manifest.json"),
    ]
    artifacts = RunArtifacts(composition.workspace, logging.getLogger("test.run_artifacts"))

    result = artifacts.sweep_orphans(frozenset({owned_run}), frozenset({owned_export}))

    assert result == RunArtifactSweep(removed_runs=1, removed_exports=1)
    assert all(path.exists() for path in kept)
    assert all(not path.parent.exists() for path in gone)


def test_startup_sweeps_files_a_deleted_run_left_behind(
    settings: Settings,
    tmp_path: Path,
) -> None:
    first = build_composition(settings, resource_probe=AvailableResourceProbe())
    try:
        seed = _seed_run(first, tmp_path)
        kept = _write(first, f"runs/{seed.run_id}/frames/00000000.jpg")
        orphan = _write(first, f"runs/{uuid4()}/frames/00000000.jpg")
        orphan_export = _write(first, f"exports/{uuid4()}/manifest.json")
    finally:
        first.close()

    restarted = build_composition(settings, resource_probe=AvailableResourceProbe())
    try:
        assert kept.exists()
        assert not orphan.parent.parent.exists()
        assert not orphan_export.parent.exists()
    finally:
        restarted.close()
