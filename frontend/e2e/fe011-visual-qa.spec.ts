import { expect, test, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { ApiHarness } from "./apiHarness";
import { deterministicPng } from "./deterministicPng";

const screenshotDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../docs/tickets/FE-011/screenshots",
);

interface ViewportMetrics {
  image: { height: number; width: number };
  panel: { bottom: number; top: number };
  viewport: { height: number; width: number };
}

async function openEditedFrame(
  page: Page,
  viewport: { height: number; width: number },
): Promise<ViewportMetrics> {
  await page.setViewportSize(viewport);
  await page.goto("/annotations/run-1");
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.getByRole("button", { name: /Klasa .* 1 anotacji/ }).click();

  const image = page.getByRole("img", { name: /Klatka .* runu/ });
  const panel = page.getByRole("dialog", { name: /Edytuj anotację/ });
  await expect(image).toBeVisible();
  await expect(panel).toBeVisible();
  const imageBounds = await image.boundingBox();
  const panelBounds = await panel.boundingBox();
  if (imageBounds === null || panelBounds === null) {
    throw new Error("FE-011 image or annotation panel has no browser geometry");
  }

  const metrics = {
    image: { height: imageBounds.height, width: imageBounds.width },
    panel: { bottom: panelBounds.y + panelBounds.height, top: panelBounds.y },
    viewport,
  };
  expect(metrics.panel.top, "panel must remain below the image").toBeGreaterThanOrEqual(
    imageBounds.y + imageBounds.height,
  );
  expect(metrics.panel.bottom, "panel must fit in the viewport").toBeLessThanOrEqual(
    viewport.height + 0.5,
  );
  return metrics;
}

test("FE-011 daje obrazowi szerokość viewportu i pokazuje pan bez skrótów", async ({ page }) => {
  const api = new ApiHarness({ phase: "review" });
  await api.install(page);
  const mutations: string[] = [];
  page.on("request", (request) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      mutations.push(`${request.method()} ${new URL(request.url()).pathname}`);
    }
  });

  const measurements: Record<string, ViewportMetrics> = {};
  for (const viewport of [
    { width: 1280, height: 1000 },
    { width: 1440, height: 1000 },
    { width: 1920, height: 1080 },
  ]) {
    measurements[`${String(viewport.width)}x${String(viewport.height)}`] =
      await openEditedFrame(page, viewport);
  }

  expect(measurements["1280x1000"]?.image.width).toBeGreaterThan(860);
  expect(measurements["1440x1000"]?.image.width).toBeGreaterThan(1000);
  expect(measurements["1920x1080"]?.image.width).toBeGreaterThanOrEqual(1279);

  await openEditedFrame(page, { width: 1440, height: 1000 });
  const canvas = page.locator(".df-region-overlay");
  const preview = page.getByRole("region", { name: /Podgląd klatki/ });
  const toolbar = page.locator(".df-review-toolbar");
  const panel = page.getByRole("dialog", { name: /Edytuj anotację/ });
  const zoomStage = page.locator("[data-overlay-zoom-stage]");
  await canvas.scrollIntoViewIfNeeded();
  const canvasBefore = await canvas.boundingBox();
  const previewBefore = await preview.boundingBox();
  const toolbarBefore = await toolbar.boundingBox();
  if (canvasBefore === null || previewBefore === null || toolbarBefore === null) {
    throw new Error("FE-011 workspace has no browser geometry");
  }

  const center = {
    x: canvasBefore.x + canvasBefore.width / 2,
    y: canvasBefore.y + canvasBefore.height / 2,
  };
  await page.mouse.move(center.x, center.y);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -100);
  await page.mouse.wheel(0, -100);
  await page.keyboard.up("Control");
  await expect(page.getByLabel("Powiększenie kanwy")).toHaveText("156%");

  await page.mouse.move(10, 10);
  const handButton = page.getByRole("button", { name: "Przesuwaj kadr" });
  await expect(handButton).toBeVisible();
  await expect(handButton).toBeInViewport();
  await expect(handButton).toBeEnabled();
  await handButton.click();
  const activeHandButton = page.getByRole("button", { name: "Zakończ przesuwanie" });
  await expect(activeHandButton).toHaveAttribute("aria-pressed", "true");
  const beforePan = await zoomStage.evaluate((element) => getComputedStyle(element).transform);
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 96, center.y + 64, { steps: 4 });
  await page.mouse.up();
  const afterPan = await zoomStage.evaluate((element) => getComputedStyle(element).transform);
  expect(afterPan).not.toBe(beforePan);
  await expect(panel).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Wybierz klasę dla nowego bbox" })).toHaveCount(0);
  expect(mutations).toEqual([]);

  const canvasAfter = await canvas.boundingBox();
  const previewAfter = await preview.boundingBox();
  const toolbarAfter = await toolbar.boundingBox();
  const panelAfter = await panel.boundingBox();
  expect(canvasAfter?.height).toBe(canvasBefore.height);
  expect(previewAfter?.y).toBe(previewBefore.y);
  expect(toolbarAfter?.height).toBe(toolbarBefore.height);
  const panelBottom =
    panelAfter === null ? Number.POSITIVE_INFINITY : panelAfter.y + panelAfter.height;
  expect(panelBottom).toBeLessThanOrEqual(1000.5);

  const screenshot = await page.screenshot({ animations: "disabled", fullPage: false });
  await writeFile(
    path.join(screenshotDirectory, "annotations-pan-1440.png"),
    deterministicPng(screenshot),
  );

  console.log(`FE011_AFTER ${JSON.stringify(measurements)}`);
});

test("FE-011-FIX1 reset 1x unieważnia nadal trzymany pan", async ({ page }) => {
  const api = new ApiHarness({ phase: "review" });
  await api.install(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/annotations/run-1");

  const canvas = page.locator(".df-region-overlay");
  const zoomStage = page.locator("[data-overlay-zoom-stage]");
  await canvas.scrollIntoViewIfNeeded();
  const canvasBounds = await canvas.boundingBox();
  if (canvasBounds === null) {
    throw new Error("FE-011-FIX1 canvas has no browser geometry");
  }
  const center = {
    x: canvasBounds.x + canvasBounds.width / 2,
    y: canvasBounds.y + canvasBounds.height / 2,
  };
  await page.mouse.move(center.x, center.y);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -100);
  await page.mouse.wheel(0, -100);
  await page.keyboard.up("Control");
  await expect(page.getByLabel("Powiększenie kanwy")).toHaveText("156%");

  await page.getByRole("button", { name: "Przesuwaj kadr" }).click();
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await expect(canvas).toHaveAttribute("data-panning", "true");
  await page.keyboard.press("Tab");
  const resetButton = page.getByRole("button", { name: "Dopasuj kanwę do widoku" });
  await expect(resetButton).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Powiększenie kanwy")).toHaveText("100%");
  await expect(canvas).not.toHaveAttribute("data-panning");
  const resetTransform = await zoomStage.evaluate((element) => getComputedStyle(element).transform);

  await page.mouse.move(center.x + 96, center.y + 64, { steps: 4 });
  await page.mouse.up();

  await expect(page.getByLabel("Powiększenie kanwy")).toHaveText("100%");
  expect(await zoomStage.evaluate((element) => getComputedStyle(element).transform)).toBe(
    resetTransform,
  );
  await expect(page.getByRole("button", { name: "Przesuwaj kadr" })).toBeDisabled();
  await expect(page.getByRole("dialog", { name: "Wybierz klasę dla nowego bbox" })).toHaveCount(0);
  expect(
    api.requests.filter((request) => !["GET", "HEAD", "OPTIONS"].includes(request.method)),
  ).toEqual([]);
});
