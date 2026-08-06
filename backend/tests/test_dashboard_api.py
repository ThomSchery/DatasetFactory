from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, func, select

from backend.app.access.store.models import (
    Annotation,
    Category,
    Frame,
    GameProfile,
    HudRegion,
    PipelineRun,
    Project,
    ReferenceAsset,
    VideoAsset,
)
from backend.app.composition import CompositionRoot
from backend.app.config import Settings
from backend.app.main import create_app
from backend.app.managers.workflow.manager import TESSERACT_QUALITY_WARNING

TECH_PLAN = Path("docs/TECH_PLAN.md")


@dataclass(frozen=True)
class DashboardSeed:
    project_id: str
    profile_id: str
    run_id: str
    frame_ids: tuple[str, ...]
    category_id: str


def _seed(
    composition: CompositionRoot,
    tmp_path: Path,
    *,
    frames: int = 4,
    status: str = "review_ready",
    experimental: bool = False,
    quality_gate: str = "passed",
    warning: str = "",
) -> DashboardSeed:
    project_id, asset_id, profile_id = (str(uuid4()) for _ in range(3))
    video_id, run_id, region_id, category_id = (str(uuid4()) for _ in range(4))
    frame_ids = tuple(str(uuid4()) for _ in range(frames))
    source = tmp_path / f"{run_id}.mp4"
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
                name=f"Profile-{profile_id}",
                normalized_name=profile_id,
                reference_asset_id=asset_id,
                source_width=100,
                source_height=50,
                version=1,
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
            HudRegion(
                id=region_id,
                profile_id=profile_id,
                name="HUD",
                x=0,
                y=0,
                width=10,
                height=10,
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
            PipelineRun(
                id=run_id,
                profile_id=profile_id,
                video_id=video_id,
                interval_ms=1000,
                status=status,
                attempt=1,
                total_frames=frames,
                ocr_engine="tesseract",
                ocr_engine_version="5.4.0",
                ocr_runtime_sha256="1" * 64,
                ocr_model_sha256="2" * 64,
                ocr_config_hash="3" * 64,
                ocr_language="eng",
                ocr_page_segmentation_mode=6,
                experimental=experimental,
                quality_gate=quality_gate,
                warning=warning,
                version=1,
                review_revision=0,
            )
        )
        session.flush()
        for index, frame_id in enumerate(frame_ids):
            session.add(
                Frame(
                    id=frame_id,
                    run_id=run_id,
                    frame_index=index,
                    timestamp_ms=index * 1000,
                    image_relpath=f"runs/{run_id}/frames/{index:08d}.jpg",
                    stage_status="review_pending",
                    review_status="pending",
                    width=100,
                    height=50,
                    version=1,
                )
            )
        session.flush()
        # Every frame carries one valid box, so `accept` is reachable for all of them.
        for frame_id in frame_ids:
            session.add(
                Annotation(
                    id=str(uuid4()),
                    frame_id=frame_id,
                    category_id=category_id,
                    x=1,
                    y=2,
                    width=3,
                    height=4,
                    confidence=None,
                    source="manual",
                    observation_id=None,
                    status="proposed",
                    version=1,
                )
            )
    return DashboardSeed(project_id, profile_id, run_id, frame_ids, category_id)


def _decide(client: TestClient, frame_id: str, decision: str) -> int:
    """Apply one review decision at the frame's current version, returning the new one."""
    version = int(client.get(f"/api/v1/frames/{frame_id}").json()["version"])
    response = client.post(
        f"/api/v1/frames/{frame_id}/review",
        json={"decision": decision, "expected_version": version},
    )
    assert response.status_code == 200, response.json()
    return int(response.json()["version"])


def _documented_shape() -> dict[str, Any]:
    """The `GET /dashboard` example from TECH_PLAN §5, so drift fails here first."""
    blocks = re.findall(r"```json\n(.*?)```", TECH_PLAN.read_text(encoding="utf-8"), re.DOTALL)
    documented = [json.loads(block) for block in blocks if '"frame_counts"' in block]
    assert len(documented) == 1, "TECH_PLAN §5 must document exactly one dashboard DTO"
    return dict(documented[0])


def _keys(value: Any) -> Any:
    return {key: _keys(item) for key, item in value.items()} if isinstance(value, dict) else None


def test_dashboard_response_matches_the_tech_plan_dto(
    settings: Settings,
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    _seed(composition, tmp_path)
    with TestClient(create_app(settings, composition=composition)) as client:
        response = client.get("/api/v1/dashboard")

    assert response.status_code == 200
    body = response.json()
    documented = _documented_shape()

    assert set(body) == set(documented)
    for key, sample in documented.items():
        # `run` and `system` are documented as references to their own endpoints;
        # the two tests below pin them against those endpoints directly.
        if isinstance(sample, dict):
            assert _keys(body[key]) == _keys(sample), key


def test_dashboard_run_and_system_are_the_same_objects_the_other_endpoints_serve(
    settings: Settings,
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    seed = _seed(composition, tmp_path)
    with TestClient(create_app(settings, composition=composition)) as client:
        body = client.get("/api/v1/dashboard").json()
        run = client.get(f"/api/v1/runs/{seed.run_id}").json()
        health = client.get("/api/v1/health").json()

    assert body["run"] == run
    assert body["system"] == health
    assert body["project"] == {"id": seed.project_id, "name": "DatasetFactory"}
    assert body["profile"]["id"] == seed.profile_id
    assert "workspace_path" not in body["project"]


def test_dashboard_empty_state_is_200_and_writes_nothing(
    settings: Settings,
    composition: CompositionRoot,
) -> None:
    with TestClient(create_app(settings, composition=composition)) as client:
        response = client.get("/api/v1/dashboard")

    assert response.status_code == 200
    body = response.json()
    assert body["project"] is None
    assert body["profile"] is None
    assert body["run"] is None
    assert body["frame_counts"] == {"pending": 0, "accepted": 0, "rejected": 0, "total": 0}
    assert body["system"]["status"] == "ok"

    # Read-only: reading the dashboard must not mint the project row.
    with composition.database.session() as session:
        assert session.scalar(select(func.count()).select_from(Project)) == 0


def test_dashboard_counts_follow_review_decisions_including_reopen(
    settings: Settings,
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    seed = _seed(composition, tmp_path, frames=4)
    accepted, rejected, reopened, untouched = seed.frame_ids

    with TestClient(create_app(settings, composition=composition)) as client:
        assert client.get("/api/v1/dashboard").json()["frame_counts"] == {
            "pending": 4,
            "accepted": 0,
            "rejected": 0,
            "total": 4,
        }

        _decide(client, accepted, "accept")
        _decide(client, rejected, "reject")
        _decide(client, reopened, "reject")
        after_rejects = client.get("/api/v1/dashboard").json()["frame_counts"]

        # `reopen` moves the frame back out of `rejected`, so the counts must move too.
        _decide(client, reopened, "reopen")
        after_reopen = client.get("/api/v1/dashboard").json()["frame_counts"]

        assert client.get(f"/api/v1/frames/{untouched}").json()["review_status"] == "pending"

    assert after_rejects == {"pending": 1, "accepted": 1, "rejected": 2, "total": 4}
    assert after_reopen == {"pending": 2, "accepted": 1, "rejected": 1, "total": 4}


def test_dashboard_carries_the_experimental_ocr_warning(
    settings: Settings,
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    seed = _seed(
        composition,
        tmp_path,
        experimental=True,
        quality_gate="failed",
        warning=TESSERACT_QUALITY_WARNING,
    )
    with TestClient(create_app(settings, composition=composition)) as client:
        body = client.get("/api/v1/dashboard").json()
        run = client.get(f"/api/v1/runs/{seed.run_id}").json()

    assert body["run"]["experimental"] is True
    assert body["run"]["quality_gate"] == "failed"
    assert body["run"]["warning"] == TESSERACT_QUALITY_WARNING
    assert body["run"]["warning"] == run["warning"]


@pytest.mark.parametrize(
    ("status", "expected"),
    [
        ("queued", True),
        ("running", True),
        ("paused", True),
        ("review_ready", True),
        ("failed", True),
        ("cancelled", True),
        ("completed", False),
    ],
)
def test_dashboard_active_run_covers_every_nonterminal_status(
    settings: Settings,
    composition: CompositionRoot,
    tmp_path: Path,
    status: str,
    expected: bool,
) -> None:
    seed = _seed(composition, tmp_path, frames=1, status=status)
    with TestClient(create_app(settings, composition=composition)) as client:
        body = client.get("/api/v1/dashboard").json()

    assert (body["run"] is not None) is expected
    if expected:
        assert body["run"]["id"] == seed.run_id
        assert body["frame_counts"]["total"] == 1
    else:
        assert body["frame_counts"] == {"pending": 0, "accepted": 0, "rejected": 0, "total": 0}


def test_dashboard_query_count_does_not_grow_with_the_number_of_frames(
    settings: Settings,
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    """The counts come from one aggregate, so a bigger run must not cost more queries."""
    seed = _seed(composition, tmp_path, frames=2)
    statements: list[str] = []

    @event.listens_for(composition.database.engine, "before_cursor_execute")
    def record(conn: Any, cursor: Any, statement: str, *_: Any) -> None:
        statements.append(statement)

    try:
        with TestClient(create_app(settings, composition=composition)) as client:
            client.get("/api/v1/dashboard")
            small = len(statements)

            with composition.database.session() as session:
                run = session.get(PipelineRun, seed.run_id)
                assert run is not None
                run.total_frames = 60
                for index in range(2, 60):
                    session.add(
                        Frame(
                            id=str(uuid4()),
                            run_id=seed.run_id,
                            frame_index=index,
                            timestamp_ms=index * 1000,
                            image_relpath=f"runs/{seed.run_id}/frames/{index:08d}.jpg",
                            stage_status="review_pending",
                            review_status="accepted" if index % 2 else "pending",
                            width=100,
                            height=50,
                            version=1,
                        )
                    )

            statements.clear()
            client.get("/api/v1/dashboard")
            large = len(statements)
    finally:
        event.remove(composition.database.engine, "before_cursor_execute", record)

    assert large == small
