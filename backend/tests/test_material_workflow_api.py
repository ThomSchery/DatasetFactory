from __future__ import annotations

import io
import json
import shutil
import subprocess
import sys
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from backend.app.access.media.probe import (
    FfprobeMediaProbe,
    MediaMetadata,
    MediaProbeError,
    ProcessResult,
    ProcessTreeRunner,
)
from backend.app.access.store.repositories.materials import MaterialRepository
from backend.app.access.store.repositories.projects import ProjectRepository
from backend.app.composition import CompositionRoot
from backend.app.main import create_app
from backend.app.managers.workflow.material_use_cases import (
    MAX_VIDEO_BYTES,
    MaterialUseCaseError,
    MaterialUseCases,
)


@dataclass
class StaticMediaProbe:
    metadata: MediaMetadata

    def inspect(self, source: Path) -> MediaMetadata:
        del source
        return self.metadata


@dataclass
class StaticDiskSpace:
    free_bytes: int

    def available_bytes(self, path: Path) -> int:
        del path
        return self.free_bytes


def _use_cases(
    composition: CompositionRoot,
    *,
    metadata: MediaMetadata | None = None,
    free_bytes: int = 10 * 1024**3,
) -> MaterialUseCases:
    return MaterialUseCases(
        StaticMediaProbe(
            metadata or MediaMetadata(duration_ms=1000, width=64, height=48, container="mp4_mov")
        ),
        StaticDiskSpace(free_bytes),
        composition.workspace.root,
        ProjectRepository(composition.database, composition.workspace),
        MaterialRepository(composition.database),
    )


def test_material_limits_reject_unsupported_missing_too_large_too_long_and_low_disk(
    composition: CompositionRoot,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    use_cases = _use_cases(composition)
    with pytest.raises(MaterialUseCaseError) as unsupported:
        use_cases.import_material(str((tmp_path / "video.avi").resolve()))
    assert unsupported.value.code == "unsupported_media"

    with pytest.raises(MaterialUseCaseError) as missing:
        use_cases.import_material(str((tmp_path / "missing.mp4").resolve()))
    assert missing.value.code == "source_missing"

    source = tmp_path / "video.mp4"
    source.write_bytes(b"small")
    original_stat = Path.stat
    actual = source.stat()

    class OversizedStat:
        st_size = MAX_VIDEO_BYTES + 1
        st_mtime_ns = actual.st_mtime_ns
        st_mode = actual.st_mode

    def oversized_stat(path: Path, *args: Any, **kwargs: Any) -> Any:
        if path == source:
            return OversizedStat()
        return original_stat(path, *args, **kwargs)

    monkeypatch.setattr(Path, "stat", oversized_stat)
    with pytest.raises(MaterialUseCaseError) as too_large:
        use_cases.import_material(str(source.resolve()))
    assert too_large.value.code == "media_too_large"
    monkeypatch.setattr(Path, "stat", original_stat)

    too_long_use_cases = _use_cases(
        composition,
        metadata=MediaMetadata(
            duration_ms=2 * 60 * 60 * 1000 + 1,
            width=64,
            height=48,
            container="mp4_mov",
        ),
    )
    with pytest.raises(MaterialUseCaseError) as too_long:
        too_long_use_cases.import_material(str(source.resolve()))
    assert too_long.value.code == "media_too_long"

    low_disk_use_cases = _use_cases(composition, free_bytes=1)
    with pytest.raises(MaterialUseCaseError) as low_disk:
        low_disk_use_cases.import_material(str(source.resolve()))
    assert low_disk.value.code == "disk_space"
    assert low_disk.value.details["required_bytes"] > 1


def test_material_api_persists_metadata_and_redacts_local_path(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    source = tmp_path / "private-session-name.mp4"
    source.write_bytes(b"fixture")
    composition.material_use_cases = _use_cases(composition)
    app = create_app(composition.settings, composition=composition)

    with TestClient(app) as client:
        created = client.post("/api/v1/materials", json={"local_path": str(source.resolve())})
        listed = client.get("/api/v1/materials?page=1&page_size=10")

    assert created.status_code == 201
    assert created.json()["basename"] == source.name
    assert created.json()["available"] is True
    assert str(source.parent.resolve()) not in created.text
    assert listed.status_code == 200
    assert listed.json()["total"] == 1
    assert listed.json()["items"][0]["basename"] == source.name
    assert str(source.parent.resolve()) not in listed.text


def test_ffprobe_errors_are_stable_and_do_not_expose_source_path(tmp_path: Path) -> None:
    class FailingRunner:
        def run(self, arguments: list[str], *, timeout_seconds: int) -> ProcessResult:
            del arguments, timeout_seconds
            return ProcessResult(returncode=1, stdout="")

    sensitive_source = tmp_path / "secret-recording.mp4"
    sensitive_source.write_bytes(b"invalid")
    probe = FfprobeMediaProbe(Path("D:/tools/ffprobe.exe"), 30, FailingRunner())

    with pytest.raises(MediaProbeError) as error:
        probe.inspect(sensitive_source)

    assert error.value.code == "invalid_media"
    assert str(sensitive_source) not in str(error.value)


def test_process_runner_times_out_and_terminates_process() -> None:
    started = time.monotonic()
    with pytest.raises(MediaProbeError) as error:
        ProcessTreeRunner().run(
            [
                sys.executable,
                "-c",
                "import subprocess,sys,time; "
                "subprocess.Popen([sys.executable,'-c','import time; time.sleep(60)']); "
                "time.sleep(60)",
            ],
            timeout_seconds=1,
        )

    assert error.value.code == "ffprobe_timeout"
    assert time.monotonic() - started < 10


def test_process_runner_cancel_terminates_active_process_with_stable_code(
    tmp_path: Path,
) -> None:
    runner = ProcessTreeRunner()
    sentinel = tmp_path / "media-runner-started"
    failures: list[MediaProbeError] = []

    def run() -> None:
        try:
            runner.run(
                [
                    sys.executable,
                    "-c",
                    "from pathlib import Path; import sys,time; "
                    "Path(sys.argv[1]).write_text('started'); time.sleep(60)",
                    str(sentinel),
                ],
                timeout_seconds=30,
            )
        except MediaProbeError as error:
            failures.append(error)

    thread = threading.Thread(target=run)
    thread.start()
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline and not sentinel.is_file():
        time.sleep(0.01)
    assert sentinel.is_file()
    runner.cancel()
    thread.join(timeout=10)

    assert not thread.is_alive()
    assert [error.code for error in failures] == ["process_cancelled"]


def test_timeout_cleanup_never_uses_unbounded_communicate(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class NeverExitsProcess:
        pid = 123
        returncode = 1

        def __init__(self) -> None:
            self.timeouts: list[int | None] = []
            self.stdout = io.StringIO()
            self.stderr = io.StringIO()

        def communicate(self, timeout: int | None = None) -> tuple[str, str]:
            self.timeouts.append(timeout)
            raise subprocess.TimeoutExpired("ffprobe", timeout or 0)

        def kill(self) -> None:
            return None

    process = NeverExitsProcess()
    monkeypatch.setattr(
        "backend.app.access.media.probe.subprocess.Popen",
        lambda *args, **kwargs: process,
    )
    monkeypatch.setattr(ProcessTreeRunner, "_terminate_tree", staticmethod(lambda _: None))

    with pytest.raises(MediaProbeError) as error:
        ProcessTreeRunner(cleanup_timeout_seconds=2).run(["ffprobe"], timeout_seconds=30)

    assert error.value.code == "ffprobe_timeout"
    assert process.timeouts == [30, 2]
    assert process.stdout.closed
    assert process.stderr.closed


@pytest.mark.parametrize(
    ("format_name", "expected"),
    [
        ("mov,mp4,m4a,3gp,3g2,mj2", "mp4_mov"),
        ("matroska,webm", "matroska"),
        ("avi", "avi"),
    ],
)
def test_ffprobe_container_aliases_are_explicit(format_name: str, expected: str) -> None:
    class JsonRunner:
        def run(self, arguments: list[str], *, timeout_seconds: int) -> ProcessResult:
            del arguments, timeout_seconds
            return ProcessResult(
                returncode=0,
                stdout=json.dumps(
                    {
                        "streams": [{"codec_type": "video", "width": 64, "height": 48}],
                        "format": {"duration": "1.0", "format_name": format_name},
                    }
                ),
            )

    metadata = FfprobeMediaProbe(Path("ffprobe"), 30, JsonRunner()).inspect(Path("video"))

    assert metadata.container == expected


def test_real_local_ffprobe_reads_generated_video(tmp_path: Path) -> None:
    ffmpeg = shutil.which("ffmpeg")
    ffprobe = shutil.which("ffprobe")
    if ffmpeg is None or ffprobe is None:
        pytest.skip("Local FFmpeg/ffprobe is not available")
    source = tmp_path / "real-probe.mp4"
    subprocess.run(
        [
            ffmpeg,
            "-y",
            "-f",
            "lavfi",
            "-i",
            "color=c=black:s=64x48:d=0.25",
            "-c:v",
            "mpeg4",
            str(source),
        ],
        check=True,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        timeout=30,
    )

    metadata = FfprobeMediaProbe(Path(ffprobe), 30, ProcessTreeRunner()).inspect(source)

    assert metadata.width == 64
    assert metadata.height == 48
    assert 100 <= metadata.duration_ms <= 1000
    assert metadata.container == "mp4_mov"


def test_real_container_allowlist_accepts_mp4_mkv_mov_and_rejects_disguised_avi(
    composition: CompositionRoot,
    tmp_path: Path,
) -> None:
    ffmpeg = shutil.which("ffmpeg")
    ffprobe = shutil.which("ffprobe")
    if ffmpeg is None or ffprobe is None:
        pytest.skip("Local FFmpeg/ffprobe is not available")

    def generate(path: Path) -> None:
        subprocess.run(
            [
                ffmpeg,
                "-y",
                "-f",
                "lavfi",
                "-i",
                "color=c=black:s=64x48:d=0.25",
                "-c:v",
                "mpeg4",
                str(path),
            ],
            check=True,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=30,
        )

    probe = FfprobeMediaProbe(Path(ffprobe), 30, ProcessTreeRunner())
    use_cases = MaterialUseCases(
        probe,
        StaticDiskSpace(10 * 1024**3),
        composition.workspace.root,
        ProjectRepository(composition.database, composition.workspace),
        MaterialRepository(composition.database),
    )
    for extension in (".mp4", ".mkv", ".mov"):
        source = tmp_path / f"allowed{extension}"
        generate(source)
        assert use_cases.import_material(str(source.resolve())).basename == source.name

    avi = tmp_path / "source.avi"
    disguised = tmp_path / "disguised.mp4"
    generate(avi)
    shutil.copyfile(avi, disguised)
    with pytest.raises(MaterialUseCaseError) as error:
        use_cases.import_material(str(disguised.resolve()))
    assert error.value.code == "unsupported_media"
