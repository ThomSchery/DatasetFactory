import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

export const E2E_RUNTIME_MARKER = ".datasetfactory-e2e-runtime";
const RUNTIME_PREFIX = "runtime-";

function assertOwnedLeaf(runtime) {
  const root = path.resolve(runtime.root);
  const playwrightRoot = path.resolve(runtime.playwrightRoot);
  if (path.dirname(root) !== playwrightRoot || !path.basename(root).startsWith(RUNTIME_PREFIX)) {
    throw new Error("Refusing to operate outside the launcher-owned Playwright runtime leaf");
  }
  const markerPath = path.join(root, E2E_RUNTIME_MARKER);
  if (
    !existsSync(markerPath) ||
    readFileSync(markerPath, "utf8") !== runtime.markerToken
  ) {
    throw new Error("Refusing to operate on a Playwright runtime leaf without its ownership marker");
  }
  return root;
}

export function createE2eRuntimeRoot(cacheRoot) {
  const resolvedCacheRoot = path.resolve(cacheRoot);
  const playwrightRoot = path.join(resolvedCacheRoot, "playwright");
  mkdirSync(playwrightRoot, { recursive: true });
  const root = mkdtempSync(path.join(playwrightRoot, RUNTIME_PREFIX));
  const markerToken = randomUUID();
  writeFileSync(path.join(root, E2E_RUNTIME_MARKER), markerToken, {
    encoding: "utf8",
    flag: "wx",
  });
  return { markerToken, playwrightRoot, root };
}

export function cleanupE2eRuntimeRoot(runtime) {
  const ownedRoot = assertOwnedLeaf(runtime);
  rmSync(ownedRoot, { force: true, recursive: true });
}
