import { spawnSync } from "node:child_process";
import path from "node:path";

import { cleanupE2eRuntimeRoot, createE2eRuntimeRoot } from "./e2e-runtime-root.mjs";

const cacheRoot = process.env.DATASETFACTORY_CACHE_ROOT ?? "D:/DatasetFactory/cache";
const runtime = createE2eRuntimeRoot(cacheRoot);
const cli = path.resolve("node_modules/@playwright/test/cli.js");
const env = {
  ...process.env,
  DATASETFACTORY_CACHE_ROOT: cacheRoot,
  DATASETFACTORY_E2E_MARKER_TOKEN: runtime.markerToken,
  DATASETFACTORY_E2E_ROOT: runtime.root,
  PLAYWRIGHT_BROWSERS_PATH:
    process.env.PLAYWRIGHT_BROWSERS_PATH ?? path.join(cacheRoot, "ms-playwright"),
};

let result;
try {
  result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {
    env,
    stdio: "inherit",
  });
} finally {
  cleanupE2eRuntimeRoot(runtime);
}

if (result.error) {
  throw result.error;
}
process.exit(result.status ?? 1);
