import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  E2E_RUNTIME_MARKER,
  cleanupE2eRuntimeRoot,
  createE2eRuntimeRoot,
} from "./e2e-runtime-root.mjs";

test("creates and cleans only one marked leaf under a custom cache root", () => {
  const customCache = mkdtempSync(path.join(tmpdir(), "datasetfactory-custom-cache-"));
  const sentinel = path.join(customCache, "keep.txt");
  writeFileSync(sentinel, "keep", "utf8");
  try {
    const runtime = createE2eRuntimeRoot(customCache);
    assert.equal(path.dirname(runtime.root), path.join(path.resolve(customCache), "playwright"));
    assert.match(path.basename(runtime.root), /^runtime-/);
    assert.equal(
      readFileSync(path.join(runtime.root, E2E_RUNTIME_MARKER), "utf8"),
      runtime.markerToken,
    );

    cleanupE2eRuntimeRoot(runtime);
    assert.equal(readFileSync(sentinel, "utf8"), "keep");
  } finally {
    rmSync(customCache, { force: true, recursive: true });
  }
});

test("refuses cleanup of an unmarked foreign directory", () => {
  const customCache = mkdtempSync(path.join(tmpdir(), "datasetfactory-foreign-cache-"));
  const playwrightRoot = path.join(customCache, "playwright");
  const foreignRoot = path.join(playwrightRoot, "runtime-foreign");
  const sentinel = path.join(foreignRoot, "keep.txt");
  mkdirSync(foreignRoot, { recursive: true });
  writeFileSync(sentinel, "keep", "utf8");
  try {
    assert.throws(
      () =>
        cleanupE2eRuntimeRoot({
          markerToken: "not-present",
          playwrightRoot,
          root: foreignRoot,
        }),
      /ownership marker/,
    );
    assert.equal(readFileSync(sentinel, "utf8"), "keep");
  } finally {
    rmSync(customCache, { force: true, recursive: true });
  }
});
