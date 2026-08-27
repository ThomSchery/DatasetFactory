from __future__ import annotations

import hashlib
import json
import threading
import time
from collections import Counter
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pycocotools.coco import COCO  # type: ignore[import-untyped]
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
    StageCheckpoint,
    VideoAsset,
)
from backend.app.access.store.repositories.exports import ExportRepository
from backend.app.composition import CompositionRoot
from backend.app.engines.coco import (
    CocoAnnotationInput,
    CocoCategoryInput,
    CocoExportEngine,
    CocoImageInput,
    CocoValidationError,
)
from backend.app.main import create_app
from backend.app.managers.workflow.export_use_cases import ExportUseCases
from backend.tests.coco_validation import CocoComplianceError, validate_coco_document


@dataclass(frozen=True)
class ExportSeed:
    run_id: str
    profile_id: str
    accepted_frame_id: str
    accepted_image: Path
    pending_annotation_id: str
    alternate_category_id: str
    rejected_frame_id: str


class BlockingCocoEngine:
    def __init__(self) -> None:
        self.entered = threading.Event()
        self.release = threading.Event()
        self._delegate = CocoExportEngine()

    def build(
        self,
        *,
        images: tuple[CocoImageInput, ...],
        categories: tuple[CocoCategoryInput, ...],
        annotations: tuple[CocoAnnotationInput, ...],
    ) -> bytes:
        self.entered.set()
        if not self.release.wait(timeout=5):
            raise RuntimeError("test export was not released")
        return self._delegate.build(
            images=images,
            categories=categories,
            annotations=annotations,
        )


def _seed_export(composition: CompositionRoot, tmp_path: Path) -> ExportSeed:
    project_id = str(uuid4())
    asset_id = str(uuid4())
    profile_id = str(uuid4())
    video_id = str(uuid4())
    run_id = str(uuid4())
    category_zero = str(uuid4())
    category_one = str(uuid4())
    frame_ids = {status: str(uuid4()) for status in ("accepted", "pending", "rejected")}
    image_relpaths = {
        "accepted": f"runs/{run_id}/frames/00000002.jpg",
        "pending": f"runs/{run_id}/frames/00000000.jpg",
        "rejected": f"runs/{run_id}/frames/00000001.jpg",
    }
    image_bytes = {
        "accepted": b"accepted-image",
        "pending": b"pending-image",
        "rejected": b"rejected-image",
    }
    for status, relpath in image_relpaths.items():
        path = composition.workspace.resolve_relpath(relpath)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(image_bytes[status])
    source = tmp_path / f"{run_id}.mp4"
    source.write_bytes(b"video")

    with composition.database.session() as session:
        session.add(Project(id=project_id, name="Project", workspace_path="workspace"))
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
                normalized_name=f"profile-{profile_id}",
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
                duration_ms=3000,
                width=100,
                height=50,
                fingerprint="fingerprint",
            )
        )
        session.flush()
        session.add_all(
            [
                Category(
                    id=category_one,
                    profile_id=profile_id,
                    name="one",
                    kind="character",
                    ordinal=1,
                ),
                Category(
                    id=category_zero,
                    profile_id=profile_id,
                    name="zero",
                    kind="character",
                    ordinal=0,
                ),
            ]
        )
        session.add(
            PipelineRun(
                id=run_id,
                profile_id=profile_id,
                video_id=video_id,
                interval_ms=1000,
                status="review_ready",
                attempt=1,
                total_frames=3,
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
                review_revision=7,
            )
        )
        session.flush()
        for frame_index, status in enumerate(("pending", "rejected", "accepted")):
            review_status = "rejected" if status == "pending" else status
            session.add(
                Frame(
                    id=frame_ids[status],
                    run_id=run_id,
                    frame_index=frame_index,
                    timestamp_ms=frame_index * 1000,
                    image_relpath=image_relpaths[status],
                    stage_status="review_pending",
                    review_status=review_status,
                    width=100,
                    height=50,
                    version=2,
                )
            )
            session.add(
                StageCheckpoint(
                    run_id=run_id,
                    frame_index=frame_index,
                    stage="sample",
                    attempt=1,
                    status="completed",
                    artifact_relpath=image_relpaths[status],
                    artifact_hash=hashlib.sha256(image_bytes[status]).hexdigest(),
                    error_code=None,
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
                )
            )
        session.flush()
        pending_annotation_id = str(uuid4())
        session.add_all(
            [
                Annotation(
                    id=str(uuid4()),
                    frame_id=frame_ids["accepted"],
                    category_id=category_one,
                    x=1,
                    y=2,
                    width=3,
                    height=4,
                    confidence=0.8,
                    source="ocr",
                    observation_id=None,
                    status="accepted",
                    version=1,
                ),
                Annotation(
                    id=str(uuid4()),
                    frame_id=frame_ids["accepted"],
                    category_id=category_zero,
                    x=10,
                    y=4,
                    width=10,
                    height=8,
                    confidence=None,
                    source="manual",
                    observation_id=None,
                    status="accepted",
                    version=1,
                ),
                Annotation(
                    id=str(uuid4()),
                    frame_id=frame_ids["accepted"],
                    category_id=category_zero,
                    x=40,
                    y=4,
                    width=2,
                    height=2,
                    confidence=0.5,
                    source="ocr",
                    observation_id=None,
                    status="deleted",
                    version=2,
                ),
                Annotation(
                    id=pending_annotation_id,
                    frame_id=frame_ids["pending"],
                    category_id=category_zero,
                    x=3,
                    y=3,
                    width=4,
                    height=5,
                    confidence=0.9,
                    source="ocr",
                    observation_id=None,
                    status="proposed",
                    version=1,
                ),
                Annotation(
                    id=str(uuid4()),
                    frame_id=frame_ids["rejected"],
                    category_id=category_one,
                    x=5,
                    y=5,
                    width=5,
                    height=5,
                    confidence=0.7,
                    source="ocr",
                    observation_id=None,
                    status="proposed",
                    version=1,
                ),
            ]
        )
    reopened = composition.review_use_cases.review_frame(
        frame_ids["pending"],
        decision="reopen",
        expected_version=2,
    )
    assert reopened.review_status == "pending"
    return ExportSeed(
        run_id,
        profile_id,
        frame_ids["accepted"],
        composition.workspace.resolve_relpath(image_relpaths["accepted"]),
        pending_annotation_id,
        category_one,
        frame_ids["rejected"],
    )


def _wait_for_export(
    use_cases: ExportUseCases,
    export_id: str,
    *,
    expected: str,
) -> dict[str, object]:
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        record = use_cases.get_export(export_id)
        if record.status == expected:
            return vars(record)
        time.sleep(0.01)
    pytest.fail(f"export {export_id} did not reach {expected}")


def test_coco_engine_matches_golden_and_is_byte_deterministic() -> None:
    engine = CocoExportEngine()
    images = (CocoImageInput("frame", 2, "images/00000002.jpg", 100, 50),)
    categories = (
        CocoCategoryInput("one", 1, "one"),
        CocoCategoryInput("zero", 0, "zero"),
    )
    annotations = (
        CocoAnnotationInput("z", "frame", "one", 1, 2, 3, 4),
        CocoAnnotationInput("a", "frame", "zero", 10, 4, 10, 8),
    )
    first = engine.build(images=images, categories=categories, annotations=annotations)
    second = engine.build(
        images=tuple(reversed(images)),
        categories=tuple(reversed(categories)),
        annotations=tuple(reversed(annotations)),
    )
    expected = json.loads(
        Path("backend/tests/fixtures/expected-coco/accepted-review.json").read_text(
            encoding="utf-8"
        )
    )
    assert json.loads(first) == expected
    assert first == second
    assert len({item["id"] for item in expected["images"]}) == len(expected["images"])
    assert len({item["id"] for item in expected["annotations"]}) == len(expected["annotations"])


def test_coco_engine_rejects_bbox_outside_image() -> None:
    with pytest.raises(CocoValidationError, match="invalid_bbox"):
        CocoExportEngine().build(
            images=(CocoImageInput("frame", 0, "images/00000000.jpg", 10, 10),),
            categories=(CocoCategoryInput("category", 0, "zero"),),
            annotations=(CocoAnnotationInput("annotation", "frame", "category", 9, 9, 2, 2),),
        )


def test_export_api_publishes_only_accepted_snapshot(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    seed = _seed_export(composition, tmp_path)
    app = create_app(composition.settings, composition=composition)
    with TestClient(app) as client:
        response = client.post("/api/v1/exports", json={"run_id": seed.run_id})
        assert response.status_code == 202, response.text
        export_id = response.json()["id"]
        completed = _wait_for_export(composition.export_use_cases, export_id, expected="completed")
        detail = client.get(f"/api/v1/exports/{export_id}")
        assert detail.status_code == 200
        assert detail.json()["status"] == "completed"
        assert detail.json()["input_revision"] == 8

        second_response = client.post("/api/v1/exports", json={"run_id": seed.run_id})
        assert second_response.status_code == 202
        second_completed = _wait_for_export(
            composition.export_use_cases,
            second_response.json()["id"],
            expected="completed",
        )

    output = composition.workspace.resolve_relpath(str(completed["output_relpath"]))
    annotations_path = output / "annotations.json"
    document_bytes = annotations_path.read_bytes()
    second_output = composition.workspace.resolve_relpath(str(second_completed["output_relpath"]))
    assert document_bytes == (second_output / "annotations.json").read_bytes()
    document = json.loads(document_bytes)
    validate_coco_document(document)
    expected = json.loads(
        Path("backend/tests/fixtures/expected-coco/accepted-review.json").read_text(
            encoding="utf-8"
        )
    )
    assert document == expected
    assert [item.name for item in (output / "images").iterdir()] == ["00000002.jpg"]
    assert (output / "images" / "00000002.jpg").read_bytes() == b"accepted-image"

    # Load the published dataset through the reference COCO API. These exact
    # negative assertions fail if a rejected/reopened frame or deleted annotation
    # leaks into the export, even when the leaked record is otherwise valid COCO.
    coco = COCO(str(annotations_path))
    exported_images = coco.loadImgs(coco.getImgIds())
    exported_annotations = coco.loadAnns(coco.getAnnIds())
    assert {image["file_name"] for image in exported_images} == {"images/00000002.jpg"}
    assert {tuple(annotation["bbox"]) for annotation in exported_annotations} == {
        (1, 2, 3, 4),
        (10, 4, 10, 8),
    }
    assert {
        "images/00000000.jpg",  # reopened and still pending
        "images/00000001.jpg",  # rejected
    }.isdisjoint(image["file_name"] for image in exported_images)
    assert {
        (3, 3, 4, 5),  # reopened frame annotation
        (5, 5, 5, 5),  # rejected frame annotation
        (40, 4, 2, 2),  # deleted annotation on the accepted frame
    }.isdisjoint(tuple(annotation["bbox"]) for annotation in exported_annotations)

    manifest = json.loads((output / "manifest.json").read_text(encoding="utf-8"))
    assert manifest == completed["manifest"]
    assert manifest["schema"] == "datasetfactory-coco-export-v1"
    assert manifest["run_id"] == seed.run_id
    assert manifest["profile_id"] == seed.profile_id
    with composition.database.session() as session:
        actual_sources = Counter(
            session.scalars(
                select(Annotation.source)
                .join(Frame, Annotation.frame_id == Frame.id)
                .where(
                    Frame.run_id == seed.run_id,
                    Frame.review_status == "accepted",
                    Annotation.status == "accepted",
                )
            )
        )
    assert (
        manifest["annotation_sources"]
        == {
            "ocr": actual_sources["ocr"],
            "manual": actual_sources["manual"],
        }
        == {"ocr": 1, "manual": 1}
    )
    assert sum(manifest["annotation_sources"].values()) == len(exported_annotations)
    assert all(
        str(composition.workspace.root) not in value
        for value in manifest.values()
        if isinstance(value, str)
    )


@pytest.mark.parametrize(
    ("mutation", "expected_error"),
    [
        pytest.param("missing_images", "schema:images:missing", id="missing-images"),
        pytest.param(
            "dangling_image_id",
            "annotations[0].image_id:missing:999",
            id="dangling-image-id",
        ),
        pytest.param(
            "dangling_category_id",
            "annotations[0].category_id:missing:999",
            id="dangling-category-id",
        ),
        pytest.param(
            "negative_bbox",
            "annotations[0].bbox:negative_origin",
            id="negative-bbox",
        ),
        pytest.param(
            "outside_bbox",
            "annotations[0].bbox:outside_image",
            id="outside-bbox",
        ),
        pytest.param(
            "duplicate_annotation_id",
            "annotations.id:duplicate:1",
            id="duplicate-annotation-id",
        ),
        pytest.param(
            "duplicate_image_id",
            "images.id:duplicate:1",
            id="duplicate-image-id",
        ),
        pytest.param(
            "duplicate_category_id",
            "categories.id:duplicate:1",
            id="duplicate-category-id",
        ),
        pytest.param(
            "short_bbox",
            "schema:annotations.0.bbox:too_short",
            id="own-short-bbox",
        ),
        pytest.param(
            "area_mismatch",
            "annotations[0].area:bbox_mismatch",
            id="own-area-mismatch",
        ),
        pytest.param(
            "invalid_iscrowd",
            "annotations[0].iscrowd:expected_0_or_1",
            id="own-invalid-iscrowd",
        ),
        # Every comparison against NaN is False, so an unguarded validator waves it
        # through the geometry checks. Reported as P3-1 by the independent review.
        pytest.param(
            "nan_bbox_origin",
            "annotations[0].bbox:not_finite",
            id="nan-bbox-origin",
        ),
        pytest.param(
            "nan_area",
            "annotations[0].area:not_finite",
            id="nan-area",
        ),
        # A non-strict Pydantic model coerces every one of these into a valid
        # document instead of rejecting it, so they pin `strict=True` in place.
        pytest.param(
            "number_as_string_image_id",
            "schema:annotations.0.image_id:int_type",
            id="number-as-string-image-id",
        ),
        pytest.param(
            "float_annotation_id",
            "schema:annotations.0.id:int_type",
            id="float-annotation-id",
        ),
        pytest.param(
            "float_image_width",
            "schema:images.0.width:int_type",
            id="float-image-width",
        ),
        pytest.param(
            "null_category_id",
            "schema:annotations.0.category_id:int_type",
            id="null-category-id",
        ),
        pytest.param(
            "bool_iscrowd",
            "schema:annotations.0.iscrowd:int_type",
            id="bool-iscrowd",
        ),
        pytest.param(
            "string_in_bbox",
            "schema:annotations.0.bbox.2.int:int_type",
            id="string-in-bbox",
        ),
        # Not a schema violation: the categories list stays well formed, so only
        # the referential check can catch the annotation left pointing nowhere.
        pytest.param(
            "empty_categories",
            "annotations[0].category_id:missing:1",
            id="empty-categories",
        ),
    ],
)
def test_strict_coco_validation_rejects_mutations_without_golden(
    mutation: str,
    expected_error: str,
) -> None:
    document = json.loads(
        CocoExportEngine().build(
            images=(CocoImageInput("frame", 0, "images/00000000.jpg", 100, 50),),
            categories=(CocoCategoryInput("category", 0, "zero"),),
            annotations=(CocoAnnotationInput("annotation", "frame", "category", 1, 2, 3, 4),),
        )
    )
    _mutate_coco_document(document, mutation)

    with pytest.raises(CocoComplianceError) as error:
        validate_coco_document(document)
    assert str(error.value) == expected_error


def _mutate_coco_document(document: dict[str, object], mutation: str) -> None:
    images = document["images"]
    annotations = document["annotations"]
    categories = document["categories"]
    assert (
        isinstance(images, list) and isinstance(annotations, list) and isinstance(categories, list)
    )
    image = images[0]
    annotation = annotations[0]
    category = categories[0]
    assert isinstance(image, dict) and isinstance(annotation, dict) and isinstance(category, dict)

    if mutation == "missing_images":
        del document["images"]
    elif mutation == "dangling_image_id":
        annotation["image_id"] = 999
    elif mutation == "dangling_category_id":
        annotation["category_id"] = 999
    elif mutation == "negative_bbox":
        annotation["bbox"] = [-1, 2, 3, 4]
    elif mutation == "outside_bbox":
        annotation["bbox"] = [98, 2, 3, 4]
    elif mutation == "duplicate_annotation_id":
        annotations.append({**annotation})
    elif mutation == "duplicate_image_id":
        images.append({**image, "file_name": "images/duplicate.jpg"})
    elif mutation == "duplicate_category_id":
        categories.append({**category, "name": "duplicate"})
    elif mutation == "short_bbox":
        annotation["bbox"] = [1, 2, 3]
    elif mutation == "area_mismatch":
        annotation["area"] = 13
    elif mutation == "invalid_iscrowd":
        annotation["iscrowd"] = 2
    elif mutation == "nan_bbox_origin":
        annotation["bbox"] = [float("nan"), 2, 3, 4]
    elif mutation == "nan_area":
        annotation["area"] = float("nan")
    elif mutation == "number_as_string_image_id":
        annotation["image_id"] = "1"
    elif mutation == "float_annotation_id":
        annotation["id"] = 1.0
    elif mutation == "float_image_width":
        image["width"] = 100.0
    elif mutation == "null_category_id":
        annotation["category_id"] = None
    elif mutation == "bool_iscrowd":
        annotation["iscrowd"] = True
    elif mutation == "string_in_bbox":
        bbox = annotation["bbox"]
        assert isinstance(bbox, list)
        bbox[2] = "3"
    elif mutation == "empty_categories":
        categories.clear()
    else:
        raise AssertionError(f"unknown mutation: {mutation}")


def test_strict_coco_validation_allows_extra_keys_but_not_missing_ones() -> None:
    """`extra="allow"` is a decision, not an oversight.

    COCO defines optional `info`, `licenses` and `segmentation` keys and consumers
    add their own, so rejecting unknown keys would reject spec-compliant files.
    Tightening the models to `extra="forbid"` breaks this test on purpose. What the
    permissive setting must never do is let a *missing* required key through.
    """
    document = json.loads(
        CocoExportEngine().build(
            images=(CocoImageInput("frame", 0, "images/00000000.jpg", 100, 50),),
            categories=(CocoCategoryInput("category", 0, "zero"),),
            annotations=(CocoAnnotationInput("annotation", "frame", "category", 1, 2, 3, 4),),
        )
    )
    document["info"] = {"description": "unknown to the validator"}
    document["licenses"] = []
    annotations = document["annotations"]
    images = document["images"]
    categories = document["categories"]
    assert (
        isinstance(annotations, list) and isinstance(images, list) and isinstance(categories, list)
    )
    annotation = annotations[0]
    image = images[0]
    category = categories[0]
    assert isinstance(annotation, dict) and isinstance(image, dict) and isinstance(category, dict)
    annotation["segmentation"] = []
    image["license"] = 1
    category["supercategory"] = "text"

    validate_coco_document(document)

    del annotation["area"]
    with pytest.raises(CocoComplianceError) as error:
        validate_coco_document(document)
    assert str(error.value) == "schema:annotations.0.area:missing"


def test_manifest_annotation_sources_always_contains_zero_counts(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    seed = _seed_export(composition, tmp_path)
    with composition.database.session() as session:
        for annotation in session.scalars(
            select(Annotation).where(
                Annotation.frame_id == seed.accepted_frame_id,
                Annotation.status == "accepted",
            )
        ):
            annotation.source = "ocr"

    record = composition.export_use_cases.create_export(seed.run_id)
    completed = _wait_for_export(composition.export_use_cases, record.id, expected="completed")
    manifest = completed["manifest"]
    assert isinstance(manifest, dict)
    assert manifest["annotation_sources"] == {"ocr": 2, "manual": 0}


def test_export_api_errors_and_missing_source_publish_nothing(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    seed = _seed_export(composition, tmp_path)
    seed.accepted_image.unlink()
    app = create_app(composition.settings, composition=composition)
    with TestClient(app) as client:
        missing_run = client.post("/api/v1/exports", json={"run_id": str(uuid4())})
        assert missing_run.status_code == 404
        assert missing_run.json()["error"]["code"] == "run_not_found"

        response = client.post("/api/v1/exports", json={"run_id": seed.run_id})
        export_id = response.json()["id"]
        failed = _wait_for_export(composition.export_use_cases, export_id, expected="failed")
        assert failed["error_code"] == "export_source_missing"
        assert not composition.workspace.resolve_relpath(f"exports/{export_id}").exists()
        assert not tuple(composition.workspace.resolve_relpath("exports").glob(f".{export_id}-*"))

    empty_seed = _seed_export(composition, tmp_path)
    with composition.database.session() as session:
        accepted = session.get(Frame, empty_seed.accepted_frame_id)
        assert accepted is not None
        accepted.review_status = "rejected"
    with TestClient(app) as client:
        empty = client.post("/api/v1/exports", json={"run_id": empty_seed.run_id})
        assert empty.status_code == 400
        assert empty.json()["error"]["code"] == "no_accepted_frames"


def test_review_mutation_during_generation_fails_revision_and_cleans_temp(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    seed = _seed_export(composition, tmp_path)
    engine = BlockingCocoEngine()
    use_cases = ExportUseCases(
        engine,
        ExportRepository(composition.database, composition.workspace),
        composition.logger,
        clock=lambda: datetime(2026, 8, 4, 12, 0, tzinfo=UTC),
    )
    try:
        record = use_cases.create_export(seed.run_id)
        assert engine.entered.wait(timeout=5)
        composition.review_use_cases.correct_annotation(
            seed.pending_annotation_id,
            category_id=seed.alternate_category_id,
            expected_version=1,
        )
        engine.release.set()
        failed = _wait_for_export(use_cases, record.id, expected="failed")
        assert failed["error_code"] == "export_revision_conflict"
        assert not composition.workspace.resolve_relpath(f"exports/{record.id}").exists()
        assert not tuple(composition.workspace.resolve_relpath("exports").glob(f".{record.id}-*"))
    finally:
        engine.release.set()
        use_cases.shutdown()


def test_reopen_during_generation_fails_revision_and_cleans_temp(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    seed = _seed_export(composition, tmp_path)
    engine = BlockingCocoEngine()
    use_cases = ExportUseCases(
        engine,
        ExportRepository(composition.database, composition.workspace),
        composition.logger,
        clock=lambda: datetime(2026, 8, 4, 12, 0, tzinfo=UTC),
    )
    try:
        record = use_cases.create_export(seed.run_id)
        assert engine.entered.wait(timeout=5)
        reopened = composition.review_use_cases.review_frame(
            seed.rejected_frame_id,
            decision="reopen",
            expected_version=2,
        )
        assert reopened.review_status == "pending"
        engine.release.set()
        failed = _wait_for_export(use_cases, record.id, expected="failed")
        assert failed["error_code"] == "export_revision_conflict"
        assert not composition.workspace.resolve_relpath(f"exports/{record.id}").exists()
        assert not tuple(composition.workspace.resolve_relpath("exports").glob(f".{record.id}-*"))
    finally:
        engine.release.set()
        use_cases.shutdown()


def test_completed_export_stays_immutable_after_reopen_manual_box_and_reaccept(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    seed = _seed_export(composition, tmp_path)
    first = composition.export_use_cases.create_export(seed.run_id)
    completed = _wait_for_export(composition.export_use_cases, first.id, expected="completed")
    first_output = composition.workspace.resolve_relpath(str(completed["output_relpath"]))
    original_files = {
        path.relative_to(first_output).as_posix(): path.read_bytes()
        for path in first_output.rglob("*")
        if path.is_file()
    }

    reopened = composition.review_use_cases.review_frame(
        seed.rejected_frame_id,
        decision="reopen",
        expected_version=2,
    )
    assert reopened.review_status == "pending"
    assert len(reopened.annotations) == 1
    manual = composition.review_use_cases.create_manual_annotation(
        seed.rejected_frame_id,
        category_id=seed.alternate_category_id,
        bbox=(20, 20, 5, 5),
        expected_version=3,
    )
    assert manual.source == "manual"
    accepted = composition.review_use_cases.review_frame(
        seed.rejected_frame_id,
        decision="accept",
        expected_version=4,
    )
    assert accepted.review_status == "accepted"
    assert len(accepted.annotations) == 2

    assert {
        path.relative_to(first_output).as_posix(): path.read_bytes()
        for path in first_output.rglob("*")
        if path.is_file()
    } == original_files

    second = composition.export_use_cases.create_export(seed.run_id)
    refreshed = _wait_for_export(composition.export_use_cases, second.id, expected="completed")
    refreshed_output = composition.workspace.resolve_relpath(str(refreshed["output_relpath"]))
    document = json.loads((refreshed_output / "annotations.json").read_bytes())
    assert len(document["images"]) == 2
    assert len(document["annotations"]) == 4
    assert {tuple(item["bbox"]) for item in document["annotations"]} >= {
        (5, 5, 5, 5),
        (20, 20, 5, 5),
    }
    refreshed_manifest = refreshed["manifest"]
    assert isinstance(refreshed_manifest, dict)
    assert refreshed_manifest["annotation_sources"] == {"ocr": 2, "manual": 2}


def test_failed_atomic_rename_leaves_no_published_directory(
    composition: CompositionRoot,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seed = _seed_export(composition, tmp_path)

    def fail_replace(source: Path, destination: Path) -> None:
        del source, destination
        raise OSError("rename failed")

    monkeypatch.setattr("backend.app.access.store.repositories.exports.os.replace", fail_replace)
    record = composition.export_use_cases.create_export(seed.run_id)
    failed = _wait_for_export(composition.export_use_cases, record.id, expected="failed")
    assert failed["error_code"] == "export_publish_failed"
    assert not composition.workspace.resolve_relpath(f"exports/{record.id}").exists()
    assert not tuple(composition.workspace.resolve_relpath("exports").glob(f".{record.id}-*"))


def test_concurrent_post_uses_database_export_running_constraint(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    seed = _seed_export(composition, tmp_path)
    composition.export_use_cases.shutdown()
    engine = BlockingCocoEngine()
    composition.export_use_cases = ExportUseCases(
        engine,
        ExportRepository(composition.database, composition.workspace),
        composition.logger,
    )
    app = create_app(composition.settings, composition=composition)
    with TestClient(app) as client:
        first = client.post("/api/v1/exports", json={"run_id": seed.run_id})
        assert first.status_code == 202
        assert engine.entered.wait(timeout=5)
        second = client.post("/api/v1/exports", json={"run_id": seed.run_id})
        assert second.status_code == 409
        assert second.json()["error"]["code"] == "export_running"
        engine.release.set()
        _wait_for_export(composition.export_use_cases, first.json()["id"], expected="completed")


def test_latest_export_is_nullable_and_breaks_created_at_ties_by_id(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    seed = _seed_export(composition, tmp_path)
    created_at = datetime(2026, 8, 24, 12, 0, tzinfo=UTC)
    with composition.database.session() as session:
        session.add_all(
            [
                Export(
                    id="00000000-0000-0000-0000-00000000000a",
                    run_id=seed.run_id,
                    status="completed",
                    output_relpath="exports/older",
                    input_revision=7,
                    error_code=None,
                    manifest_json=None,
                    created_at=created_at,
                    updated_at=created_at,
                ),
                Export(
                    id="00000000-0000-0000-0000-00000000000b",
                    run_id=seed.run_id,
                    status="failed",
                    output_relpath=None,
                    input_revision=8,
                    error_code="export_source_missing",
                    manifest_json=None,
                    created_at=created_at,
                    updated_at=created_at,
                ),
            ]
        )

    app = create_app(composition.settings, composition=composition)
    with TestClient(app) as client:
        latest = client.get("/api/v1/exports/latest", params={"run_id": seed.run_id})
        assert latest.status_code == 200
        assert latest.json()["id"] == "00000000-0000-0000-0000-00000000000b"
        assert latest.json()["error_code"] == "export_source_missing"

        missing = client.get(
            "/api/v1/exports/latest",
            params={"run_id": "00000000-0000-0000-0000-000000000099"},
        )
        assert missing.status_code == 200
        assert missing.json() is None

        detail = client.get("/api/v1/exports/00000000-0000-0000-0000-00000000000a")
        assert detail.status_code == 200
        assert detail.json()["id"].endswith("a")
