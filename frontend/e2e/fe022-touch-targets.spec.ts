import { expect, test, type Locator, type Page } from "@playwright/test";
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

async function settle(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

/** Scroll overflow of every scroll container and of the document, keyed by DOM path. */
function scrollExtents(page: Page) {
  return page.evaluate(() => {
    const path = (element: Element) => {
      const steps: number[] = [];
      for (let node = element; node.parentElement !== null && node !== document.body; node = node.parentElement) {
        steps.unshift(Array.prototype.indexOf.call(node.parentElement.children, node) as number);
      }
      return steps.join("/");
    };
    const root = document.documentElement;
    const extents: Record<string, number[]> = {
      document: [root.scrollWidth - root.clientWidth, root.scrollHeight - root.clientHeight],
    };
    for (const element of document.body.querySelectorAll<HTMLElement>("*")) {
      const style = getComputedStyle(element);
      if (style.overflowX === "visible" && style.overflowY === "visible") continue;
      if (element.getClientRects().length === 0) continue;
      const name = element.getAttribute("aria-label") ?? element.getAttribute("class") ?? element.tagName;
      extents[`${path(element)} ${name}`] = [element.scrollWidth - element.clientWidth, element.scrollHeight - element.clientHeight];
    }
    return extents;
  });
}

/** FE-022 FIX2 N1: the hit areas are invisible, so every scroll container
 * keeps the overflow it has with a fine pointer (touch emulation off). */
async function expectNoPhantomScroll(page: Page, state: string) {
  const cdp = await page.context().newCDPSession(page);
  const pointer = async (coarse: boolean) => {
    await cdp.send("Emulation.setTouchEmulationEnabled", coarse ? { enabled: true, maxTouchPoints: 1 } : { enabled: false });
    await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(coarse);
    const targets = expect.poll(() => page.locator("[data-touch-target]").count());
    await (coarse ? targets.toBeGreaterThan(0) : targets.toBe(0));
    await settle(page);
  };
  await pointer(false);
  const fine = await scrollExtents(page);
  await pointer(true);
  expect(await scrollExtents(page), state).toEqual(fine);
  await cdp.detach();
}

/** FE-022 FIX2 N2: points of the visible annotation canvas next to its edges
 * and around nearby controls hit the canvas, unless a control is painted there. */
async function expectCanvasKeepsItsPixels(page: Page, state: string) {
  await expect(page.locator("svg.df-region-overlay__surface")).toBeVisible();
  await settle(page);
  const stolen = await page.evaluate(() => {
    const surface = document.querySelector("svg.df-region-overlay__surface");
    const viewport = surface?.closest(".df-region-overlay");
    if (!surface || !viewport) return ["no canvas"];
    const own = surface.getBoundingClientRect();
    const frame = viewport.getBoundingClientRect();
    const visible = {
      left: Math.max(own.left, frame.left, 0), top: Math.max(own.top, frame.top, 0),
      right: Math.min(own.right, frame.right, innerWidth), bottom: Math.min(own.bottom, frame.bottom, innerHeight),
    };
    const band = 24;
    const controls = Array.from(document.querySelectorAll("[data-touch-target]"), (host) => host.getBoundingClientRect());
    const sampled = (x: number, y: number) => x - visible.left < band || visible.right - x < band
      || y - visible.top < band || visible.bottom - y < band
      || controls.some((box) => x > box.left - band && x < box.right + band && y > box.top - band && y < box.bottom + band);
    const found: string[] = [];
    for (let x = visible.left + 0.5; x < visible.right; x += 1) {
      for (let y = visible.top + 0.5; y < visible.bottom; y += 1) {
        if (!sampled(x, y)) continue;
        const hit = document.elementFromPoint(x, y);
        if (hit === null || surface.contains(hit)) continue;
        const owner = hit.closest("[data-touch-target]") ?? hit;
        const box = owner.getBoundingClientRect();
        // 1 px: painting snaps fractional boxes (the Review toolbar scrim) to pixels.
        const expanded = hit.matches(".df-field__touch")
          || x < box.left - 1 || x > box.right + 1 || y < box.top - 1 || y > box.bottom + 1;
        if (expanded && found.length < 8) {
          found.push(`${String(x)},${String(y)} ${owner.getAttribute("aria-label") ?? owner.getAttribute("class") ?? owner.tagName}`);
        }
      }
    }
    return found;
  });
  expect.soft(stolen, state).toEqual([]);
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

test("FE-022 touch: hit areas add no scroll overflow on Run and Profiles", async ({ page }) => {
  await page.goto("/run");
  await page.getByRole("combobox", { name: "Source file" }).click();
  await expectNoPhantomScroll(page, "Run, Imported videos list");
  await page.keyboard.press("Escape");
  await page.getByRole("combobox", { name: "Profile" }).click();
  await expectNoPhantomScroll(page, "Run, Saved profiles list");
  await page.goto("/profiles");
  await showWholeFrame(page);
  await page.getByRole("listbox", { name: "HUD regions on the reference screenshot" }).getByRole("option").first().click();
  await page.getByRole("button", { name: "Expand group Numbers" }).click();
  await expectNoPhantomScroll(page, "Profiles 360: regions, classes and characters");
  await page.setViewportSize({ width: 992, height: 900 });
  await expectNoPhantomScroll(page, "Profiles 992: regions, classes and characters");
});

test("FE-022 touch: hit areas add no scroll overflow in Review", async ({ page }) => {
  await page.goto("/annotations/run-1");
  await expect(page.getByRole("button", { name: "Class 7, 1 annotations" })).toBeVisible();
  await expectNoPhantomScroll(page, "Review 360, nothing selected");
  await page.getByRole("button", { name: "Class 7, 1 annotations" }).click();
  await expect(page.getByRole("dialog", { name: "Edit annotation 7" })).toBeVisible();
  await expectNoPhantomScroll(page, "Review 360, annotation 7");
  await page.setViewportSize({ width: 992, height: 900 });
  await expectNoPhantomScroll(page, "Review 992, annotation 7 and Repeat Previous");
});

test("FE-022 touch: hit areas leave the annotation canvas to the canvas", async ({ page }) => {
  await page.goto("/annotations/run-1");
  await expectCanvasKeepsItsPixels(page, "Review 360, toolbar over the cropped frame");
  await page.getByRole("button", { name: "Class 7, 1 annotations" }).click();
  await expect(page.getByRole("dialog", { name: "Edit annotation 7" })).toBeVisible();
  await page.setViewportSize({ width: 992, height: 900 });
  await expectCanvasKeepsItsPixels(page, "Review 992, side column beside the cropped frame");
  await showWholeFrame(page);
  await expectCanvasKeepsItsPixels(page, "Review 992, side column beside the whole frame");
  await page.goto("/profiles");
  await page.getByRole("listbox", { name: "HUD regions on the reference screenshot" }).getByRole("option").first().click();
  await expectCanvasKeepsItsPixels(page, "Profiles 992, region selected");
  await page.getByRole("button", { name: "Expand group Numbers" }).click();
  await expectCanvasKeepsItsPixels(page, "Profiles 992, Numbers expanded");
  await showWholeFrame(page);
  await expectCanvasKeepsItsPixels(page, "Profiles 992, whole frame");
  await page.setViewportSize({ width: 360, height: 900 });
  await expectCanvasKeepsItsPixels(page, "Profiles 360, toolbar under the canvas");
});
