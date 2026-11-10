import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

import { convertThemeBlocks, parseRootVariables } from "../src/styles/designPreset";
import { ApiHarness } from "./apiHarness";

/*
 * FE-024 — the design preset is what the browser shows. The expected values
 * are read from `src/styles/design-preset.css` here (through the same
 * conversion the build applies), never written into the test: swapping the
 * preset must move both the application and this expectation.
 */

const presetFile = path.resolve(process.cwd(), "src/styles/design-preset.css");
const preset = parseRootVariables(convertThemeBlocks(fs.readFileSync(presetFile, "utf8"), presetFile));

function rgb(hex: string): string {
  const digits = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((offset) => Number.parseInt(digits.slice(offset, offset + 2), 16));
  return `rgb(${String(r)}, ${String(g)}, ${String(b)})`;
}

function presetValue(name: string): string {
  const value = preset.get(name);
  if (value === undefined) throw new Error(`${name} is not in design-preset.css`);
  return value;
}

async function open(page: Page, route: string) {
  await new ApiHarness({ phase: "review" }).install(page);
  await page.goto(route);
  await page.locator(".df-shell__bar").waitFor({ state: "visible" });
}

test.describe("FE-024 the design preset reaches the browser", () => {
  test("every preset variable is on :root with the value written in design-preset.css", async ({ page }) => {
    await open(page, "/materials");
    const names = [...preset.keys()];
    const onRoot = await page.evaluate((keys) => {
      const style = getComputedStyle(document.documentElement);
      return Object.fromEntries(keys.map((key) => [key, style.getPropertyValue(key).trim()]));
    }, names);
    expect(names.length).toBeGreaterThanOrEqual(50);
    for (const name of names) {
      expect(onRoot[name], name).toBe(presetValue(name));
    }
    // Nothing of Tailwind's survives the conversion.
    const sheets = await page.evaluate(() =>
      [...document.styleSheets].flatMap((sheet) => [...sheet.cssRules].map((rule) => rule.cssText)),
    );
    expect(sheets.some((rule) => rule.includes("@theme"))).toBe(false);
  });

  test("the page, the bar, a panel and its outline paint the preset's colours", async ({ page }) => {
    await open(page, "/profiles");
    await page.locator(".df-panel").first().waitFor({ state: "visible" });
    const painted = await page.evaluate(() => {
      const panel = document.querySelector(".df-panel");
      const bar = document.querySelector(".df-shell__bar");
      if (panel === null || bar === null) throw new Error("no panel or bar");
      const root = getComputedStyle(document.documentElement);
      return {
        page: getComputedStyle(document.body).backgroundColor,
        bar: getComputedStyle(bar).backgroundColor,
        panel: getComputedStyle(panel).backgroundColor,
        outline: getComputedStyle(panel).borderTopColor,
        outlineWidth: getComputedStyle(panel).borderTopWidth,
        text: getComputedStyle(document.body).color,
        siteMargin: getComputedStyle(bar).paddingLeft,
        // Chromium substitutes `var()` in a computed custom property, so the
        // application tokens read as the preset's values here; the swap test
        // below proves they are references rather than copies.
        tokens: {
          page: root.getPropertyValue("--color-background-primary-default").trim(),
          panelOutline: root.getPropertyValue("--color-stroke-panel-default").trim(),
          sizeSm: root.getPropertyValue("--size-sm").trim(),
        },
      };
    });
    expect(painted.page).toBe(rgb(presetValue("--color-surface-page")));
    expect(painted.bar).toBe(rgb(presetValue("--color-surface-panel")));
    expect(painted.panel).toBe(rgb(presetValue("--color-surface-panel")));
    expect(painted.outline).toBe(rgb(presetValue("--color-border-default")));
    expect(painted.outlineWidth).toBe(presetValue("--border-width-1"));
    expect(painted.text).toBe(rgb(presetValue("--color-text-primary")));
    expect(painted.siteMargin).toBe(presetValue("--spacing-site-padding-xs"));
    expect(painted.tokens.page).toBe(presetValue("--color-surface-page"));
    expect(painted.tokens.panelOutline).toBe(presetValue("--color-border-default"));
    expect(painted.tokens.sizeSm).toBe(presetValue("--spacing-16"));
  });

  test("a swapped preset moves the application (variables, not copies)", async ({ page }) => {
    await open(page, "/materials");
    const swapped = { "--color-surface-page": "#101214", "--color-surface-panel": "#1a1d23" };
    const after = await page.evaluate((values) => {
      for (const [name, value] of Object.entries(values)) {
        document.documentElement.style.setProperty(name, value);
      }
      const bar = document.querySelector(".df-shell__bar");
      if (bar === null) throw new Error("no bar");
      return {
        page: getComputedStyle(document.body).backgroundColor,
        bar: getComputedStyle(bar).backgroundColor,
      };
    }, swapped);
    expect(after.page).toBe(rgb(swapped["--color-surface-page"]));
    expect(after.bar).toBe(rgb(swapped["--color-surface-panel"]));
  });
});
