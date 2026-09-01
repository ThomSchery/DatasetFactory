import { expect, test, type APIRequestContext } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
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
  observation_id: string | null;
  source: "manual" | "ocr";
  status: string;
  version: number;
  height: number;
  width: number;
  x: number;
  y: number;
}

interface FrameSnapshot {
  annotations: AnnotationSnapshot[];
  frame_index: number;
  height: number;
  id: string;
  review_status: "accepted" | "pending" | "rejected";
  stage_status: string;
  version: number;
  width: number;
}

interface GeometryMutationBody {
  bbox: { height: number; width: number; x: number; y: number };
  expected_version: number;
}

interface RunSnapshot {
  completed_frames: number;
  current_frame_index: number | null;
  current_stage: string | null;
  id: string;
  status: string;
  total_frames: number;
  version: number;
}

interface FrameSummarySnapshot {
  frame_index: number;
  id: string;
  review_status: string;
  stage_status: string;
  version: number;
}

interface DurableCheckpointSnapshot {
  artifact_hash: string;
  artifact_relpath: string;
  attempt: number;
  frame_index: number;
  stage: string;
  status: string;
}

interface DurableFrameSnapshot {
  annotations: { frame_index: number; id: string; observation_id: string | null }[];
  checkpoints: DurableCheckpointSnapshot[];
  frames: FrameSummarySnapshot[];
  observations: { frame_index: number; id: string; sample_id: string }[];
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

function isDashboardGet(response: { request(): { method(): string }; url(): string }): boolean {
  return (
    response.request().method() === "GET" &&
    new URL(response.url()).pathname === "/api/v1/dashboard"
  );
}

function durableFrameSnapshot(runtimeRoot: string, runId: string): DurableFrameSnapshot {
  const database = new DatabaseSync(path.join(runtimeRoot, "workspace", "project.db"), {
    readOnly: true,
  });
  try {
    const frames = database
      .prepare(
        `SELECT id, frame_index, stage_status, review_status, version
           FROM frames
          WHERE run_id = ?
          ORDER BY frame_index`,
      )
      .all(runId) as unknown as FrameSummarySnapshot[];
    const observations = database
      .prepare(
        `SELECT f.frame_index, o.id, o.sample_id
           FROM ocr_observations AS o
           JOIN region_samples AS s ON s.id = o.sample_id
           JOIN frames AS f ON f.id = s.frame_id
          WHERE f.run_id = ?
          ORDER BY f.frame_index, o.id`,
      )
      .all(runId) as unknown as DurableFrameSnapshot["observations"];
    const annotations = database
      .prepare(
        `SELECT f.frame_index, a.id, a.observation_id
           FROM annotations AS a
           JOIN frames AS f ON f.id = a.frame_id
          WHERE f.run_id = ? AND a.source = 'ocr'
          ORDER BY f.frame_index, a.id`,
      )
      .all(runId) as unknown as DurableFrameSnapshot["annotations"];
    const checkpoints = database
      .prepare(
        `SELECT frame_index, stage, attempt, status, artifact_relpath, artifact_hash
           FROM stage_checkpoints
          WHERE run_id = ?
          ORDER BY frame_index, stage`,
      )
      .all(runId) as unknown as DurableCheckpointSnapshot[];
    return { annotations, checkpoints, frames, observations };
  } finally {
    database.close();
  }
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
  const geometryBodies: GeometryMutationBody[] = [];
  page.on("request", (outgoing) => {
    if (outgoing.method() === "POST" && outgoing.url().endsWith("/complete")) {
      completeBody = outgoing.postDataJSON();
    }
    if (
      outgoing.method() === "PATCH" &&
      new URL(outgoing.url()).pathname.startsWith("/api/v1/annotations/")
    ) {
      const body = outgoing.postDataJSON() as Partial<GeometryMutationBody>;
      if (body.bbox !== undefined && body.expected_version !== undefined) {
        geometryBodies.push(body as GeometryMutationBody);
      }
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
  const initialDashboardResponse = page.waitForResponse(isDashboardGet);
  await page.getByRole("button", { name: "Utwórz profil" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Materiały");
  expect((await initialDashboardResponse).ok()).toBe(true);

  await page.getByLabel("Ścieżka pliku wideo").fill(fixtureVideo);
  await page.getByRole("button", { name: "Zaimportuj materiał" }).click();
  const materialSelect = page.getByRole("combobox", { name: "Materiał", exact: true });
  await expect(materialSelect).toContainText("synthetic-hud.mkv");
  await materialSelect.selectOption({ index: 1 });
  await page.getByRole("combobox", { name: "Profil gry", exact: true }).selectOption({ index: 1 });
  await page.getByLabel("Interwał próbkowania (ms)").fill("500");
  const createRunResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/v1/runs",
  );
  const createdDashboardResponse = page.waitForResponse(isDashboardGet);
  await page.getByRole("button", { name: "Utwórz run" }).click();
  const createdRunResponse = await createRunResponse;
  expect(createdRunResponse.status(), await createdRunResponse.text()).toBe(201);
  const createdRun = (await createdRunResponse.json()) as RunSnapshot;
  const dashboardAfterCreate = await createdDashboardResponse;
  expect(dashboardAfterCreate.ok(), await dashboardAfterCreate.text()).toBe(true);
  expect((await dashboardAfterCreate.json()) as { run: RunSnapshot | null }).toMatchObject({
    run: { id: createdRun.id, status: "queued" },
  });
  const startRun = page.getByRole("button", { name: "Uruchom" });
  await expect(startRun).toBeVisible();

  const runId = createdRun.id;
  fs.writeFileSync(holdOcr, "1", "utf8");
  let restart: { previous_pid: number; restarted_pid: number } | null = null;
  let durableBeforeRestart: DurableFrameSnapshot | null = null;
  let firstFrameBeforeRestart: FrameSnapshot | null = null;
  try {
    await startRun.click();
    await page.waitForURL(/\/annotations\/[^/?]+$/);
    expect(new URL(page.url()).pathname).toBe(`/annotations/${runId}`);
    await expect
      .poll(
        () => (fs.existsSync(ocrEntered) ? fs.readFileSync(ocrEntered, "utf8").trim() : null),
        { timeout: 20_000 },
      )
      .toBe("1");

    const runBeforeRestart = await apiJson<RunSnapshot>(request, `/runs/${runId}`);
    expect(runBeforeRestart).toMatchObject({
      completed_frames: 1,
      current_frame_index: 1,
      current_stage: "ocr",
      total_frames: 2,
    });
    durableBeforeRestart = durableFrameSnapshot(runtimeRoot, runId);
    expect(durableBeforeRestart.frames).toHaveLength(2);
    expect(durableBeforeRestart.frames.map((frame) => frame.frame_index)).toEqual([0, 1]);
    expect(durableBeforeRestart.frames[0]).toMatchObject({
      frame_index: 0,
      review_status: "pending",
      stage_status: "review_pending",
    });
    expect(durableBeforeRestart.frames[1]).toMatchObject({
      frame_index: 1,
      review_status: "pending",
      stage_status: "cropped",
    });
    expect(durableBeforeRestart.observations).toHaveLength(1);
    expect(durableBeforeRestart.observations[0]?.frame_index).toBe(0);
    expect(durableBeforeRestart.annotations).toHaveLength(1);
    expect(durableBeforeRestart.annotations[0]?.frame_index).toBe(0);
    expect(durableBeforeRestart.checkpoints.filter((item) => item.frame_index === 0)).toHaveLength(
      3,
    );
    expect(
      durableBeforeRestart.checkpoints
        .filter((item) => item.frame_index === 0)
        .map((item) => `${item.stage}:${item.status}:${String(item.attempt)}`),
    ).toEqual(["crop:completed:1", "ocr:completed:1", "sample:completed:1"]);
    const firstFrameId = durableBeforeRestart.frames[0]?.id;
    expect(firstFrameId).toBeTruthy();
    if (firstFrameId === undefined) {
      throw new Error("First durable frame id missing before restart");
    }
    firstFrameBeforeRestart = await apiJson<FrameSnapshot>(request, `/frames/${firstFrameId}`);
    expect(firstFrameBeforeRestart.annotations).toHaveLength(1);
    expect(firstFrameBeforeRestart.annotations[0]).toMatchObject({
      id: durableBeforeRestart.annotations[0]?.id,
      observation_id: durableBeforeRestart.observations[0]?.id,
      source: "ocr",
      status: "proposed",
    });

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
  expect(durableBeforeRestart).not.toBeNull();
  expect(firstFrameBeforeRestart).not.toBeNull();
  const paused = await waitForRunStatus(request, runId, "paused");

  await page.goto("/");
  const resumeRun = page.getByRole("button", { name: "Wznów" });
  await expect(resumeRun).toBeVisible();
  await resumeRun.click();
  const resumed = await waitForRunStatus(request, runId, "review_ready");
  expect(resumed.total_frames).toBe(2);
  expect(resumed.completed_frames).toBe(2);
  expect(resumed.version).toBeGreaterThan(paused.version);

  const framesAfterResume = await apiJson<{
    items: FrameSummarySnapshot[];
    total: number;
  }>(request, `/runs/${runId}/frames?page=1&page_size=100`);
  expect(framesAfterResume.total).toBe(2);
  expect(framesAfterResume.items).toHaveLength(2);
  expect(framesAfterResume.items.map((frame) => frame.frame_index)).toEqual([0, 1]);
  const frameId = framesAfterResume.items[0]?.id;
  const secondFrameId = framesAfterResume.items[1]?.id;
  expect(frameId).toBeTruthy();
  expect(secondFrameId).toBeTruthy();
  if (frameId === undefined || secondFrameId === undefined) {
    throw new Error("Durable frame ids missing after resume");
  }
  expect(frameId).toBe(firstFrameBeforeRestart?.id);
  const frameAfterResume = await apiJson<FrameSnapshot>(request, `/frames/${frameId}`);
  expect(frameAfterResume).toEqual(firstFrameBeforeRestart);
  const secondFrameAfterResume = await apiJson<FrameSnapshot>(request, `/frames/${secondFrameId}`);
  for (const frame of [frameAfterResume, secondFrameAfterResume]) {
    expect(frame.stage_status).toBe("review_pending");
    expect(frame.annotations).toHaveLength(1);
    expect(frame.annotations[0]).toMatchObject({ source: "ocr", status: "proposed" });
  }

  const durableAfterResume = durableFrameSnapshot(runtimeRoot, runId);
  expect(durableAfterResume.frames).toHaveLength(2);
  expect(new Set(durableAfterResume.frames.map((frame) => frame.id)).size).toBe(2);
  expect(durableAfterResume.frames.map((frame) => frame.frame_index)).toEqual([0, 1]);
  expect(durableAfterResume.observations).toHaveLength(2);
  expect(durableAfterResume.annotations).toHaveLength(2);
  expect(durableAfterResume.checkpoints).toHaveLength(6);
  for (const frameIndex of [0, 1]) {
    expect(
      durableAfterResume.observations.filter((item) => item.frame_index === frameIndex),
    ).toHaveLength(1);
    expect(
      durableAfterResume.annotations.filter((item) => item.frame_index === frameIndex),
    ).toHaveLength(1);
    expect(
      durableAfterResume.checkpoints.filter(
        (item) => item.frame_index === frameIndex && item.status === "completed",
      ),
    ).toHaveLength(3);
  }
  expect(durableAfterResume.frames[0]).toEqual(durableBeforeRestart?.frames[0]);
  expect(durableAfterResume.observations.filter((item) => item.frame_index === 0)).toEqual(
    durableBeforeRestart?.observations,
  );
  expect(durableAfterResume.annotations.filter((item) => item.frame_index === 0)).toEqual(
    durableBeforeRestart?.annotations,
  );
  expect(durableAfterResume.checkpoints.filter((item) => item.frame_index === 0)).toEqual(
    durableBeforeRestart?.checkpoints.filter((item) => item.frame_index === 0),
  );
  expect(fs.readdirSync(path.join(runtimeRoot, "workspace", "exports"))).toHaveLength(0);

  await page.goto(`/annotations/${runId}`);
  const annotationList = page.getByRole("list", { name: "Aktywne anotacje" });
  const annotationRow = annotationList.getByRole("listitem").first();
  await expect(annotationRow).toBeVisible();
  const initialAnnotation = frameAfterResume.annotations[0];
  if (initialAnnotation === undefined) {
    throw new Error("OCR annotation missing after resume");
  }

  await annotationRow.getByRole("button", { name: "Zaznacz" }).click();
  const frameSurface = page.getByRole("listbox", { name: "Bbox anotacji na klatce" });
  const selectedOption = frameSurface.getByRole("option").first();
  await expect(selectedOption).toHaveAttribute("aria-selected", "true");
  await selectedOption.scrollIntoViewIfNeeded();
  const frameBounds = await frameSurface.boundingBox();
  const fillBounds = await selectedOption.locator(".df-region-overlay__shape-fill").boundingBox();
  expect(frameBounds).not.toBeNull();
  expect(fillBounds).not.toBeNull();
  if (frameBounds === null || fillBounds === null) {
    throw new Error("Selected bbox has no browser geometry");
  }

  const clientPointForSource = (x: number, y: number) => ({
    x: frameBounds.x + (x / frameAfterResume.width) * frameBounds.width,
    y: frameBounds.y + (y / frameAfterResume.height) * frameBounds.height,
  });
  const moveFrom = {
    x: fillBounds.x + fillBounds.width / 2,
    y: fillBounds.y + fillBounds.height / 2,
  };
  const browserMoveTarget = await page.evaluate(({ x, y }) => {
    const target = document.elementFromPoint(x, y);
    return {
      corner:
        target?.closest("[data-overlay-handle]")?.getAttribute("data-overlay-handle") ?? null,
      cursor: target === null ? null : getComputedStyle(target).cursor,
      shapeId:
        target?.closest("[data-overlay-shape-id]")?.getAttribute("data-overlay-shape-id") ?? null,
    };
  }, moveFrom);
  expect(browserMoveTarget).toEqual({
    corner: null,
    cursor: "move",
    shapeId: initialAnnotation.id,
  });
  const moveFromSource = {
    x: Math.round(((moveFrom.x - frameBounds.x) / frameBounds.width) * frameAfterResume.width),
    y: Math.round(((moveFrom.y - frameBounds.y) / frameBounds.height) * frameAfterResume.height),
  };
  const moveDelta = { x: 20, y: 12 };
  const moveTo = clientPointForSource(
    moveFromSource.x + moveDelta.x,
    moveFromSource.y + moveDelta.y,
  );
  const movedBbox = {
    x: initialAnnotation.x + moveDelta.x,
    y: initialAnnotation.y + moveDelta.y,
    width: initialAnnotation.width,
    height: initialAnnotation.height,
  };

  await page.mouse.move(moveFrom.x, moveFrom.y);
  await page.mouse.down();
  await page.mouse.move(moveTo.x, moveTo.y, { steps: 3 });
  await expect(annotationRow.getByLabel("x", { exact: true })).toHaveValue(String(movedBbox.x));
  await expect(annotationRow.getByLabel("y", { exact: true })).toHaveValue(String(movedBbox.y));
  await expect(annotationRow.getByLabel("width", { exact: true })).toHaveValue(
    String(movedBbox.width),
  );
  await expect(annotationRow.getByLabel("height", { exact: true })).toHaveValue(
    String(movedBbox.height),
  );
  await page.mouse.up();

  await expect.poll(() => geometryBodies.length).toBe(1);
  expect(geometryBodies[0]).toEqual({
    bbox: movedBbox,
    expected_version: initialAnnotation.version,
  });
  await expect
    .poll(async () => {
      const frame = await apiJson<FrameSnapshot>(request, `/frames/${frameId}`);
      const annotation = frame.annotations[0];
      return annotation === undefined
        ? null
        : { x: annotation.x, y: annotation.y, width: annotation.width, height: annotation.height };
    })
    .toEqual(movedBbox);
  const afterMove = await apiJson<FrameSnapshot>(request, `/frames/${frameId}`);
  const movedAnnotation = afterMove.annotations[0];
  if (movedAnnotation === undefined) {
    throw new Error("Moved annotation missing after direct edit");
  }

  const southEastHandle = selectedOption.locator(
    '[data-overlay-handle="south-east"] .df-region-overlay__shape-handle-hit',
  );
  const handleBounds = await southEastHandle.boundingBox();
  expect(handleBounds).not.toBeNull();
  if (handleBounds === null) {
    throw new Error("South-east resize handle has no browser geometry");
  }
  const resizeFrom = {
    x: handleBounds.x + handleBounds.width / 2,
    y: handleBounds.y + handleBounds.height / 2,
  };
  const browserResizeTarget = await page.evaluate(({ x, y }) => {
    const target = document.elementFromPoint(x, y);
    return {
      corner:
        target?.closest("[data-overlay-handle]")?.getAttribute("data-overlay-handle") ?? null,
      cursor: target === null ? null : getComputedStyle(target).cursor,
      shapeId:
        target?.closest("[data-overlay-shape-id]")?.getAttribute("data-overlay-shape-id") ?? null,
    };
  }, resizeFrom);
  expect(browserResizeTarget).toEqual({
    corner: "south-east",
    cursor: "nwse-resize",
    shapeId: initialAnnotation.id,
  });
  const resizeFromSource = {
    x: Math.round(
      ((resizeFrom.x - frameBounds.x) / frameBounds.width) * frameAfterResume.width,
    ),
    y: Math.round(
      ((resizeFrom.y - frameBounds.y) / frameBounds.height) * frameAfterResume.height,
    ),
  };
  expect(resizeFromSource).not.toEqual({
    x: movedBbox.x + movedBbox.width,
    y: movedBbox.y + movedBbox.height,
  });
  const resizedBbox = {
    ...movedBbox,
    width: movedBbox.width + 16,
    height: movedBbox.height + 8,
  };
  const resizeTo = clientPointForSource(
    resizeFromSource.x + 16,
    resizeFromSource.y + 8,
  );

  await page.mouse.move(resizeFrom.x, resizeFrom.y);
  await page.mouse.down();
  await page.mouse.move(resizeTo.x, resizeTo.y, { steps: 3 });
  await expect(annotationRow.getByLabel("x", { exact: true })).toHaveValue(String(resizedBbox.x));
  await expect(annotationRow.getByLabel("y", { exact: true })).toHaveValue(String(resizedBbox.y));
  await expect(annotationRow.getByLabel("width", { exact: true })).toHaveValue(
    String(resizedBbox.width),
  );
  await expect(annotationRow.getByLabel("height", { exact: true })).toHaveValue(
    String(resizedBbox.height),
  );
  await page.mouse.up();

  await expect.poll(() => geometryBodies.length).toBe(2);
  expect(geometryBodies[1]).toEqual({
    bbox: resizedBbox,
    expected_version: movedAnnotation.version,
  });
  await expect
    .poll(async () => {
      const frame = await apiJson<FrameSnapshot>(request, `/frames/${frameId}`);
      const annotation = frame.annotations[0];
      return annotation === undefined
        ? null
        : { x: annotation.x, y: annotation.y, width: annotation.width, height: annotation.height };
    })
    .toEqual(resizedBbox);

  await annotationRow.getByLabel("x", { exact: true }).fill(String(resizedBbox.x + 1));
  await annotationRow.getByRole("button", { name: "Zapisz geometrię" }).click();
  await expect
    .poll(async () => {
      const frame = await apiJson<FrameSnapshot>(request, `/frames/${frameId}`);
      return frame.annotations[0]?.x;
    })
    .toBe(resizedBbox.x + 1);

  await annotationRow.getByRole("button", { name: "Usuń" }).click();
  await expect(page.getByText("Ta klatka nie ma aktywnych anotacji.")).toBeVisible();
  const afterDelete = await apiJson<FrameSnapshot>(request, `/frames/${frameId}`);
  expect(afterDelete.annotations).toHaveLength(1);
  expect(afterDelete.annotations[0]?.status).toBe("deleted");

  await frameSurface.scrollIntoViewIfNeeded();
  const manualFrameBounds = await frameSurface.boundingBox();
  expect(manualFrameBounds).not.toBeNull();
  if (manualFrameBounds === null) {
    throw new Error("Frame drawing surface has no browser geometry");
  }
  const manualFrom = {
    clientX: manualFrameBounds.x + manualFrameBounds.width * 0.3,
    clientY: manualFrameBounds.y + manualFrameBounds.height * 0.3,
  };
  const manualTo = {
    clientX: manualFrameBounds.x + manualFrameBounds.width * 0.45,
    clientY: manualFrameBounds.y + manualFrameBounds.height * 0.45,
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

  const frameListPanel = page.getByRole("region", { name: "Klatki" });
  const secondFrameRow = frameListPanel.getByRole("listitem").filter({ hasText: "Klatka 1" });
  await expect(secondFrameRow).toBeVisible();
  await secondFrameRow.getByRole("button").click();
  await expect(page.getByRole("img", { name: `Klatka 1 runu ${runId}` })).toBeVisible();
  await page.getByRole("button", { name: "Zaakceptuj klatkę" }).click();
  await expect
    .poll(
      async () => (await apiJson<FrameSnapshot>(request, `/frames/${secondFrameId}`)).review_status,
    )
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
  expect(exported.manifest.annotation_sources).toEqual({ manual: 1, ocr: 1 });
  expect(exported.output_relpath).toBe(`exports/${exportId}`);

  const finalFrames = await apiJson<{ total: number }>(
    request,
    `/runs/${runId}/frames?review_status=accepted&page=1&page_size=100`,
  );
  expect(finalFrames.total).toBe(2);
  const finalFrame = await apiJson<FrameSnapshot>(request, `/frames/${frameId}`);
  expect(finalFrame.annotations).toHaveLength(2);
  expect(finalFrame.annotations.filter((annotation) => annotation.status !== "deleted")).toEqual([
    expect.objectContaining({ source: "manual" }),
  ]);
  const finalSecondFrame = await apiJson<FrameSnapshot>(request, `/frames/${secondFrameId}`);
  expect(finalSecondFrame.annotations).toEqual([
    expect.objectContaining({ source: "ocr", status: "accepted" }),
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
