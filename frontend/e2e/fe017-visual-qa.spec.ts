import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { annotationFixture, frameDetailFixture, profileFixture } from "../src/test/fixtures";
import { ApiHarness } from "./apiHarness";
import { deterministicPng } from "./deterministicPng";
import { showWholeFrame } from "./profileFlow";

const screenshotDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../docs/tickets/FE-017/screenshots",
);

/**
 * A profile with a class name long enough to need two lines in the panel's
 * narrow column, which is the case part B is about: the row may wrap, it may
 * not truncate.
 */
const visualProfile = profileFixture({
  categories: [
    { id: "category-1", kind: "character", name: "7" },
    { id: "hud-health", kind: "game", name: "health & armour" },
    { id: "hud-score", kind: "game", name: "Score" },
  ],
  source_height: 852,
  source_width: 1280,
});

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

async function bounds(locator: Locator, label: string) {
  const value = await locator.boundingBox();
  if (value === null) {
    throw new Error(`${label} has no browser geometry`);
  }
  return value;
}

async function shoot(page: Page, name: string): Promise<void> {
  await writeFile(
    path.join(screenshotDirectory, `${name}.png`),
    deterministicPng(
      await page.screenshot({ animations: "disabled", caret: "hide", fullPage: false }),
    ),
  );
}

test("FE-017 pokazuje uporządkowany panel, licznik źródła i klasę przypisaną automatycznie", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const api = new ApiHarness({ phase: "review" });
  await api.install(page);
  api.previousClasses = {
    classes: [
      { category_id: "category-1", count: 3 },
      { category_id: "hud-health", count: 1 },
    ],
    previous_frame_id: "frame-0",
    previous_frame_index: 16,
  };
  await page.route(/\/api\/v1\/profiles\/profile-1$/, (route) =>
    route.fulfill({
      body: JSON.stringify(visualProfile),
      contentType: "application/json",
      status: 200,
    }),
  );
  await mkdir(screenshotDirectory, { recursive: true });

  for (const viewport of [
    { height: 1000, width: 1440 },
    { height: 1080, width: 1920 },
  ]) {
    const suffix = `${String(viewport.width)}x${String(viewport.height)}`;
    await page.setViewportSize(viewport);
    await page.goto("/annotations/run-1");
    await showWholeFrame(page);
    await freezeMotion(page);

    const inspector = page.getByRole("region", { name: "Annotations" });
    // The first navigation pays for the dev server's cold module graph, which
    // is slower than the default expectation timeout on this machine.
    await expect(inspector).toBeVisible({ timeout: 30_000 });

    // B: the eyebrow and the source badges are gone; the count badge stays.
    await expect(inspector.locator(".df-panel__eyebrow")).toHaveCount(0);
    await expect(inspector.getByText("BIEŻĄCA KLATKA")).toHaveCount(0);
    await expect(inspector.getByText("OCR", { exact: true })).toHaveCount(0);
    await expect(inspector.getByText("Ręczna", { exact: true })).toHaveCount(0);
    // The count badge is what is left beside the title. Its value is read
    // rather than pinned, because the box drawn below adds to it and the
    // second viewport starts from that state.
    // FE-022: the count lives on each class row, "(n)", as Figma draws it.
    const annotationTotal = () =>
      inspector.locator(".df-review-classes__count").evaluateAll((items) =>
        items.reduce((sum, item) => sum + Number((item.textContent ?? "").replace(/\D/g, "")), 0),
      );
    const countBefore = await annotationTotal();
    expect(countBefore, `class rows carry no counts at ${suffix}`).toBeGreaterThan(0);

    // B: the row is the full width of the list, and a long name wraps rather
    // than being cut off.
    const list = inspector.locator(".df-review-classes");
    const row = inspector.locator(".df-review-classes__item .df-button").first();
    const listBox = await bounds(list, `class list at ${suffix}`);
    const rowBox = await bounds(row, `class row at ${suffix}`);
    // FE-022: the list is a bordered box, so a full-width row is 2 px (the
    // two 1 px borders) narrower than the box itself.
    expect(Math.abs(rowBox.width - listBox.width), `row is not full width at ${suffix}`)
      .toBeLessThanOrEqual(2.5);

    // C: only the classes the previous frame holds, each with its count.
    // The unit the row digits are in is said once, in the list's own name.
    const copyPanel = page.getByRole("region", {
      name: "Repeat Previous",
    });
    // FE-022: the Repeat Previous list is always open.
    const picker = copyPanel.getByRole("group", {
      name: "Classes of the previous frame and their counts",
    });
    await expect(picker.getByRole("checkbox", { name: "7 3" })).toBeVisible();
    await expect(
      picker.getByRole("checkbox", { name: "health & armour 1" }),
    ).toBeVisible();
    await expect(picker.getByRole("checkbox", { name: /^Score/ })).toHaveCount(0);
    // FE-022: the source frame is named in the Accept button's tooltip.
    await expect(
      copyPanel.getByRole("button", { name: "Accept — repeat the previous frame" }),
    ).toHaveAttribute(
      "title",
      "Copies from frame 16 — the previous one in time, whatever the status filter.",
    );

    // The previous-classes request resolves independently from the frame. Wait
    // for it before the first screenshot too, otherwise this shot races between
    // a short loading panel and the final scrollable inspector.
    await shoot(page, `annotations-panel-${suffix}`);

    // The inspector is capped and scrolls (FE-014), so the picker has to be
    // brought into view or this screenshot repeats the one above.
    await picker.scrollIntoViewIfNeeded();
    await shoot(page, `copy-previous-${suffix}`);

    /*
     * D: drawing saves at once. The panel that opens names the class it
     * assigned and offers "Zmień nazwę" — the two things that make an
     * unasked-for class a visible mistake rather than an exported one.
     */
    // FE-022: the whole frame is letterboxed inside its field, so the drawing
    // surface itself — not the field — is where the gesture has to land.
    const canvas = page.getByRole("listbox", { name: "Annotation boxes on the frame" });
    await canvas.scrollIntoViewIfNeeded();
    const canvasBox = await bounds(canvas, `canvas at ${suffix}`);
    await page.mouse.move(canvasBox.x + 80, canvasBox.y + 80);
    await page.mouse.down();
    await page.mouse.move(canvasBox.x + 240, canvasBox.y + 180, { steps: 5 });
    await page.mouse.up();

    await expect(page.getByText("assigned: 7")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Change class: assign another class to this box" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Discard box" })).toBeVisible();
    // The long class name must not widen the panel past its column.
    const panelBox = await bounds(page.locator(".df-annotation-popover"), `panel at ${suffix}`);
    const columnBox = await bounds(
      page.locator(".df-review-workspace__side-column"),
      `side column at ${suffix}`,
    );
    expect(
      panelBox.x + panelBox.width,
      `panel exceeds its column at ${suffix}`,
    ).toBeLessThanOrEqual(columnBox.x + columnBox.width + 0.5);

    // D: the drawn box is in the frame, so the panel's count went up by one.
    await expect.poll(annotationTotal).toBe(countBefore + 1);

    // The action row is the point of this shot: "Discard box" and "Zmień nazwę"
    // have to be reachable without scrolling the panel.
    await expect(page.getByRole("button", { name: "Discard box" })).toBeInViewport();
    await expect(
      page.getByRole("button", { name: "Change class: assign another class to this box" }),
    ).toBeInViewport();

    await shoot(page, `drawn-box-${suffix}`);
  }
});

test("FE-017 B: długa nazwa klasy łamie się zamiast być ucinana", async ({ page }) => {
  test.setTimeout(60_000);
  const api = new ApiHarness({ phase: "review" });
  await api.install(page);
  await page.route(/\/api\/v1\/profiles\/profile-1$/, (route) =>
    route.fulfill({
      body: JSON.stringify(visualProfile),
      contentType: "application/json",
      status: 200,
    }),
  );
  // The stock frame carries only `category-1`, so the long class needs an
  // annotation of its own before the list can show it.
  const longNamedFrame = frameDetailFixture({
    annotations: [
      annotationFixture(),
      annotationFixture({
        category_id: "hud-health",
        confidence: null,
        id: "ann-long",
        observation_id: null,
        source: "manual",
      }),
    ],
    height: 852,
    width: 1280,
  });
  await page.route(/\/api\/v1\/frames\/frame-1$/, (route) =>
    route.fulfill({
      body: JSON.stringify(longNamedFrame),
      contentType: "application/json",
      status: 200,
    }),
  );
  await page.setViewportSize({ height: 1000, width: 1440 });
  await page.goto("/annotations/run-1");
  await showWholeFrame(page);

  const inspector = page.getByRole("region", { name: "Annotations" });
  await expect(inspector).toBeVisible({ timeout: 30_000 });
  const longRow = inspector.getByRole("button", { name: /^Class health & armour/ });
  await expect(longRow).toBeVisible();

  const measured = await longRow.locator(".df-review-classes__name").evaluate(
    (element) => {
      const style = getComputedStyle(element);
      return {
        clientWidth: element.clientWidth,
        lineHeight: Number.parseFloat(style.lineHeight),
        overflow: style.overflow,
        scrollHeight: element.scrollHeight,
        scrollWidth: element.scrollWidth,
        textOverflow: style.textOverflow,
      };
    },
  );

  // Nothing is cut horizontally, and nothing is hidden by an ellipsis.
  expect(measured.scrollWidth).toBeLessThanOrEqual(measured.clientWidth + 1);
  expect(measured.textOverflow).not.toBe("ellipsis");
  expect(measured.overflow).not.toBe("hidden");
  expect(measured.scrollHeight).toBeGreaterThanOrEqual(measured.lineHeight - 1);
});
