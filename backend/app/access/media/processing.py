from __future__ import annotations

import os
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

import cv2

from backend.app.access.media.probe import CommandRunner, MediaProbeError, ProcessTreeRunner
from backend.app.access.store.workspace import Workspace, WorkspaceError
from backend.app.engines.definition import BBox


class MediaProcessingError(RuntimeError):
    """Sanitized FFmpeg/OpenCV failure identified by a stable code."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class SampledFrame:
    relpath: Path
    width: int
    height: int
    timestamp_ms: int


@dataclass(frozen=True)
class CropRegion:
    region_id: str
    bbox: BBox
    output_relpath: Path


@dataclass(frozen=True)
class RegionCrop:
    region_id: str
    relpath: Path
    width: int
    height: int


class MediaProcessingAccess:
    """Extract one frame with FFmpeg and publish validated OpenCV crops."""

    def __init__(
        self,
        workspace: Workspace,
        executable: Path,
        timeout_seconds: int,
        runner: CommandRunner,
    ) -> None:
        self._workspace = workspace
        self._executable = executable
        self._timeout_seconds = timeout_seconds
        self._runner = runner

    def cancel_current(self) -> None:
        if isinstance(self._runner, ProcessTreeRunner):
            self._runner.cancel()

    def sample_frame(
        self,
        video: Path,
        timestamp_ms: int,
        output_relpath: Path,
    ) -> SampledFrame:
        output = self._resolve_artifact(output_relpath)
        if timestamp_ms < 0:
            raise MediaProcessingError("invalid_frame_timestamp")
        if not video.is_file():
            raise MediaProcessingError("source_missing")
        try:
            output.parent.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            raise MediaProcessingError("frame_output_unwritable") from exc
        temporary = output.with_name(f".{output.stem}.{uuid4().hex}.tmp{output.suffix}")
        try:
            try:
                result = self._runner.run(
                    [
                        str(self._executable),
                        "-hide_banner",
                        "-loglevel",
                        "error",
                        "-nostdin",
                        "-y",
                        "-ss",
                        f"{timestamp_ms / 1000:.3f}",
                        "-i",
                        str(video),
                        "-frames:v",
                        "1",
                        "-an",
                        "-sn",
                        "-dn",
                        str(temporary),
                    ],
                    timeout_seconds=self._timeout_seconds,
                )
            except MediaProbeError as exc:
                code = {
                    "ffprobe_unavailable": "ffmpeg_unavailable",
                    "ffprobe_timeout": "frame_extraction_timeout",
                    "process_cancelled": "frame_cancelled",
                }.get(exc.code, "frame_extraction_failed")
                raise MediaProcessingError(code) from exc
            if result.returncode != 0 or not temporary.is_file():
                raise MediaProcessingError("frame_extraction_failed")
            image = cv2.imread(str(temporary), cv2.IMREAD_COLOR)
            if image is None or image.ndim != 3:
                raise MediaProcessingError("invalid_sampled_frame")
            height, width = image.shape[:2]
            if width <= 0 or height <= 0:
                raise MediaProcessingError("invalid_sampled_frame")
            try:
                os.replace(temporary, output)
            except OSError as exc:
                raise MediaProcessingError("frame_publish_failed") from exc
            return SampledFrame(
                output.relative_to(self._workspace.root),
                int(width),
                int(height),
                timestamp_ms,
            )
        finally:
            temporary.unlink(missing_ok=True)

    def crop_regions(
        self,
        frame_relpath: Path,
        regions: Iterable[CropRegion],
    ) -> tuple[RegionCrop, ...]:
        frame = self._resolve_artifact(frame_relpath)
        requested = tuple(regions)
        resolved = tuple(
            (region, self._resolve_artifact(region.output_relpath)) for region in requested
        )
        if len({output for _region, output in resolved}) != len(resolved):
            raise MediaProcessingError("duplicate_crop_output")
        image = cv2.imread(str(frame), cv2.IMREAD_COLOR)
        if image is None or image.ndim != 3:
            raise MediaProcessingError("invalid_frame")
        frame_height, frame_width = image.shape[:2]
        for region in requested:
            bbox = region.bbox
            if bbox.x < 0 or bbox.y < 0 or bbox.width <= 0 or bbox.height <= 0:
                raise MediaProcessingError("invalid_crop_bbox")
            if bbox.x + bbox.width > frame_width or bbox.y + bbox.height > frame_height:
                raise MediaProcessingError("crop_out_of_bounds")
        staged: list[tuple[CropRegion, Path, Path]] = []
        published: list[RegionCrop] = []
        try:
            for region, output in resolved:
                bbox = region.bbox
                crop = image[bbox.y : bbox.y + bbox.height, bbox.x : bbox.x + bbox.width].copy()
                try:
                    output.parent.mkdir(parents=True, exist_ok=True)
                except OSError as exc:
                    raise MediaProcessingError("crop_output_unwritable") from exc
                temporary = output.with_name(f".{output.stem}.{uuid4().hex}.tmp{output.suffix}")
                try:
                    written = cv2.imwrite(str(temporary), crop)
                except cv2.error as exc:
                    raise MediaProcessingError("crop_write_failed") from exc
                if not written:
                    raise MediaProcessingError("crop_write_failed")
                staged.append((region, output, temporary))
            for region, output, temporary in staged:
                try:
                    os.replace(temporary, output)
                except OSError as exc:
                    raise MediaProcessingError("crop_publish_failed") from exc
                published.append(
                    RegionCrop(
                        region.region_id,
                        output.relative_to(self._workspace.root),
                        region.bbox.width,
                        region.bbox.height,
                    )
                )
        finally:
            for _region, _output, temporary in staged:
                temporary.unlink(missing_ok=True)
        return tuple(published)

    def _resolve_artifact(self, relpath: Path) -> Path:
        try:
            return self._workspace.resolve_relpath(relpath)
        except WorkspaceError as exc:
            raise MediaProcessingError("artifact_path_invalid") from exc
