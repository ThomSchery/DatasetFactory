import { expect, test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { profileFixture } from "../src/test/fixtures";
import { ApiHarness } from "./apiHarness";
import { deterministicPng } from "./deterministicPng";

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

    const panel = page.getByRole("region", { name: "Anotacja bez zaznaczenia" });
    const image = page.getByRole("img", { name: /Klatka .* runu/ });
    const frameSelect = page.getByRole("combobox", { name: "Wybierz klatkę" });
    const frameSelectField = frameSelect.locator("xpath=..");
    const overlay = page.getByRole("listbox", { name: "Bbox anotacji na klatce" });

    await expect(panel).toBeVisible();
    await expect(page.getByRole("region", { name: "Dane klatki" })).toHaveCount(0);
    await expect(
      page.getByText("Wybierz bbox z listy lub bezpośrednio na obrazie."),
    ).toHaveCount(0);
    await expect(panel.getByRole("option")).toHaveCount(18);
    await expect(panel.getByRole("textbox", { name: "Klasa" })).toHaveValue("");
    await expect(panel.getByRole("button", { name: "Usuń" })).toBeDisabled();
    await expect(panel.getByRole("button", { name: "Zapisz klasę" })).toBeDisabled();
    await expect(page.getByLabel("Powiększenie kanwy")).toHaveText("100%");
    await expect(page.getByRole("button", { name: "Pomniejsz kanwę" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Powiększ kanwę" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Dopasuj kanwę do widoku" })).toBeVisible();

    const panelBounds = await panel.boundingBox();
    const imageBounds = await image.boundingBox();
    if (panelBounds === null || imageBounds === null) {
      throw new Error("FE-015 panel or frame image has no browser geometry");
    }
    expect(
      panelBounds.x + panelBounds.width,
      `annotation panel must remain left of the image at ${suffix}`,
    ).toBeLessThanOrEqual(imageBounds.x);

    const selectMetrics = await frameSelect.evaluate((element) => {
      const field = element.parentElement;
      if (field === null) {
        throw new Error("Frame select has no field wrapper");
      }
      const chevron = getComputedStyle(field, "::after");
      return {
        appearance: getComputedStyle(element).appearance,
        chevronBorderRight: chevron.borderRightWidth,
        chevronContent: chevron.content,
        chevronPointerEvents: chevron.pointerEvents,
        tagName: element.tagName,
      };
    });
    expect(selectMetrics).toMatchObject({
      appearance: "none",
      chevronPointerEvents: "none",
      tagName: "SELECT",
    });
    expect(selectMetrics.chevronBorderRight).not.toBe("0px");
    expect(selectMetrics.chevronContent).not.toBe("none");
    await expect(frameSelectField).toBeVisible();

    const categoryList = panel.locator(".df-grouped-options__list");
    const scrollbarMetrics = await categoryList.evaluate((element) => {
      const root = getComputedStyle(document.documentElement);
      return {
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        thumbRadius: getComputedStyle(element, "::-webkit-scrollbar-thumb").borderRadius,
        tokenRadius: root.getPropertyValue("--radius-pill").trim(),
      };
    });
    expect(scrollbarMetrics.scrollHeight).toBeGreaterThan(scrollbarMetrics.clientHeight);
    expect(scrollbarMetrics.thumbRadius).toBe(scrollbarMetrics.tokenRadius);
    await categoryList.evaluate((element) => {
      element.scrollTop = element.scrollHeight / 3;
    });
    await expect
      .poll(() => categoryList.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
    await categoryList.hover();

    await writeFile(
      path.join(screenshotDirectory, `editor-no-selection-${suffix}.png`),
      deterministicPng(await page.screenshot({ animations: "disabled", fullPage: false })),
    );

    const shape = overlay.getByRole("option").first();
    await shape.click({ button: "right" });
    const menu = page.getByRole("menu", { name: "Akcje bboxa" });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Usuń" })).toBeFocused();
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
