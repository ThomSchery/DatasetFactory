from __future__ import annotations

import logging
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Protocol

from backend.app.access.media.processing import (
    CropRegion,
    MediaProcessingError,
    RegionCrop,
    SampledFrame,
)
from backend.app.access.ocr import OcrEngine
from backend.app.access.ocr.tesseract import OcrProcessError
from backend.app.access.store.repositories.checkpoints import (
    CheckpointArtifactError,
    CheckpointRepository,
)
from backend.app.access.store.repositories.frames import (
    FrameProcessingRecord,
    FrameRepository,
    ObservationWrite,
)
from backend.app.access.store.repositories.runs import (
    RunRepository,
    RunSourceError,
)
from backend.app.engines.definition import DatasetDefinitionEngine, OcrCandidate, OcrProvenance
from backend.app.managers.workflow.recovery import WorkflowRecovery


class WorkflowMediaAccess(Protocol):
    def sample_frame(
        self,
        video: Path,
        timestamp_ms: int,
        output_relpath: Path,
    ) -> SampledFrame: ...

    def crop_regions(
        self,
        frame_relpath: Path,
        regions: tuple[CropRegion, ...],
    ) -> tuple[RegionCrop, ...]: ...

    def cancel_current(self) -> None: ...


class WorkflowWorker:
    """Execute missing durable stages for the one active run.

    @SCALE: one in-process worker + polling -> second concurrent run or required
    processing after backend exit -> durable external queue/worker + SSE.
    """

    def __init__(
        self,
        runs: RunRepository,
        frames: FrameRepository,
        checkpoints: CheckpointRepository,
        recovery: WorkflowRecovery,
        media: WorkflowMediaAccess,
        ocr: OcrEngine,
        definition: DatasetDefinitionEngine,
        logger: logging.Logger,
        *,
        heartbeat_interval_seconds: float = 2.0,
    ) -> None:
        if heartbeat_interval_seconds <= 0 or heartbeat_interval_seconds > 5:
            raise ValueError("heartbeat interval must be in (0, 5] seconds")
        self._runs = runs
        self._frames = frames
        self._checkpoints = checkpoints
        self._recovery = recovery
        self._media = media
        self._ocr = ocr
        self._definition = definition
        self._logger = logger
        self._heartbeat_interval_seconds = heartbeat_interval_seconds

    def process(self, run_id: str) -> None:
        try:
            self._recovery.reconcile_run(run_id)
            run = self._runs.get(run_id)
            for frame_index in range(run.total_frames):
                if self._acknowledge_control_if_requested(run_id):
                    return
                source = self._runs.source_snapshot(run_id)
                frame = self._frames.ensure(run_id, frame_index)
                if frame.stage_status == "pending":
                    self._sample(run_id, frame, source.path)
                    if self._acknowledge_control_if_requested(run_id):
                        return
                    frame = self._frames.processing(run_id, frame_index)
                if frame.stage_status == "sampled":
                    self._crop(run_id, frame)
                    if self._acknowledge_control_if_requested(run_id):
                        return
                    frame = self._frames.processing(run_id, frame_index)
                if frame.stage_status == "cropped":
                    self._ocr_frame(run_id, frame)
                    if self._acknowledge_control_if_requested(run_id):
                        return
            self._runs.finish_review_ready(run_id)
        except RunSourceError as exc:
            self._runs.fail(run_id, exc.code)
        except (MediaProcessingError, OcrProcessError, CheckpointArtifactError) as exc:
            if self._runs.control_requested(run_id) is not None:
                self._runs.acknowledge_control(run_id)
            else:
                self._runs.fail(run_id, exc.code)
        except Exception:
            self._logger.exception(
                "workflow_worker_failed",
                extra={"run_id": run_id, "error_code": "workflow_internal_error"},
            )
            self._runs.fail(run_id, "workflow_internal_error")

    def cancel_current(self) -> None:
        self._media.cancel_current()
        self._ocr.cancel_current()

    def _sample(self, run_id: str, frame: FrameProcessingRecord, source: Path) -> None:
        self._runs.update_progress(run_id, stage="sampling", frame_index=frame.frame_index)
        with self._heartbeat(run_id):
            sampled = self._media.sample_frame(
                source,
                frame.timestamp_ms,
                frame.image_relpath,
            )
        artifact = self._checkpoints.hash_artifact(sampled.relpath)
        self._frames.commit_sampled(run_id, frame.frame_index, sampled, artifact)

    def _crop(self, run_id: str, frame: FrameProcessingRecord) -> None:
        self._runs.update_progress(run_id, stage="cropping", frame_index=frame.frame_index)
        requested = tuple(
            CropRegion(
                region.id,
                region.bbox,
                Path("runs") / run_id / "regions" / f"{frame.frame_index:08d}" / f"{region.id}.png",
            )
            for region in frame.regions
        )
        with self._heartbeat(run_id):
            crops = self._media.crop_regions(frame.image_relpath, requested)
        artifacts = tuple(self._checkpoints.hash_artifact(crop.relpath) for crop in crops)
        manifest = self._checkpoints.publish_manifest(
            run_id=run_id,
            frame_index=frame.frame_index,
            stage="crop",
            payload={
                "schema": "datasetfactory-crop-checkpoint-v1",
                "run_id": run_id,
                "frame_index": frame.frame_index,
                "artifacts": [
                    {"relpath": artifact.relpath, "sha256": artifact.sha256}
                    for artifact in artifacts
                ],
                "ocr_provenance": self._provenance_payload(self._runs.provenance(run_id)),
                "warning": self._runs.get(run_id).warning,
            },
        )
        self._frames.commit_cropped(run_id, frame.frame_index, crops, manifest)

    def _ocr_frame(self, run_id: str, frame: FrameProcessingRecord) -> None:
        self._runs.update_progress(run_id, stage="ocr", frame_index=frame.frame_index)
        run = self._runs.get(run_id)
        expected = self._runs.provenance(run_id)
        regions = {region.id: region for region in frame.regions}
        observations: list[ObservationWrite] = []
        with self._heartbeat(run_id):
            for sample in frame.samples:
                # Tesseract verifies the pinned runtime/model inside this call,
                # immediately before launching OCR. Repeating `describe()` here would
                # hash the same multi-megabyte files once more for every frame.
                candidates = self._ocr.detect_characters(
                    sample.crop_relpath,
                    tuple(frame.category_ids),
                )
                self._require_provenance(candidates, expected)
                region = regions[sample.region_id]
                mapped = self._definition.map_ocr_candidates(
                    candidates,
                    region_bbox=region.bbox,
                    crop_width=sample.width,
                    crop_height=sample.height,
                    frame_width=frame.width,
                    frame_height=frame.height,
                    category_ids=frame.category_ids,
                )
                accepted = {id(item.candidate): item for item in mapped.annotations}
                rejected = {id(item.candidate): item for item in mapped.rejected}
                for candidate in candidates:
                    annotation = accepted.get(id(candidate))
                    rejection = rejected.get(id(candidate))
                    observations.append(
                        ObservationWrite(
                            sample_id=sample.id,
                            candidate=candidate,
                            valid=annotation is not None,
                            rejection_code=rejection.code if rejection is not None else None,
                            category_id=(
                                annotation.category_id if annotation is not None else None
                            ),
                            bbox_global=(
                                annotation.bbox_global if annotation is not None else None
                            ),
                        )
                    )
        manifest = self._checkpoints.publish_manifest(
            run_id=run_id,
            frame_index=frame.frame_index,
            stage="ocr",
            payload={
                "schema": "datasetfactory-ocr-checkpoint-v1",
                "run_id": run_id,
                "frame_index": frame.frame_index,
                "observations": [
                    self._observation_payload(item, run.warning) for item in observations
                ],
                "ocr_provenance": self._provenance_payload(expected),
                "warning": run.warning,
            },
        )
        self._frames.commit_ocr(
            run_id,
            frame.frame_index,
            tuple(observations),
            manifest,
            run.warning,
        )

    def _acknowledge_control_if_requested(self, run_id: str) -> bool:
        if self._runs.control_requested(run_id) is None:
            return False
        self._runs.acknowledge_control(run_id)
        return True

    @contextmanager
    def _heartbeat(self, run_id: str) -> Iterator[None]:
        stopped = threading.Event()

        def beat() -> None:
            self._runs.heartbeat(run_id)
            while not stopped.wait(self._heartbeat_interval_seconds):
                self._runs.heartbeat(run_id)

        thread = threading.Thread(target=beat, name=f"workflow-heartbeat-{run_id}", daemon=True)
        thread.start()
        try:
            yield
        finally:
            stopped.set()
            thread.join(timeout=self._heartbeat_interval_seconds + 0.5)

    @staticmethod
    def _require_provenance(
        candidates: tuple[OcrCandidate, ...],
        expected: OcrProvenance,
    ) -> None:
        if any(candidate.provenance != expected for candidate in candidates):
            raise OcrProcessError("ocr_provenance_mismatch")

    @staticmethod
    def _provenance_payload(provenance: OcrProvenance) -> dict[str, Any]:
        return {
            "engine_id": provenance.engine_id,
            "engine_version": provenance.engine_version,
            "runtime_sha256": provenance.runtime_sha256,
            "model_sha256": provenance.model_sha256,
            "config_hash": provenance.config_hash,
            "experimental": provenance.experimental,
            "quality_gate": provenance.quality_gate,
            "language": provenance.language,
            "page_segmentation_mode": provenance.page_segmentation_mode,
        }

    @classmethod
    def _observation_payload(cls, item: ObservationWrite, warning: str) -> dict[str, Any]:
        candidate = item.candidate
        return {
            "sample_id": item.sample_id,
            "char": candidate.char,
            "bbox_local": {
                "x": candidate.bbox_local.x,
                "y": candidate.bbox_local.y,
                "width": candidate.bbox_local.width,
                "height": candidate.bbox_local.height,
            },
            "confidence": candidate.confidence,
            "warning": warning,
            "valid": item.valid,
            "rejection_code": item.rejection_code,
            "category_id": item.category_id,
            "bbox_global": (
                {
                    "x": item.bbox_global.x,
                    "y": item.bbox_global.y,
                    "width": item.bbox_global.width,
                    "height": item.bbox_global.height,
                }
                if item.bbox_global is not None
                else None
            ),
            "ocr_provenance": cls._provenance_payload(candidate.provenance),
        }
