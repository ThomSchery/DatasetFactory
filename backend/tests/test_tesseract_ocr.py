from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import threading
import time
from pathlib import Path

import pytest

from backend.app.access.ocr import (
    OcrProcessError,
    OcrProcessResult,
    TesseractOcrEngine,
    TesseractOutputParser,
    TesseractProcessRunner,
    TesseractRuntimeIdentity,
)
from backend.app.access.store.workspace import Workspace
from backend.app.engines.definition import OcrProvenance

FIXTURES = Path("backend/tests/fixtures")
EXPECTED = json.loads((FIXTURES / "expected-ocr/synthetic-hud.json").read_text(encoding="utf-8"))
REAL_RUNTIME_SHA256 = "c66f0f12ed76f6aa455dac97684bbc86756d6a732380bee09122454cfda3f420"
REAL_MODEL_SHA256 = "7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2"


def _provenance(version: str) -> OcrProvenance:
    return OcrProvenance(
        "tesseract",
        version,
        "a" * 64,
        "b" * 64,
        "c" * 64,
        True,
        "failed",
        "eng",
        7,
    )


def _hocr(characters: str, *, version: str = "5.5.3") -> str:
    spans = "".join(
        f"<span class='ocrx_cinfo' title='x_bboxes {10 + i * 20} 40 "
        f"{20 + i * 20} 80; x_conf {87.5 + i}'>{char}</span>"
        for i, char in enumerate(characters)
    )
    return (
        f"<html><head><meta name='ocr-system' content='tesseract {version}'/></head>"
        f"<body>{spans}</body></html>"
    )


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _workspace(tmp_path: Path) -> Workspace:
    workspace = Workspace(tmp_path / "workspace", tmp_path / "cache")
    workspace.prepare()
    return workspace


def _fake_runtime(tmp_path: Path, **overrides: object) -> TesseractRuntimeIdentity:
    executable = tmp_path / "tools" / "tesseract.exe"
    model = tmp_path / "tools" / "tessdata" / "eng.traineddata"
    executable.parent.mkdir(parents=True, exist_ok=True)
    model.parent.mkdir(parents=True, exist_ok=True)
    executable.write_bytes(b"pinned fake runtime")
    model.write_bytes(b"pinned fake model")
    values: dict[str, object] = {
        "executable": executable,
        "model": model,
        "expected_version": "5.5.3",
        "expected_runtime_sha256": _sha256(executable),
        "expected_model_sha256": _sha256(model),
    }
    values.update(overrides)
    return TesseractRuntimeIdentity(**values)  # type: ignore[arg-type]


def _copy_crop(workspace: Workspace, sample_index: int = 0) -> Path:
    source = FIXTURES / EXPECTED["samples"][sample_index]["crop"]
    relpath = Path("runs/test/crop.png")
    target = workspace.resolve_relpath(relpath)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(source.read_bytes())
    return relpath


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


def test_parser_converts_bottom_left_boxes_and_keeps_unicode_confidence() -> None:
    candidates = TesseractOutputParser().parse(
        "A 10 20 20 60 0\né 30 20 40 60 0\n",
        _hocr("Aé"),
        crop_width=100,
        crop_height=100,
        allowed_chars=frozenset({"A", "é"}),
        provenance_factory=_provenance,
    )

    assert [candidate.char for candidate in candidates] == ["A", "é"]
    assert candidates[0].bbox_local.x == 10
    assert candidates[0].bbox_local.y == 40
    assert candidates[0].bbox_local.width == 10
    assert candidates[0].bbox_local.height == 40
    assert candidates[0].confidence == pytest.approx(0.875)
    assert candidates[1].provenance.engine_version == "5.5.3"


def test_parser_rejects_malformed_out_of_bounds_unlisted_and_invalid_confidence() -> None:
    hocr = (
        "<meta name='ocr-system' content='tesseract 5.5.3'/>"
        "<span class='ocrx_cinfo' title='x_bboxes 10 40 20 80; x_conf 90'>A</span>"
        "<span class='ocrx_cinfo' title='x_bboxes 30 40 40 80; x_conf 140'>B</span>"
        "<span class='ocrx_cinfo' title='malformed'>C</span>"
    )
    candidates = TesseractOutputParser().parse(
        "malformed\nA 10 20 20 60 0\nB 30 20 40 60 0\nC 95 20 110 60 0\nD 50 20 60 60 0\n",
        hocr,
        crop_width=100,
        crop_height=100,
        allowed_chars=frozenset({"A", "B", "C"}),
        provenance_factory=_provenance,
    )

    assert [candidate.char for candidate in candidates] == ["A"]


def test_parser_empty_output_is_success_with_known_provenance() -> None:
    assert (
        TesseractOutputParser().parse(
            "",
            "<meta name='ocr-system' content='tesseract 5.5.3'/>",
            crop_width=100,
            crop_height=100,
            allowed_chars=frozenset({"A"}),
            provenance_factory=_provenance,
        )
        == ()
    )


class FixtureWritingRunner:
    def __init__(self, failures: list[OcrProcessError | int] | None = None) -> None:
        self.failures = list(failures or [])
        self.calls = 0

    def run(self, arguments: list[str], *, timeout_seconds: int) -> OcrProcessResult:
        assert timeout_seconds == 30
        self.calls += 1
        if self.failures:
            failure = self.failures.pop(0)
            if isinstance(failure, OcrProcessError):
                raise failure
            return OcrProcessResult(failure, "", "failure")
        output_base = Path(arguments[2])
        output_base.with_suffix(".box").write_text("A 10 16 20 56 0\n", encoding="utf-8")
        output_base.with_suffix(".hocr").write_text(_hocr("A"), encoding="utf-8")
        return OcrProcessResult(0, "", "")


@pytest.mark.parametrize(
    "failure",
    [OcrProcessError("ocr_timeout", retryable=True), -9, 0xC0000005],
)
def test_timeout_and_proven_abnormal_termination_retry_exactly_once(
    failure: OcrProcessError | int,
    tmp_path: Path,
) -> None:
    workspace = _workspace(tmp_path)
    crop_relpath = _copy_crop(workspace)
    runner = FixtureWritingRunner([failure])
    sleeps: list[float] = []
    engine = TesseractOcrEngine(
        workspace,
        _fake_runtime(tmp_path),
        30,
        runner,
        sleeper=sleeps.append,
    )

    candidates = engine.detect_characters(crop_relpath, ["A"])

    assert [candidate.char for candidate in candidates] == ["A"]
    assert runner.calls == 2
    assert sleeps == [1.0]
    assert not tuple(workspace.resolve_relpath("runs/test").glob(".ocr-*"))


def test_describe_measures_the_runtime_instead_of_trusting_the_pins(tmp_path: Path) -> None:
    """F10: provenance stored at run creation must be verified, not merely declared."""
    workspace = _workspace(tmp_path)
    runtime = _fake_runtime(tmp_path)
    engine = TesseractOcrEngine(workspace, runtime, 30, FixtureWritingRunner([]))

    described = engine.describe(["A"])
    assert described.runtime_sha256 == _sha256(runtime.executable)
    assert described.model_sha256 == _sha256(runtime.model)

    runtime.executable.write_bytes(b"swapped runtime binary")
    with pytest.raises(OcrProcessError) as error:
        engine.describe(["A"])
    assert error.value.code == "ocr_provenance_mismatch"

    runtime.executable.write_bytes(b"pinned fake runtime")
    runtime.model.write_bytes(b"swapped model")
    with pytest.raises(OcrProcessError) as swapped_model:
        engine.describe(["A"])
    assert swapped_model.value.code == "ocr_provenance_mismatch"


def test_create_measurement_and_pre_ocr_verification_hash_each_file_once(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Final review 3: retain true hashes without an extra per-frame describe pass."""
    workspace = _workspace(tmp_path)
    crop_relpath = _copy_crop(workspace)
    runtime = _fake_runtime(tmp_path)
    hashed_paths: list[Path] = []

    def measured_sha256(path: Path) -> str:
        hashed_paths.append(path)
        return _sha256(path)

    monkeypatch.setattr(
        TesseractRuntimeIdentity,
        "_file_sha256",
        staticmethod(measured_sha256),
    )
    engine = TesseractOcrEngine(workspace, runtime, 30, FixtureWritingRunner([]))

    described = engine.describe(["A"])
    candidates = engine.detect_characters(crop_relpath, ["A"])

    assert described.runtime_sha256 == _sha256(runtime.executable)
    assert described.model_sha256 == _sha256(runtime.model)
    assert candidates and candidates[0].provenance == described
    assert hashed_paths == [
        runtime.executable,
        runtime.model,
        runtime.executable,
        runtime.model,
    ]


def test_ordinary_nonzero_exit_is_stable_and_not_retried(tmp_path: Path) -> None:
    workspace = _workspace(tmp_path)
    crop_relpath = _copy_crop(workspace)
    runner = FixtureWritingRunner([2])
    engine = TesseractOcrEngine(workspace, _fake_runtime(tmp_path), 30, runner)

    with pytest.raises(OcrProcessError) as error:
        engine.detect_characters(crop_relpath, ["A"])

    assert error.value.code == "ocr_process_failed"
    assert error.value.retryable is False
    assert runner.calls == 1


def test_unavailable_is_not_retried(tmp_path: Path) -> None:
    workspace = _workspace(tmp_path)
    crop_relpath = _copy_crop(workspace)
    runner = FixtureWritingRunner([OcrProcessError("ocr_unavailable", retryable=True)])
    engine = TesseractOcrEngine(workspace, _fake_runtime(tmp_path), 30, runner)

    with pytest.raises(OcrProcessError) as error:
        engine.detect_characters(crop_relpath, ["A"])

    assert error.value.code == "ocr_unavailable"
    assert runner.calls == 1


@pytest.mark.parametrize("pin_kind", ["unknown", "runtime_mismatch", "model_mismatch"])
def test_unknown_or_mismatched_runtime_identity_is_rejected_before_ocr(
    tmp_path: Path,
    pin_kind: str,
) -> None:
    workspace = _workspace(tmp_path)
    crop_relpath = _copy_crop(workspace)
    runner = FixtureWritingRunner()
    overrides = {
        "unknown": {"expected_runtime_sha256": "unknown"},
        "runtime_mismatch": {"expected_runtime_sha256": "0" * 64},
        "model_mismatch": {"expected_model_sha256": "0" * 64},
    }[pin_kind]
    engine = TesseractOcrEngine(workspace, _fake_runtime(tmp_path, **overrides), 30, runner)

    with pytest.raises(OcrProcessError) as error:
        engine.detect_characters(crop_relpath, ["A"])

    expected_code = "ocr_provenance_unknown" if pin_kind == "unknown" else "ocr_provenance_mismatch"
    assert error.value.code == expected_code
    assert runner.calls == 0
    assert not tuple(workspace.resolve_relpath("runs/test").glob(".ocr-*"))


def test_language_model_mismatch_is_rejected_before_hashing_or_ocr(tmp_path: Path) -> None:
    workspace = _workspace(tmp_path)
    crop_relpath = _copy_crop(workspace)
    runtime = _fake_runtime(tmp_path)
    (runtime.model.parent / "deu.traineddata").write_bytes(b"untrusted unpinned model")
    runner = FixtureWritingRunner()
    engine = TesseractOcrEngine(workspace, runtime, 30, runner, language="deu")

    with pytest.raises(OcrProcessError) as error:
        engine.detect_characters(crop_relpath, ["A"])

    assert error.value.code == "ocr_provenance_mismatch"
    assert runner.calls == 0
    assert not tuple(workspace.resolve_relpath("runs/test").glob(".ocr-*"))


@pytest.mark.parametrize("escape_kind", ["absolute", "symlink"])
def test_crop_path_escape_is_rejected_before_temp_or_subprocess(
    tmp_path: Path,
    escape_kind: str,
) -> None:
    workspace = _workspace(tmp_path)
    outside = tmp_path / "outside"
    outside.mkdir()
    outside_crop = outside / "crop.png"
    outside_crop.write_bytes((FIXTURES / "hud-crops/00-health.png").read_bytes())
    if escape_kind == "absolute":
        crop = outside_crop
    else:
        link = workspace.root / "runs" / "escape"
        _link_directory(link, outside)
        crop = Path("runs/escape/crop.png")
    runner = FixtureWritingRunner()
    engine = TesseractOcrEngine(workspace, _fake_runtime(tmp_path), 30, runner)

    with pytest.raises(OcrProcessError) as error:
        engine.detect_characters(crop, ["A"])

    assert error.value.code == "ocr_artifact_path_invalid"
    assert runner.calls == 0
    assert not tuple(outside.glob(".ocr-*"))


def test_real_process_runner_reports_missing_executable() -> None:
    with pytest.raises(OcrProcessError) as error:
        TesseractProcessRunner().run(
            ["D:/definitely-missing/tesseract.exe", "--version"],
            timeout_seconds=1,
        )

    assert error.value.code == "ocr_unavailable"
    assert error.value.retryable is False


def test_real_process_runner_times_out_and_kills_process_tree() -> None:
    started = time.monotonic()
    with pytest.raises(OcrProcessError) as error:
        TesseractProcessRunner().run(
            [
                sys.executable,
                "-c",
                "import subprocess,sys,time; "
                "subprocess.Popen([sys.executable,'-c','import time; time.sleep(60)']); "
                "time.sleep(60)",
            ],
            timeout_seconds=1,
        )

    assert error.value.code == "ocr_timeout"
    assert error.value.retryable is True
    assert time.monotonic() - started < 10


def test_real_process_runner_cancel_kills_active_process_with_stable_code(
    tmp_path: Path,
) -> None:
    runner = TesseractProcessRunner()
    sentinel = tmp_path / "ocr-runner-started"
    failures: list[OcrProcessError] = []

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
        except OcrProcessError as error:
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
    assert [error.code for error in failures] == ["ocr_cancelled"]


def test_real_tesseract_returns_native_slash_box_and_pinned_provenance(tmp_path: Path) -> None:
    executable = Path("D:/tools/tesseract-5.5.3/tesseract.exe")
    model = Path("D:/tools/tesseract-5.5.3/tessdata/eng.traineddata")
    if not executable.is_file() or not model.is_file():
        pytest.skip("Configured D: Tesseract fixture dependency is not available")
    workspace = _workspace(tmp_path)
    ratio_sample = next(sample for sample in EXPECTED["samples"] if sample["id"] == "ratio")
    crop_relpath = Path("runs/real/ratio.png")
    crop = workspace.resolve_relpath(crop_relpath)
    crop.parent.mkdir(parents=True, exist_ok=True)
    crop.write_bytes((FIXTURES / ratio_sample["crop"]).read_bytes())
    runtime = TesseractRuntimeIdentity(
        executable,
        model,
        "v5.5.3.20260724",
        REAL_RUNTIME_SHA256,
        REAL_MODEL_SHA256,
    )
    engine = TesseractOcrEngine(workspace, runtime, 30, TesseractProcessRunner())

    candidates = engine.detect_characters(crop_relpath, EXPECTED["allowed_chars"])

    slash = next(candidate for candidate in candidates if candidate.char == "/")
    assert slash.bbox_local.width > 0 and slash.bbox_local.height > 0
    assert slash.provenance.engine_id == "tesseract"
    assert slash.provenance.engine_version == "v5.5.3.20260724"
    assert slash.provenance.runtime_sha256 == REAL_RUNTIME_SHA256
    assert slash.provenance.model_sha256 == REAL_MODEL_SHA256
    assert slash.provenance.experimental is True
    assert slash.provenance.quality_gate == "failed"
