from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from backend.app.access.ocr.protocol import OcrEngine
from backend.app.access.status.probe import OcrDependencyProbe


class UnknownOcrEngineError(LookupError):
    """A run named an engine that is not installed in this application."""

    def __init__(self, engine_id: str) -> None:
        super().__init__(engine_id)
        self.engine_id = engine_id


@dataclass(frozen=True)
class OcrEngineEntry:
    """One engine the application can read with, and the probe that checks its installation."""

    id: str
    engine: OcrEngine
    probe: OcrDependencyProbe | None = None


class OcrEngineRegistry:
    """The OCR engines of this application, by identifier.

    Only the composition root knows which engines exist; everything above asks the
    registry. A run names its engine once, when it is created, and keeps it: the worker
    looks the engine up again from the run, so a paused run resumes on the engine that
    started it, and never on whichever one is the default today.
    """

    def __init__(
        self,
        entries: Sequence[OcrEngineEntry],
        default_id: str,
        *,
        answers_for_any_id: bool = False,
    ) -> None:
        by_id = {entry.id: entry for entry in entries}
        if len(by_id) != len(entries) or default_id not in by_id:
            raise ValueError("an OCR engine registry needs unique ids and a default among them")
        self._by_id = by_id
        self._default_id = default_id
        self._answers_for_any_id = answers_for_any_id

    @classmethod
    def of(cls, engine: OcrEngine) -> OcrEngineRegistry:
        """A registry of one engine that answers whatever engine a run names.

        For callers that bring their own engine (a harness, a test double) whose
        identifier the registry cannot know in advance.
        """
        return cls((OcrEngineEntry("default", engine),), "default", answers_for_any_id=True)

    @property
    def default_id(self) -> str:
        return self._default_id

    @property
    def entries(self) -> tuple[OcrEngineEntry, ...]:
        return tuple(self._by_id.values())

    def get(self, engine_id: str | None = None) -> OcrEngine:
        """The engine for `engine_id`, or the default one for `None`."""
        wanted = self._default_id if engine_id is None else engine_id
        entry = self._by_id.get(wanted)
        if entry is None:
            if self._answers_for_any_id:
                return self._by_id[self._default_id].engine
            raise UnknownOcrEngineError(wanted)
        return entry.engine

    def cancel_current(self) -> None:
        """Ask every engine to drop the read in flight; an idle engine does nothing."""
        for entry in self._by_id.values():
            entry.engine.cancel_current()
