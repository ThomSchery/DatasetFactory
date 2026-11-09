import { expect, test, type Browser, type Page } from "@playwright/test";

import { ApiHarness } from "./apiHarness";

/*
 * FE-023 shell polish, measured in the DOM (no screenshots):
 *
 *  1. The top bar's background reaches the right edge of the window, through
 *     the strip `scrollbar-gutter: stable` reserves (15 px in desktop
 *     Chromium), at every width; `scrollbar-gutter` itself stays.
 *  2. ☰ is the only control of the side bar: below 768 px it opens and closes
 *     the drawer, from 768 px it collapses and restores the icon strip.
 *
 * The colour painted at a point is resolved the way the browser paints it:
 * the topmost element with an opaque background, else the canvas, which takes
 * the root element's background (colour plus any image band, positioned in
 * document coordinates). The layout width is the body's: Chromium's
 * `documentElement.clientWidth` does not subtract a gutter that holds no
 * scrollbar.
 */

interface Paint { colour: string; owner: string }

function paintedAt(page: Page, x: number, y: number): Promise<Paint> {
  return page.evaluate(([px, py]) => {
    const opaque = (colour: string) => colour !== "transparent" && !/rgba\(.*,\s*0\)$/.test(colour);
    for (const element of document.elementsFromPoint(px, py)) {
      if (element === document.documentElement) continue;
      const colour = getComputedStyle(element).backgroundColor;
      if (opaque(colour)) return { colour, owner: element.getAttribute("class") ?? element.tagName };
    }
    const root = getComputedStyle(document.documentElement);
    const band = /^linear-gradient\((rgba?\([^)]*\)), (rgba?\([^)]*\))\)$/.exec(root.backgroundImage);
    if (band !== null && band[1] === band[2] && root.backgroundRepeat === "repeat-x") {
      const top = Number.parseFloat(root.backgroundPositionY) || 0;
      const height = Number.parseFloat(root.backgroundSize.split(" ")[1] ?? "");
      const documentY = py + window.scrollY;
      if (documentY >= top && documentY < top + height) return { colour: band[1], owner: "canvas band" };
    }
    return { colour: root.backgroundColor, owner: "canvas" };
  }, [x, y] as const);
}

async function shell(page: Page) {
  return page.evaluate(() => {
    const bar = document.querySelector(".df-shell__bar");
    if (bar === null) throw new Error("no bar");
    const box = bar.getBoundingClientRect();
    return {
      bar: { left: box.left, top: box.top, right: box.right, bottom: box.bottom },
      barColour: getComputedStyle(bar).backgroundColor,
      pageColour: getComputedStyle(document.body).backgroundColor,
      // `documentElement.clientWidth` ignores a gutter that holds no scrollbar
      // (FE-022 log); the body's box is the width the layout really gets.
      clientWidth: document.body.getBoundingClientRect().right,
      innerWidth: window.innerWidth,
      scrolls: document.documentElement.scrollHeight > document.documentElement.clientHeight,
      gutter: getComputedStyle(document.documentElement).scrollbarGutter,
    };
  });
}

/** Whether Chromium's accessibility tree ignores the first match (e.g. `inert`).
 * Playwright's role queries do not apply `inert`, so this asks the browser. */
async function ignoredByAccessibility(page: Page, selector: string): Promise<boolean> {
  const cdp = await page.context().newCDPSession(page);
  try {
    const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
    const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector });
    if (nodeId === 0) throw new Error(`no ${selector}`);
    const { nodes } = await cdp.send("Accessibility.getPartialAXTree", { nodeId, fetchRelatives: false });
    return nodes[0]?.ignored === true;
  } finally {
    await cdp.detach();
  }
}

async function openAt(browser: Browser, width: number, height: number, route: string, phone = false) {
  const context = await browser.newContext({
    deviceScaleFactor: 1,
    hasTouch: phone,
    isMobile: phone,
    viewport: { height, width },
  });
  const page = await context.newPage();
  await new ApiHarness({ phase: "review" }).install(page);
  await page.goto(route);
  await page.locator(".df-shell__bar").waitFor({ state: "visible" });
  await page.evaluate(() => document.fonts.ready);
  return { context, page };
}

/** Every point of the bar's right end, gutter included, carries the bar's colour; below it the page's. */
async function expectBarToTheEdge(page: Page, label: string) {
  const state = await shell(page);
  expect(state.gutter, label).toBe("stable");
  expect(state.bar.left, label).toBe(0);
  expect(state.bar.right, `${label}: bar spans the layout width`).toBe(state.clientWidth);
  const reserved = state.innerWidth - state.clientWidth;
  const xs = [state.innerWidth - 1, state.innerWidth - Math.max(1, reserved / 2), state.clientWidth - 1];
  for (const x of xs) {
    for (const y of [state.bar.top + 1, (state.bar.top + state.bar.bottom) / 2, state.bar.bottom - 1]) {
      const paint = await paintedAt(page, x, y);
      expect(paint.colour, `${label}: (${String(x)}, ${String(y)}) painted by ${paint.owner}`).toBe(state.barColour);
    }
    const below = await paintedAt(page, x, state.bar.bottom + 4);
    expect(below.colour, `${label}: below the bar at x ${String(x)} (${below.owner})`).not.toBe(state.barColour);
  }
  return state;
}

test.describe("FE-023 top bar reaches the right window edge", () => {
  for (const width of [360, 768, 1200, 1920]) {
    test(`desktop ${String(width)}: through the scrollbar gutter, with and without a scrollbar`, async ({ browser }) => {
      const { context, page } = await openAt(browser, width, 900, "/materials");
      try {
        const still = await expectBarToTheEdge(page, `${String(width)} Upload`);
        // Desktop Chromium reserves the gutter even without a scrollbar.
        expect(still.innerWidth - still.clientWidth).toBeGreaterThan(0);
        expect(still.scrolls).toBe(false);

        await page.setViewportSize({ width, height: 360 });
        await page.goto("/profiles");
        await page.locator(".df-shell__bar").waitFor({ state: "visible" });
        const scrolling = await shell(page);
        expect(scrolling.scrolls, "Profiles at 360 px height scrolls").toBe(true);
        // With a scrollbar the gutter holds it; the bar reaches the scrollbar,
        // and the layout width is the same as without one (FE-017/FE-019).
        expect(scrolling.clientWidth).toBe(still.clientWidth);
        expect(scrolling.bar.right).toBe(scrolling.clientWidth);
      } finally {
        await context.close();
      }
    });
  }

  test("phone 360: overlay scrollbar, the bar itself reaches the edge", async ({ browser }) => {
    const { context, page } = await openAt(browser, 360, 900, "/materials", true);
    try {
      const state = await expectBarToTheEdge(page, "phone 360 Upload");
      expect(state.innerWidth).toBe(state.clientWidth);
    } finally {
      await context.close();
    }
  });
});

test.describe("FE-023 ☰ is the side bar's only control", () => {
  test("below 768 px ☰ opens and closes the drawer", async ({ browser }) => {
    const { context, page } = await openAt(browser, 360, 900, "/materials", true);
    try {
      const toggle = page.getByRole("button", { name: "Sections", exact: true });
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      const controls = await toggle.getAttribute("aria-controls");
      expect(controls).not.toBeNull();
      await toggle.click();
      const drawer = page.getByRole("dialog", { name: "Sections" });
      await expect(drawer).toBeVisible();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      expect(await page.locator(`[id="${String(controls)}"]`).evaluate((element, dialog) => element.contains(dialog), await drawer.elementHandle())).toBe(true);
      await expect(drawer.getByRole("button")).toHaveCount(0);
      await expect(drawer.getByRole("link", { name: "Upload" })).toBeFocused();

      // ☰ stays above the drawer's scrim and closes it like a toggle.
      await toggle.click();
      await expect(drawer).toBeHidden();
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(toggle).toBeFocused();
    } finally {
      await context.close();
    }
  });

  test("below 768 px ☰ and the drawer are one modal scope (FIX1)", async ({ browser }) => {
    const { context, page } = await openAt(browser, 360, 900, "/materials", true);
    try {
      const toggle = page.getByRole("button", { name: "Sections", exact: true });
      const more = page.locator(".df-shell__more .df-button").first();
      await toggle.click();
      const drawer = page.getByRole("dialog", { name: "Sections" });
      await expect(drawer).toBeVisible();
      const links = drawer.getByRole("link");
      await expect(links.first()).toBeFocused();

      // ⋮ More is visible above the scrim but inert: a tap does nothing and
      // assistive technology does not see it.
      expect(await ignoredByAccessibility(page, ".df-shell__more .df-button")).toBe(true);
      expect(await ignoredByAccessibility(page, "main")).toBe(true);
      expect(await ignoredByAccessibility(page, ".df-shell__toggle")).toBe(false);
      const box = await more.boundingBox();
      if (box === null) throw new Error("More has no box");
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await expect(more).toHaveAttribute("aria-expanded", "false");
      await expect(more).not.toBeFocused();
      await expect(drawer).toBeVisible();
      // Wherever that tap left focus, one Escape closes the drawer onto ☰.
      await page.keyboard.press("Escape");
      await expect(drawer).toBeHidden();
      await expect(toggle).toBeFocused();
      expect(await ignoredByAccessibility(page, ".df-shell__more .df-button")).toBe(false);

      // Tab cycles ☰ ↔ the four sections, in both directions.
      await toggle.click();
      await expect(links.first()).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(toggle).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(links.last()).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(toggle).toBeFocused();
      for (let index = 0; index < 4; index += 1) {
        await page.keyboard.press("Tab");
        await expect(links.nth(index)).toBeFocused();
      }

      // Escape from a section and from ☰ closes it and focuses ☰.
      await page.keyboard.press("Escape");
      await expect(drawer).toBeHidden();
      await expect(toggle).toBeFocused();
      await toggle.click();
      await page.keyboard.press("Shift+Tab");
      await expect(toggle).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(drawer).toBeHidden();
      await expect(toggle).toBeFocused();
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
    } finally {
      await context.close();
    }
  });

  test("from 768 px ☰ collapses and restores the strip, across routes", async ({ browser }) => {
    const { context, page } = await openAt(browser, 992, 900, "/materials");
    try {
      await expect(page.getByRole("button", { name: /Collapse sections|Close sections/ })).toHaveCount(0);
      const toggle = page.getByRole("button", { name: "Sections", exact: true });
      const strip = page.locator(`[id="${String(await toggle.getAttribute("aria-controls"))}"]`);
      await expect(strip).toHaveClass(/df-side-nav--strip/);
      await expect(strip).toBeVisible();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");

      await toggle.click();
      await expect(strip).toBeHidden();
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(await page.locator("main").evaluate((main) => main.getBoundingClientRect().left)).toBe(0);

      await page.getByRole("navigation", { name: "Workspace steps" }).getByRole("link", { name: "Profile" }).click();
      await expect(page).toHaveURL(/\/profiles$/);
      await expect(strip).toBeHidden();
      await expect(toggle).toHaveAttribute("aria-expanded", "false");

      await toggle.click();
      await expect(strip).toBeVisible();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");

      // The strip is not modal: nothing is inert and ⋮ More works as before.
      expect(await page.locator("[inert]").count()).toBe(0);
      const more = page.getByRole("button", { name: "More", exact: true });
      await more.click();
      await expect(more).toHaveAttribute("aria-expanded", "true");
      await page.keyboard.press("Escape");
      await expect(more).toHaveAttribute("aria-expanded", "false");
      await expect(strip).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
