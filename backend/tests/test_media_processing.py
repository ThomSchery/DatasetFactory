from __future__ import annotations

import hashlib
import os
import subprocess
from pathlib import Path

import cv2
import pytest

from backend.app.access.media.probe import MediaProbeError, ProcessResult, ProcessTreeRunner
from backend.app.access.media.processing import (
    CropRegion,
    MediaProcessingAccess,
    MediaProcessingError,
)
from backend.app.access.store.workspace import Workspace
from backend.app.config import Settings
from backend.app.engines.definition import BBox

FIXTURES = Path("backend/tests/fixtures")


class TimeoutRunner:
    def run(self, arguments: list[str], *, timeout_seconds: int) -> ProcessResult:
        del arguments, timeout_seconds
        raise MediaProbeError("ffprobe_timeout")


class RecordingRunner:
    def __init__(self) -> None:
        self.calls = 0

    def run(self, arguments: list[str], *, timeout_seconds: int) -> ProcessResult:
        del arguments, timeout_seconds
        self.calls += 1
        return ProcessResult(0, "")


def _workspace(tmp_path: Path) -> Workspace:
    workspace = Workspace(tmp_path / "workspace", tmp_path / "cache")
    workspace.prepare()
    return workspace


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _link_directory(link: Path, target: Path) -> None:
    try:
        link.symlink_to(target, target_is_directory=True)
        return
    except OSError:
        if os.name != "nt":
            raise
    result = subprocess.run(
        ["cmd", "/c", "mklink", "/J", str(link), str(target)],
        capture_output=True,
        text=True,
        check=False,
        timeout=10,
    )
    if result.returncode != 0:
        pytest.skip(f"directory link creation is not available: {result.stderr}")


def test_frame_timeout_is_typed_and_leaves_no_artifact(tmp_path: Path) -> None:
    workspace = _workspace(tmp_path)
    video = tmp_path / "input.mkv"
    video.write_bytes(b"fixture")
    output_relpath = Path("runs/run-1/frame.png")
    output = workspace.resolve_relpath(output_relpath)
    access = MediaProcessingAccess(workspace, Path("ffmpeg"), 60, TimeoutRunner())

    with pytest.raises(MediaProcessingError) as error:
        access.sample_frame(video, 0, output_relpath)

    assert error.value.code == "frame_extraction_timeout"
    assert not output.exists()
    assert not tuple(output.parent.glob(".*.tmp.png"))


@pytest.mark.parametrize("escape_kind", ["absolute", "symlink"])
def test_frame_output_escape_is_rejected_before_mkdir_or_subprocess(
    tmp_path: Path,
    escape_kind: str,
) -> None:
    workspace = _workspace(tmp_path)
    runner = RecordingRunner()
    video = tmp_path / "input.mkv"
    video.write_bytes(b"fixture")
    outside = tmp_path / "outside"
    if escape_kind == "absolute":
        output = outside / "frame.png"
    else:
        outside.mkdir()
        link = workspace.root / "runs" / "escape"
        _link_directory(link, outside)
        output = Path("runs/escape/frame.png")
    access = MediaProcessingAccess(workspace, Path("ffmpeg"), 60, runner)

    with pytest.raises(MediaProcessingError) as error:
        access.sample_frame(video, 0, output)

    assert error.value.code == "artifact_path_invalid"
    assert runner.calls == 0
    assert not (outside / "frame.png").exists()


def test_real_ffmpeg_frame_and_opencv_crops_stay_under_requested_workspace(
    tmp_path: Path,
) -> None:
    ffmpeg = Settings().ffmpeg_path
    assert ffmpeg.is_file(), "DF_FFMPEG_PATH must point to the real integration runtime"
    workspace = _workspace(tmp_path)
    source_video = FIXTURES / "video/synthetic-hud.mkv"
    reference_frame = FIXTURES / "video/synthetic-frame.png"
    frame_relpath = Path("runs/run-1/frames/0.png")
    frame_output = workspace.resolve_relpath(frame_relpath)
    access = MediaProcessingAccess(workspace, ffmpeg, 60, ProcessTreeRunner())

    sampled = access.sample_frame(source_video, 0, frame_relpath)

    assert sampled.width == 1280
    assert sampled.height == 852
    assert sampled.relpath == frame_relpath
    reference = cv2.imread(str(reference_frame), cv2.IMREAD_COLOR)
    actual = cv2.imread(str(frame_output), cv2.IMREAD_COLOR)
    assert reference is not None and actual is not None
    assert cv2.norm(reference, actual, cv2.NORM_INF) == 0

    source_hash = _sha256(frame_output)
    regions = (
        CropRegion("health", BBox(40, 32, 420, 96), Path("runs/run-1/regions/health.png")),
        CropRegion("ratio", BBox(40, 692, 420, 96), Path("runs/run-1/regions/ratio.png")),
    )
    crops = access.crop_regions(frame_relpath, regions)

    assert [crop.region_id for crop in crops] == ["health", "ratio"]
    assert all(crop.width == 420 and crop.height == 96 for crop in crops)
    assert all(
        workspace.resolve_relpath(crop.relpath).is_relative_to(workspace.root) for crop in crops
    )
    assert _sha256(frame_output) == source_hash
    expected_health = cv2.imread(str(FIXTURES / "hud-crops/00-health.png"), cv2.IMREAD_COLOR)
    actual_health = cv2.imread(str(workspace.resolve_relpath(crops[0].relpath)), cv2.IMREAD_COLOR)
    assert expected_health is not None and actual_health is not None
    assert cv2.norm(expected_health, actual_health, cv2.NORM_INF) == 0


def test_crop_outside_frame_is_rejected_without_publishing(tmp_path: Path) -> None:
    workspace = _workspace(tmp_path)
    frame_relpath = Path("runs/frame.png")
    frame = workspace.resolve_relpath(frame_relpath)
    frame.parent.mkdir(parents=True, exist_ok=True)
    frame.write_bytes((FIXTURES / "video/synthetic-frame.png").read_bytes())
    output_relpath = Path("runs/invalid.png")
    access = MediaProcessingAccess(workspace, Path("ffmpeg"), 60, ProcessTreeRunner())

    with pytest.raises(MediaProcessingError) as error:
        access.crop_regions(
            frame_relpath,
            (CropRegion("bad", BBox(1270, 0, 20, 20), output_relpath),),
        )

    assert error.value.code == "crop_out_of_bounds"
    assert not workspace.resolve_relpath(output_relpath).exists()


def test_crop_output_escape_is_rejected_before_read_or_write(tmp_path: Path) -> None:
    workspace = _workspace(tmp_path)
    outside = tmp_path / "outside" / "crop.png"
    access = MediaProcessingAccess(workspace, Path("ffmpeg"), 60, ProcessTreeRunner())

    with pytest.raises(MediaProcessingError) as error:
        access.crop_regions(
            Path("runs/nonexistent.png"),
            (CropRegion("bad", BBox(0, 0, 1, 1), outside),),
        )

    assert error.value.code == "artifact_path_invalid"
    assert not outside.parent.exists()
