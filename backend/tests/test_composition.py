from __future__ import annotations

from sqlalchemy import inspect

from backend.app.access.store.database import sqlite_pragmas
from backend.app.composition import CompositionRoot

EXPECTED_TABLES = {
    "annotations",
    "categories",
    "exports",
    "frames",
    "game_profiles",
    "hud_regions",
    "ocr_observations",
    "pipeline_runs",
    "projects",
    "reference_assets",
    "region_samples",
    "stage_checkpoints",
    "video_assets",
}


def test_full_composition_root_builds_without_server(composition: CompositionRoot) -> None:
    assert composition.workspace.root.is_dir()
    assert composition.workspace.cache_dir.is_dir()
    assert composition.log_path.is_file()
    assert set(inspect(composition.database.engine).get_table_names()) >= EXPECTED_TABLES

    foreign_keys, journal_mode = sqlite_pragmas(composition.database.engine)
    assert foreign_keys == 1
    assert journal_mode.lower() == "wal"

    snapshot = composition.system_status.snapshot()
    assert snapshot.operational is True
    assert snapshot.ffmpeg.available is True
    assert snapshot.ffmpeg.detail == "available"
    assert composition.project_store.resolve_artifact("runs/example/frame.jpg").startswith(
        str(composition.workspace.root)
    )
    assert composition.review_use_cases is not None
    assert composition.export_use_cases is not None

    # The dashboard reader is wired and answers on an empty install.
    dashboard = composition.dashboard_use_cases.snapshot()
    assert dashboard.project is None
    assert dashboard.run is None
    assert dashboard.system.operational is True
