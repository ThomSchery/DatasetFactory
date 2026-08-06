from __future__ import annotations

from dataclasses import dataclass
from uuid import uuid4

from sqlalchemy import select

from backend.app.access.store.database import Database
from backend.app.access.store.models import Project
from backend.app.access.store.workspace import Workspace


@dataclass(frozen=True)
class ProjectRecord:
    id: str
    name: str
    # Persistence-only: the workspace path is never part of an HTTP response.
    workspace_path: str


class ProjectRepository:
    """Maintain the single local project persistence invariant."""

    def __init__(self, database: Database, workspace: Workspace) -> None:
        self._database = database
        self._workspace = workspace

    def current(self) -> ProjectRecord | None:
        """Read the current project without creating one.

        `get_or_create_current_id` writes, so it cannot serve a read-only reader:
        an empty database is a valid state that must stay empty after a GET.
        """
        with self._database.session() as session:
            project = session.scalar(
                select(Project).order_by(Project.created_at, Project.id).limit(1)
            )
            if project is None:
                return None
            return ProjectRecord(
                id=project.id,
                name=project.name,
                workspace_path=project.workspace_path,
            )

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
