import { expect, test, type Page } from "@playwright/test";

import { profileFixture } from "../src/test/fixtures";
import { ApiHarness } from "./apiHarness";

/*
 * FE-017 A. The operator's recording showed every bbox moving 15 px sideways
 * the moment a geometry save finished. The box never moved: a document
 * scrollbar appeared with the "Niezapisane" notice and vanished with it, and
 * the canvas lives in the `minmax(0, 1fr)` column that absorbs the difference.
 *
 * This file asserts a number, not a screenshot: the canvas's right edge before,
 * during and after the unsaved state, to the pixel.
 */

test.use({
  launchOptions: {
    args: ["--disable-gpu", "--disable-lcd-text", "--font-render-hinting=none"],
    /*
     * The one reason this file needs its own browser. Playwright's headless
     * default includes `--hide-scrollbars`, so scrollbars are zero pixels wide
     * and the regression under test is unobservable — which is precisely why
     * the existing suite never caught it.
     */
    ignoreDefaultArgs: ["--hide-scrollbars"],
  },
});

/**
 * A profile the size the operator works with. The stock fixture has one class,
 * whose annotation panel is short enough that the notice never tips the
 * document over — the measurement would then pass while proving nothing.
 */
const workingProfile = profileFixture({
  categories: [
    { id: "category-1", kind: "character", name: "7" },
    ...Array.from({ length: 18 }, (_, index) => ({
      id: `character-${String(index)}`,
      kind: "character" as const,
      name: `znak ${String(index)}`,
    })),
    ...Array.from({ length: 19 }, (_, index) => ({
      id: `game-${String(index)}`,
      kind: "game" as const,
      name: `pole HUD ${String(index)}`,
    })),
  ],
  source_height: 852,
  source_width: 1280,
});

interface LayoutMeasurement {
  canvasRight: number;
  documentOverflows: boolean;
}

async function measureLayout(page: Page): Promise<LayoutMeasurement> {
  return page.evaluate(() => {
    const canvas = document.querySelector(".df-region-overlay");
    if (canvas === null) {
      throw new Error("The review canvas is missing");
    }
    const root = document.documentElement;
    return {
      canvasRight: canvas.getBoundingClientRect().right,
      documentOverflows: root.scrollHeight > root.clientHeight,
    };
  });
}

test("FE-017 A: prawa krawędź kanwy nie drgnie przy plakietce „Niezapisane”", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const api = new ApiHarness({ phase: "review" });
  await api.install(page);
  await page.route(/\/api\/v1\/profiles\/profile-1$/, (route) =>
    route.fulfill({
      body: JSON.stringify(workingProfile),
      contentType: "application/json",
      status: 200,
    }),
  );

  /*
   * Whether the notice tips the document into overflow depends on the viewport
   * height, so the trigger is not live on every one of the three required
   * viewports: measured on `main`, 1440×1000 flips from "fits" to "overflows"
   * while 1920×1080 never overflows and 1920×1000 always does. The stability
   * assertion runs on all three; the run fails if the trigger fired on none,
   * which is the guard against this test quietly proving nothing.
   */
  let triggerObserved = false;

  for (const viewport of [
    { height: 1000, width: 1280 },
    { height: 1000, width: 1440 },
    { height: 1080, width: 1920 },
  ]) {
    const suffix = `${String(viewport.width)}x${String(viewport.height)}`;
    await page.setViewportSize(viewport);
    await page.goto("/annotations/run-1");

    const overlay = page.getByRole("listbox", { name: "Bbox anotacji na klatce" });
    await expect(overlay).toBeVisible();
    const unsavedNotice = page.getByRole("status", {
      name: "Niezapisane przesunięcie bboxa",
    });

    const before = await measureLayout(page);

    const classButton = page.getByRole("button", { name: /Klasa .* 1 anotacji/ });
    await classButton.click();
    await classButton.evaluate((element) => {
      if (element instanceof HTMLElement) {
        element.focus({ preventScroll: true });
      }
    });
    await page.keyboard.press("ArrowRight");
    await expect(unsavedNotice).toBeVisible();

    const during = await measureLayout(page);
    if (!before.documentOverflows && during.documentOverflows) {
      triggerObserved = true;
    }

    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    });
    await expect
      .poll(() => page.evaluate(() => document.activeElement === document.body))
      .toBe(true);
    await page.keyboard.press("Enter");
    await expect(unsavedNotice).toBeHidden();

    const after = await measureLayout(page);

    expect(
      during.canvasRight,
      `the canvas moved when „Niezapisane” appeared at ${suffix}`,
    ).toBe(before.canvasRight);
    expect(
      after.canvasRight,
      `the canvas moved when „Niezapisane” disappeared at ${suffix}`,
    ).toBe(before.canvasRight);
  }

  expect(
    triggerObserved,
    "no viewport tipped the document into overflow, so nothing above was tested",
  ).toBe(true);
});
