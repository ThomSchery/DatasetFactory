import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { FrameDetail, Page, FrameSummary } from "../../api";
import {
  annotationFixture,
  dashboardFixture,
  errorEnvelope,
  frameDetailFixture,
  framePageFixture,
  frameSummaryFixture,
  profileFixture,
  runFixture,
} from "../../test/fixtures";
import { renderApp, stubFetch, type StubbedResponse } from "../../test/harness";

const PROFILE = profileFixture({
  categories: [
    { id: "category-1", name: "7", kind: "character" },
    { id: "category-2", name: "health", kind: "game" },
  ],
});

/** A profile with several classes per level, so a subset is a real subset. */
const RICH_PROFILE = profileFixture({
  categories: [
    { id: "score", name: "Score", kind: "game" },
    { id: "timer", name: "Timer", kind: "game" },
    { id: "category-1", name: "7", kind: "character" },
    { id: "category-2", name: "health", kind: "game" },
    { id: "digit-1", name: "1", kind: "character" },
  ],
});

interface ReviewApiOptions {
  frame?: FrameDetail;
  frames?: Page<FrameSummary>;
  mutation?: (url: string, init: RequestInit | undefined) => StubbedResponse;
  profile?: typeof PROFILE;
}

function reviewApi(options: ReviewApiOptions = {}) {
  const frame = options.frame ?? frameDetailFixture();
  const frames = options.frames ?? framePageFixture();
  const profile = options.profile ?? PROFILE;
  return stubFetch((url, init) => {
    if (init?.method !== undefined && init.method !== "GET") {
      return options.mutation?.(url, init) ?? { status: 200, body: frame };
    }
    if (url === "/api/v1/runs/run-1") {
      return { status: 200, body: runFixture({ id: "run-1", profile_id: profile.id }) };
    }
    if (url === `/api/v1/profiles/${profile.id}`) {
      return { status: 200, body: profile };
    }
    if (url.startsWith("/api/v1/runs/run-1/frames?")) {
      return { status: 200, body: frames };
    }
    if (url === `/api/v1/frames/${frame.id}`) {
      return { status: 200, body: frame };
    }
    if (url === "/api/v1/dashboard") {
      return { status: 200, body: dashboardFixture({ profile }) };
    }
    throw new Error(`Nieobsłużone żądanie testowe: ${url}`);
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("annotation review query states", () => {
  it("renders loading while the run query is pending", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    renderApp(["/annotations/run-1"]);
    expect(screen.getByRole("status")).toHaveTextContent("Ładowanie runu i profilu anotacji");
  });

  it("renders the explicit empty state without hiding the rejected filter", async () => {
    reviewApi({ frames: framePageFixture({ items: [], total: 0 }) });
    renderApp(["/annotations/run-1"]);

    expect(await screen.findByText("Brak klatek dla wybranego filtra")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Odrzucone/ })).toBeInTheDocument();
  });

  it("renders a central Polish error with its code", async () => {
    stubFetch((url) => {
      if (url === "/api/v1/runs/run-1") {
        return { status: 200, body: runFixture({ profile_id: PROFILE.id }) };
      }
      if (url === `/api/v1/profiles/${PROFILE.id}`) {
        return { status: 200, body: PROFILE };
      }
      return { status: 404, body: errorEnvelope("run_not_found") };
    });
    renderApp(["/annotations/run-1"]);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Nie znaleziono runu");
    expect(alert).toHaveTextContent("Kod: run_not_found");
  });

  it("renders one opaque image, natural viewBox and the unified OCR/manual collection", async () => {
    const manual = annotationFixture({
      id: "ann-2",
      category_id: "category-2",
      confidence: null,
      observation_id: null,
      source: "manual",
    });
    reviewApi({ frame: frameDetailFixture({ annotations: [annotationFixture(), manual] }) });
    renderApp(["/annotations/run-1"]);

    const overlay = await screen.findByRole("listbox", { name: "Bbox anotacji na klatce" });
    expect(overlay).toHaveAttribute("viewBox", "0 0 1920 1080");
    expect(screen.getByRole("img", { name: /Klatka 17 runu run-1/ })).toHaveAttribute(
      "src",
      "/api/v1/frames/frame-1/image",
    );
    expect(within(overlay).getAllByRole("option")).toHaveLength(2);
    expect(screen.getByText("Ręczna")).toBeInTheDocument();
    expect(screen.getByText("7 · 91%")).toBeInTheDocument();
  });

  it("keeps image and inspector selection synchronized through one selectedId", async () => {
    const user = userEvent.setup();
    const second = annotationFixture({ id: "ann-2", category_id: "category-2", x: 400 });
    reviewApi({ frame: frameDetailFixture({ annotations: [annotationFixture(), second] }) });
    renderApp(["/annotations/run-1"]);

    const overlay = await screen.findByRole("listbox", { name: "Bbox anotacji na klatce" });
    const options = within(overlay).getAllByRole("option");
    const classSeven = screen.getByRole("button", { name: "Klasa 7, 1 anotacji" });
    const classHealth = screen.getByRole("button", { name: "Klasa health, 1 anotacji" });
    const firstFill = options[0]?.querySelector(".df-region-overlay__shape-fill");
    expect(firstFill).not.toBeNull();

    fireEvent.click(firstFill as Element);
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(classSeven).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("dialog", { name: "Edytuj anotację 7" })).toBeVisible();

    await user.click(classHealth);
    expect(options[0]).toHaveAttribute("aria-selected", "false");
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    expect(classSeven).toHaveAttribute("aria-pressed", "false");
    expect(classHealth).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps a drawn bbox as a client draft and Escape discards it without POST", async () => {
    const user = userEvent.setup();
    const fetchSpy = reviewApi();
    renderApp(["/annotations/run-1"]);

    const overlay = await screen.findByRole("listbox", { name: "Bbox anotacji na klatce" });
    vi.spyOn(overlay, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 960,
      height: 540,
      right: 960,
      bottom: 540,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    const inspector = screen.getByRole("heading", { name: "Anotacje na klatce" }).closest("section");
    expect(inspector).not.toBeNull();
    expect(within(inspector as HTMLElement).getByText("1", { selector: ".df-status-badge" })).toBeVisible();

    fireEvent.pointerDown(overlay, { clientX: 300, clientY: 250, pointerId: 1 });
    fireEvent.pointerMove(overlay, { clientX: 400, clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(overlay, { clientX: 400, clientY: 300, pointerId: 1 });

    expect(screen.getByRole("dialog", { name: "Wybierz klasę dla nowego bbox" })).toBeVisible();
    expect(within(overlay).getAllByRole("option")).toHaveLength(2);
    expect(within(overlay).getByRole("option", { name: /^Szkic — wybierz klasę:/ })).toHaveClass(
      "df-region-overlay__shape--draft",
    );

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: "Wybierz klasę dla nowego bbox" })).not.toBeInTheDocument();
    expect(within(overlay).getAllByRole("option")).toHaveLength(1);
    expect(within(inspector as HTMLElement).getByText("1", { selector: ".df-status-badge" })).toBeVisible();
    expect(
      fetchSpy.mock.calls.some(
        ([url, init]) =>
          url === "/api/v1/frames/frame-1/annotations" && init?.method === "POST",
      ),
    ).toBe(false);
  });

  it("keeps the draft after a failed explicit class save", async () => {
    const user = userEvent.setup();
    const fetchSpy = reviewApi({
      mutation: (url) =>
        url.endsWith("/annotations")
          ? { status: 500, body: errorEnvelope("internal_error") }
          : { status: 200, body: frameDetailFixture() },
    });
    renderApp(["/annotations/run-1"]);

    const overlay = await screen.findByRole("listbox", { name: "Bbox anotacji na klatce" });
    vi.spyOn(overlay, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 960,
      height: 540,
      right: 960,
      bottom: 540,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    fireEvent.pointerDown(overlay, { clientX: 300, clientY: 250, pointerId: 1 });
    fireEvent.pointerMove(overlay, { clientX: 400, clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(overlay, { clientX: 400, clientY: 300, pointerId: 1 });

    const field = screen.getByRole("textbox", { name: "Klasa" });
    await user.clear(field);
    await user.type(field, "health");
    await user.click(screen.getByRole("option", { name: "health" }));
    await user.click(screen.getByRole("button", { name: "Zapisz klasę" }));

    expect(await screen.findByText(/Kod: internal_error/)).toBeVisible();
    expect(screen.getByRole("dialog", { name: "Wybierz klasę dla nowego bbox" })).toBeVisible();
    expect(within(overlay).getByRole("option", { name: /^Szkic — wybierz klasę:/ })).toBeVisible();
    const post = fetchSpy.mock.calls.find(
      ([url, init]) =>
        url === "/api/v1/frames/frame-1/annotations" && init?.method === "POST",
    );
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      bbox: { x: 600, y: 500, width: 200, height: 100 },
      category_id: "category-2",
      expected_version: 7,
    });
  });

  it("discards the unsaved draft when another annotation or filter is selected", async () => {
    const user = userEvent.setup();
    const fetchSpy = reviewApi();
    renderApp(["/annotations/run-1"]);

    let overlay = await screen.findByRole("listbox", { name: "Bbox anotacji na klatce" });
    vi.spyOn(overlay, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 960,
      height: 540,
      right: 960,
      bottom: 540,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    const draw = () => {
      fireEvent.pointerDown(overlay, { clientX: 300, clientY: 250, pointerId: 1 });
      fireEvent.pointerMove(overlay, { clientX: 400, clientY: 300, pointerId: 1 });
      fireEvent.pointerUp(overlay, { clientX: 400, clientY: 300, pointerId: 1 });
    };

    draw();
    await user.click(screen.getByRole("button", { name: "Klasa 7, 1 anotacji" }));
    expect(within(overlay).getAllByRole("option")).toHaveLength(1);

    draw();
    await user.click(screen.getByRole("button", { name: /Wszystkie/ }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Wszystkie/ })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });
    overlay = await screen.findByRole("listbox", { name: "Bbox anotacji na klatce" });
    expect(within(overlay).getAllByRole("option")).toHaveLength(1);
    expect(
      fetchSpy.mock.calls.some(
        ([url, init]) =>
          url === "/api/v1/frames/frame-1/annotations" && init?.method === "POST",
      ),
    ).toBe(false);
  });

  it("updates geometry fields live and saves the dragged bbox through the existing PATCH", async () => {
    const user = userEvent.setup();
    const updated = annotationFixture({ x: 300, y: 220, width: 40, height: 32, version: 4 });
    const fetchSpy = reviewApi({
      mutation: () => ({ status: 200, body: updated }),
    });
    renderApp(["/annotations/run-1"]);

    const overlay = await screen.findByRole("listbox", { name: "Bbox anotacji na klatce" });
    vi.spyOn(overlay, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 960,
      height: 540,
      right: 960,
      bottom: 540,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    await user.click(screen.getByRole("button", { name: "Klasa 7, 1 anotacji" }));
    const dialog = screen.getByRole("dialog", { name: "Edytuj anotację 7" });
    await user.click(within(dialog).getByText(/^x 100 · y 120/));
    const fill = within(overlay)
      .getByRole("option")
      .querySelector(".df-region-overlay__shape-fill");
    expect(fill).not.toBeNull();

    // The surface is exactly half the source dimensions. A 100/50 CSS-pixel
    // move is therefore a 200/100 source-pixel move.
    fireEvent.pointerDown(fill as Element, { clientX: 55, clientY: 65, pointerId: 1 });
    fireEvent.pointerMove(overlay, { clientX: 155, clientY: 115, pointerId: 1 });

    expect(within(dialog).getByLabelText("x")).toHaveValue(300);
    expect(within(dialog).getByLabelText("y")).toHaveValue(220);
    expect(within(dialog).getByLabelText("width")).toHaveValue(40);
    expect(within(dialog).getByLabelText("height")).toHaveValue(32);

    fireEvent.pointerUp(overlay, { clientX: 155, clientY: 115, pointerId: 1 });

    await waitFor(() => {
      const patchCall = fetchSpy.mock.calls.find(
        ([url, init]) => url === "/api/v1/annotations/ann-1" && init?.method === "PATCH",
      );
      expect(JSON.parse(String(patchCall?.[1]?.body))).toEqual({
        bbox: { x: 300, y: 220, width: 40, height: 32 },
        expected_version: 3,
      });
    });
  });

  it("renders the selected-frame error state with retry", async () => {
    stubFetch((url) => {
      if (url === "/api/v1/runs/run-1") {
        return { status: 200, body: runFixture({ profile_id: PROFILE.id }) };
      }
      if (url === `/api/v1/profiles/${PROFILE.id}`) {
        return { status: 200, body: PROFILE };
      }
      if (url.startsWith("/api/v1/runs/run-1/frames?")) {
        return { status: 200, body: framePageFixture() };
      }
      return { status: 404, body: errorEnvelope("frame_not_found") };
    });
    renderApp(["/annotations/run-1"]);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Nie znaleziono klatki");
    expect(screen.getByRole("button", { name: "Spróbuj ponownie" })).toBeInTheDocument();
  });
});

describe("temporal frame navigation", () => {
  it("selects any filtered frame from the dropdown and clears the selected annotation", async () => {
    const user = userEvent.setup();
    const firstSummary = frameSummaryFixture({ frame_index: 0, id: "frame-1", timestamp_ms: 0 });
    const secondSummary = frameSummaryFixture({ frame_index: 1, id: "frame-2", timestamp_ms: 1_000 });
    const first = frameDetailFixture({ frame_index: 0, id: "frame-1", timestamp_ms: 0 });
    const second = frameDetailFixture({ frame_index: 1, id: "frame-2", timestamp_ms: 1_000 });

    stubFetch((url) => {
      if (url === "/api/v1/runs/run-1") {
        return {
          status: 200,
          body: runFixture({ id: "run-1", profile_id: PROFILE.id, total_frames: 2 }),
        };
      }
      if (url === `/api/v1/profiles/${PROFILE.id}`) {
        return { status: 200, body: PROFILE };
      }
      if (url.startsWith("/api/v1/runs/run-1/frames?")) {
        const query = new URL(url, "http://datasetfactory.test").searchParams;
        if (query.get("page_size") === "1") {
          return {
            status: 200,
            body: framePageFixture({
              items: query.get("page") === "2" ? [secondSummary] : [firstSummary],
              page: Number(query.get("page")),
              page_size: 1,
              total: 2,
            }),
          };
        }
        return {
          status: 200,
          body: framePageFixture({ items: [firstSummary, secondSummary], total: 2 }),
        };
      }
      if (url === "/api/v1/frames/frame-1") return { status: 200, body: first };
      if (url === "/api/v1/frames/frame-2") return { status: 200, body: second };
      throw new Error(`Nieobsłużone żądanie testowe: ${url}`);
    });
    renderApp(["/annotations/run-1"]);

    await screen.findByRole("img", { name: "Klatka 0 runu run-1" });
    expect(screen.getByLabelText("Pozycja 1 z 2")).toHaveTextContent("1 / 2");
    await user.click(await screen.findByRole("button", { name: "Klasa 7, 1 anotacji" }));
    expect(screen.getByRole("dialog", { name: "Edytuj anotację 7" })).toBeVisible();

    await user.selectOptions(screen.getByRole("combobox", { name: "Wybierz klatkę" }), "frame-2");

    expect(await screen.findByLabelText("Pozycja 2 z 2")).toHaveTextContent("2 / 2");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Poprzednia klatka" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Następna klatka" })).toBeDisabled();
  });

  it.each([
    ["a", "accept"],
    ["x", "reject"],
  ])("maps %s to the %s review action outside form controls", async (shortcut, decision) => {
    const user = userEvent.setup();
    const decisions: unknown[] = [];
    reviewApi({
      mutation: (url, init) => {
        if (url.endsWith("/review")) {
          decisions.push(JSON.parse(String(init?.body)));
        }
        return { status: 200, body: frameDetailFixture() };
      },
    });
    renderApp(["/annotations/run-1"]);

    await screen.findByRole("listbox", { name: "Bbox anotacji na klatce" });
    await user.keyboard(shortcut);

    await waitFor(() => {
      expect(decisions).toContainEqual({ decision, expected_version: 7 });
    });
  });

  it("does not trigger review shortcuts while the class field owns the keystroke", async () => {
    const user = userEvent.setup();
    const decisions: unknown[] = [];
    const copies: unknown[] = [];
    reviewApi({
      mutation: (url, init) => {
        if (url.endsWith("/review")) decisions.push(JSON.parse(String(init?.body)));
        if (url.endsWith("/copy-previous")) copies.push(JSON.parse(String(init?.body)));
        return { status: 200, body: frameDetailFixture() };
      },
    });
    renderApp(["/annotations/run-1"]);

    await user.click(await screen.findByRole("button", { name: "Klasa 7, 1 anotacji" }));
    const classField = screen.getByLabelText("Klasa");
    await user.clear(classField);
    await user.type(classField, "axr");

    expect(classField).toHaveValue("axr");
    expect(decisions).toHaveLength(0);
    expect(copies).toHaveLength(0);
  });

  it("does not trigger review shortcuts while the frame dropdown owns the keystroke", async () => {
    const user = userEvent.setup();
    const decisions: unknown[] = [];
    reviewApi({
      mutation: (url, init) => {
        if (url.endsWith("/review")) decisions.push(JSON.parse(String(init?.body)));
        return { status: 200, body: frameDetailFixture() };
      },
    });
    renderApp(["/annotations/run-1"]);

    await screen.findByRole("img", { name: /Klatka 17 runu run-1/ });
    const frameSelect = screen.getByRole("combobox", { name: "Wybierz klatkę" });
    frameSelect.focus();
    await user.keyboard("a");

    expect(decisions).toHaveLength(0);
  });

  function copyApi(requests: unknown[]) {
    return reviewApi({
      frame: frameDetailFixture({ frame_index: 1 }),
      mutation: (url, init) => {
        if (url.endsWith("/copy-previous")) {
          requests.push(JSON.parse(String(init?.body)));
          return { status: 200, body: { copied: 2, replaced: 1, frame_version: 8 } };
        }
        return { status: 200, body: frameDetailFixture({ frame_index: 1 }) };
      },
      profile: RICH_PROFILE,
    });
  }

  it("copies the preselected HUD level with R and reports replaced annotations", async () => {
    const user = userEvent.setup();
    const requests: unknown[] = [];
    copyApi(requests);
    renderApp(["/annotations/run-1"]);

    // The default selection is the whole HUD level, and a whole level is still
    // the scope the backend has always answered.
    expect(await screen.findByRole("checkbox", { name: "Pola HUD (gra)" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    screen.getByRole("button", { name: /Powtórz R/ }).focus();
    await user.keyboard("r");

    await waitFor(() => {
      expect(requests).toContainEqual({ scope: "game", expected_version: 7 });
    });
    expect(await screen.findByText("Skopiowano: 2. Zastąpiono: 1.")).toBeInTheDocument();
  });

  it("selects every class of a level with one click on its checkbox", async () => {
    const user = userEvent.setup();
    const requests: unknown[] = [];
    copyApi(requests);
    renderApp(["/annotations/run-1"]);

    await user.click(await screen.findByRole("checkbox", { name: "Pola HUD (gra)" }));
    for (const name of ["Score", "Timer", "health"]) {
      expect(screen.getByRole("checkbox", { name })).toHaveAttribute("aria-checked", "false");
    }

    await user.click(screen.getByRole("checkbox", { name: "Znaki" }));
    for (const name of ["7", "1"]) {
      expect(screen.getByRole("checkbox", { name })).toHaveAttribute("aria-checked", "true");
    }
    await user.click(screen.getByRole("button", { name: /Powtórz R/ }));

    await waitFor(() => {
      expect(requests).toContainEqual({ scope: "character", expected_version: 7 });
    });
  });

  it("marks a partly selected level as mixed and copies the subset in one request", async () => {
    const user = userEvent.setup();
    const requests: unknown[] = [];
    copyApi(requests);
    renderApp(["/annotations/run-1"]);

    await user.click(await screen.findByRole("checkbox", { name: "Timer" }));
    expect(screen.getByRole("checkbox", { name: "Pola HUD (gra)" })).toHaveAttribute(
      "aria-checked",
      "mixed",
    );
    await user.click(screen.getByRole("checkbox", { name: "7" }));
    await user.click(screen.getByRole("button", { name: /Powtórz R/ }));

    await waitFor(() => {
      expect(requests).toEqual([
        {
          scope: "categories",
          category_ids: ["score", "category-1", "category-2"],
          expected_version: 7,
        },
      ]);
    });
  });

  it("filters the class list by typing and keeps the level rows scrollable", async () => {
    const user = userEvent.setup();
    const requests: unknown[] = [];
    copyApi(requests);
    renderApp(["/annotations/run-1"]);

    await user.type(await screen.findByLabelText("Filtruj klasy"), "tim");

    expect(screen.getByRole("checkbox", { name: "Timer" })).toBeVisible();
    expect(screen.queryByRole("checkbox", { name: "Score" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Znaki" })).not.toBeInTheDocument();
  });

  it("refuses to copy when the selection is empty and says why", async () => {
    const user = userEvent.setup();
    const requests: unknown[] = [];
    copyApi(requests);
    renderApp(["/annotations/run-1"]);

    await user.click(await screen.findByRole("checkbox", { name: "Pola HUD (gra)" }));
    expect(screen.getByRole("button", { name: /Powtórz R/ })).toBeDisabled();
    expect(
      screen.getByText("Zaznacz co najmniej jedną klasę albo całą grupę do powtórzenia."),
    ).toBeVisible();

    screen.getByRole("button", { name: "Zaakceptuj klatkę" }).focus();
    await user.keyboard("r");
    expect(requests).toEqual([]);
  });

  it("does not trigger review shortcuts from inside the class picker", async () => {
    const user = userEvent.setup();
    const decisions: unknown[] = [];
    const requests: unknown[] = [];
    reviewApi({
      mutation: (url, init) => {
        if (url.endsWith("/review")) decisions.push(JSON.parse(String(init?.body)));
        if (url.endsWith("/copy-previous")) requests.push(JSON.parse(String(init?.body)));
        return { status: 200, body: frameDetailFixture() };
      },
      profile: RICH_PROFILE,
    });
    renderApp(["/annotations/run-1"]);

    const row = await screen.findByRole("checkbox", { name: "Timer" });
    row.focus();
    await user.keyboard("axr");

    expect(decisions).toEqual([]);
    expect(requests).toEqual([]);
  });

  it("disables copy on the first frame and explains why", async () => {
    reviewApi({ frame: frameDetailFixture({ frame_index: 0 }) });
    renderApp(["/annotations/run-1"]);

    expect(await screen.findByRole("button", { name: /Powtórz R/ })).toBeDisabled();
    expect(
      screen.getByText("To pierwsza klatka runu — brak wcześniejszej klatki do skopiowania."),
    ).toBeInTheDocument();
  });

  it("keeps the target unchanged when the previous group is empty", async () => {
    const user = userEvent.setup();
    reviewApi({
      frame: frameDetailFixture({ frame_index: 1 }),
      mutation: (url) =>
        url.endsWith("/copy-previous")
          ? { status: 200, body: { copied: 0, replaced: 0, frame_version: 7 } }
          : { status: 200, body: frameDetailFixture({ frame_index: 1 }) },
    });
    renderApp(["/annotations/run-1"]);

    await user.click(await screen.findByRole("button", { name: /Powtórz R/ }));
    expect(
      await screen.findByText("Poprzednia klatka nie ma anotacji w tej grupie. Nic nie zmieniono."),
    ).toBeInTheDocument();
  });
});

describe("review filters and mutations", () => {
  it("uses the active filter for the dropdown, arrows and position counter", async () => {
    const user = userEvent.setup();
    const pendingSummary = frameSummaryFixture({ frame_index: 0, id: "frame-1", timestamp_ms: 0 });
    const acceptedSummary = frameSummaryFixture({
      frame_index: 1,
      id: "frame-2",
      review_status: "accepted",
      timestamp_ms: 1_000,
    });
    const pendingFrame = frameDetailFixture({ frame_index: 0, id: "frame-1", timestamp_ms: 0 });
    const acceptedFrame = frameDetailFixture({
      frame_index: 1,
      id: "frame-2",
      review_status: "accepted",
      timestamp_ms: 1_000,
    });

    stubFetch((url) => {
      if (url === "/api/v1/runs/run-1") {
        return { status: 200, body: runFixture({ profile_id: PROFILE.id, total_frames: 2 }) };
      }
      if (url === `/api/v1/profiles/${PROFILE.id}`) return { status: 200, body: PROFILE };
      if (url.startsWith("/api/v1/runs/run-1/frames?")) {
        const query = new URL(url, "http://datasetfactory.test").searchParams;
        const status = query.get("review_status");
        const pageSize = query.get("page_size");
        if (pageSize === "1" && status !== null) {
          return {
            status: 200,
            body: framePageFixture({
              items: [],
              page_size: 1,
              total: status === "rejected" ? 0 : 1,
            }),
          };
        }
        if (pageSize === "1") {
          return {
            status: 200,
            body: framePageFixture({ items: [acceptedSummary], page: 2, page_size: 1, total: 2 }),
          };
        }
        const items =
          status === "accepted"
            ? [acceptedSummary]
            : status === "pending"
              ? [pendingSummary]
              : [pendingSummary, acceptedSummary];
        return { status: 200, body: framePageFixture({ items, total: items.length }) };
      }
      if (url === "/api/v1/frames/frame-1") return { status: 200, body: pendingFrame };
      if (url === "/api/v1/frames/frame-2") return { status: 200, body: acceptedFrame };
      throw new Error(`Nieobsłużone żądanie testowe: ${url}`);
    });
    renderApp(["/annotations/run-1"]);

    await screen.findByRole("img", { name: "Klatka 0 runu run-1" });
    const filters = screen.getByRole("group", { name: "Filtr statusu klatek" });
    expect(within(filters).getByRole("button", { name: /Wszystkie\s*2/ })).toBeVisible();
    expect(within(filters).getByRole("button", { name: /Oczekujące\s*1/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(filters).getByRole("button", { name: /Zaakceptowane\s*1/ })).toBeVisible();
    expect(within(filters).getByRole("button", { name: /Odrzucone\s*0/ })).toBeVisible();

    expect(screen.getByLabelText("Pozycja 1 z 1")).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Wybierz klatkę" })).toHaveDisplayValue(
      "Klatka 0 · 0.000 s · oczekująca",
    );
    expect(screen.getByRole("button", { name: "Następna klatka" })).toBeDisabled();

    await user.click(within(filters).getByRole("button", { name: /Wszystkie\s*2/ }));
    await screen.findByRole("img", { name: "Klatka 0 runu run-1" });
    expect(screen.getByLabelText("Pozycja 1 z 2")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Następna klatka" }));

    await screen.findByRole("img", { name: "Klatka 1 runu run-1" });
    expect(screen.getByLabelText("Pozycja 2 z 2")).toBeVisible();

    await user.click(
      within(screen.getByRole("group", { name: "Filtr statusu klatek" })).getByRole("button", {
        name: /Oczekujące\s*1/,
      }),
    );
    await screen.findByRole("img", { name: "Klatka 0 runu run-1" });
    expect(screen.getByLabelText("Pozycja 1 z 1")).toBeVisible();
  });

  it("uses the rejected filter as the route to reopen and sends the current frame version", async () => {
    const user = userEvent.setup();
    const rejectedSummary = frameSummaryFixture({
      id: "frame-rejected",
      review_status: "rejected",
      version: 8,
    });
    const rejectedFrame = frameDetailFixture({
      id: "frame-rejected",
      review_status: "rejected",
      version: 8,
    });
    let rejectedRequested = false;
    const fetchSpy = stubFetch((url, init) => {
      if (init?.method === "POST" && url === "/api/v1/frames/frame-rejected/review") {
        return { status: 200, body: rejectedFrame };
      }
      if (url === "/api/v1/runs/run-1") {
        return { status: 200, body: runFixture({ profile_id: PROFILE.id }) };
      }
      if (url === `/api/v1/profiles/${PROFILE.id}`) {
        return { status: 200, body: PROFILE };
      }
      if (url.includes("review_status=rejected")) {
        rejectedRequested = true;
        return { status: 200, body: framePageFixture({ items: [rejectedSummary] }) };
      }
      if (url.startsWith("/api/v1/runs/run-1/frames?")) {
        return { status: 200, body: framePageFixture() };
      }
      if (url === "/api/v1/frames/frame-1") {
        return { status: 200, body: frameDetailFixture() };
      }
      if (url === "/api/v1/frames/frame-rejected") {
        return { status: 200, body: rejectedFrame };
      }
      if (url === "/api/v1/dashboard") {
        return { status: 200, body: dashboardFixture({ profile: PROFILE }) };
      }
      throw new Error(`Nieobsłużone żądanie testowe: ${url}`);
    });
    renderApp(["/annotations/run-1"]);

    await screen.findByRole("listbox", { name: "Bbox anotacji na klatce" });
    await user.click(screen.getByRole("button", { name: /Odrzucone/ }));
    expect(await screen.findByRole("button", { name: "Otwórz ponownie" })).toBeEnabled();
    expect(rejectedRequested).toBe(true);

    await user.click(screen.getByRole("button", { name: "Otwórz ponownie" }));
    await waitFor(() => {
      const reviewCall = fetchSpy.mock.calls.find(
        ([url, init]) =>
          url === "/api/v1/frames/frame-rejected/review" && init?.method === "POST",
      );
      expect(JSON.parse(String(reviewCall?.[1]?.body))).toEqual({
        decision: "reopen",
        expected_version: 8,
      });
    });
  });

  it("reloads the frame explicitly on version_conflict and keeps the code visible", async () => {
    const user = userEvent.setup();
    let frameReads = 0;
    reviewApi({
      mutation: () => ({ status: 409, body: errorEnvelope("version_conflict") }),
    }).mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/v1/frames/frame-1" && (init?.method === undefined || init.method === "GET")) {
        frameReads += 1;
      }
      if (init?.method === "PATCH") {
        return Promise.resolve(
          new Response(JSON.stringify(errorEnvelope("version_conflict")), {
            status: 409,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      const response =
        url === "/api/v1/runs/run-1"
          ? runFixture({ profile_id: PROFILE.id })
          : url === `/api/v1/profiles/${PROFILE.id}`
            ? PROFILE
            : url.startsWith("/api/v1/runs/run-1/frames?")
              ? framePageFixture()
              : url === "/api/v1/frames/frame-1"
                ? frameDetailFixture()
                : dashboardFixture({ profile: PROFILE });
      return Promise.resolve(
        new Response(JSON.stringify(response), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });
    renderApp(["/annotations/run-1"]);

    await screen.findByRole("listbox", { name: "Bbox anotacji na klatce" });
    await user.click(screen.getByRole("button", { name: "Klasa 7, 1 anotacji" }));
    const classField = screen.getByLabelText("Klasa");
    await user.clear(classField);
    await user.type(classField, "health");
    await user.click(screen.getByRole("option", { name: "health" }));
    await user.click(screen.getByRole("button", { name: "Zapisz klasę" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Dane zmieniły się w międzyczasie");
    expect(alert).toHaveTextContent("Kod: version_conflict");
    await waitFor(() => {
      expect(frameReads).toBeGreaterThanOrEqual(2);
    });
  });

  it("maps bbox_invalid annotation_ids to exactly the matching overlay option and list row", async () => {
    const user = userEvent.setup();
    const second = annotationFixture({ id: "ann-2", category_id: "category-2", x: 400 });
    reviewApi({
      frame: frameDetailFixture({ annotations: [annotationFixture(), second] }),
      mutation: () => ({
        status: 400,
        body: errorEnvelope("bbox_invalid", "Niepoprawny bbox.", {
          annotation_ids: ["ann-2"],
        }),
      }),
    });
    renderApp(["/annotations/run-1"]);

    await user.click(await screen.findByRole("button", { name: "Zaakceptuj klatkę" }));
    const firstOption = screen.getByRole("option", { name: /^7, źródło OCR:/ });
    const secondOption = screen.getByRole("option", { name: /^health, źródło OCR:/ });
    expect(firstOption).not.toHaveClass("df-region-overlay__shape--error");
    expect(secondOption).toHaveClass("df-region-overlay__shape--error");
    fireEvent.click(secondOption.querySelector(".df-region-overlay__shape-fill") as Element);
    expect(await screen.findByText("Boks poza granicami klatki. Popraw jego geometrię.")).toBeVisible();
  });

  it("shows frame_not_reviewable as a Polish domain message rather than an app crash", async () => {
    const user = userEvent.setup();
    reviewApi({
      mutation: () => ({ status: 409, body: errorEnvelope("frame_not_reviewable") }),
    });
    renderApp(["/annotations/run-1"]);

    await user.click(await screen.findByRole("button", { name: "Odrzuć klatkę" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Klatka nie zakończyła jeszcze OCR");
    expect(alert).toHaveTextContent("Kod: frame_not_reviewable");
  });

  it.each([
    {
      button: "Zaakceptuj klatkę",
      code: "no_annotations",
      message: "Klatka nie ma żadnej anotacji",
    },
    {
      button: "Usuń",
      code: "review_locked",
      message: "Klatka ma już decyzję weryfikacji i jest zamrożona",
    },
  ])("shows $code through the central dictionary", async ({ button, code, message }) => {
    const user = userEvent.setup();
    reviewApi({ mutation: () => ({ status: code === "no_annotations" ? 400 : 409, body: errorEnvelope(code) }) });
    renderApp(["/annotations/run-1"]);

    if (button === "Usuń") {
      await user.click(await screen.findByRole("button", { name: "Klasa 7, 1 anotacji" }));
    }
    await user.click(await screen.findByRole("button", { name: button }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(message);
    expect(alert).toHaveTextContent(`Kod: ${code}`);
  });

  it("blocks the mutation control and shows its spinner until the backend answers", async () => {
    const user = userEvent.setup();
    let resolveMutation: ((response: Response) => void) | undefined;
    const mutationResponse = new Promise<Response>((resolve) => {
      resolveMutation = resolve;
    });
    const fetchSpy = reviewApi();
    const originalImplementation = fetchSpy.getMockImplementation()!;
    fetchSpy.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        return mutationResponse;
      }
      return originalImplementation(input, init);
    });
    renderApp(["/annotations/run-1"]);

    await screen.findByRole("listbox", { name: "Bbox anotacji na klatce" });
    await user.click(screen.getByRole("button", { name: "Klasa 7, 1 anotacji" }));
    const classField = screen.getByLabelText("Klasa");
    await user.clear(classField);
    await user.type(classField, "health");
    await user.click(screen.getByRole("option", { name: "health" }));
    const saveButton = screen.getByRole("button", { name: "Zapisz klasę" });
    await user.click(saveButton);

    expect(saveButton).toHaveAttribute("aria-busy", "true");
    expect(saveButton).toBeDisabled();
    expect(screen.getByLabelText("Klasa")).toBeDisabled();

    resolveMutation?.(
      new Response(JSON.stringify(annotationFixture({ category_id: "category-2", version: 4 })), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});

describe("keyboard-complete annotation list", () => {
  it("exposes selection, class, delete, geometry and draft confirmation as native controls", async () => {
    const user = userEvent.setup();
    const requests: { method: string; url: string }[] = [];
    reviewApi({
      mutation: (url, init) => {
        requests.push({ method: init?.method ?? "GET", url });
        return { status: 409, body: errorEnvelope("version_conflict") };
      },
    });
    renderApp(["/annotations/run-1"]);
    const overlay = await screen.findByRole("listbox", { name: "Bbox anotacji na klatce" });

    await user.click(screen.getByRole("button", { name: "Klasa 7, 1 anotacji" }));
    const classSelect = screen.getByLabelText("Klasa");
    await user.clear(classSelect);
    await user.type(classSelect, "health");
    const saveClass = screen.getByRole("button", { name: "Zapisz klasę" });
    await user.keyboard("{Enter}");

    await waitFor(() => expect(saveClass).toBeEnabled());
    await user.click(screen.getByText(/^x 100 · y 120/));
    const xField = screen.getByLabelText("x");
    await user.clear(xField);
    await user.type(xField, "101");
    const saveGeometry = screen.getByRole("button", { name: "Zapisz geometrię" });
    saveGeometry.focus();
    await user.keyboard("{Enter}");

    await waitFor(() => expect(saveGeometry).toBeEnabled());
    const drawGeometry = screen.getByRole("button", { name: "Przerysuj bbox" });
    drawGeometry.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Anuluj przerysowanie" })).toHaveFocus();

    const deleteButton = screen.getByRole("button", { name: "Usuń" });
    deleteButton.focus();
    await user.keyboard("{Enter}");

    await waitFor(() => expect(deleteButton).toBeEnabled());
    await user.keyboard("{Escape}");
    vi.spyOn(overlay, "getBoundingClientRect").mockReturnValue({
      bottom: 540,
      height: 540,
      left: 0,
      right: 960,
      top: 0,
      width: 960,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    fireEvent.pointerDown(overlay, { clientX: 300, clientY: 250, pointerId: 1 });
    fireEvent.pointerMove(overlay, { clientX: 400, clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(overlay, { clientX: 400, clientY: 300, pointerId: 1 });
    const createButton = screen.getByRole("button", { name: "Zapisz klasę" });
    createButton.focus();
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(requests).toEqual(
        expect.arrayContaining([
          { method: "PATCH", url: "/api/v1/annotations/ann-1" },
          { method: "DELETE", url: "/api/v1/annotations/ann-1?expected_version=3" },
          { method: "POST", url: "/api/v1/frames/frame-1/annotations" },
        ]),
      );
      expect(requests.filter((request) => request.method === "PATCH")).toHaveLength(2);
    });
  });
});
