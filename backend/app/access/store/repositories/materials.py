from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from sqlalchemy import func, select

from backend.app.access.store.database import Database
from backend.app.access.store.models import VideoAsset


@dataclass(frozen=True)
class MaterialRecord:
    id: str
    basename: str
    size_bytes: int
    duration_ms: int
    width: int
    height: int
    fingerprint: str
    available: bool
    created_at: datetime


@dataclass(frozen=True)
class MaterialPage:
    items: tuple[MaterialRecord, ...]
    page: int
    page_size: int
    total: int


class MaterialNotFoundError(LookupError):
    pass


@dataclass(frozen=True)
class MaterialSourceRecord:
    id: str
    path: Path
    size_bytes: int
    duration_ms: int
    width: int
    height: int
    fingerprint: str


class MaterialRepository:
    """Persist local video references and return path-redacted projections."""

    def __init__(self, database: Database) -> None:
        self._database = database

    def create(
        self,
        *,
        asset_id: str,
        project_id: str,
        local_path: Path,
        size_bytes: int,
        duration_ms: int,
        width: int,
        height: int,
        fingerprint: str,
    ) -> MaterialRecord:
        with self._database.session() as session:
            asset = VideoAsset(
                id=asset_id,
                project_id=project_id,
                local_path=str(local_path),
                size_bytes=size_bytes,
                duration_ms=duration_ms,
                width=width,
                height=height,
                fingerprint=fingerprint,
            )
            session.add(asset)
            session.flush()
            return self._record(asset)

    def list(self, *, page: int, page_size: int) -> MaterialPage:
        with self._database.session() as session:
            total = int(session.scalar(select(func.count()).select_from(VideoAsset)) or 0)
            assets = session.scalars(
                select(VideoAsset)
                .order_by(VideoAsset.created_at.desc(), VideoAsset.id.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
            return MaterialPage(
                items=tuple(self._record(asset) for asset in assets),
                page=page,
                page_size=page_size,
                total=total,
            )

    def source(self, material_id: str) -> MaterialSourceRecord:
        with self._database.session() as session:
            asset = session.get(VideoAsset, material_id)
            if asset is None:
                raise MaterialNotFoundError
            return MaterialSourceRecord(
                id=asset.id,
                path=Path(asset.local_path),
                size_bytes=asset.size_bytes,
                duration_ms=asset.duration_ms,
                width=asset.width,
                height=asset.height,
                fingerprint=asset.fingerprint,
            )

    @staticmethod
    def _record(asset: VideoAsset) -> MaterialRecord:
        source = Path(asset.local_path)
        return MaterialRecord(
            id=asset.id,
            basename=source.name,
            size_bytes=asset.size_bytes,
            duration_ms=asset.duration_ms,
            width=asset.width,
            height=asset.height,
            fingerprint=asset.fingerprint,
            available=source.is_file(),
            created_at=asset.created_at,
        )
