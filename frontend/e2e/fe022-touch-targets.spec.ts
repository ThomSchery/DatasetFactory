import { expect, test, type Locator } from "@playwright/test";
import { ApiHarness } from "./apiHarness";
import { showWholeFrame } from "./profileFlow";

test.use({ hasTouch: true, isMobile: true, viewport: { width: 360, height: 900 } });

/** Browser hit testing, including the corners of the required 48px square.
 * A label associated with an input is a real native activation target too. */
async function expectTouchTarget(target: Locator, radius = 23) {
  await target.scrollIntoViewIfNeeded();
  await expect.poll(() => target.evaluate((element, radius) => {
    const box = element.getBoundingClientRect();
    return [-radius, 0, radius].flatMap((dx) => [-radius, 0, radius].flatMap((dy) => {
      const hit = document.elementFromPoint(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
      const label = hit?.closest("label");
      return hit !== null && (element.contains(hit) || (label instanceof HTMLLabelElement && label.control === element))
        ? [] : [{ dx, dy, hit: hit?.tagName, class: hit?.getAttribute("class") }];
    }));
  }, radius)).toEqual([]);
}

/** Figma's dense controls keep their geometry and split the gap. Check the
 * actual browser owner on both sides and at the midpoint (no dead zone). */
async function expectSharedGap(first: Locator, second: Locator, axis: "x" | "y") {
  await expectTouchTarget(first, 15.5);
  await expectTouchTarget(second, 15.5);
  await first.scrollIntoViewIfNeeded();
  const secondHandle = await second.elementHandle();
  if (!secondHandle) throw new Error("Missing adjacent target");
  await expect.poll(() => first.evaluate((a, { b, axis }) => {
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    const middle = axis === "y" ? (ra.bottom + rb.top) / 2 : (ra.right + rb.left) / 2;
    const cross = axis === "y" ? (Math.max(ra.left, rb.left) + Math.min(ra.right, rb.right)) / 2
      : (Math.max(ra.top, rb.top) + Math.min(ra.bottom, rb.bottom)) / 2;
    const hits = [-1, 0, 1].map((delta) => {
      const hit = document.elementFromPoint(axis === "x" ? middle + delta : cross, axis === "y" ? middle + delta : cross);
      return a.contains(hit) ? "first" : b.contains(hit) ? "second" : hit?.getAttribute("class");
    });
    return { first: hits[0], middleOwned: hits[1] === "first" || hits[1] === "second", second: hits[2] };
  }, { b: secondHandle, axis })).toEqual({ first: "first", middleOwned: true, second: "second" });
}

test.beforeEach(async ({ page }) => {
  await new ApiHarness({ phase: "review" }).install(page);
});

test("FE-022 touch: Run inputs, combobox and adjacent options", async ({ page }) => {
  await page.goto("/run");
  expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
  const source = page.getByRole("combobox", { name: "Source file" });
  await expect(source).toBeEnabled();
  await expectTouchTarget(source);
  await expectTouchTarget(page.getByLabel("Sample rate"));
  await source.click();
  await expectSharedGap(page.getByRole("button", { name: "Collapse group Imported videos" }),
    page.getByRole("option", { name: /synthetic-hud/ }), "y");
});

test("FE-022 touch: profile checkbox rows and tool buttons", async ({ page }) => {
  await page.goto("/profiles");
  await showWholeFrame(page);
  await page.getByRole("listbox", { name: "HUD regions on the reference screenshot" }).getByRole("option").first().click();
  const numbers = page.getByRole("checkbox", { name: "Numbers", exact: true });
  await expect(numbers).toBeVisible();
  await expectSharedGap(page.getByRole("button", { name: "Expand group Numbers" }), numbers, "x");
  await page.getByRole("button", { name: "Expand group Numbers" }).click();
  await expectSharedGap(numbers, page.getByRole("checkbox", { name: "7", exact: true }), "y");
  await expectSharedGap(page.getByRole("button", { name: "Zoom out", exact: true }),
    page.getByRole("button", { name: "Zoom in", exact: true }), "x");
});

test("FE-022 touch: filter pills and workspace links", async ({ page }) => {
  await page.goto("/annotations/run-1");
  const filters = page.getByRole("group", { name: "Frame status filter" });
  await expect(filters).toBeVisible();
  const pills = filters.getByRole("button");
  await expectSharedGap(pills.nth(0), pills.nth(3), "y");
  await page.setViewportSize({ width: 992, height: 900 });
  for (const pill of await pills.all()) await expectTouchTarget(pill);
  await page.goto("/run");
  for (const link of await page.locator(".df-nav-item--segment").all()) await expectTouchTarget(link);
});

test("FE-022 touch: Upload tile, drawer and tablet sidebar", async ({ page }) => {
  await page.goto("/materials");
  await expectTouchTarget(page.getByRole("button", { name: "Upload Video", exact: true }));
  await expectTouchTarget(page.getByRole("button", { name: "Enter path", exact: true }));
  await page.getByRole("button", { name: "Sections", exact: true }).click();
  const drawerLinks = page.locator(".df-side-nav--drawer .df-nav-item");
  await expect(drawerLinks).toHaveCount(4);
  for (const link of await drawerLinks.all()) await expectTouchTarget(link);
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 992, height: 900 });
  const links = page.locator(".df-nav-item--strip");
  await expect(links).toHaveCount(4);
  for (const link of await links.all()) await expectTouchTarget(link);
});
