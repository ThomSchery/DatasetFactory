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

interface AnnotationViewportMetrics {
  image: { height: number; width: number };
  panel: { bottom: number; top: number };
  viewportHeight: number;
}

async function assertAnnotationPopoverIsDocked(page: Page): Promise<AnnotationViewportMetrics> {
  const popover = page.getByRole("dialog", { name: /Edytuj anotację/ });
  await expect(popover).toBeVisible();
  const image = page.getByRole("img", { name: /Klatka .* runu/ });
  const popoverBounds = await popover.boundingBox();
  const imageBounds = await image.boundingBox();
  expect(popoverBounds).not.toBeNull();
  expect(imageBounds).not.toBeNull();
  if (popoverBounds === null || imageBounds === null) {
    throw new Error("Annotation panel or frame image has no browser geometry");
  }
  // FE-014 docks the panel in the side column, so "docked" is now horizontal.
  expect(
    popoverBounds.x + popoverBounds.width,
    "annotation panel must end left of the frame image",
  ).toBeLessThanOrEqual(imageBounds.x);
  const metrics = {
    image: { height: imageBounds.height, width: imageBounds.width },
    panel: { bottom: popoverBounds.y + popoverBounds.height, top: popoverBounds.y },
    viewportHeight: await page.evaluate(() => window.innerHeight),
  };
  expect(metrics.panel.bottom, "annotation panel must fit inside the viewport").toBeLessThanOrEqual(
    metrics.viewportHeight + 0.5,
  );
  return metrics;
}

async function assertFrameFilterCountsFit(page: Page): Promise<void> {
  const filters = page.getByRole("group", { name: "Filtr statusu klatek" });
  const buttons = filters.getByRole("button");
  await expect(buttons).toHaveCount(4);

  for (const button of await buttons.all()) {
    const metrics = await button.locator(".df-button__content").evaluate((content) => {
      const label = content.querySelector("span");
      const count = content.querySelector("strong");
      if (!(label instanceof HTMLElement) || !(count instanceof HTMLElement)) {
        throw new Error("Filter button is missing its label or count");
      }
      const contentBox = content.getBoundingClientRect();
      const labelBox = label.getBoundingClientRect();
      const countBox = count.getBoundingClientRect();
      return {
        contentRight: contentBox.right,
        countRight: countBox.right,
        gap: countBox.left - labelBox.right,
      };
    });
    expect(metrics.gap, "frame filter label and count must have visible spacing").toBeGreaterThanOrEqual(4);
    expect(metrics.countRight, "frame filter count must stay inside its content box").toBeLessThanOrEqual(
      metrics.contentRight + 0.5,
    );
  }
}

async function assertCompactReviewLayout(page: Page): Promise<void> {
  const overlay = page.getByRole("listbox", { name: "Bbox anotacji na klatce" });
  const inspector = page.getByRole("region", { name: "Anotacje na klatce" });
  const annotationPanel = page.getByRole("region", { name: "Anotacja bez zaznaczenia" });
  const details = page.getByRole("region", { name: "Dane klatki" });
  const toolbar = page.locator(".df-review-toolbar");
  const preview = page.locator(".df-review-workspace__preview");
  const overlayBounds = await overlay.boundingBox();
  const inspectorBounds = await inspector.boundingBox();
  const annotationPanelBounds = await annotationPanel.boundingBox();
  const toolbarBounds = await toolbar.boundingBox();
  const previewBounds = await preview.boundingBox();
  expect(overlayBounds).not.toBeNull();
  expect(inspectorBounds).not.toBeNull();
  expect(annotationPanelBounds).not.toBeNull();
  expect(toolbarBounds).not.toBeNull();
  expect(previewBounds).not.toBeNull();
  await expect(details).toHaveCount(0);
  if (
    overlayBounds === null ||
    inspectorBounds === null ||
    annotationPanelBounds === null ||
    toolbarBounds === null ||
    previewBounds === null
  ) {
    throw new Error("Review toolbar, canvas or supporting content has no browser geometry");
  }
  expect(overlayBounds.y, "review image should remain above the fold at 1000 px").toBeLessThan(600);
  // FE-014: the canvas keeps the toolbar's right edge but yields the side
  // column's fixed 288 px plus the 24 px gap on the left.
  expect(
    previewBounds.width,
    "canvas row should span the workspace minus the side column",
  ).toBeGreaterThanOrEqual(toolbarBounds.width - 312 - 1);
  expect(
    previewBounds.x + previewBounds.width,
    "canvas row should end with the toolbar",
  ).toBeGreaterThanOrEqual(toolbarBounds.x + toolbarBounds.width - 1);
  expect(
    overlayBounds.width,
    "review image should be wider than either supporting column",
  ).toBeGreaterThan(inspectorBounds.width);
  expect(
    inspectorBounds.x + inspectorBounds.width,
    "class inspector should sit left of the canvas",
  ).toBeLessThanOrEqual(overlayBounds.x);
  expect(
    annotationPanelBounds.x + annotationPanelBounds.width,
    "always-mounted annotation panel should sit left of the canvas",
  ).toBeLessThanOrEqual(overlayBounds.x);
  expect(toolbarBounds.y + toolbarBounds.height, "toolbar should precede the canvas").toBeLessThanOrEqual(
    overlayBounds.y,
  );
  await expect(page.getByLabel("Wybierz klatkę")).toBeVisible();
  await expect(page.getByLabel("Klasa nowego bbox")).toHaveCount(0);
  await expect(page.getByLabel("Nowy x")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Dodaj bbox z pól" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Obraz i bbox" })).toHaveCount(0);
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
  options: {
    dashboardMode?: DashboardMode;
    fullPage?: boolean;
    phase?: HarnessPhase;
  } = {},
  focusTarget: (page: Page) => Locator,
  prepare?: (page: Page) => Promise<void>,
  beforeScreenshot?: (page: Page) => Promise<void>,
): Promise<void> {
  const { fullPage = true, ...harnessOptions } = options;
  const api = new ApiHarness(harnessOptions);
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
      fullPage,
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
    { fullPage: false, phase: "review" },
    (current) => current.getByRole("button", { name: /Klasa .* 1 anotacji/ }),
    async (current) => {
      await expect(current.getByRole("listbox", { name: "Bbox anotacji na klatce" })).toBeVisible();
      await assertFrameFilterCountsFit(current);
      await assertCompactReviewLayout(current);
      await current.setViewportSize({ width: 1280, height: 1000 });
      await current.getByRole("button", { name: /Klasa .* 1 anotacji/ }).click();
      await assertAnnotationPopoverIsDocked(current);
      await current.setViewportSize({ width: 1440, height: 1000 });
    },
    async (current) => {
      await current.keyboard.press("Enter");
      await assertAnnotationPopoverIsDocked(current);
      await current.getByRole("button", { name: /Klasa .* 1 anotacji/ }).focus();
      const overlay = current.getByRole("listbox", { name: "Bbox anotacji na klatce" });
      const overlayBeforeNudge = await overlay.boundingBox();
      expect(overlayBeforeNudge).not.toBeNull();
      /*
       * One arrow, deliberately not committed: the screenshot has to show the
       * unsaved-geometry marker, because that marker is the whole answer to
       * "where did my nudge go" (FE-009-FIX1). `ArrowRight` sends no request,
       * and the class button keeps focus for the focus-ring check.
       */
      await current.keyboard.press("ArrowRight");
      const overlayAfterNudge = await overlay.boundingBox();
      expect(overlayAfterNudge).not.toBeNull();
      expect(
        overlayAfterNudge?.y,
        "the unsaved notice must not move the drawing surface during an edit",
      ).toBe(overlayBeforeNudge?.y);
      await expect(
        current.getByText("Przesunięcie bboxa nie jest jeszcze zapisane.", { exact: false }),
      ).toBeVisible();
      await expect(
        current.getByRole("status", { name: "Niezapisane przesunięcie bboxa" }),
      ).toBeVisible();
      await expect(current.getByRole("button", { name: "Zaakceptuj klatkę" })).toBeDisabled();
      // Focusing the inspector below the canvas scrolls the SVG above the
      // viewport. Bring it back without changing the pinned keyboard focus so
      // the real pointermove (and therefore the screenshot) can show the guide.
      await overlay.scrollIntoViewIfNeeded();
      const overlayBounds = await overlay.boundingBox();
      if (overlayBounds === null) {
        throw new Error("Review canvas has no browser geometry before the FE-010 screenshot");
      }
      await current.mouse.move(
        overlayBounds.x + overlayBounds.width * 0.62,
        overlayBounds.y + overlayBounds.height * 0.38,
      );
      await expect(current.locator("[data-overlay-crosshair]")).toBeVisible();
    },
  );
  await capture(
    page,
    "exports",
    "/exports",
    { phase: "accepted" },
    (current) => current.getByRole("button", { name: "Zamknij run" }),
    async (current) => {
      await current.getByRole("button", { name: "Uruchom eksport" }).click();
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

test("pełnoszeroka kanwa, celownik, zoom i pan zachowują źródłową geometrię", async ({
  page,
}) => {
  const api = new ApiHarness({ phase: "review" });
  await api.install(page);
  const mutationRequests: string[] = [];
  page.on("request", (request) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      mutationRequests.push(`${request.method()} ${new URL(request.url()).pathname}`);
    }
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/annotations/run-1");

  const overlay = page.getByRole("listbox", { name: "Bbox anotacji na klatce" });
  const canvas = page.locator(".df-region-overlay");
  const zoomStage = page.locator("[data-overlay-zoom-stage]");
  const image = page.getByRole("img", { name: /Klatka .* runu/ });
  const inspector = page.getByRole("region", { name: "Anotacje na klatce" });
  const annotationPanel = page.getByRole("region", { name: "Anotacja bez zaznaczenia" });
  const details = page.getByRole("region", { name: "Dane klatki" });
  await expect(overlay).toBeVisible();
  const initial = await overlay.boundingBox();
  const initialCanvas = await canvas.boundingBox();
  const imageBounds = await image.boundingBox();
  const inspectorBounds = await inspector.boundingBox();
  const annotationPanelBounds = await annotationPanel.boundingBox();
  expect(initial).not.toBeNull();
  expect(imageBounds).not.toBeNull();
  expect(inspectorBounds).not.toBeNull();
  expect(annotationPanelBounds).not.toBeNull();
  await expect(details).toHaveCount(0);
  if (
    initial === null ||
    initialCanvas === null ||
    imageBounds === null ||
    inspectorBounds === null ||
    annotationPanelBounds === null
  ) {
    throw new Error("FE-010 layout has no browser geometry");
  }
  // This fixture is 1280×852, so the viewport-height cap binds before the
  // available row does. After FE-014 took 312 px for the side column, the
  // measured width at 1440×1000 is 731.98 px; the floor is that less 2% for
  // font-metric drift, rounded down to 10 px.
  expect(imageBounds.width).toBeGreaterThan(710);
  expect(inspectorBounds.x + inspectorBounds.width).toBeLessThanOrEqual(imageBounds.x);
  expect(annotationPanelBounds.x + annotationPanelBounds.width).toBeLessThanOrEqual(imageBounds.x);

  const center = {
    x: initial.x + initial.width / 2,
    y: initial.y + initial.height / 2,
  };
  await page.mouse.move(center.x, center.y);
  expect((await canvas.boundingBox())?.height).toBe(initialCanvas.height);
  const crosshair = page.locator("[data-overlay-crosshair]");
  await expect(crosshair).toBeVisible();
  await expect(crosshair).toHaveCSS("pointer-events", "none");
  const displayLabel = page.locator("[data-overlay-label-for]").first();
  await expect(displayLabel).toBeVisible();
  const fittedLabelFontSize = await displayLabel.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).fontSize),
  );
  const fittedLabelBounds = await displayLabel.boundingBox();

  const ordinaryWheel = await overlay.evaluate((element) => {
    const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 100 });
    return { dispatched: element.dispatchEvent(event), prevented: event.defaultPrevented };
  });
  expect(ordinaryWheel).toEqual({ dispatched: true, prevented: false });
  const minimumCtrlWheel = await overlay.evaluate((element) => {
    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      deltaY: 100,
    });
    return { dispatched: element.dispatchEvent(event), prevented: event.defaultPrevented };
  });
  expect(minimumCtrlWheel).toEqual({ dispatched: true, prevented: false });

  const classButton = page.getByRole("button", { name: /Klasa .* 1 anotacji/ });
  await classButton.click();
  await classButton.evaluate((element) => {
    if (element instanceof HTMLElement) {
      element.focus({ preventScroll: true });
    }
  });
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  const editDialog = page.getByRole("dialog", { name: /Edytuj anotację/ });
  const selectedShape = overlay.getByRole("option").first();
  await expect(editDialog).toBeVisible();
  await expect(selectedShape).toHaveAttribute("aria-label", /x 102, y 120/);
  await expect(page.getByRole("status", { name: "Niezapisane przesunięcie bboxa" })).toBeVisible();
  const nudgedGeometryLabel = await selectedShape.getAttribute("aria-label");
  expect(mutationRequests).toEqual([]);
  await page.evaluate(() => window.scrollTo(0, 0));

  const anchorRatio = {
    x: (center.x - initial.x) / initial.width,
    y: (center.y - initial.y) / initial.height,
  };
  await page.mouse.move(center.x, center.y);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -100);
  await page.keyboard.up("Control");
  await expect(page.getByLabel("Powiększenie kanwy")).toHaveText("125%");
  const zoomed = await overlay.boundingBox();
  expect(zoomed).not.toBeNull();
  if (zoomed === null) {
    throw new Error("Zoomed FE-010 canvas has no browser geometry");
  }
  expect(zoomed.width).toBeCloseTo(initial.width * 1.25, 0);
  expect((center.x - zoomed.x) / zoomed.width).toBeCloseTo(anchorRatio.x, 2);
  expect((center.y - zoomed.y) / zoomed.height).toBeCloseTo(anchorRatio.y, 2);
  expect(
    await displayLabel.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
  ).toBe(fittedLabelFontSize);
  expect((await displayLabel.boundingBox())?.height).toBeCloseTo(fittedLabelBounds?.height ?? 0, 0);
  expect((await canvas.boundingBox())?.height).toBe(initialCanvas.height);
  expect(mutationRequests).toEqual([]);

  const beforeMiddlePan = await zoomStage.evaluate((element) => getComputedStyle(element).transform);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(center.x + 48, center.y + 32, { steps: 3 });
  await page.mouse.up({ button: "middle" });
  const afterMiddlePan = await zoomStage.evaluate((element) => getComputedStyle(element).transform);
  expect(afterMiddlePan).not.toBe(beforeMiddlePan);
  await expect(editDialog).toBeVisible();
  expect(await selectedShape.getAttribute("aria-label")).toBe(nudgedGeometryLabel);
  await expect(page.getByRole("status", { name: "Niezapisane przesunięcie bboxa" })).toBeVisible();
  expect(mutationRequests).toEqual([]);

  await page.mouse.move(center.x, center.y);
  await classButton.evaluate((element) => {
    if (element instanceof HTMLElement) {
      element.focus({ preventScroll: true });
    }
  });
  await expect(classButton).toBeFocused();
  await page.keyboard.down("Space");
  const beforeSpacePan = await zoomStage.evaluate((element) => getComputedStyle(element).transform);
  await page.mouse.down();
  await page.mouse.move(center.x - 32, center.y - 24, { steps: 3 });
  await page.mouse.up();
  await page.keyboard.up("Space");
  const afterSpacePan = await zoomStage.evaluate((element) => getComputedStyle(element).transform);
  expect(afterSpacePan).not.toBe(beforeSpacePan);
  await expect(editDialog).toBeVisible();
  expect(await selectedShape.getAttribute("aria-label")).toBe(nudgedGeometryLabel);
  await expect(page.getByRole("status", { name: "Niezapisane przesunięcie bboxa" })).toBeVisible();
  expect((await canvas.boundingBox())?.height).toBe(initialCanvas.height);
  expect(mutationRequests).toEqual([]);

  await overlay.evaluate((element) => {
    for (let step = 0; step < 12; step += 1) {
      element.dispatchEvent(
        new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          clientX: 480,
          clientY: 270,
          ctrlKey: true,
          deltaY: -100,
        }),
      );
    }
  });
  await expect(page.getByLabel("Powiększenie kanwy")).toHaveText("800%");
  const maximumCtrlWheel = await overlay.evaluate((element) => {
    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      deltaY: -100,
    });
    return { dispatched: element.dispatchEvent(event), prevented: event.defaultPrevented };
  });
  expect(maximumCtrlWheel).toEqual({ dispatched: true, prevented: false });

  await page.getByRole("button", { name: "Dopasuj kanwę do widoku" }).click();
  await page.mouse.move(center.x, center.y);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -100);
  await page.keyboard.up("Control");
  await expect(page.getByLabel("Powiększenie kanwy")).toHaveText("125%");
  await expect(editDialog).toBeVisible();
  expect(await selectedShape.getAttribute("aria-label")).toBe(nudgedGeometryLabel);
  expect(mutationRequests).toEqual([]);

  const drawingSurface = await overlay.boundingBox();
  expect(drawingSurface).not.toBeNull();
  if (drawingSurface === null) {
    throw new Error("Panned FE-010 canvas has no browser geometry");
  }
  const drawStart = {
    x: Math.max(initialCanvas.x + 120, drawingSurface.x + drawingSurface.width * 0.45),
    y: Math.max(initialCanvas.y + 120, drawingSurface.y + drawingSurface.height * 0.45),
  };
  await page.mouse.move(drawStart.x, drawStart.y);

  await page.mouse.down();
  await page.mouse.move(drawStart.x + 48, drawStart.y + 32, { steps: 3 });
  expect((await canvas.boundingBox())?.height).toBe(initialCanvas.height);
  await page.mouse.up();
  const createdDialog = page.getByRole("dialog", { name: "Edytuj anotację 7" });
  await expect(createdDialog).toBeVisible();
  await expect(createdDialog.getByText("przypisano: 7")).toBeVisible();
  expect(mutationRequests).toEqual(["POST /api/v1/frames/frame-1/annotations"]);

  const created = overlay.getByRole("option", { name: /^7, źródło ręczna:/ });
  const createdBeforeReset = await created.getAttribute("aria-label");
  await page.getByRole("button", { name: "Dopasuj kanwę do widoku" }).click();
  await expect(page.getByLabel("Powiększenie kanwy")).toHaveText("100%");
  await expect(createdDialog).toBeVisible();
  expect(await created.getAttribute("aria-label")).toBe(createdBeforeReset);
  expect((await canvas.boundingBox())?.height).toBe(initialCanvas.height);
  expect(mutationRequests).toEqual(["POST /api/v1/frames/frame-1/annotations"]);

  const frameLabel = page.locator(".df-region-overlay__corner-label");
  await expect(frameLabel).toHaveCSS("pointer-events", "none");
  const labelBounds = await frameLabel.boundingBox();
  expect(labelBounds).not.toBeNull();
  if (labelBounds === null) {
    throw new Error("Frame label has no browser geometry");
  }
  const labelPoint = {
    x: labelBounds.x + labelBounds.width / 2,
    y: labelBounds.y + labelBounds.height / 2,
  };
  await page.mouse.move(labelPoint.x, labelPoint.y);
  await page.mouse.down();
  await page.mouse.move(labelPoint.x + 48, labelPoint.y + 48, { steps: 3 });
  await page.mouse.up();
  await expect(createdDialog).toBeVisible();
  await expect(createdDialog.getByText("przypisano: 7")).toBeVisible();
  expect((await canvas.boundingBox())?.height).toBe(initialCanvas.height);
  expect(mutationRequests).toEqual([
    "POST /api/v1/frames/frame-1/annotations",
    "POST /api/v1/frames/frame-1/annotations",
  ]);

  await page.mouse.move(8, 8);
  await expect(crosshair).toHaveCount(0);
});

test("Space zachowuje natywny przycisk bez panu i blokuje go po panie", async ({ page }) => {
  const api = new ApiHarness({ phase: "review" });
  await api.install(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/annotations/run-1");

  const overlay = page.getByRole("listbox", { name: "Bbox anotacji na klatce" });
  const canvas = page.locator(".df-region-overlay");
  const zoomStage = page.locator("[data-overlay-zoom-stage]");
  await expect(overlay).toBeVisible();
  await page.getByRole("button", { name: /Klasa .* 1 anotacji/ }).click();
  const dialog = page.getByRole("dialog", { name: /Edytuj anotację/ });
  const deleteButton = dialog.getByRole("button", { name: "Usuń" });
  await expect(deleteButton).toBeVisible();

  await overlay.scrollIntoViewIfNeeded();
  const canvasBounds = await canvas.boundingBox();
  if (canvasBounds === null) {
    throw new Error("FE-010-FIX2 canvas has no browser geometry");
  }
  const center = {
    x: canvasBounds.x + canvasBounds.width / 2,
    y: canvasBounds.y + canvasBounds.height / 2,
  };
  await page.mouse.move(center.x, center.y);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -100);
  await page.keyboard.up("Control");
  await expect(page.getByLabel("Powiększenie kanwy")).toHaveText("125%");

  await page.mouse.move(8, 8);
  await deleteButton.evaluate((element) => {
    if (element instanceof HTMLElement) {
      element.focus({ preventScroll: true });
    }
  });
  await expect(deleteButton).toBeFocused();
  await page.keyboard.down("Space");
  await page.mouse.move(center.x, center.y);
  const beforeSpacePan = await zoomStage.evaluate((element) => getComputedStyle(element).transform);
  await page.mouse.down();
  await page.mouse.move(center.x + 40, center.y + 28, { steps: 3 });
  await page.mouse.up();
  await page.keyboard.up("Space");

  const afterSpacePan = await zoomStage.evaluate((element) => getComputedStyle(element).transform);
  expect(afterSpacePan).not.toBe(beforeSpacePan);
  await expect(dialog).toBeVisible();
  await expect(overlay.getByRole("option")).toHaveCount(1);
  const deletesAfterPan = api.requests.filter(
    (request) => request.method === "DELETE" && request.pathname === "/annotations/ann-1",
  );
  expect(deletesAfterPan).toHaveLength(0);

  const resetButton = page.getByRole("button", { name: "Dopasuj kanwę do widoku" });
  await page.mouse.move(center.x, center.y);
  await resetButton.evaluate((element) => {
    if (element instanceof HTMLElement) {
      element.focus({ preventScroll: true });
    }
  });
  await expect(resetButton).toBeFocused();
  await page.keyboard.press("Space");

  await expect(page.getByLabel("Powiększenie kanwy")).toHaveText("100%");
  const deletesAfterNativeReset = api.requests.filter(
    (request) => request.method === "DELETE" && request.pathname === "/annotations/ann-1",
  );
  expect(deletesAfterNativeReset).toHaveLength(0);
});

/*
 * FE-014 capped the side column, so the review screen at 1440×1000 no longer
 * overflows the viewport. "Space away from the canvas still scrolls" would
 * then pass with Space fully suppressed, because there is nothing to scroll.
 * Shrink the viewport until the document really does overflow, and fail here
 * rather than let the contract assertion go vacuous.
 */
async function makeDocumentScrollable(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 600 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight))
    .toBeGreaterThan(0);
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
}

test("Space nad kanwą nie przewija dokumentu przy naturalnym fokusie body", async ({ page }) => {
  const api = new ApiHarness({ phase: "review" });
  await api.install(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/annotations/run-1");

  const overlay = page.getByRole("listbox", { name: "Bbox anotacji na klatce" });
  const canvas = page.locator(".df-region-overlay");
  const zoomStage = page.locator("[data-overlay-zoom-stage]");
  await expect(overlay).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.activeElement === document.body)).toBe(true);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  const canvasBounds = await canvas.boundingBox();
  if (canvasBounds === null) {
    throw new Error("FE-010-FIX3 canvas has no browser geometry");
  }
  const center = {
    x: canvasBounds.x + canvasBounds.width / 2,
    y: canvasBounds.y + canvasBounds.height / 2,
  };
  await page.mouse.move(center.x, center.y);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -100);
  await page.keyboard.up("Control");
  await expect(page.getByLabel("Powiększenie kanwy")).toHaveText("125%");
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);

  const beforeSpacePan = await zoomStage.evaluate((element) => getComputedStyle(element).transform);
  await page.keyboard.down("Space");
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.mouse.down();
  await page.mouse.move(center.x + 40, center.y + 28, { steps: 3 });
  await page.mouse.up();
  await page.keyboard.up("Space");

  const afterSpacePan = await zoomStage.evaluate((element) => getComputedStyle(element).transform);
  expect(afterSpacePan).not.toBe(beforeSpacePan);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(
    api.requests.filter((request) => !["GET", "HEAD", "OPTIONS"].includes(request.method)),
  ).toHaveLength(0);

  await page.mouse.move(8, 8);
  await makeDocumentScrollable(page);
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
  await page.keyboard.press("Space");
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  expect(
    api.requests.filter((request) => !["GET", "HEAD", "OPTIONS"].includes(request.method)),
  ).toHaveLength(0);
});

test("wciąż trzymany Space nie przewija dokumentu po zakończeniu panu poza kanwą", async ({
  page,
}) => {
  const api = new ApiHarness({ phase: "review" });
  await api.install(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/annotations/run-1");

  const overlay = page.getByRole("listbox", { name: "Bbox anotacji na klatce" });
  const canvas = page.locator(".df-region-overlay");
  const zoomStage = page.locator("[data-overlay-zoom-stage]");
  await expect(overlay).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.activeElement === document.body)).toBe(true);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  const canvasBounds = await canvas.boundingBox();
  if (canvasBounds === null) {
    throw new Error("FE-010-FIX4 canvas has no browser geometry");
  }
  const center = {
    x: canvasBounds.x + canvasBounds.width / 2,
    y: canvasBounds.y + canvasBounds.height / 2,
  };
  await page.mouse.move(center.x, center.y);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -100);
  await page.keyboard.up("Control");
  await expect(page.getByLabel("Powiększenie kanwy")).toHaveText("125%");

  const beforePan = await zoomStage.evaluate((element) => getComputedStyle(element).transform);
  await page.keyboard.down("Space");
  await page.mouse.down();
  // Drag out past the top-left corner and release the button there, so pointer
  // capture ends and onPointerLeave clears the inside flag before Space is up.
  await page.mouse.move(10, 10, { steps: 4 });
  await page.mouse.up();
  await page.mouse.move(2, 2);

  const afterPan = await zoomStage.evaluate((element) => getComputedStyle(element).transform);
  expect(afterPan).not.toBe(beforePan);

  // The key is still physically held; the browser now emits auto-repeat
  // keydowns with repeat=true. They must stay consumed until keyup.
  await page.keyboard.down("Space");
  await page.keyboard.down("Space");
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.keyboard.up("Space");
  expect(
    api.requests.filter((request) => !["GET", "HEAD", "OPTIONS"].includes(request.method)),
  ).toHaveLength(0);

  // No pan this hold: a held, repeating Space outside the canvas still scrolls.
  await makeDocumentScrollable(page);
  await page.keyboard.down("Space");
  await page.keyboard.down("Space");
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page.keyboard.up("Space");
});

test("zamrożona klatka nie pokazuje celownika", async ({ page }) => {
  const api = new ApiHarness({ phase: "accepted" });
  await api.install(page);
  await page.goto("/annotations/run-1");
  await page.getByRole("button", { name: /Zaakceptowane\s*1/ }).click();
  const overlay = page.getByRole("listbox", { name: "Bbox anotacji na klatce" });
  await expect(overlay).toBeVisible();
  const bounds = await overlay.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) {
    throw new Error("Frozen canvas has no browser geometry");
  }
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await expect(page.locator("[data-overlay-crosshair]")).toHaveCount(0);
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
