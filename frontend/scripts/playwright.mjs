import { spawnSync } from "node:child_process";
import path from "node:path";

const cacheRoot = process.env.DATASETFACTORY_CACHE_ROOT ?? "D:/DatasetFactory/cache";
const cli = path.resolve("node_modules/@playwright/test/cli.js");
const env = {
  ...process.env,
  DATASETFACTORY_CACHE_ROOT: cacheRoot,
  DATASETFACTORY_E2E_ROOT:
    process.env.DATASETFACTORY_E2E_ROOT ?? path.join(cacheRoot, "playwright", "runtime"),
  PLAYWRIGHT_BROWSERS_PATH:
    process.env.PLAYWRIGHT_BROWSERS_PATH ?? path.join(cacheRoot, "ms-playwright"),
};
const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {
  env,
  stdio: "inherit",
});

if (result.error) {
  throw result.error;
}
process.exit(result.status ?? 1);
