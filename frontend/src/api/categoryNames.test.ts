import { describe, expect, it } from "vitest";

import {
  categoryNameDuplicateHintKey,
  categoryInputFromName,
  looksLikeDuplicateCategoryName,
} from "./categoryNames";

describe("category names", () => {
  it.each([
    ["8", { kind: "character", name: "8" }],
    [" a ", { kind: "character", name: "A" }],
    ["/", { kind: "character", name: "/" }],
    ["Health", { kind: "game", name: "Health" }],
    ["ſ", { kind: "game", name: "ſ" }],
    ["ı", { kind: "game", name: "ı" }],
  ] as const)("infers the category contract for %s", (value, expected) => {
    expect(categoryInputFromName(value)).toEqual(expected);
  });

  it("counts the 200 character limit in Unicode code points", () => {
    expect(categoryInputFromName("   ")).toBeNull();
    expect(categoryInputFromName("x".repeat(201))).toBeNull();
    expect(categoryInputFromName("🧩".repeat(101))).toEqual({
      kind: "game",
      name: "🧩".repeat(101),
    });
    expect(categoryInputFromName("🧩".repeat(201))).toBeNull();
  });

  it("uses only a browser hint while leaving Unicode casefold to the backend", () => {
    expect(looksLikeDuplicateCategoryName(["Score"], "  sCoRe ")).toBe(true);
    expect(looksLikeDuplicateCategoryName(["ſ"], "s")).toBe(false);
    expect(looksLikeDuplicateCategoryName(["ﬀ"], "ff")).toBe(false);
    expect(categoryNameDuplicateHintKey(" Score ")).toBe("score");
  });
});
