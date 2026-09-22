"""FE-018 A. Appending one HUD region to a profile that already exists.

The point of the route is as much what it must *not* do: an existing run keeps
its samples, its frame stages and its review decisions. Every assertion here
that claims "unchanged" reads the value before and after rather than comparing
against a constant, so an implementation that recomputed anything would fail.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.access.store.models import (
    Frame,
    GameProfile,
    HudRegion,
    PipelineRun,
    RegionSample,
    VideoAsset,
)
from backend.app.composition import CompositionRoot
from backend.app.main import create_app
from backend.tests.test_profile_workflow_api import _payload, _write_png


def _seed_run_with_sample(
    composition: CompositionRoot,
    *,
    profile_id: str,
    tmp_path: Path,
    holds_workflow_slot: bool = False,
    run_status: str | None = None,
) -> dict[str, str]:
    """One profile-bound run with a frame that is already cropped and accepted."""
    source = tmp_path / f"material-{uuid4().hex}.mp4"
    source.write_bytes(b"material")
    ids = {
        "frame": str(uuid4()),
        "run": str(uuid4()),
        "sample": str(uuid4()),
        "video": str(uuid4()),
    }
    with composition.database.session() as session:
        profile = session.get(GameProfile, profile_id)
        assert profile is not None
        region_id = session.scalar(
            select(HudRegion.id).where(HudRegion.profile_id == profile_id).limit(1)
        )
        assert region_id is not None
        ids["region"] = region_id
        session.add(
            VideoAsset(
                id=ids["video"],
                project_id=profile.project_id,
                local_path=str(source),
                size_bytes=source.stat().st_size,
                duration_ms=1000,
                width=100,
                height=50,
                fingerprint="fingerprint",
            )
        )
        session.flush()
        status = run_status or ("running" if holds_workflow_slot else "completed")
        session.add(
            PipelineRun(
                id=ids["run"],
                profile_id=profile_id,
                video_id=ids["video"],
                interval_ms=1000,
                status=status,
                workflow_slot=1 if status == "running" else None,
                attempt=1,
                total_frames=1,
                ocr_engine="stub",
                ocr_engine_version="1",
                ocr_runtime_sha256="1" * 64,
                ocr_model_sha256="2" * 64,
                ocr_config_hash="3" * 64,
                ocr_language="eng",
                ocr_page_segmentation_mode=6,
                experimental=False,
                quality_gate="passed",
                warning="",
                version=1,
                review_revision=0,
            )
        )
        session.flush()
        session.add(
            Frame(
                id=ids["frame"],
                run_id=ids["run"],
                frame_index=0,
                timestamp_ms=0,
                image_relpath="runs/frame.png",
                stage_status="review_pending",
                review_status="accepted",
                width=100,
                height=50,
                version=3,
            )
        )
        session.flush()
        session.add(
            RegionSample(
                id=ids["sample"],
                frame_id=ids["frame"],
                region_id=region_id,
                crop_relpath="runs/crop.png",
                stage_status="ocr_complete",
            )
        )
        session.flush()
    return ids


def _region_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "name": "timer",
        "x": 4,
        "y": 4,
        "width": 8,
        "height": 8,
        "expected_version": 1,
    }
    payload.update(overrides)
    return payload


def test_added_region_gets_its_own_identity_and_bumps_the_profile_version(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    source = tmp_path / "reference.png"
    _write_png(source)
    app = create_app(composition.settings, composition=composition)

    with TestClient(app) as client:
        created = client.post("/api/v1/profiles", json=_payload(source))
        profile_id = created.json()["id"]
        existing_region_id = created.json()["regions"][0]["id"]

        response = client.post(
            f"/api/v1/profiles/{profile_id}/regions",
            json=_region_payload(),
        )
        reloaded = client.get(f"/api/v1/profiles/{profile_id}")

    assert response.status_code == 201
    body = response.json()
    assert body["version"] == 2
    assert [region["name"] for region in body["regions"]] == ["HUD", "timer"]
    added = body["regions"][1]
    assert added["id"] not in {"", existing_region_id}
    assert (added["x"], added["y"], added["width"], added["height"]) == (4, 4, 8, 8)
    # The existing region keeps the identity `region_samples` point at.
    assert body["regions"][0]["id"] == existing_region_id
    assert reloaded.json() == body


def test_added_region_rejects_a_casefolded_trimmed_duplicate_name(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    source = tmp_path / "reference.png"
    _write_png(source)
    app = create_app(composition.settings, composition=composition)

    with TestClient(app) as client:
        created = client.post("/api/v1/profiles", json=_payload(source))
        profile_id = created.json()["id"]
        response = client.post(
            f"/api/v1/profiles/{profile_id}/regions",
            json=_region_payload(name="  hUd  "),
        )
        reloaded = client.get(f"/api/v1/profiles/{profile_id}")

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "region_name_exists"
    assert response.json()["error"]["details"] == {
        "region_id": created.json()["regions"][0]["id"],
        "region_name": "HUD",
    }
    # A refused add writes nothing at all, the version included.
    assert reloaded.json()["version"] == 1
    assert len(reloaded.json()["regions"]) == 1


def test_region_unique_integrity_fallback_maps_to_conflict_response(
    composition: CompositionRoot,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = tmp_path / "reference.png"
    _write_png(source)
    app = create_app(composition.settings, composition=composition)

    with TestClient(app) as client:
        created = client.post("/api/v1/profiles", json=_payload(source))
        profile_id = created.json()["id"]

        original_flush = Session.flush

        def fail_on_region_insert(session: Session, *args: Any, **kwargs: Any) -> None:
            """Only the region INSERT fails.

            A blanket stub would also break the read that precedes the write, and
            the test would pass for the wrong reason.
            """
            if any(isinstance(pending, HudRegion) for pending in session.new):
                raise IntegrityError(
                    "INSERT INTO hud_regions (...) VALUES (...)",
                    {},
                    sqlite3.IntegrityError(
                        "UNIQUE constraint failed: hud_regions.profile_id, hud_regions.name"
                    ),
                )
            original_flush(session, *args, **kwargs)

        monkeypatch.setattr(Session, "flush", fail_on_region_insert)
        response = client.post(
            f"/api/v1/profiles/{profile_id}/regions",
            json=_region_payload(),
        )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "region_name_exists"


@pytest.mark.parametrize(
    ("overrides", "expected_code"),
    (
        ({"x": 30, "width": 8}, "region_out_of_bounds"),
        ({"y": 20, "height": 8}, "region_out_of_bounds"),
        ({"name": "   "}, "invalid_region_name"),
    ),
    ids=("past-right-edge", "past-bottom-edge", "blank-name"),
)
def test_added_region_is_validated_against_the_reference_image_at_add_time(
    overrides: dict[str, object],
    expected_code: str,
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    """`crop_regions` raises `crop_out_of_bounds` only during a run. This is the
    same rule, applied while the operator is still looking at the rectangle."""
    source = tmp_path / "reference.png"
    _write_png(source, width=32, height=24)
    app = create_app(composition.settings, composition=composition)

    with TestClient(app) as client:
        created = client.post("/api/v1/profiles", json=_payload(source))
        profile_id = created.json()["id"]
        response = client.post(
            f"/api/v1/profiles/{profile_id}/regions",
            json=_region_payload(**overrides),
        )
        reloaded = client.get(f"/api/v1/profiles/{profile_id}")

    assert response.status_code == 400
    assert response.json()["error"]["code"] == expected_code
    assert response.json()["error"]["details"] == {"field": "regions"}
    assert len(reloaded.json()["regions"]) == 1


def test_added_region_leaves_the_finished_run_exactly_as_it_was(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    source = tmp_path / "reference.png"
    _write_png(source)
    app = create_app(composition.settings, composition=composition)

    with TestClient(app) as client:
        created = client.post("/api/v1/profiles", json=_payload(source))
        profile_id = created.json()["id"]
        ids = _seed_run_with_sample(composition, profile_id=profile_id, tmp_path=tmp_path)

        with composition.database.session() as session:
            before_samples = tuple(
                (sample.id, sample.region_id, sample.crop_relpath, sample.stage_status)
                for sample in session.scalars(select(RegionSample).order_by(RegionSample.id))
            )
            frame = session.get(Frame, ids["frame"])
            assert frame is not None
            before_frame = (frame.stage_status, frame.review_status, frame.version)
            run = session.get(PipelineRun, ids["run"])
            assert run is not None
            before_run = (run.status, run.version, run.review_revision)

        response = client.post(
            f"/api/v1/profiles/{profile_id}/regions",
            json=_region_payload(),
        )

    assert response.status_code == 201
    assert len(response.json()["regions"]) == 2
    with composition.database.session() as session:
        after_samples = tuple(
            (sample.id, sample.region_id, sample.crop_relpath, sample.stage_status)
            for sample in session.scalars(select(RegionSample).order_by(RegionSample.id))
        )
        frame = session.get(Frame, ids["frame"])
        assert frame is not None
        after_frame = (frame.stage_status, frame.review_status, frame.version)
        run = session.get(PipelineRun, ids["run"])
        assert run is not None
        after_run = (run.status, run.version, run.review_revision)
        sample_count = session.scalar(select(func.count()).select_from(RegionSample))

    # Same rows, same count: no sample appeared for a region that did not exist
    # when this frame was cropped.
    assert after_samples == before_samples
    assert sample_count == 1
    assert after_frame == before_frame
    assert after_run == before_run


def test_added_region_rejects_a_stale_profile_version(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    source = tmp_path / "reference.png"
    _write_png(source)
    app = create_app(composition.settings, composition=composition)

    with TestClient(app) as client:
        created = client.post("/api/v1/profiles", json=_payload(source))
        profile_id = created.json()["id"]
        first = client.post(
            f"/api/v1/profiles/{profile_id}/regions",
            json=_region_payload(name="timer", expected_version=1),
        )
        stale = client.post(
            f"/api/v1/profiles/{profile_id}/regions",
            json=_region_payload(name="ammo", expected_version=1),
        )
        reloaded = client.get(f"/api/v1/profiles/{profile_id}")

    assert first.status_code == 201
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "version_conflict"
    assert [region["name"] for region in reloaded.json()["regions"]] == ["HUD", "timer"]


def test_added_region_is_refused_while_a_run_on_this_profile_owns_the_slot(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    """The crop stage reads regions live (`FrameRepository._processing_record`),
    so a run with frames still to crop would apply the new region to part of its
    own output. Refusing keeps "from the next run onwards" literally true."""
    source = tmp_path / "reference.png"
    _write_png(source)
    app = create_app(composition.settings, composition=composition)

    with TestClient(app) as client:
        created = client.post("/api/v1/profiles", json=_payload(source))
        profile_id = created.json()["id"]
        _seed_run_with_sample(
            composition,
            profile_id=profile_id,
            tmp_path=tmp_path,
            holds_workflow_slot=True,
        )
        response = client.post(
            f"/api/v1/profiles/{profile_id}/regions",
            json=_region_payload(),
        )
        reloaded = client.get(f"/api/v1/profiles/{profile_id}")

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "active_run"
    assert len(reloaded.json()["regions"]) == 1
    assert reloaded.json()["version"] == 1


@pytest.mark.parametrize("run_status", ("queued", "paused", "failed", "cancelled"))
def test_added_region_is_refused_while_same_profile_work_can_still_run(
    run_status: str,
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    """Re-runnable work has released the slot, but resume/start would still
    read the profile's live regions and mix two region sets in one run."""
    source = tmp_path / "reference.png"
    _write_png(source)
    app = create_app(composition.settings, composition=composition)

    with TestClient(app) as client:
        created = client.post("/api/v1/profiles", json=_payload(source))
        profile_id = created.json()["id"]
        _seed_run_with_sample(
            composition,
            profile_id=profile_id,
            tmp_path=tmp_path,
            run_status=run_status,
        )
        response = client.post(
            f"/api/v1/profiles/{profile_id}/regions",
            json=_region_payload(),
        )
        reloaded = client.get(f"/api/v1/profiles/{profile_id}")

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "active_run"
    assert len(reloaded.json()["regions"]) == 1
    assert reloaded.json()["version"] == 1


def test_added_region_ignores_a_run_that_belongs_to_another_profile(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    """Narrower than the gate on `activate`: another profile's run cannot read
    these regions, so there is nothing to protect."""
    source = tmp_path / "reference.png"
    _write_png(source)
    app = create_app(composition.settings, composition=composition)

    with TestClient(app) as client:
        target = client.post("/api/v1/profiles", json=_payload(source, name="Target"))
        other = client.post("/api/v1/profiles", json=_payload(source, name="Other"))
        _seed_run_with_sample(
            composition,
            profile_id=other.json()["id"],
            tmp_path=tmp_path,
            holds_workflow_slot=True,
        )
        response = client.post(
            f"/api/v1/profiles/{target.json()['id']}/regions",
            json=_region_payload(),
        )

    assert response.status_code == 201
    assert [region["name"] for region in response.json()["regions"]] == ["HUD", "timer"]


def test_added_region_rejects_a_missing_profile(composition: CompositionRoot) -> None:
    app = create_app(composition.settings, composition=composition)

    with TestClient(app) as client:
        response = client.post("/api/v1/profiles/missing/regions", json=_region_payload())

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "profile_not_found"
