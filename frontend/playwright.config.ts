import { defineConfig, devices } from "@playwright/test";

const frontendPort = process.env.DF_E2E_FRONTEND_PORT ?? "5173";
const backendPort = process.env.DF_E2E_BACKEND_PORT ?? "8000";
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
    baseURL: `http://127.0.0.1:${frontendPort}`,
    browserName: "chromium",
    launchOptions: {
      args: ["--disable-gpu", "--disable-lcd-text", "--font-render-hinting=none"],
    },
    trace: "retain-on-failure",
    viewport: { width: 1440, height: 1000 },
  },
  webServer: [
    {
      command: "node scripts/e2e-backend.mjs",
      url: `http://127.0.0.1:${backendPort}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "npm run dev",
      env: { ...process.env, DF_E2E_BACKEND_PORT: backendPort, DF_E2E_FRONTEND_PORT: frontendPort },
      url: `http://127.0.0.1:${frontendPort}`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
