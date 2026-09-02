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

interface ReviewApiOptions {
  frame?: FrameDetail;
  frames?: Page<FrameSummary>;
  mutation?: (url: string, init: RequestInit | undefined) => StubbedResponse;
}

function reviewApi(options: ReviewApiOptions = {}) {
  const frame = options.frame ?? frameDetailFixture();
  const frames = options.frames ?? framePageFixture();
  return stubFetch((url, init) => {
    if (init?.method !== undefined && init.method !== "GET") {
      return options.mutation?.(url, init) ?? { status: 200, body: frame };
    }
    if (url === "/api/v1/runs/run-1") {
      return { status: 200, body: runFixture({ id: "run-1", profile_id: PROFILE.id }) };
    }
    if (url === `/api/v1/profiles/${PROFILE.id}`) {
      return { status: 200, body: PROFILE };
    }
    if (url.startsWith("/api/v1/runs/run-1/frames?")) {
      return { status: 200, body: frames };
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
    expect(screen.getByRole("option", { name: "Odrzucone" })).toBeInTheDocument();
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

describe("review filters and mutations", () => {
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

    await screen.findByText("Obraz i bbox");
    await user.selectOptions(screen.getByLabelText("Status weryfikacji"), "rejected");
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

    await screen.findByText("Obraz i bbox");
    await user.click(screen.getByRole("button", { name: "Klasa 7, 1 anotacji" }));
    const classField = screen.getByLabelText("Klasa");
    await user.clear(classField);
    await user.type(classField, "health");
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

    await screen.findByText("Obraz i bbox");
    await user.click(screen.getByRole("button", { name: "Klasa 7, 1 anotacji" }));
    const classField = screen.getByLabelText("Klasa");
    await user.clear(classField);
    await user.type(classField, "health");
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
  it("exposes selection, class, delete, geometry and manual create as native keyboard controls", async () => {
    const user = userEvent.setup();
    const requests: { method: string; url: string }[] = [];
    reviewApi({
      mutation: (url, init) => {
        requests.push({ method: init?.method ?? "GET", url });
        return { status: 409, body: errorEnvelope("version_conflict") };
      },
    });
    renderApp(["/annotations/run-1"]);
    await screen.findByText("Obraz i bbox");

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
    for (const [label, value] of [
      ["Nowy x", "10"],
      ["Nowy y", "20"],
      ["Nowy width", "30"],
      ["Nowy height", "40"],
    ] as const) {
      await user.type(screen.getByLabelText(label), value);
    }
    const createButton = screen.getByRole("button", { name: "Dodaj bbox z pól" });
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
