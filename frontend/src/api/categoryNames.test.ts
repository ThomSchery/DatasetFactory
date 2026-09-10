import { describe, expect, it } from "vitest";

import {
  caseFoldCategoryName,
  categoryInputFromName,
  isDuplicateCategoryName,
} from "./categoryNames";

describe("category names", () => {
  it.each([
    ["8", { kind: "character", name: "8" }],
    [" a ", { kind: "character", name: "A" }],
    ["/", { kind: "character", name: "/" }],
    ["Health", { kind: "game", name: "Health" }],
  ] as const)("infers the category contract for %s", (value, expected) => {
    expect(categoryInputFromName(value)).toEqual(expected);
  });

  it("does not propose empty or overlong names", () => {
    expect(categoryInputFromName("   ")).toBeNull();
    expect(categoryInputFromName("x".repeat(201))).toBeNull();
  });

  it("matches backend-style casing and surrounding whitespace for duplicates", () => {
    expect(isDuplicateCategoryName(["Score"], "  sCoRe ")).toBe(true);
    expect(caseFoldCategoryName("Straße")).toBe(caseFoldCategoryName("STRASSE"));
  });
});
