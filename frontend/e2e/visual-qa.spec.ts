import { expect, test, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { ApiHarness, type DashboardMode, type HarnessPhase } from "./apiHarness";

const screenshotDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../docs/tickets/FE-001/screenshots",
);

async function assertNoOverflow(page: Page): Promise<void> {
  for (const width of [1440, 1280]) {
    await page.setViewportSize({ width, height: 1000 });
    const metrics = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(metrics.scrollWidth, `horizontal overflow at ${String(width)} px`).toBeLessThanOrEqual(
      metrics.clientWidth,
    );
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
}

async function assertResolvedCssVariables(page: Page): Promise<void> {
  const unresolved = await page.evaluate(() => {
    const css = Array.from(document.styleSheets)
      .flatMap((sheet) => Array.from(sheet.cssRules))
      .map((rule) => rule.cssText)
      .join("\n");
    const declared = new Set(Array.from(css.matchAll(/(--[a-z0-9-]+)\s*:/gi), (match) => match[1]));
    const referenced = new Set(Array.from(css.matchAll(/var\(\s*(--[a-z0-9-]+)/gi), (match) => match[1]));
    return Array.from(referenced).filter((name) => !declared.has(name));
  });
  expect(unresolved).toEqual([]);
}

async function assertKeyboardFocus(page: Page): Promise<void> {
  await page.locator("body").click({ position: { x: 2, y: 2 } });
  await page.keyboard.press("Tab");
  const focus = await page.evaluate(() => {
    const element = document.activeElement;
    if (!(element instanceof HTMLElement)) {
      return { tag: "none", visible: false };
    }
    const style = getComputedStyle(element);
    return {
      tag: element.tagName,
      visible: style.outlineStyle !== "none" || style.boxShadow !== "none",
    };
  });
  expect(focus.tag).not.toBe("BODY");
  expect(focus.visible).toBe(true);
}

async function capture(
  page: Page,
  name: string,
  route: string,
  options: { dashboardMode?: DashboardMode; phase?: HarnessPhase } = {},
  prepare?: (page: Page) => Promise<void>,
): Promise<void> {
  const api = new ApiHarness(options);
  await api.install(page);
  const externalFonts: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (request.resourceType() === "font" && url.origin !== "http://127.0.0.1:5173") {
      externalFonts.push(request.url());
    }
  });
  await page.goto(route);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await prepare?.(page);
  await assertNoOverflow(page);
  await assertResolvedCssVariables(page);
  await assertKeyboardFocus(page);
  expect(externalFonts).toEqual([]);
  await page.screenshot({ fullPage: true, path: path.join(screenshotDirectory, `${name}-1440.png`) });
  await page.goto("about:blank");
  await page.unrouteAll({ behavior: "ignoreErrors" });
}

test("pięć tras i stany loading/empty/error mają uczciwe screenshoty oraz QA layoutu", async ({
  page,
}) => {
  await capture(page, "dashboard", "/", { dashboardMode: "populated" });
  await capture(page, "profile", "/profiles/new");
  await capture(page, "materials", "/materials", { phase: "review" });
  await capture(page, "annotations", "/annotations/run-1", { phase: "review" }, async (current) => {
    await expect(current.getByRole("heading", { name: "Obraz i bbox" })).toBeVisible();
  });
  await capture(page, "exports", "/exports", { phase: "accepted" }, async (current) => {
    await current.getByRole("button", { name: "Uruchom eksport COCO" }).click();
    await expect(current.getByRole("heading", { name: "Wynik eksportu COCO" })).toBeVisible({ timeout: 8_000 });
  });
  await capture(page, "loading", "/", { dashboardMode: "loading" }, async (current) => {
    await expect(current.getByText("Ładowanie stanu systemu…")).toBeVisible();
  });
  await capture(page, "empty", "/", { dashboardMode: "empty" }, async (current) => {
    await expect(current.getByText("Brak aktywnego projektu")).toBeVisible();
  });
  await capture(page, "error", "/", { dashboardMode: "error" }, async (current) => {
    await expect(current.getByText("Nie udało się wczytać dashboardu")).toBeVisible();
  });
});
