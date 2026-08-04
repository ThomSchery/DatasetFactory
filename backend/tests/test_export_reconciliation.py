from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select

from backend.app.access.store.models import Annotation, Export, Frame, PipelineRun
from backend.app.access.store.reconciliation import (
    ExportReconciler,
    ExportReconciliationResult,
)
from backend.app.access.store.repositories.exports import ExportRepository
from backend.app.composition import CompositionRoot, build_composition
from backend.app.config import Settings
from backend.app.main import create_app
from backend.tests.conftest import AvailableResourceProbe
from backend.tests.test_coco_export import _seed_export, _wait_for_export


def _review_state(composition: CompositionRoot, run_id: str) -> tuple[object, ...]:
    with composition.database.session() as session:
        run = session.get(PipelineRun, run_id)
        assert run is not None
        frames = tuple(
            session.execute(
                select(Frame.id, Frame.review_status, Frame.version)
                .where(Frame.run_id == run_id)
                .order_by(Frame.frame_index)
            )
        )
        annotations = tuple(
            session.execute(
                select(
                    Annotation.id,
                    Annotation.status,
                    Annotation.category_id,
                    Annotation.version,
                )
                .join(Frame, Frame.id == Annotation.frame_id)
                .where(Frame.run_id == run_id)
                .order_by(Annotation.id)
            )
        )
        return run.review_revision, frames, annotations


def _assert_retry_succeeds(composition: CompositionRoot, run_id: str) -> None:
    app = create_app(composition.settings, composition=composition)
    with TestClient(app) as client:
        response = client.post("/api/v1/exports", json={"run_id": run_id})
        assert response.status_code == 202, response.text
        _wait_for_export(composition.export_use_cases, response.json()["id"], expected="completed")


def test_reconciliation_recovers_crash_before_rename_and_is_idempotent(
    settings: Settings,
    tmp_path: Path,
) -> None:
    first = build_composition(settings, resource_probe=AvailableResourceProbe())
    try:
        seed = _seed_export(first, tmp_path)
        repository = ExportRepository(first.database, first.workspace)
        export_id = str(uuid4())
        repository.create_snapshot(seed.run_id, export_id=export_id)
        with first.database.session() as session:
            queued = session.get(Export, export_id)
            assert queued is not None
            queued.status = "queued"
        temporary = first.workspace.resolve_relpath(f"exports/.{export_id}-crashed")
        temporary.mkdir()
        (temporary / "partial.json").write_bytes(b"partial")
        review_before = _review_state(first, seed.run_id)
    finally:
        first.close()

    restarted = build_composition(settings, resource_probe=AvailableResourceProbe())
    try:
        repository = ExportRepository(restarted.database, restarted.workspace)
        assert temporary.exists() is False
        interrupted = repository.get(export_id)
        assert interrupted.status == "failed"
        assert interrupted.error_code == "export_process_interrupted"
        assert interrupted.output_relpath is None
        assert interrupted.manifest is None
        assert _review_state(restarted, seed.run_id) == review_before

        reconciler = ExportReconciler(restarted.database, restarted.workspace)
        second = reconciler.reconcile()
        third = reconciler.reconcile()
        assert second == third == ExportReconciliationResult(0, 0, 0)
        assert _review_state(restarted, seed.run_id) == review_before
        _assert_retry_succeeds(restarted, seed.run_id)
    finally:
        restarted.close()


def test_reconciliation_recovers_crash_after_rename_before_commit(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    seed = _seed_export(composition, tmp_path)
    repository = ExportRepository(composition.database, composition.workspace)
    export_id = str(uuid4())
    repository.create_snapshot(seed.run_id, export_id=export_id)
    final_path = composition.workspace.resolve_relpath(f"exports/{export_id}")
    final_path.mkdir()
    (final_path / "annotations.json").write_bytes(b"complete-but-uncommitted")
    review_before = _review_state(composition, seed.run_id)

    result = ExportReconciler(composition.database, composition.workspace).reconcile()

    assert result == ExportReconciliationResult(
        removed_temporary=0,
        removed_final=1,
        failed_interrupted=1,
    )
    assert final_path.exists() is False
    interrupted = repository.get(export_id)
    assert interrupted.status == "failed"
    assert interrupted.error_code == "export_process_interrupted"
    assert _review_state(composition, seed.run_id) == review_before
    _assert_retry_succeeds(composition, seed.run_id)


def test_completed_export_and_review_state_survive_startup_untouched(
    settings: Settings,
    tmp_path: Path,
) -> None:
    first = build_composition(settings, resource_probe=AvailableResourceProbe())
    try:
        seed = _seed_export(first, tmp_path)
        app = create_app(settings, composition=first)
        with TestClient(app) as client:
            response = client.post("/api/v1/exports", json={"run_id": seed.run_id})
            assert response.status_code == 202
            completed = _wait_for_export(
                first.export_use_cases,
                response.json()["id"],
                expected="completed",
            )
        export_id = str(completed["id"])
        output = first.workspace.resolve_relpath(str(completed["output_relpath"]))
        files_before = {
            path.relative_to(output).as_posix(): path.read_bytes()
            for path in output.rglob("*")
            if path.is_file()
        }
        completed_temp = first.workspace.resolve_relpath(f"exports/.{export_id}-preserve")
        completed_temp.mkdir()
        (completed_temp / "sentinel").write_bytes(b"completed-private-artifact")
        review_before = _review_state(first, seed.run_id)
    finally:
        first.close()

    restarted = build_composition(settings, resource_probe=AvailableResourceProbe())
    try:
        repository = ExportRepository(restarted.database, restarted.workspace)
        assert vars(repository.get(export_id)) == completed
        assert {
            path.relative_to(output).as_posix(): path.read_bytes()
            for path in output.rglob("*")
            if path.is_file()
        } == files_before
        assert (completed_temp / "sentinel").read_bytes() == b"completed-private-artifact"
        assert _review_state(restarted, seed.run_id) == review_before
        assert ExportReconciler(restarted.database, restarted.workspace).reconcile() == (
            ExportReconciliationResult(0, 0, 0)
        )
    finally:
        restarted.close()
