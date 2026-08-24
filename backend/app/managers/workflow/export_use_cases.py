from __future__ import annotations

import logging
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Protocol
from uuid import uuid4

from backend.app.access.store.repositories.exports import (
    ExportNotFoundError,
    ExportPublishError,
    ExportRecord,
    ExportRepository,
    ExportRevisionConflictError,
    ExportRunningError,
    ExportRunNotFoundError,
    ExportSourceMissingError,
    NoAcceptedFramesError,
    StagedExport,
    StoredExportSnapshot,
)
from backend.app.engines.coco import (
    CocoAnnotationInput,
    CocoCategoryInput,
    CocoImageInput,
    CocoValidationError,
)


class CocoDocumentBuilder(Protocol):
    def build(
        self,
        *,
        images: tuple[CocoImageInput, ...],
        categories: tuple[CocoCategoryInput, ...],
        annotations: tuple[CocoAnnotationInput, ...],
    ) -> bytes: ...


class ExportUseCaseError(RuntimeError):
    def __init__(self, code: str, *, details: dict[str, Any] | None = None) -> None:
        super().__init__(code)
        self.code = code
        self.details = details or {}


class ExportUseCases:
    """Reserve an immutable review snapshot, then generate it outside transactions."""

    def __init__(
        self,
        engine: CocoDocumentBuilder,
        exports: ExportRepository,
        logger: logging.Logger,
        *,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self._engine = engine
        self._exports = exports
        self._logger = logger
        self._clock = clock or (lambda: datetime.now(UTC))
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="coco-export")
        self._closed = False

    def create_export(self, run_id: str) -> ExportRecord:
        export_id = str(uuid4())
        try:
            snapshot = self._exports.create_snapshot(run_id, export_id=export_id)
        except Exception as exc:
            raise self._translate(exc) from exc
        if self._closed:
            self._exports.fail(export_id, "export_unavailable")
            raise ExportUseCaseError("export_unavailable")
        try:
            self._executor.submit(self._generate, snapshot)
        except RuntimeError as exc:
            self._exports.fail(export_id, "export_unavailable")
            raise ExportUseCaseError("export_unavailable") from exc
        return ExportRecord(
            snapshot.export_id,
            snapshot.run_id,
            "running",
            snapshot.input_revision,
            None,
            None,
            None,
        )

    def get_export(self, export_id: str) -> ExportRecord:
        try:
            return self._exports.get(export_id)
        except Exception as exc:
            raise self._translate(exc) from exc

    def get_latest_export(self, run_id: str) -> ExportRecord | None:
        try:
            return self._exports.latest_for_run(run_id)
        except Exception as exc:
            raise self._translate(exc) from exc

    def shutdown(self) -> None:
        self._closed = True
        self._executor.shutdown(wait=True, cancel_futures=False)

    def _generate(self, snapshot: StoredExportSnapshot) -> None:
        staged: StagedExport | None = None
        completed = False
        try:
            document = self._engine.build(
                images=tuple(
                    CocoImageInput(
                        frame.id,
                        frame.frame_index,
                        f"images/{self._image_name(frame.frame_index, frame.image_relpath)}",
                        frame.width,
                        frame.height,
                    )
                    for frame in snapshot.frames
                ),
                categories=tuple(
                    CocoCategoryInput(category.id, category.ordinal, category.name)
                    for category in snapshot.categories
                ),
                annotations=tuple(
                    CocoAnnotationInput(
                        annotation.id,
                        annotation.frame_id,
                        annotation.category_id,
                        annotation.x,
                        annotation.y,
                        annotation.width,
                        annotation.height,
                    )
                    for annotation in snapshot.annotations
                ),
            )
            exported_at = self._clock().astimezone(UTC).isoformat()
            annotation_sources = {"ocr": 0, "manual": 0}
            for annotation in snapshot.annotations:
                annotation_sources[annotation.source] += 1
            manifest: dict[str, Any] = {
                "annotation_sources": annotation_sources,
                "annotations": "annotations.json",
                "exported_at": exported_at,
                "images": "images",
                "input_revision": snapshot.input_revision,
                "profile_id": snapshot.profile_id,
                "run_id": snapshot.run_id,
                "schema": "datasetfactory-coco-export-v1",
            }
            staged = self._exports.stage(snapshot, document=document, manifest=manifest)
            self._exports.publish_if_revision(snapshot, staged)
            completed = True
        except ExportRevisionConflictError:
            if staged is not None:
                staged.discard()
                staged = None
            self._exports.fail(snapshot.export_id, "export_revision_conflict")
        except ExportSourceMissingError:
            self._exports.fail(snapshot.export_id, "export_source_missing")
        except (CocoValidationError, ValueError):
            self._exports.fail(snapshot.export_id, "export_snapshot_invalid")
        except ExportPublishError:
            if staged is not None:
                staged.discard()
                staged = None
            self._exports.fail(snapshot.export_id, "export_publish_failed")
        except Exception:
            if staged is not None:
                staged.discard()
                staged = None
            self._logger.exception(
                "coco_export_failed",
                extra={"export_id": snapshot.export_id, "run_id": snapshot.run_id},
            )
            try:
                self._exports.fail(snapshot.export_id, "export_internal_error")
            except Exception:
                self._logger.exception(
                    "coco_export_failure_state_failed",
                    extra={"export_id": snapshot.export_id, "run_id": snapshot.run_id},
                )
        finally:
            if staged is not None and not completed:
                staged.discard()

    @staticmethod
    def _image_name(frame_index: int, image_relpath: str) -> str:
        suffix = Path(image_relpath).suffix.lower()
        if suffix not in {".jpg", ".jpeg", ".png", ".webp"}:
            raise ExportSourceMissingError
        return f"{frame_index:08d}{suffix}"

    @staticmethod
    def _translate(error: Exception) -> ExportUseCaseError:
        if isinstance(error, ExportRunNotFoundError):
            return ExportUseCaseError("run_not_found")
        if isinstance(error, ExportNotFoundError):
            return ExportUseCaseError("export_not_found")
        if isinstance(error, ExportRunningError):
            return ExportUseCaseError("export_running")
        if isinstance(error, NoAcceptedFramesError):
            return ExportUseCaseError("no_accepted_frames")
        if isinstance(error, ExportUseCaseError):
            return error
        return ExportUseCaseError("export_persistence_failed")
