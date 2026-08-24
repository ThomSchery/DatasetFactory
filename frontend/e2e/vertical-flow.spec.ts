import { expect, test } from "@playwright/test";

import { ApiHarness, requestBody } from "./apiHarness";

test("fixture video i OCR stub przechodzą przez profil, run, review, eksport i CAS complete", async ({
  page,
}) => {
  const api = new ApiHarness();
  await api.install(page);

  await page.goto("/profiles/new");
  await page.getByLabel("Nazwa profilu").fill("Gra testowa");
  await page.getByLabel("Ścieżka obrazu referencyjnego").fill("D:\\fixtures\\synthetic-frame.png");
  await page.getByRole("button", { name: "Wczytaj podgląd" }).click();

  const image = page.getByAltText(/Obraz referencyjny profilu/);
  await expect(image).toBeVisible();
  const surface = page.getByRole("listbox", { name: "Regiony HUD na obrazie referencyjnym" });
  const bounds = await surface.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) {
    throw new Error("Region drawing surface has no browser geometry");
  }
  const from = { clientX: bounds.x + bounds.width * 0.25, clientY: bounds.y + bounds.height * 0.25 };
  const to = { clientX: bounds.x + bounds.width * 0.75, clientY: bounds.y + bounds.height * 0.5 };
  await surface.dispatchEvent("pointerdown", { ...from, pointerId: 1 });
  await surface.dispatchEvent("pointermove", { ...to, pointerId: 1 });
  await surface.dispatchEvent("pointerup", { ...to, pointerId: 1 });
  await expect(surface.getByRole("option", { name: /Region 1/ })).toBeVisible();
  await page.getByRole("button", { name: "7", exact: true }).click();
  await page.getByRole("button", { name: "Utwórz profil" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Materiały");

  await page.getByLabel("Ścieżka pliku wideo").fill("D:\\fixtures\\synthetic-hud.mp4");
  await page.getByRole("button", { name: "Zaimportuj materiał" }).click();
  const materialSelect = page.getByRole("combobox", { name: "Materiał", exact: true });
  await expect(materialSelect).toContainText("synthetic-hud.mp4");
  await materialSelect.selectOption("video-1");
  await page.getByRole("combobox", { name: "Profil gry", exact: true }).selectOption("profile-1");
  await page.getByRole("button", { name: "Utwórz run" }).click();
  await expect(page.getByRole("button", { name: "Uruchom" })).toBeVisible();
  await page.getByRole("button", { name: "Uruchom" }).click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Anotacje");
  await expect(page.getByRole("heading", { name: "Obraz i bbox" })).toBeVisible();
  await page.getByRole("button", { name: "Zaakceptuj klatkę" }).click();
  await expect.poll(() => requestBody(api, "/frames/frame-1/review")).toEqual({
    decision: "accept",
    expected_version: 7,
  });

  await page.getByRole("link", { name: /Eksporty/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Eksporty");
  await page.getByRole("button", { name: "Uruchom eksport COCO" }).click();
  await expect(page.getByRole("heading", { name: "Wynik eksportu COCO" })).toBeVisible({
    timeout: 8_000,
  });
  await expect(page.getByText("To licznik pochodzenia boksów, nie ocena trafności OCR.")).toBeVisible();
  await page.getByRole("button", { name: "Zamknij run" }).click();
  await expect(page.getByText("Run został zamknięty")).toBeVisible();

  expect(requestBody(api, "/profiles/reference-preview")).toEqual({
    reference_image_path: "D:\\fixtures\\synthetic-frame.png",
  });
  expect(requestBody(api, "/profiles")).toMatchObject({
    categories: [{ kind: "character", name: "7" }],
    name: "Gra testowa",
    reference_image_path: "D:\\fixtures\\synthetic-frame.png",
    regions: [{ height: 213, name: "Region 1", width: 640, x: 320, y: 213 }],
  });
  expect(requestBody(api, "/materials")).toEqual({ local_path: "D:\\fixtures\\synthetic-hud.mp4" });
  expect(requestBody(api, "/runs")).toEqual({ interval_ms: 1000, profile_id: "profile-1", video_id: "video-1" });
  expect(requestBody(api, "/runs/run-1/start")).toEqual({ expected_version: 1 });
  expect(requestBody(api, "/exports")).toEqual({ run_id: "run-1" });
  expect(requestBody(api, "/runs/run-1/complete")).toEqual({ expected_version: 4 });
});
