"""RapidOCR: a neural text detector and recognizer behind the `OcrEngine` contract.

Unlike Tesseract it finds the text on its own, so it needs no hint about how the
text sits in a region; the operator's text layout is accepted and ignored. What it
shares with every adapter is the contract: characters, boxes in the crop,
confidence, and provenance that pins the exact runtime and weights.

Two things are specific to this engine and live only here:

- a crop is enlarged three times and framed in black before it is read. The
  detector is trained on pages of text, and a 131 by 70 pixel HUD score on a coloured
  plate is below the size it finds reliably; enlarged and framed it is read as
  well as the larger regions (measured on one real run);
- the library is imported only when the engine runs, so an installation that
  uses another engine never loads it.
"""

from __future__ import annotations

import hashlib
import importlib.metadata
import importlib.util
import math
import threading
from collections.abc import Callable, Collection, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any, Final, Literal

from PIL import Image, UnidentifiedImageError

from backend.app.access.ocr.protocol import OcrProcessError
from backend.app.access.store.workspace import Workspace, WorkspaceError
from backend.app.engines.definition import OCR_TEXT_LAYOUTS, BBox
from backend.app.engines.definition.ocr_mapping import OcrCandidate, OcrProvenance

if TYPE_CHECKING:
    import numpy

# One recognized character: the character, its confidence, and the four corners of its box.
RecognizedCharacter = tuple[str, float, Sequence[Sequence[float]]]
# A reader answers, per text line found in the image, the characters of that line.
CharacterReader = Callable[["numpy.ndarray"], Sequence[Sequence[RecognizedCharacter]]]
ReaderFactory = Callable[[Path, Path], CharacterReader]

DETECTION_MODEL: Final = "PP-OCRv6_det_small.onnx"
RECOGNITION_MODEL: Final = "PP-OCRv6_rec_small.onnx"

# A crop is read at this scale, inside a frame of this many (scaled) pixels.
UPSCALE: Final = 3
PADDING: Final = 40


def installed_version() -> str:
    """What is installed, as `rapidocr` and the `onnxruntime` it runs on report it."""
    try:
        rapidocr = importlib.metadata.version("rapidocr")
        onnxruntime = importlib.metadata.version("onnxruntime")
    except importlib.metadata.PackageNotFoundError as exc:
        raise OcrProcessError("ocr_provenance_unknown") from exc
    return f"{rapidocr}+onnxruntime-{onnxruntime}"


def locate_onnxruntime_library() -> Path:
    """The native library the models run on, the part a SHA-256 can pin."""
    spec = importlib.util.find_spec("onnxruntime")
    if spec is None or not spec.submodule_search_locations:
        return Path("onnxruntime-not-installed")
    capi = Path(next(iter(spec.submodule_search_locations))) / "capi"
    candidates = sorted(capi.glob("onnxruntime_pybind11_state*"))
    return candidates[0] if candidates else capi / "onnxruntime_pybind11_state"


def _file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    try:
        with path.open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
    except OSError as exc:
        raise OcrProcessError("ocr_provenance_unknown") from exc
    return digest.hexdigest()


def _normalize_pin(value: str) -> str | None:
    normalized = value.strip().lower()
    if len(normalized) != 64 or any(char not in "0123456789abcdef" for char in normalized):
        return None
    return normalized


@dataclass(frozen=True)
class VerifiedRapidOcr:
    """The measured hashes of what is installed, after they matched their pins."""

    runtime_sha256: str
    models_sha256: str


@dataclass(frozen=True)
class RapidOcrRuntimeIdentity:
    """The pinned installation: its library version, its native runtime and its weights.

    `expected_models_sha256` pins the two ONNX files together: the SHA-256 of the
    text `<file name>:<file SHA-256>` for each file, sorted by name, one per line.
    """

    model_dir: Path
    runtime_file: Path
    expected_version: str
    expected_runtime_sha256: str
    expected_models_sha256: str
    version_reader: Callable[[], str] = installed_version
    experimental: bool = True
    # Not measured: the quality gate of `docs/OCR_SPIKE.md` has only been run on Tesseract.
    quality_gate: Literal["passed", "failed", "unknown"] = "unknown"

    @property
    def detection_model(self) -> Path:
        return self.model_dir / DETECTION_MODEL

    @property
    def recognition_model(self) -> Path:
        return self.model_dir / RECOGNITION_MODEL

    def files(self) -> tuple[Path, ...]:
        return (self.runtime_file, self.detection_model, self.recognition_model)

    def verified(self) -> VerifiedRapidOcr:
        """Measure what is installed and refuse anything that is not what was pinned."""
        runtime_pin = _normalize_pin(self.expected_runtime_sha256)
        models_pin = _normalize_pin(self.expected_models_sha256)
        if runtime_pin is None or models_pin is None or not self.expected_version.strip():
            raise OcrProcessError("ocr_provenance_unknown")
        for path in self.files():
            if not path.is_file():
                raise OcrProcessError("ocr_provenance_unknown")
        if self.version_reader() != self.expected_version:
            raise OcrProcessError("ocr_provenance_mismatch")
        runtime_hash = _file_sha256(self.runtime_file)
        manifest = "".join(
            f"{path.name}:{_file_sha256(path)}\n"
            for path in sorted((self.detection_model, self.recognition_model))
        )
        models_hash = hashlib.sha256(manifest.encode("utf-8")).hexdigest()
        if runtime_hash != runtime_pin or models_hash != models_pin:
            raise OcrProcessError("ocr_provenance_mismatch")
        return VerifiedRapidOcr(runtime_sha256=runtime_hash, models_sha256=models_hash)

    def signature(self) -> tuple[tuple[str, int, int], ...]:
        """Size and modification time of every pinned file; a change means measure again."""
        parts: list[tuple[str, int, int]] = []
        for path in self.files():
            try:
                stat = path.stat()
            except OSError:
                parts.append((str(path), -1, -1))
            else:
                parts.append((str(path), stat.st_size, stat.st_mtime_ns))
        return tuple(parts)


def load_rapidocr_reader(detection_model: Path, recognition_model: Path) -> CharacterReader:
    """The real reader. The library is imported here, the first time the engine runs."""
    try:
        from rapidocr import RapidOCR
    except ImportError as exc:
        raise OcrProcessError("ocr_unavailable") from exc

    engine = RapidOCR(
        params={
            # HUD text is upright: skipping the rotation classifier saves a model and a step.
            "Global.use_cls": False,
            "Global.log_level": "warning",
            # Explicit files, so nothing is ever downloaded and the pins describe what runs.
            "Det.model_path": str(detection_model),
            "Rec.model_path": str(recognition_model),
        }
    )

    def read(image: numpy.ndarray) -> Sequence[Sequence[RecognizedCharacter]]:
        # The library's own types are loose; what it returns is untrusted input, parsed here.
        result: Any = engine(image, return_word_box=True, return_single_char_box=True)
        if not result.txts:
            # Nothing found: the library does not answer "no lines", it answers a single
            # placeholder line, `('', 1.0, None)`, and `txts` is None.
            return []
        return [
            [
                (str(char), float(score), [[float(x), float(y)] for x, y in box])
                for char, score, box in line
            ]
            for line in result.word_results
        ]

    return read


class RapidOcrEngine:
    """Experimental neural adapter with pinned runtime and model provenance."""

    def __init__(
        self,
        workspace: Workspace,
        runtime: RapidOcrRuntimeIdentity,
        *,
        reader_factory: ReaderFactory = load_rapidocr_reader,
    ) -> None:
        self._workspace = workspace
        self._runtime = runtime
        self._reader_factory = reader_factory
        self._reader: CharacterReader | None = None
        self._verified_for: tuple[tuple[str, int, int], ...] | None = None
        self._verified: VerifiedRapidOcr | None = None
        self._lock = threading.Lock()
        self._reading = False
        self._cancelled = False

    # --- the OcrEngine contract ---

    def describe(
        self,
        allowed_chars: Collection[str],
        text_layout: str | None = None,
    ) -> OcrProvenance:
        self._require_known_layout(text_layout)
        allowed = self._normalize_allowed_chars(allowed_chars)
        return self._provenance(allowed, self._measure())

    def detect_characters(
        self,
        crop_relpath: Path,
        allowed_chars: Collection[str],
        text_layout: str | None = None,
    ) -> tuple[OcrCandidate, ...]:
        self._require_known_layout(text_layout)
        crop = self._resolve_crop(crop_relpath)
        allowed = self._normalize_allowed_chars(allowed_chars)
        if not allowed:
            return ()
        provenance = self._provenance(allowed, self._measure())
        image = self._open(crop)
        reader = self._load_reader()
        prepared = self._prepare(image)
        lines = self._read(reader, prepared)
        return self._candidates(lines, image.width, image.height, frozenset(allowed), provenance)

    def cancel_current(self) -> None:
        """Ask the read in flight to be discarded; the library cannot be interrupted."""
        with self._lock:
            if self._reading:
                self._cancelled = True

    # --- measuring and provenance ---

    def _measure(self) -> VerifiedRapidOcr:
        """Hash the installation again only when one of its files changed."""
        signature = self._runtime.signature()
        with self._lock:
            if self._verified is not None and self._verified_for == signature:
                return self._verified
        verified = self._runtime.verified()
        with self._lock:
            self._verified, self._verified_for = verified, signature
        return verified

    def _provenance(self, allowed: tuple[str, ...], verified: VerifiedRapidOcr) -> OcrProvenance:
        return OcrProvenance(
            engine_id="rapidocr",
            engine_version=self._runtime.expected_version,
            runtime_sha256=verified.runtime_sha256,
            model_sha256=verified.models_sha256,
            config_hash=self._config_hash("".join(allowed), verified),
            experimental=self._runtime.experimental,
            quality_gate=self._runtime.quality_gate,
            language="multi",
            # A page segmentation mode is Tesseract's notion; this engine has none.
            page_segmentation_mode=0,
        )

    @staticmethod
    def _config_hash(whitelist: str, verified: VerifiedRapidOcr) -> str:
        payload = (
            f"engine=rapidocr;models={verified.models_sha256};upscale={UPSCALE};"
            f"padding={PADDING};classifier=off;single_char_boxes=on;whitelist={whitelist}"
        )
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    # --- reading ---

    def _load_reader(self) -> CharacterReader:
        with self._lock:
            reader = self._reader
        if reader is not None:
            return reader
        try:
            reader = self._reader_factory(
                self._runtime.detection_model, self._runtime.recognition_model
            )
        except OcrProcessError:
            raise
        except Exception as exc:
            raise OcrProcessError("ocr_unavailable") from exc
        with self._lock:
            self._reader = reader
        return reader

    @staticmethod
    def _prepare(image: Image.Image) -> numpy.ndarray:
        import numpy

        enlarged = image.convert("RGB").resize(
            (image.width * UPSCALE, image.height * UPSCALE), Image.Resampling.LANCZOS
        )
        framed = Image.new(
            "RGB", (enlarged.width + 2 * PADDING, enlarged.height + 2 * PADDING), (0, 0, 0)
        )
        framed.paste(enlarged, (PADDING, PADDING))
        return numpy.asarray(framed)

    def _read(
        self, reader: CharacterReader, prepared: numpy.ndarray
    ) -> Sequence[Sequence[RecognizedCharacter]]:
        with self._lock:
            self._reading, self._cancelled = True, False
        try:
            lines = reader(prepared)
        except Exception as exc:
            raise OcrProcessError("ocr_process_failed") from exc
        finally:
            with self._lock:
                self._reading = False
                cancelled, self._cancelled = self._cancelled, False
        if cancelled:
            raise OcrProcessError("ocr_cancelled")
        return lines

    @staticmethod
    def _candidates(
        lines: Sequence[Sequence[RecognizedCharacter]],
        width: int,
        height: int,
        allowed: frozenset[str],
        provenance: OcrProvenance,
    ) -> tuple[OcrCandidate, ...]:
        """Map each character back into the crop and drop what the region may not contain.

        The engine knows no whitelist, so the allowed characters are applied here, after
        recognition: a character outside them is not an annotation the region can take.
        A box that leaves the crop by a pixel of rounding is pulled back in; one with no
        area left is dropped.
        """
        candidates: list[OcrCandidate] = []
        for line in lines:
            for char, score, corners in line:
                if char not in allowed or not corners:
                    continue
                xs = [corner[0] for corner in corners]
                ys = [corner[1] for corner in corners]
                left = max(0, math.floor((min(xs) - PADDING) / UPSCALE))
                top = max(0, math.floor((min(ys) - PADDING) / UPSCALE))
                right = min(width, math.ceil((max(xs) - PADDING) / UPSCALE))
                bottom = min(height, math.ceil((max(ys) - PADDING) / UPSCALE))
                if right <= left or bottom <= top:
                    continue
                candidates.append(
                    OcrCandidate(
                        char=char,
                        bbox_local=BBox(left, top, right - left, bottom - top),
                        confidence=min(1.0, max(0.0, score)),
                        provenance=provenance,
                    )
                )
        return tuple(candidates)

    # --- inputs ---

    def _resolve_crop(self, crop_relpath: Path) -> Path:
        try:
            return self._workspace.resolve_relpath(crop_relpath)
        except WorkspaceError as exc:
            raise OcrProcessError("ocr_artifact_path_invalid") from exc

    @staticmethod
    def _open(crop: Path) -> Image.Image:
        if not crop.is_file():
            raise OcrProcessError("ocr_input_missing")
        try:
            with Image.open(crop) as source:
                source.load()
                image = source.copy()
        except (OSError, ValueError, UnidentifiedImageError) as exc:
            raise OcrProcessError("ocr_input_invalid") from exc
        if image.width <= 0 or image.height <= 0:
            raise OcrProcessError("ocr_input_invalid")
        return image

    @staticmethod
    def _require_known_layout(text_layout: str | None) -> None:
        # Ignored by this engine, but a layout nobody defined is still a mistake worth naming.
        if text_layout is not None and text_layout not in OCR_TEXT_LAYOUTS:
            raise ValueError("unsupported text layout")

    @staticmethod
    def _normalize_allowed_chars(allowed_chars: Collection[str]) -> tuple[str, ...]:
        normalized: set[str] = set()
        for char in allowed_chars:
            if len(char) != 1 or char in {"\x00", "\r", "\n"}:
                raise ValueError("allowed_chars must contain single printable characters")
            normalized.add(char)
        return tuple(sorted(normalized))
