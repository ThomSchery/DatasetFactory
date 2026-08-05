from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

import pytest
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
from backend.app.access.store.repositories.annotations import (
    AnnotationRepository,
    ReviewEmptyPatchError,
)
from backend.app.composition import CompositionRoot
from backend.app.main import create_app
from backend.app.managers.workflow.review_use_cases import ReviewUseCaseError


@dataclass(frozen=True)
class ReviewSeed:
    frame_id: str
    annotation_ids: tuple[str, ...]
    category_id: str
    alternate_category_id: str
    foreign_category_id: str
    observation_id: str
    run_id: str


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
                width=10,
                height=10,
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
        run_id,
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
        locked = client.delete(f"/api/v1/annotations/{seed.annotation_ids[0]}?expected_version=1")
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
        response = client.delete(f"/api/v1/annotations/{seed.annotation_ids[0]}?expected_version=1")
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


def test_manual_annotations_geometry_and_validation_contract(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    seed = _seed_review(composition, tmp_path)
    app = create_app(composition.settings, composition=composition)
    with TestClient(app) as client:
        first = client.post(
            f"/api/v1/frames/{seed.frame_id}/annotations",
            json={
                "category_id": seed.category_id,
                "bbox": {"x": 80, "y": 30, "width": 10, "height": 10},
                "expected_version": 1,
            },
        )
        assert first.status_code == 201, first.text
        assert first.json() | {"id": "ignored"} == {
            "id": "ignored",
            "category_id": seed.category_id,
            "x": 80,
            "y": 30,
            "width": 10,
            "height": 10,
            "confidence": None,
            "source": "manual",
            "observation_id": None,
            "status": "proposed",
            "version": 1,
        }

        overlapping = client.post(
            f"/api/v1/frames/{seed.frame_id}/annotations",
            json={
                "category_id": seed.alternate_category_id,
                "bbox": {"x": 85, "y": 35, "width": 10, "height": 10},
                "expected_version": 2,
            },
        )
        assert overlapping.status_code == 201, overlapping.text

        foreign = client.post(
            f"/api/v1/frames/{seed.frame_id}/annotations",
            json={
                "category_id": seed.foreign_category_id,
                "bbox": {"x": 20, "y": 20, "width": 2, "height": 2},
                "expected_version": 3,
            },
        )
        assert foreign.status_code == 400
        assert foreign.json()["error"]["code"] == "category_not_allowed"

        outside = client.post(
            f"/api/v1/frames/{seed.frame_id}/annotations",
            json={
                "category_id": seed.category_id,
                "bbox": {"x": 99, "y": 49, "width": 2, "height": 2},
                "expected_version": 3,
            },
        )
        assert outside.status_code == 400
        assert outside.json()["error"]["code"] == "bbox_invalid"

        stale = client.post(
            f"/api/v1/frames/{seed.frame_id}/annotations",
            json={
                "category_id": seed.category_id,
                "bbox": {"x": 20, "y": 20, "width": 2, "height": 2},
                "expected_version": 1,
            },
        )
        assert stale.status_code == 409
        assert stale.json()["error"]["code"] == "version_conflict"

        empty = client.patch(
            f"/api/v1/annotations/{seed.annotation_ids[0]}",
            json={"expected_version": 1},
        )
        assert empty.status_code == 400, empty.text
        assert empty.json()["error"]["code"] == "empty_patch"

        edited = client.patch(
            f"/api/v1/annotations/{seed.annotation_ids[0]}",
            json={
                "bbox": {"x": 20, "y": 21, "width": 22, "height": 23},
                "expected_version": 1,
            },
        )
        assert edited.status_code == 200, edited.text
        assert edited.json()["observation_id"] == seed.observation_id
        assert edited.json()["source"] == "ocr"
        assert [edited.json()[key] for key in ("x", "y", "width", "height")] == [
            20,
            21,
            22,
            23,
        ]

        detail = client.get(f"/api/v1/frames/{seed.frame_id}").json()
        assert detail["version"] == 3
        assert detail["review_revision"] == 3

    with composition.database.session() as session:
        assert session.get(OcrObservation, seed.observation_id) is not None


def test_rejected_frame_is_frozen_until_reopen(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    seed = _seed_review(composition, tmp_path)
    app = create_app(composition.settings, composition=composition)
    with TestClient(app) as client:
        rejected = client.post(
            f"/api/v1/frames/{seed.frame_id}/review",
            json={"decision": "reject", "expected_version": 1},
        )
        assert rejected.status_code == 200, rejected.text
        assert rejected.json()["review_status"] == "rejected"

        locked_requests = (
            client.post(
                f"/api/v1/frames/{seed.frame_id}/annotations",
                json={
                    "category_id": seed.category_id,
                    "bbox": {"x": 20, "y": 20, "width": 2, "height": 2},
                    "expected_version": 2,
                },
            ),
            client.patch(
                f"/api/v1/annotations/{seed.annotation_ids[0]}",
                json={"category_id": seed.alternate_category_id, "expected_version": 1},
            ),
            client.delete(f"/api/v1/annotations/{seed.annotation_ids[1]}?expected_version=1"),
        )
        assert [response.status_code for response in locked_requests] == [409, 409, 409]
        assert {response.json()["error"]["code"] for response in locked_requests} == {
            "review_locked"
        }

        reopened = client.post(
            f"/api/v1/frames/{seed.frame_id}/review",
            json={"decision": "reopen", "expected_version": 2},
        )
        assert reopened.status_code == 200, reopened.text
        assert reopened.json()["review_status"] == "pending"
        assert {item["status"] for item in reopened.json()["annotations"]} == {"proposed"}

        created = client.post(
            f"/api/v1/frames/{seed.frame_id}/annotations",
            json={
                "category_id": seed.category_id,
                "bbox": {"x": 20, "y": 20, "width": 2, "height": 2},
                "expected_version": 3,
            },
        )
        patched = client.patch(
            f"/api/v1/annotations/{seed.annotation_ids[0]}",
            json={"category_id": seed.alternate_category_id, "expected_version": 1},
        )
        deleted = client.delete(f"/api/v1/annotations/{seed.annotation_ids[1]}?expected_version=1")
        assert created.status_code == 201, created.text
        assert patched.status_code == 200, patched.text
        assert deleted.status_code == 204, deleted.text

        detail = client.get(f"/api/v1/frames/{seed.frame_id}").json()
        assert detail["review_revision"] == 5
        assert len(detail["annotations"]) == 3


def test_reopen_invalid_transition_and_accepted_terminal_lock(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    seed = _seed_review(composition, tmp_path)
    app = create_app(composition.settings, composition=composition)
    with TestClient(app) as client:
        pending = client.post(
            f"/api/v1/frames/{seed.frame_id}/review",
            json={"decision": "reopen", "expected_version": 1},
        )
        assert pending.status_code == 409
        assert pending.json()["error"]["code"] == "invalid_review_transition"

        accepted = client.post(
            f"/api/v1/frames/{seed.frame_id}/review",
            json={"decision": "accept", "expected_version": 1},
        )
        assert accepted.status_code == 200
        terminal = client.post(
            f"/api/v1/frames/{seed.frame_id}/review",
            json={"decision": "reopen", "expected_version": 2},
        )
        assert terminal.status_code == 409
        assert terminal.json()["error"]["code"] == "review_locked"


def test_manual_annotation_requires_a_frame_that_finished_ocr(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    seed = _seed_review(composition, tmp_path)
    app = create_app(composition.settings, composition=composition)
    payload = {
        "category_id": seed.category_id,
        "bbox": {"x": 80, "y": 30, "width": 10, "height": 10},
        "expected_version": 1,
    }
    for stage in ("pending", "sampled", "cropped"):
        with composition.database.session() as session:
            frame = session.get(Frame, seed.frame_id)
            assert frame is not None
            frame.stage_status = stage
        with TestClient(app) as client:
            early = client.post(f"/api/v1/frames/{seed.frame_id}/annotations", json=payload)
            assert early.status_code == 409, early.text
            assert early.json()["error"]["code"] == "frame_not_reviewable"

    with composition.database.session() as session:
        run = session.get(PipelineRun, seed.run_id)
        frame = session.get(Frame, seed.frame_id)
        assert run is not None
        assert frame is not None
        assert run.review_revision == 0
        assert frame.version == 1
        frame.stage_status = "review_pending"

    with TestClient(app) as client:
        allowed = client.post(f"/api/v1/frames/{seed.frame_id}/annotations", json=payload)
        assert allowed.status_code == 201, allowed.text
        assert allowed.json()["source"] == "manual"


def test_review_decision_requires_a_frame_that_finished_ocr(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    seed = _seed_review(composition, tmp_path)
    app = create_app(composition.settings, composition=composition)
    # A frame rolled back by reconciliation sits at `cropped` with `review_status`
    # still `pending`. Accepting it there would be undone by the worker's next
    # `commit_ocr`, which resets `review_status` when it rewrites the proposals.
    for stage in ("pending", "sampled", "cropped"):
        with composition.database.session() as session:
            frame = session.get(Frame, seed.frame_id)
            assert frame is not None
            frame.stage_status = stage
        with TestClient(app) as client:
            for decision in ("accept", "reject"):
                early = client.post(
                    f"/api/v1/frames/{seed.frame_id}/review",
                    json={"decision": decision, "expected_version": 1},
                )
                assert early.status_code == 409, early.text
                assert early.json()["error"]["code"] == "frame_not_reviewable"

    with composition.database.session() as session:
        run = session.get(PipelineRun, seed.run_id)
        frame = session.get(Frame, seed.frame_id)
        assert run is not None
        assert frame is not None
        assert run.review_revision == 0
        assert frame.version == 1
        assert frame.review_status == "pending"
        frame.stage_status = "review_pending"

    with TestClient(app) as client:
        accepted = client.post(
            f"/api/v1/frames/{seed.frame_id}/review",
            json={"decision": "accept", "expected_version": 1},
        )
        assert accepted.status_code == 200, accepted.text
        assert accepted.json()["review_status"] == "accepted"


def test_accept_reports_every_annotation_outside_changed_frame_dimensions(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    seed = _seed_review(composition, tmp_path)
    app = create_app(composition.settings, composition=composition)
    with TestClient(app) as client:
        manual = client.post(
            f"/api/v1/frames/{seed.frame_id}/annotations",
            json={
                "category_id": seed.category_id,
                "bbox": {"x": 80, "y": 30, "width": 10, "height": 10},
                "expected_version": 1,
            },
        )
        assert manual.status_code == 201, manual.text
        manual_id = manual.json()["id"]

        # A re-sampled frame can come back smaller; the kept box is not deleted.
        with composition.database.session() as session:
            frame = session.get(Frame, seed.frame_id)
            assert frame is not None
            frame.width = 50
            frame.height = 25

        rejected = client.post(
            f"/api/v1/frames/{seed.frame_id}/review",
            json={"decision": "accept", "expected_version": 2},
        )
        assert rejected.status_code == 400, rejected.text
        assert rejected.json()["error"]["code"] == "bbox_invalid"
        assert rejected.json()["error"]["details"] == {"annotation_ids": [manual_id]}

        detail = client.get(f"/api/v1/frames/{seed.frame_id}").json()
        assert [item["id"] for item in detail["annotations"] if item["source"] == "manual"] == [
            manual_id
        ]
        assert detail["review_revision"] == 1

        fitted = client.patch(
            f"/api/v1/annotations/{manual_id}",
            json={"bbox": {"x": 10, "y": 10, "width": 5, "height": 5}, "expected_version": 1},
        )
        assert fitted.status_code == 200, fitted.text
        accepted = client.post(
            f"/api/v1/frames/{seed.frame_id}/review",
            json={"decision": "accept", "expected_version": 2},
        )
        assert accepted.status_code == 200, accepted.text


def test_repository_rejects_an_empty_patch_without_bumping_any_counter(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    seed = _seed_review(composition, tmp_path)
    repository = AnnotationRepository(composition.database)

    # Straight at the repository: the engine's `empty_patch` check runs in another
    # session, so the write transaction has to refuse the no-op on its own.
    with pytest.raises(ReviewEmptyPatchError):
        repository.update(
            seed.annotation_ids[0],
            category_id=None,
            bbox=None,
            expected_version=1,
        )

    with composition.database.session() as session:
        run = session.get(PipelineRun, seed.run_id)
        annotation = session.get(Annotation, seed.annotation_ids[0])
        assert run is not None
        assert annotation is not None
        assert run.review_revision == 0
        assert annotation.version == 1


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


def test_concurrent_manual_creation_increments_revision_only_for_committed_mutation(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    seed = _seed_review(composition, tmp_path)

    def create(x: int) -> str:
        try:
            composition.review_use_cases.create_manual_annotation(
                seed.frame_id,
                category_id=seed.category_id,
                bbox=(x, 20, 2, 2),
                expected_version=1,
            )
        except ReviewUseCaseError as error:
            return error.code
        return "created"

    with ThreadPoolExecutor(max_workers=2) as executor:
        outcomes = tuple(executor.map(create, (20, 30)))

    assert sorted(outcomes) == ["created", "version_conflict"]
    detail = composition.review_use_cases.get_frame(seed.frame_id)
    assert detail.version == 2
    assert detail.review_revision == 1
    assert sum(item.source == "manual" for item in detail.annotations) == 1
