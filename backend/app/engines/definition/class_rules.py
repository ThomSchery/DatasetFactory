"""How the regions of a profile and its classes belong together (FE-026, FE-030).

These are decisions, not writes: each function takes a snapshot of what the
profile holds and answers what has to change. Persistence reads the snapshot,
asks, and applies the answer inside its own transaction, so a rule can change —
the operator already changed two of them — without touching any SQL.

Names are compared the way every profile-scoped uniqueness check compares
them: stripped and case-folded (`fold_name`).
"""

from __future__ import annotations

from collections.abc import Collection, Iterable, Sequence
from dataclasses import dataclass


@dataclass(frozen=True)
class ClassSnapshot:
    """One class of a profile as persistence currently holds it."""

    id: str
    name: str
    kind: str  # "character" or "game"


@dataclass(frozen=True)
class ClassMove:
    """A class that keeps its identity and takes a new name."""

    id: str
    new_name: str


def fold_name(name: str) -> str:
    """The one folding the region and class rules use."""
    return name.strip().casefold()


def classes_to_remove(
    existing: Sequence[ClassSnapshot],
    kept_ids: Collection[str],
    region_names: Iterable[str],
) -> tuple[ClassSnapshot, ...]:
    """Classes a whole-definition save drops, in the order persistence listed them.

    A class the draft leaves out stays when it carries the name of a region the
    same save keeps (FE-026): the region would need it back a moment later,
    under a new identifier and a new ordinal, which is exactly what an export
    must never see.
    """
    kept = frozenset(kept_ids)
    carried = frozenset(fold_name(name) for name in region_names)
    return tuple(
        item for item in existing if item.id not in kept and fold_name(item.name) not in carried
    )


def next_class_ordinal(current_max: int | None, *, floor: int = 0) -> int:
    """The ordinal a new class takes.

    `current_max` is read before anything is removed, so an ordinal a dropped
    class held is never handed to a different class — the identifier an earlier
    export derived from it must keep its meaning. `floor` is the lowest ordinal
    allowed, for a save that already counted before it removed anything.
    """
    return max(floor, (current_max if current_max is not None else -1) + 1)


def class_moves_for_region_renames(
    classes: Sequence[ClassSnapshot],
    active_region_names: Iterable[str],
    renamed: Sequence[tuple[str, str]],
) -> tuple[ClassMove, ...]:
    """A renamed region takes its class along (FE-026).

    Renaming the class keeps its identifier, so every annotation the operator
    already drew under the old name follows the region. The class stays where it
    is when following would be a guess:

    - it is an OCR character class, which belongs to the alphabet;
    - another region of the same save now carries the old name (a swap, or a
      new box reusing it), so the class still has a region;
    - the new name already is a class, which the region simply adopts.
    """
    if not renamed:
        return ()
    by_name = {fold_name(item.name): item for item in classes}
    active = frozenset(fold_name(name) for name in active_region_names)
    moves: list[ClassMove] = []
    for old_name, new_name in renamed:
        old_key, new_key = fold_name(old_name), fold_name(new_name)
        found = by_name.get(old_key)
        if found is None or found.kind != "game":
            continue
        if old_key != new_key and (old_key in active or new_key in by_name):
            continue
        moves.append(ClassMove(found.id, new_name))
        del by_name[old_key]
        by_name[new_key] = found
    return tuple(moves)


def unused_classes_to_drop(
    classes: Sequence[ClassSnapshot],
    retired_names: Iterable[str],
    active_region_names: Iterable[str],
    used_ids: Collection[str],
) -> tuple[str, ...]:
    """Identifiers of the classes a removed region leaves behind (FE-030).

    The operator's rule: removing a region removes its class, unless a box in
    Review uses it. "Uses" is any annotation row, deleted ones included — a row
    the reviewer discarded still anchors the class, and dropping the class would
    fail or take history with it. A class also stays when a region of this very
    save carries the same name (a box redrawn under its old name), and an OCR
    character class is never touched: it belongs to the alphabet, not to a
    region.

    `retired_names` holds the names of removed regions and the old names of
    renamed ones. Ask after the renames have moved their classes: a class that
    followed its region carries the new name and is not a candidate, while one
    left behind (the region adopted an existing class) is.
    """
    retired = frozenset(fold_name(name) for name in retired_names)
    if not retired:
        return ()
    active = frozenset(fold_name(name) for name in active_region_names)
    used = frozenset(used_ids)
    return tuple(
        item.id
        for item in classes
        if item.kind == "game"
        and fold_name(item.name) in retired
        and fold_name(item.name) not in active
        and item.id not in used
    )


def missing_region_classes(
    class_names: Iterable[str],
    stored_region_names: Sequence[str],
    request_order: Sequence[str] = (),
) -> tuple[str, ...]:
    """Names that need a class so that every active region has one (FE-026).

    A HUD region names something the operator wants in the dataset: OCR reads
    it, and when OCR misses it the operator draws the box by hand under the
    region's name. So the class has to exist whichever route created the
    region — the profile screen, adding one region, `Save as`, or a profile older
    than this rule. A region whose name already is a class, of either kind, adds
    nothing.

    `request_order` is the region order of the request being written, so new
    classes follow the order the operator drew; stored regions (already in their
    own stable order) come after it. Answers the stripped names, once each.
    """
    taken = {fold_name(name) for name in class_names}
    active = frozenset(fold_name(name) for name in stored_region_names)
    missing: list[str] = []
    for name in (*request_order, *stored_region_names):
        key = fold_name(name)
        if key in taken or key not in active:
            continue
        taken.add(key)
        missing.append(name.strip())
    return tuple(missing)
