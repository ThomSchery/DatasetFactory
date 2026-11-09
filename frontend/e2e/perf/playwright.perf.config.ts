import { defineConfig } from "@playwright/test";
import path from "node:path";

import base from "../../playwright.config";

/*
 * FE-023 P3-b: a measurement, not a gate. `*.measure.ts` never matches the
 * default `*.spec.ts` pattern, so `npm run e2e` does not run it. From
 * `frontend/`: `node scripts/playwright.mjs test --config e2e/perf/playwright.perf.config.ts`.
 */
const frontendRoot = path.resolve(import.meta.dirname, "../..");
const servers = Array.isArray(base.webServer) ? base.webServer : base.webServer === undefined ? [] : [base.webServer];

export default defineConfig({
  ...base,
  testDir: ".",
  testMatch: /.*\.measure\.ts$/,
  webServer: servers.map((server) => ({ ...server, cwd: frontendRoot })),
});
