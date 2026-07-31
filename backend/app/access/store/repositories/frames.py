from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal, cast
from uuid import uuid4

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from backend.app.access.media.processing import RegionCrop, SampledFrame
from backend.app.access.store.database import Database
from backend.app.access.store.models import (
    Annotation,
    Category,
    Frame,
    HudRegion,
    OcrObservation,
    PipelineRun,
    RegionSample,
)
from backend.app.access.store.repositories.checkpoints import (
    CheckpointArtifact,
    CheckpointRepository,
)
from backend.app.engines.definition import BBox, OcrCandidate
from backend.app.managers.workflow.state_machine import FrameStage, require_frame_transition


class FrameNotFoundError(LookupError):
    pass


@dataclass(frozen=True)
class RegionRecord:
    id: str
    bbox: BBox


@dataclass(frozen=True)
class SampleRecord:
    id: str
    region_id: str
    crop_relpath: Path
    width: int
    height: int


@dataclass(frozen=True)
class FrameProcessingRecord:
    id: str
    run_id: str
    frame_index: int
    timestamp_ms: int
    image_relpath: Path
    width: int
    height: int
    stage_status: str
    regions: tuple[RegionRecord, ...]
    samples: tuple[SampleRecord, ...]
    category_ids: dict[str, str]


@dataclass(frozen=True)
class ObservationWrite:
    sample_id: str
    candidate: OcrCandidate
    valid: bool
    rejection_code: str | None
    category_id: str | None
    bbox_global: BBox | None


@dataclass(frozen=True)
class FrameSummary:
    id: str
    frame_index: int
    timestamp_ms: int
    stage_status: str
    review_status: str
    width: int
    height: int
    version: int
    ocr_engine: str
    experimental: bool
    quality_gate: str
    warning: str


@dataclass(frozen=True)
class FramePage:
    items: tuple[FrameSummary, ...]
    page: int
    page_size: int
    total: int


class FrameRepository:
    """Persist one frame's stage results atomically after external processing."""

    def __init__(self, database: Database) -> None:
        self._database = database

    def ensure(self, run_id: str, frame_index: int) -> FrameProcessingRecord:
        with self._database.session() as session:
            run = session.get(PipelineRun, run_id)
            if run is None:
                raise FrameNotFoundError
            frame = session.scalar(
                select(Frame).where(Frame.run_id == run_id, Frame.frame_index == frame_index)
            )
            if frame is None:
                frame = Frame(
                    id=str(uuid4()),
                    run_id=run_id,
                    frame_index=frame_index,
                    timestamp_ms=frame_index * run.interval_ms,
                    image_relpath=(
                        Path("runs") / run_id / "frames" / f"{frame_index:08d}.jpg"
                    ).as_posix(),
                    stage_status="pending",
                    review_status="pending",
                    width=1,
                    height=1,
                    version=1,
                )
                session.add(frame)
                session.flush()
            return self._processing_record(session, run, frame)

    def processing(self, run_id: str, frame_index: int) -> FrameProcessingRecord:
        with self._database.session() as session:
            run = session.get(PipelineRun, run_id)
            frame = session.scalar(
                select(Frame).where(Frame.run_id == run_id, Frame.frame_index == frame_index)
            )
            if run is None or frame is None:
                raise FrameNotFoundError
            return self._processing_record(session, run, frame)

    def commit_sampled(
        self,
        run_id: str,
        frame_index: int,
        sampled: SampledFrame,
        artifact: CheckpointArtifact,
    ) -> None:
        with self._database.session() as session:
            run, frame = self._run_and_frame(session, run_id, frame_index)
            current = cast(FrameStage, frame.stage_status)
            require_frame_transition(current, "sampled")
            frame.image_relpath = sampled.relpath.as_posix()
            frame.width = sampled.width
            frame.height = sampled.height
            frame.stage_status = "sampled"
            frame.version += 1
            session.merge(
                CheckpointRepository.from_run(
                    run,
                    frame_index=frame_index,
                    stage="sample",
                    artifact=artifact,
                )
            )

    def commit_cropped(
        self,
        run_id: str,
        frame_index: int,
        crops: tuple[RegionCrop, ...],
        artifact: CheckpointArtifact,
    ) -> None:
        with self._database.session() as session:
            run, frame = self._run_and_frame(session, run_id, frame_index)
            current = cast(FrameStage, frame.stage_status)
            require_frame_transition(current, "cropped")
            for crop in crops:
                sample = session.scalar(
                    select(RegionSample).where(
                        RegionSample.frame_id == frame.id,
                        RegionSample.region_id == crop.region_id,
                    )
                )
                if sample is None:
                    sample = RegionSample(
                        id=str(uuid4()),
                        frame_id=frame.id,
                        region_id=crop.region_id,
                        crop_relpath=crop.relpath.as_posix(),
                        stage_status="cropped",
                    )
                    session.add(sample)
                else:
                    sample.crop_relpath = crop.relpath.as_posix()
                    sample.stage_status = "cropped"
            frame.stage_status = "cropped"
            frame.version += 1
            session.merge(
                CheckpointRepository.from_run(
                    run,
                    frame_index=frame_index,
                    stage="crop",
                    artifact=artifact,
                )
            )

    def commit_ocr(
        self,
        run_id: str,
        frame_index: int,
        observations: tuple[ObservationWrite, ...],
        artifact: CheckpointArtifact,
        warning: str,
    ) -> None:
        with self._database.session() as session:
            run, frame = self._run_and_frame(session, run_id, frame_index)
            current = cast(FrameStage, frame.stage_status)
            require_frame_transition(current, "ocr_complete")
            sample_ids = tuple(
                session.scalars(select(RegionSample.id).where(RegionSample.frame_id == frame.id))
            )
            session.execute(delete(Annotation).where(Annotation.frame_id == frame.id))
            if sample_ids:
                session.execute(
                    delete(OcrObservation).where(OcrObservation.sample_id.in_(sample_ids))
                )
            for item in observations:
                candidate = item.candidate
                provenance = candidate.provenance
                observation_id = str(uuid4())
                observation = OcrObservation(
                    id=observation_id,
                    sample_id=item.sample_id,
                    char=candidate.char,
                    x=candidate.bbox_local.x,
                    y=candidate.bbox_local.y,
                    width=candidate.bbox_local.width,
                    height=candidate.bbox_local.height,
                    confidence=candidate.confidence,
                    engine=provenance.engine_id,
                    engine_version=provenance.engine_version,
                    runtime_sha256=provenance.runtime_sha256,
                    model_sha256=provenance.model_sha256,
                    config_hash=provenance.config_hash,
                    language=provenance.language,
                    page_segmentation_mode=provenance.page_segmentation_mode,
                    experimental=provenance.experimental,
                    quality_gate=provenance.quality_gate,
                    warning=warning,
                    valid=item.valid,
                    rejection_code=item.rejection_code,
                )
                session.add(observation)
                # Annotation has only a scalar FK (no ORM relationship), so make the
                # dependency visible to SQLite before the dependent row is flushed.
                session.flush((observation,))
                if item.valid and item.category_id is not None and item.bbox_global is not None:
                    bbox = item.bbox_global
                    session.add(
                        Annotation(
                            id=str(uuid4()),
                            frame_id=frame.id,
                            category_id=item.category_id,
                            x=bbox.x,
                            y=bbox.y,
                            width=bbox.width,
                            height=bbox.height,
                            confidence=candidate.confidence,
                            source="ocr",
                            observation_id=observation_id,
                            status="proposed",
                            version=1,
                        )
                    )
            for sample in session.scalars(
                select(RegionSample).where(RegionSample.frame_id == frame.id)
            ):
                sample.stage_status = "ocr_complete"
            frame.stage_status = "ocr_complete"
            require_frame_transition("ocr_complete", "review_pending")
            frame.stage_status = "review_pending"
            frame.review_status = "pending"
            frame.version += 1
            session.merge(
                CheckpointRepository.from_run(
                    run,
                    frame_index=frame_index,
                    stage="ocr",
                    artifact=artifact,
                )
            )

    def list(
        self,
        run_id: str,
        *,
        review_status: Literal["pending", "accepted", "rejected"] | None,
        page: int,
        page_size: int,
    ) -> FramePage:
        with self._database.session() as session:
            run = session.get(PipelineRun, run_id)
            if run is None:
                raise FrameNotFoundError
            predicate = [Frame.run_id == run_id]
            if review_status is not None:
                predicate.append(Frame.review_status == review_status)
            total = int(
                session.scalar(select(func.count()).select_from(Frame).where(*predicate)) or 0
            )
            frames = session.scalars(
                select(Frame)
                .where(*predicate)
                .order_by(Frame.frame_index)
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
            return FramePage(
                items=tuple(
                    FrameSummary(
                        id=frame.id,
                        frame_index=frame.frame_index,
                        timestamp_ms=frame.timestamp_ms,
                        stage_status=frame.stage_status,
                        review_status=frame.review_status,
                        width=frame.width,
                        height=frame.height,
                        version=frame.version,
                        ocr_engine=run.ocr_engine,
                        experimental=run.experimental,
                        quality_gate=run.quality_gate,
                        warning=run.warning,
                    )
                    for frame in frames
                ),
                page=page,
                page_size=page_size,
                total=total,
            )

    @staticmethod
    def _run_and_frame(
        session: Session,
        run_id: str,
        frame_index: int,
    ) -> tuple[PipelineRun, Frame]:
        run = session.get(PipelineRun, run_id)
        frame = session.scalar(
            select(Frame).where(Frame.run_id == run_id, Frame.frame_index == frame_index)
        )
        if run is None or frame is None:
            raise FrameNotFoundError
        return run, frame

    @staticmethod
    def _processing_record(
        session: Session,
        run: PipelineRun,
        frame: Frame,
    ) -> FrameProcessingRecord:
        regions = tuple(
            RegionRecord(region.id, BBox(region.x, region.y, region.width, region.height))
            for region in session.scalars(
                select(HudRegion)
                .where(HudRegion.profile_id == run.profile_id)
                .order_by(HudRegion.created_at, HudRegion.id)
            )
        )
        region_by_id = {region.id: region for region in regions}
        samples = tuple(
            SampleRecord(
                sample.id,
                sample.region_id,
                Path(sample.crop_relpath),
                region_by_id[sample.region_id].bbox.width,
                region_by_id[sample.region_id].bbox.height,
            )
            for sample in session.scalars(
                select(RegionSample)
                .where(RegionSample.frame_id == frame.id)
                .order_by(RegionSample.region_id)
            )
        )
        category_ids = {
            category.name: category.id
            for category in session.scalars(
                select(Category)
                .where(Category.profile_id == run.profile_id, Category.kind == "character")
                .order_by(Category.ordinal)
            )
        }
        return FrameProcessingRecord(
            id=frame.id,
            run_id=run.id,
            frame_index=frame.frame_index,
            timestamp_ms=frame.timestamp_ms,
            image_relpath=Path(frame.image_relpath),
            width=frame.width,
            height=frame.height,
            stage_status=frame.stage_status,
            regions=regions,
            samples=samples,
            category_ids=category_ids,
        )
