from __future__ import annotations

from typing import Final, Literal

RunStatus = Literal[
    "queued",
    "running",
    "paused",
    "review_ready",
    "completed",
    "failed",
    "cancelled",
]
FrameStage = Literal["pending", "sampled", "cropped", "ocr_complete", "review_pending"]

RUN_STATUSES: Final[tuple[RunStatus, ...]] = (
    "queued",
    "running",
    "paused",
    "review_ready",
    "completed",
    "failed",
    "cancelled",
)
FRAME_STAGES: Final[tuple[FrameStage, ...]] = (
    "pending",
    "sampled",
    "cropped",
    "ocr_complete",
    "review_pending",
)

RUN_TRANSITIONS: Final[dict[RunStatus, frozenset[RunStatus]]] = {
    "queued": frozenset({"running", "failed", "cancelled"}),
    "running": frozenset({"paused", "review_ready", "failed", "cancelled"}),
    "paused": frozenset({"running", "failed", "cancelled"}),
    "review_ready": frozenset({"completed"}),
    "completed": frozenset(),
    "failed": frozenset({"running", "cancelled"}),
    "cancelled": frozenset({"running", "failed"}),
}

FRAME_TRANSITIONS: Final[dict[FrameStage, frozenset[FrameStage]]] = {
    "pending": frozenset({"sampled"}),
    "sampled": frozenset({"cropped"}),
    "cropped": frozenset({"ocr_complete"}),
    "ocr_complete": frozenset({"review_pending"}),
    "review_pending": frozenset(),
}

# Recovery is the only non-monotonic frame path. The target identifies the last
# trustworthy durable stage after the corrupt stage and all dependants are removed.
FRAME_RECOVERY_TRANSITIONS: Final[dict[FrameStage, frozenset[FrameStage]]] = {
    "pending": frozenset(),
    "sampled": frozenset({"pending"}),
    "cropped": frozenset({"pending", "sampled"}),
    "ocr_complete": frozenset({"pending", "sampled", "cropped"}),
    "review_pending": frozenset({"pending", "sampled", "cropped"}),
}


class InvalidTransitionError(RuntimeError):
    def __init__(self, *, aggregate: str, current: str, target: str) -> None:
        super().__init__(f"invalid {aggregate} transition: {current} -> {target}")
        self.aggregate = aggregate
        self.current = current
        self.target = target


def require_run_transition(current: RunStatus, target: RunStatus) -> None:
    if target not in RUN_TRANSITIONS[current]:
        raise InvalidTransitionError(aggregate="run", current=current, target=target)


def require_frame_transition(
    current: FrameStage,
    target: FrameStage,
    *,
    recovery: bool = False,
) -> None:
    transitions = FRAME_RECOVERY_TRANSITIONS if recovery else FRAME_TRANSITIONS
    if target not in transitions[current]:
        raise InvalidTransitionError(aggregate="frame", current=current, target=target)
