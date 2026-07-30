from __future__ import annotations

from uuid import uuid4

from sqlalchemy import select

from backend.app.access.store.database import Database
from backend.app.access.store.models import Project
from backend.app.access.store.workspace import Workspace


class ProjectRepository:
    """Maintain the single local project persistence invariant."""

    def __init__(self, database: Database, workspace: Workspace) -> None:
        self._database = database
        self._workspace = workspace

    def get_or_create_current_id(self) -> str:
        with self._database.session() as session:
            existing = session.scalar(
                select(Project).order_by(Project.created_at, Project.id).limit(1)
            )
            if existing is not None:
                return existing.id
            project = Project(
                id=str(uuid4()),
                name="DatasetFactory",
                workspace_path=str(self._workspace.root),
            )
            session.add(project)
            session.flush()
            return project.id
