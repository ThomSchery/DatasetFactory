from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import signal
import subprocess
import time
from collections import defaultdict, deque
from collections.abc import Callable, Collection
from contextlib import suppress
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path
from typing import Literal, Protocol, cast
from uuid import uuid4

from PIL import Image, UnidentifiedImageError

from backend.app.access.store.workspace import Workspace, WorkspaceError
from backend.app.engines.definition import BBox
from backend.app.engines.definition.ocr_mapping import OcrCandidate, OcrProvenance


class OcrProcessError(RuntimeError):
    """Sanitized OCR infrastructure failure with explicit retry semantics."""

    def __init__(self, code: str, *, retryable: bool = False) -> None:
        super().__init__(code)
        self.code = code
        self.retryable = retryable


@dataclass(frozen=True)
class OcrProcessResult:
    returncode: int
    stdout: str
    stderr: str


class OcrCommandRunner(Protocol):
    def run(self, arguments: list[str], *, timeout_seconds: int) -> OcrProcessResult: ...


class TesseractProcessRunner:
    """Run one bounded Tesseract process and kill its tree on timeout."""

    def __init__(self, *, cleanup_timeout_seconds: int = 2) -> None:
        self._cleanup_timeout_seconds = cleanup_timeout_seconds

    def run(self, arguments: list[str], *, timeout_seconds: int) -> OcrProcessResult:
        creation_flags = subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0
        try:
            process = subprocess.Popen(
                arguments,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                errors="replace",
                creationflags=creation_flags,
                start_new_session=os.name != "nt",
            )
        except OSError as exc:
            raise OcrProcessError("ocr_unavailable") from exc
        try:
            stdout, stderr = process.communicate(timeout=timeout_seconds)
        except subprocess.TimeoutExpired as exc:
            self._terminate_tree(process)
            try:
                process.communicate(timeout=self._cleanup_timeout_seconds)
            except subprocess.TimeoutExpired:
                self._close_pipes(process)
            raise OcrProcessError("ocr_timeout", retryable=True) from exc
        return OcrProcessResult(process.returncode, stdout, stderr)

    @staticmethod
    def _terminate_tree(process: subprocess.Popen[str]) -> None:
        if os.name == "nt":
            with suppress(OSError, subprocess.TimeoutExpired):
                subprocess.run(
                    ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    check=False,
                    timeout=5,
                )
            with suppress(OSError):
                process.kill()
            return
        with suppress(ProcessLookupError):
            kill_process_group = cast(Callable[[int, int], None], os.__dict__["killpg"])
            kill_process_group(process.pid, int(getattr(signal, "SIGKILL", signal.SIGTERM)))

    @staticmethod
    def _close_pipes(process: subprocess.Popen[str]) -> None:
        for stream in (process.stdout, process.stderr):
            if stream is not None:
                with suppress(OSError):
                    stream.close()


@dataclass(frozen=True)
class TesseractRuntimeIdentity:
    """Pinned identity of the dev/spike runtime and its language model."""

    executable: Path
    model: Path
    expected_version: str
    expected_runtime_sha256: str
    expected_model_sha256: str
    experimental: bool = True
    quality_gate: Literal["passed", "failed", "unknown"] = "failed"

    def verified_hashes(self, *, language: str) -> tuple[str, str]:
        if self.model.name != f"{language}.traineddata":
            raise OcrProcessError("ocr_provenance_mismatch")
        runtime_pin = self._normalize_pin(self.expected_runtime_sha256)
        model_pin = self._normalize_pin(self.expected_model_sha256)
        if runtime_pin is None or model_pin is None or not self.expected_version.strip():
            raise OcrProcessError("ocr_provenance_unknown")
        runtime_hash = self._file_sha256(self.executable)
        model_hash = self._file_sha256(self.model)
        if runtime_hash != runtime_pin or model_hash != model_pin:
            raise OcrProcessError("ocr_provenance_mismatch")
        return runtime_hash, model_hash

    def provenance(
        self,
        engine_version: str,
        *,
        runtime_sha256: str,
        model_sha256: str,
        config_hash: str,
        language: str,
        page_segmentation_mode: int,
    ) -> OcrProvenance:
        if engine_version == "unknown" or not engine_version:
            raise OcrProcessError("ocr_provenance_unknown")
        if engine_version != self.expected_version:
            raise OcrProcessError("ocr_provenance_mismatch")
        return OcrProvenance(
            engine_id="tesseract",
            engine_version=engine_version,
            runtime_sha256=runtime_sha256,
            model_sha256=model_sha256,
            config_hash=config_hash,
            experimental=self.experimental,
            quality_gate=self.quality_gate,
            language=language,
            page_segmentation_mode=page_segmentation_mode,
        )

    @staticmethod
    def _normalize_pin(value: str) -> str | None:
        normalized = value.strip().lower()
        if re.fullmatch(r"[0-9a-f]{64}", normalized) is None:
            return None
        return normalized

    @staticmethod
    def _file_sha256(path: Path) -> str:
        digest = hashlib.sha256()
        try:
            with path.open("rb") as stream:
                for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                    digest.update(chunk)
        except OSError as exc:
            raise OcrProcessError("ocr_provenance_unknown") from exc
        return digest.hexdigest()


@dataclass(frozen=True)
class _ParsedCharacter:
    char: str
    bbox: BBox
    confidence: float


class _HocrCharacterParser(HTMLParser):
    _BBOX = re.compile(r"(?:^|;\s*)x_bboxes (-?\d+) (-?\d+) (-?\d+) (-?\d+)")
    _CONFIDENCE = re.compile(r"(?:^|;\s*)x_conf (-?\d+(?:\.\d+)?)")

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.engine_version = "unknown"
        self.characters: list[_ParsedCharacter] = []
        self._active: tuple[BBox, float] | None = None
        self._data: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        if tag == "meta" and attributes.get("name") == "ocr-system":
            content = attributes.get("content") or ""
            self.engine_version = content.removeprefix("tesseract ").strip() or "unknown"
        classes = (attributes.get("class") or "").split()
        if tag != "span" or "ocrx_cinfo" not in classes:
            return
        title = attributes.get("title") or ""
        bbox_match = self._BBOX.search(title)
        confidence_match = self._CONFIDENCE.search(title)
        if bbox_match is None or confidence_match is None:
            self._active = None
            return
        left, top, right, bottom = (int(value) for value in bbox_match.groups())
        self._active = (
            BBox(left, top, right - left, bottom - top),
            float(confidence_match.group(1)),
        )
        self._data = []

    def handle_data(self, data: str) -> None:
        if self._active is not None:
            self._data.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag != "span" or self._active is None:
            return
        char = "".join(self._data)
        bbox, confidence = self._active
        if len(char) == 1:
            self.characters.append(_ParsedCharacter(char, bbox, confidence))
        self._active = None
        self._data = []


class TesseractOutputParser:
    """Join native bottom-left char boxes with hOCR per-character confidence."""

    def parse(
        self,
        box_text: str,
        hocr_text: str,
        *,
        crop_width: int,
        crop_height: int,
        allowed_chars: frozenset[str],
        provenance_factory: Callable[[str], OcrProvenance],
    ) -> tuple[OcrCandidate, ...]:
        boxes = self._parse_bottom_left_boxes(box_text, crop_width, crop_height)
        hocr = _HocrCharacterParser()
        hocr.feed(hocr_text)
        confidence_by_key: defaultdict[tuple[str, BBox], deque[float]] = defaultdict(deque)
        for character in hocr.characters:
            if self._in_bounds(character.bbox, crop_width, crop_height):
                confidence_by_key[(character.char, character.bbox)].append(character.confidence)
        provenance = provenance_factory(hocr.engine_version)
        candidates: list[OcrCandidate] = []
        for char, bbox in boxes:
            confidences = confidence_by_key[(char, bbox)]
            if char not in allowed_chars or not confidences:
                continue
            confidence = confidences.popleft() / 100.0
            if not 0.0 <= confidence <= 1.0:
                continue
            candidates.append(OcrCandidate(char, bbox, confidence, provenance))
        return tuple(candidates)

    @classmethod
    def _parse_bottom_left_boxes(
        cls,
        text: str,
        crop_width: int,
        crop_height: int,
    ) -> tuple[tuple[str, BBox], ...]:
        parsed: list[tuple[str, BBox]] = []
        for line in text.splitlines():
            parts = line.rsplit(maxsplit=5)
            if len(parts) != 6 or len(parts[0]) != 1:
                continue
            try:
                left, bottom, right, top, _page = (int(value) for value in parts[1:])
            except ValueError:
                continue
            bbox = BBox(left, crop_height - top, right - left, top - bottom)
            if cls._in_bounds(bbox, crop_width, crop_height):
                parsed.append((parts[0], bbox))
        return tuple(parsed)

    @staticmethod
    def _in_bounds(bbox: BBox, width: int, height: int) -> bool:
        return (
            bbox.x >= 0
            and bbox.y >= 0
            and bbox.width > 0
            and bbox.height > 0
            and bbox.x + bbox.width <= width
            and bbox.y + bbox.height <= height
        )


class TesseractOcrEngine:
    """Experimental Tesseract adapter with pinned runtime provenance."""

    def __init__(
        self,
        workspace: Workspace,
        runtime: TesseractRuntimeIdentity,
        timeout_seconds: int,
        runner: OcrCommandRunner,
        *,
        parser: TesseractOutputParser | None = None,
        language: str = "eng",
        page_segmentation_mode: int = 7,
        retry_backoff_seconds: float = 1.0,
        sleeper: Callable[[float], None] = time.sleep,
    ) -> None:
        self._workspace = workspace
        self._runtime = runtime
        self._timeout_seconds = timeout_seconds
        self._runner = runner
        self._parser = parser or TesseractOutputParser()
        self._language = language
        self._page_segmentation_mode = page_segmentation_mode
        self._retry_backoff_seconds = retry_backoff_seconds
        self._sleeper = sleeper

    def detect_characters(
        self,
        crop_relpath: Path,
        allowed_chars: Collection[str],
    ) -> tuple[OcrCandidate, ...]:
        crop = self._resolve_crop(crop_relpath)
        allowed = self._normalize_allowed_chars(allowed_chars)
        if not allowed:
            return ()
        runtime_hash, model_hash = self._runtime.verified_hashes(language=self._language)
        crop_width, crop_height = self._image_size(crop)
        temporary = crop.parent / f".ocr-{uuid4().hex}"
        try:
            temporary.mkdir(parents=False, exist_ok=False)
        except OSError as exc:
            raise OcrProcessError("ocr_workspace_unwritable") from exc
        output_base = temporary / "result"
        try:
            whitelist = "".join(allowed)
            self._run_with_retry(crop, output_base, whitelist)
            box_path = output_base.with_suffix(".box")
            hocr_path = output_base.with_suffix(".hocr")
            if not box_path.is_file() or not hocr_path.is_file():
                raise OcrProcessError("ocr_output_missing")
            try:
                box_text = box_path.read_text(encoding="utf-8-sig")
                hocr_text = hocr_path.read_text(encoding="utf-8-sig")
            except (OSError, UnicodeError) as exc:
                raise OcrProcessError("ocr_output_unreadable") from exc
            config_hash = self._config_hash(whitelist)
            return self._parser.parse(
                box_text,
                hocr_text,
                crop_width=crop_width,
                crop_height=crop_height,
                allowed_chars=frozenset(allowed),
                provenance_factory=lambda version: self._runtime.provenance(
                    version,
                    runtime_sha256=runtime_hash,
                    model_sha256=model_hash,
                    config_hash=config_hash,
                    language=self._language,
                    page_segmentation_mode=self._page_segmentation_mode,
                ),
            )
        finally:
            shutil.rmtree(temporary, ignore_errors=True)

    def _resolve_crop(self, crop_relpath: Path) -> Path:
        try:
            return self._workspace.resolve_relpath(crop_relpath)
        except WorkspaceError as exc:
            raise OcrProcessError("ocr_artifact_path_invalid") from exc

    def _run_with_retry(self, crop: Path, output_base: Path, whitelist: str) -> None:
        arguments = [
            str(self._runtime.executable),
            str(crop),
            str(output_base),
            "--tessdata-dir",
            str(self._runtime.model.parent),
            "--psm",
            str(self._page_segmentation_mode),
            "-l",
            self._language,
            "-c",
            f"tessedit_char_whitelist={whitelist}",
            "-c",
            "hocr_char_boxes=1",
            "makebox",
            "hocr",
        ]
        for attempt in range(2):
            output_base.with_suffix(".box").unlink(missing_ok=True)
            output_base.with_suffix(".hocr").unlink(missing_ok=True)
            try:
                result = self._runner.run(arguments, timeout_seconds=self._timeout_seconds)
                if result.returncode != 0:
                    abnormal = self._is_abnormal_termination(result.returncode)
                    raise OcrProcessError(
                        "ocr_process_abnormal" if abnormal else "ocr_process_failed",
                        retryable=abnormal,
                    )
                return
            except OcrProcessError as exc:
                retryable = exc.code in {"ocr_timeout", "ocr_process_abnormal"}
                if not retryable or attempt == 1:
                    raise
                self._sleeper(self._retry_backoff_seconds)

    @staticmethod
    def _is_abnormal_termination(returncode: int) -> bool:
        return returncode < 0 or returncode >= 0xC0000000

    def _config_hash(self, whitelist: str) -> str:
        payload = json.dumps(
            {
                "hocr_char_boxes": True,
                "language": self._language,
                "model_sha256": self._runtime.expected_model_sha256.lower(),
                "page_segmentation_mode": self._page_segmentation_mode,
                "whitelist": whitelist,
            },
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        )
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    @staticmethod
    def _normalize_allowed_chars(allowed_chars: Collection[str]) -> tuple[str, ...]:
        normalized: set[str] = set()
        for char in allowed_chars:
            if len(char) != 1 or char in {"\x00", "\r", "\n"}:
                raise ValueError("allowed_chars must contain single printable characters")
            normalized.add(char)
        return tuple(sorted(normalized))

    @staticmethod
    def _image_size(crop: Path) -> tuple[int, int]:
        if not crop.is_file():
            raise OcrProcessError("ocr_input_missing")
        try:
            with Image.open(crop) as image:
                image.verify()
            with Image.open(crop) as image:
                image.load()
                width, height = image.size
        except (OSError, ValueError, UnidentifiedImageError) as exc:
            raise OcrProcessError("ocr_input_invalid") from exc
        if width <= 0 or height <= 0:
            raise OcrProcessError("ocr_input_invalid")
        return width, height
