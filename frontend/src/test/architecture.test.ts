import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { MAX_WIDTH_QUERY_VALUES, MIN_WIDTH_QUERY_VALUES } from "../styles/breakpoints";
import { convertThemeBlocks, parseRootVariables } from "../styles/designPreset";

/*
 * Structural gates from FE-001-F1 and the FE-001 Gate 3 criteria. These are
 * cheap to keep green and expensive to notice by review once five feature
 * tickets are landing on top of this foundation.
 */

interface SourceFile {
  path: string;
  contents: string;
}

function sourceFiles(root: string): SourceFile[] {
  return readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((entry) => /\.tsx?$/.test(entry))
    .map((entry) => join(root, entry).replaceAll("\\", "/"))
    .map((path) => ({ path, contents: readFileSync(path, "utf8") }));
}

const allSources = sourceFiles("src");
const productionSources = allSources.filter(
  (file) => !/\.test\.tsx?$/.test(file.path) && !file.path.startsWith("src/test/"),
);
/** Everything that is not the API layer: components, shell, routes, harness UI. */
const outsideApiLayer = productionSources.filter((file) => !file.path.startsWith("src/api/"));

describe("source layout", () => {
  it("found the sources it is supposed to police", () => {
    expect(productionSources.length).toBeGreaterThan(10);
    expect(outsideApiLayer.some((file) => file.path.startsWith("src/app/"))).toBe(true);
    expect(outsideApiLayer.some((file) => file.path.startsWith("src/components/"))).toBe(true);
  });
});

describe("no React component calls fetch", () => {
  it.each(outsideApiLayer.map((file) => file.path))("%s does not call fetch", (path) => {
    const file = outsideApiLayer.find((candidate) => candidate.path === path);
    expect(file?.contents).not.toMatch(/\bfetch\s*\(/);
  });

  it("keeps the single fetch call site in the API client", () => {
    const callSites = productionSources.filter((file) => /\bfetch\s*\(/.test(file.contents));
    expect(callSites.map((file) => file.path)).toEqual(["src/api/client.ts"]);
  });
});

describe("no component holds run status", () => {
  it("keeps run status literals inside the API layer", () => {
    const offenders = outsideApiLayer.filter((file) =>
      /["'](queued|review_ready|ocr_complete|review_pending)["']/.test(file.contents),
    );
    expect(offenders.map((file) => file.path)).toEqual([]);
  });

  it("declares the terminal status set exactly once", () => {
    const declarations = productionSources.filter((file) =>
      file.contents.includes("TERMINAL_RUN_STATUSES ="),
    );
    expect(declarations.map((file) => file.path)).toEqual(["src/api/runStatus.ts"]);
  });
});

describe("no optimistic updates for dataset data", () => {
  it("registers no onMutate handler anywhere", () => {
    // Matches a registered handler rather than the word appearing in prose.
    const offenders = allSources.filter((file) => /\bonMutate\s*[:(]/.test(file.contents));
    expect(offenders.map((file) => file.path)).toEqual([]);
  });

  it("uses no setQueryData outside the API layer", () => {
    const offenders = outsideApiLayer.filter((file) => file.contents.includes("setQueryData"));
    expect(offenders.map((file) => file.path)).toEqual([]);
  });
});

const PRESET_PATH = "src/styles/design-preset.css";
const TOKENS_PATH = "src/styles/tokens.css";

const allStyleFiles = readdirSync("src", { recursive: true, encoding: "utf8" })
  .filter((entry) => entry.endsWith(".css"))
  .map((entry) => join("src", entry).replaceAll("\\", "/"))
  .map((path) => ({ path, contents: readFileSync(path, "utf8") }));

function withoutComments(source: string): string {
  return source.replaceAll(/\/\*[\s\S]*?\*\//g, "").replaceAll(/(^|[^:])\/\/[^\n]*/g, "$1");
}

describe("design tokens are the only source of UI values", () => {
  const styleFiles = allStyleFiles.filter((file) => file.path !== TOKENS_PATH && file.path !== PRESET_PATH);

  it.each(styleFiles.map((file) => file.path))("%s uses no raw colour literals", (path) => {
    const file = styleFiles.find((candidate) => candidate.path === path);
    expect(file?.contents).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(file?.contents).not.toMatch(/\b(hsl|rgb)a?\(/);
  });

  it.each(productionSources.map((file) => file.path))("%s holds no colour literal (FE-024)", (path) => {
    const file = productionSources.find((candidate) => candidate.path === path);
    const code = withoutComments(file?.contents ?? "");
    expect(code).not.toMatch(/["'`]#[0-9a-fA-F]{3,8}\b/);
    expect(code).not.toMatch(/\b(hsl|rgb)a?\(\s*\d/);
  });
});

/*
 * FE-024 — the design preset is the single design centre. `tokens.css` maps
 * application tokens onto it with `var()` and holds a value of its own only in
 * the section marked "Not in the preset yet".
 */
describe("tokens.css is a mapping layer over the design preset", () => {
  const presetVariables = parseRootVariables(convertThemeBlocks(readFileSync(PRESET_PATH, "utf8"), PRESET_PATH));
  const tokensCss = readFileSync(TOKENS_PATH, "utf8");
  const marker = tokensCss.indexOf("2. Not in the preset yet");
  const mappingSection = parseRootVariables(`${tokensCss.slice(0, marker)}}`);
  const ownSection = parseRootVariables(`:root {${tokensCss.slice(marker)}`);

  /** Application token → the preset variable it must refer to (ticket FE-024 §3). */
  const EXPECTED_MAPPINGS: Record<string, string> = {
    "--size-none": "--spacing-0",
    "--size-xxs": "--spacing-4",
    "--size-xs": "--spacing-8",
    "--size-sm": "--spacing-16",
    "--size-md": "--spacing-24",
    "--size-lg": "--spacing-32",
    "--size-xl": "--spacing-gap-48",
    "--site-padding": "--spacing-site-padding-xs",
    "--element-padding-x-lg": "--spacing-element-padding-l-r-l",
    "--element-padding-x-md": "--spacing-element-padding-l-r-m",
    "--element-padding-x-sm": "--spacing-element-padding-l-r-s",
    "--element-padding-y-lg": "--spacing-element-padding-u-d-l",
    "--element-padding-y-md": "--spacing-element-padding-u-d-m",
    "--element-gap-lg": "--spacing-element-gap-l",
    "--element-gap-md": "--spacing-element-gap-m",
    "--font-size-xs": "--text-p-sm",
    "--font-size-md": "--text-p-md",
    "--radius-none": "--radius-0",
    "--radius-sm": "--radius-4",
    "--radius-md": "--radius-8",
    "--radius-lg": "--radius-16",
    "--border-width-default": "--border-width-1",
    "--color-background-primary-default": "--color-surface-page",
    "--color-surface-neutral-default": "--color-surface-panel",
    "--color-surface-neutral-raised": "--color-surface-panel-hover",
    "--color-surface-neutral-selected": "--color-surface-panel-selected",
    "--color-surface-neutral-hover": "--color-text-primary",
    "--color-stroke-weak-default": "--color-surface-panel-hover",
    "--color-stroke-panel-default": "--color-border-default",
    "--color-stroke-control-default": "--color-icon-placeholder",
    "--color-stroke-strong-default": "--color-text-secondary",
    "--color-text-strong-default": "--color-text-primary",
    "--color-text-weak-default": "--color-text-secondary",
    "--color-text-placeholder-default": "--color-text-placeholder",
    "--color-text-on-brand": "--color-icon-inverse",
    "--color-fill-brand-default": "--color-surface-panel-selected",
    "--color-fill-brand-impeccable": "--color-border-focus",
    "--color-fill-brand-impeccable-hover": "--color-border-focus",
    "--color-fill-brand-impeccable-active": "--color-border-focus",
    "--color-fill-brand-impeccable-soft": "--color-border-focus",
    // FE-025: icon roles and the pressed surface, by the preset's own names.
    "--color-icon-strong-default": "--color-icon-primary",
    "--color-icon-weak-default": "--color-icon-secondary",
    "--color-icon-muted-default": "--color-icon-placeholder",
    "--color-surface-neutral-pressed": "--color-surface-panel-pressed",
  };

  it("has the two sections in order", () => {
    expect(marker).toBeGreaterThan(0);
    expect(tokensCss.indexOf("1. Mappings onto the preset")).toBeLessThan(marker);
    expect(tokensCss.lastIndexOf(":root {")).toBeLessThan(marker);
  });

  it("maps exactly the tokens that have a counterpart in the preset", () => {
    expect([...mappingSection.keys()].sort()).toEqual(Object.keys(EXPECTED_MAPPINGS).sort());
  });

  it.each(Object.entries(EXPECTED_MAPPINGS))("%s refers to %s without a value of its own", (token, preset) => {
    const value = mappingSection.get(token);
    expect(value).toBeDefined();
    expect(presetVariables.has(preset)).toBe(true);
    const reference = /^var\((--[A-Za-z0-9_-]+)\)$/.exec(value ?? "");
    const alpha = /^color-mix\(in srgb, var\((--[A-Za-z0-9_-]+)\) \d+%, transparent\)$/.exec(value ?? "");
    expect(reference?.[1] ?? alpha?.[1]).toBe(preset);
  });

  it("keeps every own value in the section marked as outside the preset, annotated", () => {
    const own = [...ownSection.keys()];
    expect(own.length).toBeGreaterThan(20);
    for (const token of own) {
      expect(mappingSection.has(token), `${token} is declared in both sections`).toBe(false);
      expect(presetVariables.has(token), `${token} shadows a preset variable`).toBe(false);
    }
    // No own value repeats a preset colour: that is a mapping in disguise.
    const presetColours = new Set([...presetVariables.values()].filter((v) => v.startsWith("#")));
    for (const [token, value] of ownSection) {
      expect(presetColours.has(value.toLowerCase()), `${token} = ${value} is a preset colour`).toBe(false);
    }
  });

  it("declares nothing but mappings and own values on :root", () => {
    const body = withoutComments(tokensCss).replace(/^[\s\S]*?:root\s*\{/, "").replace(/\}\s*$/, "");
    const others = body
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith("--"));
    expect(others).toEqual(["color-scheme: dark"]);
  });
});

/*
 * FE-024 — one canonical set of width thresholds (`src/styles/breakpoints.ts`).
 * `@media` cannot read a custom property, so every width query in the CSS
 * must repeat one of those values literally, and no TS file outside the
 * module may hold a threshold of its own.
 */
describe("width thresholds come from breakpoints.ts alone", () => {
  const widthQuery = /\((min|max)-width:\s*([\d.]+)px\)/g;

  it.each(allStyleFiles.map((file) => file.path))("%s queries only canonical widths", (path) => {
    const file = allStyleFiles.find((candidate) => candidate.path === path);
    const offenders: string[] = [];
    for (const match of withoutComments(file?.contents ?? "").matchAll(widthQuery)) {
      const allowed = match[1] === "min" ? MIN_WIDTH_QUERY_VALUES : MAX_WIDTH_QUERY_VALUES;
      if (!allowed.includes(Number(match[2]))) offenders.push(match[0]);
    }
    expect(offenders).toEqual([]);
  });

  it("pairs each max-width with the min-width it must not overlap", () => {
    expect(MIN_WIDTH_QUERY_VALUES).toEqual([576, 768, 992, 1200]);
    expect(MAX_WIDTH_QUERY_VALUES).toEqual([575.98, 767.98, 991.98, 1199.98]);
  });

  it("keeps the width literals out of the TS sources", () => {
    const thresholds = /\b(575|576|720|767|768|960|991|992|1199|1200)\b/;
    const offenders = productionSources
      .filter((file) => file.path !== "src/styles/breakpoints.ts")
      .filter((file) => thresholds.test(withoutComments(file.contents)))
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });

  it("drives the shell's strip layout from the md breakpoint", () => {
    const shell = readFileSync("src/app/AppShell.tsx", "utf8");
    expect(shell).toMatch(/const STRIP_MIN_WIDTH = BREAKPOINTS\.md;/);
  });
});
