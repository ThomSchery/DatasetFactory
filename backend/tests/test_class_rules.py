"""The region ↔ class rules (FE-026, FE-030) as pure decisions — no database."""

from __future__ import annotations

from backend.app.engines.definition import ClassMove, ClassSnapshot, DatasetDefinitionEngine

ENGINE = DatasetDefinitionEngine()


def _game(identifier: str, name: str) -> ClassSnapshot:
    return ClassSnapshot(identifier, name, "game")


def _character(identifier: str, name: str) -> ClassSnapshot:
    return ClassSnapshot(identifier, name, "character")


# --- which classes a whole-definition save removes ---------------------------


def test_a_class_the_draft_leaves_out_is_removed_in_listed_order() -> None:
    existing = (_game("a", "kill"), _game("b", "score"), _character("c", "7"))

    removed = ENGINE.classes_to_remove(existing, kept_ids={"b"}, region_names=())

    assert [item.id for item in removed] == ["a", "c"]


def test_a_class_carrying_a_kept_regions_name_stays_even_when_left_out() -> None:
    existing = (_game("a", "Kill"), _game("b", "score"))

    removed = ENGINE.classes_to_remove(existing, kept_ids=set(), region_names=["  kill "])

    assert [item.id for item in removed] == ["b"]


# --- the ordinal of a new class ----------------------------------------------


def test_ordinals_continue_after_the_highest_one_ever_held() -> None:
    assert ENGINE.next_class_ordinal(None) == 0
    assert ENGINE.next_class_ordinal(5) == 6


def test_the_floor_keeps_a_dropped_classs_ordinal_from_being_reused() -> None:
    assert ENGINE.next_class_ordinal(1, floor=7) == 7
    assert ENGINE.next_class_ordinal(9, floor=7) == 10


# --- a renamed region takes its class along ----------------------------------


def test_a_renamed_region_takes_its_game_class_along() -> None:
    classes = (_game("a", "kill"),)

    moves = ENGINE.class_moves_for_region_renames(classes, ["frag"], [("kill", "frag")])

    assert moves == (ClassMove("a", "frag"),)


def test_a_character_class_is_never_renamed_with_a_region() -> None:
    classes = (_character("a", "7"),)

    moves = ENGINE.class_moves_for_region_renames(classes, ["8"], [("7", "8")])

    assert moves == ()


def test_the_class_stays_when_another_region_still_carries_the_old_name() -> None:
    classes = (_game("a", "kill"),)

    moves = ENGINE.class_moves_for_region_renames(classes, ["kill", "frag"], [("kill", "frag")])

    assert moves == ()


def test_a_swap_of_two_regions_moves_no_class() -> None:
    classes = (_game("a", "left"), _game("b", "right"))

    moves = ENGINE.class_moves_for_region_renames(
        classes, ["left", "right"], [("left", "right"), ("right", "left")]
    )

    assert moves == ()


def test_the_region_adopts_a_class_that_already_has_the_new_name() -> None:
    classes = (_game("a", "kill"), _game("b", "frag"))

    moves = ENGINE.class_moves_for_region_renames(classes, ["frag"], [("kill", "frag")])

    assert moves == ()


def test_a_case_only_rename_still_moves_the_class() -> None:
    classes = (_game("a", "kill"),)

    moves = ENGINE.class_moves_for_region_renames(classes, ["Kill"], [("kill", "Kill")])

    assert moves == (ClassMove("a", "Kill"),)


# --- a removed region takes its class with it unless something uses it -------


def test_a_removed_regions_unused_class_is_dropped() -> None:
    classes = (_game("a", "kill"), _game("b", "score"))

    dropped = ENGINE.unused_classes_to_drop(classes, ["kill"], ["score"], used_ids=set())

    assert dropped == ("a",)


def test_a_class_with_any_annotation_is_kept() -> None:
    classes = (_game("a", "kill"),)

    assert ENGINE.unused_classes_to_drop(classes, ["kill"], [], used_ids={"a"}) == ()


def test_a_class_stays_when_a_region_of_the_same_save_carries_its_name() -> None:
    classes = (_game("a", "kill"),)

    assert ENGINE.unused_classes_to_drop(classes, ["kill"], [" KILL "], used_ids=set()) == ()


def test_an_ocr_character_class_is_never_dropped() -> None:
    classes = (_character("a", "7"),)

    assert ENGINE.unused_classes_to_drop(classes, ["7"], [], used_ids=set()) == ()


def test_nothing_is_dropped_when_no_region_was_retired() -> None:
    classes = (_game("a", "kill"),)

    assert ENGINE.unused_classes_to_drop(classes, [], [], used_ids=set()) == ()


# --- every active region keeps a class of its own name -----------------------


def test_a_region_without_a_class_gets_one_in_the_order_of_the_request() -> None:
    missing = ENGINE.missing_region_classes(
        class_names=["7"],
        stored_region_names=["score", "kill"],
        request_order=["kill", "score"],
    )

    assert missing == ("kill", "score")


def test_a_region_whose_name_already_is_a_class_adds_nothing() -> None:
    missing = ENGINE.missing_region_classes(
        class_names=["Kill", "7"], stored_region_names=["kill", "timer"]
    )

    assert missing == ("timer",)


def test_a_requested_name_without_an_active_region_gets_no_class() -> None:
    missing = ENGINE.missing_region_classes(
        class_names=[], stored_region_names=["kill"], request_order=["gone", "kill"]
    )

    assert missing == ("kill",)


def test_names_are_stripped_and_each_class_is_added_once() -> None:
    missing = ENGINE.missing_region_classes(
        class_names=[],
        stored_region_names=["  kill ", "KILL"],
        request_order=["kill"],
    )

    assert missing == ("kill",)
