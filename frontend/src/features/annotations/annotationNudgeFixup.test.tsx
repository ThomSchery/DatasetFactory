import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { queryKeys, type FrameDetail } from "../../api";
import {
  annotationFixture,
  dashboardFixture,
  errorEnvelope,
  frameDetailFixture,
  framePageFixture,
  profileFixture,
  runFixture,
} from "../../test/fixtures";
import { renderApp, stubFetch, type StubbedResponse } from "../../test/harness";

/*
 * FE-009-FIX1. Every regression here counts requests rather than reading state:
 * each of the four findings is a case where the screen showed one thing and the
 * network carried another, so only the request itself settles the question.
 */

const PROFILE = profileFixture({
  categories: [
    { id: "category-1", kind: "character", name: "7" },
    { id: "category-2", kind: "game", name: "health" },
  ],
});

function reviewApi(
  options: {
    frame?: FrameDetail;
    mutation?: (url: string, init: RequestInit) => StubbedResponse;
  } = {},
) {
  const frame = options.frame ?? frameDetailFixture();
  return stubFetch((url, init): StubbedResponse => {
    if (init?.method !== undefined && init.method !== "GET") {
      if (options.mutation !== undefined) {
        return options.mutation(url, init);
      }
      return { status: 200, body: frame };
    }
    if (url === "/api/v1/runs/run-1") {
      return { status: 200, body: runFixture({ id: "run-1", profile_id: PROFILE.id }) };
    }
    if (url === `/api/v1/profiles/${PROFILE.id}`) {
      return { status: 200, body: PROFILE };
    }
    if (url.startsWith("/api/v1/runs/run-1/frames?")) {
      return { status: 200, body: framePageFixture() };
    }
    if (url === `/api/v1/frames/${frame.id}`) {
      return { status: 200, body: frame };
    }
    if (url === "/api/v1/dashboard") {
      return { status: 200, body: dashboardFixture({ profile: PROFILE }) };
    }
    throw new Error(`Nieobsłużone żądanie testowe: ${url}`);
  });
}

type FetchSpy = ReturnType<typeof reviewApi>;

interface RecordedRequest {
  body: Record<string, unknown>;
  method: string;
  url: string;
}

function mutations(fetchSpy: FetchSpy): RecordedRequest[] {
  return fetchSpy.mock.calls
    .filter(([, init]) => init?.method !== undefined && init.method !== "GET")
    .map(([url, init]) => ({
      body: init?.body === undefined ? {} : (JSON.parse(String(init.body)) as Record<string, unknown>),
      method: String(init?.method),
      url: String(url),
    }));
}

/** PATCHes that carry geometry, as opposed to the class PATCH on the same URL. */
function geometryPatches(fetchSpy: FetchSpy): RecordedRequest[] {
  return mutations(fetchSpy).filter(
    (request) => request.method === "PATCH" && "bbox" in request.body,
  );
}

function overlayShape(): HTMLElement {
  return within(screen.getByRole("listbox", { name: "Bbox anotacji na klatce" })).getByRole(
    "option",
  );
}

function overlayShapeNamed(name: RegExp): HTMLElement {
  return within(screen.getByRole("listbox", { name: "Bbox anotacji na klatce" })).getByRole(
    "option",
    { name },
  );
}

function overlaySurface(): HTMLElement {
  const overlay = screen.getByRole("listbox", { name: "Bbox anotacji na klatce" });
  vi.spyOn(overlay, "getBoundingClientRect").mockReturnValue({
    bottom: 1080,
    height: 1080,
    left: 0,
    right: 1920,
    top: 0,
    width: 1920,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
  return overlay;
}

function layOutOverlayViewport(overlay: HTMLElement): HTMLElement {
  const viewport = overlay.closest(".df-region-overlay");
  if (!(viewport instanceof HTMLElement)) {
    throw new Error("Annotation overlay is missing its viewport");
  }
  vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue({
    bottom: 1080,
    height: 1080,
    left: 0,
    right: 1920,
    top: 0,
    width: 1920,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
  return viewport;
}

function ownShapeFill(shape = overlayShape()): Element {
  const fill = shape.querySelector(".df-region-overlay__shape-fill");
  if (fill === null) {
    throw new Error("Selected annotation is missing its fill target");
  }
  return fill;
}

/** Selects the only annotation and leaves focus outside the docked panel. */
async function selectAndNudge(user: ReturnType<typeof userEvent.setup>, presses = 3): Promise<void> {
  const classButton = screen.getByRole("button", { name: "Klasa 7, 1 anotacji" });
  await user.click(classButton);
  classButton.focus();
  await user.keyboard("{ArrowRight}".repeat(presses));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("FE-010-FIX1 — pan is a non-destructive canvas gesture", () => {
  function expectUnsavedNudge(fetchSpy: FetchSpy): void {
    expect(screen.getByRole("dialog", { name: "Edytuj anotację 7" })).toBeVisible();
    expect(overlayShape()).toHaveAttribute(
      "aria-label",
      expect.stringContaining("x 102, y 120"),
    );
    expect(screen.getByText("Niezapisane")).toBeVisible();
    expect(screen.getByRole("status", { name: "Niezapisane przesunięcie bboxa" })).toBeVisible();
    expect(mutations(fetchSpy)).toHaveLength(0);
  }

  it("keeps an open panel and its unsaved nudge through a middle-button pan", async () => {
    const user = userEvent.setup();
    const fetchSpy = reviewApi();
    renderApp(["/annotations/run-1"]);

    await screen.findByRole("listbox", { name: "Bbox anotacji na klatce" });
    await selectAndNudge(user, 2);
    const overlay = overlaySurface();
    const viewport = layOutOverlayViewport(overlay);
    fireEvent.wheel(overlay, {
      clientX: 480,
      clientY: 270,
      ctrlKey: true,
      deltaY: -100,
    });

    fireEvent.pointerDown(overlay, {
      button: 1,
      clientX: 480,
      clientY: 270,
      pointerId: 7,
    });
    expect(viewport).toHaveAttribute("data-panning", "true");
    expectUnsavedNudge(fetchSpy);

    fireEvent.pointerMove(overlay, {
      button: 1,
      clientX: 520,
      clientY: 300,
      pointerId: 7,
    });
    fireEvent.pointerUp(overlay, {
      button: 1,
      clientX: 520,
      clientY: 300,
      pointerId: 7,
    });

    expect(viewport).not.toHaveAttribute("data-panning");
    expectUnsavedNudge(fetchSpy);
  });

  it("uses Space plus left button for pan when the selected class chip owns focus", async () => {
    const user = userEvent.setup();
    const fetchSpy = reviewApi();
    renderApp(["/annotations/run-1"]);

    await screen.findByRole("listbox", { name: "Bbox anotacji na klatce" });
    await selectAndNudge(user, 2);
    const classButton = screen.getByRole("button", { name: "Klasa 7, 1 anotacji" });
    expect(classButton).toHaveFocus();
    const overlay = overlaySurface();
    const viewport = layOutOverlayViewport(overlay);
    fireEvent.wheel(overlay, {
      clientX: 480,
      clientY: 270,
      ctrlKey: true,
      deltaY: -100,
    });
    fireEvent.pointerEnter(overlay, { clientX: 480, clientY: 270, pointerId: 8 });
    fireEvent.keyDown(classButton, { code: "Space", key: " " });

    fireEvent.pointerDown(overlay, {
      button: 0,
      clientX: 480,
      clientY: 270,
      pointerId: 8,
    });
    expect(viewport).toHaveAttribute("data-panning", "true");
    expectUnsavedNudge(fetchSpy);

    fireEvent.pointerMove(overlay, {
      button: 0,
      clientX: 520,
      clientY: 300,
      pointerId: 8,
    });
    fireEvent.pointerUp(overlay, {
      button: 0,
      clientX: 520,
      clientY: 300,
      pointerId: 8,
    });
    fireEvent.keyUp(classButton, { code: "Space", key: " " });

    expect(viewport).not.toHaveAttribute("data-panning");
    expectUnsavedNudge(fetchSpy);
  });
});

describe("FE-011-FIX1 — pan state ends with its selection and view context", () => {
  const secondAnnotation = annotationFixture({
    category_id: "category-2",
    id: "ann-2",
    x: 400,
  });

  it("returns LMB to the keyboard-selected annotation context without a mutation", async () => {
    const user = userEvent.setup();
    const fetchSpy = reviewApi({
      frame: frameDetailFixture({ annotations: [annotationFixture(), secondAnnotation] }),
    });
    renderApp(["/annotations/run-1"]);

    await screen.findByRole("listbox", { name: "Bbox anotacji na klatce" });
    await selectAndNudge(user, 1);
    const overlay = overlaySurface();
    const viewport = layOutOverlayViewport(overlay);
    for (let step = 0; step < 2; step += 1) {
      fireEvent.wheel(overlay, {
        clientX: 960,
        clientY: 540,
        ctrlKey: true,
        deltaY: -100,
      });
    }
    await user.click(screen.getByRole("button", { name: "Przesuwaj kadr" }));
    expect(screen.getByText("Niezapisane")).toBeVisible();

    const second = overlayShapeNamed(/^health, źródło OCR:/);
    second.focus();
    fireEvent.keyDown(second, { key: "Enter" });
    expect(second).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "Przesuwaj kadr" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    const stage = viewport.querySelector("[data-overlay-zoom-stage]");
    const transform = stage?.getAttribute("style");

    fireEvent.pointerDown(overlay, {
      button: 0,
      clientX: 900,
      clientY: 500,
      pointerId: 41,
    });
    fireEvent.pointerMove(overlay, {
      button: 0,
      clientX: 940,
      clientY: 540,
      pointerId: 41,
    });
    expect(stage?.getAttribute("style")).toBe(transform);
    expect(second).toHaveAttribute("aria-selected", "true");
    expect(mutations(fetchSpy)).toHaveLength(0);
    fireEvent.pointerCancel(overlay, { button: 0, pointerId: 41 });
  });

  it("preserves an unsaved nudge while reset invalidates a held hand pan", async () => {
    const user = userEvent.setup();
    const fetchSpy = reviewApi();
    renderApp(["/annotations/run-1"]);

    await screen.findByRole("listbox", { name: "Bbox anotacji na klatce" });
    await selectAndNudge(user, 1);
    const overlay = overlaySurface();
    const viewport = layOutOverlayViewport(overlay);
    for (let step = 0; step < 2; step += 1) {
      fireEvent.wheel(overlay, {
        clientX: 960,
        clientY: 540,
        ctrlKey: true,
        deltaY: -100,
      });
    }
    await user.click(screen.getByRole("button", { name: "Przesuwaj kadr" }));
    fireEvent.pointerDown(overlay, {
      button: 0,
      clientX: 960,
      clientY: 540,
      pointerId: 42,
    });
    expect(viewport).toHaveAttribute("data-panning", "true");

    fireEvent.click(screen.getByRole("button", { name: "Dopasuj kanwę do widoku" }));
    fireEvent.pointerMove(overlay, {
      button: 0,
      clientX: 1040,
      clientY: 600,
      pointerId: 42,
    });
    fireEvent.pointerUp(overlay, { button: 0, pointerId: 42 });

    expect(screen.getByLabelText("Powiększenie kanwy")).toHaveTextContent("100%");
    expect(viewport).not.toHaveAttribute("data-panning");
    expect(overlayShape()).toHaveAttribute("aria-label", expect.stringContaining("x 101, y 120"));
    expect(screen.getByRole("dialog", { name: "Edytuj anotację 7" })).toBeVisible();
    expect(screen.getByText("Niezapisane")).toBeVisible();
    expect(screen.getByRole("status", { name: "Niezapisane przesunięcie bboxa" })).toBeVisible();
    expect(mutations(fetchSpy)).toHaveLength(0);
  });
});

describe("FE-010-FIX2 — Space-pan cannot activate the focused panel button", () => {
  it("keeps Usuń inert after Space begins outside the canvas and is then used to pan", async () => {
    const user = userEvent.setup();
    const fetchSpy = reviewApi();
    renderApp(["/annotations/run-1"]);

    await screen.findByRole("listbox", { name: "Bbox anotacji na klatce" });
    await user.click(screen.getByRole("button", { name: "Klasa 7, 1 anotacji" }));
    const dialog = screen.getByRole("dialog", { name: "Edytuj anotację 7" });
    const deleteButton = within(dialog).getByRole("button", { name: "Usuń" });
    deleteButton.focus();
    expect(deleteButton).toHaveFocus();

    const overlay = overlaySurface();
    const viewport = layOutOverlayViewport(overlay);
    fireEvent.wheel(overlay, {
      clientX: 480,
      clientY: 270,
      ctrlKey: true,
      deltaY: -100,
    });

    await user.keyboard("[Space>]");
    fireEvent.pointerEnter(overlay, { clientX: 480, clientY: 270, pointerId: 12 });
    fireEvent.pointerDown(overlay, {
      button: 0,
      clientX: 480,
      clientY: 270,
      pointerId: 12,
    });
    fireEvent.pointerMove(overlay, {
      button: 0,
      clientX: 520,
      clientY: 300,
      pointerId: 12,
    });
    fireEvent.pointerUp(overlay, {
      button: 0,
      clientX: 520,
      clientY: 300,
      pointerId: 12,
    });
    await user.keyboard("[/Space]");

    expect(viewport).not.toHaveAttribute("data-panning");
    expect(dialog).toBeVisible();
    expect(overlayShape()).toBeVisible();
    expect(mutations(fetchSpy).filter((request) => request.method === "DELETE")).toHaveLength(0);
  });
});

describe("FE-009-FIX1 — one geometry in the panel and in the request", () => {
  it("saves the nudged value the fields display, not the stale annotation", async () => {
    const user = userEvent.setup();
    const fetchSpy = reviewApi();
    renderApp(["/annotations/run-1"]);

    await screen.findByRole("listbox", { name: "Bbox anotacji na klatce" });
    await selectAndNudge(user);

    const dialog = screen.getByRole("dialog", { name: "Edytuj anotację 7" });
    await user.click(within(dialog).getByText(/^x 103 · y 120/));
    expect(within(dialog).getByLabelText("x")).toHaveValue(103);

    await user.click(within(dialog).getByRole("button", { name: "Zapisz geometrię" }));

    await waitFor(() => {
      expect(geometryPatches(fetchSpy)).toHaveLength(1);
    });
    expect(geometryPatches(fetchSpy)[0]?.body).toEqual({
      bbox: { x: 103, y: 120, width: 40, height: 32 },
      expected_version: 3,
    });
  });

  it("sends the number typed after a nudge, never that number appended to it", async () => {
    const user = userEvent.setup();
    const fetchSpy = reviewApi();
    renderApp(["/annotations/run-1"]);

    await screen.findByRole("listbox", { name: "Bbox anotacji na klatce" });
    await selectAndNudge(user);

    const dialog = screen.getByRole("dialog", { name: "Edytuj anotację 7" });
    await user.click(within(dialog).getByText(/^x 103 · y 120/));
    const xField = within(dialog).getByLabelText("x");
    await user.clear(xField);
    await user.type(xField, "555");

    expect(xField).toHaveValue(555);
    expect(within(dialog).getByText(/^x 555 · y 120/)).toBeVisible();

    await user.click(within(dialog).getByRole("button", { name: "Zapisz geometrię" }));

    await waitFor(() => {
      expect(geometryPatches(fetchSpy)).toHaveLength(1);
    });
    expect(geometryPatches(fetchSpy)[0]?.body).toEqual({
      bbox: { x: 555, y: 120, width: 40, height: 32 },
      expected_version: 3,
    });
    // 1035 — the preview and the typing concatenated — was the number that
    // reached the backend while the field still displayed 103.
    expect(JSON.stringify(mutations(fetchSpy))).not.toContain("1035");
  });

  it("keeps a hand-edited field through a further nudge and sends both values", async () => {
    const user = userEvent.setup();
    const fetchSpy = reviewApi();
    renderApp(["/annotations/run-1"]);

    await screen.findByRole("listbox", { name: "Bbox anotacji na klatce" });
    await selectAndNudge(user);

    const dialog = screen.getByRole("dialog", { name: "Edytuj anotację 7" });
    await user.click(within(dialog).getByText(/^x 103 · y 120/));
    const heightField = within(dialog).getByLabelText("height");
    await user.clear(heightField);
    await user.type(heightField, "50");

    const classButton = screen.getByRole("button", { name: "Klasa 7, 1 anotacji" });
    classButton.focus();
    await user.keyboard("{ArrowRight}");

    expect(within(dialog).getByLabelText("x")).toHaveValue(104);
    expect(heightField).toHaveValue(50);

    await user.click(within(dialog).getByRole("button", { name: "Zapisz geometrię" }));

    await waitFor(() => {
      expect(geometryPatches(fetchSpy)).toHaveLength(1);
    });
    expect(geometryPatches(fetchSpy)[0]?.body).toEqual({
      bbox: { x: 104, y: 120, width: 40, height: 50 },
      expected_version: 3,
    });
  });
});

describe("FE-009-FIX1 — Enter belongs to the focused control inside the panel", () => {
  it("deletes the annotation when Enter is pressed on Usuń", async () => {
    const user = userEvent.setup();
    const fetchSpy = reviewApi();
    renderApp(["/annotations/run-1"]);

    await screen.findByRole("listbox", { name: "Bbox anotacji na klatce" });
    await selectAndNudge(user, 1);

    screen.getByRole("button", { name: "Usuń" }).focus();
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(mutations(fetchSpy).filter((request) => request.method === "DELETE")).toHaveLength(1);
    });
    expect(geometryPatches(fetchSpy)).toHaveLength(0);
  });

  it("saves the class when Enter is pressed on Zapisz klasę", async () => {
    const user = userEvent.setup();
    const fetchSpy = reviewApi();
    renderApp(["/annotations/run-1"]);

    await screen.findByRole("listbox", { name: "Bbox anotacji na klatce" });
    await selectAndNudge(user, 1);

    const dialog = screen.getByRole("dialog", { name: "Edytuj anotację 7" });
    await user.click(within(dialog).getByRole("option", { name: "health" }));
    within(dialog).getByRole("button", { name: "Zapisz klasę" }).focus();
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(mutations(fetchSpy).filter((request) => "category_id" in request.body)).toHaveLength(1);
    });
    expect(geometryPatches(fetchSpy)).toHaveLength(0);
  });

  it("arms the redraw when Enter is pressed on Przerysuj bbox", async () => {
    const user = userEvent.setup();
    const fetchSpy = reviewApi();
    renderApp(["/annotations/run-1"]);

    await screen.findByRole("listbox", { name: "Bbox anotacji na klatce" });
    await selectAndNudge(user, 1);

    const dialog = screen.getByRole("dialog", { name: "Edytuj anotację 7" });
    await user.click(within(dialog).getByText(/^x 101 · y 120/));
    within(dialog).getByRole("button", { name: "Przerysuj bbox" }).focus();
    await user.keyboard("{Enter}");

    expect(within(dialog).getByRole("button", { name: "Anuluj przerysowanie" })).toBeVisible();
    expect(geometryPatches(fetchSpy)).toHaveLength(0);
  });

  it("still commits the preview on Enter from outside the panel", async () => {
    const user = userEvent.setup();
    const fetchSpy = reviewApi();
    renderApp(["/annotations/run-1"]);

    await screen.findByRole("listbox", { name: "Bbox anotacji na klatce" });
    await selectAndNudge(user);
    expect(geometryPatches(fetchSpy)).toHaveLength(0);

    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(geometryPatches(fetchSpy)).toHaveLength(1);
    });
    expect(geometryPatches(fetchSpy)[0]?.body).toEqual({
      bbox: { x: 103, y: 120, width: 40, height: 32 },
      expected_version: 3,
    });
  });
});

describe("FE-009-FIX1 — an unsaved nudge is visible and blocks acceptance", () => {
  it("survives reselecting its class chip without sending a request", async () => {
    const user = userEvent.setup();
    const fetchSpy = reviewApi();
    renderApp(["/annotations/run-1"]);

    await screen.findByRole("listbox", { name: "Bbox anotacji na klatce" });
    await selectAndNudge(user);

    await user.click(screen.getByRole("button", { name: "Klasa 7, 1 anotacji" }));

    expect(overlayShape()).toHaveAttribute(
      "aria-label",
      expect.stringContaining("x 103, y 120"),
    );
    const dialog = screen.getByRole("dialog", { name: "Edytuj anotację 7" });
    expect(
      within(dialog).getByText(/Przesunięcie bboxa nie jest jeszcze zapisane/),
    ).toBeVisible();
    expect(mutations(fetchSpy)).toHaveLength(0);
  });

  it("survives a successful class save and keeps the panel marker visible", async () => {
    const user = userEvent.setup();
    const fetchSpy = reviewApi();
    renderApp(["/annotations/run-1"]);

    await screen.findByRole("listbox", { name: "Bbox anotacji na klatce" });
    await selectAndNudge(user);

    const dialog = screen.getByRole("dialog", { name: "Edytuj anotację 7" });
    await user.click(within(dialog).getByRole("option", { name: "health" }));
    await user.click(within(dialog).getByRole("button", { name: "Zapisz klasę" }));

    await waitFor(() => {
      expect(mutations(fetchSpy).filter((request) => "category_id" in request.body)).toHaveLength(1);
    });
    expect(geometryPatches(fetchSpy)).toHaveLength(0);
    expect(overlayShape()).toHaveAttribute(
      "aria-label",
      expect.stringContaining("x 103, y 120"),
    );
    expect(
      within(screen.getByRole("dialog", { name: "Edytuj anotację 7" })).getByText(
        /Przesunięcie bboxa nie jest jeszcze zapisane/,
      ),
    ).toBeVisible();
  });

  it("survives a failed geometry PATCH instead of rolling the overlay back", async () => {
    const user = userEvent.setup();
    const fetchSpy = reviewApi({
      mutation: () => ({ status: 500, body: errorEnvelope("internal_error") }),
    });
    renderApp(["/annotations/run-1"]);

    await screen.findByRole("listbox", { name: "Bbox anotacji na klatce" });
    await selectAndNudge(user);

    const dialog = screen.getByRole("dialog", { name: "Edytuj anotację 7" });
    await user.click(within(dialog).getByText(/^x 103 · y 120/));
    await user.click(within(dialog).getByRole("button", { name: "Zapisz geometrię" }));

    expect(await screen.findByText(/Kod: internal_error/)).toBeVisible();
    expect(geometryPatches(fetchSpy)).toHaveLength(1);
    expect(overlayShape()).toHaveAttribute(
      "aria-label",
      expect.stringContaining("x 103, y 120"),
    );
    expect(
      within(dialog).getByText(/Przesunięcie bboxa nie jest jeszcze zapisane/),
    ).toBeVisible();
  });

  it("survives a refetch of the same annotation and sends no mutation", async () => {
    const user = userEvent.setup();
    const fetchSpy = reviewApi();
    const { queryClient } = renderApp(["/annotations/run-1"]);

    await screen.findByRole("listbox", { name: "Bbox anotacji na klatce" });
    await selectAndNudge(user);
    const frameReadsBefore = fetchSpy.mock.calls.filter(
      ([url, init]) => url === "/api/v1/frames/frame-1" && (init?.method ?? "GET") === "GET",
    ).length;

    await act(async () => {
      await queryClient.refetchQueries({ exact: true, queryKey: queryKeys.frame("frame-1") });
    });

    expect(
      fetchSpy.mock.calls.filter(
        ([url, init]) => url === "/api/v1/frames/frame-1" && (init?.method ?? "GET") === "GET",
      ),
    ).toHaveLength(frameReadsBefore + 1);
    expect(mutations(fetchSpy)).toHaveLength(0);
    expect(overlayShape()).toHaveAttribute(
      "aria-label",
      expect.stringContaining("x 103, y 120"),
    );
    expect(
      screen.getByText(/Przesunięcie bboxa nie jest jeszcze zapisane/),
    ).toBeVisible();
  });

  it("refuses to accept the frame from the shortcut or the button", async () => {
    const user = userEvent.setup();
    const fetchSpy = reviewApi();
    renderApp(["/annotations/run-1"]);

    await screen.findByRole("listbox", { name: "Bbox anotacji na klatce" });
    await selectAndNudge(user);

    await user.keyboard("a");

    const acceptButton = screen.getByRole("button", { name: "Zaakceptuj klatkę" });
    expect(acceptButton).toBeDisabled();
    await user.click(acceptButton);
    expect(screen.getByRole("status", { name: "Niezapisane przesunięcie bboxa" })).toBeVisible();
    expect(
      mutations(fetchSpy).filter((request) => request.url.endsWith("/review")),
    ).toHaveLength(0);

    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(geometryPatches(fetchSpy)).toHaveLength(1);
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Zaakceptuj klatkę" })).toBeEnabled();
    });
  });
});

describe("FE-009-FIX2 — cancelling a pointer gesture restores its baseline", () => {
  function expectNudgeStillVisible(fetchSpy: FetchSpy): void {
    expect(overlayShape()).toHaveAttribute(
      "aria-label",
      expect.stringContaining("x 103, y 120"),
    );
    expect(screen.getByText("Niezapisane")).toBeVisible();
    expect(screen.getByRole("status", { name: "Niezapisane przesunięcie bboxa" })).toBeVisible();
    expect(mutations(fetchSpy)).toHaveLength(0);
  }

  it("keeps a nudge after a complete pointerdown and pointerup with no movement", async () => {
    const user = userEvent.setup();
    const fetchSpy = reviewApi();
    renderApp(["/annotations/run-1"]);

    await screen.findByRole("listbox", { name: "Bbox anotacji na klatce" });
    await selectAndNudge(user);
    const overlay = overlaySurface();

    fireEvent.pointerDown(ownShapeFill(), { clientX: 110, clientY: 130, pointerId: 1 });
    fireEvent.pointerUp(overlay, { clientX: 110, clientY: 130, pointerId: 1 });

    expectNudgeStillVisible(fetchSpy);
    expect(screen.getByRole("dialog", { name: "Edytuj anotację 7" })).toBeVisible();
  });

  it("keeps a nudge after pointercancel without movement", async () => {
    const user = userEvent.setup();
    const fetchSpy = reviewApi();
    renderApp(["/annotations/run-1"]);

    await screen.findByRole("listbox", { name: "Bbox anotacji na klatce" });
    await selectAndNudge(user);
    const overlay = overlaySurface();

    fireEvent.pointerDown(ownShapeFill(), { clientX: 110, clientY: 130, pointerId: 1 });
    fireEvent.pointerCancel(overlay, { clientX: 110, clientY: 130, pointerId: 1 });

    expectNudgeStillVisible(fetchSpy);
  });

  it("rolls a cancelled real move back to the nudge, not the stored bbox", async () => {
    const user = userEvent.setup();
    const fetchSpy = reviewApi();
    renderApp(["/annotations/run-1"]);

    await screen.findByRole("listbox", { name: "Bbox anotacji na klatce" });
    await selectAndNudge(user);
    const overlay = overlaySurface();

    fireEvent.pointerDown(ownShapeFill(), { clientX: 110, clientY: 130, pointerId: 1 });
    fireEvent.pointerMove(overlay, { clientX: 120, clientY: 130, pointerId: 1 });
    expect(overlayShape()).toHaveAttribute(
      "aria-label",
      expect.stringContaining("x 113, y 120"),
    );
    fireEvent.pointerCancel(overlay, { clientX: 120, clientY: 130, pointerId: 1 });

    expectNudgeStillVisible(fetchSpy);
  });

  it("keeps the pre-gesture nudge through a refetch and cancel", async () => {
    const user = userEvent.setup();
    const fetchSpy = reviewApi();
    const { queryClient } = renderApp(["/annotations/run-1"]);

    await screen.findByRole("listbox", { name: "Bbox anotacji na klatce" });
    await selectAndNudge(user);
    const overlay = overlaySurface();
    const frameReadsBefore = fetchSpy.mock.calls.filter(
      ([url, init]) => url === "/api/v1/frames/frame-1" && (init?.method ?? "GET") === "GET",
    ).length;

    fireEvent.pointerDown(ownShapeFill(), { clientX: 110, clientY: 130, pointerId: 1 });
    fireEvent.pointerMove(overlay, { clientX: 120, clientY: 130, pointerId: 1 });
    await act(async () => {
      await queryClient.refetchQueries({ exact: true, queryKey: queryKeys.frame("frame-1") });
    });
    fireEvent.pointerCancel(overlay, { clientX: 120, clientY: 130, pointerId: 1 });

    expect(
      fetchSpy.mock.calls.filter(
        ([url, init]) => url === "/api/v1/frames/frame-1" && (init?.method ?? "GET") === "GET",
      ),
    ).toHaveLength(frameReadsBefore + 1);
    expectNudgeStillVisible(fetchSpy);
  });

  it("does not restore the old baseline after a failed committed gesture", async () => {
    const user = userEvent.setup();
    const fetchSpy = reviewApi({
      mutation: () => ({ status: 500, body: errorEnvelope("internal_error") }),
    });
    renderApp(["/annotations/run-1"]);

    await screen.findByRole("listbox", { name: "Bbox anotacji na klatce" });
    await selectAndNudge(user);
    const overlay = overlaySurface();

    fireEvent.pointerDown(ownShapeFill(), { clientX: 110, clientY: 130, pointerId: 1 });
    fireEvent.pointerMove(overlay, { clientX: 120, clientY: 130, pointerId: 1 });
    fireEvent.pointerUp(overlay, { clientX: 120, clientY: 130, pointerId: 1 });

    expect(await screen.findByText(/Kod: internal_error/)).toBeVisible();
    expect(geometryPatches(fetchSpy)).toHaveLength(1);
    expect(overlayShape()).toHaveAttribute(
      "aria-label",
      expect.stringContaining("x 113, y 120"),
    );

    fireEvent.pointerCancel(overlay, { clientX: 120, clientY: 130, pointerId: 1 });

    expect(overlayShape()).toHaveAttribute(
      "aria-label",
      expect.stringContaining("x 113, y 120"),
    );
    expect(screen.getByText("Niezapisane")).toBeVisible();
    expect(geometryPatches(fetchSpy)).toHaveLength(1);
  });
});

describe("FE-009-FIX3 — a gesture baseline belongs to one selection context", () => {
  const secondAnnotation = annotationFixture({
    category_id: "category-2",
    id: "ann-2",
    x: 400,
  });

  function expectNoUnsavedGeometry(fetchSpy: FetchSpy): void {
    expect(screen.queryByText("Niezapisane")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("status", { name: "Niezapisane przesunięcie bboxa" }),
    ).not.toBeInTheDocument();
    expect(mutations(fetchSpy)).toHaveLength(0);
  }

  it("cannot resurrect A after selecting B and cannot leak A into B's next cancel", async () => {
    const user = userEvent.setup();
    const fetchSpy = reviewApi({
      frame: frameDetailFixture({ annotations: [annotationFixture(), secondAnnotation] }),
    });
    renderApp(["/annotations/run-1"]);

    await screen.findByRole("listbox", { name: "Bbox anotacji na klatce" });
    await selectAndNudge(user);
    const overlay = overlaySurface();

    expect(overlayShapeNamed(/^7, źródło OCR:/)).toHaveAttribute("aria-selected", "true");
    expect(overlayShapeNamed(/^7, źródło OCR:/)).toHaveAttribute(
      "aria-label",
      expect.stringContaining("x 103, y 120"),
    );
    expect(screen.getByText("Niezapisane")).toBeVisible();
    expect(mutations(fetchSpy)).toHaveLength(0);

    fireEvent.pointerDown(ownShapeFill(overlayShapeNamed(/^7, źródło OCR:/)), {
      clientX: 110,
      clientY: 130,
      pointerId: 1,
    });
    fireEvent.pointerMove(overlay, { clientX: 120, clientY: 130, pointerId: 1 });
    expect(overlayShapeNamed(/^7, źródło OCR:/)).toHaveAttribute(
      "aria-label",
      expect.stringContaining("x 113, y 120"),
    );
    expect(mutations(fetchSpy)).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Klasa health, 1 anotacji" }));
    expect(overlayShapeNamed(/^health, źródło OCR:/)).toHaveAttribute("aria-selected", "true");
    // RegionOverlay still paints its in-flight local manipulation until the
    // old pointer is cancelled; FrameEditor has already discarded A's preview.
    expect(overlayShapeNamed(/^7, źródło OCR:/)).toHaveAttribute(
      "aria-label",
      expect.stringContaining("x 113, y 120"),
    );
    expectNoUnsavedGeometry(fetchSpy);

    fireEvent.pointerCancel(overlay, { clientX: 120, clientY: 130, pointerId: 1 });
    expect(overlayShapeNamed(/^health, źródło OCR:/)).toHaveAttribute("aria-selected", "true");
    expect(overlayShapeNamed(/^7, źródło OCR:/)).toHaveAttribute(
      "aria-label",
      expect.stringContaining("x 100, y 120"),
    );
    expectNoUnsavedGeometry(fetchSpy);

    fireEvent.pointerDown(ownShapeFill(overlayShapeNamed(/^health, źródło OCR:/)), {
      clientX: 410,
      clientY: 130,
      pointerId: 2,
    });
    fireEvent.pointerMove(overlay, { clientX: 420, clientY: 130, pointerId: 2 });
    expect(overlayShapeNamed(/^health, źródło OCR:/)).toHaveAttribute(
      "aria-label",
      expect.stringContaining("x 410, y 120"),
    );
    expect(screen.getByText("Niezapisane")).toBeVisible();
    expect(mutations(fetchSpy)).toHaveLength(0);

    fireEvent.pointerCancel(overlay, { clientX: 420, clientY: 130, pointerId: 2 });
    expect(overlayShapeNamed(/^health, źródło OCR:/)).toHaveAttribute(
      "aria-label",
      expect.stringContaining("x 400, y 120"),
    );
    expectNoUnsavedGeometry(fetchSpy);
  });

  it("does not restore a baseline after closing and reselecting the same annotation", async () => {
    const user = userEvent.setup();
    const fetchSpy = reviewApi();
    renderApp(["/annotations/run-1"]);

    await screen.findByRole("listbox", { name: "Bbox anotacji na klatce" });
    await selectAndNudge(user);
    const overlay = overlaySurface();
    fireEvent.pointerDown(ownShapeFill(), { clientX: 110, clientY: 130, pointerId: 1 });
    fireEvent.pointerMove(overlay, { clientX: 120, clientY: 130, pointerId: 1 });

    fireEvent.pointerDown(screen.getByRole("heading", { name: "Anotacje" }));
    expect(screen.queryByRole("dialog", { name: "Edytuj anotację 7" })).not.toBeInTheDocument();
    expectNoUnsavedGeometry(fetchSpy);

    fireEvent.pointerCancel(overlay, { clientX: 120, clientY: 130, pointerId: 1 });
    await user.click(screen.getByRole("button", { name: "Klasa 7, 1 anotacji" }));

    expect(overlayShape()).toHaveAttribute(
      "aria-label",
      expect.stringContaining("x 100, y 120"),
    );
    expect(screen.getByRole("dialog", { name: "Edytuj anotację 7" })).toBeVisible();
    expectNoUnsavedGeometry(fetchSpy);
  });
});

describe("FE-009-FIX1 — a box outside the frame moves by one pixel", () => {
  const outside = annotationFixture({ x: 1900, width: 40 });

  it("steps by one and keeps the move when Enter cannot save it yet", async () => {
    const user = userEvent.setup();
    const fetchSpy = reviewApi({ frame: frameDetailFixture({ annotations: [outside] }) });
    renderApp(["/annotations/run-1"]);

    await screen.findByRole("listbox", { name: "Bbox anotacji na klatce" });
    const classButton = screen.getByRole("button", { name: "Klasa 7, 1 anotacji" });
    await user.click(classButton);
    classButton.focus();
    await user.keyboard("{ArrowLeft}");

    expect(overlayShape()).toHaveAttribute(
      "aria-label",
      expect.stringContaining("x 1899, y 120"),
    );

    await user.keyboard("{Enter}");

    expect(await screen.findByText(/Kod: bbox_invalid/)).toBeVisible();
    expect(mutations(fetchSpy)).toHaveLength(0);
    // The rejected commit must not roll the walk back to where it started.
    expect(overlayShape()).toHaveAttribute(
      "aria-label",
      expect.stringContaining("x 1899, y 120"),
    );
  });
});
