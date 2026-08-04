from __future__ import annotations

import pytest
from alembic import command
from sqlalchemy import create_engine, inspect, text

from backend.app.access.store.migrations import SchemaUpgradeBlockedError, alembic_config
from backend.app.composition import build_composition
from backend.app.config import Settings
from backend.tests.conftest import AvailableResourceProbe
from backend.tests.test_composition import EXPECTED_TABLES


def test_initial_migration_up_down_up(settings: Settings) -> None:
    config = alembic_config(settings)

    command.upgrade(config, "head")
    engine = create_engine(settings.database_url)
    inspector = inspect(engine)
    assert set(inspector.get_table_names()) >= EXPECTED_TABLES
    profile_columns = {column["name"]: column for column in inspector.get_columns("game_profiles")}
    region_columns = {column["name"]: column for column in inspector.get_columns("hud_regions")}
    reference_columns = {
        column["name"]: column for column in inspector.get_columns("reference_assets")
    }
    assert profile_columns["source_width"]["nullable"] is False
    assert profile_columns["source_height"]["nullable"] is False
    assert {"x", "y", "width", "height"} <= region_columns.keys()
    assert all(region_columns[name]["nullable"] is False for name in ("x", "y", "width", "height"))
    assert {"id", "relpath", "content_type", "size_bytes"} <= reference_columns.keys()
    assert "status" in reference_columns
    assert "normalized_name" in profile_columns
    category_columns = {column["name"] for column in inspector.get_columns("categories")}
    assert "ordinal" in category_columns
    run_columns = {column["name"] for column in inspector.get_columns("pipeline_runs")}
    checkpoint_columns = {column["name"] for column in inspector.get_columns("stage_checkpoints")}
    observation_columns = {column["name"] for column in inspector.get_columns("ocr_observations")}
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
    assert {"ocr_engine", "experimental", "quality_gate", "warning"} <= checkpoint_columns
    assert {"runtime_sha256", "experimental", "quality_gate", "warning"} <= (observation_columns)
    run_indexes = {index["name"]: index for index in inspector.get_indexes("pipeline_runs")}
    assert run_indexes["uq_pipeline_runs_global_workflow_slot"]["unique"] == 1
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
    profile_checks = {
        constraint["name"] for constraint in inspector.get_check_constraints("game_profiles")
    }
    region_checks = {
        constraint["name"] for constraint in inspector.get_check_constraints("hud_regions")
    }
    assert "ck_profile_source_size" in profile_checks
    assert {"ck_hud_region_origin", "ck_hud_region_size"} <= region_checks
    engine.dispose()

    command.downgrade(config, "base")
    engine = create_engine(settings.database_url)
    assert EXPECTED_TABLES.isdisjoint(inspect(engine).get_table_names())
    engine.dispose()

    command.upgrade(config, "head")
    engine = create_engine(settings.database_url)
    assert set(inspect(engine).get_table_names()) >= EXPECTED_TABLES
    engine.dispose()


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
            "0004"
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
            "0004"
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
            "0004"
        )
    engine.dispose()
