from __future__ import annotations

import subprocess
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pytest import MonkeyPatch

from backend.app.access.ocr import TesseractRuntimeIdentity
from backend.app.access.status.service import (
    SystemResourceProbe,
    SystemStatusAccess,
    TesseractDependencyProbe,
)
from backend.app.composition import CompositionRoot
from backend.app.config import Settings
from backend.app.main import create_app


def _completed(
    arguments: list[str], *, returncode: int = 0, output: str = ""
) -> subprocess.CompletedProcess[str]:
    return subprocess.CompletedProcess(arguments, returncode, stdout=output, stderr="")


def test_probe_distinguishes_ffmpeg_single_dash_from_double_dash(
    tmp_path: Path,
    monkeypatch: MonkeyPatch,
) -> None:
    executable = tmp_path / "ffmpeg.exe"
    executable.touch()

    def fake_run(arguments: list[str], **_: object) -> subprocess.CompletedProcess[str]:
        if arguments[1:] == ["-version"]:
            return _completed(arguments, output="ffmpeg version 7.1")
        return _completed(arguments, returncode=1, output="Unknown option")

    monkeypatch.setattr(subprocess, "run", fake_run)
    probe = SystemResourceProbe()

    correct = probe.executable(
        executable,
        arguments=("-version",),
        output_marker="ffmpeg version",
        timeout_seconds=1,
    )
    incorrect = probe.executable(
        executable,
        arguments=("--version",),
        output_marker="ffmpeg version",
        timeout_seconds=1,
    )

    assert correct.available is True
    assert incorrect.available is False
    assert incorrect.detail == "error"


@pytest.mark.parametrize(
    ("returncode", "output", "expected_detail"),
    [
        (2, "ffprobe version 7.1", "error"),
        (0, "not the requested tool", "unexpected_output"),
    ],
)
def test_probe_requires_success_and_expected_output(
    tmp_path: Path,
    monkeypatch: MonkeyPatch,
    returncode: int,
    output: str,
    expected_detail: str,
) -> None:
    executable = tmp_path / "ffprobe.exe"
    executable.touch()
    monkeypatch.setattr(
        subprocess,
        "run",
        lambda arguments, **_: _completed(arguments, returncode=returncode, output=output),
    )

    result = SystemResourceProbe().executable(
        executable,
        arguments=("-version",),
        output_marker="ffprobe version",
        timeout_seconds=1,
    )

    assert result.available is False
    assert result.detail == expected_detail


def test_probe_reports_timeout_and_missing(
    tmp_path: Path,
    monkeypatch: MonkeyPatch,
) -> None:
    executable = tmp_path / "tesseract.exe"
    executable.touch()

    def timeout(*_: object, **__: object) -> None:
        raise subprocess.TimeoutExpired(cmd="tesseract", timeout=1)

    monkeypatch.setattr(subprocess, "run", timeout)
    timed_out = SystemResourceProbe().executable(
        executable,
        arguments=("--version",),
        output_marker="tesseract",
        timeout_seconds=1,
    )
    missing = SystemResourceProbe().executable(
        tmp_path / "missing.exe",
        arguments=("--version",),
        output_marker="tesseract",
        timeout_seconds=1,
    )

    assert timed_out.detail == "timeout"
    assert missing.detail == "not_found"


def test_real_local_ffmpeg_and_ffprobe_are_available(
    settings: Settings,
    composition: CompositionRoot,
) -> None:
    configured = Settings()
    ffmpeg = configured.ffmpeg_path
    ffprobe = configured.ffprobe_path
    assert ffmpeg.is_file(), "DF_FFMPEG_PATH must point to the real integration runtime"
    assert ffprobe.is_file(), "DF_FFPROBE_PATH must point to the real integration runtime"

    real_settings = settings.model_copy(update={"ffmpeg_path": ffmpeg, "ffprobe_path": ffprobe})
    composition.system_status = SystemStatusAccess(
        composition.database,
        composition.workspace,
        real_settings,
        SystemResourceProbe(),
        TesseractDependencyProbe(
            TesseractRuntimeIdentity(
                real_settings.tesseract_path,
                real_settings.tesseract_model_path,
                real_settings.tesseract_version,
                real_settings.tesseract_runtime_sha256,
                real_settings.tesseract_model_sha256,
            ),
            SystemResourceProbe(),
            timeout_seconds=real_settings.tesseract_timeout_seconds,
        ),
    )
    with TestClient(create_app(real_settings, composition=composition)) as client:
        response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json()["ffmpeg"] == {
        "available": True,
        "critical": False,
        "detail": "available",
    }
