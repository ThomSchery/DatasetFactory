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
    await expect(page.getByRole("img", { name: /Klatka .* runu/ })).toBeVisible();
    const geometry = await page.evaluate(() => {
      const rect = (selector: string) => {
        const element = document.querySelector(selector);
        if (element === null) throw new Error(`Brak ${selector}`);
        return element.getBoundingClientRect();
      };
      const image = rect(".df-region-overlay__image");
      const zoom = rect(".df-region-overlay__zoom-controls");
      return {
        width: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        preview: rect(".df-review-workspace__preview").width,
        headerHeight: rect(".df-shell__bar").height,
        picker: rect(".df-review-toolbar__frame-select select").width,
        zoomOverlapsImage: zoom.top < image.bottom && zoom.bottom > image.top,
      };
    });
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.width + 1);
    expect(geometry.preview).toBeGreaterThan(200);
    expect(geometry.headerHeight).toBeLessThan(80);
    // The picker has to show at least "Klatka NN" next to its arrow; it once
    // collapsed to the arrow alone at 360 px.
    expect(geometry.picker, `frame picker too narrow at ${String(width)} px`).toBeGreaterThanOrEqual(128);
    // Below the `lg` frame the image is too small for floating zoom controls
    // to sit on it without covering the HUD under review (FE-015 keeps them on
    // the image from 992 px up).
    if (width < 992) {
      expect(geometry.zoomOverlapsImage, `zoom controls cover the frame at ${String(width)} px`).toBe(false);
    }
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
    // An icon is a block; it once stacked above its label inside the button.
    for (const name of ["Nowy profil", "Save profile", "Save as"]) {
      const offset = await page.getByRole("button", { exact: true, name }).evaluate((button) => {
        const icon = button.querySelector(".df-icon")?.getBoundingClientRect();
        const content = button.querySelector(".df-button__content")?.getBoundingClientRect();
        if (icon === undefined || content === undefined) throw new Error("Brak ikony przycisku");
        return Math.abs(icon.top + icon.height / 2 - (content.top + content.height / 2));
      });
      expect(offset, `icon of „${name}” is not in line with its label at ${String(width)} px`).toBeLessThanOrEqual(2);
    }
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
