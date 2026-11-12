import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  DesignPresetSyntaxError,
  convertThemeBlocks,
  designPresetPlugin,
  parseRootVariables,
} from "./designPreset";

const presetCss = readFileSync("src/styles/design-preset.css", "utf8");

describe("convertThemeBlocks", () => {
  it("turns `@theme static` into `:root` and keeps everything else as it was", () => {
    const css = "/* header */\n@theme static {\n  --a: 1px;\n  --b: #fff;\n}\n\n:root {\n  --c: 2px;\n}\n";
    expect(convertThemeBlocks(css)).toBe(
      "/* header */\n:root {\n  --a: 1px;\n  --b: #fff;\n}\n\n:root {\n  --c: 2px;\n}\n",
    );
  });

  it("converts plain `@theme` and `@theme inline` the same way", () => {
    expect(convertThemeBlocks("@theme {\n  --a: 1px;\n}")).toBe(":root {\n  --a: 1px;\n}");
    expect(convertThemeBlocks("@theme inline {\n  --a: 1px;\n}")).toBe(":root {\n  --a: 1px;\n}");
    expect(convertThemeBlocks("@theme static inline { --a: 1px; }")).toBe(":root { --a: 1px; }");
  });

  it("keeps comments inside the block, including ones that mention Tailwind", () => {
    const css = '@theme static {\n  /* Add after @import "tailwindcss". */\n  --a: 1px; /* @utility is a word */\n}';
    expect(convertThemeBlocks(css)).toBe(
      ':root {\n  /* Add after @import "tailwindcss". */\n  --a: 1px; /* @utility is a word */\n}',
    );
  });

  it("converts several blocks and returns a file without `@theme` unchanged", () => {
    expect(convertThemeBlocks("@theme { --a: 1px; }\nbody { color: red; }\n@theme static { --b: 2px; }")).toBe(
      ":root { --a: 1px; }\nbody { color: red; }\n:root { --b: 2px; }",
    );
    const plain = ":root { --a: 1px; }\n";
    expect(convertThemeBlocks(plain)).toBe(plain);
  });

  it.each([
    ["@theme reference", "@theme reference {\n  --a: 1px;\n}", /unsupported `@theme reference`/],
    ["@theme default", "@theme default {\n  --a: 1px;\n}", /unsupported `@theme default`/],
    ["@utility", "@theme { --a: 1px; }\n@utility tab-4 {\n  tab-size: 4;\n}", /`@utility` needs Tailwind/],
    ["@variant", "@variant dark (&:where(.dark, .dark *));\n@theme { --a: 1px; }", /`@variant` needs Tailwind/],
    ["@custom-variant", "@custom-variant hocus (&:hover, &:focus);", /`@custom-variant` needs Tailwind/],
    ["@apply", ".x {\n  @apply p-4;\n}", /`@apply` needs Tailwind/],
    ['@import "tailwindcss"', '@import "tailwindcss";\n@theme { --a: 1px; }', /`@import "tailwindcss` needs Tailwind/],
    ["namespace reset", "@theme {\n  --color-*: initial;\n  --a: 1px;\n}", /namespace declaration `--color-\*`/],
    ["`initial` value", "@theme {\n  --a: 1px;\n  --color-red-500: initial;\n}", /`--color-red-500: initial` is a Tailwind namespace reset/],
    ["non-custom declaration", "@theme {\n  color: red;\n}", /`color: red` is not a `--name: value` declaration/],
    ["nested rule", "@theme {\n  --a: 1px;\n  .x { color: red; }\n}", /nested block inside `@theme`/],
    ["unclosed block", "@theme {\n  --a: 1px;\n", /unclosed `@theme` block/],
  ])("refuses %s with the file and line", (_label, css, message) => {
    expect(() => convertThemeBlocks(css, "preset.css")).toThrow(DesignPresetSyntaxError);
    expect(() => convertThemeBlocks(css, "preset.css")).toThrow(message);
    expect(() => convertThemeBlocks(css, "preset.css")).toThrow(/^preset\.css:\d+: /);
  });

  it("names the line of the offending declaration", () => {
    const css = "@theme {\n  --a: 1px;\n  --b: 2px;\n  --color-*: initial;\n}";
    expect(() => convertThemeBlocks(css, "p.css")).toThrow(/^p\.css:4: /);
  });
});

describe("the committed preset", () => {
  it("converts to :root variables with the values written in design-preset.css", () => {
    const converted = convertThemeBlocks(presetCss, "design-preset.css");
    expect(converted).not.toMatch(/@theme/);
    const variables = parseRootVariables(converted);
    expect(variables.get("--color-surface-page")).toBe("#23262c");
    expect(variables.get("--spacing-site-padding-xs")).toBe("16px");
    expect(variables.get("--text-p-sm")).toBe("12px");
    expect(variables.get("--border-width-1")).toBe("1px");
    // 49 variables in the `@theme static` block and `--border-width-1` on `:root`.
    expect(variables.size).toBe(50);
  });

  it("checks out with LF on every machine, core.autocrlf=true included (FE-025 FIX1)", () => {
    const attribute = execFileSync("git", ["check-attr", "eol", "--", "src/styles/design-preset.css"], { encoding: "utf8" });
    expect(attribute.trim()).toBe("src/styles/design-preset.css: eol: lf");
    // What a Windows checkout with autocrlf would write for the committed blob.
    const checkedOut = execFileSync(
      "git",
      ["-c", "core.autocrlf=true", "cat-file", "--filters", "HEAD:frontend/src/styles/design-preset.css"],
      { encoding: "utf8" },
    );
    expect(checkedOut).not.toContain("\r");
    expect(checkedOut).toMatch(/^:root \{\n {2}--border-width-1: 1px;\n\}\n$/m);
  });

  it("is still the plugin's export, untouched (FE-024: never edited by hand)", () => {
    expect(presetCss.startsWith("/* Preset_3 | Colors: Dark;")).toBe(true);
    expect(presetCss).toMatch(/^@theme static \{$/m);
    expect(presetCss).toMatch(/^:root \{\n {2}--border-width-1: 1px;\n\}\n$/m);
  });

  it("swapping the preset changes the converted variables (no value is cached elsewhere)", () => {
    const swapped = presetCss
      .replace("--color-surface-page: #23262c;", "--color-surface-page: #101214;")
      .replace("--spacing-site-padding-xs: 16px;", "--spacing-site-padding-xs: 24px;");
    const variables = parseRootVariables(convertThemeBlocks(swapped));
    expect(variables.get("--color-surface-page")).toBe("#101214");
    expect(variables.get("--spacing-site-padding-xs")).toBe("24px");
    expect(variables.get("--color-surface-panel")).toBe("#2b303a");
  });
});

describe("parseRootVariables", () => {
  it("reads every :root rule in order and lets a later declaration win", () => {
    const variables = parseRootVariables(
      ":root { --a: 1px; /* --x: 9px; */ --b: var(--a); }\nbody { --c: 3px; }\n:root { --a: 2px; }",
    );
    expect([...variables.entries()]).toEqual([
      ["--a", "2px"],
      ["--b", "var(--a)"],
    ]);
  });
});

describe("designPresetPlugin", () => {
  const plugin = designPresetPlugin();
  const transform = plugin.transform as (code: string, id: string) => { code: string } | null;

  it("runs before Vite's CSS pipeline and only on CSS that holds `@theme`", () => {
    expect(plugin.enforce).toBe("pre");
    expect(transform(":root { --a: 1px; }", "/x/tokens.css")).toBeNull();
    expect(transform("@theme { --a: 1px; }", "/x/main.tsx")).toBeNull();
    expect(transform("@theme { --a: 1px; }", "/x/design-preset.css?inline")).toEqual({
      code: ":root { --a: 1px; }",
      map: null,
    });
  });

  it("fails the build with the file and line for unsupported syntax", () => {
    expect(() => transform("@theme {\n  --color-*: initial;\n}", "/x/design-preset.css")).toThrow(
      /^\/x\/design-preset\.css:2: namespace declaration/,
    );
  });
});
