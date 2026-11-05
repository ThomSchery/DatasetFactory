import { expect, test, type Page } from "@playwright/test";

import { profileFixture } from "../src/test/fixtures";
import { ApiHarness } from "./apiHarness";
import { showWholeFrame } from "./profileFlow";

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
  documentOverflows: boolean;
  pickerHeight: number;
}

/**
 * FE-022: Repeat Previous is an inline list box now (Figma), so the control
 * that still grows the column is the class field in Annotations — closed at
 * rest, open with its list once a box is selected.
 */
async function measure(page: Page): Promise<LayoutMeasurement> {
  return page.evaluate(() => {
    const canvas = document.querySelector(".df-review-workspace__preview .df-region-overlay");
    const picker = document.querySelector(".df-annotation-popover .df-grouped-options");
    if (canvas === null || picker === null) {
      throw new Error("FE-019 layout surfaces are missing");
    }
    const root = document.documentElement;
    return {
      canvasRight: canvas.getBoundingClientRect().right,
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
    await showWholeFrame(page);

    const copyPanel = page.getByRole("region", { name: "Repeat Previous" });
    await expect(copyPanel).toBeVisible({ timeout: 30_000 });

    // From 992 px the picture grows with the window; measure at a short
    // window, where it sits at its 543 px minimum, so the fit is real.
    await page.setViewportSize({ height: 600, width });
    const fittedHeight = await page.evaluate(() => {
      const copy = document.querySelector(".df-review-copy");
      const preview = document.querySelector(".df-review-workspace__preview");
      const main = document.querySelector(".df-shell__main");
      if (copy === null || preview === null || main === null) {
        throw new Error("Copy panel, preview or main landmark is missing");
      }
      const bottom =
        Math.max(copy.getBoundingClientRect().bottom, preview.getBoundingClientRect().bottom) +
        window.scrollY;
      const mainPaddingBottom = Number.parseFloat(getComputedStyle(main).paddingBottom);
      return Math.ceil(bottom + mainPaddingBottom + 2);
    });
    await page.setViewportSize({ height: fittedHeight, width });

    const before = await measure(page);
    expect(before.documentOverflows, `resting document already overflows at ${String(width)}`).toBe(
      false,
    );

    // Selecting a box opens the class list inside Annotations.
    await page.getByRole("button", { name: "Class 7, 1 annotations" }).click();
    await expect(page.getByRole("listbox", { name: "Profile classes" })).toBeVisible();
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

    await page.getByRole("button", { name: "Collapse list Profile classes" }).click();
    const after = await measure(page);
    expect(after.canvasRight, `canvas moved when the picker closed at ${String(width)}`).toBe(
      before.canvasRight,
    );
  }
});
