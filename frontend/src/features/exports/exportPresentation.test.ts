import { describe, expect, it } from "vitest";

import { safeWorkspaceRelativePath } from "./exportPresentation";

describe("workspace-relative export paths", () => {
  it.each([
    ["exports/export-1", "exports/export-1"],
    ["exports\\export-1", "exports/export-1"],
  ])("renders the relative path %s", (value, expected) => {
    expect(safeWorkspaceRelativePath(value)).toBe(expected);
  });

  it.each([
    "C:\\DatasetFactory\\workspace\\exports\\export-1",
    "C:workspace\\exports\\export-1",
    "D:/DatasetFactory/workspace/exports/export-1",
    "/srv/datasetfactory/exports/export-1",
    "\\\\server\\share\\export-1",
    "exports/../secrets",
  ])("never exposes the absolute or escaping path %s", (value) => {
    expect(safeWorkspaceRelativePath(value)).toBeNull();
  });
});
