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

// Load the actual TypeScript configs in fresh processes so each case sees its
// own environment and module caching cannot hide a configuration regression.
test("dev proxy honours DF_PORT and gives E2E its own priority", async () => {
  const { execFileSync } = await import("node:child_process");
  const frontendRoot = path.resolve(import.meta.dirname, "..");
  const base = { ...process.env };
  delete base.DF_PORT;
  delete base.DF_E2E_BACKEND_PORT;
  const target = (env) => execFileSync(process.execPath, ["--input-type=module", "-e", "import('./vite.config.ts').then(m => console.log(m.default.server.proxy['/api'].target))"], { cwd: frontendRoot, env: { ...base, ...env }, encoding: "utf8" }).trim();
  assert.equal(target({ DF_PORT: "8033" }), "http://127.0.0.1:8033");
  assert.equal(target({ DF_PORT: "8001", DF_E2E_BACKEND_PORT: "8033" }), "http://127.0.0.1:8033");
  assert.equal(target({}), "http://127.0.0.1:8000");
});

test("Playwright pins Vite to its own backend even with a dev DF_PORT", async () => {
  const { execFileSync } = await import("node:child_process");
  const frontendRoot = path.resolve(import.meta.dirname, "..");
  const env = { ...process.env, DF_PORT: "8001" };
  delete env.DF_E2E_BACKEND_PORT;
  delete env.DF_E2E_FRONTEND_PORT;
  const result = execFileSync(process.execPath, ["--input-type=module", "-e", "import('./playwright.config.ts').then(m => console.log(JSON.stringify(m.default.webServer.find(s => s.command === 'npm run dev'))))"], { cwd: frontendRoot, env, encoding: "utf8" });
  const server = JSON.parse(result);
  assert.equal(server.env.DF_E2E_BACKEND_PORT, "8000");
  assert.equal(server.env.DF_E2E_FRONTEND_PORT, "5173");
  assert.equal(server.env.DF_PORT, "8001");
});
