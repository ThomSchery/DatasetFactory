import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const referenceImage = path.join(
  repositoryRoot,
  "backend/tests/fixtures/video/synthetic-frame.png",
);
const fixtureVideo = path.join(repositoryRoot, "backend/tests/fixtures/video/synthetic-hud.mkv");
const apiBase = "http://127.0.0.1:8000/api/v1";

interface RunSnapshot {
  id: string;
  status: string;
  version: number;
}

async function apiJson<T>(request: APIRequestContext, pathname: string): Promise<T> {
  const response = await request.get(`${apiBase}${pathname}`);
  expect(response.ok(), `${pathname}: ${await response.text()}`).toBe(true);
  return response.json() as Promise<T>;
}

async function createProfile(page: Page): Promise<void> {
  await page.goto("/profiles/new");
  await page.getByLabel("Nazwa profilu").fill("Gra testowa E2E błędy");
  await page.getByLabel("Ścieżka obrazu referencyjnego").fill(referenceImage);
  await page.getByRole("button", { name: "Wczytaj podgląd" }).click();
  const surface = page.getByRole("listbox", {
    name: "Regiony HUD na obrazie referencyjnym",
  });
  const bounds = await surface.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) {
    throw new Error("Region drawing surface has no browser geometry");
  }
  const from = { clientX: bounds.x + bounds.width * 0.2, clientY: bounds.y + bounds.height * 0.2 };
  const to = { clientX: bounds.x + bounds.width * 0.8, clientY: bounds.y + bounds.height * 0.6 };
  await surface.dispatchEvent("pointerdown", { ...from, pointerId: 11 });
  await surface.dispatchEvent("pointermove", { ...to, pointerId: 11 });
  await surface.dispatchEvent("pointerup", { ...to, pointerId: 11 });
  await page.getByRole("button", { name: "7", exact: true }).click();
  await page.getByRole("button", { name: "Utwórz profil" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Materiały");
}

async function cancelRunBestEffort(request: APIRequestContext, runId: string | null) {
  if (runId === null) {
    return;
  }
  const current = await request.get(`${apiBase}/runs/${runId}`);
  if (!current.ok()) {
    return;
  }
  const run = (await current.json()) as RunSnapshot;
  if (run.status === "completed" || run.status === "cancelled") {
    return;
  }
  await request.post(`${apiBase}/runs/${runId}/cancel`, {
    data: { expected_version: run.version },
  });
}

test("pokazuje kod i copy dla brakującego źródła, active_run i workspace", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const runtimeRoot = process.env.DATASETFACTORY_E2E_ROOT;
  expect(runtimeRoot).toBeTruthy();
  if (runtimeRoot === undefined) {
    throw new Error("E2E runtime root was not configured by the launcher");
  }
  const controlRoot = path.join(runtimeRoot, "control");
  const holdOcr = path.join(controlRoot, "hold-ocr");
  const ocrEntered = path.join(controlRoot, "ocr-entered");
  const workspaceUnavailable = path.join(controlRoot, "workspace-unavailable");
  fs.mkdirSync(controlRoot, { recursive: true });
  fs.rmSync(holdOcr, { force: true });
  fs.rmSync(ocrEntered, { force: true });
  fs.rmSync(workspaceUnavailable, { force: true });

  let queuedRunId: string | null = null;
  let slotOwnerRunId: string | null = null;
  try {
    await page.goto("/materials");
    const missingSource = path.join(runtimeRoot, "missing-source.mkv");
    expect(fs.existsSync(missingSource)).toBe(false);
    await page.getByLabel("Ścieżka pliku wideo").fill(missingSource);
    const sourceResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/v1/materials" &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Zaimportuj materiał" }).click();
    const sourceResponse = await sourceResponsePromise;
    expect(sourceResponse.status()).toBe(404);
    expect((await sourceResponse.json()) as { error: { code: string } }).toMatchObject({
      error: { code: "source_missing" },
    });
    const sourceAlert = page.getByRole("alert");
    await expect(sourceAlert).toContainText("Plik źródłowy nie istnieje pod zapisaną ścieżką.");
    await expect(sourceAlert).toContainText("Przywróć plik w tym samym miejscu");
    await expect(page.getByText("source_missing", { exact: true })).toBeVisible();

    await createProfile(page);
    await page.getByLabel("Ścieżka pliku wideo").fill(fixtureVideo);
    await page.getByRole("button", { name: "Zaimportuj materiał" }).click();
    const materialSelect = page.getByRole("combobox", { name: "Materiał", exact: true });
    await expect(materialSelect).toContainText("synthetic-hud.mkv");
    await materialSelect.selectOption({ index: 1 });
    await page
      .getByRole("combobox", { name: "Profil gry", exact: true })
      .selectOption({ index: 1 });
    await page.getByRole("button", { name: "Utwórz run" }).click();
    const visibleStart = page.getByRole("button", { name: "Uruchom" });
    await expect(visibleStart).toBeVisible();

    const dashboard = await apiJson<{ run: RunSnapshot | null }>(request, "/dashboard");
    expect(dashboard.run).toMatchObject({ status: "queued" });
    queuedRunId = dashboard.run?.id ?? null;
    expect(queuedRunId).toBeTruthy();

    const profile = await apiJson<{ id: string }>(request, "/profiles/current");
    const materials = await apiJson<{ items: { id: string }[] }>(
      request,
      "/materials?page=1&page_size=100",
    );
    const materialId = materials.items[0]?.id;
    expect(materialId).toBeTruthy();
    if (materialId === undefined) {
      throw new Error("Imported material id missing");
    }
    const createSlotOwner = await request.post(`${apiBase}/runs`, {
      data: { interval_ms: 1000, profile_id: profile.id, video_id: materialId },
    });
    expect(createSlotOwner.status(), await createSlotOwner.text()).toBe(201);
    const slotOwner = (await createSlotOwner.json()) as RunSnapshot;
    slotOwnerRunId = slotOwner.id;

    fs.writeFileSync(holdOcr, "hold", "utf8");
    const startSlotOwner = await request.post(`${apiBase}/runs/${slotOwner.id}/start`, {
      data: { expected_version: slotOwner.version },
    });
    expect(startSlotOwner.status(), await startSlotOwner.text()).toBe(202);

    const conflictResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/v1/runs/${queuedRunId}/start` &&
        response.request().method() === "POST",
    );
    await visibleStart.click();
    const conflictResponse = await conflictResponsePromise;
    expect(conflictResponse.status()).toBe(409);
    expect((await conflictResponse.json()) as { error: { code: string } }).toMatchObject({
      error: { code: "active_run" },
    });
    const activeRunAlert = page.getByRole("alert");
    await expect(activeRunAlert).toContainText("Inny run jest już aktywny.");
    await expect(activeRunAlert).toContainText("Zatrzymaj lub dokończ bieżący run");
    await expect.poll(() => fs.existsSync(ocrEntered), { timeout: 20_000 }).toBe(true);

    fs.rmSync(holdOcr, { force: true });
    await cancelRunBestEffort(request, slotOwnerRunId);
    await expect
      .poll(async () => (await apiJson<RunSnapshot>(request, `/runs/${slotOwner.id}`)).status, {
        timeout: 20_000,
      })
      .toBe("cancelled");
    await cancelRunBestEffort(request, queuedRunId);

    fs.writeFileSync(workspaceUnavailable, "unavailable", "utf8");
    const healthResponse = await request.get(`${apiBase}/health`);
    expect(healthResponse.status()).toBe(503);
    expect(
      (await healthResponse.json()) as {
        error: { code: string; details: { health: { workspace: unknown } } };
      },
    ).toMatchObject({
      error: {
        code: "dependency_unavailable",
        details: {
          health: {
            workspace: { available: false, critical: true, detail: "unavailable" },
          },
        },
      },
    });

    await page.goto("/");
    const systemPanel = page.getByRole("region", { name: "Stan systemu" });
    await expect(systemPanel).toContainText("Niedostępny");
    const workspaceRow = systemPanel.getByRole("listitem").filter({ hasText: "Katalog roboczy" });
    await expect(workspaceRow).toContainText("Niedostępny");
    await expect(workspaceRow).toContainText("unavailable");
  } finally {
    fs.rmSync(holdOcr, { force: true });
    fs.rmSync(workspaceUnavailable, { force: true });
    await cancelRunBestEffort(request, slotOwnerRunId);
    await cancelRunBestEffort(request, queuedRunId);
  }

  const restoredHealth = await request.get(`${apiBase}/health`);
  expect(restoredHealth.ok(), await restoredHealth.text()).toBe(true);
});
