import { expect, type Page } from "@playwright/test";

/** FE-022: the canvas starts cropped (IMAGE FILL); Reset shows the whole frame. */
export async function showWholeFrame(page: Page) {
  const reset = page.getByRole("button", { name: "Reset view" }).first();
  await reset.waitFor({ state: "visible" });
  if (await reset.isEnabled()) {
    await reset.click();
    await expect(page.getByLabel("Canvas zoom").first()).toHaveText("100%");
  }
  // Leave focus where a fresh page has it: on the body.
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
}

/** Opens a screenshot through the tile's Enter path fallback. */
export async function openScreenshotPath(page: Page, imagePath: string) {
  await page.getByRole("button", { name: "Enter path" }).first().click();
  await page.getByLabel("Screenshot path").first().fill(imagePath);
  await page.getByRole("button", { name: "Open", exact: true }).first().click();
}

/** Restricts the selected region's OCR characters to exactly one character. */
export async function readOnlyCharacter(page: Page, character: string) {
  for (const group of ["Numbers", "Letters", "Symbols"]) {
    const row = page.getByRole("checkbox", { name: group, exact: true });
    if ((await row.getAttribute("aria-checked")) !== "false") {
      await row.click();
      if ((await row.getAttribute("aria-checked")) !== "false") {
        await row.click();
      }
    }
  }
  await page.getByRole("button", { name: "Expand group Numbers" }).click();
  await page.getByRole("checkbox", { name: character, exact: true }).click();
}

/** Creates a real profile through the FE-022 workspace, with OCR limited to 7. */
export async function createProfileInWorkspace(page: Page, imagePath: string, name: string) {
  await page.goto("/profiles/new");
  await openScreenshotPath(page, imagePath);
  const surface = page.getByRole("listbox", { name: "HUD regions on the reference screenshot" });
  await expect(surface).toBeVisible();
  await showWholeFrame(page);
  const bounds = await surface.boundingBox();
  if (bounds === null) throw new Error("Region drawing surface has no browser geometry");
  const from = { clientX: bounds.x + bounds.width * 0.2, clientY: bounds.y + bounds.height * 0.2 };
  const to = { clientX: bounds.x + bounds.width * 0.8, clientY: bounds.y + bounds.height * 0.6 };
  await surface.dispatchEvent("pointerdown", { ...from, pointerId: 11 });
  await surface.dispatchEvent("pointermove", { ...to, pointerId: 11 });
  await surface.dispatchEvent("pointerup", { ...to, pointerId: 11 });
  await page.getByRole("button", { name: "Accept", exact: true }).click();
  await readOnlyCharacter(page, "7");
  await page.getByRole("button", { name: "Save as" }).click();
  await page.getByLabel("New profile name").fill(name);
  const response = page.waitForResponse((item) => item.request().method() === "POST" && new URL(item.url()).pathname === "/api/v1/profiles");
  await page.getByRole("button", { name: "Save as new profile" }).click();
  const saved = await response;
  expect(saved.status(), await saved.text()).toBe(201);
  await expect(page.getByLabel("Search profile")).toHaveAttribute("placeholder", name);
}
