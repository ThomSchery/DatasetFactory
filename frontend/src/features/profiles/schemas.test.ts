import { describe, expect, it } from "vitest";

import {
  CHARACTER_CLASS_ALPHABET,
  categorySchema,
  isDuplicateName,
  profileCreateSchema,
  regionSchema,
} from "./schemas";

/*
 * These pin the client-side schema against the backend rules it mirrors. Each
 * case names the backend check it stands in for, so a change on either side
 * shows up as a failing test rather than as a round trip the user pays for.
 */

const VALID = {
  name: "Gra testowa",
  reference_image_path: "D:\\gry\\hud.png",
  regions: [{ id: "r1", name: "Pasek zdrowia", x: 10, y: 20, width: 100, height: 40 }],
  categories: [{ kind: "character" as const, name: "7" }],
};

function messagesFor(value: unknown): string[] {
  const result = profileCreateSchema.safeParse(value);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe("the profile a user can submit", () => {
  it("accepts a complete profile", () => {
    expect(profileCreateSchema.safeParse(VALID).success).toBe(true);
  });

  it("requires a name — `profile_name_required`", () => {
    expect(messagesFor({ ...VALID, name: "   " })).toContain("Podaj nazwę profilu.");
  });

  it("caps the name at 200 characters — `profile_name_too_long`", () => {
    expect(messagesFor({ ...VALID, name: "x".repeat(201) })).toContain(
      "Nazwa profilu może mieć najwyżej 200 znaków.",
    );
  });

  it.each([
    ["a relative path", "gry\\hud.png"],
    ["a bare filename", "hud.png"],
  ])("rejects %s — `reference_path_not_absolute`", (_label, path) => {
    expect(messagesFor({ ...VALID, reference_image_path: path })).toContain(
      "Ścieżka musi być bezwzględna, np. D:\\gry\\hud.png.",
    );
  });

  it.each([
    ["a Windows drive", "D:\\gry\\hud.png"],
    ["a UNC share", "\\\\serwer\\udział\\hud.png"],
    ["a POSIX path", "/home/u/hud.png"],
  ])("accepts %s", (_label, path) => {
    expect(messagesFor({ ...VALID, reference_image_path: path })).toEqual([]);
  });

  it("requires at least one region — `regions_required`", () => {
    expect(messagesFor({ ...VALID, regions: [] })).toContain(
      "Zaznacz przynajmniej jeden region HUD na obrazie.",
    );
  });

  it("requires at least one class — `categories_required`", () => {
    expect(messagesFor({ ...VALID, categories: [] })).toContain(
      "Dodaj przynajmniej jedną klasę.",
    );
  });

  it("rejects two regions with the same name — `duplicate_region_name`", () => {
    const regions = [
      { id: "r1", name: "Pasek zdrowia", x: 0, y: 0, width: 10, height: 10 },
      // `_require_unique` compares case-folded, so this is the same name.
      { id: "r2", name: "pasek ZDROWIA", x: 20, y: 20, width: 10, height: 10 },
    ];

    expect(messagesFor({ ...VALID, regions })).toContain(
      "Nazwy regionów muszą być unikalne w profilu.",
    );
  });

  it("folds names the way `casefold` does, not the way `toLowerCase` does", () => {
    const regions = [
      { id: "r1", name: "Straße", x: 0, y: 0, width: 10, height: 10 },
      // `casefold` maps `ß` onto `ss`, so the backend reads one name here.
      { id: "r2", name: "STRASSE", x: 20, y: 20, width: 10, height: 10 },
    ];

    expect(messagesFor({ ...VALID, regions })).toContain(
      "Nazwy regionów muszą być unikalne w profilu.",
    );
  });

  it("rejects two classes with the same name — `duplicate_category_name`", () => {
    const categories = [
      { kind: "game" as const, name: "Nazwa mapy" },
      { kind: "game" as const, name: "nazwa mapy" },
    ];

    expect(messagesFor({ ...VALID, categories })).toContain(
      "Nazwy klas muszą być unikalne w profilu.",
    );
  });
});

describe("region geometry mirrors RegionRequest", () => {
  it.each([
    ["zero width", { width: 0 }, "Region musi mieć dodatnią szerokość."],
    ["zero height", { height: 0 }, "Region musi mieć dodatnią wysokość."],
  ])("rejects %s — `Field(gt=0)`", (_label, override, message) => {
    const result = regionSchema.safeParse({ ...VALID.regions[0], ...override });

    expect(result.success).toBe(false);
    expect(result.success ? [] : result.error.issues.map((issue) => issue.message)).toContain(
      message,
    );
  });

  it("rejects a negative origin — `Field(ge=0)`", () => {
    expect(regionSchema.safeParse({ ...VALID.regions[0], x: -1 }).success).toBe(false);
  });

  it("requires a name", () => {
    expect(regionSchema.safeParse({ ...VALID.regions[0], name: " " }).success).toBe(false);
  });
});

describe("base classes come from the OCR alphabet", () => {
  it("is exactly `_CHARACTER_CATEGORIES` from the definition engine", () => {
    expect(CHARACTER_CLASS_ALPHABET.join("")).toBe("-/0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ");
    // `-`, `/`, ten digits and twenty-six letters.
    expect(CHARACTER_CLASS_ALPHABET).toHaveLength(38);
  });

  it.each(["A", "7", "-", "/"])("accepts %s as a base class", (character) => {
    expect(categorySchema.safeParse({ kind: "character", name: character }).success).toBe(true);
  });

  it.each([
    ["a lowercase letter", "a"],
    ["a whole word", "HP"],
    ["a symbol outside the set", "%"],
  ])("rejects %s — `invalid_character_category`", (_label, name) => {
    expect(categorySchema.safeParse({ kind: "character", name }).success).toBe(false);
  });

  it("puts no such restriction on a per-game class", () => {
    expect(categorySchema.safeParse({ kind: "game", name: "nazwa mapy" }).success).toBe(true);
  });
});

describe("isDuplicateName", () => {
  it("ignores case and surrounding whitespace, the way `_require_unique` does", () => {
    expect(isDuplicateName(["Nazwa mapy"], "  nazwa MAPY  ")).toBe(true);
    expect(isDuplicateName(["Nazwa mapy"], "nazwa gracza")).toBe(false);
  });
});
