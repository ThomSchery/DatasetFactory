from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select

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
    VideoAsset,
)
from backend.app.composition import CompositionRoot
from backend.app.main import create_app


@dataclass(frozen=True)
class ReviewSeed:
    frame_id: str
    annotation_ids: tuple[str, ...]
    category_id: str
    alternate_category_id: str
    foreign_category_id: str
    observation_id: str


def _seed_review(composition: CompositionRoot, tmp_path: Path) -> ReviewSeed:
    ids = {name: str(uuid4()) for name in ("project", "asset", "profile", "foreign_profile")}
    video_id = str(uuid4())
    run_id = str(uuid4())
    frame_id = str(uuid4())
    region_id = str(uuid4())
    sample_id = str(uuid4())
    observation_id = str(uuid4())
    category_id = str(uuid4())
    alternate_category_id = str(uuid4())
    foreign_category_id = str(uuid4())
    annotation_ids = (str(uuid4()), str(uuid4()))
    image_relpath = Path("runs") / run_id / "frames" / "00000000.jpg"
    image = composition.workspace.resolve_relpath(image_relpath)
    image.parent.mkdir(parents=True, exist_ok=True)
    image.write_bytes(b"jpeg-test-bytes")
    source = tmp_path / "source.mp4"
    source.write_bytes(b"video")

    with composition.database.session() as session:
        session.add(Project(id=ids["project"], name="Project", workspace_path="workspace"))
        session.add(
            ReferenceAsset(
                id=ids["asset"],
                relpath=f"assets/references/{ids['asset']}.png",
                content_type="image/png",
                size_bytes=1,
                status="ready",
            )
        )
        session.flush()
        for profile_id, name in (
            (ids["profile"], f"Profile-{ids['profile']}"),
            (ids["foreign_profile"], f"Foreign-{ids['foreign_profile']}"),
        ):
            session.add(
                GameProfile(
                    id=profile_id,
                    project_id=ids["project"],
                    name=name,
                    normalized_name=name.casefold(),
                    reference_asset_id=ids["asset"],
                    source_width=100,
                    source_height=50,
                    version=1,
                )
            )
        session.flush()
        session.add_all(
            [
                Category(
                    id=category_id,
                    profile_id=ids["profile"],
                    name="0",
                    kind="character",
                    ordinal=0,
                ),
                Category(
                    id=alternate_category_id,
                    profile_id=ids["profile"],
                    name="1",
                    kind="character",
                    ordinal=1,
                ),
                Category(
                    id=foreign_category_id,
                    profile_id=ids["foreign_profile"],
                    name="X",
                    kind="character",
                    ordinal=0,
                ),
            ]
        )
        session.add(
            HudRegion(
                id=region_id,
                profile_id=ids["profile"],
                name="HUD",
                x=0,
                y=0,
                width=100,
                height=50,
            )
        )
        session.add(
            VideoAsset(
                id=video_id,
                project_id=ids["project"],
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
                profile_id=ids["profile"],
                video_id=video_id,
                interval_ms=1000,
                status="review_ready",
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
                id=frame_id,
                run_id=run_id,
                frame_index=0,
                timestamp_ms=0,
                image_relpath=image_relpath.as_posix(),
                stage_status="review_pending",
                review_status="pending",
                width=100,
                height=50,
                version=1,
            )
        )
        session.flush()
        session.add(
            RegionSample(
                id=sample_id,
                frame_id=frame_id,
                region_id=region_id,
                crop_relpath="runs/crop.png",
                stage_status="ocr_complete",
            )
        )
        session.flush()
        session.add(
            OcrObservation(
                id=observation_id,
                sample_id=sample_id,
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
                page_segmentation_mode=6,
                experimental=False,
                quality_gate="passed",
                warning="",
                valid=True,
                rejection_code=None,
            )
        )
        session.flush()
        for index, annotation_id in enumerate(annotation_ids):
            session.add(
                Annotation(
                    id=annotation_id,
                    frame_id=frame_id,
                    category_id=category_id,
                    x=1 + index * 5,
                    y=2,
                    width=3,
                    height=4,
                    confidence=0.9,
                    source="ocr",
                    observation_id=observation_id,
                    status="proposed",
                    version=1,
                )
            )
    return ReviewSeed(
        frame_id,
        annotation_ids,
        category_id,
        alternate_category_id,
        foreign_category_id,
        observation_id,
    )


def test_frame_detail_image_content_type_and_path_confinement(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    seed = _seed_review(composition, tmp_path)
    app = create_app(composition.settings, composition=composition)
    with TestClient(app) as client:
        detail = client.get(f"/api/v1/frames/{seed.frame_id}")
        assert detail.status_code == 200, detail.text
        assert len(detail.json()["annotations"]) == 2
        assert detail.json()["review_revision"] == 0

        image = client.get(f"/api/v1/frames/{seed.frame_id}/image")
        assert image.status_code == 200
        assert image.headers["content-type"] == "image/jpeg"

        outside = tmp_path / "outside.jpg"
        outside.write_bytes(b"outside")
        with composition.database.session() as session:
            frame = session.get(Frame, seed.frame_id)
            assert frame is not None
            frame.image_relpath = "../../outside.jpg"
        escaped = client.get(f"/api/v1/frames/{seed.frame_id}/image")
        assert escaped.status_code == 404
        assert escaped.json()["error"]["code"] == "frame_image_not_found"


def test_review_api_conflicts_category_scope_lock_and_no_annotations(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    seed = _seed_review(composition, tmp_path)
    app = create_app(composition.settings, composition=composition)
    with TestClient(app) as client:
        foreign = client.patch(
            f"/api/v1/annotations/{seed.annotation_ids[0]}",
            json={"category_id": seed.foreign_category_id, "expected_version": 1},
        )
        assert foreign.status_code == 400, foreign.text
        assert foreign.json()["error"]["code"] == "category_not_allowed"

        stale = client.patch(
            f"/api/v1/annotations/{seed.annotation_ids[0]}",
            json={"category_id": seed.alternate_category_id, "expected_version": 2},
        )
        assert stale.status_code == 409
        assert stale.json()["error"]["code"] == "version_conflict"

        accepted = client.post(
            f"/api/v1/frames/{seed.frame_id}/review",
            json={"decision": "accept", "expected_version": 1},
        )
        assert accepted.status_code == 200
        assert accepted.json()["review_revision"] == 1
        locked = client.delete(
            f"/api/v1/annotations/{seed.annotation_ids[0]}?expected_version=1"
        )
        assert locked.status_code == 409
        assert locked.json()["error"]["code"] == "review_locked"

    second = _seed_review(composition, tmp_path)
    with composition.database.session() as session:
        for annotation in session.scalars(
            select(Annotation).where(Annotation.frame_id == second.frame_id)
        ):
            annotation.status = "deleted"
    with TestClient(app) as client:
        empty = client.post(
            f"/api/v1/frames/{second.frame_id}/review",
            json={"decision": "accept", "expected_version": 1},
        )
        assert empty.status_code == 400
        assert empty.json()["error"]["code"] == "no_annotations"


def test_tombstone_preserves_ocr_provenance_and_review_revision(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    seed = _seed_review(composition, tmp_path)
    app = create_app(composition.settings, composition=composition)
    with TestClient(app) as client:
        response = client.delete(
            f"/api/v1/annotations/{seed.annotation_ids[0]}?expected_version=1"
        )
        assert response.status_code == 204, response.text
        detail = client.get(f"/api/v1/frames/{seed.frame_id}").json()
        deleted = next(
            item for item in detail["annotations"] if item["id"] == seed.annotation_ids[0]
        )
        assert deleted["status"] == "deleted"
        assert deleted["observation_id"] == seed.observation_id
        assert detail["review_revision"] == 1
    with composition.database.session() as session:
        assert session.get(OcrObservation, seed.observation_id) is not None


def test_concurrent_annotation_mutations_do_not_lose_review_revision_increment(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    seed = _seed_review(composition, tmp_path)

    def mutate(annotation_id: str) -> None:
        composition.review_use_cases.correct_annotation(
            annotation_id,
            category_id=seed.alternate_category_id,
            expected_version=1,
        )

    with ThreadPoolExecutor(max_workers=2) as executor:
        tuple(executor.map(mutate, seed.annotation_ids))

    detail = composition.review_use_cases.get_frame(seed.frame_id)
    assert detail.review_revision == 2
    assert {item.version for item in detail.annotations} == {2}
