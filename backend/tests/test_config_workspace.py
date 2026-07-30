from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from backend.app.access.store.workspace import Workspace, WorkspaceError
from backend.app.config import Settings


def test_non_loopback_host_is_rejected() -> None:
    with pytest.raises(ValidationError, match="loopback"):
        Settings(host="0.0.0.0")


def test_storage_outside_d_drive_is_rejected() -> None:
    with pytest.raises(ValidationError, match="must be located on D"):
        Settings(workspace_dir=Path("C:/DatasetFactory/workspace"))


def test_tesseract_outside_d_drive_is_rejected() -> None:
    with pytest.raises(ValidationError, match="DF_TESSERACT_PATH must be located on D"):
        Settings(tesseract_path=Path("C:/Program Files/Tesseract-OCR/tesseract.exe"))


def test_tesseract_model_outside_d_drive_is_rejected() -> None:
    with pytest.raises(ValidationError, match="DF_TESSERACT_MODEL_PATH must be located on D"):
        Settings(tesseract_model_path=Path("C:/models/eng.traineddata"))


def test_tesseract_runtime_hash_pin_must_be_known_sha256() -> None:
    with pytest.raises(ValidationError, match="64 hexadecimal"):
        Settings(tesseract_runtime_sha256="unknown")


def test_tesseract_model_hash_pin_must_be_known_sha256() -> None:
    with pytest.raises(ValidationError, match="64 hexadecimal"):
        Settings(tesseract_model_sha256="unknown")


def test_workspace_rejects_non_directory_target(tmp_path: Path) -> None:
    occupied = tmp_path / "occupied"
    occupied.write_text("not a directory", encoding="utf-8")
    workspace = Workspace(occupied, tmp_path / "cache")

    with pytest.raises(WorkspaceError, match="not writable"):
        workspace.prepare()


@pytest.mark.parametrize(
    "relpath",
    ["../outside.jpg", "runs/../../outside.jpg", "D:/outside.jpg", "\\\\server\\share\\x"],
)
def test_controlled_relpath_cannot_escape_workspace(tmp_path: Path, relpath: str) -> None:
    workspace = Workspace(tmp_path / "workspace", tmp_path / "cache")
    workspace.prepare()

    with pytest.raises(WorkspaceError):
        workspace.resolve_relpath(relpath)


def test_controlled_relpath_resolves_inside_workspace(tmp_path: Path) -> None:
    workspace = Workspace(tmp_path / "workspace", tmp_path / "cache")
    workspace.prepare()

    resolved = workspace.resolve_relpath("runs/run-1/frames/0.jpg")
    assert resolved == workspace.root / "runs" / "run-1" / "frames" / "0.jpg"
