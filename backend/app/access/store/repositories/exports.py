from __future__ import annotations

import hashlib
import json
import os
import shutil
import tempfile
from contextlib import suppress
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from sqlalchemy import and_, select
from sqlalchemy.exc import IntegrityError

from backend.app.access.store.database import Database
from backend.app.access.store.models import (
    Annotation,
    Category,
    Export,
    Frame,
    PipelineRun,
    StageCheckpoint,
)
from backend.app.access.store.workspace import Workspace, WorkspaceError


class ExportNotFoundError(LookupError):
    pass


class ExportRunNotFoundError(LookupError):
    pass


class ExportRunningError(RuntimeError):
    pass


class NoAcceptedFramesError(ValueError):
    pass


class ExportSourceMissingError(RuntimeError):
    pass


class ExportRevisionConflictError(RuntimeError):
    pass


class ExportPublishError(RuntimeError):
    pass


@dataclass(frozen=True)
class StoredExportCategory:
    id: str
    name: str
    ordinal: int


@dataclass(frozen=True)
class StoredExportAnnotation:
    id: str
    frame_id: str
    category_id: str
    x: int
    y: int
    width: int
    height: int
    source: str


@dataclass(frozen=True)
class StoredExportFrame:
    id: str
    frame_index: int
    image_relpath: str
    image_sha256: str | None
    width: int
    height: int


@dataclass(frozen=True)
class StoredExportSnapshot:
    export_id: str
    run_id: str
    profile_id: str
    input_revision: int
    categories: tuple[StoredExportCategory, ...]
    frames: tuple[StoredExportFrame, ...]
    annotations: tuple[StoredExportAnnotation, ...]


@dataclass(frozen=True)
class ExportRecord:
    id: str
    run_id: str
    status: str
    input_revision: int
    error_code: str | None
    manifest: dict[str, Any] | None
    output_relpath: str | None


@dataclass
class StagedExport:
    export_id: str
    output_relpath: str
    manifest_json: str
    _temporary_path: Path
    _final_path: Path
    _published: bool = False

    def publish(self) -> None:
        destination_existed = self._final_path.exists()
        if destination_existed:
            raise ExportPublishError("export_destination_exists")
        try:
            os.replace(self._temporary_path, self._final_path)
        except OSError as exc:
            if not destination_existed and self._final_path.exists():
                with suppress(OSError):
                    shutil.rmtree(self._final_path)
            raise ExportPublishError("export_publish_failed") from exc
        self._published = True

    def discard(self) -> None:
        with suppress(OSError):
            shutil.rmtree(self._temporary_path)
        if self._published:
            with suppress(OSError):
                shutil.rmtree(self._final_path)


class ExportRepository:
    """Own export snapshot transactions and atomic workspace publication."""

    def __init__(self, database: Database, workspace: Workspace) -> None:
        self._database = database
        self._workspace = workspace

    def create_snapshot(self, run_id: str, *, export_id: str) -> StoredExportSnapshot:
        try:
            with self._database.session() as session:
                session.connection().exec_driver_sql("BEGIN IMMEDIATE")
                run = session.get(PipelineRun, run_id)
                if run is None:
                    raise ExportRunNotFoundError
                frame_rows = tuple(
                    session.execute(
                        select(Frame, StageCheckpoint.artifact_hash)
                        .outerjoin(
                            StageCheckpoint,
                            and_(
                                StageCheckpoint.run_id == Frame.run_id,
                                StageCheckpoint.frame_index == Frame.frame_index,
                                StageCheckpoint.stage == "sample",
                                StageCheckpoint.status == "completed",
                            ),
                        )
                        .where(Frame.run_id == run_id, Frame.review_status == "accepted")
                    )
                )
                if not frame_rows:
                    raise NoAcceptedFramesError
                frame_ids = tuple(frame.id for frame, _ in frame_rows)
                categories = tuple(
                    StoredExportCategory(item.id, item.name, item.ordinal)
                    for item in session.scalars(
                        select(Category).where(Category.profile_id == run.profile_id)
                    )
                )
                annotations = tuple(
                    StoredExportAnnotation(
                        item.id,
                        item.frame_id,
                        item.category_id,
                        item.x,
                        item.y,
                        item.width,
                        item.height,
                        item.source,
                    )
                    for item in session.scalars(
                        select(Annotation).where(
                            Annotation.frame_id.in_(frame_ids),
                            Annotation.status == "accepted",
                        )
                    )
                )
                frames = tuple(
                    StoredExportFrame(
                        frame.id,
                        frame.frame_index,
                        frame.image_relpath,
                        str(image_hash) if image_hash is not None else None,
                        frame.width,
                        frame.height,
                    )
                    for frame, image_hash in frame_rows
                )
                session.add(
                    Export(
                        id=export_id,
                        run_id=run_id,
                        status="running",
                        output_relpath=None,
                        input_revision=run.review_revision,
                        error_code=None,
                        manifest_json=None,
                    )
                )
                session.flush()
                return StoredExportSnapshot(
                    export_id,
                    run_id,
                    run.profile_id,
                    run.review_revision,
                    categories,
                    frames,
                    annotations,
                )
        except IntegrityError as exc:
            if "exports.run_id" in str(exc.orig) or "uq_exports_active_run" in str(exc.orig):
                raise ExportRunningError from exc
            raise

    def stage(
        self,
        snapshot: StoredExportSnapshot,
        *,
        document: bytes,
        manifest: dict[str, Any],
    ) -> StagedExport:
        exports_path = self._workspace.resolve_relpath("exports")
        try:
            temporary_path = Path(
                tempfile.mkdtemp(prefix=f".{snapshot.export_id}-", dir=exports_path)
            )
        except OSError as exc:
            raise ExportPublishError("export_stage_failed") from exc
        final_path = self._workspace.resolve_relpath(Path("exports") / snapshot.export_id)
        staged = StagedExport(
            snapshot.export_id,
            f"exports/{snapshot.export_id}",
            "",
            temporary_path,
            final_path,
        )
        try:
            parsed = json.loads(document)
            if not isinstance(parsed, dict):
                raise ExportPublishError("export_document_invalid")
            images_path = temporary_path / "images"
            images_path.mkdir()
            for frame in sorted(snapshot.frames, key=lambda item: (item.frame_index, item.id)):
                self._copy_frame(frame, images_path / self._image_name(frame))
            self._write_file(temporary_path / "annotations.json", document)
            manifest_json = json.dumps(
                manifest,
                ensure_ascii=False,
                separators=(",", ":"),
                sort_keys=True,
            )
            self._require_relative_manifest(manifest)
            self._write_file(temporary_path / "manifest.json", manifest_json.encode("utf-8"))
            staged.manifest_json = manifest_json
            return staged
        except Exception:
            staged.discard()
            raise

    def publish_if_revision(self, snapshot: StoredExportSnapshot, staged: StagedExport) -> None:
        conflict = False
        with self._database.session() as session:
            session.connection().exec_driver_sql("BEGIN IMMEDIATE")
            export = session.get(Export, snapshot.export_id)
            run = session.get(PipelineRun, snapshot.run_id)
            if export is None or run is None:
                raise ExportNotFoundError
            if run.review_revision != snapshot.input_revision:
                conflict = True
            else:
                staged.publish()
                export.status = "completed"
                export.error_code = None
                export.output_relpath = staged.output_relpath
                export.manifest_json = staged.manifest_json
            session.flush()
        if conflict:
            raise ExportRevisionConflictError

    def fail(self, export_id: str, error_code: str) -> None:
        with self._database.session() as session:
            export = session.get(Export, export_id)
            if export is None:
                raise ExportNotFoundError
            if export.status in {"queued", "running"}:
                export.status = "failed"
                export.error_code = error_code
                export.output_relpath = None
                export.manifest_json = None

    def get(self, export_id: str) -> ExportRecord:
        with self._database.session() as session:
            export = session.get(Export, export_id)
            if export is None:
                raise ExportNotFoundError
            return self._record(export)

    def latest_for_run(self, run_id: str) -> ExportRecord | None:
        with self._database.session() as session:
            export = session.scalar(
                select(Export)
                .where(Export.run_id == run_id)
                .order_by(Export.created_at.desc(), Export.id.desc())
                .limit(1)
            )
            return None if export is None else self._record(export)

    @staticmethod
    def _record(export: Export) -> ExportRecord:
        manifest = json.loads(export.manifest_json) if export.manifest_json else None
        if manifest is not None and not isinstance(manifest, dict):
            raise ExportPublishError("export_manifest_invalid")
        return ExportRecord(
            export.id,
            export.run_id,
            export.status,
            export.input_revision,
            export.error_code,
            manifest,
            export.output_relpath,
        )

    def _copy_frame(self, frame: StoredExportFrame, destination: Path) -> None:
        if frame.image_sha256 is None:
            raise ExportSourceMissingError
        try:
            source = self._workspace.resolve_relpath(frame.image_relpath)
        except WorkspaceError as exc:
            raise ExportSourceMissingError from exc
        try:
            if not source.is_file():
                raise ExportSourceMissingError
            with source.open("rb") as source_stream, destination.open("xb") as target_stream:
                digest = hashlib.sha256()
                for block in iter(lambda: source_stream.read(1024 * 1024), b""):
                    digest.update(block)
                    target_stream.write(block)
                target_stream.flush()
                os.fsync(target_stream.fileno())
            if digest.hexdigest() != frame.image_sha256:
                raise ExportSourceMissingError
        except OSError as exc:
            raise ExportSourceMissingError from exc

    @staticmethod
    def _image_name(frame: StoredExportFrame) -> str:
        suffix = Path(frame.image_relpath).suffix.lower()
        if suffix not in {".jpg", ".jpeg", ".png", ".webp"}:
            raise ExportSourceMissingError
        return f"{frame.frame_index:08d}{suffix}"

    @staticmethod
    def _write_file(path: Path, content: bytes) -> None:
        try:
            with path.open("xb") as stream:
                stream.write(content)
                stream.flush()
                os.fsync(stream.fileno())
        except OSError as exc:
            raise ExportPublishError("export_write_failed") from exc

    @classmethod
    def _require_relative_manifest(cls, value: object) -> None:
        if isinstance(value, dict):
            for item in value.values():
                cls._require_relative_manifest(item)
        elif isinstance(value, list):
            for item in value:
                cls._require_relative_manifest(item)
        elif isinstance(value, str) and (Path(value).is_absolute() or Path(value).drive):
            raise ExportPublishError("export_manifest_absolute_path")
