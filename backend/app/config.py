from __future__ import annotations

import ipaddress
import re
from pathlib import Path
from typing import Literal, Self

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Validated local runtime configuration loaded from DF_* variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_prefix="DF_",
        extra="forbid",
        validate_default=True,
    )

    workspace_dir: Path = Path("D:/DatasetFactory/workspace")
    cache_dir: Path = Path("D:/DatasetFactory/cache")
    spa_dir: Path | None = None
    ffmpeg_path: Path = Path("D:/tools/ffmpeg/bin/ffmpeg.exe")
    ffprobe_path: Path = Path("D:/tools/ffmpeg/bin/ffprobe.exe")
    tesseract_path: Path = Path("D:/tools/tesseract-5.5.3/tesseract.exe")
    tesseract_model_path: Path = Path("D:/tools/tesseract-5.5.3/tessdata/eng.traineddata")
    tesseract_version: str = "v5.5.3.20260724"
    tesseract_runtime_sha256: str = (
        "C66F0F12ED76F6AA455DAC97684BBC86756D6A732380BEE09122454CFDA3F420"
    )
    tesseract_model_sha256: str = "7D4322BD2A7749724879683FC3912CB542F19906C83BCC1A52132556427170B2"
    # Which OCR engine runs. Each engine has its own settings below; only the chosen one is used.
    ocr_engine: Literal["tesseract", "rapidocr"] = "tesseract"
    rapidocr_model_dir: Path = Path("D:/tools/rapidocr-3.10.0/models")
    # `rapidocr` and the `onnxruntime` it runs on, as the installed packages report them.
    rapidocr_version: str = "3.10.0+onnxruntime-1.32.0"
    # SHA-256 of the native library the models run on (`onnxruntime_pybind11_state`).
    rapidocr_runtime_sha256: str = (
        "D4D9DF764064DEE9216DFA9A3933BEAEFC480B9C421A62D3F681168CEC90C23C"
    )
    # SHA-256 of the two ONNX files pinned together; see `RapidOcrRuntimeIdentity`.
    rapidocr_models_sha256: str = "4345A537B9E649F479C94AEDF3682D106471506063C6348F4BE1B17FE5CBFC0F"
    host: str = "127.0.0.1"
    port: int = Field(default=8000, ge=1, le=65535)
    log_level: str = "INFO"
    dev_cors_origin: str = "http://localhost:5173"
    ffprobe_timeout_seconds: int = Field(default=30, ge=1, le=300)
    frame_extraction_timeout_seconds: int = Field(default=60, ge=1, le=600)
    tesseract_timeout_seconds: int = Field(default=30, ge=1, le=300)

    @field_validator("host")
    @classmethod
    def require_loopback_host(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized == "localhost":
            return normalized
        try:
            address = ipaddress.ip_address(normalized)
        except ValueError as exc:
            raise ValueError("DF_HOST must be a loopback IP address or localhost") from exc
        if not address.is_loopback:
            raise ValueError("DF_HOST must be loopback in local-public mode")
        return normalized

    @field_validator("log_level")
    @classmethod
    def normalize_log_level(cls, value: str) -> str:
        normalized = value.strip().upper()
        allowed = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
        if normalized not in allowed:
            raise ValueError(f"DF_LOG_LEVEL must be one of {sorted(allowed)}")
        return normalized

    @field_validator(
        "tesseract_runtime_sha256",
        "tesseract_model_sha256",
        "rapidocr_runtime_sha256",
        "rapidocr_models_sha256",
    )
    @classmethod
    def normalize_sha256(cls, value: str) -> str:
        normalized = value.strip().lower()
        if re.fullmatch(r"[0-9a-f]{64}", normalized) is None:
            raise ValueError("SHA-256 pins must contain 64 hexadecimal characters")
        return normalized

    @field_validator("dev_cors_origin")
    @classmethod
    def require_local_dev_origin(cls, value: str) -> str:
        normalized = value.rstrip("/")
        allowed_prefixes = (
            "http://localhost:",
            "http://127.0.0.1:",
            "http://[::1]:",
        )
        if not normalized.startswith(allowed_prefixes):
            raise ValueError("DF_DEV_CORS_ORIGIN must use a loopback HTTP origin")
        return normalized

    @model_validator(mode="after")
    def require_d_drive_storage(self) -> Self:
        for field_name, path in (
            ("DF_WORKSPACE_DIR", self.workspace_dir),
            ("DF_CACHE_DIR", self.cache_dir),
            ("DF_TESSERACT_PATH", self.tesseract_path),
            ("DF_TESSERACT_MODEL_PATH", self.tesseract_model_path),
            ("DF_RAPIDOCR_MODEL_DIR", self.rapidocr_model_dir),
        ):
            if path.drive.upper() != "D:":
                raise ValueError(f"{field_name} must be located on D:")
        return self

    @property
    def database_path(self) -> Path:
        return self.workspace_dir / "project.db"

    @property
    def database_url(self) -> str:
        return f"sqlite+pysqlite:///{self.database_path.resolve().as_posix()}"
