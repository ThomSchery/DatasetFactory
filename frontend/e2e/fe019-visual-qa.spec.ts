import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { profileFixture, profileSummaryFixture } from "../src/test/fixtures";
import { ApiHarness } from "./apiHarness";
import { deterministicPng } from "./deterministicPng";
import { showWholeFrame } from "./profileFlow";

const screenshotDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../docs/tickets/FE-019/screenshots",
);

const visualProfile = profileFixture({
  name: "Quake Champions",
  source_height: 852,
  source_width: 1280,
  categories: [
    { id: "category-1", kind: "character", name: "7" },
    { id: "digit-8", kind: "character", name: "8" },
    { id: "letter-a", kind: "character", name: "A" },
    { id: "symbol-dash", kind: "character", name: "-" },
    { id: "hud-score", kind: "game", name: "score" },
    { id: "hud-health", kind: "game", name: "health & armour" },
    { id: "hud-timer", kind: "game", name: "round timer" },
    { id: "hud-overtime", kind: "game", name: "overtime indicator" },
  ],
});

const visualSummary = profileSummaryFixture({
  category_count: visualProfile.categories.length,
  name: visualProfile.name,
  region_count: visualProfile.regions.length,
  source_height: visualProfile.source_height,
  source_width: visualProfile.source_width,
});

async function installRoutes(page: Page): Promise<void> {
  const api = new ApiHarness({ phase: "review" });
  api.previousClasses = {
    classes: visualProfile.categories.map((category, index) => ({
      category_id: category.id,
      count: index + 1,
    })),
    previous_frame_id: "frame-0",
    previous_frame_index: 16,
  };
  await api.install(page);
  await page.route(/\/api\/v1\/profiles$/, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        body: JSON.stringify([visualSummary]),
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

async function shoot(page: Page, name: string): Promise<void> {
  await writeFile(
    path.join(screenshotDirectory, `${name}.png`),
    deterministicPng(
      await page.screenshot({ animations: "disabled", caret: "hide", fullPage: false }),
    ),
  );
}

async function bounds(locator: Locator, label: string) {
  const value = await locator.boundingBox();
  if (value === null) {
    throw new Error(`${label} has no browser geometry`);
  }
  return value;
}

test("FE-019 pokazuje dwa stany pickerów, trzy panele i wspólny trójkąt profilu", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await installRoutes(page);
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

    await page.getByRole("button", { name: "Class 7, 1 annotations" }).click();
    const sideColumn = page.getByRole("complementary", { name: "Current frame panels" });
    const inspector = page.getByRole("region", { name: "Annotations" });
    const annotation = page.getByRole("dialog", { name: "Edit annotation 7" });
    const copy = page.getByRole("region", { name: "Repeat Previous" });
    await expect(annotation).toBeVisible({ timeout: 30_000 });
    await expect(copy).toBeVisible();

    // FE-022: the class field and its actions sit inside Annotations, and
    // Repeat Previous follows it.
    const inspectorBox = await bounds(inspector, `inspector at ${suffix}`);
    const annotationBox = await bounds(annotation, `annotation at ${suffix}`);
    const copyBox = await bounds(copy, `copy at ${suffix}`);
    expect(annotationBox.y, `class field is not inside Annotations at ${suffix}`).toBeGreaterThan(inspectorBox.y);
    expect(annotationBox.y + annotationBox.height).toBeLessThanOrEqual(inspectorBox.y + inspectorBox.height + 0.5);
    expect(copyBox.y, `copy is not after Annotations at ${suffix}`).toBeGreaterThan(
      inspectorBox.y + inspectorBox.height,
    );

    const annotationFilter = annotation.getByRole("textbox", { name: "Class" });
    await expect(annotationFilter).toBeFocused();
    await expect(annotation.getByRole("listbox", { name: "Profile classes" })).toBeVisible();
    await annotation.scrollIntoViewIfNeeded();
    await shoot(page, `annotation-expanded-${suffix}`);

    await annotation.getByRole("button", { name: "Collapse list Profile classes" }).click();
    await expect(annotation.getByRole("listbox", { name: "Profile classes" })).toBeHidden();
    await sideColumn.scrollIntoViewIfNeeded();
    await shoot(page, `three-panels-annotation-collapsed-${suffix}`);

    // Repeat Previous is an inline list box: rows with counts, no tags.
    const copyList = copy.getByRole("group", { name: "Classes of the previous frame and their counts" });
    await expect(copyList).toBeVisible();
    const box = copy.locator(".df-review-copy__box");
    const metrics = await box.evaluate((element) => ({
      clientWidth: element.clientWidth,
      overflowY: getComputedStyle(element).overflowY,
      scrollWidth: element.scrollWidth,
    }));
    expect(metrics.overflowY).toBe("auto");
    expect(metrics.scrollWidth, `copy list scrolls horizontally at ${suffix}`).toBeLessThanOrEqual(metrics.clientWidth);
    await copy.scrollIntoViewIfNeeded();
    await shoot(page, `copy-tags-expanded-${suffix}`);

    await page.goto("/profiles");
    await freezeMotion(page);
    await page.getByRole("button", { name: "Select region Pasek zdrowia" }).click();
    const profileGroups = page.getByRole("region", { name: "Classes" });
    await expect(profileGroups).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Expand group Numbers" }).click();
    await page.getByRole("button", { name: "Collapse group Numbers" }).click();
    await expect(page.getByRole("button", { name: "Expand group Numbers" })).toBeVisible();
    await profileGroups.scrollIntoViewIfNeeded();
    await shoot(page, `profile-triangles-${suffix}`);
  }
});
