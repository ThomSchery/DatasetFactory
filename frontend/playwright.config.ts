import { defineConfig, devices } from "@playwright/test";

const cacheRoot = process.env.DATASETFACTORY_CACHE_ROOT ?? "D:/DatasetFactory/cache";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  outputDir: `${cacheRoot}/playwright/test-results`,
  reporter: [["line"], ["html", { open: "never", outputFolder: `${cacheRoot}/playwright/report` }]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:5173",
    browserName: "chromium",
    trace: "retain-on-failure",
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
