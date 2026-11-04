import { expect, test } from "@playwright/test";
import { profileFixture, profileSummaryFixture } from "../src/test/fixtures";
import { ApiHarness } from "./apiHarness";

test("FE-021: Save as dialog traps focus and restores its opener on Escape", async ({ page }) => {
  const api = new ApiHarness({ phase: "profile" });
  await api.install(page);
  await page.route("**/api/v1/profiles", (route) => route.fulfill({
    json: [profileSummaryFixture({ active: true })],
  }));
  await page.route("**/api/v1/profiles/profile-1", (route) => route.fulfill({ json: profileFixture() }));
  await page.goto("/profiles");
  const opener = page.getByRole("button", { name: "Save as" });
  await expect(opener).toBeEnabled();
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Save as" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Nazwa nowego profilu")).toBeFocused();
  for (let i = 0; i < 4; i += 1) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test("FE-021: review remains usable across mobile, tablet and desktop widths", async ({ page }) => {
  const api = new ApiHarness({ phase: "review" });
  await api.install(page);
  for (const width of [360, 576, 768, 992, 1200, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/annotations/run-1");
    const preview = page.locator(".df-review-workspace__preview");
    await expect(preview).toBeVisible();
    const geometry = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      preview: document.querySelector(".df-review-workspace__preview")?.getBoundingClientRect().width,
      headerHeight: document.querySelector(".df-shell__bar")?.getBoundingClientRect().height,
    }));
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.width + 1);
    expect(geometry.preview).toBeGreaterThan(200);
    expect(geometry.headerHeight).toBeLessThan(80);
    await page.screenshot({ path: `../docs/tickets/FE-021/review-${width}.png`, fullPage: false });
  }
});

test("FE-021: profile overlay draws at mobile, tablet and desktop sizes", async ({ page }) => {
  const api = new ApiHarness({ phase: "profile" });
  await api.install(page);
  await page.route("**/api/v1/profiles", (route) => route.fulfill({ json: [profileSummaryFixture({ active: true })] }));
  await page.route("**/api/v1/profiles/profile-1", (route) => route.fulfill({ json: profileFixture() }));
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/profiles");
    const surface = page.getByRole("listbox", { name: "Regiony HUD na zrzucie referencyjnym" });
    await expect(surface).toBeVisible();
    await surface.scrollIntoViewIfNeeded();
    const box = await surface.boundingBox();
    if (box === null) throw new Error("Brak powierzchni obrazu");
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.7, { steps: 4 });
    await page.mouse.up();
    await expect(page.getByLabel("Nazwa narysowanego regionu")).toBeFocused();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `../docs/tickets/FE-021/profile-${width}.png`, fullPage: false });
    await page.getByRole("button", { name: "Reject" }).click();
  }
});
