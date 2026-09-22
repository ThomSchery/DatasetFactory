import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { profileFixture, profileSummaryFixture } from "../src/test/fixtures";
import { ApiHarness } from "./apiHarness";
import { deterministicPng } from "./deterministicPng";

const screenshotDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../docs/tickets/FE-016/screenshots",
);

const visualProfile = profileFixture({
  name: "Quake Champions",
  categories: [{ id: "category-1", kind: "character", name: "7" }],
});

const visualProfileSummary = profileSummaryFixture({
  name: visualProfile.name,
  category_count: visualProfile.categories.length,
  region_count: visualProfile.regions.length,
});

async function installProfileRoutes(page: Page): Promise<void> {
  await page.route(/\/api\/v1\/profiles$/, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        body: JSON.stringify([visualProfileSummary]),
        contentType: "application/json",
        status: 200,
      });
      return;
    }
    await route.fallback();
  });
  await page.route(/\/api\/v1\/profiles\/profile-1$/, (route) =>
    route.fulfill({
      body: JSON.stringify(visualProfile),
      contentType: "application/json",
      status: 200,
    }),
  );
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

async function bounds(locator: Locator, label: string) {
  const value = await locator.boundingBox();
  if (value === null) {
    throw new Error(`${label} has no browser geometry`);
  }
  return value;
}

async function expectInsideViewport(
  locator: Locator,
  viewport: { height: number; width: number },
  label: string,
): Promise<void> {
  const box = await bounds(locator, label);
  expect(box.x, `${label} starts before the viewport`).toBeGreaterThanOrEqual(0);
  expect(box.y, `${label} starts above the viewport`).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, `${label} exceeds the viewport width`).toBeLessThanOrEqual(
    viewport.width + 0.5,
  );
  expect(box.y + box.height, `${label} exceeds the viewport height`).toBeLessThanOrEqual(
    viewport.height + 0.5,
  );
}

async function expectInsideContainer(
  locator: Locator,
  container: Locator,
  label: string,
): Promise<void> {
  const item = await bounds(locator, label);
  const parent = await bounds(container, `${label} container`);
  expect(item.x, `${label} exceeds the container on the left`).toBeGreaterThanOrEqual(
    parent.x - 0.5,
  );
  expect(item.x + item.width, `${label} exceeds the container on the right`).toBeLessThanOrEqual(
    parent.x + parent.width + 0.5,
  );
  expect(item.y, `${label} exceeds the container at the top`).toBeGreaterThanOrEqual(
    parent.y - 0.5,
  );
  expect(item.y + item.height, `${label} exceeds the container at the bottom`).toBeLessThanOrEqual(
    parent.y + parent.height + 0.5,
  );
}

test("FE-016 pokazuje zmianę grupy i konfigurację Roboflow w obu viewportach", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const api = new ApiHarness({ phase: "accepted" });
  await api.install(page);
  await installProfileRoutes(page);
  await mkdir(screenshotDirectory, { recursive: true });

  for (const viewport of [
    { height: 1000, width: 1440 },
    { height: 1080, width: 1920 },
  ]) {
    const suffix = `${String(viewport.width)}x${String(viewport.height)}`;
    await page.setViewportSize(viewport);
    await page.goto("/profiles");
    await freezeMotion(page);

    await page.getByRole("button", { name: "Zmień nazwę klasy 7" }).click();
    const renameInput = page.getByRole("textbox", { name: "Nowa nazwa klasy 7" });
    await renameInput.fill("osiem");

    const immutableNotice = page.getByRole("status", {
      name: "Ukończone eksporty pozostają niezmienne",
    });
    const kindWarning = page.getByRole("status", { name: "Klasa zmieni grupę" });
    const profilePanel = page.getByRole("region", { name: visualProfile.name });
    const profileBody = profilePanel.locator(".df-panel__body");
    await kindWarning.scrollIntoViewIfNeeded();
    await expect(immutableNotice).toBeInViewport();
    await expect(kindWarning).toBeInViewport();
    await expect(kindWarning).toContainText("Liczby");
    await expect(kindWarning).toContainText("Pola HUD (gra)");
    await expectInsideViewport(immutableNotice, viewport, `immutable notice at ${suffix}`);
    await expectInsideViewport(kindWarning, viewport, `kind warning at ${suffix}`);
    await expectInsideContainer(immutableNotice, profileBody, `immutable notice at ${suffix}`);
    await expectInsideContainer(kindWarning, profileBody, `kind warning at ${suffix}`);

    await writeFile(
      path.join(screenshotDirectory, `profile-rename-${suffix}.png`),
      deterministicPng(
        await page.screenshot({ animations: "disabled", caret: "hide", fullPage: false }),
      ),
    );

    await page.goto("/exports");
    await freezeMotion(page);
    const variant = page.getByRole("combobox", { name: "Wariant eksportu" });
    await variant.selectOption("roboflow_coco");
    const exportPanel = page.getByRole("region", { name: "Nowy eksport" });
    const exportBody = exportPanel.locator(".df-panel__body");
    const controls = [
      variant,
      page.getByRole("spinbutton", { name: "Train (%)" }),
      page.getByRole("spinbutton", { name: "Valid (%)" }),
      page.getByRole("spinbutton", { name: "Test (%)" }),
      page.getByRole("spinbutton", { name: "Ziarno podziału" }),
    ];
    for (const [index, control] of controls.entries()) {
      await expect(control).toBeVisible();
      await expectInsideViewport(control, viewport, `export control ${String(index + 1)} at ${suffix}`);
      await expectInsideContainer(control, exportBody, `export control ${String(index + 1)} at ${suffix}`);
    }
    const ratioBoxes = await Promise.all(
      controls.slice(1, 4).map((control, index) => bounds(control, `ratio control ${String(index + 1)}`)),
    );
    for (let index = 1; index < ratioBoxes.length; index += 1) {
      const previous = ratioBoxes[index - 1]!;
      const current = ratioBoxes[index]!;
      expect(
        previous.x + previous.width,
        `ratio controls overlap at ${suffix}`,
      ).toBeLessThanOrEqual(current.x + 0.5);
    }

    // Fields whose labels start on one line must put their inputs on one line
    // too. Only help text one field carries and its neighbours do not breaks
    // this, and it breaks it below the labels, where no assertion that compares
    // sibling inputs to each other can see it.
    const fieldRows = await page
      .locator(".df-exports__split-fields .df-field")
      .evaluateAll((fields) =>
        fields.map((field) => {
          const label = field.querySelector(".df-field__label");
          const control = field.querySelector(".df-field__control");
          if (label === null || control === null) {
            throw new Error("Split field is missing its label or its control");
          }
          return {
            controlTop: control.getBoundingClientRect().top,
            label: label.textContent ?? "",
            labelTop: label.getBoundingClientRect().top,
          };
        }),
      );
    expect(fieldRows.length, `split fields are missing at ${suffix}`).toBe(4);
    for (const field of fieldRows) {
      for (const other of fieldRows) {
        if (field === other || Math.abs(field.labelTop - other.labelTop) > 1) {
          continue;
        }
        expect(
          Math.abs(field.controlTop - other.controlTop),
          `„${field.label}” and „${other.label}” start on one row but their inputs do not at ${suffix}`,
        ).toBeLessThanOrEqual(1);
      }
    }

    await writeFile(
      path.join(screenshotDirectory, `export-variant-${suffix}.png`),
      deterministicPng(
        await page.screenshot({ animations: "disabled", caret: "hide", fullPage: false }),
      ),
    );
  }

  expect(
    api.requests.filter((request) => !["GET", "HEAD", "OPTIONS"].includes(request.method)),
  ).toEqual([]);
});
