import { describe, expect, it } from "vitest";

import type { Category } from "../../api";
import { categoryIdsOfKind, copyOptionGroups, copyPreviousTarget } from "./copySelection";

const CATEGORIES: readonly Category[] = [
  { id: "score", kind: "game", name: "Score" },
  { id: "timer", kind: "game", name: "Timer" },
  { id: "zero", kind: "character", name: "0" },
  { id: "one", kind: "character", name: "1" },
  { id: "two", kind: "character", name: "2" },
];

describe("copyOptionGroups", () => {
  it("splits the profile into the two named levels in panel order", () => {
    expect(copyOptionGroups(CATEGORIES)).toEqual([
      {
        id: "game",
        label: "Pola HUD (gra)",
        options: [
          { id: "score", label: "Score" },
          { id: "timer", label: "Timer" },
        ],
      },
      {
        id: "character",
        label: "Znaki",
        options: [
          { id: "zero", label: "0" },
          { id: "one", label: "1" },
          { id: "two", label: "2" },
        ],
      },
    ]);
  });

  it("drops a level the profile has no classes for", () => {
    expect(copyOptionGroups([CATEGORIES[2] as Category]).map((group) => group.id)).toEqual([
      "character",
    ]);
  });
});

describe("copyPreviousTarget", () => {
  it("has nothing to ask for when nothing is selected", () => {
    expect(copyPreviousTarget([], CATEGORIES)).toBeNull();
  });

  it("keeps a whole level as the scope the backend already answered", () => {
    expect(copyPreviousTarget(categoryIdsOfKind(CATEGORIES, "game"), CATEGORIES)).toEqual({
      scope: "game",
    });
    expect(copyPreviousTarget(categoryIdsOfKind(CATEGORIES, "character"), CATEGORIES)).toEqual({
      scope: "character",
    });
  });

  it("keeps a single class as the single-category scope", () => {
    expect(copyPreviousTarget(["one"], CATEGORIES)).toEqual({
      category_id: "one",
      scope: "category",
    });
  });

  it("sends an arbitrary subset as one list, in profile order", () => {
    expect(copyPreviousTarget(["two", "zero"], CATEGORIES)).toEqual({
      category_ids: ["zero", "two"],
      scope: "categories",
    });
  });

  it("sends a cross-level selection as one list rather than two requests", () => {
    expect(copyPreviousTarget(["score", "zero"], CATEGORIES)).toEqual({
      category_ids: ["score", "zero"],
      scope: "categories",
    });
  });

  it("ignores an identifier the profile no longer has", () => {
    expect(copyPreviousTarget(["one", "removed-class"], CATEGORIES)).toEqual({
      category_id: "one",
      scope: "category",
    });
  });
});
