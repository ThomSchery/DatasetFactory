import { expect, test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { profileFixture, profileSummaryFixture } from "../src/test/fixtures";
import { ApiHarness } from "./apiHarness";
import { deterministicPng } from "./deterministicPng";

const screenshotDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../docs/tickets/FE-018/screenshots",
);

const visualProfile = profileFixture({
  name: "Quake Champions",
  source_height: 852,
  source_width: 1280,
  version: 4,
  regions: [
    { id: "region-health", name: "health & armour", x: 32, y: 680, width: 280, height: 120 },
    { id: "region-kill", name: "kill", x: 570, y: 64, width: 140, height: 72 },
    { id: "region-score-left", name: "score_left", x: 420, y: 48, width: 120, height: 64 },
    { id: "region-score-right", name: "score_right", x: 740, y: 48, width: 120, height: 64 },
  ],
  categories: [
    { id: "hud-score", kind: "game", name: "score" },
    { id: "category-1", kind: "character", name: "7" },
    { id: "digit-8", kind: "character", name: "8" },
    { id: "letter-a", kind: "character", name: "A" },
    { id: "symbol-dash", kind: "character", name: "-" },
  ],
});

const visualSummary = profileSummaryFixture({
  category_count: visualProfile.categories.length,
  name: visualProfile.name,
  region_count: visualProfile.regions.length,
  source_height: visualProfile.source_height,
  source_width: visualProfile.source_width,
});

async function installProfileRoutes(page: Page): Promise<void> {
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

test("FE-018 pokazuje dodawanie regionu i te same zwijane grupy klas na obu ekranach", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const api = new ApiHarness({ phase: "review" });
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

    await page.getByRole("button", { name: "Dodaj region" }).click();
    const nextRunNotice = page.getByRole("status", {
      name: "Ustawienia regionu obowiązują od kolejnego runu",
    });
    await expect(nextRunNotice).toBeVisible({ timeout: 30_000 });
    await expect(nextRunNotice).toContainText(
      "nie przelicza istniejących klatek, próbek ani obserwacji",
    );
    await expect(page.getByRole("textbox", { name: "Nazwa nowego regionu" })).toBeVisible();
    await expect(page.getByLabel("Dozwolone znaki OCR")).toHaveValue("78A-");
    await expect(page.getByLabel("Układ tekstu OCR")).toHaveValue("7");
    await nextRunNotice.scrollIntoViewIfNeeded();
    await shoot(page, `profile-add-region-${suffix}`);

    const profileClasses = page.getByRole("group", { name: "Liczby" });
    await profileClasses.scrollIntoViewIfNeeded();
    for (const label of ["Pola HUD (gra)", "Liczby", "Litery", "Symbole"]) {
      await expect(page.getByRole("group", { name: label })).toBeVisible();
    }
    await shoot(page, `profile-groups-expanded-${suffix}`);

    for (const label of ["Liczby", "Litery", "Symbole"]) {
      await page.getByRole("button", { name: `Zwiń grupę ${label}` }).click();
      await expect(page.getByRole("button", { name: `Rozwiń grupę ${label}` })).toBeVisible();
    }
    await shoot(page, `profile-groups-collapsed-${suffix}`);

    await page.goto("/annotations/run-1");
    await freezeMotion(page);
    await page.getByRole("button", { name: "Klasa 7, 1 anotacji" }).click();
    const popover = page.getByRole("dialog", { name: "Edytuj anotację 7" });
    await expect(popover).toBeVisible({ timeout: 30_000 });
    for (const label of ["Pola HUD (gra)", "Liczby", "Litery", "Symbole"]) {
      await expect(popover.getByRole("group", { name: label })).toBeVisible();
    }
    await shoot(page, `annotation-groups-expanded-${suffix}`);

    for (const label of ["Liczby", "Litery", "Symbole"]) {
      await popover.getByRole("button", { name: `Zwiń grupę ${label}` }).click();
    }
    await shoot(page, `annotation-groups-collapsed-${suffix}`);

    // Falsyfikowalność wymagania filtra: `8` is hidden above, then a query
    // must reveal it without forgetting that Liczby was collapsed.
    const filter = popover.getByRole("textbox", { name: "Klasa" });
    await filter.fill("8");
    await expect(popover.getByRole("option", { name: "8" })).toBeVisible();
    await filter.fill("");
    await expect(popover.getByText("8", { exact: true })).toBeHidden();
  }
});
