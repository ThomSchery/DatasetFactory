import { expect, test } from "@playwright/test";
import { profileFixture, profileSummaryFixture } from "../src/test/fixtures";
import { ApiHarness } from "./apiHarness";
import { showWholeFrame } from "./profileFlow";

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
  await expect(dialog.getByLabel("New profile name")).toBeFocused();
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
    await showWholeFrame(page);
    const preview = page.locator(".df-review-workspace__preview");
    await expect(preview).toBeVisible();
    await expect(page.locator(".df-review-workspace__preview .df-region-overlay")).toBeVisible();
    const geometry = await page.evaluate(() => {
      const rect = (selector: string) => {
        const element = document.querySelector(selector);
        if (element === null) throw new Error(`Brak ${selector}`);
        return element.getBoundingClientRect();
      };
      const image = rect(".df-review-workspace__preview .df-region-overlay");
      const zoom = rect(".df-region-overlay__zoom-controls");
      return {
        width: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        preview: rect(".df-review-workspace__preview").width,
        headerHeight: rect(".df-shell__bar").height,
        picker: rect(".df-review-nav__counter").width,
        zoomOverlapsImage: zoom.top < image.bottom && zoom.bottom > image.top,
      };
    });
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.width + 1);
    expect(geometry.preview).toBeGreaterThan(200);
    expect(geometry.headerHeight).toBeLessThan(80);
    // FE-022: the counter between the arrows opens the frame picker; Figma
    // draws it 113–180 px wide.
    expect(geometry.picker, `frame counter too narrow at ${String(width)} px`).toBeGreaterThanOrEqual(100);
    // From 576 px the tools sit in a row under the picture field; below it
    // Figma leaves no row, so they float in the field's corner (FE-022 log).
    if (width >= 576) {
      expect(geometry.zoomOverlapsImage, `zoom controls cover the field at ${String(width)} px`).toBe(false);
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
    const surface = page.getByRole("listbox", { name: "HUD regions on the reference screenshot" });
    await expect(surface).toBeVisible();
    await showWholeFrame(page);
    // An icon is a block; it once stacked above its label inside the button.
    for (const name of ["Save profile", "Save as"]) {
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
    await expect(page.getByLabel("Name of the drawn region")).toBeFocused();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `../docs/tickets/FE-021/profile-${width}.png`, fullPage: false });
    await page.getByRole("button", { name: "Reject" }).click();
  }
});

test("FE-021 FIX1: draw inside a full-frame existing region with real hit testing", async ({ page }) => {
  const api = new ApiHarness({ phase: "profile" });
  await api.install(page);
  await page.route("**/api/v1/profiles", (route) => route.fulfill({ json: [profileSummaryFixture({ active: true })] }));
  const profile = profileFixture();
  profile.regions[0] = { ...profile.regions[0], x: 0, y: 0, width: 1920, height: 1080 };
  await page.route("**/api/v1/profiles/profile-1", (route) => route.fulfill({ json: profile }));
  await page.goto("/profiles");
  const toggle = page.getByRole("button", { name: "Draw region" });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  const surface = page.getByRole("listbox", { name: "HUD regions on the reference screenshot" });
  await showWholeFrame(page);
  await surface.scrollIntoViewIfNeeded();
  const box = await surface.boundingBox();
  if (box === null) throw new Error("No surface");
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByLabel("Name of the drawn region")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
});

test("FIX2: draw mode has a visible high-contrast pressed state", async ({ page }) => {
  const api = new ApiHarness({ phase: "profile" });
  await api.install(page);
  await page.route("**/api/v1/profiles", (route) => route.fulfill({ json: [profileSummaryFixture({ active: true })] }));
  await page.route("**/api/v1/profiles/profile-1", (route) => route.fulfill({ json: profileFixture() }));
  await page.goto("/profiles");
  const toggle = page.getByRole("button", { name: "Draw region" });
  const clearInteraction = async () => {
    await page.mouse.move(0, 0);
    await toggle.evaluate((element) => element.blur());
  };
  const colors = () => toggle.evaluate((element) => ({
    button: getComputedStyle(element).backgroundColor,
    panel: getComputedStyle(element.closest("section")!).backgroundColor,
  }));
  const parse = (color: string) => {
    const parts = color.match(/[\d.]+/g)?.map(Number);
    if (!parts || parts.length < 3) throw new Error(`Not an RGB color: ${color}`);
    // FE-024: the alpha layers are `color-mix()` over a preset colour, which
    // Chromium serialises as `color(srgb r g b / a)` with 0–1 channels.
    const scale = color.startsWith("color(srgb") ? 255 : 1;
    return [parts[0] * scale, parts[1] * scale, parts[2] * scale, parts[3] ?? 1];
  };
  const composite = (foreground: number[], background: number[]) => {
    if (background[3] !== 1) throw new Error("Expected an opaque panel background");
    return foreground.slice(0, 3).map((value, i) => value * foreground[3] + background[i] * (1 - foreground[3]));
  };
  const luminance = (rgb: number[]) => rgb.slice(0, 3).map((n) => n / 255)
    .map((n) => n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4)
    .reduce((sum, n, index) => sum + n * [0.2126, 0.7152, 0.0722][index], 0);
  const contrast = ({ button, panel }: { button: string; panel: string }) => {
    const background = parse(panel);
    const values = [luminance(composite(parse(button), background)), luminance(background)].sort((a, b) => a - b);
    return (values[1] + 0.05) / (values[0] + 0.05);
  };
  await clearInteraction();
  const off = await colors();
  await toggle.click();
  await clearInteraction();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(toggle.locator('[aria-hidden="true"]')).toBeVisible();
  const active = await colors();
  expect(active.button).not.toBe(off.button);
  expect(contrast(active)).toBeGreaterThanOrEqual(3);
  await toggle.hover();
  expect(contrast(await colors())).toBeGreaterThanOrEqual(3);
});
