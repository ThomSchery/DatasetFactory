from __future__ import annotations

import ast
from pathlib import Path

import pytest


@pytest.mark.parametrize(
    "module_name",
    ["health", "profiles", "materials", "assets", "annotations", "frames"],
)
def test_api_router_does_not_import_composition_root(module_name: str) -> None:
    source_path = Path(f"backend/app/api/{module_name}.py")
    tree = ast.parse(source_path.read_text(encoding="utf-8"))
    imported_modules = {
        node.module
        for node in ast.walk(tree)
        if isinstance(node, ast.ImportFrom) and node.module is not None
    }
    imported_names = {
        alias.name
        for node in ast.walk(tree)
        if isinstance(node, (ast.Import, ast.ImportFrom))
        for alias in node.names
    }

    assert "backend.app.composition" not in imported_modules
    assert "CompositionRoot" not in imported_names


@pytest.mark.parametrize(
    "source_path",
    [
        Path("backend/app/engines/definition/engine.py"),
        Path("backend/app/engines/definition/ocr_mapping.py"),
        Path("backend/app/managers/workflow/profile_use_cases.py"),
        Path("backend/app/managers/workflow/material_use_cases.py"),
        Path("backend/app/engines/review/engine.py"),
        Path("backend/app/managers/workflow/review_use_cases.py"),
    ],
)
def test_engine_and_manager_do_not_import_http_or_sqlalchemy(source_path: Path) -> None:
    tree = ast.parse(source_path.read_text(encoding="utf-8"))
    modules = {node.module or "" for node in ast.walk(tree) if isinstance(node, ast.ImportFrom)} | {
        alias.name
        for node in ast.walk(tree)
        if isinstance(node, ast.Import)
        for alias in node.names
    }

    assert not any(module.startswith(("fastapi", "starlette", "sqlalchemy")) for module in modules)


def test_definition_engine_does_not_import_ocr_or_image_implementations() -> None:
    for source_path in (
        Path("backend/app/engines/definition/engine.py"),
        Path("backend/app/engines/definition/ocr_mapping.py"),
    ):
        source = source_path.read_text(encoding="utf-8").casefold()
        assert "opencv" not in source
        assert "cv2" not in source
        assert "tesseract" not in source
