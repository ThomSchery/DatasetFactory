"""Mechanical guard for the layer rules of `docs/MODULES.md` (PRAG-13).

The rules used to live only in the agent's memory, and the first one — Access
never calls the Manager — was broken for months with the checklist ticked. Each
test reads imports with `ast`, so a violation fails the build instead of waiting
for a review.
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

APP = Path("backend/app")
ROOT_PACKAGE = "backend.app"


def _modules(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    imported: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module is not None and node.level == 0:
            imported.add(node.module)
        elif isinstance(node, ast.Import):
            imported.update(alias.name for alias in node.names)
    return imported


def _sources(layer: str) -> list[Path]:
    return sorted(path for path in (APP / layer).rglob("*.py") if "__pycache__" not in path.parts)


def _under(modules: set[str], *packages: str) -> set[str]:
    prefixes = tuple(f"{ROOT_PACKAGE}.{package}" for package in packages)
    return {module for module in modules if module.startswith(prefixes)}


@pytest.mark.parametrize("path", _sources("engines"), ids=lambda path: path.as_posix())
def test_engine_knows_nothing_below_or_above_it(path: Path) -> None:
    """Engines hold pure rules: no persistence, no HTTP, no processes, no files."""
    modules = _modules(path)

    assert not _under(modules, "access", "managers", "api", "composition")
    forbidden = ("fastapi", "starlette", "sqlalchemy", "cv2", "subprocess", "pathlib", "os")
    assert not {module for module in modules if module.split(".")[0] in forbidden}, (
        "an Engine must stay pure"
    )


@pytest.mark.parametrize("path", _sources("access"), ids=lambda path: path.as_posix())
def test_access_never_calls_up_into_manager_or_client(path: Path) -> None:
    """PRAG-13, rule 1: Client → Manager → Engine / Access, never the other way."""
    assert not _under(_modules(path), "managers", "api", "composition")


@pytest.mark.parametrize("path", _sources("managers"), ids=lambda path: path.as_posix())
def test_manager_never_calls_up_into_client(path: Path) -> None:
    assert not _under(_modules(path), "api", "composition")


@pytest.mark.parametrize("path", _sources("api"), ids=lambda path: path.as_posix())
def test_client_reaches_access_only_through_the_manager(path: Path) -> None:
    """PRAG-13, rule 4 and the "skip a layer" compromise PRAG-18 forbids."""
    assert not _under(_modules(path), "access")


@pytest.mark.parametrize("layer", ["engines", "access", "managers", "api"])
def test_every_layer_is_actually_scanned(layer: str) -> None:
    """A rule over an empty list passes for the wrong reason."""
    assert len(_sources(layer)) >= 3


def test_the_scan_notices_an_upward_import(tmp_path: Path) -> None:
    offender = tmp_path / "offender.py"
    offender.write_text(
        "from backend.app.managers.workflow.manager import DatasetWorkflow\nimport sqlalchemy\n",
        encoding="utf-8",
    )

    modules = _modules(offender)

    assert _under(modules, "managers", "api") == {"backend.app.managers.workflow.manager"}
    assert {module for module in modules if module.split(".")[0] == "sqlalchemy"}
