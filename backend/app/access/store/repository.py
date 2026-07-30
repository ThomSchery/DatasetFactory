from __future__ import annotations

from dataclasses import dataclass

from backend.app.access.store.database import Database
from backend.app.access.store.models import GameProfile, HudRegion
from backend.app.access.store.workspace import Workspace


class ProfileNotFoundError(LookupError):
    pass


class InvalidHudRegionError(ValueError):
    pass


@dataclass(frozen=True)
class HudRegionDraft:
    id: str
    profile_id: str
    name: str
    x: int
    y: int
    width: int
    height: int


class ProjectStore:
    """Public persistence boundary for the project database and controlled files."""

    def __init__(self, database: Database, workspace: Workspace) -> None:
        self.database = database
        self.workspace = workspace

    def resolve_artifact(self, relpath: str) -> str:
        return str(self.workspace.resolve_relpath(relpath))

    def add_hud_region(self, draft: HudRegionDraft) -> HudRegion:
        """Persist a region only after validating it against its parent source bounds."""
        with self.database.session() as session:
            profile = session.get(GameProfile, draft.profile_id)
            if profile is None:
                raise ProfileNotFoundError("game profile does not exist")
            self._validate_hud_region(draft, profile.source_width, profile.source_height)
            region = HudRegion(
                id=draft.id,
                profile_id=draft.profile_id,
                name=draft.name,
                x=draft.x,
                y=draft.y,
                width=draft.width,
                height=draft.height,
            )
            session.add(region)
            session.flush()
            return region

    @staticmethod
    def _validate_hud_region(
        draft: HudRegionDraft,
        source_width: int,
        source_height: int,
    ) -> None:
        if draft.x < 0 or draft.y < 0 or draft.width <= 0 or draft.height <= 0:
            raise InvalidHudRegionError("HUD region geometry must be positive")
        if draft.x + draft.width > source_width or draft.y + draft.height > source_height:
            raise InvalidHudRegionError("HUD region must remain inside source bounds")
