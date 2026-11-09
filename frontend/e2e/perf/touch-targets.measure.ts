import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

import { ApiHarness } from "../apiHarness";
import { showWholeFrame } from "../profileFlow";

/*
 * FE-023 P3-b: cost of one `useTouchTargets` update on a coarse pointer.
 *
 * Every animation-frame callback named `update` (the hook's only one) is timed
 * in the page. A scroll event in capture phase is what schedules it, so each
 * sample is one scroll → one update, as when a list or the page scrolls.
 * Reported: target count, p50 and p95 in ms over SAMPLES frames, per state.
 */

const SAMPLES = 300;
const RESULTS = path.resolve(
  process.env.DATASETFACTORY_CACHE_ROOT ?? "D:/DatasetFactory/cache",
  "playwright",
  "fe023-touch-perf.jsonl",
);

test.use({ hasTouch: true, isMobile: true, viewport: { width: 360, height: 900 } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const native = window.requestAnimationFrame.bind(window);
    const frames: number[] = [];
    Object.assign(window, { __touchFrames: frames });
    window.requestAnimationFrame = (callback) => native((time) => {
      if (callback.name !== "update") {
        callback(time);
        return;
      }
      const start = performance.now();
      callback(time);
      frames.push(performance.now() - start);
    });
  });
  await new ApiHarness({ phase: "review" }).install(page);
});

async function sample(page: Page, state: string) {
  await expect.poll(() => page.locator("[data-touch-target]").count()).toBeGreaterThan(0);
  const result = await page.evaluate(async (samples) => {
    const frames = (window as unknown as { __touchFrames: number[] }).__touchFrames;
    const frame = () => new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        resolve();
      });
    });
    await frame();
    await frame();
    frames.length = 0;
    for (let index = 0; index < samples; index += 1) {
      document.dispatchEvent(new Event("scroll"));
      await frame();
    }
    const sorted = [...frames].sort((a, b) => a - b);
    const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? Number.NaN;
    return {
      p50: at(0.5),
      p95: at(0.95),
      samples: sorted.length,
      targets: document.querySelectorAll("[data-touch-target]").length,
    };
  }, SAMPLES);
  const line = { state, ...result, at: new Date().toISOString() };
  fs.mkdirSync(path.dirname(RESULTS), { recursive: true });
  fs.appendFileSync(RESULTS, `${JSON.stringify(line)}\n`);
  console.log(JSON.stringify(line));
  expect(result.samples).toBeGreaterThan(SAMPLES * 0.9);
}

test("useTouchTargets update cost", async ({ page }) => {
  await page.goto("/annotations/run-1");
  await expect(page.getByRole("button", { name: "Class 7, 1 annotations" })).toBeVisible();
  await sample(page, "Review 360");
  await page.setViewportSize({ width: 992, height: 900 });
  await sample(page, "Review 992");
  await page.goto("/profiles");
  await showWholeFrame(page);
  await page.getByRole("listbox", { name: "HUD regions on the reference screenshot" }).getByRole("option").first().click();
  await page.getByRole("button", { name: "Expand group Numbers" }).click();
  await sample(page, "Profiles 992, Numbers expanded");
});
