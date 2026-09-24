from __future__ import annotations

import hashlib
import json

import pytest
from alembic import command
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, text

from backend.app.access.store.migrations import SchemaUpgradeBlockedError, alembic_config
from backend.app.composition import build_composition
from backend.app.config import Settings
from backend.app.main import create_app
from backend.tests.conftest import AvailableResourceProbe
from backend.tests.test_composition import EXPECTED_TABLES
from backend.tests.test_durable_workflow import (
    PerRegionOcrEngine,
    StubMediaAccess,
    _install_workflow,
    _wait_status,
)


def test_initial_migration_up_down_up(settings: Settings) -> None:
    config = alembic_config(settings)

    command.upgrade(config, "head")
    engine = create_engine(settings.database_url)
    inspector = inspect(engine)
    assert set(inspector.get_table_names()) >= EXPECTED_TABLES
    profile_columns = {column["name"]: column for column in inspector.get_columns("game_profiles")}
    project_columns = {column["name"]: column for column in inspector.get_columns("projects")}
    region_columns = {column["name"]: column for column in inspector.get_columns("hud_regions")}
    reference_columns = {
        column["name"]: column for column in inspector.get_columns("reference_assets")
    }
    assert profile_columns["source_width"]["nullable"] is False
    assert profile_columns["source_height"]["nullable"] is False
    assert {
        "x",
        "y",
        "width",
        "height",
        "ocr_allowed_chars",
        "ocr_page_segmentation_mode",
    } <= region_columns.keys()
    assert all(region_columns[name]["nullable"] is False for name in ("x", "y", "width", "height"))
    assert {"id", "relpath", "content_type", "size_bytes"} <= reference_columns.keys()
    assert "status" in reference_columns
    assert "normalized_name" in profile_columns
    assert project_columns["active_profile_id"]["nullable"] is True
    category_columns = {column["name"] for column in inspector.get_columns("categories")}
    assert "ordinal" in category_columns
    run_columns = {column["name"] for column in inspector.get_columns("pipeline_runs")}
    checkpoint_columns = {column["name"] for column in inspector.get_columns("stage_checkpoints")}
    observation_columns = {column["name"] for column in inspector.get_columns("ocr_observations")}
    export_columns = {column["name"] for column in inspector.get_columns("exports")}
    assert {
        "current_stage",
        "current_frame_index",
        "control_requested",
        "workflow_slot",
        "resume_token",
        "resume_owner",
        "ocr_engine",
        "experimental",
        "quality_gate",
        "warning",
    } <= run_columns
    assert "review_revision" in run_columns
    assert {"recovery_skipped_frames", "ocr_region_config_json"} <= run_columns
    assert "error_code" in export_columns
    assert {
        "ocr_engine",
        "experimental",
        "quality_gate",
        "warning",
        "ocr_region_config_json",
    } <= checkpoint_columns
    assert {"runtime_sha256", "experimental", "quality_gate", "warning"} <= (observation_columns)
    run_indexes = {index["name"]: index for index in inspector.get_indexes("pipeline_runs")}
    assert run_indexes["uq_pipeline_runs_global_workflow_slot"]["unique"] == 1
    export_indexes = {index["name"]: index for index in inspector.get_indexes("exports")}
    assert export_indexes["uq_exports_active_run"]["unique"] == 1
    with engine.connect() as connection:
        export_index_sql = connection.execute(
            text("SELECT sql FROM sqlite_master WHERE name='uq_exports_active_run'")
        ).scalar_one()
    assert "WHERE status IN ('queued','running')" in export_index_sql
    run_checks = {
        constraint["name"] for constraint in inspector.get_check_constraints("pipeline_runs")
    }
    assert "ck_pipeline_workflow_slot" in run_checks

    foreign_keys = inspector.get_foreign_keys("hud_regions")
    assert any(
        foreign_key["constrained_columns"] == ["profile_id"]
        and foreign_key["referred_table"] == "game_profiles"
        and foreign_key["options"].get("ondelete") == "CASCADE"
        for foreign_key in foreign_keys
    )
    profile_foreign_keys = inspector.get_foreign_keys("game_profiles")
    assert any(
        foreign_key["constrained_columns"] == ["reference_asset_id"]
        and foreign_key["referred_table"] == "reference_assets"
        for foreign_key in profile_foreign_keys
    )
    project_foreign_keys = inspector.get_foreign_keys("projects")
    assert any(
        foreign_key["constrained_columns"] == ["active_profile_id"]
        and foreign_key["referred_table"] == "game_profiles"
        and foreign_key["options"].get("ondelete") == "SET NULL"
        for foreign_key in project_foreign_keys
    )
    profile_checks = {
        constraint["name"] for constraint in inspector.get_check_constraints("game_profiles")
    }
    region_checks = {
        constraint["name"] for constraint in inspector.get_check_constraints("hud_regions")
    }
    assert "ck_profile_source_size" in profile_checks
    assert {
        "ck_hud_region_origin",
        "ck_hud_region_size",
        "ck_hud_region_ocr_psm",
        "ck_hud_region_ocr_config_complete",
    } <= region_checks
    engine.dispose()

    command.downgrade(config, "base")
    engine = create_engine(settings.database_url)
    assert EXPECTED_TABLES.isdisjoint(inspect(engine).get_table_names())
    engine.dispose()

    command.upgrade(config, "head")
    engine = create_engine(settings.database_url)
    assert set(inspect(engine).get_table_names()) >= EXPECTED_TABLES
    engine.dispose()


def test_region_ocr_config_migration_materializes_legacy_run_and_resumes(
    settings: Settings,
) -> None:
    config = alembic_config(settings)
    command.upgrade(config, "0006")
    engine = create_engine(settings.database_url)
    now = "2026-09-23T08:00:00+00:00"
    source = settings.workspace_dir.parent / "legacy.mp4"
    source.write_bytes(b"legacy-resume-source")
    stat = source.stat()
    fingerprint = hashlib.sha256(f"{stat.st_size}:{stat.st_mtime_ns}".encode()).hexdigest()
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO projects "
                "(id,name,workspace_path,active_profile_id,created_at,updated_at) "
                "VALUES ('p','Project','D:/workspace',NULL,:now,:now)"
            ),
            {"now": now},
        )
        connection.execute(
            text(
                "INSERT INTO reference_assets "
                "(id,relpath,content_type,size_bytes,status,created_at,updated_at) "
                "VALUES ('a','assets/references/a.png','image/png',1,'ready',:now,:now)"
            ),
            {"now": now},
        )
        connection.execute(
            text(
                "INSERT INTO game_profiles "
                "(id,project_id,name,normalized_name,reference_asset_id,source_width,"
                "source_height,version,created_at,updated_at) "
                "VALUES ('g','p','Game','game','a',1920,1080,1,:now,:now)"
            ),
            {"now": now},
        )
        connection.execute(
            text(
                "INSERT INTO hud_regions "
                "(id,profile_id,name,x,y,width,height,created_at,updated_at) "
                "VALUES ('r','g','score_right',10,20,100,40,:now,:now)"
            ),
            {"now": now},
        )
        for category_id, name, ordinal in (("c0", "0", 0), ("cw", "W", 1)):
            connection.execute(
                text(
                    "INSERT INTO categories "
                    "(id,profile_id,name,kind,ordinal,created_at,updated_at) "
                    "VALUES (:id,'g',:name,'character',:ordinal,:now,:now)"
                ),
                {"id": category_id, "name": name, "ordinal": ordinal, "now": now},
            )
        connection.execute(
            text(
                "INSERT INTO video_assets "
                "(id,project_id,local_path,size_bytes,duration_ms,width,height,fingerprint,"
                "created_at,updated_at) "
                "VALUES ('v','p',:source,:size,1000,1920,1080,:fingerprint,:now,:now)"
            ),
            {
                "source": str(source),
                "size": stat.st_size,
                "fingerprint": fingerprint,
                "now": now,
            },
        )
        config_hash = hashlib.sha256(b"0W:7").hexdigest()
        provenance_values = {
            "runtime": "1" * 64,
            "model": "2" * 64,
            "config": config_hash,
            "now": now,
        }
        connection.execute(
            text(
                "INSERT INTO pipeline_runs "
                "(id,profile_id,video_id,interval_ms,status,error_code,last_heartbeat_at,"
                "attempt,total_frames,current_stage,current_frame_index,control_requested,"
                "workflow_slot,resume_token,resume_owner,ocr_engine,ocr_engine_version,"
                "ocr_runtime_sha256,ocr_model_sha256,ocr_config_hash,ocr_language,"
                "ocr_page_segmentation_mode,experimental,quality_gate,warning,version,"
                "created_at,updated_at) VALUES "
                "('run','g','v',1000,'failed','worker_stopped',NULL,1,1,'ocr',0,NULL,NULL,"
                "NULL,NULL,'per-region-stub','1',:runtime,:model,:config,'eng',7,0,'passed',"
                "'',1,:now,:now)"
            ),
            provenance_values,
        )
        connection.execute(
            text(
                "INSERT INTO stage_checkpoints "
                "(run_id,frame_index,stage,attempt,status,artifact_relpath,artifact_hash,"
                "error_code,ocr_engine,ocr_engine_version,ocr_runtime_sha256,ocr_model_sha256,"
                "ocr_config_hash,ocr_language,ocr_page_segmentation_mode,experimental,"
                "quality_gate,warning,created_at,updated_at) VALUES "
                "('run',0,'crop',1,'failed',NULL,NULL,'worker_stopped','per-region-stub','1',"
                ":runtime,:model,:config,'eng',7,0,'passed','',:now,:now)"
            ),
            provenance_values,
        )
    engine.dispose()

    command.upgrade(config, "0007")
    engine = create_engine(settings.database_url)
    with engine.connect() as connection:
        migrated = (
            connection.execute(
                text(
                    "SELECT id,profile_id,name,x,y,width,height,ocr_allowed_chars,"
                    "ocr_page_segmentation_mode FROM hud_regions WHERE id='r'"
                )
            )
            .mappings()
            .one()
        )
        assert dict(migrated) == {
            "id": "r",
            "profile_id": "g",
            "name": "score_right",
            "x": 10,
            "y": 20,
            "width": 100,
            "height": 40,
            "ocr_allowed_chars": None,
            "ocr_page_segmentation_mode": None,
        }
        run_snapshot = connection.execute(
            text("SELECT ocr_region_config_json FROM pipeline_runs WHERE id='run'")
        ).scalar_one()
        checkpoint_snapshot = connection.execute(
            text(
                "SELECT ocr_region_config_json FROM stage_checkpoints "
                "WHERE run_id='run' AND frame_index=0 AND stage='crop'"
            )
        ).scalar_one()
        assert checkpoint_snapshot == run_snapshot
        assert json.loads(run_snapshot) == [
            {
                "allowed_chars": "0W",
                "page_segmentation_mode": 7,
                "provenance": {
                    "config_hash": config_hash,
                    "engine_id": "per-region-stub",
                    "engine_version": "1",
                    "experimental": False,
                    "language": "eng",
                    "model_sha256": "2" * 64,
                    "page_segmentation_mode": 7,
                    "quality_gate": "passed",
                    "runtime_sha256": "1" * 64,
                },
                "region_id": "r",
                "region_name": "score_right",
                "uses_profile_fallback": True,
            }
        ]
        assert connection.execute(text("PRAGMA foreign_key_check")).all() == []
    engine.dispose()

    composition = build_composition(settings, resource_probe=AvailableResourceProbe())
    try:
        ocr = PerRegionOcrEngine(default_psm=7)
        _install_workflow(composition, StubMediaAccess(composition), ocr)
        app = create_app(settings, composition=composition)
        with TestClient(app) as client:
            resumed = client.post("/api/v1/runs/run/resume", json={"expected_version": 1})
            assert resumed.status_code == 202, resumed.text
            assert resumed.json()["ocr_fallback"]["page_segmentation_mode"] == 7
            assert resumed.json()["ocr_regions"][0]["uses_profile_fallback"] is True
            completed = _wait_status(client, "run", "review_ready")
            assert completed["error_code"] is None
        assert [(allowed, psm) for _, allowed, psm in ocr.detect_calls] == [(("0", "W"), 7)]
    finally:
        composition.close()

    command.downgrade(config, "0006")
    engine = create_engine(settings.database_url)
    inspector = inspect(engine)
    assert "ocr_allowed_chars" not in {
        column["name"] for column in inspector.get_columns("hud_regions")
    }
    with engine.connect() as connection:
        assert connection.execute(
            text("SELECT name FROM hud_regions WHERE id='r'")
        ).scalar_one() == ("score_right")
    engine.dispose()


def test_region_ocr_config_migration_preserves_empty_legacy_range_and_resumes(
    settings: Settings,
) -> None:
    config = alembic_config(settings)
    command.upgrade(config, "0006")
    engine = create_engine(settings.database_url)
    now = "2026-09-24T08:00:00+00:00"
    source = settings.workspace_dir.parent / "legacy-empty.mp4"
    source.write_bytes(b"legacy-empty-resume-source")
    stat = source.stat()
    fingerprint = hashlib.sha256(f"{stat.st_size}:{stat.st_mtime_ns}".encode()).hexdigest()
    config_hash = hashlib.sha256(b":7").hexdigest()
    provenance_values = {
        "runtime": "1" * 64,
        "model": "2" * 64,
        "config": config_hash,
        "now": now,
    }
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO projects "
                "(id,name,workspace_path,active_profile_id,created_at,updated_at) "
                "VALUES ('p','Project','D:/workspace',NULL,:now,:now)"
            ),
            {"now": now},
        )
        connection.execute(
            text(
                "INSERT INTO reference_assets "
                "(id,relpath,content_type,size_bytes,status,created_at,updated_at) "
                "VALUES ('a','assets/references/a.png','image/png',1,'ready',:now,:now)"
            ),
            {"now": now},
        )
        connection.execute(
            text(
                "INSERT INTO game_profiles "
                "(id,project_id,name,normalized_name,reference_asset_id,source_width,"
                "source_height,version,created_at,updated_at) "
                "VALUES ('g','p','Game','game','a',1920,1080,1,:now,:now)"
            ),
            {"now": now},
        )
        connection.execute(
            text(
                "INSERT INTO hud_regions "
                "(id,profile_id,name,x,y,width,height,created_at,updated_at) "
                "VALUES ('r','g','status',10,20,100,40,:now,:now)"
            ),
            {"now": now},
        )
        connection.execute(
            text(
                "INSERT INTO categories "
                "(id,profile_id,name,kind,ordinal,created_at,updated_at) "
                "VALUES ('cg','g','victory','game',0,:now,:now)"
            ),
            {"now": now},
        )
        connection.execute(
            text(
                "INSERT INTO video_assets "
                "(id,project_id,local_path,size_bytes,duration_ms,width,height,fingerprint,"
                "created_at,updated_at) "
                "VALUES ('v','p',:source,:size,1000,1920,1080,:fingerprint,:now,:now)"
            ),
            {
                "source": str(source),
                "size": stat.st_size,
                "fingerprint": fingerprint,
                "now": now,
            },
        )
        connection.execute(
            text(
                "INSERT INTO pipeline_runs "
                "(id,profile_id,video_id,interval_ms,status,error_code,last_heartbeat_at,"
                "attempt,total_frames,current_stage,current_frame_index,control_requested,"
                "workflow_slot,resume_token,resume_owner,ocr_engine,ocr_engine_version,"
                "ocr_runtime_sha256,ocr_model_sha256,ocr_config_hash,ocr_language,"
                "ocr_page_segmentation_mode,experimental,quality_gate,warning,version,"
                "created_at,updated_at) VALUES "
                "('run-empty','g','v',1000,'failed','worker_stopped',NULL,1,1,'ocr',0,NULL,"
                "NULL,NULL,NULL,'per-region-stub','1',:runtime,:model,:config,'eng',7,0,"
                "'passed','',1,:now,:now)"
            ),
            provenance_values,
        )
        connection.execute(
            text(
                "INSERT INTO stage_checkpoints "
                "(run_id,frame_index,stage,attempt,status,artifact_relpath,artifact_hash,"
                "error_code,ocr_engine,ocr_engine_version,ocr_runtime_sha256,ocr_model_sha256,"
                "ocr_config_hash,ocr_language,ocr_page_segmentation_mode,experimental,"
                "quality_gate,warning,created_at,updated_at) VALUES "
                "('run-empty',0,'crop',1,'failed',NULL,NULL,'worker_stopped','per-region-stub',"
                "'1',:runtime,:model,:config,'eng',7,0,'passed','',:now,:now)"
            ),
            provenance_values,
        )
    engine.dispose()

    command.upgrade(config, "0007")
    engine = create_engine(settings.database_url)
    with engine.connect() as connection:
        snapshot_document = connection.execute(
            text("SELECT ocr_region_config_json FROM pipeline_runs WHERE id='run-empty'")
        ).scalar_one()
        assert json.loads(snapshot_document)[0]["allowed_chars"] == ""
        assert json.loads(snapshot_document)[0]["uses_profile_fallback"] is True
    engine.dispose()

    composition = build_composition(settings, resource_probe=AvailableResourceProbe())
    try:
        ocr = PerRegionOcrEngine(default_psm=7)
        _install_workflow(composition, StubMediaAccess(composition), ocr)
        app = create_app(settings, composition=composition)
        with TestClient(app) as client:
            fetched = client.get("/api/v1/runs/run-empty")
            assert fetched.status_code == 200, fetched.text
            assert fetched.json()["ocr_regions"][0]["allowed_chars"] == ""
            resumed = client.post("/api/v1/runs/run-empty/resume", json={"expected_version": 1})
            assert resumed.status_code == 202, resumed.text
            completed = _wait_status(client, "run-empty", "review_ready")
            assert completed["error_code"] is None
        assert [(allowed, psm) for _, allowed, psm in ocr.detect_calls] == [((), 7)]
        with composition.database.session() as session:
            assert session.execute(text("SELECT count(*) FROM ocr_observations")).scalar_one() == 0
    finally:
        composition.close()


def test_region_ocr_config_downgrade_accepts_one_shared_configuration(
    settings: Settings,
) -> None:
    config = alembic_config(settings)
    command.upgrade(config, "0007")
    document = _insert_explicit_only_run(
        settings,
        run_id="run-shared",
        region_configs=(("r-score", "score", "a" * 64, 7), ("r-health", "health", "a" * 64, 7)),
    )

    command.downgrade(config, "0006")

    engine = create_engine(settings.database_url)
    inspector = inspect(engine)
    with engine.connect() as connection:
        assert connection.execute(
            text("SELECT ocr_config_hash,ocr_page_segmentation_mode FROM pipeline_runs")
        ).one() == ("a" * 64, 7)
        assert connection.execute(
            text("SELECT ocr_config_hash,ocr_page_segmentation_mode FROM stage_checkpoints")
        ).one() == ("a" * 64, 7)
        assert connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == (
            "0006"
        )
    assert "ocr_region_config_json" not in {
        column["name"] for column in inspector.get_columns("pipeline_runs")
    }
    assert document
    engine.dispose()


def test_region_ocr_config_downgrade_rejects_mixed_configuration_before_schema_change(
    settings: Settings,
) -> None:
    config = alembic_config(settings)
    command.upgrade(config, "0007")
    document = _insert_explicit_only_run(
        settings,
        run_id="run-mixed",
        region_configs=(("r-score", "score", "a" * 64, 7), ("r-health", "health", "b" * 64, 11)),
    )

    with pytest.raises(RuntimeError, match="cannot downgrade") as caught:
        command.downgrade(config, "0006")

    message = str(caught.value)
    assert "run-mixed" in message
    assert "r-score" in message and "score" in message
    assert "r-health" in message and "health" in message
    engine = create_engine(settings.database_url)
    inspector = inspect(engine)
    assert "ocr_region_config_json" in {
        column["name"] for column in inspector.get_columns("pipeline_runs")
    }
    assert {"ocr_allowed_chars", "ocr_page_segmentation_mode"} <= {
        column["name"] for column in inspector.get_columns("hud_regions")
    }
    with engine.connect() as connection:
        assert connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == (
            "0007"
        )
        assert connection.execute(
            text(
                "SELECT ocr_config_hash,ocr_page_segmentation_mode,ocr_region_config_json "
                "FROM pipeline_runs WHERE id='run-mixed'"
            )
        ).one() == (None, None, document)
        assert connection.execute(
            text(
                "SELECT ocr_config_hash,ocr_page_segmentation_mode,ocr_region_config_json "
                "FROM stage_checkpoints WHERE run_id='run-mixed'"
            )
        ).one() == (None, None, document)
        assert (
            connection.execute(
                text("SELECT count(*) FROM sqlite_master WHERE name LIKE '_alembic_tmp_%'")
            ).scalar_one()
            == 0
        )
    engine.dispose()


def _insert_explicit_only_run(
    settings: Settings,
    *,
    run_id: str,
    region_configs: tuple[tuple[str, str, str, int], ...],
) -> str:
    engine = create_engine(settings.database_url)
    now = "2026-09-24T09:00:00+00:00"
    snapshots = [
        {
            "allowed_chars": "0",
            "page_segmentation_mode": psm,
            "provenance": {
                "config_hash": config_hash,
                "engine_id": "per-region-stub",
                "engine_version": "1",
                "experimental": False,
                "language": "eng",
                "model_sha256": "2" * 64,
                "page_segmentation_mode": psm,
                "quality_gate": "passed",
                "runtime_sha256": "1" * 64,
            },
            "region_id": region_id,
            "region_name": region_name,
            "uses_profile_fallback": False,
        }
        for region_id, region_name, config_hash, psm in region_configs
    ]
    document = json.dumps(snapshots, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO projects "
                "(id,name,workspace_path,active_profile_id,created_at,updated_at) "
                "VALUES ('p','Project','D:/workspace',NULL,:now,:now)"
            ),
            {"now": now},
        )
        connection.execute(
            text(
                "INSERT INTO reference_assets "
                "(id,relpath,content_type,size_bytes,status,created_at,updated_at) "
                "VALUES ('a','assets/references/a.png','image/png',1,'ready',:now,:now)"
            ),
            {"now": now},
        )
        connection.execute(
            text(
                "INSERT INTO game_profiles "
                "(id,project_id,name,normalized_name,reference_asset_id,source_width,"
                "source_height,version,created_at,updated_at) "
                "VALUES ('g','p','Game','game','a',1920,1080,1,:now,:now)"
            ),
            {"now": now},
        )
        for region_id, region_name, _, _ in region_configs:
            connection.execute(
                text(
                    "INSERT INTO hud_regions "
                    "(id,profile_id,name,x,y,width,height,ocr_allowed_chars,"
                    "ocr_page_segmentation_mode,created_at,updated_at) "
                    "VALUES (:id,'g',:name,10,20,100,40,'0',7,:now,:now)"
                ),
                {"id": region_id, "name": region_name, "now": now},
            )
        connection.execute(
            text(
                "INSERT INTO video_assets "
                "(id,project_id,local_path,size_bytes,duration_ms,width,height,fingerprint,"
                "created_at,updated_at) VALUES "
                "('v','p','D:/video.mp4',1,1000,1920,1080,'fingerprint',:now,:now)"
            ),
            {"now": now},
        )
        provenance_values = {
            "run_id": run_id,
            "runtime": "1" * 64,
            "model": "2" * 64,
            "document": document,
            "now": now,
        }
        connection.execute(
            text(
                "INSERT INTO pipeline_runs "
                "(id,profile_id,video_id,interval_ms,status,error_code,last_heartbeat_at,"
                "attempt,total_frames,current_stage,current_frame_index,control_requested,"
                "workflow_slot,resume_token,resume_owner,ocr_engine,ocr_engine_version,"
                "ocr_runtime_sha256,ocr_model_sha256,ocr_config_hash,ocr_language,"
                "ocr_page_segmentation_mode,experimental,quality_gate,warning,"
                "ocr_region_config_json,version,created_at,updated_at) VALUES "
                "(:run_id,'g','v',1000,'queued',NULL,NULL,1,1,NULL,NULL,NULL,NULL,NULL,NULL,"
                "'per-region-stub','1',:runtime,:model,NULL,'eng',NULL,0,'passed','',:document,"
                "1,:now,:now)"
            ),
            provenance_values,
        )
        connection.execute(
            text(
                "INSERT INTO stage_checkpoints "
                "(run_id,frame_index,stage,attempt,status,artifact_relpath,artifact_hash,"
                "error_code,ocr_engine,ocr_engine_version,ocr_runtime_sha256,ocr_model_sha256,"
                "ocr_config_hash,ocr_language,ocr_page_segmentation_mode,experimental,"
                "quality_gate,warning,ocr_region_config_json,created_at,updated_at) VALUES "
                "(:run_id,0,'sample',1,'failed',NULL,NULL,'worker_stopped',"
                "'per-region-stub','1',:runtime,:model,NULL,'eng',NULL,0,'passed','',:document,"
                ":now,:now)"
            ),
            provenance_values,
        )
    engine.dispose()
    return document


def test_active_profile_migration_backfills_latest_and_downgrades_without_data_loss(
    settings: Settings,
) -> None:
    config = alembic_config(settings)
    command.upgrade(config, "0005")
    engine = create_engine(settings.database_url)
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO projects (id,name,workspace_path,created_at,updated_at) "
                "VALUES ('p','Project','D:/workspace','2026-08-01','2026-08-01')"
            )
        )
        for asset_id in ("a-old", "a-new"):
            connection.execute(
                text(
                    "INSERT INTO reference_assets "
                    "(id,relpath,content_type,size_bytes,status,created_at,updated_at) "
                    "VALUES (:id,:relpath,'image/png',1,'ready','2026-08-01','2026-08-01')"
                ),
                {"id": asset_id, "relpath": f"assets/references/{asset_id}.png"},
            )
        for profile_id, name, asset_id, created_at in (
            ("g-old", "Old", "a-old", "2026-08-01"),
            ("g-new", "Quake Champions", "a-new", "2026-08-02"),
        ):
            connection.execute(
                text(
                    "INSERT INTO game_profiles "
                    "(id,project_id,name,normalized_name,reference_asset_id,source_width,"
                    "source_height,version,created_at,updated_at) "
                    "VALUES (:id,'p',:name,:normalized,:asset,1920,1080,1,:created,:created)"
                ),
                {
                    "id": profile_id,
                    "name": name,
                    "normalized": name.casefold(),
                    "asset": asset_id,
                    "created": created_at,
                },
            )
    engine.dispose()

    command.upgrade(config, "head")
    engine = create_engine(settings.database_url)
    with engine.connect() as connection:
        assert (
            connection.execute(
                text("SELECT active_profile_id FROM projects WHERE id='p'")
            ).scalar_one()
            == "g-new"
        )
    engine.dispose()

    command.downgrade(config, "0005")
    engine = create_engine(settings.database_url)
    inspector = inspect(engine)
    assert "active_profile_id" not in {
        column["name"] for column in inspector.get_columns("projects")
    }
    with engine.connect() as connection:
        assert connection.execute(text("SELECT count(*) FROM game_profiles")).scalar_one() == 2
        assert (
            connection.execute(text("SELECT name FROM game_profiles WHERE id='g-new'")).scalar_one()
            == "Quake Champions"
        )
    engine.dispose()

    command.upgrade(config, "head")


def test_integrity_migration_backfills_and_round_trips_existing_data(settings: Settings) -> None:
    config = alembic_config(settings)
    command.upgrade(config, "0002")
    engine = create_engine(settings.database_url)
    now = "2026-07-30T12:00:00+00:00"
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO projects (id,name,workspace_path,created_at,updated_at) "
                "VALUES ('p','Project','D:/workspace',:now,:now)"
            ),
            {"now": now},
        )
        connection.execute(
            text(
                "INSERT INTO reference_assets "
                "(id,relpath,content_type,size_bytes,created_at,updated_at) "
                "VALUES ('a','assets/references/a.png','image/png',1,:now,:now)"
            ),
            {"now": now},
        )
        connection.execute(
            text(
                "INSERT INTO game_profiles "
                "(id,project_id,name,reference_asset_id,source_width,source_height,version,"
                "created_at,updated_at) "
                "VALUES ('g','p',:name,'a',32,24,1,:now,:now)"
            ),
            {"now": now, "name": "\uff26\uff4f\uff4f"},
        )
        for category_id, name in (("z", "Z"), ("a", "A")):
            connection.execute(
                text(
                    "INSERT INTO categories "
                    "(id,profile_id,name,kind,created_at,updated_at) "
                    "VALUES (:id,'g',:name,'character',:now,:now)"
                ),
                {"id": category_id, "name": name, "now": now},
            )
    engine.dispose()

    command.upgrade(config, "head")
    engine = create_engine(settings.database_url)
    with engine.connect() as connection:
        assert (
            connection.execute(
                text("SELECT normalized_name FROM game_profiles WHERE id='g'")
            ).scalar_one()
            == "foo"
        )
        assert (
            connection.execute(
                text("SELECT status FROM reference_assets WHERE id='a'")
            ).scalar_one()
            == "ready"
        )
        rows = connection.execute(text("SELECT id, ordinal FROM categories ORDER BY ordinal")).all()
        assert [tuple(row) for row in rows] == [("a", 0), ("z", 1)]
    engine.dispose()

    command.downgrade(config, "0002")
    engine = create_engine(settings.database_url)
    inspector = inspect(engine)
    assert "normalized_name" not in {c["name"] for c in inspector.get_columns("game_profiles")}
    assert "ordinal" not in {c["name"] for c in inspector.get_columns("categories")}
    assert "status" not in {c["name"] for c in inspector.get_columns("reference_assets")}
    with engine.connect() as connection:
        assert connection.execute(text("SELECT name FROM game_profiles WHERE id='g'")).scalar_one()
        assert connection.execute(text("SELECT count(*) FROM categories")).scalar_one() == 2
    engine.dispose()

    command.upgrade(config, "head")


@pytest.mark.parametrize("run_number", range(3))
def test_integrity_migration_collision_preflight_is_retry_safe(
    settings: Settings,
    run_number: int,
) -> None:
    del run_number
    config = alembic_config(settings)
    command.upgrade(config, "0002")
    engine = create_engine(settings.database_url)
    now = "2026-07-30T12:00:00+00:00"
    profiles = (
        ("g-foo-upper", "Foo", "a-foo-upper"),
        ("g-foo-lower", "foo", "a-foo-lower"),
        ("g-bar-fullwidth", "\uff22\uff41\uff52", "a-bar-fullwidth"),
        ("g-bar-ascii", "bar", "a-bar-ascii"),
    )
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO projects (id,name,workspace_path,created_at,updated_at) "
                "VALUES ('p','Project','D:/workspace',:now,:now)"
            ),
            {"now": now},
        )
        for profile_id, name, asset_id in profiles:
            connection.execute(
                text(
                    "INSERT INTO reference_assets "
                    "(id,relpath,content_type,size_bytes,created_at,updated_at) "
                    "VALUES (:id,:relpath,'image/png',1,:now,:now)"
                ),
                {
                    "id": asset_id,
                    "relpath": f"assets/references/{asset_id}.png",
                    "now": now,
                },
            )
            connection.execute(
                text(
                    "INSERT INTO game_profiles "
                    "(id,project_id,name,reference_asset_id,source_width,source_height,version,"
                    "created_at,updated_at) "
                    "VALUES (:id,'p',:name,:asset_id,32,24,1,:now,:now)"
                ),
                {"id": profile_id, "name": name, "asset_id": asset_id, "now": now},
            )
    with engine.connect() as connection:
        schema_before = [
            tuple(row)
            for row in connection.execute(
                text("SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name,tbl_name")
            )
        ]
        assert connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == (
            "0002"
        )
    engine.dispose()

    with pytest.raises(RuntimeError) as error:
        command.upgrade(config, "head")

    diagnostic = str(error.value)
    assert "no schema changes were made" in diagnostic
    for profile_id, name, _ in profiles:
        assert f"id='{profile_id}' name='{name}'" in diagnostic

    engine = create_engine(settings.database_url)
    inspector = inspect(engine)
    assert "status" not in {column["name"] for column in inspector.get_columns("reference_assets")}
    assert "normalized_name" not in {
        column["name"] for column in inspector.get_columns("game_profiles")
    }
    assert "ordinal" not in {column["name"] for column in inspector.get_columns("categories")}
    with engine.connect() as connection:
        schema_after = [
            tuple(row)
            for row in connection.execute(
                text("SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name,tbl_name")
            )
        ]
        assert schema_after == schema_before
        assert connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == (
            "0002"
        )
        assert (
            connection.execute(
                text("SELECT count(*) FROM sqlite_master WHERE name LIKE '_alembic_tmp_%'")
            ).scalar_one()
            == 0
        )
    with engine.begin() as connection:
        connection.execute(text("UPDATE game_profiles SET name='Quux' WHERE id='g-foo-lower'"))
        connection.execute(text("UPDATE game_profiles SET name='Baz' WHERE id='g-bar-ascii'"))
    engine.dispose()

    command.upgrade(config, "head")
    engine = create_engine(settings.database_url)
    with engine.connect() as connection:
        assert connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == (
            "0007"
        )
        normalized_names = connection.execute(
            text("SELECT id,normalized_name FROM game_profiles ORDER BY id")
        ).all()
        assert [tuple(row) for row in normalized_names] == [
            ("g-bar-ascii", "baz"),
            ("g-bar-fullwidth", "bar"),
            ("g-foo-lower", "quux"),
            ("g-foo-upper", "foo"),
        ]
    engine.dispose()


def _seed_pre_tk004_workflow_row(settings: Settings) -> None:
    engine = create_engine(settings.database_url)
    now = "2026-07-31T12:00:00+00:00"
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO projects (id,name,workspace_path,created_at,updated_at) "
                "VALUES ('p','Project','D:/workspace',:now,:now)"
            ),
            {"now": now},
        )
        connection.execute(
            text(
                "INSERT INTO reference_assets "
                "(id,relpath,content_type,size_bytes,status,created_at,updated_at) "
                "VALUES ('a','assets/references/a.png','image/png',1,'ready',:now,:now)"
            ),
            {"now": now},
        )
        connection.execute(
            text(
                "INSERT INTO game_profiles "
                "(id,project_id,name,normalized_name,reference_asset_id,source_width,"
                "source_height,version,created_at,updated_at) "
                "VALUES ('g','p','Profile','profile','a',32,24,1,:now,:now)"
            ),
            {"now": now},
        )
        connection.execute(
            text(
                "INSERT INTO video_assets "
                "(id,project_id,local_path,size_bytes,duration_ms,width,height,fingerprint,"
                "created_at,updated_at) "
                "VALUES ('v','p','D:/video.mp4',1,1000,32,24,'fingerprint',:now,:now)"
            ),
            {"now": now},
        )
        connection.execute(
            text(
                "INSERT INTO pipeline_runs "
                "(id,profile_id,video_id,interval_ms,status,error_code,last_heartbeat_at,"
                "attempt,total_frames,version,created_at,updated_at) "
                "VALUES ('r','g','v',1000,'queued',NULL,NULL,1,1,1,:now,:now)"
            ),
            {"now": now},
        )
    engine.dispose()


def test_startup_refuses_pre_tk004_data_with_a_controlled_error(settings: Settings) -> None:
    command.upgrade(alembic_config(settings), "0003")
    _seed_pre_tk004_workflow_row(settings)

    with pytest.raises(SchemaUpgradeBlockedError) as error:
        build_composition(settings, resource_probe=AvailableResourceProbe())

    diagnostic = str(error.value)
    assert error.value.code == "schema_upgrade_blocked"
    assert "no schema changes were made" in diagnostic
    assert "pipeline_runs=1" in diagnostic
    # A named removal path, in an order the foreign keys actually accept.
    ordered = (
        "DELETE FROM annotations",
        "DELETE FROM ocr_observations",
        "DELETE FROM region_samples",
        "DELETE FROM frames",
        "DELETE FROM stage_checkpoints",
        "DELETE FROM exports",
        "DELETE FROM pipeline_runs",
    )
    positions = [diagnostic.find(statement) for statement in ordered]
    assert all(position >= 0 for position in positions), diagnostic
    assert positions == sorted(positions)


def test_documented_cleanup_sql_actually_unblocks_the_migration(settings: Settings) -> None:
    command.upgrade(alembic_config(settings), "0003")
    _seed_pre_tk004_workflow_row(settings)
    with pytest.raises(SchemaUpgradeBlockedError) as error:
        command.upgrade(alembic_config(settings), "head")

    statements = [
        line.strip()
        for line in str(error.value).splitlines()
        if line.strip().startswith("DELETE FROM")
    ]
    engine = create_engine(settings.database_url)
    with engine.begin() as connection:
        connection.execute(text("PRAGMA foreign_keys=ON"))
        for statement in statements:
            connection.execute(text(statement.rstrip(";")))
    engine.dispose()

    command.upgrade(alembic_config(settings), "head")
    engine = create_engine(settings.database_url)
    with engine.connect() as connection:
        assert connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == (
            "0007"
        )
    engine.dispose()


def test_workflow_migration_preflight_is_retry_safe_before_any_ddl(settings: Settings) -> None:
    config = alembic_config(settings)
    command.upgrade(config, "0003")
    engine = create_engine(settings.database_url)
    now = "2026-07-31T12:00:00+00:00"
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO projects (id,name,workspace_path,created_at,updated_at) "
                "VALUES ('p','Project','D:/workspace',:now,:now)"
            ),
            {"now": now},
        )
        connection.execute(
            text(
                "INSERT INTO reference_assets "
                "(id,relpath,content_type,size_bytes,status,created_at,updated_at) "
                "VALUES ('a','assets/references/a.png','image/png',1,'ready',:now,:now)"
            ),
            {"now": now},
        )
        connection.execute(
            text(
                "INSERT INTO game_profiles "
                "(id,project_id,name,normalized_name,reference_asset_id,source_width,"
                "source_height,version,created_at,updated_at) "
                "VALUES ('g','p','Profile','profile','a',32,24,1,:now,:now)"
            ),
            {"now": now},
        )
        connection.execute(
            text(
                "INSERT INTO video_assets "
                "(id,project_id,local_path,size_bytes,duration_ms,width,height,fingerprint,"
                "created_at,updated_at) "
                "VALUES ('v','p','D:/video.mp4',1,1000,32,24,'fingerprint',:now,:now)"
            ),
            {"now": now},
        )
        connection.execute(
            text(
                "INSERT INTO pipeline_runs "
                "(id,profile_id,video_id,interval_ms,status,error_code,last_heartbeat_at,"
                "attempt,total_frames,version,created_at,updated_at) "
                "VALUES ('r','g','v',1000,'queued',NULL,NULL,1,1,1,:now,:now)"
            ),
            {"now": now},
        )
    with engine.connect() as connection:
        schema_before = [
            tuple(row)
            for row in connection.execute(
                text("SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name,tbl_name")
            )
        ]
    engine.dispose()

    for _ in range(2):
        with pytest.raises(RuntimeError) as error:
            command.upgrade(config, "head")
        diagnostic = str(error.value)
        assert "no schema changes were made" in diagnostic
        assert "pipeline_runs=1" in diagnostic
        engine = create_engine(settings.database_url)
        with engine.connect() as connection:
            schema_after = [
                tuple(row)
                for row in connection.execute(
                    text(
                        "SELECT type,name,tbl_name,sql FROM sqlite_master "
                        "ORDER BY type,name,tbl_name"
                    )
                )
            ]
            assert schema_after == schema_before
            assert connection.execute(
                text("SELECT version_num FROM alembic_version")
            ).scalar_one() == ("0003")
            assert (
                connection.execute(
                    text("SELECT count(*) FROM sqlite_master WHERE name LIKE '_alembic_tmp_%'")
                ).scalar_one()
                == 0
            )
        engine.dispose()

    engine = create_engine(settings.database_url)
    with engine.begin() as connection:
        connection.execute(text("DELETE FROM pipeline_runs WHERE id='r'"))
    engine.dispose()
    command.upgrade(config, "head")
    engine = create_engine(settings.database_url)
    with engine.connect() as connection:
        assert connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == (
            "0007"
        )
    engine.dispose()
