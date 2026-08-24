from __future__ import annotations

import os
import time
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import func, select

from backend.app.access.store.models import GameProfile, ReferenceAsset
from backend.app.access.store.reconciliation import ReferenceAssetReconciler
from backend.app.composition import CompositionRoot, build_composition
from backend.app.config import Settings
from backend.app.main import create_app
from backend.tests.conftest import AvailableResourceProbe


def test_startup_reconciliation_covers_crash_windows_and_is_idempotent(
    composition: CompositionRoot,
) -> None:
    references = composition.workspace.root / "assets" / "references"

    # Crash before rename: only a staged temp remains.
    stale_temp = references / ".staged-crash.tmp"
    stale_temp.write_bytes(b"staged")
    os.utime(stale_temp, (1, 1))
    recent_temp = references / ".active-stage.tmp"
    recent_temp.write_bytes(b"active")

    # Crash after rename but before commit: final file exists without a DB row.
    orphan_final = references / "orphan.png"
    orphan_final.write_bytes(b"orphan")

    # Crash after commit: the committed row and final file must remain untouched.
    valid_final = references / "valid.png"
    valid_final.write_bytes(b"committed")
    with composition.database.session() as session:
        session.add_all(
            [
                ReferenceAsset(
                    id="valid",
                    relpath="assets/references/valid.png",
                    content_type="image/png",
                    size_bytes=valid_final.stat().st_size,
                    status="ready",
                ),
                ReferenceAsset(
                    id="missing",
                    relpath="assets/references/missing.png",
                    content_type="image/png",
                    size_bytes=10,
                    status="ready",
                ),
            ]
        )

    reconciler = ReferenceAssetReconciler(
        composition.database,
        composition.workspace,
        temporary_stale_seconds=300,
    )
    result = reconciler.reconcile(now=time.time())

    assert result.removed_temporary == 1
    assert result.removed_orphaned == 1
    assert result.marked_missing == 1
    assert stale_temp.exists() is False
    assert recent_temp.is_file()
    assert orphan_final.exists() is False
    assert valid_final.read_bytes() == b"committed"
    with composition.database.session() as session:
        valid_asset = session.get(ReferenceAsset, "valid")
        missing_asset = session.get(ReferenceAsset, "missing")
        assert valid_asset is not None
        assert missing_asset is not None
        assert valid_asset.status == "ready"
        assert missing_asset.status == "missing"

    second = reconciler.reconcile(now=time.time())
    assert second.removed_temporary == 0
    assert second.removed_orphaned == 0
    assert second.marked_missing == 0
    assert second.marked_ready == 0


def test_reconciliation_marks_restored_committed_asset_ready(
    composition: CompositionRoot,
) -> None:
    references = composition.workspace.root / "assets" / "references"
    with composition.database.session() as session:
        session.add(
            ReferenceAsset(
                id="restored",
                relpath="assets/references/restored.jpg",
                content_type="image/jpeg",
                size_bytes=8,
                status="missing",
            )
        )
    restored = references / "restored.jpg"
    restored.write_bytes(b"restored")

    result = ReferenceAssetReconciler(
        composition.database,
        composition.workspace,
    ).reconcile()

    assert result.marked_ready == 1
    with composition.database.session() as session:
        asset = session.get(ReferenceAsset, "restored")
        assert asset is not None
        assert asset.status == "ready"


def test_composition_startup_invokes_reconciliation(settings: Settings) -> None:
    first = build_composition(settings, resource_probe=AvailableResourceProbe())
    references = first.workspace.root / "assets" / "references"
    with first.database.session() as session:
        session.add(
            ReferenceAsset(
                id="startup-missing",
                relpath="assets/references/startup-missing.png",
                content_type="image/png",
                size_bytes=8,
                status="ready",
            )
        )
    first.close()
    stale_temp = references / ".startup-crash.tmp"
    stale_temp.write_bytes(b"temp")
    os.utime(stale_temp, (1, 1))
    orphan = references / "startup-orphan.png"
    orphan.write_bytes(b"orphan")

    restarted = build_composition(settings, resource_probe=AvailableResourceProbe())
    try:
        assert stale_temp.exists() is False
        assert orphan.exists() is False
        with restarted.database.session() as session:
            asset = session.get(ReferenceAsset, "startup-missing")
            assert asset is not None
            assert asset.status == "missing"
    finally:
        restarted.close()


def test_startup_sweeps_abandoned_reference_preview_without_creating_profile(
    settings: Settings,
    tmp_path: Path,
) -> None:
    source = tmp_path / "preview.png"
    Image.new("RGB", (41, 23)).save(source, format="PNG")
    first = build_composition(settings, resource_probe=AvailableResourceProbe())
    app = create_app(settings, composition=first)
    try:
        with TestClient(app) as client:
            preview = client.post(
                "/api/v1/profiles/reference-preview",
                json={"reference_image_path": str(source.resolve())},
            )
            assert preview.status_code == 201
            asset_id = preview.json()["asset_id"]
            current = client.get("/api/v1/profiles/current")
            assert current.status_code == 200
            assert current.json() is None

        references = first.workspace.root / "assets" / "references"
        published = tuple(references.glob(f"{asset_id}.*"))
        assert len(published) == 1
        with first.database.session() as session:
            assert session.scalar(select(func.count()).select_from(GameProfile)) == 0
            assert session.scalar(select(func.count()).select_from(ReferenceAsset)) == 0
    finally:
        first.close()

    restarted = build_composition(settings, resource_probe=AvailableResourceProbe())
    try:
        assert published[0].exists() is False
        with restarted.database.session() as session:
            assert session.scalar(select(func.count()).select_from(GameProfile)) == 0
            assert session.scalar(select(func.count()).select_from(ReferenceAsset)) == 0
    finally:
        restarted.close()
