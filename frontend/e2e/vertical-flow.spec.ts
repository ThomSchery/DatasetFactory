import { expect, test, type APIRequestContext } from "@playwright/test";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const referenceImage = path.join(
  repositoryRoot,
  "backend/tests/fixtures/video/synthetic-frame.png",
);
const fixtureVideo = path.join(repositoryRoot, "backend/tests/fixtures/video/synthetic-hud.mkv");
const apiBase = "http://127.0.0.1:8000/api/v1";

async function apiJson<T>(request: APIRequestContext, pathname: string): Promise<T> {
  const response = await request.get(`${apiBase}${pathname}`);
  expect(response.ok(), `${pathname}: ${await response.text()}`).toBe(true);
  return response.json() as Promise<T>;
}

test("real fixture przechodzi przez FastAPI, SQLite, OCR stub, COCO i CAS complete", async ({
  page,
  request,
}) => {
  expect(fs.existsSync(referenceImage)).toBe(true);
  expect(fs.existsSync(fixtureVideo)).toBe(true);
  let completeBody: unknown = null;
  page.on("request", (outgoing) => {
    if (outgoing.method() === "POST" && outgoing.url().endsWith("/complete")) {
      completeBody = outgoing.postDataJSON();
    }
  });

  await page.goto("/profiles/new");
  await page.getByLabel("Nazwa profilu").fill("Gra testowa E2E");
  await page.getByLabel("Ścieżka obrazu referencyjnego").fill(referenceImage);
  await page.getByRole("button", { name: "Wczytaj podgląd" }).click();

  const image = page.getByAltText(/Obraz referencyjny profilu/);
  await expect(image).toBeVisible();
  const surface = page.getByRole("listbox", { name: "Regiony HUD na obrazie referencyjnym" });
  const bounds = await surface.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) {
    throw new Error("Region drawing surface has no browser geometry");
  }
  const from = { clientX: bounds.x + bounds.width * 0.2, clientY: bounds.y + bounds.height * 0.2 };
  const to = { clientX: bounds.x + bounds.width * 0.8, clientY: bounds.y + bounds.height * 0.6 };
  await surface.dispatchEvent("pointerdown", { ...from, pointerId: 1 });
  await surface.dispatchEvent("pointermove", { ...to, pointerId: 1 });
  await surface.dispatchEvent("pointerup", { ...to, pointerId: 1 });
  await expect(surface.getByRole("option", { name: /Region 1/ })).toBeVisible();
  await page.getByRole("button", { name: "7", exact: true }).click();
  await page.getByRole("button", { name: "Utwórz profil" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Materiały");

  await page.getByLabel("Ścieżka pliku wideo").fill(fixtureVideo);
  await page.getByRole("button", { name: "Zaimportuj materiał" }).click();
  const materialSelect = page.getByRole("combobox", { name: "Materiał", exact: true });
  await expect(materialSelect).toContainText("synthetic-hud.mkv");
  await materialSelect.selectOption({ index: 1 });
  await page.getByRole("combobox", { name: "Profil gry", exact: true }).selectOption({ index: 1 });
  await page.getByRole("button", { name: "Utwórz run" }).click();
  await expect(page.getByRole("button", { name: "Uruchom" })).toBeVisible();
  await page.getByRole("button", { name: "Uruchom" }).click();

  await page.waitForURL(/\/annotations\/[^/?]+$/);
  const runId = new URL(page.url()).pathname.split("/").at(-1);
  expect(runId).toBeTruthy();
  if (runId === undefined) {
    throw new Error("Run id missing after start navigation");
  }
  const acceptFrame = page.getByRole("button", { name: "Zaakceptuj klatkę" });
  await expect(acceptFrame).toBeVisible({
    timeout: 20_000,
  });
  await acceptFrame.click();
  await expect(acceptFrame).toHaveCount(0);

  await page.getByRole("link", { name: /Eksporty/ }).click();
  await expect(page.getByRole("button", { name: "Uruchom eksport COCO" })).toBeVisible();
  await page.getByRole("button", { name: "Uruchom eksport COCO" }).click();
  await expect(page).toHaveURL(/\/exports\?export_id=[^&]+$/);
  await expect(page.getByRole("heading", { name: "Wynik eksportu COCO" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.getByText("To licznik pochodzenia boksów, nie ocena trafności OCR."),
  ).toBeVisible();

  const exportId = new URL(page.url()).searchParams.get("export_id");
  expect(exportId).toBeTruthy();
  if (exportId === null) {
    throw new Error("Export id missing from durable URL locator");
  }
  const exported = await apiJson<{
    manifest: { annotation_sources: { manual: number; ocr: number } };
    output_relpath: string;
    status: string;
  }>(request, `/exports/${exportId}`);
  expect(exported.status).toBe("completed");
  expect(exported.manifest.annotation_sources).toEqual({ manual: 0, ocr: 1 });
  expect(exported.output_relpath).toBe(`exports/${exportId}`);

  const runtimeRoot = process.env.DATASETFACTORY_E2E_ROOT;
  expect(runtimeRoot).toBeTruthy();
  if (runtimeRoot === undefined) {
    throw new Error("E2E runtime root was not configured by the launcher");
  }
  expect(
    fs.existsSync(path.join(runtimeRoot, "workspace", "exports", exportId, "manifest.json")),
  ).toBe(true);

  const beforeComplete = await apiJson<{ version: number }>(request, `/runs/${runId}`);
  await page.getByRole("button", { name: "Zamknij run" }).click();
  await expect(page.getByText("Run został zamknięty")).toBeVisible();
  expect(completeBody).toEqual({ expected_version: beforeComplete.version });
  const completedRun = await apiJson<{ status: string }>(request, `/runs/${runId}`);
  expect(completedRun.status).toBe("completed");
});
