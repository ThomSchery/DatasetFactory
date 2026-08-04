from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, ClassVar

from sqlalchemy import (
    CheckConstraint,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utc_now() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    type_annotation_map: ClassVar[dict[Any, Any]] = {dict[str, Any]: Text}


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now, nullable=False)


class Project(TimestampMixin, Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    workspace_path: Mapped[str] = mapped_column(Text, nullable=False)


class ReferenceAsset(TimestampMixin, Base):
    __tablename__ = "reference_assets"
    __table_args__ = (
        UniqueConstraint("relpath", name="uq_reference_assets_relpath"),
        CheckConstraint("size_bytes > 0", name="ck_reference_asset_size"),
        CheckConstraint(
            "content_type IN ('image/png','image/jpeg')", name="ck_reference_asset_content_type"
        ),
        CheckConstraint("status IN ('ready','missing')", name="ck_reference_asset_status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    relpath: Mapped[str] = mapped_column(Text, nullable=False)
    content_type: Mapped[str] = mapped_column(String(40), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ready")


class GameProfile(TimestampMixin, Base):
    __tablename__ = "game_profiles"
    __table_args__ = (
        UniqueConstraint("normalized_name", name="uq_game_profiles_normalized_name"),
        CheckConstraint("source_width > 0 AND source_height > 0", name="ck_profile_source_size"),
        CheckConstraint("version >= 1", name="ck_profile_version"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    normalized_name: Mapped[str] = mapped_column(String(200), nullable=False)
    reference_asset_id: Mapped[str] = mapped_column(
        ForeignKey("reference_assets.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    source_width: Mapped[int] = mapped_column(Integer, nullable=False)
    source_height: Mapped[int] = mapped_column(Integer, nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class HudRegion(TimestampMixin, Base):
    __tablename__ = "hud_regions"
    __table_args__ = (
        UniqueConstraint("profile_id", "name", name="uq_hud_regions_profile_name"),
        CheckConstraint("x >= 0 AND y >= 0", name="ck_hud_region_origin"),
        CheckConstraint("width > 0 AND height > 0", name="ck_hud_region_size"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    profile_id: Mapped[str] = mapped_column(
        ForeignKey("game_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    x: Mapped[int] = mapped_column(Integer, nullable=False)
    y: Mapped[int] = mapped_column(Integer, nullable=False)
    width: Mapped[int] = mapped_column(Integer, nullable=False)
    height: Mapped[int] = mapped_column(Integer, nullable=False)


class Category(TimestampMixin, Base):
    __tablename__ = "categories"
    __table_args__ = (
        UniqueConstraint("profile_id", "name", name="uq_categories_profile_name"),
        UniqueConstraint("profile_id", "ordinal", name="uq_categories_profile_ordinal"),
        CheckConstraint("kind IN ('character','game')", name="ck_category_kind"),
        CheckConstraint("ordinal >= 0", name="ck_category_ordinal"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    profile_id: Mapped[str] = mapped_column(
        ForeignKey("game_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    ordinal: Mapped[int] = mapped_column(Integer, nullable=False)


class VideoAsset(TimestampMixin, Base):
    __tablename__ = "video_assets"
    __table_args__ = (
        CheckConstraint("size_bytes > 0", name="ck_video_size"),
        CheckConstraint("duration_ms > 0", name="ck_video_duration"),
        CheckConstraint("width > 0 AND height > 0", name="ck_video_dimensions"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    local_path: Mapped[str] = mapped_column(Text, nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    width: Mapped[int] = mapped_column(Integer, nullable=False)
    height: Mapped[int] = mapped_column(Integer, nullable=False)
    fingerprint: Mapped[str] = mapped_column(String(200), nullable=False)


class PipelineRun(TimestampMixin, Base):
    __tablename__ = "pipeline_runs"
    __table_args__ = (
        CheckConstraint("interval_ms > 0", name="ck_pipeline_interval"),
        CheckConstraint("attempt >= 1", name="ck_pipeline_attempt"),
        CheckConstraint("total_frames >= 0", name="ck_pipeline_total_frames"),
        CheckConstraint("version >= 1", name="ck_pipeline_version"),
        CheckConstraint(
            "control_requested IS NULL OR control_requested IN ('pause','cancel')",
            name="ck_pipeline_control_requested",
        ),
        CheckConstraint(
            "(workflow_slot IS NULL AND status != 'running' AND "
            "resume_token IS NULL AND resume_owner IS NULL) OR "
            "(workflow_slot = 1 AND ((status = 'running' AND "
            "resume_token IS NULL AND resume_owner IS NULL) OR "
            "(status IN ('paused','failed','cancelled') AND "
            "resume_token IS NOT NULL AND resume_owner IS NOT NULL)))",
            name="ck_pipeline_workflow_slot",
        ),
        CheckConstraint(
            "quality_gate IN ('passed','failed','unknown')",
            name="ck_pipeline_quality_gate",
        ),
        CheckConstraint(
            "status IN ('queued','running','paused','review_ready','completed','failed',"
            "'cancelled')",
            name="ck_pipeline_status",
        ),
        # SQLite permits many NULLs, but only one row may own the constant slot value 1.
        Index(
            "uq_pipeline_runs_global_workflow_slot",
            "workflow_slot",
            unique=True,
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    profile_id: Mapped[str] = mapped_column(
        ForeignKey("game_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    video_id: Mapped[str] = mapped_column(
        ForeignKey("video_assets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    interval_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=1000)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="queued")
    error_code: Mapped[str | None] = mapped_column(String(100))
    last_heartbeat_at: Mapped[datetime | None] = mapped_column()
    attempt: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    total_frames: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    current_stage: Mapped[str | None] = mapped_column(String(40))
    current_frame_index: Mapped[int | None] = mapped_column(Integer)
    control_requested: Mapped[str | None] = mapped_column(String(20))
    workflow_slot: Mapped[int | None] = mapped_column(Integer)
    resume_token: Mapped[str | None] = mapped_column(String(36))
    resume_owner: Mapped[str | None] = mapped_column(String(36))
    ocr_engine: Mapped[str] = mapped_column(String(100), nullable=False)
    ocr_engine_version: Mapped[str] = mapped_column(String(100), nullable=False)
    ocr_runtime_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    ocr_model_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    ocr_config_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    ocr_language: Mapped[str] = mapped_column(String(40), nullable=False)
    ocr_page_segmentation_mode: Mapped[int] = mapped_column(Integer, nullable=False)
    experimental: Mapped[bool] = mapped_column(nullable=False)
    quality_gate: Mapped[str] = mapped_column(String(20), nullable=False)
    warning: Mapped[str] = mapped_column(Text, nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    review_revision: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    recovery_skipped_frames: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class Frame(TimestampMixin, Base):
    __tablename__ = "frames"
    __table_args__ = (
        UniqueConstraint("run_id", "frame_index", name="uq_frames_run_index"),
        CheckConstraint("frame_index >= 0 AND timestamp_ms >= 0", name="ck_frame_position"),
        CheckConstraint("width > 0 AND height > 0", name="ck_frame_dimensions"),
        CheckConstraint("version >= 1", name="ck_frame_version"),
        CheckConstraint(
            "stage_status IN ('pending','sampled','cropped','ocr_complete','review_pending')",
            name="ck_frame_stage_status",
        ),
        CheckConstraint(
            "review_status IN ('pending','accepted','rejected')", name="ck_frame_review_status"
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    run_id: Mapped[str] = mapped_column(
        ForeignKey("pipeline_runs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    frame_index: Mapped[int] = mapped_column(Integer, nullable=False)
    timestamp_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    image_relpath: Mapped[str] = mapped_column(Text, nullable=False)
    stage_status: Mapped[str] = mapped_column(String(30), nullable=False, default="pending")
    review_status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    width: Mapped[int] = mapped_column(Integer, nullable=False)
    height: Mapped[int] = mapped_column(Integer, nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class RegionSample(TimestampMixin, Base):
    __tablename__ = "region_samples"
    __table_args__ = (
        UniqueConstraint("frame_id", "region_id", name="uq_region_samples_frame_region"),
        CheckConstraint(
            "stage_status IN ('pending','cropped','ocr_complete','failed')",
            name="ck_region_sample_stage_status",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    frame_id: Mapped[str] = mapped_column(
        ForeignKey("frames.id", ondelete="CASCADE"), nullable=False, index=True
    )
    region_id: Mapped[str] = mapped_column(
        ForeignKey("hud_regions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    crop_relpath: Mapped[str] = mapped_column(Text, nullable=False)
    stage_status: Mapped[str] = mapped_column(String(30), nullable=False, default="pending")


class OcrObservation(TimestampMixin, Base):
    __tablename__ = "ocr_observations"
    __table_args__ = (
        CheckConstraint("x >= 0 AND y >= 0", name="ck_ocr_origin"),
        CheckConstraint("width > 0 AND height > 0", name="ck_ocr_size"),
        CheckConstraint("confidence >= 0 AND confidence <= 1", name="ck_ocr_confidence"),
        CheckConstraint(
            "quality_gate IN ('passed','failed','unknown')",
            name="ck_ocr_quality_gate",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    sample_id: Mapped[str] = mapped_column(
        ForeignKey("region_samples.id", ondelete="CASCADE"), nullable=False, index=True
    )
    char: Mapped[str] = mapped_column(String(16), nullable=False)
    x: Mapped[int] = mapped_column(Integer, nullable=False)
    y: Mapped[int] = mapped_column(Integer, nullable=False)
    width: Mapped[int] = mapped_column(Integer, nullable=False)
    height: Mapped[int] = mapped_column(Integer, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    engine: Mapped[str] = mapped_column(String(100), nullable=False)
    engine_version: Mapped[str] = mapped_column(String(100), nullable=False)
    runtime_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    model_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    config_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    language: Mapped[str] = mapped_column(String(40), nullable=False)
    page_segmentation_mode: Mapped[int] = mapped_column(Integer, nullable=False)
    experimental: Mapped[bool] = mapped_column(nullable=False)
    quality_gate: Mapped[str] = mapped_column(String(20), nullable=False)
    warning: Mapped[str] = mapped_column(Text, nullable=False)
    valid: Mapped[bool] = mapped_column(nullable=False)
    rejection_code: Mapped[str | None] = mapped_column(String(100))


class Annotation(TimestampMixin, Base):
    __tablename__ = "annotations"
    __table_args__ = (
        CheckConstraint("x >= 0 AND y >= 0", name="ck_annotation_origin"),
        CheckConstraint("width > 0 AND height > 0", name="ck_annotation_size"),
        CheckConstraint(
            "confidence IS NULL OR (confidence >= 0 AND confidence <= 1)",
            name="ck_annotation_confidence",
        ),
        CheckConstraint("source IN ('ocr','manual')", name="ck_annotation_source"),
        CheckConstraint("status IN ('proposed','accepted','deleted')", name="ck_annotation_status"),
        CheckConstraint("version >= 1", name="ck_annotation_version"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    frame_id: Mapped[str] = mapped_column(
        ForeignKey("frames.id", ondelete="CASCADE"), nullable=False, index=True
    )
    category_id: Mapped[str] = mapped_column(
        ForeignKey("categories.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    x: Mapped[int] = mapped_column(Integer, nullable=False)
    y: Mapped[int] = mapped_column(Integer, nullable=False)
    width: Mapped[int] = mapped_column(Integer, nullable=False)
    height: Mapped[int] = mapped_column(Integer, nullable=False)
    confidence: Mapped[float | None] = mapped_column(Float)
    source: Mapped[str] = mapped_column(String(20), nullable=False)
    observation_id: Mapped[str | None] = mapped_column(
        ForeignKey("ocr_observations.id", ondelete="SET NULL"), index=True
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="proposed")
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class StageCheckpoint(TimestampMixin, Base):
    __tablename__ = "stage_checkpoints"
    __table_args__ = (
        UniqueConstraint("run_id", "frame_index", "stage", name="uq_stage_checkpoint"),
        CheckConstraint("frame_index >= 0 AND attempt >= 1", name="ck_checkpoint_position"),
        CheckConstraint(
            "status IN ('pending','running','completed','failed')", name="ck_checkpoint_status"
        ),
        CheckConstraint(
            "quality_gate IN ('passed','failed','unknown')",
            name="ck_checkpoint_quality_gate",
        ),
    )

    run_id: Mapped[str] = mapped_column(
        ForeignKey("pipeline_runs.id", ondelete="CASCADE"), primary_key=True
    )
    frame_index: Mapped[int] = mapped_column(Integer, primary_key=True)
    stage: Mapped[str] = mapped_column(String(40), primary_key=True)
    attempt: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    artifact_relpath: Mapped[str | None] = mapped_column(Text)
    artifact_hash: Mapped[str | None] = mapped_column(String(128))
    error_code: Mapped[str | None] = mapped_column(String(100))
    ocr_engine: Mapped[str] = mapped_column(String(100), nullable=False)
    ocr_engine_version: Mapped[str] = mapped_column(String(100), nullable=False)
    ocr_runtime_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    ocr_model_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    ocr_config_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    ocr_language: Mapped[str] = mapped_column(String(40), nullable=False)
    ocr_page_segmentation_mode: Mapped[int] = mapped_column(Integer, nullable=False)
    experimental: Mapped[bool] = mapped_column(nullable=False)
    quality_gate: Mapped[str] = mapped_column(String(20), nullable=False)
    warning: Mapped[str] = mapped_column(Text, nullable=False)


class Export(TimestampMixin, Base):
    __tablename__ = "exports"
    __table_args__ = (
        CheckConstraint(
            "status IN ('queued','running','completed','failed')", name="ck_export_status"
        ),
        CheckConstraint("input_revision >= 0", name="ck_export_revision"),
        Index(
            "uq_exports_active_run",
            "run_id",
            unique=True,
            sqlite_where=text("status IN ('queued','running')"),
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    run_id: Mapped[str] = mapped_column(
        ForeignKey("pipeline_runs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="queued")
    output_relpath: Mapped[str | None] = mapped_column(Text)
    input_revision: Mapped[int] = mapped_column(Integer, nullable=False)
    error_code: Mapped[str | None] = mapped_column(String(100))
    manifest_json: Mapped[str | None] = mapped_column(Text)
