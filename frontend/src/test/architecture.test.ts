import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

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

describe("design tokens are the only source of UI values", () => {
  const styleFiles = readdirSync("src", { recursive: true, encoding: "utf8" })
    .filter((entry) => entry.endsWith(".css"))
    .map((entry) => join("src", entry).replaceAll("\\", "/"))
    .filter((path) => path !== "src/styles/tokens.css")
    .map((path) => ({ path, contents: readFileSync(path, "utf8") }));

  it.each(styleFiles.map((file) => file.path))("%s uses no raw colour literals", (path) => {
    const file = styleFiles.find((candidate) => candidate.path === path);
    expect(file?.contents).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(file?.contents).not.toMatch(/\b(hsl|rgb)a?\(/);
  });
});
