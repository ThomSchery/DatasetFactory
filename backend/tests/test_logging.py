from __future__ import annotations

import json
from pathlib import Path
from typing import Any, cast

from backend.app.logging import close_json_logging, configure_json_logging


def _read_last_record(log_path: Path) -> dict[str, Any]:
    lines = log_path.read_text(encoding="utf-8").splitlines()
    return cast(dict[str, Any], json.loads(lines[-1]))


def test_json_formatter_redacts_paths_and_ignores_sensitive_extra_fields(tmp_path: Path) -> None:
    log_path = tmp_path / "app.jsonl"
    logger = configure_json_logging(log_path, "INFO")
    try:
        logger.info(
            "failed source D:/private/video.mp4 and /home/owner/private/crop.png",
            extra={
                "request_id": "request-1",
                "run_id": "run-1",
                "stage": "ocr",
                "frame_index": 42,
                "source_path": "D:/private/video.mp4",
                "ocr_text": "TOP-SECRET-OCR",
            },
        )
        for handler in logger.handlers:
            handler.flush()
        record = _read_last_record(log_path)
    finally:
        close_json_logging(logger, log_path)

    serialized = json.dumps(record)
    assert "D:/private/video.mp4" not in serialized
    assert "/home/owner/private/crop.png" not in serialized
    assert "TOP-SECRET-OCR" not in serialized
    assert record["message"].count("<redacted-path>") == 2
    assert record["request_id"] == "request-1"
    assert record["run_id"] == "run-1"
    assert record["stage"] == "ocr"
    assert record["frame_index"] == 42


def test_exception_traceback_keeps_context_without_exception_arguments(tmp_path: Path) -> None:
    log_path = tmp_path / "app.jsonl"
    logger = configure_json_logging(log_path, "INFO")
    try:
        try:
            raise RuntimeError("failed D:/private/video.mp4 OCR=TOP-SECRET-OCR")
        except RuntimeError:
            logger.exception("pipeline_failed", extra={"request_id": "request-2"})
        for handler in logger.handlers:
            handler.flush()
        record = _read_last_record(log_path)
    finally:
        close_json_logging(logger, log_path)

    serialized = json.dumps(record)
    assert record["exception"]["type"] == "RuntimeError"
    assert record["exception"]["traceback"]
    assert record["request_id"] == "request-2"
    assert "D:/private/video.mp4" not in serialized
    assert "TOP-SECRET-OCR" not in serialized
