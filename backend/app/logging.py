from __future__ import annotations

import json
import logging
import re
import traceback
from datetime import UTC, datetime
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Any

_SAFE_FIELDS = (
    "request_id",
    "run_id",
    "stage",
    "frame_index",
    "error_code",
    "method",
    "route",
    "status_code",
    "duration_ms",
)
_QUOTED_ABSOLUTE_PATH = re.compile(r"(?P<quote>['\"])(?:[A-Za-z]:[\\/]|\\\\|/).*?(?P=quote)")
_WINDOWS_ABSOLUTE_PATH = re.compile(r"(?i)(?<![\w])(?:[a-z]:[\\/]|\\\\)(?:[^\s,;:'\"<>|]+[\\/]?)+")
_POSIX_ABSOLUTE_PATH = re.compile(r"(?<![\w:])/(?:[^/\s,;:'\"<>|]+/)*[^/\s,;:'\"<>|]+")
_REDACTED_PATH = "<redacted-path>"


def redact_sensitive_text(value: str) -> str:
    """Remove absolute filesystem paths from operator-controlled log text."""
    redacted = _QUOTED_ABSOLUTE_PATH.sub(_REDACTED_PATH, value)
    redacted = _WINDOWS_ABSOLUTE_PATH.sub(_REDACTED_PATH, redacted)
    return _POSIX_ABSOLUTE_PATH.sub(_REDACTED_PATH, redacted)


class JsonLineFormatter(logging.Formatter):
    """Emit a bounded JSONL record without request bodies or filesystem paths."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": redact_sensitive_text(record.getMessage()),
        }
        for field in _SAFE_FIELDS:
            value = getattr(record, field, None)
            if value is not None:
                payload[field] = value
        if record.exc_info is not None:
            exception_type, _, exception_traceback = record.exc_info
            if exception_type is not None and exception_traceback is not None:
                frames = traceback.extract_tb(exception_traceback)
                payload["exception"] = {
                    "type": exception_type.__name__,
                    "traceback": [
                        {
                            "file": redact_sensitive_text(frame.filename),
                            "line": frame.lineno,
                            "function": frame.name,
                        }
                        for frame in frames
                    ],
                }
        return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def configure_json_logging(log_path: Path, level: str) -> logging.Logger:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    logger = logging.getLogger("datasetfactory")
    logger.disabled = False
    logger.setLevel(level)
    logger.propagate = False

    resolved_target = log_path.resolve()
    for handler in logger.handlers:
        if (
            isinstance(handler, RotatingFileHandler)
            and Path(handler.baseFilename).resolve() == resolved_target
        ):
            handler.setLevel(level)
            return logger

    handler = RotatingFileHandler(
        resolved_target,
        maxBytes=5 * 1024 * 1024,
        backupCount=3,
        encoding="utf-8",
    )
    handler.setLevel(level)
    handler.setFormatter(JsonLineFormatter())
    logger.addHandler(handler)
    return logger


def close_json_logging(logger: logging.Logger, log_path: Path) -> None:
    resolved_target = log_path.resolve()
    for handler in list(logger.handlers):
        if (
            isinstance(handler, RotatingFileHandler)
            and Path(handler.baseFilename).resolve() == resolved_target
        ):
            logger.removeHandler(handler)
            handler.close()
