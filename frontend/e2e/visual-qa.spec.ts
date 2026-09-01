import { expect, test, type Locator, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { ApiHarness, type DashboardMode, type HarnessPhase } from "./apiHarness";
import { deterministicPng } from "./deterministicPng";

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

async function assertInspectorGeometrySingleRow(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 1000 });
  const inspector = page.getByRole("region", { name: "Anotacje" });
  const annotation = inspector.getByRole("listitem").first();
  await expect(annotation).toBeVisible();

  const fieldBounds = await Promise.all(
    ["x", "y", "width", "height"].map(async (label) => {
      const bounds = await annotation.getByLabel(label, { exact: true }).boundingBox();
      expect(bounds, `${label} field has no browser geometry at 1280 px`).not.toBeNull();
      if (bounds === null) {
        throw new Error(`${label} field has no browser geometry at 1280 px`);
      }
      return bounds;
    }),
  );
  const inspectorBounds = await inspector.boundingBox();
  expect(inspectorBounds).not.toBeNull();
  if (inspectorBounds === null) {
    throw new Error("Annotation inspector has no browser geometry at 1280 px");
  }

  expect(new Set(fieldBounds.map((bounds) => Math.round(bounds.y))).size).toBe(1);
  for (const bounds of fieldBounds) {
    expect(bounds.x).toBeGreaterThanOrEqual(inspectorBounds.x);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(inspectorBounds.x + inspectorBounds.width);
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

async function assertKeyboardFocus(page: Page, expected: Locator): Promise<void> {
  await page.locator("body").click({ position: { x: 2, y: 2 } });
  let reached = false;
  for (let index = 0; index < 40; index += 1) {
    await page.keyboard.press("Tab");
    if (await expected.evaluate((element) => element === document.activeElement)) {
      reached = true;
      break;
    }
  }
  expect(reached, "route-specific focus checkpoint was not keyboard reachable").toBe(true);
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

async function assertScreenshotFocus(expected: Locator): Promise<void> {
  const focus = await expected.evaluate((element) => {
    const style = getComputedStyle(element);
    const outlineColor = style.outlineColor;
    return {
      active: element === document.activeElement,
      outlineColor,
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
    };
  });

  if (!focus.active) {
    throw new Error("Visual QA: checkpoint utracił focus bezpośrednio przed screenshotem.");
  }
  if (
    focus.outlineStyle === "none" ||
    focus.outlineWidth <= 0 ||
    focus.outlineColor === "transparent" ||
    focus.outlineColor === "rgba(0, 0, 0, 0)"
  ) {
    throw new Error("Visual QA: checkpoint nie ma widocznego focus ringu przed screenshotem.");
  }
}

async function pinScreenshotFocusRing(page: Page, expected: Locator): Promise<void> {
  const selector = await expected.evaluate((element) => {
    const segments: string[] = [];
    let current: Element | null = element;

    while (current !== null) {
      if (current.id !== "") {
        segments.unshift(`#${CSS.escape(current.id)}`);
        break;
      }
      const parent: Element | null = current.parentElement;
      const tag = current.tagName.toLowerCase();
      if (parent === null) {
        segments.unshift(tag);
        break;
      }
      const matchingSiblings = Array.from(parent.children).filter(
        (sibling) => sibling.tagName === current?.tagName,
      );
      const position = matchingSiblings.indexOf(current) + 1;
      segments.unshift(`${tag}:nth-of-type(${String(position)})`);
      current = parent;
    }

    return segments.join(" > ");
  });

  await page.addStyleTag({
    content: `
      ${selector} {
        outline: var(--focus-ring-width) solid var(--color-fill-brand-impeccable) !important;
        outline-offset: var(--focus-ring-offset) !important;
      }
    `,
  });
}

async function withVerifiedScreenshotFocus<T>(
  expected: Locator,
  screenshot: () => Promise<T>,
): Promise<T> {
  await assertScreenshotFocus(expected);
  return screenshot();
}

async function freezeMotion(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation: none !important;
        caret-color: transparent !important;
        scroll-behavior: auto !important;
        transition: none !important;
      }
    `,
  });
}

async function capture(
  page: Page,
  name: string,
  route: string,
  options: { dashboardMode?: DashboardMode; phase?: HarnessPhase } = {},
  focusTarget: (page: Page) => Locator,
  prepare?: (page: Page) => Promise<void>,
  beforeScreenshot?: (page: Page) => Promise<void>,
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
  await freezeMotion(page);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await prepare?.(page);
  await assertNoOverflow(page);
  await assertResolvedCssVariables(page);
  const focusCheckpoint = focusTarget(page);
  await assertKeyboardFocus(page, focusCheckpoint);
  await pinScreenshotFocusRing(page, focusCheckpoint);
  expect(externalFonts).toEqual([]);
  await beforeScreenshot?.(page);
  const screenshot = await withVerifiedScreenshotFocus(focusCheckpoint, () =>
    page.screenshot({
      animations: "disabled",
      caret: "hide",
      fullPage: true,
    }),
  );
  await writeFile(
    path.join(screenshotDirectory, `${name}-1440.png`),
    deterministicPng(screenshot),
  );
  await page.goto("about:blank");
  await page.unrouteAll({ behavior: "ignoreErrors" });
}

test("pięć tras i stany loading/empty/error mają uczciwe screenshoty oraz QA layoutu", async ({
  page,
}) => {
  await capture(page, "dashboard", "/", { phase: "queued" }, (current) =>
    current.getByRole("button", { name: "Uruchom" }));
  await capture(page, "profile", "/profiles/new", {}, (current) =>
    current.getByLabel("Nazwa profilu"));
  await capture(page, "materials", "/materials", { phase: "review" }, (current) =>
    current.getByLabel("Ścieżka pliku wideo"));
  await capture(
    page,
    "annotations",
    "/annotations/run-1",
    { phase: "review" },
    (current) => current.getByRole("combobox", { name: "Status weryfikacji" }),
    async (current) => {
      await expect(current.getByRole("heading", { name: "Obraz i bbox" })).toBeVisible();
      await assertInspectorGeometrySingleRow(current);
    },
  );
  await capture(
    page,
    "exports",
    "/exports",
    { phase: "accepted" },
    (current) => current.getByRole("button", { name: "Zamknij run" }),
    async (current) => {
      await current.getByRole("button", { name: "Uruchom eksport COCO" }).click();
      await expect(current.getByRole("heading", { name: "Wynik eksportu COCO" })).toBeVisible({
        timeout: 8_000,
      });
    },
    async (current) => {
      await expect(current).toHaveURL(/\/exports\?export_id=export-1$/);
      await expect(current.getByRole("heading", { name: "Wynik eksportu COCO" })).toBeVisible();
      await expect(current.getByRole("region", { name: "Pochodzenie anotacji" })).toContainText(
        "OCR",
      );
      await expect(current.getByText("exports/export-1", { exact: true })).toBeVisible();
    },
  );
  await capture(page, "loading", "/", { dashboardMode: "loading" }, (current) =>
    current.getByRole("link", { name: /Dashboard/ }), async (current) => {
      await expect(current.getByText("Ładowanie stanu systemu…")).toBeVisible();
    });
  await capture(page, "empty", "/", { dashboardMode: "empty" }, (current) =>
    current.getByRole("link", { name: /Dashboard/ }), async (current) => {
      await expect(current.getByText("Brak aktywnego projektu")).toBeVisible();
    });
  await capture(page, "error", "/", { dashboardMode: "error" }, (current) =>
    current.getByRole("button", { name: "Spróbuj ponownie" }), async (current) => {
      await expect(current.getByText("Nie udało się wczytać dashboardu")).toBeVisible();
    });
});

test("nie zapisuje screenshotu po utracie route-specific focusu", async ({ page }) => {
  const api = new ApiHarness({ phase: "review" });
  await api.install(page);
  await page.goto("/materials");
  await freezeMotion(page);
  const focusCheckpoint = page.getByLabel("Ścieżka pliku wideo");
  await assertKeyboardFocus(page, focusCheckpoint);
  await pinScreenshotFocusRing(page, focusCheckpoint);
  await focusCheckpoint.evaluate((element) => {
    if (element instanceof HTMLElement) {
      element.blur();
    }
  });

  let screenshotAttempted = false;
  await expect(
    withVerifiedScreenshotFocus(focusCheckpoint, async () => {
      screenshotAttempted = true;
    }),
  ).rejects.toThrow("checkpoint utracił focus bezpośrednio przed screenshotem");
  expect(screenshotAttempted, "guard must fail before page.screenshot").toBe(false);
});
