# Checkpoints and recovery

Declare checkpoints in the run graph; do not assume the same gates for every run.

## Required gate types

- `direction`: user chooses a visual or structural direction.
- `asset`: user approves a master before derived variants are generated.
- `mechanical`: validator must pass before dependants run.
- `integration`: target render must be inspected before packaging or publish is offered.

At a gate, show:

- current artifact and path;
- evidence used;
- acceptance criteria;
- validator result;
- next capability if accepted;
- cost of revising later.

On rejection, preserve the rejected artifact and reason in the run manifest. Retry from the smallest upstream capability that can correct the problem. Never regenerate downstream variants from a rejected master.

On missing tools, preserve inputs and manifest state, report the exact unavailable operation, and offer a manual handoff format. Do not mark the capability complete.
