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

/** The document height once the frames queued by a resize have run. */
async function settledDocumentHeight(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve(document.documentElement.scrollHeight);
          });
        });
      }),
  );
}

/**
 * Grows the viewport until it holds the whole document. The annotation panel
 * sizes itself to the viewport room after a resize, so a height read straight
 * after `setViewportSize` can be stale — the full gate caught exactly that at
 * 1440 px. Each read waits for the resize's frames, and the fit only counts
 * once two consecutive settled reads agree with the viewport.
 */
async function fitViewportToDocument(page: Page, width: number): Promise<void> {
  for (let pass = 0; pass < 10; pass += 1) {
    const height = await settledDocumentHeight(page);
    if (page.viewportSize()?.height === height && (await settledDocumentHeight(page)) === height) {
      return;
    }
    await page.setViewportSize({ height, width });
  }
  throw new Error(`the document height did not settle at ${String(width)} px`);
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
   * height. Fixed heights stopped working with FE-021: the Figma side column is
   * taller than 1000 px on its own, so at 1280×1000, 1440×1000 and 1920×1080
   * the document already scrolled before the notice appeared and the trigger
   * never fired. Like FE-019, each required width therefore fits the viewport
   * to the document with the annotation open and no notice, so the notice is
   * the one change that makes the scrollbar appear — at every width, not just
   * the one a fixed height happens to hit.
   */
  for (const width of [1280, 1440, 1920]) {
    const suffix = `${String(width)} px`;
    // Start below the content height: `body` is at least 100vh tall, so a
    // taller viewport would make the document "fit" without measuring it.
    await page.setViewportSize({ height: 600, width });
    await page.goto("/annotations/run-1");

    const overlay = page.getByRole("listbox", { name: "Bbox anotacji na klatce" });
    await expect(overlay).toBeVisible();
    const unsavedNotice = page.getByRole("status", {
      name: "Niezapisane przesunięcie bboxa",
    });

    const classButton = page.getByRole("button", { name: /Klasa .* 1 anotacji/ });
    await classButton.click();
    await classButton.evaluate((element) => {
      if (element instanceof HTMLElement) {
        element.focus({ preventScroll: true });
      }
    });
    await expect(page.getByRole("dialog", { name: /Edytuj anotację/ })).toBeVisible();
    await fitViewportToDocument(page, width);
    await expect(classButton).toBeFocused();

    const before = await measureLayout(page);
    expect(before.documentOverflows, `fitted document already overflows at ${suffix}`).toBe(false);

    await page.keyboard.press("ArrowRight");
    await expect(unsavedNotice).toBeVisible();

    const during = await measureLayout(page);
    expect(
      during.documentOverflows,
      `„Niezapisane” did not tip the document into overflow at ${suffix}, so nothing was tested`,
    ).toBe(true);

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
});
