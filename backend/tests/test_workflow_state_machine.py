from __future__ import annotations

import itertools

import pytest

from backend.app.managers.workflow.state_machine import (
    FRAME_RECOVERY_TRANSITIONS,
    FRAME_STAGES,
    FRAME_TRANSITIONS,
    RUN_STATUSES,
    RUN_TRANSITIONS,
    InvalidTransitionError,
    require_frame_transition,
    require_run_transition,
)


def test_complete_run_transition_table_allows_only_documented_pairs() -> None:
    for current, target in itertools.product(RUN_STATUSES, repeat=2):
        if target in RUN_TRANSITIONS[current]:
            require_run_transition(current, target)
        else:
            with pytest.raises(InvalidTransitionError):
                require_run_transition(current, target)


@pytest.mark.parametrize("recovery", [False, True])
def test_complete_frame_transition_table_allows_only_documented_pairs(recovery: bool) -> None:
    table = FRAME_RECOVERY_TRANSITIONS if recovery else FRAME_TRANSITIONS
    for current, target in itertools.product(FRAME_STAGES, repeat=2):
        if target in table[current]:
            require_frame_transition(current, target, recovery=recovery)
        else:
            with pytest.raises(InvalidTransitionError):
                require_frame_transition(current, target, recovery=recovery)
