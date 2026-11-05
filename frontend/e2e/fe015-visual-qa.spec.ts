import { expect, test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { profileFixture } from "../src/test/fixtures";
import { ApiHarness } from "./apiHarness";
import { deterministicPng } from "./deterministicPng";
import { showWholeFrame } from "./profileFlow";

const screenshotDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../docs/tickets/FE-015/screenshots",
);

const visualProfile = profileFixture({
  categories: [
    { id: "category-1", kind: "character", name: "7" },
    ...Array.from({ length: 17 }, (_, index) => ({
      id: `visual-category-${String(index + 1)}`,
      kind: "character" as const,
      name: `Klasa kontrolna ${String(index + 1).padStart(2, "0")}`,
    })),
  ],
  regions: [{ id: "region-1", name: "Region 1", x: 320, y: 213, width: 640, height: 213 }],
  source_height: 852,
  source_width: 1280,
});

async function installVisualProfile(page: Page): Promise<void> {
  await page.route(/\/api\/v1\/profiles\/(?:current|profile-1)$/, (route) =>
    route.fulfill({
      body: JSON.stringify(visualProfile),
      contentType: "application/json",
      status: 200,
    }),
  );
}

test("FE-015 pokazuje stały panel, zoom, scrollbar i menu bboxa w obu viewportach", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const api = new ApiHarness({ phase: "review" });
  await api.install(page);
  await installVisualProfile(page);
  await mkdir(screenshotDirectory, { recursive: true });

  for (const viewport of [
    { height: 1000, width: 1440 },
    { height: 1080, width: 1920 },
  ]) {
    const suffix = `${String(viewport.width)}x${String(viewport.height)}`;
    await page.setViewportSize(viewport);
    await page.goto("/annotations/run-1");
    await showWholeFrame(page);

    const panel = page.getByRole("region", { name: "Annotation — nothing selected" });
    const image = page.locator(".df-review-workspace__preview .df-region-overlay");
    const frameCounter = page.getByRole("button", { name: /choose a frame/ });
    const overlay = page.getByRole("listbox", { name: "Annotation boxes on the frame" });

    await expect(panel).toBeVisible();
    await expect(page.getByRole("region", { name: "Dane klatki" })).toHaveCount(0);
    // FE-022: with nothing selected the class field rests closed and inert.
    await expect(panel.getByRole("option")).toHaveCount(0);
    await expect(panel.getByRole("textbox", { name: "Class" })).toHaveValue("");
    await expect(panel.getByRole("textbox", { name: "Class" })).toBeDisabled();
    await expect(panel.getByRole("button", { name: "Delete" })).toHaveCount(0);
    await expect(page.getByLabel("Canvas zoom")).toHaveText("100%");
    await expect(page.getByRole("button", { name: "Zoom out" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Zoom in" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reset view" })).toBeVisible();

    const panelBounds = await panel.boundingBox();
    const imageBounds = await image.boundingBox();
    if (panelBounds === null || imageBounds === null) {
      throw new Error("FE-015 panel or frame image has no browser geometry");
    }
    expect(
      panelBounds.x + panelBounds.width,
      `annotation panel must remain left of the image at ${suffix}`,
    ).toBeLessThanOrEqual(imageBounds.x);

    // The frame picker is the n/N counter now — a button, not a native select.
    await expect(frameCounter).toBeVisible();
    expect(await frameCounter.evaluate((element) => element.tagName)).toBe("BUTTON");

    // The class list is a fixed box that scrolls rather than growing.
    const classList = page.locator(".df-review-classes");
    const listMetrics = await classList.evaluate((element) => ({
      height: element.getBoundingClientRect().height,
      overflowY: getComputedStyle(element).overflowY,
    }));
    expect(listMetrics.overflowY).toBe("auto");
    expect(Math.round(listMetrics.height)).toBe(140);

    await writeFile(
      path.join(screenshotDirectory, `editor-no-selection-${suffix}.png`),
      deterministicPng(await page.screenshot({ animations: "disabled", fullPage: false })),
    );

    const shape = overlay.getByRole("option").first();
    await shape.click({ button: "right" });
    const menu = page.getByRole("menu", { name: "Box actions" });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Delete" })).toBeFocused();
    await expect(panel).toBeVisible();
    await writeFile(
      path.join(screenshotDirectory, `editor-context-menu-${suffix}.png`),
      deterministicPng(await page.screenshot({ animations: "disabled", fullPage: false })),
    );
  }

  expect(
    api.requests.filter((request) => !["GET", "HEAD", "OPTIONS"].includes(request.method)),
  ).toEqual([]);
});
