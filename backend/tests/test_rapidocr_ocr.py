from __future__ import annotations

import hashlib
import os
import threading
from collections.abc import Sequence
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw, ImageFont

from backend.app.access.ocr import (
    OcrProcessError,
    RapidOcrDependencyProbe,
    RapidOcrEngine,
    RapidOcrRuntimeIdentity,
)
from backend.app.access.ocr import rapidocr as rapidocr_module
from backend.app.access.ocr.rapidocr import (
    CharacterReader,
    RecognizedCharacter,
    installed_version,
    load_rapidocr_reader,
    locate_onnxruntime_library,
)
from backend.app.access.store.workspace import Workspace
from backend.app.composition import build_composition
from backend.app.config import Settings
from backend.app.main import create_app
from backend.tests.conftest import AvailableResourceProbe

VERSION = "1.0+onnxruntime-1.0"
CROP = Path("runs/test/crop.png")

Line = Sequence[RecognizedCharacter]


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _models_pin(model_dir: Path) -> str:
    manifest = "".join(f"{path.name}:{_sha(path)}\n" for path in sorted(model_dir.glob("*.onnx")))
    return hashlib.sha256(manifest.encode()).hexdigest()


def _identity(tmp_path: Path, **overrides: object) -> RapidOcrRuntimeIdentity:
    models = tmp_path / "tools" / "models"
    models.mkdir(parents=True, exist_ok=True)
    (models / "PP-OCRv6_det_small.onnx").write_bytes(b"fixture detector")
    (models / "PP-OCRv6_rec_small.onnx").write_bytes(b"fixture recognizer")
    runtime = tmp_path / "tools" / "onnxruntime_pybind11_state.pyd"
    runtime.write_bytes(b"fixture runtime")
    values: dict[str, object] = {
        "model_dir": models,
        "runtime_file": runtime,
        "expected_version": VERSION,
        "expected_runtime_sha256": _sha(runtime),
        "expected_models_sha256": _models_pin(models),
        "version_reader": lambda: VERSION,
    }
    values.update(overrides)
    return RapidOcrRuntimeIdentity(**values)  # type: ignore[arg-type]


def _workspace(tmp_path: Path) -> Workspace:
    workspace = Workspace(tmp_path / "workspace", tmp_path / "cache")
    workspace.prepare()
    return workspace


def _crop(workspace: Workspace, width: int = 20, height: int = 10) -> Path:
    target = workspace.resolve_relpath(CROP)
    target.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (width, height), (10, 20, 30)).save(target)
    return CROP


class FakeReader:
    """Stands in for the library: answers what it is told and remembers what it was shown."""

    def __init__(self, lines: Sequence[Line] = ()) -> None:
        self.lines = lines
        self.shapes: list[tuple[int, ...]] = []
        self.on_read: object = None

    def __call__(self, image: object) -> Sequence[Line]:
        self.shapes.append(tuple(getattr(image, "shape", ())))
        if callable(self.on_read):
            self.on_read()
        return self.lines


def _engine(
    tmp_path: Path,
    reader: CharacterReader | None = None,
    *,
    overrides: dict[str, object] | None = None,
) -> tuple[RapidOcrEngine, Workspace, list[int]]:
    workspace = _workspace(tmp_path)
    built: list[int] = []

    def factory(detection: Path, recognition: Path) -> CharacterReader:
        del detection, recognition
        built.append(1)
        return reader if reader is not None else FakeReader()

    return (
        RapidOcrEngine(workspace, _identity(tmp_path, **(overrides or {})), reader_factory=factory),
        workspace,
        built,
    )


def _box(left: float, top: float, right: float, bottom: float) -> list[list[float]]:
    return [[left, top], [right, top], [right, bottom], [left, bottom]]


# --- provenance ---


def test_provenance_names_the_pinned_installation_and_ignores_the_text_layout(
    tmp_path: Path,
) -> None:
    engine, _, _ = _engine(tmp_path)

    described = engine.describe(["0", "1"])

    assert described.engine_id == "rapidocr"
    assert described.engine_version == VERSION
    assert described.runtime_sha256 == _sha(tmp_path / "tools" / "onnxruntime_pybind11_state.pyd")
    assert described.model_sha256 == _models_pin(tmp_path / "tools" / "models")
    assert described.experimental is True
    # The spike's quality gate has only been run on Tesseract; for this engine it is unmeasured.
    assert described.quality_gate == "unknown"
    assert described.page_segmentation_mode == 0
    for layout in ("auto", "line", "word", "block", "sparse"):
        assert engine.describe(["0", "1"], layout) == described


def test_the_configuration_hash_follows_the_allowed_characters(tmp_path: Path) -> None:
    engine, _, _ = _engine(tmp_path)

    assert engine.describe(["0", "1"]).config_hash == engine.describe(["1", "0"]).config_hash
    assert engine.describe(["0", "1"]).config_hash != engine.describe(["0"]).config_hash


def test_a_layout_nobody_defined_is_refused(tmp_path: Path) -> None:
    engine, workspace, _ = _engine(tmp_path)

    with pytest.raises(ValueError, match="unsupported text layout"):
        engine.describe(["0"], "columns")
    with pytest.raises(ValueError, match="unsupported text layout"):
        engine.detect_characters(_crop(workspace), ["0"], "columns")


# --- the pinned installation ---


def test_the_installation_is_measured_before_anything_is_described(tmp_path: Path) -> None:
    engine, _, _ = _engine(tmp_path)
    (tmp_path / "tools" / "models" / "PP-OCRv6_rec_small.onnx").write_bytes(b"tampered")

    with pytest.raises(OcrProcessError) as error:
        engine.describe(["0"])

    assert error.value.code == "ocr_provenance_mismatch"


@pytest.mark.parametrize(
    ("overrides", "code"),
    [
        ({"version_reader": lambda: "9.9+onnxruntime-9.9"}, "ocr_provenance_mismatch"),
        ({"expected_runtime_sha256": "f" * 64}, "ocr_provenance_mismatch"),
        ({"expected_models_sha256": "f" * 64}, "ocr_provenance_mismatch"),
        ({"expected_models_sha256": "not-a-hash"}, "ocr_provenance_unknown"),
        ({"expected_version": " "}, "ocr_provenance_unknown"),
    ],
)
def test_anything_that_is_not_what_was_pinned_is_refused(
    tmp_path: Path, overrides: dict[str, object], code: str
) -> None:
    engine, _, _ = _engine(tmp_path, overrides=overrides)

    with pytest.raises(OcrProcessError) as error:
        engine.describe(["0"])

    assert error.value.code == code


def test_a_missing_file_is_an_unknown_provenance_not_a_crash(tmp_path: Path) -> None:
    engine, _, _ = _engine(tmp_path)
    (tmp_path / "tools" / "models" / "PP-OCRv6_det_small.onnx").unlink()

    with pytest.raises(OcrProcessError) as error:
        engine.describe(["0"])

    assert error.value.code == "ocr_provenance_unknown"


def test_the_files_are_hashed_again_only_when_one_of_them_changed(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    engine, _, _ = _engine(tmp_path)
    hashed: list[Path] = []
    original = rapidocr_module._file_sha256

    def counting(path: Path) -> str:
        hashed.append(path)
        return original(path)

    monkeypatch.setattr(rapidocr_module, "_file_sha256", counting)

    engine.describe(["0"])
    engine.describe(["0", "1"])
    after_two_calls = len(hashed)
    runtime = tmp_path / "tools" / "onnxruntime_pybind11_state.pyd"
    stat = runtime.stat()
    os.utime(runtime, ns=(stat.st_atime_ns, stat.st_mtime_ns + 10_000_000_000))
    engine.describe(["0"])

    assert after_two_calls == 3  # the runtime and the two models, once
    assert len(hashed) == 6  # a touched file means measure everything again


# --- reading ---


def test_the_crop_is_enlarged_and_framed_and_every_box_is_mapped_back(tmp_path: Path) -> None:
    # Crop 20 x 10 becomes 60 x 30, framed by 40 on every side: 140 x 110.
    reader = FakeReader([[("7", 0.93, _box(52, 46, 64, 61))]])
    engine, workspace, _ = _engine(tmp_path, reader)

    candidates = engine.detect_characters(_crop(workspace), ["7"])

    assert reader.shapes == [(110, 140, 3)]
    assert len(candidates) == 1
    assert (candidates[0].char, candidates[0].confidence) == ("7", 0.93)
    # (52 - 40) / 3 = 4 and (46 - 40) / 3 = 2; 64 and 61 map to 8 and 7.
    assert (candidates[0].bbox_local.x, candidates[0].bbox_local.y) == (4, 2)
    assert (candidates[0].bbox_local.width, candidates[0].bbox_local.height) == (4, 5)
    assert candidates[0].provenance == engine.describe(["7"])


def test_characters_the_region_may_not_contain_are_dropped(tmp_path: Path) -> None:
    reader = FakeReader(
        [
            [
                ("1", 0.99, _box(52, 46, 64, 61)),
                ("弄", 0.4, _box(70, 46, 82, 61)),
                ("a", 0.8, _box(88, 46, 100, 61)),
                (" ", 0.9, _box(106, 46, 112, 61)),
                ("/", 0.97, _box(118, 46, 130, 61)),
            ]
        ]
    )
    engine, workspace, _ = _engine(tmp_path, reader)

    candidates = engine.detect_characters(_crop(workspace, 60, 40), ["1", "/", "0"])

    assert [candidate.char for candidate in candidates] == ["1", "/"]


def test_lines_come_back_in_the_order_the_engine_found_them(tmp_path: Path) -> None:
    reader = FakeReader(
        [
            [("1", 0.9, _box(52, 46, 64, 61)), ("4", 0.9, _box(70, 46, 82, 61))],
            [("9", 0.9, _box(52, 70, 64, 85)), ("0", 0.9, _box(70, 70, 82, 85))],
        ]
    )
    engine, workspace, _ = _engine(tmp_path, reader)

    candidates = engine.detect_characters(_crop(workspace, 60, 40), list("0123456789"))

    assert "".join(candidate.char for candidate in candidates) == "1490"


def test_a_box_that_leaves_the_crop_by_rounding_is_pulled_back_and_an_empty_one_is_dropped(
    tmp_path: Path,
) -> None:
    reader = FakeReader(
        [
            [
                # Starts 4 scaled pixels before the crop and runs 1 past its right edge.
                ("1", 0.9, _box(36, 46, 101, 61)),
                # Entirely right of the crop: nothing is left of it once clamped.
                ("4", 0.9, _box(120, 46, 130, 61)),
                # Confidence beyond the range the contract allows is clipped.
                ("8", 1.7, _box(52, 46, 64, 61)),
            ]
        ]
    )
    engine, workspace, _ = _engine(tmp_path, reader)

    candidates = engine.detect_characters(_crop(workspace), list("0123456789"))

    assert [candidate.char for candidate in candidates] == ["1", "8"]
    first = candidates[0].bbox_local
    assert (first.x, first.width) == (0, 20)
    assert candidates[1].confidence == 1.0


def test_a_region_that_may_contain_nothing_is_not_read(tmp_path: Path) -> None:
    engine, workspace, built = _engine(tmp_path)

    assert engine.detect_characters(_crop(workspace), ()) == ()
    assert built == []


def test_the_library_is_loaded_once_and_not_before_the_first_read(tmp_path: Path) -> None:
    reader = FakeReader([[("7", 0.9, _box(52, 46, 64, 61))]])
    engine, workspace, built = _engine(tmp_path, reader)
    crop = _crop(workspace)

    engine.describe(["7"])
    assert built == []
    engine.detect_characters(crop, ["7"])
    engine.detect_characters(crop, ["7"])

    assert built == [1]


# --- failures are controlled ---


def test_inputs_that_cannot_be_read_are_named(tmp_path: Path) -> None:
    engine, workspace, _ = _engine(tmp_path)
    broken = workspace.resolve_relpath(Path("runs/test/broken.png"))
    broken.parent.mkdir(parents=True, exist_ok=True)
    broken.write_bytes(b"not an image")

    for relpath, code in (
        (Path("runs/test/absent.png"), "ocr_input_missing"),
        (Path("runs/test/broken.png"), "ocr_input_invalid"),
        (Path("../outside.png"), "ocr_artifact_path_invalid"),
    ):
        with pytest.raises(OcrProcessError) as error:
            engine.detect_characters(relpath, ["0"])
        assert error.value.code == code


def test_a_failing_library_is_a_controlled_error(tmp_path: Path) -> None:
    class Failing:
        def __call__(self, image: object) -> Sequence[Line]:
            del image
            raise RuntimeError("onnx exploded")

    engine, workspace, _ = _engine(tmp_path, Failing())

    with pytest.raises(OcrProcessError) as error:
        engine.detect_characters(_crop(workspace), ["0"])

    assert error.value.code == "ocr_process_failed"


def test_a_library_that_cannot_start_is_unavailable_not_a_traceback(tmp_path: Path) -> None:
    workspace = _workspace(tmp_path)

    def broken(detection: Path, recognition: Path) -> CharacterReader:
        del detection, recognition
        raise RuntimeError("cannot create the session")

    engine = RapidOcrEngine(workspace, _identity(tmp_path), reader_factory=broken)

    with pytest.raises(OcrProcessError) as error:
        engine.detect_characters(_crop(workspace), ["0"])

    assert error.value.code == "ocr_unavailable"


def test_a_read_that_is_cancelled_midway_is_discarded(tmp_path: Path) -> None:
    reader = FakeReader([[("7", 0.9, _box(52, 46, 64, 61))]])
    engine, workspace, _ = _engine(tmp_path, reader)
    crop = _crop(workspace)
    reader.on_read = engine.cancel_current

    with pytest.raises(OcrProcessError) as error:
        engine.detect_characters(crop, ["7"])
    assert error.value.code == "ocr_cancelled"

    # The cancel belonged to that read; the next one is untouched.
    reader.on_read = None
    assert len(engine.detect_characters(crop, ["7"])) == 1


def test_cancelling_while_idle_changes_nothing(tmp_path: Path) -> None:
    reader = FakeReader([[("7", 0.9, _box(52, 46, 64, 61))]])
    engine, workspace, _ = _engine(tmp_path, reader)

    engine.cancel_current()

    assert len(engine.detect_characters(_crop(workspace), ["7"])) == 1


def test_one_read_at_a_time_cannot_corrupt_the_cancel_flag(tmp_path: Path) -> None:
    reader = FakeReader([[("7", 0.9, _box(52, 46, 64, 61))]])
    engine, workspace, _ = _engine(tmp_path, reader)
    crop = _crop(workspace)
    errors: list[BaseException] = []

    def run() -> None:
        try:
            for _ in range(20):
                engine.detect_characters(crop, ["7"])
        except BaseException as exc:  # pragma: no cover - only on failure
            errors.append(exc)

    threads = [threading.Thread(target=run) for _ in range(3)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert errors == []


# --- the dependency probe ---


def test_the_probe_names_the_engine_and_says_it_needs_no_text_layout(tmp_path: Path) -> None:
    probe = RapidOcrDependencyProbe(_identity(tmp_path))

    result = probe.probe()

    assert (probe.engine_name, probe.uses_text_layout) == ("RapidOCR", False)
    assert (result.available, result.code) == (True, "verified")


@pytest.mark.parametrize(
    ("overrides", "code"),
    [
        ({"expected_models_sha256": "f" * 64}, "checksum_mismatch"),
        ({"version_reader": lambda: "9.9+onnxruntime-9.9"}, "checksum_mismatch"),
        ({"model_dir": Path("does-not-exist")}, "missing_installation"),
    ],
)
def test_the_probe_reports_a_wrong_or_absent_installation_as_unavailable(
    tmp_path: Path, overrides: dict[str, object], code: str
) -> None:
    result = RapidOcrDependencyProbe(_identity(tmp_path, **overrides)).probe()

    assert (result.available, result.code) == (False, code)


# --- selected in the configuration ---


def test_the_configuration_chooses_the_engine_and_health_names_it(
    settings: Settings, migrated_database_template: Path, tmp_path: Path
) -> None:
    models = tmp_path / "rapidocr-models"
    models.mkdir()
    (models / "PP-OCRv6_det_small.onnx").write_bytes(b"fixture detector")
    (models / "PP-OCRv6_rec_small.onnx").write_bytes(b"fixture recognizer")
    chosen = settings.model_copy(
        update={
            "ocr_engine": "rapidocr",
            "rapidocr_model_dir": models,
            "rapidocr_version": installed_version(),
            "rapidocr_runtime_sha256": _sha(locate_onnxruntime_library()),
            "rapidocr_models_sha256": _models_pin(models),
        }
    )
    chosen.workspace_dir.mkdir(parents=True)
    (chosen.workspace_dir / "project.db").write_bytes(migrated_database_template.read_bytes())
    composition = build_composition(chosen, resource_probe=AvailableResourceProbe())
    try:
        assert isinstance(composition.ocr_engine, RapidOcrEngine)
        with TestClient(create_app(chosen, composition=composition)) as client:
            body = client.get("/api/v1/health").json()
    finally:
        composition.close()

    assert body["ocr"]["engine"] == "RapidOCR"
    assert body["ocr"]["uses_text_layout"] is False
    assert (body["ocr"]["available"], body["ocr"]["code"]) == (True, "verified")


def test_tesseract_stays_the_default_and_asks_for_the_text_layout(
    settings: Settings, composition: object
) -> None:
    assert settings.ocr_engine == "tesseract"
    with TestClient(create_app(settings, composition=composition)) as client:  # type: ignore[arg-type]
        body = client.get("/api/v1/health").json()

    assert body["ocr"]["engine"] == "Tesseract"
    assert body["ocr"]["uses_text_layout"] is True


# --- the real library ---


def _real_install_or_skip() -> RapidOcrRuntimeIdentity:
    defaults = Settings()
    identity = RapidOcrRuntimeIdentity(
        model_dir=defaults.rapidocr_model_dir,
        runtime_file=locate_onnxruntime_library(),
        expected_version=defaults.rapidocr_version,
        expected_runtime_sha256=defaults.rapidocr_runtime_sha256,
        expected_models_sha256=defaults.rapidocr_models_sha256,
    )
    try:
        identity.verified()
    except OcrProcessError as error:
        pytest.skip(f"the pinned RapidOCR installation is not present: {error.code}")
    return identity


def test_the_real_engine_reads_two_lines_of_hud_digits(tmp_path: Path) -> None:
    identity = _real_install_or_skip()
    font_path = Path("C:/Windows/Fonts/consolab.ttf")
    if not font_path.is_file():
        pytest.skip("Consolas Bold is not installed")
    workspace = _workspace(tmp_path)
    crop = workspace.resolve_relpath(CROP)
    crop.parent.mkdir(parents=True, exist_ok=True)
    picture = Image.new("RGB", (246, 195), (20, 24, 22))
    draw = ImageDraw.Draw(picture)
    font = ImageFont.truetype(str(font_path), 44)
    draw.text((20, 14), "148/100", font=font, fill=(240, 240, 240))
    draw.text((20, 100), "90/100", font=font, fill=(240, 240, 240))
    picture.save(crop)
    engine = RapidOcrEngine(workspace, identity)

    candidates = engine.detect_characters(CROP, list("-/0123456789"))

    assert "".join(candidate.char for candidate in candidates) == "148/10090/100"
    assert all(0 <= candidate.confidence <= 1 for candidate in candidates)
    assert all(
        candidate.bbox_local.x >= 0
        and candidate.bbox_local.x + candidate.bbox_local.width <= 246
        and candidate.bbox_local.y + candidate.bbox_local.height <= 195
        for candidate in candidates
    )
    assert all(
        candidate.provenance == engine.describe(list("-/0123456789")) for candidate in candidates
    )


def test_the_real_engine_finds_nothing_in_a_crop_with_no_text(tmp_path: Path) -> None:
    """The library answers an empty crop with an empty item, which once broke the parser."""
    identity = _real_install_or_skip()
    workspace = _workspace(tmp_path)
    crop = workspace.resolve_relpath(CROP)
    crop.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (131, 70), (32, 36, 40)).save(crop)
    engine = RapidOcrEngine(workspace, identity)

    assert engine.detect_characters(CROP, list("-/0123456789")) == ()


def test_the_real_loader_needs_no_network_and_reads_from_the_pinned_files() -> None:
    identity = _real_install_or_skip()

    reader = load_rapidocr_reader(identity.detection_model, identity.recognition_model)

    assert callable(reader)
