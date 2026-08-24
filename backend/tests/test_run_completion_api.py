from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from backend.app.access.store.models import (
    Annotation,
    Category,
    Export,
    Frame,
    GameProfile,
    PipelineRun,
    Project,
    ReferenceAsset,
    VideoAsset,
)
from backend.app.composition import CompositionRoot
from backend.app.config import Settings
from backend.app.main import create_app


@dataclass(frozen=True)
class CompletionSeed:
    run_id: str
    frame_id: str
    annotation_id: str
    export_id: str | None


def _seed_run(
    composition: CompositionRoot,
    tmp_path: Path,
    *,
    run_status: str = "review_ready",
    export_status: str | None = "completed",
) -> CompletionSeed:
    project_id, asset_id, profile_id, video_id = (str(uuid4()) for _ in range(4))
    run_id, frame_id, category_id, annotation_id = (str(uuid4()) for _ in range(4))
    export_id = str(uuid4()) if export_status is not None else None
    source = tmp_path / f"{video_id}.mp4"
    source.write_bytes(b"video")

    with composition.database.session() as session:
        session.add(Project(id=project_id, name="DatasetFactory", workspace_path="workspace"))
        session.add(
            ReferenceAsset(
                id=asset_id,
                relpath=f"assets/references/{asset_id}.png",
                content_type="image/png",
                size_bytes=1,
                status="ready",
            )
        )
        session.flush()
        session.add(
            GameProfile(
                id=profile_id,
                project_id=project_id,
                name="Completion profile",
                normalized_name=f"completion-{profile_id}",
                reference_asset_id=asset_id,
                source_width=100,
                source_height=50,
                version=1,
            )
        )
        session.add(
            VideoAsset(
                id=video_id,
                project_id=project_id,
                local_path=str(source),
                size_bytes=source.stat().st_size,
                duration_ms=1000,
                width=100,
                height=50,
                fingerprint="fingerprint",
            )
        )
        session.flush()
        session.add(
            Category(
                id=category_id,
                profile_id=profile_id,
                name="0",
                kind="character",
                ordinal=0,
            )
        )
        session.add(
            PipelineRun(
                id=run_id,
                profile_id=profile_id,
                video_id=video_id,
                interval_ms=1000,
                status=run_status,
                attempt=1,
                total_frames=1,
                current_stage="review" if run_status == "review_ready" else None,
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
                version=3,
                review_revision=7,
            )
        )
        session.flush()
        session.add(
            Frame(
                id=frame_id,
                run_id=run_id,
                frame_index=0,
                timestamp_ms=0,
                image_relpath=f"runs/{run_id}/frames/00000000.jpg",
                stage_status="review_pending",
                review_status="accepted",
                width=100,
                height=50,
                version=4,
            )
        )
        session.flush()
        session.add(
            Annotation(
                id=annotation_id,
                frame_id=frame_id,
                category_id=category_id,
                x=1,
                y=2,
                width=3,
                height=4,
                confidence=None,
                source="manual",
                observation_id=None,
                status="accepted",
                version=5,
            )
        )
        if export_id is not None:
            session.add(
                Export(
                    id=export_id,
                    run_id=run_id,
                    status=export_status,
                    output_relpath=(
                        f"exports/{export_id}" if export_status == "completed" else None
                    ),
                    input_revision=7,
                    error_code="seeded_failure" if export_status == "failed" else None,
                    manifest_json="{}" if export_status == "completed" else None,
                )
            )
    return CompletionSeed(run_id, frame_id, annotation_id, export_id)


def _row_values(row: Any) -> tuple[Any, ...]:
    return tuple(getattr(row, column.name) for column in row.__table__.columns)


def _review_state(
    composition: CompositionRoot, seed: CompletionSeed
) -> tuple[tuple[Any, ...], tuple[Any, ...]]:
    with composition.database.session() as session:
        frame = session.get(Frame, seed.frame_id)
        annotation = session.get(Annotation, seed.annotation_id)
        assert frame is not None
        assert annotation is not None
        return _row_values(frame), _row_values(annotation)


def test_complete_run_closes_exported_review_and_removes_it_from_dashboard(
    settings: Settings,
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    seed = _seed_run(composition, tmp_path)
    before_review = _review_state(composition, seed)

    with TestClient(create_app(settings, composition=composition)) as client:
        before_dashboard = client.get("/api/v1/dashboard").json()
        response = client.post(
            f"/api/v1/runs/{seed.run_id}/complete",
            json={"expected_version": 3},
        )
        after_dashboard = client.get("/api/v1/dashboard").json()

    assert before_dashboard["run"]["id"] == seed.run_id
    assert response.status_code == 202, response.text
    assert response.json()["status"] == "completed"
    assert response.json()["version"] == 4
    assert response.json()["review_revision"] == 7
    assert after_dashboard["run"] is None
    assert after_dashboard["frame_counts"] == {
        "pending": 0,
        "accepted": 0,
        "rejected": 0,
        "total": 0,
    }
    assert _review_state(composition, seed) == before_review

    with composition.database.session() as session:
        completed_export = session.scalar(select(Export).where(Export.id == seed.export_id))
        assert completed_export is not None
        assert completed_export.status == "completed"
        assert completed_export.input_revision == 7


@pytest.mark.parametrize(
    "run_status",
    ["queued", "running", "paused", "completed", "failed", "cancelled"],
)
def test_complete_run_rejects_every_status_except_review_ready(
    settings: Settings,
    composition: CompositionRoot,
    tmp_path: Path,
    run_status: str,
) -> None:
    seed = _seed_run(composition, tmp_path, run_status=run_status)

    with TestClient(create_app(settings, composition=composition)) as client:
        response = client.post(
            f"/api/v1/runs/{seed.run_id}/complete",
            json={"expected_version": 3},
        )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "invalid_transition"


@pytest.mark.parametrize("export_status", [None, "queued", "running", "failed"])
def test_complete_run_requires_at_least_one_completed_export(
    settings: Settings,
    composition: CompositionRoot,
    tmp_path: Path,
    export_status: str | None,
) -> None:
    seed = _seed_run(composition, tmp_path, export_status=export_status)

    with TestClient(create_app(settings, composition=composition)) as client:
        response = client.post(
            f"/api/v1/runs/{seed.run_id}/complete",
            json={"expected_version": 3},
        )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "invalid_transition"


def test_complete_run_enforces_expected_version(
    settings: Settings,
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    seed = _seed_run(composition, tmp_path)

    with TestClient(create_app(settings, composition=composition)) as client:
        response = client.post(
            f"/api/v1/runs/{seed.run_id}/complete",
            json={"expected_version": 2},
        )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "version_conflict"


def test_complete_run_returns_not_found_for_unknown_run(
    settings: Settings,
    composition: CompositionRoot,
) -> None:
    with TestClient(create_app(settings, composition=composition)) as client:
        response = client.post(
            f"/api/v1/runs/{uuid4()}/complete",
            json={"expected_version": 1},
        )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "run_not_found"
