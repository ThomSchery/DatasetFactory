from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from backend.app.access.status.service import SystemStatusSnapshot
from backend.app.access.store.repositories.frames import FrameRepository, ReviewStatusCounts
from backend.app.access.store.repositories.profiles import ProfileRecord, ProfileRepository
from backend.app.access.store.repositories.projects import ProjectRecord, ProjectRepository
from backend.app.access.store.repositories.runs import RunRecord, RunRepository

EMPTY_COUNTS = ReviewStatusCounts(pending=0, accepted=0, rejected=0)


class SystemStatusReader(Protocol):
    def snapshot(self) -> SystemStatusSnapshot: ...


@dataclass(frozen=True)
class DashboardSnapshot:
    """One consistent-enough read of the current session for the F12 screen.

    Every field is optional except the counts and the system status: an install with
    no project, no profile and no run is the first thing a user sees, not an error.
    """

    project: ProjectRecord | None
    profile: ProfileRecord | None
    run: RunRecord | None
    counts: ReviewStatusCounts
    system: SystemStatusSnapshot


class DashboardUseCases:
    """Assemble the read-only dashboard view from the stores that already own it."""

    def __init__(
        self,
        projects: ProjectRepository,
        profiles: ProfileRepository,
        runs: RunRepository,
        frames: FrameRepository,
        system_status: SystemStatusReader,
    ) -> None:
        self._projects = projects
        self._profiles = profiles
        self._runs = runs
        self._frames = frames
        self._system_status = system_status

    def snapshot(self) -> DashboardSnapshot:
        # Read-only throughout: no repository call here writes, which is why the
        # project comes from `current()` and not from `get_or_create_current_id()`.
        run = self._runs.active()
        return DashboardSnapshot(
            project=self._projects.current(),
            profile=self._profiles.current(),
            run=run,
            counts=EMPTY_COUNTS if run is None else self._frames.review_status_counts(run.id),
            system=self._system_status.snapshot(),
        )
