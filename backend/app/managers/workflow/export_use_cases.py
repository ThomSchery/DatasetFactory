from __future__ import annotations

import hashlib
import logging
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import UTC, datetime
from math import floor
from pathlib import Path
from typing import Any, Literal, Protocol
from uuid import uuid4

from backend.app.access.store.repositories.exports import (
    ExportImageFile,
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
    StoredExportFrame,
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

    def build_roboflow(
        self,
        *,
        images: tuple[CocoImageInput, ...],
        categories: tuple[CocoCategoryInput, ...],
        annotations: tuple[CocoAnnotationInput, ...],
    ) -> bytes: ...


ExportFormat = Literal["coco", "roboflow_coco"]
SPLIT_NAMES = ("train", "valid", "test")


@dataclass(frozen=True)
class ExportSplitRatios:
    train: float = 0.8
    valid: float = 0.1
    test: float = 0.1

    def as_dict(self) -> dict[str, float]:
        return {"train": self.train, "valid": self.valid, "test": self.test}


@dataclass(frozen=True)
class ExportOptions:
    format: ExportFormat = "coco"
    split_ratios: ExportSplitRatios = ExportSplitRatios()
    seed: int = 0


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

    def create_export(
        self,
        run_id: str,
        *,
        export_format: ExportFormat = "coco",
        split_ratios: ExportSplitRatios | None = None,
        seed: int = 0,
    ) -> ExportRecord:
        options = ExportOptions(export_format, split_ratios or ExportSplitRatios(), seed)
        self._validate_options(options)
        export_id = str(uuid4())
        try:
            snapshot = self._exports.create_snapshot(run_id, export_id=export_id)
        except Exception as exc:
            raise self._translate(exc) from exc
        if self._closed:
            self._exports.fail(export_id, "export_unavailable")
            raise ExportUseCaseError("export_unavailable")
        try:
            self._executor.submit(self._generate, snapshot, options)
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

    def _generate(self, snapshot: StoredExportSnapshot, options: ExportOptions) -> None:
        staged: StagedExport | None = None
        completed = False
        try:
            if options.format == "roboflow_coco":
                staged = self._stage_roboflow(snapshot, options)
            else:
                staged = self._stage_coco(snapshot)
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

    def _stage_coco(self, snapshot: StoredExportSnapshot) -> StagedExport:
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
        manifest = self._base_manifest(snapshot)
        manifest.update(
            {
                "annotations": "annotations.json",
                "images": "images",
                "schema": "datasetfactory-coco-export-v1",
            }
        )
        return self._exports.stage(snapshot, document=document, manifest=manifest)

    def _stage_roboflow(
        self, snapshot: StoredExportSnapshot, options: ExportOptions
    ) -> StagedExport:
        partitions = self._partition_frames(
            snapshot.frames,
            ratios=options.split_ratios,
            seed=options.seed,
        )
        categories = tuple(
            CocoCategoryInput(category.id, category.ordinal, category.name)
            for category in snapshot.categories
        )
        documents: dict[str, bytes] = {}
        split_files: dict[str, tuple[ExportImageFile, ...]] = {}
        split_manifest: dict[str, dict[str, Any]] = {}
        for split_name in SPLIT_NAMES:
            frames = partitions[split_name]
            frame_ids = {frame.id for frame in frames}
            files = tuple(
                ExportImageFile(
                    frame,
                    self._roboflow_image_name(
                        snapshot.run_id, frame.id, frame.frame_index, frame.image_relpath
                    ),
                )
                for frame in frames
            )
            annotations = tuple(
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
                if annotation.frame_id in frame_ids
            )
            documents[split_name] = self._engine.build_roboflow(
                images=tuple(
                    CocoImageInput(
                        item.frame.id,
                        item.frame.frame_index,
                        item.file_name,
                        item.frame.width,
                        item.frame.height,
                    )
                    for item in files
                ),
                categories=categories,
                annotations=annotations,
            )
            split_files[split_name] = files
            split_manifest[split_name] = {
                "annotation_count": len(annotations),
                "annotations": f"{split_name}/_annotations.coco.json",
                "frame_count": len(frames),
                "images": split_name,
            }

        manifest = self._base_manifest(snapshot)
        manifest.update(
            {
                "format": "roboflow_coco",
                "schema": "datasetfactory-roboflow-coco-export-v1",
                "seed": options.seed,
                "split_ratios": options.split_ratios.as_dict(),
                "splits": split_manifest,
            }
        )
        return self._exports.stage_roboflow(
            snapshot,
            documents=documents,
            split_files=split_files,
            manifest=manifest,
        )

    def _base_manifest(self, snapshot: StoredExportSnapshot) -> dict[str, Any]:
        annotation_sources = {"ocr": 0, "manual": 0}
        for annotation in snapshot.annotations:
            annotation_sources[annotation.source] += 1
        return {
            "annotation_sources": annotation_sources,
            "exported_at": self._clock().astimezone(UTC).isoformat(),
            "input_revision": snapshot.input_revision,
            "profile_id": snapshot.profile_id,
            "run_id": snapshot.run_id,
        }

    @staticmethod
    def _validate_options(options: ExportOptions) -> None:
        ratios = options.split_ratios.as_dict()
        if options.format not in {"coco", "roboflow_coco"}:
            raise ExportUseCaseError("export_format_invalid")
        if (
            any(value < 0 or value > 1 for value in ratios.values())
            or abs(sum(ratios.values()) - 1) > 1e-9
        ):
            raise ExportUseCaseError("export_split_invalid")

    @classmethod
    def _partition_frames(
        cls,
        frames: tuple[StoredExportFrame, ...],
        *,
        ratios: ExportSplitRatios,
        seed: int,
    ) -> dict[str, tuple[StoredExportFrame, ...]]:
        ratio_values = ratios.as_dict()
        ordered = tuple(
            sorted(
                frames,
                key=lambda frame: hashlib.sha256(f"{seed}:{frame.id}".encode()).digest(),
            )
        )
        counts = cls._split_counts(len(ordered), ratio_values)
        result: dict[str, tuple[StoredExportFrame, ...]] = {}
        offset = 0
        for name in SPLIT_NAMES:
            end = offset + counts[name]
            result[name] = ordered[offset:end]
            offset = end
        return result

    @staticmethod
    def _split_counts(total: int, ratios: dict[str, float]) -> dict[str, int]:
        positive = [name for name in SPLIT_NAMES if ratios[name] > 0]
        counts = {name: 0 for name in SPLIT_NAMES}
        if total < len(positive):
            for name in sorted(positive, key=lambda item: (-ratios[item], SPLIT_NAMES.index(item)))[
                :total
            ]:
                counts[name] = 1
            return counts

        quotas = {name: total * ratios[name] for name in SPLIT_NAMES}
        counts.update({name: floor(quotas[name]) for name in SPLIT_NAMES})
        remaining = total - sum(counts.values())
        for name in sorted(
            SPLIT_NAMES,
            key=lambda item: (-(quotas[item] - counts[item]), SPLIT_NAMES.index(item)),
        )[:remaining]:
            counts[name] += 1
        for name in positive:
            if counts[name] == 0:
                donor = max(positive, key=lambda item: (counts[item], ratios[item]))
                counts[donor] -= 1
                counts[name] = 1
        return counts

    @staticmethod
    def _roboflow_image_name(
        run_id: str, frame_id: str, frame_index: int, image_relpath: str
    ) -> str:
        suffix = Path(image_relpath).suffix.lower()
        if suffix not in {".jpg", ".jpeg", ".png", ".webp"}:
            raise ExportSourceMissingError
        run_component = run_id.replace("-", "")
        frame_component = frame_id.replace("-", "")
        if not run_component.isalnum() or not frame_component.isalnum():
            raise ExportSourceMissingError
        return f"{run_component}_{frame_component}_{frame_index:08d}{suffix}"

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
