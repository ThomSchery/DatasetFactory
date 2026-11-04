import { expect, type Page } from "@playwright/test";

/** Creates a real profile through the FE-021 workspace, with OCR limited to 7. */
export async function createProfileInWorkspace(page: Page, imagePath: string, name: string) {
  await page.goto("/profiles/new");
  await page.getByLabel("Ścieżka zrzutu ekranu").fill(imagePath);
  await page.getByRole("button", { name: "Wczytaj zrzut" }).click();
  const surface = page.getByRole("listbox", { name: "Regiony HUD na zrzucie referencyjnym" });
  await expect(surface).toBeVisible();
  const bounds = await surface.boundingBox();
  if (bounds === null) throw new Error("Region drawing surface has no browser geometry");
  const from = { clientX: bounds.x + bounds.width * 0.2, clientY: bounds.y + bounds.height * 0.2 };
  const to = { clientX: bounds.x + bounds.width * 0.8, clientY: bounds.y + bounds.height * 0.6 };
  await surface.dispatchEvent("pointerdown", { ...from, pointerId: 11 });
  await surface.dispatchEvent("pointermove", { ...to, pointerId: 11 });
  await surface.dispatchEvent("pointerup", { ...to, pointerId: 11 });
  await page.getByRole("button", { name: "Accept", exact: true }).click();
  await page.getByRole("button", { name: "Wyczyść zaznaczone klasy" }).click();
  await page.getByRole("checkbox", { name: "7", exact: true }).click();
  await page.getByRole("button", { name: "Save as" }).click();
  await page.getByLabel("Nazwa nowego profilu").fill(name);
  const response = page.waitForResponse((item) => item.request().method() === "POST" && new URL(item.url()).pathname === "/api/v1/profiles");
  await page.getByRole("button", { name: "Zapisz jako nowy profil" }).click();
  const saved = await response;
  expect(saved.status(), await saved.text()).toBe(201);
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}
