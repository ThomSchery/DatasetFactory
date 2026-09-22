import { describe, expect, it } from "vitest";

import { CATEGORY_GROUPS, categoryGroupIdOf, categoryGroupLabelOf, groupCategories } from "./categoryGroups";
import { CHARACTER_CLASS_ALPHABET } from "./categoryNames";
import type { Category } from "./types";

function category(name: string, kind: Category["kind"] = "character"): Category {
  return { id: `id-${name}`, kind, name };
}

describe("category groups", () => {
  it("offers exactly the four groups the two screens share", () => {
    expect(CATEGORY_GROUPS.map((group) => group.label)).toEqual([
      "Pola HUD (gra)",
      "Liczby",
      "Litery",
      "Symbole",
    ]);
  });

  it("places every character of the engine alphabet in exactly one group", () => {
    const placed = CHARACTER_CLASS_ALPHABET.map((name) => categoryGroupIdOf(category(name)));
    expect(placed.filter((id) => id === "digits")).toHaveLength(10);
    expect(placed.filter((id) => id === "letters")).toHaveLength(26);
    // `-` and `/` are neither a digit nor a letter, and they are annotated with.
    expect(CHARACTER_CLASS_ALPHABET.filter((name) => categoryGroupIdOf(category(name)) === "symbols"))
      .toEqual(["-", "/"]);
    expect(placed).toHaveLength(CHARACTER_CLASS_ALPHABET.length);
  });

  it("keeps game classes in their own group regardless of their name", () => {
    expect(categoryGroupIdOf(category("7", "game"))).toBe("game");
    expect(categoryGroupLabelOf(category("health & armour", "game"))).toBe("Pola HUD (gra)");
  });

  it("names the group a rename would move a class into", () => {
    // The FE-016 warning compares groups, not `kind`: both of these are
    // `character`, and the class still changes group.
    expect(categoryGroupLabelOf({ kind: "character", name: "7" })).toBe("Liczby");
    expect(categoryGroupLabelOf({ kind: "character", name: "A" })).toBe("Litery");
    expect(categoryGroupLabelOf({ kind: "character", name: "-" })).toBe("Symbole");
  });

  it("drops empty groups and keeps profile order inside the ones that remain", () => {
    const grouped = groupCategories(
      [category("9"), category("A"), category("-"), category("0"), category("score", "game")],
      (item) => item.name,
    );
    expect(grouped.map((group) => [group.label, group.items])).toEqual([
      ["Pola HUD (gra)", ["score"]],
      ["Liczby", ["9", "0"]],
      ["Litery", ["A"]],
      ["Symbole", ["-"]],
    ]);
  });

  it("renders no heading for a group the profile has nothing in", () => {
    const grouped = groupCategories([category("7"), category("8")], (item) => item.name);
    expect(grouped.map((group) => group.label)).toEqual(["Liczby"]);
  });
});
