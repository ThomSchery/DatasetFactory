"""FE-021. Saving a whole profile definition without rewriting finished runs.

The user asked to overwrite profiles, and a real profile already has a run. So
every assertion about history here reads the *run's* view, not the row count: a
resize that silently re-interpreted an old run's crops would keep every row and
still corrupt the dataset. Geometry therefore comes from the run's own
snapshot, and a removed region is retired rather than deleted.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from backend.app.access.store.models import (
    Annotation,
    Category,
    Frame,
    GameProfile,
    HudRegion,
    OcrObservation,
    PipelineRun,
    RegionSample,
    VideoAsset,
)
from backend.app.access.store.ocr_regions import (
    RegionOcrSnapshot,
    encode_region_ocr_snapshots,
)
from backend.app.access.store.repositories.frames import FrameRepository
from backend.app.composition import CompositionRoot
from backend.app.engines.definition import BBox, OcrProvenance
from backend.app.main import create_app
from backend.tests.test_durable_workflow import (
    PerRegionOcrEngine,
    StubMediaAccess,
    _install_workflow,
)
from backend.tests.test_profile_workflow_api import _write_png

REFERENCE_WIDTH = 32
REFERENCE_HEIGHT = 24


def _create_payload(source: Path, *, name: str = "Save Game") -> dict[str, Any]:
    return {
        "name": name,
        "reference_image_path": str(source.resolve()),
        "regions": [
            {
                "name": "HUD",
                "x": 0,
                "y": 0,
                "width": 16,
                "height": 12,
                "allowed_chars": "0",
                "page_segmentation_mode": 7,
            },
            {
                "name": "timer",
                "x": 16,
                "y": 12,
                "width": 8,
                "height": 8,
                "allowed_chars": "1",
                "page_segmentation_mode": 7,
            },
        ],
        "categories": [
            {"name": "0", "kind": "character"},
            {"name": "1", "kind": "character"},
            {"name": "health", "kind": "game"},
        ],
    }


def _named(items: list[dict[str, Any]], name: str) -> dict[str, Any]:
    """Look a region or class up by name.

    Stored order is creation order, which these tests must not depend on; what
    they do depend on is that a name identifies one entry.
    """
    return next(item for item in items if item["name"] == name)


def _definition(profile: dict[str, Any]) -> dict[str, Any]:
    """The draft a client holds right after loading a profile: nothing changed."""
    return {
        "regions": [
            {
                "id": region["id"],
                "name": region["name"],
                "x": region["x"],
                "y": region["y"],
                "width": region["width"],
                "height": region["height"],
                "allowed_chars": region["allowed_chars"],
                "page_segmentation_mode": region["page_segmentation_mode"],
            }
            for region in sorted(profile["regions"], key=lambda region: region["name"])
        ],
        "categories": [
            {"id": category["id"], "name": category["name"], "kind": category["kind"]}
            for category in profile["categories"]
        ],
        "expected_version": profile["version"],
    }


def _provenance() -> OcrProvenance:
    return OcrProvenance(
        engine_id="stub",
        engine_version="1",
        runtime_sha256="1" * 64,
        model_sha256="2" * 64,
        config_hash="3" * 64,
        experimental=False,
        quality_gate="passed",
        language="eng",
        page_segmentation_mode=7,
    )


def _seed_run(
    composition: CompositionRoot,
    *,
    profile: dict[str, Any],
    tmp_path: Path,
    status: str = "completed",
    with_annotation: bool = False,
) -> dict[str, str]:
    """One run that recorded the profile exactly as it looks right now.

    This is what `DatasetWorkflow.create_run` writes, assembled directly so the
    test can hold a finished run without driving the whole pipeline.
    """
    source = tmp_path / f"material-{uuid4().hex}.mp4"
    source.write_bytes(b"material")
    ids = {
        "run": str(uuid4()),
        "video": str(uuid4()),
        "frame": str(uuid4()),
        "sample": str(uuid4()),
        "observation": str(uuid4()),
        "annotation": str(uuid4()),
    }
    snapshots = tuple(
        RegionOcrSnapshot(
            region_id=region["id"],
            region_name=region["name"],
            bbox=BBox(region["x"], region["y"], region["width"], region["height"]),
            allowed_chars=tuple(region["allowed_chars"]),
            page_segmentation_mode=region["page_segmentation_mode"],
            provenance=_provenance(),
        )
        for region in profile["regions"]
    )
    with composition.database.session() as session:
        stored = session.get(GameProfile, profile["id"])
        assert stored is not None
        session.add(
            VideoAsset(
                id=ids["video"],
                project_id=stored.project_id,
                local_path=str(source),
                size_bytes=source.stat().st_size,
                duration_ms=1000,
                width=REFERENCE_WIDTH,
                height=REFERENCE_HEIGHT,
                fingerprint="fingerprint",
            )
        )
        session.flush()
        session.add(
            PipelineRun(
                id=ids["run"],
                profile_id=profile["id"],
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
                ocr_config_hash=None,
                ocr_language="eng",
                ocr_page_segmentation_mode=None,
                experimental=False,
                quality_gate="passed",
                warning="",
                ocr_region_config_json=encode_region_ocr_snapshots(snapshots),
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
                width=REFERENCE_WIDTH,
                height=REFERENCE_HEIGHT,
                version=3,
            )
        )
        session.flush()
        session.add(
            RegionSample(
                id=ids["sample"],
                frame_id=ids["frame"],
                region_id=_named(profile["regions"], "HUD")["id"],
                crop_relpath="runs/crop.png",
                stage_status="ocr_complete",
            )
        )
        session.flush()
        session.add(
            OcrObservation(
                id=ids["observation"],
                sample_id=ids["sample"],
                char="0",
                x=1,
                y=2,
                width=3,
                height=4,
                confidence=0.9,
                engine="stub",
                engine_version="1",
                runtime_sha256="1" * 64,
                model_sha256="2" * 64,
                config_hash="3" * 64,
                language="eng",
                page_segmentation_mode=7,
                experimental=False,
                quality_gate="passed",
                warning="",
                valid=True,
                rejection_code=None,
            )
        )
        session.flush()
        if with_annotation:
            session.add(
                Annotation(
                    id=ids["annotation"],
                    frame_id=ids["frame"],
                    category_id=_named(profile["categories"], "0")["id"],
                    x=1,
                    y=2,
                    width=3,
                    height=4,
                    confidence=0.9,
                    source="ocr",
                    observation_id=ids["observation"],
                    status="accepted",
                    version=1,
                )
            )
            session.flush()
    return ids


def test_inherited_ocr_survives_edit_and_copy(composition: CompositionRoot, tmp_path: Path) -> None:
    source = tmp_path / "reference.png"
    _write_png(source, width=REFERENCE_WIDTH, height=REFERENCE_HEIGHT)
    app = create_app(composition.settings, composition=composition)
    with TestClient(app) as client:
        payload = _create_payload(source)
        payload["regions"][0]["allowed_chars"] = None
        payload["regions"][0]["page_segmentation_mode"] = None
        profile = client.post("/api/v1/profiles", json=payload).json()
        draft = _definition(profile)
        hud = _named(draft["regions"], "HUD")
        hud.update(name="renamed", x=2, width=12)
        response = client.put(f"/api/v1/profiles/{profile['id']}/definition", json=draft)
        assert response.status_code == 200, response.text
        saved = client.get(f"/api/v1/profiles/{profile['id']}").json()
        region = _named(saved["regions"], "renamed")
        assert (region["allowed_chars"], region["page_segmentation_mode"]) == (None, None)
        assert (region["x"], region["width"]) == (2, 12)
        copy_payload = _definition(saved)
        copy_payload.pop("expected_version")
        for item in copy_payload["regions"] + copy_payload["categories"]:
            item.pop("id")
        copy_payload.update(name="copy", reference_asset_id=saved["reference_asset_id"])
        copy = client.post("/api/v1/profiles", json=copy_payload)
        assert copy.status_code == 201, copy.text
        copied = _named(
            client.get(f"/api/v1/profiles/{copy.json()['id']}").json()["regions"], "renamed"
        )
        assert (copied["allowed_chars"], copied["page_segmentation_mode"]) == (None, None)
        assert copied["id"] != region["id"]
        explicit = _definition(saved)
        _named(explicit["regions"], "renamed").update(allowed_chars="01", page_segmentation_mode=6)
        changed = client.put(f"/api/v1/profiles/{profile['id']}/definition", json=explicit)
        assert changed.status_code == 200, changed.text
        changed_region = _named(changed.json()["regions"], "renamed")
        assert (changed_region["allowed_chars"], changed_region["page_segmentation_mode"]) == (
            "01",
            6,
        )


def test_inherited_ocr_keeps_old_run_snapshot_and_new_run_uses_fallback(
    composition: CompositionRoot, tmp_path: Path
) -> None:
    source = tmp_path / "reference.png"
    _write_png(source, width=REFERENCE_WIDTH, height=REFERENCE_HEIGHT)
    workflow, _, _ = _install_workflow(
        composition, StubMediaAccess(composition), PerRegionOcrEngine()
    )
    with TestClient(create_app(composition.settings, composition=composition)) as client:
        profile = client.post("/api/v1/profiles", json=_create_payload(source)).json()
        ids = _seed_run(composition, profile=profile, tmp_path=tmp_path)
        hud_id = _named(profile["regions"], "HUD")["id"]
        before = FrameRepository(composition.database).processing(ids["run"], 0)
        with composition.database.session() as session:
            region = session.get(HudRegion, hud_id)
            assert region is not None
            region.ocr_allowed_chars = None
            region.ocr_page_segmentation_mode = None
            session.flush()
        legacy = client.get(f"/api/v1/profiles/{profile['id']}").json()
        draft = _definition(legacy)
        _named(draft["regions"], "HUD").update(width=12, name="renamed")
        saved = client.put(f"/api/v1/profiles/{profile['id']}/definition", json=draft)
        assert saved.status_code == 200, saved.text
        after = FrameRepository(composition.database).processing(ids["run"], 0)
        fresh = workflow.create_run(
            profile_id=profile["id"], video_id=ids["video"], interval_ms=1000
        )
        snapshot = next(item for item in fresh.ocr_regions if item.region_id == hud_id)
        assert snapshot.bbox.width == 12
        assert snapshot.allowed_chars == ("0", "1")
        assert snapshot.page_segmentation_mode == fresh.ocr_fallback_page_segmentation_mode == 7
        assert after.regions == before.regions
        assert after.samples == before.samples


@pytest.mark.parametrize("chars,mode", [(None, 7), ("0", None), ("", 7)])
def test_save_rejects_partial_or_empty_ocr_configuration(
    composition: CompositionRoot, tmp_path: Path, chars: str | None, mode: int | None
) -> None:
    source = tmp_path / "reference.png"
    _write_png(source, width=REFERENCE_WIDTH, height=REFERENCE_HEIGHT)
    with TestClient(create_app(composition.settings, composition=composition)) as client:
        profile = client.post("/api/v1/profiles", json=_create_payload(source)).json()
        draft = _definition(profile)
        draft["regions"][0].update(allowed_chars=chars, page_segmentation_mode=mode)
        response = client.put(f"/api/v1/profiles/{profile['id']}/definition", json=draft)
        assert response.status_code in (400, 422), response.text
        assert client.get(f"/api/v1/profiles/{profile['id']}").json() == profile


def test_resizing_a_region_leaves_an_existing_run_reading_its_own_geometry(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    source = tmp_path / "reference.png"
    _write_png(source, width=REFERENCE_WIDTH, height=REFERENCE_HEIGHT)
    app = create_app(composition.settings, composition=composition)

    with TestClient(app) as client:
        profile = client.post("/api/v1/profiles", json=_create_payload(source)).json()
        ids = _seed_run(composition, profile=profile, tmp_path=tmp_path)
        frames = FrameRepository(composition.database)
        before = frames.processing(ids["run"], 0)

        draft = _definition(profile)
        draft["regions"][0] |= {"x": 2, "y": 3, "width": 20, "height": 16}
        saved = client.put(f"/api/v1/profiles/{profile['id']}/definition", json=draft)
        after = frames.processing(ids["run"], 0)
        run = client.get(f"/api/v1/runs/{ids['run']}").json()

    assert saved.status_code == 200, saved.text
    body = saved.json()
    assert body["version"] == profile["version"] + 1
    # The profile now describes the resized region, under its original id.
    hud_id = _named(profile["regions"], "HUD")["id"]
    resized = _named(body["regions"], "HUD")
    assert resized["id"] == hud_id
    assert tuple(resized[key] for key in ("x", "y", "width", "height")) == (2, 3, 20, 16)
    # The finished run still reads the geometry it recorded, so its crops keep
    # meaning the same thing. Compared against the earlier read, not a constant.
    assert after.regions == before.regions
    assert after.samples == before.samples
    assert (after.samples[0].width, after.samples[0].height) == (16, 12)
    snapshot = next(region for region in run["ocr_regions"] if region["region_id"] == hud_id)
    assert (snapshot["x"], snapshot["y"], snapshot["width"], snapshot["height"]) == (0, 0, 16, 12)


def test_the_next_run_crops_the_saved_geometry(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    source = tmp_path / "reference.png"
    _write_png(source, width=REFERENCE_WIDTH, height=REFERENCE_HEIGHT)
    app = create_app(composition.settings, composition=composition)
    workflow, _, _ = _install_workflow(
        composition, StubMediaAccess(composition), PerRegionOcrEngine()
    )

    with TestClient(app) as client:
        profile = client.post("/api/v1/profiles", json=_create_payload(source)).json()
        ids = _seed_run(composition, profile=profile, tmp_path=tmp_path)
        draft = _definition(profile)
        draft["regions"][0] |= {"x": 2, "y": 3, "width": 20, "height": 16}
        saved = client.put(f"/api/v1/profiles/{profile['id']}/definition", json=draft).json()
        record = workflow.create_run(
            profile_id=profile["id"], video_id=ids["video"], interval_ms=1000
        )

    hud_id = _named(saved["regions"], "HUD")["id"]
    fresh = next(snapshot for snapshot in record.ocr_regions if snapshot.region_id == hud_id)

    assert fresh.bbox == BBox(2, 3, 20, 16)
    # Same region identifier, new geometry: the id is what `region_samples`
    # points at, so it must survive the edit.
    assert fresh.region_id == _named(profile["regions"], "HUD")["id"]
    cropped = FrameRepository(composition.database).ensure(record.id, 0).regions
    assert next(region.bbox for region in cropped if region.id == hud_id) == BBox(2, 3, 20, 16)


def test_removing_a_used_region_retires_it_and_frees_its_name(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    source = tmp_path / "reference.png"
    _write_png(source, width=REFERENCE_WIDTH, height=REFERENCE_HEIGHT)
    app = create_app(composition.settings, composition=composition)

    with TestClient(app) as client:
        profile = client.post("/api/v1/profiles", json=_create_payload(source)).json()
        ids = _seed_run(composition, profile=profile, tmp_path=tmp_path)
        retired_id = _named(profile["regions"], "HUD")["id"]
        frames = FrameRepository(composition.database)
        before = frames.processing(ids["run"], 0)

        draft = _definition(profile)
        # The used region goes away and a differently shaped region takes its
        # name in the very same save.
        draft["regions"] = [
            draft["regions"][1],
            {
                "id": None,
                "name": "HUD",
                "x": 4,
                "y": 4,
                "width": 10,
                "height": 10,
                "allowed_chars": "0",
                "page_segmentation_mode": 7,
            },
        ]
        saved = client.put(f"/api/v1/profiles/{profile['id']}/definition", json=draft)
        after = frames.processing(ids["run"], 0)

    assert saved.status_code == 200, saved.text
    body = saved.json()
    assert {region["name"] for region in body["regions"]} == {"HUD", "timer"}
    reused = next(region for region in body["regions"] if region["name"] == "HUD")
    assert reused["id"] != retired_id
    assert (reused["x"], reused["y"], reused["width"], reused["height"]) == (4, 4, 10, 10)

    with composition.database.session() as session:
        retired = session.get(HudRegion, retired_id)
        assert retired is not None
        assert retired.retired_at is not None
        # Nothing the retired region anchors was touched.
        assert (
            session.scalar(
                select(func.count())
                .select_from(RegionSample)
                .where(RegionSample.region_id == retired_id)
            )
            == 1
        )
        assert (
            session.scalar(
                select(func.count())
                .select_from(OcrObservation)
                .where(OcrObservation.sample_id == ids["sample"])
            )
            == 1
        )
    # The earlier run keeps both the retired region and its sample dimensions.
    assert after.regions == before.regions
    assert after.samples == before.samples


@pytest.mark.parametrize("status", ["queued", "running", "paused", "failed", "cancelled"])
def test_a_run_that_may_still_crop_blocks_the_save(
    composition: CompositionRoot,
    tmp_path: Path,
    status: str,
) -> None:
    source = tmp_path / "reference.png"
    _write_png(source, width=REFERENCE_WIDTH, height=REFERENCE_HEIGHT)
    app = create_app(composition.settings, composition=composition)

    with TestClient(app) as client:
        profile = client.post("/api/v1/profiles", json=_create_payload(source)).json()
        _seed_run(composition, profile=profile, tmp_path=tmp_path, status=status)
        draft = _definition(profile)
        draft["regions"][0] |= {"width": 20}
        response = client.put(f"/api/v1/profiles/{profile['id']}/definition", json=draft)
        reloaded = client.get(f"/api/v1/profiles/{profile['id']}").json()

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "active_run"
    assert reloaded == profile


@pytest.mark.parametrize("status", ["completed", "review_ready"])
def test_a_finished_run_does_not_block_the_save(
    composition: CompositionRoot,
    tmp_path: Path,
    status: str,
) -> None:
    source = tmp_path / "reference.png"
    _write_png(source, width=REFERENCE_WIDTH, height=REFERENCE_HEIGHT)
    app = create_app(composition.settings, composition=composition)

    with TestClient(app) as client:
        profile = client.post("/api/v1/profiles", json=_create_payload(source)).json()
        _seed_run(composition, profile=profile, tmp_path=tmp_path, status=status)
        draft = _definition(profile)
        draft["regions"][0] |= {"width": 20}
        response = client.put(f"/api/v1/profiles/{profile['id']}/definition", json=draft)

    assert response.status_code == 200, response.text
    assert _named(response.json()["regions"], "HUD")["width"] == 20


def test_a_run_started_between_load_and_save_is_refused_without_writing(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    """The gate is re-read inside the writing transaction, not only at load."""
    source = tmp_path / "reference.png"
    _write_png(source, width=REFERENCE_WIDTH, height=REFERENCE_HEIGHT)
    app = create_app(composition.settings, composition=composition)
    _install_workflow(composition, StubMediaAccess(composition), PerRegionOcrEngine())

    with TestClient(app) as client:
        profile = client.post("/api/v1/profiles", json=_create_payload(source)).json()
        ids = _seed_run(composition, profile=profile, tmp_path=tmp_path)
        draft = _definition(profile)
        draft["regions"][0] |= {"width": 20}
        # The operator's draft is already in hand when a new run is queued.
        queued = client.post(
            "/api/v1/runs",
            json={"profile_id": profile["id"], "video_id": ids["video"], "interval_ms": 1000},
        )
        response = client.put(f"/api/v1/profiles/{profile['id']}/definition", json=draft)
        reloaded = client.get(f"/api/v1/profiles/{profile['id']}").json()

    assert queued.status_code == 201, queued.text
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "active_run"
    assert reloaded == profile


def test_a_stale_expected_version_is_refused_without_writing(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    source = tmp_path / "reference.png"
    _write_png(source, width=REFERENCE_WIDTH, height=REFERENCE_HEIGHT)
    app = create_app(composition.settings, composition=composition)

    with TestClient(app) as client:
        profile = client.post("/api/v1/profiles", json=_create_payload(source)).json()
        draft = _definition(profile)
        draft["regions"][0] |= {"width": 20}
        first = client.put(f"/api/v1/profiles/{profile['id']}/definition", json=draft).json()
        # The same draft is submitted twice, as a second tab would.
        response = client.put(f"/api/v1/profiles/{profile['id']}/definition", json=draft)
        reloaded = client.get(f"/api/v1/profiles/{profile['id']}").json()

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "version_conflict"
    assert reloaded == first


def test_an_invalid_draft_rolls_the_whole_save_back(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    source = tmp_path / "reference.png"
    _write_png(source, width=REFERENCE_WIDTH, height=REFERENCE_HEIGHT)
    app = create_app(composition.settings, composition=composition)

    with TestClient(app) as client:
        profile = client.post("/api/v1/profiles", json=_create_payload(source)).json()
        draft = _definition(profile)
        # A valid edit and an out-of-bounds one arrive together.
        draft["regions"][0] |= {"name": "renamed"}
        draft["regions"][1] |= {"width": REFERENCE_WIDTH}
        draft["categories"].append({"id": None, "name": "shield", "kind": "game"})
        response = client.put(f"/api/v1/profiles/{profile['id']}/definition", json=draft)
        reloaded = client.get(f"/api/v1/profiles/{profile['id']}").json()

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "region_out_of_bounds"
    assert response.json()["error"]["details"] == {"field": "regions", "index": 1}
    assert reloaded == profile


def test_two_regions_may_swap_names_in_one_save(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    """A single save is one step for the operator, so it must be one for SQLite."""
    source = tmp_path / "reference.png"
    _write_png(source, width=REFERENCE_WIDTH, height=REFERENCE_HEIGHT)
    app = create_app(composition.settings, composition=composition)

    with TestClient(app) as client:
        profile = client.post("/api/v1/profiles", json=_create_payload(source)).json()
        draft = _definition(profile)
        draft["regions"][0]["name"] = "timer"
        draft["regions"][1]["name"] = "HUD"
        response = client.put(f"/api/v1/profiles/{profile['id']}/definition", json=draft)

    assert response.status_code == 200, response.text
    body = response.json()
    assert _named(body["regions"], "timer")["id"] == _named(profile["regions"], "HUD")["id"]
    assert _named(body["regions"], "HUD")["id"] == _named(profile["regions"], "timer")["id"]


def test_a_duplicate_region_name_in_the_draft_is_refused(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    source = tmp_path / "reference.png"
    _write_png(source, width=REFERENCE_WIDTH, height=REFERENCE_HEIGHT)
    app = create_app(composition.settings, composition=composition)

    with TestClient(app) as client:
        profile = client.post("/api/v1/profiles", json=_create_payload(source)).json()
        draft = _definition(profile)
        draft["regions"][1]["name"] = "  hUd "
        response = client.put(f"/api/v1/profiles/{profile['id']}/definition", json=draft)
        reloaded = client.get(f"/api/v1/profiles/{profile['id']}").json()

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "duplicate_region_name"
    assert reloaded == profile


def test_an_unknown_region_id_is_refused_rather_than_inserted(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    source = tmp_path / "reference.png"
    _write_png(source, width=REFERENCE_WIDTH, height=REFERENCE_HEIGHT)
    app = create_app(composition.settings, composition=composition)

    with TestClient(app) as client:
        profile = client.post("/api/v1/profiles", json=_create_payload(source)).json()
        draft = _definition(profile)
        draft["regions"][0]["id"] = str(uuid4())
        response = client.put(f"/api/v1/profiles/{profile['id']}/definition", json=draft)
        reloaded = client.get(f"/api/v1/profiles/{profile['id']}").json()

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "region_not_found"
    assert reloaded == profile


def test_dropping_a_class_that_annotations_use_is_a_conflict_not_a_deletion(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    source = tmp_path / "reference.png"
    _write_png(source, width=REFERENCE_WIDTH, height=REFERENCE_HEIGHT)
    app = create_app(composition.settings, composition=composition)

    with TestClient(app) as client:
        profile = client.post("/api/v1/profiles", json=_create_payload(source)).json()
        _seed_run(composition, profile=profile, tmp_path=tmp_path, with_annotation=True)
        used = profile["categories"][0]
        draft = _definition(profile)
        draft["categories"] = [
            category for category in draft["categories"] if category["id"] != used["id"]
        ]
        # The whitelist that named the dropped class goes with it, so the only
        # reason the save fails is the annotation that still points at it.
        draft["regions"][0]["allowed_chars"] = "1"
        response = client.put(f"/api/v1/profiles/{profile['id']}/definition", json=draft)
        reloaded = client.get(f"/api/v1/profiles/{profile['id']}").json()

        # `Save as` is the way forward: the new profile carries the draft and
        # the original is left exactly as it was.
        copied = client.post(
            "/api/v1/profiles",
            json={
                "name": "Save Game copy",
                "reference_asset_id": profile["reference_asset_id"],
                "regions": [
                    {
                        key: region[key]
                        for key in ("name", "x", "y", "width", "height", "allowed_chars")
                    }
                    | {"page_segmentation_mode": region["page_segmentation_mode"]}
                    for region in draft["regions"]
                ],
                "categories": [
                    {"name": category["name"], "kind": category["kind"]}
                    for category in draft["categories"]
                ],
            },
        )
        original_after_copy = client.get(f"/api/v1/profiles/{profile['id']}").json()

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "category_in_use"
    assert response.json()["error"]["details"] == {
        "categories": [{"id": used["id"], "name": used["name"]}]
    }
    assert reloaded == profile

    assert copied.status_code == 201, copied.text
    body = copied.json()
    assert body["id"] != profile["id"]
    assert [category["name"] for category in body["categories"]] == ["1", "health"]
    assert body["regions"][0]["allowed_chars"] == "1"
    # A copy never inherits another profile's durable asset row.
    assert body["reference_asset_id"] != profile["reference_asset_id"]
    assert original_after_copy == profile


def test_dropping_an_unused_class_and_appending_a_custom_one_keeps_ordinals(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    source = tmp_path / "reference.png"
    _write_png(source, width=REFERENCE_WIDTH, height=REFERENCE_HEIGHT)
    app = create_app(composition.settings, composition=composition)

    with TestClient(app) as client:
        profile = client.post("/api/v1/profiles", json=_create_payload(source)).json()
        kept = profile["categories"][0]
        draft = _definition(profile)
        draft["categories"] = [
            category for category in draft["categories"] if category["name"] != "health"
        ]
        draft["categories"].append({"id": None, "name": "shield", "kind": "game"})
        draft["regions"][1]["allowed_chars"] = "0"
        response = client.put(f"/api/v1/profiles/{profile['id']}/definition", json=draft)

    assert response.status_code == 200, response.text
    body = response.json()
    assert [category["name"] for category in body["categories"]] == ["0", "1", "shield"]
    assert body["categories"][0]["id"] == kept["id"]

    with composition.database.session() as session:
        ordinals = session.execute(
            select(Category.name, Category.ordinal)
            .where(Category.profile_id == profile["id"])
            .order_by(Category.ordinal)
        ).all()
    # The dropped class frees no ordinal: an export identifier derived from it
    # must not start meaning a different class.
    assert [tuple(row) for row in ordinals] == [("0", 0), ("1", 1), ("shield", 3)]


def test_saving_an_unchanged_draft_is_accepted_and_bumps_the_version_once(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    source = tmp_path / "reference.png"
    _write_png(source, width=REFERENCE_WIDTH, height=REFERENCE_HEIGHT)
    app = create_app(composition.settings, composition=composition)

    with TestClient(app) as client:
        profile = client.post("/api/v1/profiles", json=_create_payload(source)).json()
        response = client.put(
            f"/api/v1/profiles/{profile['id']}/definition", json=_definition(profile)
        )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["version"] == 2
    assert body["regions"] == profile["regions"]
    assert body["categories"] == profile["categories"]


def test_region_ocr_settings_survive_a_save_that_only_moves_a_box(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    source = tmp_path / "reference.png"
    _write_png(source, width=REFERENCE_WIDTH, height=REFERENCE_HEIGHT)
    app = create_app(composition.settings, composition=composition)

    with TestClient(app) as client:
        profile = client.post("/api/v1/profiles", json=_create_payload(source)).json()
        draft = _definition(profile)
        draft["regions"][1] |= {"x": 0, "y": 16, "page_segmentation_mode": 13}
        response = client.put(f"/api/v1/profiles/{profile['id']}/definition", json=draft)

    assert response.status_code == 200, response.text
    moved = _named(response.json()["regions"], "timer")
    assert (moved["allowed_chars"], moved["page_segmentation_mode"]) == ("1", 13)
    assert (moved["x"], moved["y"]) == (0, 16)


def test_retired_regions_are_absent_from_the_profile_summary_and_the_next_run(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    source = tmp_path / "reference.png"
    _write_png(source, width=REFERENCE_WIDTH, height=REFERENCE_HEIGHT)
    app = create_app(composition.settings, composition=composition)
    workflow, _, _ = _install_workflow(
        composition, StubMediaAccess(composition), PerRegionOcrEngine()
    )

    with TestClient(app) as client:
        profile = client.post("/api/v1/profiles", json=_create_payload(source)).json()
        ids = _seed_run(composition, profile=profile, tmp_path=tmp_path)
        draft = _definition(profile)
        draft["regions"] = [draft["regions"][0]]
        saved = client.put(f"/api/v1/profiles/{profile['id']}/definition", json=draft)
        summaries = client.get("/api/v1/profiles").json()
        record = workflow.create_run(
            profile_id=profile["id"], video_id=ids["video"], interval_ms=1000
        )

    assert saved.status_code == 200, saved.text
    summary = next(item for item in summaries if item["id"] == profile["id"])
    assert summary["region_count"] == 1
    assert [snapshot.region_name for snapshot in record.ocr_regions] == ["HUD"]


def test_a_legacy_run_without_snapshots_still_resolves_live_geometry(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    """A run that recorded no region keeps working; it simply has nothing to crop."""
    source = tmp_path / "reference.png"
    _write_png(source, width=REFERENCE_WIDTH, height=REFERENCE_HEIGHT)
    app = create_app(composition.settings, composition=composition)

    with TestClient(app) as client:
        profile = client.post("/api/v1/profiles", json=_create_payload(source)).json()
        ids = _seed_run(composition, profile=profile, tmp_path=tmp_path)
        with composition.database.session() as session:
            run = session.get(PipelineRun, ids["run"])
            assert run is not None
            run.ocr_region_config_json = json.dumps([])
        record = FrameRepository(composition.database).processing(ids["run"], 0)

    assert [region.id for region in record.regions] == [
        region["id"] for region in profile["regions"]
    ]
    assert (record.samples[0].width, record.samples[0].height) == (16, 12)


def test_adding_category_invalidates_a_stale_whole_definition(
    composition: CompositionRoot, tmp_path: Path
) -> None:
    source = tmp_path / "reference.png"
    _write_png(source, width=REFERENCE_WIDTH, height=REFERENCE_HEIGHT)
    with TestClient(create_app(composition.settings, composition=composition)) as client:
        profile = client.post("/api/v1/profiles", json=_create_payload(source)).json()
        stale = _definition(profile)
        added = client.post(
            f"/api/v1/profiles/{profile['id']}/categories", json={"name": "shield", "kind": "game"}
        )
        response = client.put(f"/api/v1/profiles/{profile['id']}/definition", json=stale)
        latest = client.get(f"/api/v1/profiles/{profile['id']}").json()
    assert added.status_code == 201
    assert response.status_code == 409
    assert any(category["name"] == "shield" for category in latest["categories"])


def test_run_creation_retries_when_profile_is_saved_after_context_read(
    composition: CompositionRoot, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    source = tmp_path / "reference.png"
    _write_png(source, width=REFERENCE_WIDTH, height=REFERENCE_HEIGHT)
    workflow, runs, _ = _install_workflow(
        composition, StubMediaAccess(composition), PerRegionOcrEngine()
    )
    with TestClient(create_app(composition.settings, composition=composition)) as client:
        profile = client.post("/api/v1/profiles", json=_create_payload(source)).json()
        ids = _seed_run(composition, profile=profile, tmp_path=tmp_path)
        draft = _definition(profile)
        hud = _named(draft["regions"], "HUD")
        hud.update(width=20, allowed_chars="1")
        draft["categories"] = [
            category for category in draft["categories"] if category["name"] != "0"
        ]
        original = runs.creation_context
        saved = False

        def read_then_save(profile_id: str, video_id: str) -> Any:
            nonlocal saved
            context = original(profile_id, video_id)
            if not saved:
                saved = True
                response = client.put(f"/api/v1/profiles/{profile_id}/definition", json=draft)
                assert response.status_code == 200, response.text
            return context

        monkeypatch.setattr(runs, "creation_context", read_then_save)
        record = workflow.create_run(
            profile_id=profile["id"], video_id=ids["video"], interval_ms=1000
        )
    snapshot = next(region for region in record.ocr_regions if region.region_name == "HUD")
    assert snapshot.bbox.width == 20
    assert snapshot.allowed_chars == ("1",)


def test_run_creation_stops_after_repeated_profile_conflicts(
    composition: CompositionRoot, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from backend.app.access.store.repositories.runs import RunProfileChangedError

    source = tmp_path / "reference.png"
    _write_png(source, width=REFERENCE_WIDTH, height=REFERENCE_HEIGHT)
    ocr = PerRegionOcrEngine()
    _, runs, _ = _install_workflow(composition, StubMediaAccess(composition), ocr)
    with TestClient(create_app(composition.settings, composition=composition)) as client:
        profile = client.post("/api/v1/profiles", json=_create_payload(source)).json()
        ids = _seed_run(composition, profile=profile, tmp_path=tmp_path)
        with composition.database.session() as session:
            before = session.scalar(select(func.count()).select_from(PipelineRun))
        calls = 0
        descriptions = 0
        original_describe = ocr.describe

        def describe(*args: Any, **kwargs: Any) -> OcrProvenance:
            nonlocal descriptions
            descriptions += 1
            return original_describe(*args, **kwargs)

        def conflict(**kwargs: Any) -> Any:
            nonlocal calls
            calls += 1
            if calls > 3:
                raise AssertionError("run creation retried beyond the budget")
            raise RunProfileChangedError

        monkeypatch.setattr(ocr, "describe", describe)
        monkeypatch.setattr(runs, "create", conflict)
        response = client.post(
            "/api/v1/runs",
            json={"profile_id": profile["id"], "video_id": ids["video"], "interval_ms": 1000},
        )
        with composition.database.session() as session:
            after = session.scalar(select(func.count()).select_from(PipelineRun))
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "profile_changed_during_run_creation"
    assert calls == 3
    assert descriptions == 9
    assert before == after
