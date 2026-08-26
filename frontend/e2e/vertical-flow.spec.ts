import { expect, test, type APIRequestContext } from "@playwright/test";
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
const backendControlBase = "http://127.0.0.1:8001";

interface AnnotationSnapshot {
  id: string;
  source: "manual" | "ocr";
  status: string;
  version: number;
  x: number;
}

interface FrameSnapshot {
  annotations: AnnotationSnapshot[];
  id: string;
  review_status: "accepted" | "pending" | "rejected";
}

interface RunSnapshot {
  completed_frames: number;
  status: string;
  total_frames: number;
  version: number;
}

async function apiJson<T>(request: APIRequestContext, pathname: string): Promise<T> {
  const response = await request.get(`${apiBase}${pathname}`);
  expect(response.ok(), `${pathname}: ${await response.text()}`).toBe(true);
  return response.json() as Promise<T>;
}

async function waitForRunStatus(
  request: APIRequestContext,
  runId: string,
  status: string,
): Promise<RunSnapshot> {
  await expect
    .poll(async () => (await apiJson<RunSnapshot>(request, `/runs/${runId}`)).status, {
      timeout: 20_000,
    })
    .toBe(status);
  return apiJson<RunSnapshot>(request, `/runs/${runId}`);
}

function configuredRuntimeRoot(): string {
  const runtimeRoot = process.env.DATASETFACTORY_E2E_ROOT;
  expect(runtimeRoot).toBeTruthy();
  if (runtimeRoot === undefined) {
    throw new Error("E2E runtime root was not configured by the launcher");
  }
  return runtimeRoot;
}

test("restartuje backend w OCR, wznawia bez duplikatów i przechodzi pełny review", async ({
  page,
  request,
}) => {
  expect(fs.existsSync(referenceImage)).toBe(true);
  expect(fs.existsSync(fixtureVideo)).toBe(true);
  const runtimeRoot = configuredRuntimeRoot();
  const controlRoot = path.join(runtimeRoot, "control");
  const holdOcr = path.join(controlRoot, "hold-ocr");
  const ocrEntered = path.join(controlRoot, "ocr-entered");
  fs.mkdirSync(controlRoot, { recursive: true });
  fs.rmSync(ocrEntered, { force: true });

  let completeBody: unknown = null;
  page.on("request", (outgoing) => {
    if (outgoing.method() === "POST" && outgoing.url().endsWith("/complete")) {
      completeBody = outgoing.postDataJSON();
    }
  });

  await page.goto("/profiles/new");
  await page.getByLabel("Nazwa profilu").fill("Gra testowa E2E restart");
  await page.getByLabel("Ścieżka obrazu referencyjnego").fill(referenceImage);
  await page.getByRole("button", { name: "Wczytaj podgląd" }).click();

  const image = page.getByAltText(/Obraz referencyjny profilu/);
  await expect(image).toBeVisible();
  const profileSurface = page.getByRole("listbox", {
    name: "Regiony HUD na obrazie referencyjnym",
  });
  const profileBounds = await profileSurface.boundingBox();
  expect(profileBounds).not.toBeNull();
  if (profileBounds === null) {
    throw new Error("Region drawing surface has no browser geometry");
  }
  const profileFrom = {
    clientX: profileBounds.x + profileBounds.width * 0.2,
    clientY: profileBounds.y + profileBounds.height * 0.2,
  };
  const profileTo = {
    clientX: profileBounds.x + profileBounds.width * 0.8,
    clientY: profileBounds.y + profileBounds.height * 0.6,
  };
  await profileSurface.dispatchEvent("pointerdown", { ...profileFrom, pointerId: 1 });
  await profileSurface.dispatchEvent("pointermove", { ...profileTo, pointerId: 1 });
  await profileSurface.dispatchEvent("pointerup", { ...profileTo, pointerId: 1 });
  await expect(profileSurface.getByRole("option", { name: /Region 1/ })).toBeVisible();
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
  const startRun = page.getByRole("button", { name: "Uruchom" });
  await expect(startRun).toBeVisible();

  fs.writeFileSync(holdOcr, "hold", "utf8");
  let restart: { previous_pid: number; restarted_pid: number } | null = null;
  try {
    await startRun.click();
    await page.waitForURL(/\/annotations\/[^/?]+$/);
    await expect.poll(() => fs.existsSync(ocrEntered), { timeout: 20_000 }).toBe(true);

    const response = await request.post(`${backendControlBase}/restart`);
    expect(response.ok(), await response.text()).toBe(true);
    restart = (await response.json()) as { previous_pid: number; restarted_pid: number };
  } finally {
    fs.rmSync(holdOcr, { force: true });
  }

  expect(restart).not.toBeNull();
  expect(restart?.previous_pid).toBeGreaterThan(0);
  expect(restart?.restarted_pid).toBeGreaterThan(0);
  expect(restart?.restarted_pid).not.toBe(restart?.previous_pid);

  const runId = new URL(page.url()).pathname.split("/").at(-1);
  expect(runId).toBeTruthy();
  if (runId === undefined) {
    throw new Error("Run id missing after start navigation");
  }
  const paused = await waitForRunStatus(request, runId, "paused");

  await page.goto("/");
  const resumeRun = page.getByRole("button", { name: "Wznów" });
  await expect(resumeRun).toBeVisible();
  await resumeRun.click();
  const resumed = await waitForRunStatus(request, runId, "review_ready");
  expect(resumed.total_frames).toBe(1);
  expect(resumed.completed_frames).toBe(1);
  expect(resumed.version).toBeGreaterThan(paused.version);

  const framesAfterResume = await apiJson<{
    items: { id: string }[];
    total: number;
  }>(request, `/runs/${runId}/frames?page=1&page_size=100`);
  expect(framesAfterResume.total).toBe(1);
  expect(framesAfterResume.items).toHaveLength(1);
  const frameId = framesAfterResume.items[0]?.id;
  expect(frameId).toBeTruthy();
  if (frameId === undefined) {
    throw new Error("Frame id missing after resume");
  }
  const frameAfterResume = await apiJson<FrameSnapshot>(request, `/frames/${frameId}`);
  expect(frameAfterResume.annotations).toHaveLength(1);
  expect(frameAfterResume.annotations[0]).toMatchObject({ source: "ocr", status: "proposed" });
  expect(fs.readdirSync(path.join(runtimeRoot, "workspace", "exports"))).toHaveLength(0);

  await page.goto(`/annotations/${runId}`);
  const annotationList = page.getByRole("list", { name: "Aktywne anotacje" });
  const annotationRow = annotationList.getByRole("listitem").first();
  await expect(annotationRow).toBeVisible();
  const originalX = frameAfterResume.annotations[0]?.x;
  expect(originalX).toBeDefined();
  if (originalX === undefined) {
    throw new Error("OCR annotation geometry missing after resume");
  }
  await annotationRow.getByLabel("x", { exact: true }).fill(String(originalX + 1));
  await annotationRow.getByRole("button", { name: "Zapisz geometrię" }).click();
  await expect
    .poll(async () => {
      const frame = await apiJson<FrameSnapshot>(request, `/frames/${frameId}`);
      return frame.annotations[0]?.x;
    })
    .toBe(originalX + 1);

  await annotationRow.getByRole("button", { name: "Usuń" }).click();
  await expect(page.getByText("Ta klatka nie ma aktywnych anotacji.")).toBeVisible();
  const afterDelete = await apiJson<FrameSnapshot>(request, `/frames/${frameId}`);
  expect(afterDelete.annotations).toHaveLength(1);
  expect(afterDelete.annotations[0]?.status).toBe("deleted");

  const frameSurface = page.getByRole("listbox", { name: "Bbox anotacji na klatce" });
  const frameBounds = await frameSurface.boundingBox();
  expect(frameBounds).not.toBeNull();
  if (frameBounds === null) {
    throw new Error("Frame drawing surface has no browser geometry");
  }
  const manualFrom = {
    clientX: frameBounds.x + frameBounds.width * 0.3,
    clientY: frameBounds.y + frameBounds.height * 0.3,
  };
  const manualTo = {
    clientX: frameBounds.x + frameBounds.width * 0.45,
    clientY: frameBounds.y + frameBounds.height * 0.45,
  };
  await frameSurface.dispatchEvent("pointerdown", { ...manualFrom, pointerId: 2 });
  await frameSurface.dispatchEvent("pointermove", { ...manualTo, pointerId: 2 });
  await frameSurface.dispatchEvent("pointerup", { ...manualTo, pointerId: 2 });
  await expect
    .poll(async () => {
      const frame = await apiJson<FrameSnapshot>(request, `/frames/${frameId}`);
      return frame.annotations.filter(
        (annotation) => annotation.source === "manual" && annotation.status !== "deleted",
      ).length;
    })
    .toBe(1);

  await page.getByRole("button", { name: "Odrzuć klatkę" }).click();
  await expect
    .poll(async () => (await apiJson<FrameSnapshot>(request, `/frames/${frameId}`)).review_status)
    .toBe("rejected");
  const reviewFilter = page.getByRole("combobox", { name: "Status weryfikacji" });
  await reviewFilter.selectOption("rejected");
  const reopenFrame = page.getByRole("button", { name: "Otwórz ponownie" });
  await expect(reopenFrame).toBeVisible();
  await reopenFrame.click();
  await expect
    .poll(async () => (await apiJson<FrameSnapshot>(request, `/frames/${frameId}`)).review_status)
    .toBe("pending");
  await reviewFilter.selectOption("pending");
  const acceptFrame = page.getByRole("button", { name: "Zaakceptuj klatkę" });
  await expect(acceptFrame).toBeVisible();
  await acceptFrame.click();
  await expect
    .poll(async () => (await apiJson<FrameSnapshot>(request, `/frames/${frameId}`)).review_status)
    .toBe("accepted");

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
  expect(exported.manifest.annotation_sources).toEqual({ manual: 1, ocr: 0 });
  expect(exported.output_relpath).toBe(`exports/${exportId}`);

  const finalFrames = await apiJson<{ total: number }>(
    request,
    `/runs/${runId}/frames?review_status=accepted&page=1&page_size=100`,
  );
  expect(finalFrames.total).toBe(1);
  const finalFrame = await apiJson<FrameSnapshot>(request, `/frames/${frameId}`);
  expect(finalFrame.annotations).toHaveLength(2);
  expect(finalFrame.annotations.filter((annotation) => annotation.status !== "deleted")).toEqual([
    expect.objectContaining({ source: "manual" }),
  ]);
  expect(
    fs
      .readdirSync(path.join(runtimeRoot, "workspace", "exports"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory()),
  ).toHaveLength(1);
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
