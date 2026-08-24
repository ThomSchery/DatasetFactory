from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from backend.app.access.store.database import Database
from backend.app.access.store.models import ReferenceAsset
from backend.app.access.store.workspace import Workspace, WorkspaceError


class AssetNotFoundError(LookupError):
    pass


@dataclass(frozen=True)
class AssetRecord:
    path: Path
    content_type: str


class AssetRepository:
    """Resolve only opaque asset identifiers through persisted controlled relpaths."""

    def __init__(self, database: Database, workspace: Workspace) -> None:
        self._database = database
        self._workspace = workspace

    def get_reference(self, asset_id: str) -> AssetRecord:
        with self._database.session() as session:
            asset = session.get(ReferenceAsset, asset_id)
            if asset is None or asset.status != "ready":
                raise AssetNotFoundError
            try:
                path = self._workspace.resolve_relpath(asset.relpath)
            except WorkspaceError as exc:
                raise AssetNotFoundError from exc
            if not path.is_file():
                raise AssetNotFoundError
            return AssetRecord(path=path, content_type=asset.content_type)

    def get_ephemeral_reference(self, *, relpath: str, content_type: str) -> AssetRecord:
        """Resolve a process-local preview through the same controlled workspace boundary."""
        try:
            path = self._workspace.resolve_relpath(relpath)
        except WorkspaceError as exc:
            raise AssetNotFoundError from exc
        references_path = self._workspace.resolve_relpath("assets/references")
        if path.parent != references_path or path.suffix.casefold() not in {".png", ".jpg"}:
            raise AssetNotFoundError
        if not path.is_file():
            raise AssetNotFoundError
        return AssetRecord(path=path, content_type=content_type)
