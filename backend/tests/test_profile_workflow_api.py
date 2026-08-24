from __future__ import annotations

import struct
import zlib
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Never
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from backend.app.access.media.image import ReferenceImageProbe
from backend.app.access.store.models import GameProfile, ReferenceAsset
from backend.app.access.store.repositories.projects import ProjectRepository
from backend.app.composition import CompositionRoot
from backend.app.engines.definition import BBox, CategoryDefinition, RegionDefinition
from backend.app.main import create_app
from backend.app.managers.workflow.profile_use_cases import ProfileUseCaseError


def _chunk(name: bytes, payload: bytes) -> bytes:
    body = name + payload
    return struct.pack(">I", len(payload)) + body + struct.pack(">I", zlib.crc32(body))


def _write_png(path: Path, *, width: int = 32, height: int = 24) -> bytes:
    scanlines = b"".join(b"\x00" + b"\x00\x00\x00" * width for _ in range(height))
    content = (
        b"\x89PNG\r\n\x1a\n"
        + _chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + _chunk(b"IDAT", zlib.compress(scanlines))
        + _chunk(b"IEND", b"")
    )
    path.write_bytes(content)
    return content


def _write_monochrome_png(path: Path, *, width: int, height: int) -> bytes:
    compressor = zlib.compressobj()
    compressed = bytearray()
    scanline = b"\x00" + bytes((width + 7) // 8)
    for _ in range(height):
        compressed.extend(compressor.compress(scanline))
    compressed.extend(compressor.flush())
    content = (
        b"\x89PNG\r\n\x1a\n"
        + _chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 1, 0, 0, 0, 0))
        + _chunk(b"IDAT", bytes(compressed))
        + _chunk(b"IEND", b"")
    )
    path.write_bytes(content)
    return content


def _payload(path: Path, *, name: str = "Test Game") -> dict[str, object]:
    return {
        "name": name,
        "reference_image_path": str(path.resolve()),
        "regions": [{"name": "HUD", "x": 0, "y": 0, "width": 32, "height": 24}],
        "categories": [
            {"name": "0", "kind": "character"},
            {"name": "health", "kind": "game"},
        ],
    }


def _invalid_png_variants() -> tuple[bytes, ...]:
    header_only = bytes.fromhex("89504e470d0a1a0a0000000d494844520000002000000018")
    no_pixels = (
        b"\x89PNG\r\n\x1a\n"
        + _chunk(b"IHDR", struct.pack(">IIBBBBB", 32, 24, 8, 2, 0, 0, 0))
        + _chunk(b"IEND", b"")
    )
    corrupted = bytearray()
    path_payload = zlib.compress(b"\x00" + b"\x00\x00\x00" * 32)
    corrupted.extend(b"\x89PNG\r\n\x1a\n")
    corrupted.extend(_chunk(b"IHDR", struct.pack(">IIBBBBB", 32, 1, 8, 2, 0, 0, 0)))
    corrupted.extend(_chunk(b"IDAT", path_payload))
    corrupted.extend(_chunk(b"IEND", b""))
    corrupted[-16] ^= 0xFF
    return header_only, no_pixels, bytes(corrupted)


def test_reference_preview_returns_real_dimensions_and_resolves_opaque_asset(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    source = tmp_path / "reference.png"
    expected_content = _write_png(source, width=37, height=19)
    app = create_app(composition.settings, composition=composition)

    with TestClient(app) as client:
        response = client.post(
            "/api/v1/profiles/reference-preview",
            json={"reference_image_path": str(source.resolve())},
        )
        assert response.status_code == 201
        body = response.json()
        assert body["width"] == 37
        assert body["height"] == 19
        assert set(body) == {"asset_id", "width", "height"}

        asset = client.get(f"/api/v1/assets/references/{body['asset_id']}")
        assert asset.status_code == 200
        assert asset.headers["content-type"] == "image/png"
        assert asset.content == expected_content

    with composition.database.session() as session:
        assert session.scalar(select(func.count()).select_from(GameProfile)) == 0
        assert session.scalar(select(func.count()).select_from(ReferenceAsset)) == 0


def test_reference_preview_rejects_missing_and_relative_paths(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    app = create_app(composition.settings, composition=composition)

    with TestClient(app) as client:
        relative = client.post(
            "/api/v1/profiles/reference-preview",
            json={"reference_image_path": "images/reference.png"},
        )
        missing = client.post(
            "/api/v1/profiles/reference-preview",
            json={"reference_image_path": str((tmp_path / "missing.png").resolve())},
        )

    assert relative.status_code == 400
    assert relative.json()["error"]["code"] == "reference_path_not_absolute"
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "source_missing"


def test_profile_aggregate_and_reference_asset_are_created_atomically(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    source = tmp_path / "reference.png"
    expected_content = _write_png(source)
    app = create_app(composition.settings, composition=composition)

    with TestClient(app) as client:
        response = client.post("/api/v1/profiles", json=_payload(source))
        assert response.status_code == 201
        body = response.json()
        assert body["source_width"] == 32
        assert body["source_height"] == 24
        assert "reference_image_path" not in response.text

        current = client.get("/api/v1/profiles/current")
        assert current.status_code == 200
        assert current.json() == body

        asset = client.get(body["reference_asset_url"])
        assert asset.status_code == 200
        assert asset.headers["content-type"] == "image/png"
        assert asset.content == expected_content

    with composition.database.session() as session:
        assert session.scalar(select(func.count()).select_from(GameProfile)) == 1
        assert session.scalar(select(func.count()).select_from(ReferenceAsset)) == 1


def test_profile_publish_failure_rolls_back_database_and_removes_temp_asset(
    composition: CompositionRoot,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = tmp_path / "reference.png"
    _write_png(source)

    def fail_publish(_: Path, __: Path) -> None:
        raise OSError("simulated destination failure")

    monkeypatch.setattr("backend.app.access.store.reference_assets.os.replace", fail_publish)

    with pytest.raises(ProfileUseCaseError) as error:
        composition.profile_use_cases.create_profile(
            name="Failure",
            reference_image_path=str(source.resolve()),
            regions=(),
            categories=(),
        )
    assert error.value.code == "regions_required"

    # Exercise the publish failure after both independent DTO and engine validation pass.
    with pytest.raises(ProfileUseCaseError) as publish_error:
        composition.profile_use_cases.create_profile(
            name="Failure",
            reference_image_path=str(source.resolve()),
            regions=(RegionDefinition("HUD", BBox(0, 0, 32, 24)),),
            categories=(CategoryDefinition("0", "character"),),
        )
    assert publish_error.value.code == "reference_asset_copy_failed"

    with composition.database.session() as session:
        assert session.scalar(select(func.count()).select_from(GameProfile)) == 0
        assert session.scalar(select(func.count()).select_from(ReferenceAsset)) == 0
    assert list((composition.workspace.root / "assets" / "references").iterdir()) == []


def test_duplicate_profile_transaction_does_not_leave_orphan_asset(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    source = tmp_path / "reference.png"
    _write_png(source)
    app = create_app(composition.settings, composition=composition)

    with TestClient(app) as client:
        first = client.post("/api/v1/profiles", json=_payload(source, name="Same"))
        second = client.post("/api/v1/profiles", json=_payload(source, name=" same "))

    assert first.status_code == 201
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "profile_name_exists"
    with composition.database.session() as session:
        assert session.scalar(select(func.count()).select_from(GameProfile)) == 1
        assert session.scalar(select(func.count()).select_from(ReferenceAsset)) == 1
    assert len(list((composition.workspace.root / "assets" / "references").iterdir())) == 1


def test_asset_endpoint_rejects_persisted_path_escape(
    composition: CompositionRoot,
) -> None:
    asset_id = str(uuid4())
    with composition.database.session() as session:
        session.add(
            ReferenceAsset(
                id=asset_id,
                relpath="../../outside.png",
                content_type="image/png",
                size_bytes=1,
            )
        )
    app = create_app(composition.settings, composition=composition)

    with TestClient(app) as client:
        response = client.get(f"/api/v1/assets/references/{asset_id}")
        traversal = client.get("/api/v1/assets/references/..%2F..%2Foutside.png")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "asset_not_found"
    assert traversal.status_code in {400, 404}


def test_profile_request_is_rejected_by_pydantic_before_use_case(
    composition: CompositionRoot,
) -> None:
    app = create_app(composition.settings, composition=composition)
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/profiles",
            json={
                "name": "Invalid",
                "reference_image_path": "D:/missing.png",
                "regions": [{"name": "bad", "x": 0, "y": 0, "width": 0, "height": 1}],
                "categories": [{"name": "0", "kind": "character"}],
            },
        )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "validation_error"


@pytest.mark.parametrize("content", _invalid_png_variants())
def test_undecodable_reference_never_creates_profile_or_final_asset(
    content: bytes,
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    source = tmp_path / "invalid.png"
    source.write_bytes(content)
    app = create_app(composition.settings, composition=composition)

    with TestClient(app) as client:
        response = client.post("/api/v1/profiles", json=_payload(source))

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_reference_image"
    with composition.database.session() as session:
        assert session.scalar(select(func.count()).select_from(GameProfile)) == 0
        assert session.scalar(select(func.count()).select_from(ReferenceAsset)) == 0
    assert list((composition.workspace.root / "assets" / "references").iterdir()) == []


@pytest.mark.parametrize(
    ("width", "height"),
    ((10_000, 10_000), (20_000, 10_000)),
    ids=("decompression-bomb-warning", "decompression-bomb-error"),
)
def test_decompression_bomb_is_invalid_and_removes_staged_asset(
    width: int,
    height: int,
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    source = tmp_path / "large-reference.png"
    _write_monochrome_png(source, width=width, height=height)
    app = create_app(composition.settings, composition=composition)

    with TestClient(app) as client:
        response = client.post("/api/v1/profiles", json=_payload(source))

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_reference_image"
    with composition.database.session() as session:
        assert session.scalar(select(func.count()).select_from(GameProfile)) == 0
        assert session.scalar(select(func.count()).select_from(ReferenceAsset)) == 0
    assert list((composition.workspace.root / "assets" / "references").iterdir()) == []


def test_unexpected_image_inspection_error_removes_staged_asset(
    composition: CompositionRoot,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = tmp_path / "reference.png"
    _write_png(source)

    def fail_inspection(_: ReferenceImageProbe, __: Path) -> Never:
        raise LookupError("unexpected inspection failure")

    monkeypatch.setattr(ReferenceImageProbe, "inspect", fail_inspection)

    with pytest.raises(LookupError, match="unexpected inspection failure"):
        composition.profile_use_cases.create_profile(
            name="Failure",
            reference_image_path=str(source.resolve()),
            regions=(RegionDefinition("HUD", BBox(0, 0, 32, 24)),),
            categories=(CategoryDefinition("0", "character"),),
        )

    with composition.database.session() as session:
        assert session.scalar(select(func.count()).select_from(GameProfile)) == 0
        assert session.scalar(select(func.count()).select_from(ReferenceAsset)) == 0
    assert list((composition.workspace.root / "assets" / "references").iterdir()) == []


def test_case_insensitive_profile_name_is_race_safe(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    source = tmp_path / "reference.png"
    _write_png(source)
    ProjectRepository(composition.database, composition.workspace).get_or_create_current_id()

    def create(name: str) -> str:
        try:
            composition.profile_use_cases.create_profile(
                name=name,
                reference_image_path=str(source.resolve()),
                regions=(RegionDefinition("HUD", BBox(0, 0, 32, 24)),),
                categories=(CategoryDefinition("0", "character"),),
            )
        except ProfileUseCaseError as error:
            return error.code
        return "created"

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(create, ("Foo", "foo")))

    assert sorted(results) == ["created", "profile_name_exists"]
    with composition.database.session() as session:
        assert session.scalar(select(func.count()).select_from(GameProfile)) == 1
        assert session.scalar(select(func.count()).select_from(ReferenceAsset)) == 1
    assert len(list((composition.workspace.root / "assets" / "references").iterdir())) == 1


def test_category_order_round_trips_deterministically(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    source = tmp_path / "reference.png"
    _write_png(source)
    payload = _payload(source)
    categories = [{"name": character, "kind": "character"} for character in "9876543210"]
    payload["categories"] = categories
    expected = [item["name"] for item in categories]
    app = create_app(composition.settings, composition=composition)

    with TestClient(app) as client:
        created = client.post("/api/v1/profiles", json=payload)
        assert created.status_code == 201
        assert [item["name"] for item in created.json()["categories"]] == expected
        for _ in range(20):
            current = client.get("/api/v1/profiles/current")
            assert [item["name"] for item in current.json()["categories"]] == expected
