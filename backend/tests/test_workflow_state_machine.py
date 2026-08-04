"""The transition tables, written out from the documents rather than from the code.

`docs/CONTEXT.md` ("Zachowanie długotrwałego runu") and `docs/CORE_FLOWS.md` (CF-03,
CF-04) are the source of these pairs. They are spelled out literally on purpose: a test
that derives its expectations from `RUN_TRANSITIONS`/`FRAME_TRANSITIONS` only proves the
guard honours its own table, not that the table matches the contract.
"""

from __future__ import annotations

import itertools

import pytest

from backend.app.managers.workflow.state_machine import (
    FRAME_STAGES,
    RUN_STATUSES,
    InvalidTransitionError,
    require_frame_transition,
    require_run_transition,
)

# CONTEXT: "queued -> running -> review_ready -> completed; kontrolowane odgalezienia:
# paused, failed, cancelled". CORE_FLOWS CF-04: resuming a paused, failed or cancelled
# run starts another attempt of the same run.
DOCUMENTED_RUN_TRANSITIONS: dict[str, set[str]] = {
    "queued": {"running", "failed", "cancelled"},
    "running": {"paused", "review_ready", "failed", "cancelled"},
    "paused": {"running", "failed", "cancelled"},
    "review_ready": {"completed"},
    "completed": set(),
    "failed": {"running", "cancelled"},
    "cancelled": {"running", "failed"},
}

# CONTEXT: "pending -> sampled -> cropped -> ocr_complete -> review_pending"; forward
# progress is monotonic.
DOCUMENTED_FRAME_TRANSITIONS: dict[str, set[str]] = {
    "pending": {"sampled"},
    "sampled": {"cropped"},
    "cropped": {"ocr_complete"},
    "ocr_complete": {"review_pending"},
    "review_pending": set(),
}

# CORE_FLOWS CF-04: a damaged or missing artifact rolls back exactly its own stage and
# the results depending on it, never an earlier accepted frame.
DOCUMENTED_FRAME_RECOVERY_TRANSITIONS: dict[str, set[str]] = {
    "pending": set(),
    "sampled": {"pending"},
    "cropped": {"pending", "sampled"},
    "ocr_complete": {"pending", "sampled", "cropped"},
    "review_pending": {"pending", "sampled", "cropped"},
}


def test_the_statuses_and_stages_are_exactly_the_documented_ones() -> None:
    assert set(RUN_STATUSES) == set(DOCUMENTED_RUN_TRANSITIONS)
    assert set(FRAME_STAGES) == set(DOCUMENTED_FRAME_TRANSITIONS)
    assert set(FRAME_STAGES) == set(DOCUMENTED_FRAME_RECOVERY_TRANSITIONS)


def test_complete_run_transition_table_matches_the_documents() -> None:
    for current, target in itertools.product(DOCUMENTED_RUN_TRANSITIONS, repeat=2):
        if target in DOCUMENTED_RUN_TRANSITIONS[current]:
            require_run_transition(current, target)  # type: ignore[arg-type]
        else:
            with pytest.raises(InvalidTransitionError):
                require_run_transition(current, target)  # type: ignore[arg-type]


@pytest.mark.parametrize("recovery", [False, True])
def test_complete_frame_transition_table_matches_the_documents(recovery: bool) -> None:
    documented = DOCUMENTED_FRAME_RECOVERY_TRANSITIONS if recovery else DOCUMENTED_FRAME_TRANSITIONS
    for current, target in itertools.product(documented, repeat=2):
        if target in documented[current]:
            require_frame_transition(current, target, recovery=recovery)  # type: ignore[arg-type]
        else:
            with pytest.raises(InvalidTransitionError):
                require_frame_transition(current, target, recovery=recovery)  # type: ignore[arg-type]
