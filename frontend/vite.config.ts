import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

// With the `.ts` extension, so plain Node (`scripts/e2e-runtime-root.node.mjs`
// imports this config with type stripping) resolves the module as well.
import { designPresetPlugin } from "./src/styles/designPreset.ts";

export default defineConfig({
  // FE-024: `@theme` blocks of the figma-tailwind-tokens preset become `:root`
  // variables at build time; the project does not use Tailwind (F16).
  plugins: [designPresetPlugin(), react()],
  server: {
    host: "127.0.0.1",
    port: Number(process.env.DF_E2E_FRONTEND_PORT ?? 5173),
    strictPort: true,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${process.env.DF_E2E_BACKEND_PORT ?? process.env.DF_PORT ?? 8000}`,
        changeOrigin: false,
      },
    },
  },
  test: {
    environment: "jsdom",
    exclude: [...configDefaults.exclude, "e2e/**"],
    setupFiles: "./src/test/setup.ts",
  },
});
