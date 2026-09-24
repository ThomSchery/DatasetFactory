import { expect, test, type Page } from "@playwright/test";

import { profileFixture } from "../src/test/fixtures";
import { ApiHarness } from "./apiHarness";

test.use({
  launchOptions: {
    args: ["--disable-gpu", "--disable-lcd-text", "--font-render-hinting=none"],
    // Headless Chromium normally hides the very scrollbar whose gutter caused
    // FE-017. Without this override the right-edge assertion can pass falsely.
    ignoreDefaultArgs: ["--hide-scrollbars"],
  },
});

const wrappedTagProfile = profileFixture({
  categories: [
    { id: "category-1", kind: "character", name: "7" },
    { id: "hud-score", kind: "game", name: "score" },
    { id: "hud-health", kind: "game", name: "health & armour" },
    { id: "hud-timer", kind: "game", name: "round timer" },
    { id: "hud-overtime", kind: "game", name: "overtime indicator" },
  ],
  source_height: 852,
  source_width: 1280,
});

async function installRoutes(page: Page): Promise<void> {
  const api = new ApiHarness({ phase: "review" });
  api.previousClasses = {
    classes: wrappedTagProfile.categories.map((category, index) => ({
      category_id: category.id,
      count: index + 1,
    })),
    previous_frame_id: "frame-0",
    previous_frame_index: 16,
  };
  await api.install(page);
  await page.route(/\/api\/v1\/profiles\/profile-1$/, (route) =>
    route.fulfill({
      body: JSON.stringify(wrappedTagProfile),
      contentType: "application/json",
      status: 200,
    }),
  );
}

interface LayoutMeasurement {
  canvasRight: number;
  controlHeight: number;
  documentOverflows: boolean;
  pickerHeight: number;
}

async function measure(page: Page): Promise<LayoutMeasurement> {
  return page.evaluate(() => {
    const canvas = document.querySelector(".df-region-overlay");
    const control = document.querySelector(".df-review-copy .df-grouped-options__control");
    const picker = document.querySelector(".df-review-copy .df-grouped-options");
    if (canvas === null || control === null || picker === null) {
      throw new Error("FE-019 layout surfaces are missing");
    }
    const root = document.documentElement;
    return {
      canvasRight: canvas.getBoundingClientRect().right,
      controlHeight: control.getBoundingClientRect().height,
      documentOverflows: root.scrollHeight > root.clientHeight,
      pickerHeight: picker.getBoundingClientRect().height,
    };
  });
}

test("FE-019: prawa krawędź kanwy nie drgnie po rozwinięciu pola z zawiniętymi tagami", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await installRoutes(page);

  for (const width of [1280, 1440, 1920]) {
    await page.setViewportSize({ height: 1400, width });
    await page.goto("/annotations/run-1");

    const copyPanel = page.getByRole("region", { name: "Powtórz z poprzedniej klatki" });
    await expect(copyPanel).toBeVisible({ timeout: 30_000 });
    const tags = copyPanel.locator(".df-grouped-options__tag");
    await expect(tags).toHaveCount(4);
    const expand = copyPanel.getByRole("button", {
      name: /Rozwiń listę Klasy z poprzedniej klatki/,
    });
    await expect(expand).toBeVisible();

    // Fit the collapsed document exactly, then let the real dropdown make the
    // document overflow. This forces a scrollbar transition at every required
    // width instead of hoping a fixed viewport happens to hit the boundary.
    // `<main>` still has its own bottom padding below the last panel — a flat
    // buffer here previously missed exactly that padding and the "collapsed"
    // viewport it computed already overflowed before anything expanded.
    const fittedHeight = await page.evaluate(() => {
      const copy = document.querySelector(".df-review-copy");
      const main = document.querySelector(".df-shell__main");
      if (copy === null || main === null) {
        throw new Error("Copy panel or main landmark is missing");
      }
      const bottom = copy.getBoundingClientRect().bottom + window.scrollY;
      const mainPaddingBottom = Number.parseFloat(getComputedStyle(main).paddingBottom);
      return Math.ceil(bottom + mainPaddingBottom + 2);
    });
    await page.setViewportSize({ height: fittedHeight, width });

    const before = await measure(page);
    expect(before.documentOverflows, `collapsed document already overflows at ${String(width)}`).toBe(
      false,
    );
    expect(before.controlHeight, `tags did not wrap at ${String(width)}`).toBeGreaterThan(40);

    await expand.click();
    await expect(
      copyPanel.getByRole("group", {
        name: "Klasy z poprzedniej klatki i liczba ich wystąpień",
      }),
    ).toBeVisible();
    const expanded = await measure(page);

    expect(expanded.pickerHeight, `picker did not grow at ${String(width)}`).toBeGreaterThan(
      before.pickerHeight,
    );
    expect(expanded.documentOverflows, `expanded document did not overflow at ${String(width)}`).toBe(
      true,
    );
    expect(expanded.canvasRight, `canvas moved when the picker opened at ${String(width)}`).toBe(
      before.canvasRight,
    );

    await copyPanel
      .getByRole("button", { name: /Zwiń listę Klasy z poprzedniej klatki/ })
      .click();
    const after = await measure(page);
    expect(after.documentOverflows, `collapsed document still overflows at ${String(width)}`).toBe(
      false,
    );
    expect(after.canvasRight, `canvas moved when the picker closed at ${String(width)}`).toBe(
      before.canvasRight,
    );
  }
});
