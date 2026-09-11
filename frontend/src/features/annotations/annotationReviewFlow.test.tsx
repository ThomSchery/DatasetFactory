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

async function drawDraft(): Promise<HTMLElement> {
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
  return overlay;
}

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
    expect(screen.getByText("Klatka 17", { selector: ".df-region-overlay__corner-label" })).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(within(overlay).getAllByRole("option")).toHaveLength(2);
    expect(screen.getByText("Ręczna")).toBeInTheDocument();
    expect(screen.getByText("7 · 91%")).toBeInTheDocument();
  });

  it("orders the full-width canvas before inspector, metadata and notices", async () => {
    reviewApi({
      frame: frameDetailFixture({ review_status: "accepted" }),
    });
    renderApp(["/annotations/run-1"]);

    const preview = await screen.findByRole("region", { name: "Podgląd klatki 17" });
    const overlay = within(preview).getByRole("listbox", { name: "Bbox anotacji na klatce" });
    const inspector = screen.getByRole("region", { name: "Anotacje na klatce" });
    const details = screen.getByText("Timestamp").closest(".df-review-workspace__details");
    const terminalNotice = screen.getByRole("status", { name: "Klatka zaakceptowana" });

    expect(details).not.toBeNull();
    expect(preview.compareDocumentPosition(inspector) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(preview.compareDocumentPosition(details as Element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(preview).not.toContainElement(terminalNotice);
    expect(details).toContainElement(terminalNotice);
    expect(overlay.closest(".df-region-overlay")).toContainElement(
      screen.getByText("Klatka 17", { selector: ".df-region-overlay__corner-label" }),
    );
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
    const dialog = screen.getByRole("dialog", { name: "Edytuj anotację 7" });
    expect(dialog).toBeVisible();
    const preview = screen.getByRole("region", { name: "Podgląd klatki 17" });
    const overlayRoot = overlay.closest(".df-region-overlay");
    expect(overlayRoot).not.toBeNull();
    expect(dialog.parentElement).toBe(preview);
    expect(dialog.previousElementSibling).toBe(overlayRoot);
    expect(overlayRoot).not.toContainElement(dialog);

    await user.click(classHealth);
    expect(options[0]).toHaveAttribute("aria-selected", "false");
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    expect(classSeven).toHaveAttribute("aria-pressed", "false");
    expect(classHealth).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps a drawn bbox as a client draft and a click outside discards it without POST", async () => {
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
    expect(within(overlay).getByRole("option", { name: /^Box — wybierz klasę:/ })).toHaveClass(
      "df-region-overlay__shape--draft",
    );

    fireEvent.pointerDown(screen.getByRole("heading", { name: "Anotacje na klatce" }));

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

  it("opens a drawn box ready to choose from, with nothing chosen for the user", async () => {
    const user = userEvent.setup();
    const fetchSpy = reviewApi({ profile: RICH_PROFILE });
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

    const popover = screen.getByRole("dialog", { name: "Wybierz klasę dla nowego bbox" });
    expect(within(popover).getByLabelText("Klasa")).toHaveValue("");
    expect(within(popover).getByLabelText("Klasa")).toHaveFocus();
    for (const option of within(popover).getAllByRole("option")) {
      expect(option).toHaveAttribute("aria-selected", "false");
    }
    expect(within(popover).getByRole("button", { name: "Zapisz klasę" })).toBeDisabled();

    await user.keyboard("{Enter}");

    for (const option of within(popover).getAllByRole("option")) {
      expect(option).toHaveAttribute("aria-selected", "false");
    }
    expect(
      fetchSpy.mock.calls.some(
        ([url, init]) =>
          url === "/api/v1/frames/frame-1/annotations" && init?.method === "POST",
      ),
    ).toBe(false);
    expect(
      fetchSpy.mock.calls.filter(
        ([, init]) => init?.method !== undefined && init.method !== "GET",
      ),
    ).toHaveLength(0);

    await user.click(within(popover).getByRole("option", { name: "Timer" }));
    await user.click(within(popover).getByRole("button", { name: "Zapisz klasę" }));

    await waitFor(() => {
      const post = fetchSpy.mock.calls.find(
        ([url, init]) =>
          url === "/api/v1/frames/frame-1/annotations" && init?.method === "POST",
      );
      expect(JSON.parse(String(post?.[1]?.body))).toEqual({
        bbox: { x: 600, y: 500, width: 200, height: 100 },
        category_id: "timer",
        expected_version: 7,
      });
    });
  });

  it("creates a character class and then assigns it to the draft in exactly two writes", async () => {
    const user = userEvent.setup();
    const mutations: Array<{ body: unknown; method: string; url: string }> = [];
    reviewApi({
      mutation: (url, init) => {
        mutations.push({
          body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
          method: init?.method ?? "GET",
          url,
        });
        if (url === `/api/v1/profiles/${PROFILE.id}/categories`) {
          return {
            status: 201,
            body: { id: "category-8", kind: "character", name: "8" },
          };
        }
        if (url === "/api/v1/frames/frame-1/annotations") {
          return {
            status: 201,
            body: annotationFixture({ category_id: "category-8", id: "ann-new" }),
          };
        }
        throw new Error(`Nieobsłużona mutacja testowa: ${url}`);
      },
    });
    renderApp(["/annotations/run-1"]);
    await drawDraft();

    const popover = screen.getByRole("dialog", { name: "Wybierz klasę dla nowego bbox" });
    await user.type(within(popover).getByRole("textbox", { name: "Klasa" }), "8");
    await user.click(
      within(popover).getByRole("button", { name: "Utwórz i przypisz klasę „8”" }),
    );

    await waitFor(() => {
      expect(mutations).toHaveLength(2);
    });
    expect(mutations).toEqual([
      {
        body: { kind: "character", name: "8" },
        method: "POST",
        url: `/api/v1/profiles/${PROFILE.id}/categories`,
      },
      {
        body: {
          bbox: { x: 600, y: 500, width: 200, height: 100 },
          category_id: "category-8",
          expected_version: 7,
        },
        method: "POST",
        url: "/api/v1/frames/frame-1/annotations",
      },
    ]);
  });

  it("creates a game class and reassigns an existing annotation through its versioned PATCH", async () => {
    const user = userEvent.setup();
    const mutations: Array<{ body: unknown; method: string; url: string }> = [];
    reviewApi({
      mutation: (url, init) => {
        mutations.push({
          body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
          method: init?.method ?? "GET",
          url,
        });
        if (url === `/api/v1/profiles/${PROFILE.id}/categories`) {
          return { status: 201, body: { id: "score", kind: "game", name: "Score" } };
        }
        if (url === "/api/v1/annotations/ann-1") {
          return { status: 200, body: annotationFixture({ category_id: "score" }) };
        }
        throw new Error(`Nieobsłużona mutacja testowa: ${url}`);
      },
    });
    renderApp(["/annotations/run-1"]);

    await user.click(await screen.findByRole("button", { name: "Klasa 7, 1 anotacji" }));
    const popover = screen.getByRole("dialog", { name: "Edytuj anotację 7" });
    await user.type(within(popover).getByRole("textbox", { name: "Klasa" }), "Score");
    await user.click(
      within(popover).getByRole("button", { name: "Utwórz i przypisz klasę „Score”" }),
    );

    await waitFor(() => {
      expect(mutations).toHaveLength(2);
    });
    expect(mutations).toEqual([
      {
        body: { kind: "game", name: "Score" },
        method: "POST",
        url: `/api/v1/profiles/${PROFILE.id}/categories`,
      },
      {
        body: { category_id: "score", expected_version: 3 },
        method: "PATCH",
        url: "/api/v1/annotations/ann-1",
      },
    ]);
  });

  it("keeps the typed name and draft box when creating the category fails", async () => {
    const user = userEvent.setup();
    const fetchSpy = reviewApi({
      mutation: (url) => {
        if (url === `/api/v1/profiles/${PROFILE.id}/categories`) {
          return { status: 500, body: errorEnvelope("category_persistence_failed") };
        }
        throw new Error(`Nieobsłużona mutacja testowa: ${url}`);
      },
    });
    renderApp(["/annotations/run-1"]);
    const overlay = await drawDraft();
    const popover = screen.getByRole("dialog", { name: "Wybierz klasę dla nowego bbox" });
    const filter = within(popover).getByRole("textbox", { name: "Klasa" });
    await user.type(filter, "8");

    await user.click(
      within(popover).getByRole("button", { name: "Utwórz i przypisz klasę „8”" }),
    );

    expect(await within(popover).findByRole("alert")).toHaveTextContent(
      "Nie udało się zapisać nowej klasy",
    );
    expect(filter).toHaveValue("8");
    expect(within(overlay).getByRole("option", { name: /^Box — wybierz klasę:/ })).toBeVisible();
    expect(
      fetchSpy.mock.calls.filter(
        ([, init]) => init?.method !== undefined && init.method !== "GET",
      ),
    ).toHaveLength(1);
  });

  it.each([
    { existingId: "long-s", existingName: "ſ", proposedName: "S", typed: "s" },
    { existingId: "ligature-ff", existingName: "ﬀ", proposedName: "ff", typed: "ff" },
  ])(
    "reveals and selects $existingName after the backend rejects $typed as its duplicate",
    async ({ existingId, existingName, proposedName, typed }) => {
      const user = userEvent.setup();
      const conflictProfile = profileFixture({
        categories: [
          ...PROFILE.categories,
          { id: existingId, kind: "game", name: existingName },
        ],
      });
      const writes: Array<{ body: unknown; method: string; url: string }> = [];
      const fetchSpy = reviewApi({
        profile: conflictProfile,
        mutation: (url, init) => {
          writes.push({
            body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
            method: init?.method ?? "GET",
            url,
          });
          if (url === `/api/v1/profiles/${conflictProfile.id}/categories`) {
            return {
              status: 409,
              body: errorEnvelope("category_name_exists", "Duplicate category.", {
                category_id: existingId,
                category_name: existingName,
              }),
            };
          }
          if (url === "/api/v1/annotations/ann-1") {
            return {
              status: 200,
              body: annotationFixture({ category_id: existingId }),
            };
          }
          throw new Error(`Nieobsłużona mutacja testowa: ${url}`);
        },
      });
      renderApp(["/annotations/run-1"]);

      await user.click(await screen.findByRole("button", { name: "Klasa 7, 1 anotacji" }));
      const popover = screen.getByRole("dialog", { name: "Edytuj anotację 7" });
      const filter = within(popover).getByRole("textbox", { name: "Klasa" });
      await user.type(filter, typed);
      await user.click(
        within(popover).getByRole("button", {
          name: `Utwórz i przypisz klasę „${proposedName}”`,
        }),
      );

      const recoveredOption = await within(popover).findByRole("option", {
        name: existingName,
      });
      expect(filter).toHaveValue(existingName);
      expect(recoveredOption).toHaveAttribute("aria-selected", "true");
      expect(within(popover).getByRole("alert")).toHaveTextContent(
        "Klasa o tej nazwie już istnieje w profilu.",
      );
      expect(writes).toHaveLength(1);
      expect(
        fetchSpy.mock.calls.filter(
          ([url, init]) =>
            url === `/api/v1/profiles/${conflictProfile.id}` &&
            (init?.method === undefined || init.method === "GET"),
        ).length,
      ).toBeGreaterThanOrEqual(2);

      await user.click(within(popover).getByRole("button", { name: "Zapisz klasę" }));
      await waitFor(() => {
        expect(writes).toHaveLength(2);
      });
      expect(writes[1]).toEqual({
        body: { category_id: existingId, expected_version: 3 },
        method: "PATCH",
        url: "/api/v1/annotations/ann-1",
      });
    },
  );

  it("says the winner is unknown when an older backend rejects without details", async () => {
    const user = userEvent.setup();
    const conflictProfile = profileFixture({
      categories: [...PROFILE.categories, { id: "long-s", kind: "game", name: "ſ" }],
    });
    const writes: Array<{ body: unknown; method: string; url: string }> = [];
    reviewApi({
      profile: conflictProfile,
      mutation: (url, init) => {
        writes.push({
          body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
          method: init?.method ?? "GET",
          url,
        });
        if (url === `/api/v1/profiles/${conflictProfile.id}/categories`) {
          // A backend that casefolds `ſ` to `s` but answers without `details`.
          return { status: 409, body: errorEnvelope("category_name_exists") };
        }
        if (url === "/api/v1/annotations/ann-1") {
          return { status: 200, body: annotationFixture({ category_id: "long-s" }) };
        }
        throw new Error(`Nieobsłużona mutacja testowa: ${url}`);
      },
    });
    renderApp(["/annotations/run-1"]);

    await user.click(await screen.findByRole("button", { name: "Klasa 7, 1 anotacji" }));
    const popover = screen.getByRole("dialog", { name: "Edytuj anotację 7" });
    const filter = within(popover).getByRole("textbox", { name: "Klasa" });
    await user.type(filter, "s");
    await user.click(within(popover).getByRole("button", { name: "Utwórz i przypisz klasę „S”" }));

    const alert = await within(popover).findByRole("alert");
    expect(alert).toHaveTextContent("Klasa o tej nazwie już istnieje w profilu.");
    expect(alert).toHaveTextContent("Wskaż istniejącą klasę na liście");
    expect(alert).not.toHaveTextContent("wybrana");
    await waitFor(() => {
      expect(filter).toHaveValue("");
    });
    // The blocking class is a duplicate under the backend's casefold only, so
    // it is unreachable under the typed query and has to be listed again.
    const blocking = within(popover).getByRole("option", { name: "ſ" });
    expect(blocking).toHaveAttribute("aria-selected", "false");
    for (const option of within(popover).getAllByRole("option")) {
      expect(option).toHaveAttribute("aria-selected", "false");
    }
    expect(within(popover).getByRole("button", { name: "Zapisz klasę" })).toBeDisabled();
    expect(
      within(popover).queryByRole("button", { name: /Utwórz i przypisz klasę/ }),
    ).not.toBeInTheDocument();
    expect(writes).toHaveLength(1);

    await user.click(blocking);
    await user.click(within(popover).getByRole("button", { name: "Zapisz klasę" }));
    await waitFor(() => {
      expect(writes).toHaveLength(2);
    });
    expect(writes[1]).toEqual({
      body: { category_id: "long-s", expected_version: 3 },
      method: "PATCH",
      url: "/api/v1/annotations/ann-1",
    });
  });

  it("keeps the rejected normalized name blocked until the real parent sees another intent", async () => {
    const user = userEvent.setup();
    const conflictProfile = profileFixture({
      categories: [...PROFILE.categories, { id: "long-s", kind: "game", name: "ſ" }],
    });
    const writes: Array<{ body: unknown; method: string; url: string }> = [];
    reviewApi({
      profile: conflictProfile,
      mutation: (url, init) => {
        const body = init?.body === undefined ? undefined : JSON.parse(String(init.body));
        writes.push({ body, method: init?.method ?? "GET", url });
        if (url === `/api/v1/profiles/${conflictProfile.id}/categories`) {
          if ((body as { name?: unknown } | undefined)?.name === "Mana") {
            return { status: 201, body: { id: "mana", kind: "game", name: "Mana" } };
          }
          return { status: 409, body: errorEnvelope("category_name_exists") };
        }
        if (url === "/api/v1/annotations/ann-1") {
          return { status: 200, body: annotationFixture({ category_id: "mana" }) };
        }
        throw new Error(`Nieobsłużona mutacja testowa: ${url}`);
      },
    });
    renderApp(["/annotations/run-1"]);

    await user.click(await screen.findByRole("button", { name: "Klasa 7, 1 anotacji" }));
    const popover = screen.getByRole("dialog", { name: "Edytuj anotację 7" });
    const filter = within(popover).getByRole("textbox", { name: "Klasa" });
    await user.type(filter, "s");
    await user.click(
      within(popover).getByRole("button", { name: "Utwórz i przypisz klasę „S”" }),
    );
    await within(popover).findByRole("alert");
    await waitFor(() => {
      expect(filter).toHaveValue("");
    });
    expect(writes).toHaveLength(1);

    // This input crosses the real AnnotationPopover -> FrameEditor callback
    // boundary. With the FIX2 parent it erased `unidentified` and exposed a
    // second create action for the same normalized proposal.
    await user.type(filter, "s");
    expect(filter).toHaveValue("s");
    expect(
      within(popover).queryByRole("button", { name: /Utwórz i przypisz klasę/ }),
    ).not.toBeInTheDocument();
    expect(writes).toHaveLength(1);

    await user.clear(filter);
    await user.type(filter, "Mana");
    await user.click(
      within(popover).getByRole("button", { name: "Utwórz i przypisz klasę „Mana”" }),
    );

    await waitFor(() => {
      expect(writes).toHaveLength(3);
    });
    expect(writes).toEqual([
      {
        body: { kind: "character", name: "S" },
        method: "POST",
        url: `/api/v1/profiles/${conflictProfile.id}/categories`,
      },
      {
        body: { kind: "game", name: "Mana" },
        method: "POST",
        url: `/api/v1/profiles/${conflictProfile.id}/categories`,
      },
      {
        body: { category_id: "mana", expected_version: 3 },
        method: "PATCH",
        url: "/api/v1/annotations/ann-1",
      },
    ]);
  });

  it("still selects the exact name after a detail-less rejection", async () => {
    const user = userEvent.setup();
    const evolvingProfile = profileFixture({ categories: [...PROFILE.categories] });
    const writes: Array<{ body: unknown; method: string; url: string }> = [];
    reviewApi({
      profile: evolvingProfile,
      mutation: (url, init) => {
        writes.push({
          body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
          method: init?.method ?? "GET",
          url,
        });
        if (url === `/api/v1/profiles/${evolvingProfile.id}/categories`) {
          // The race the operator lost: the class exists by the time the
          // profile is read back, under the very name that was typed.
          evolvingProfile.categories = [
            ...evolvingProfile.categories,
            { id: "score", kind: "game", name: "Score" },
          ];
          return { status: 409, body: errorEnvelope("category_name_exists") };
        }
        if (url === "/api/v1/annotations/ann-1") {
          return { status: 200, body: annotationFixture({ category_id: "score" }) };
        }
        throw new Error(`Nieobsłużona mutacja testowa: ${url}`);
      },
    });
    renderApp(["/annotations/run-1"]);

    await user.click(await screen.findByRole("button", { name: "Klasa 7, 1 anotacji" }));
    const popover = screen.getByRole("dialog", { name: "Edytuj anotację 7" });
    const filter = within(popover).getByRole("textbox", { name: "Klasa" });
    await user.type(filter, "Score");
    await user.click(
      within(popover).getByRole("button", { name: "Utwórz i przypisz klasę „Score”" }),
    );

    const recovered = await within(popover).findByRole("option", { name: "Score" });
    expect(filter).toHaveValue("Score");
    expect(recovered).toHaveAttribute("aria-selected", "true");

    await user.click(within(popover).getByRole("button", { name: "Zapisz klasę" }));
    await waitFor(() => {
      expect(writes).toHaveLength(2);
    });
    expect(writes[1]).toEqual({
      body: { category_id: "score", expected_version: 3 },
      method: "PATCH",
      url: "/api/v1/annotations/ann-1",
    });
  });

  it("nudges a draft in source pixels without POST before or after Enter", async () => {
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
    fireEvent.pointerDown(overlay, { clientX: 300, clientY: 250, pointerId: 1 });
    fireEvent.pointerMove(overlay, { clientX: 400, clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(overlay, { clientX: 400, clientY: 300, pointerId: 1 });

    /*
     * The draft has no class chip to park focus on, and the overlay's own
     * options answer arrows with roving focus. The geometry summary used to be
     * the third place focus could sit; with it gone, this is the state the
     * operator is in after clicking anything that is not a control — panel
     * blurred, nothing else focused.
     */
    (document.activeElement as HTMLElement | null)?.blur();
    await user.keyboard("{ArrowRight}{Shift>}{ArrowDown}{/Shift}");

    expect(
      within(overlay).getByRole("option", { name: /^Box — wybierz klasę:/ }),
    ).toHaveAttribute("aria-label", expect.stringContaining("x 601, y 510"));
    expect(fetchSpy.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);

    await user.keyboard("{Enter}");

    expect(fetchSpy.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
  });

  it("accumulates three nudges in one preview and sends exactly one PATCH on Enter", async () => {
    const user = userEvent.setup();
    const fetchSpy = reviewApi();
    renderApp(["/annotations/run-1"]);

    const overlay = await screen.findByRole("listbox", { name: "Bbox anotacji na klatce" });
    const classButton = screen.getByRole("button", { name: "Klasa 7, 1 anotacji" });
    await user.click(classButton);
    classButton.focus();
    await user.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}");

    expect(within(overlay).getByRole("option")).toHaveAttribute(
      "aria-label",
      expect.stringContaining("x 103, y 120, szerokość 40, wysokość 32"),
    );
    expect(screen.getByText("Niezapisane")).toBeVisible();
    expect(
      fetchSpy.mock.calls.filter(
        ([url, init]) => url === "/api/v1/annotations/ann-1" && init?.method === "PATCH",
      ),
    ).toHaveLength(0);

    await user.keyboard("{Enter}");

    await waitFor(() => {
      const patches = fetchSpy.mock.calls.filter(
        ([url, init]) => url === "/api/v1/annotations/ann-1" && init?.method === "PATCH",
      );
      expect(patches).toHaveLength(1);
      expect(JSON.parse(String(patches[0]?.[1]?.body))).toEqual({
        bbox: { x: 103, y: 120, width: 40, height: 32 },
        expected_version: 3,
      });
    });
  });

  it("uses a ten-pixel step for Shift+ArrowDown", async () => {
    const user = userEvent.setup();
    const fetchSpy = reviewApi();
    renderApp(["/annotations/run-1"]);

    const overlay = await screen.findByRole("listbox", { name: "Bbox anotacji na klatce" });
    const classButton = screen.getByRole("button", { name: "Klasa 7, 1 anotacji" });
    await user.click(classButton);
    classButton.focus();
    await user.keyboard("{Shift>}{ArrowDown}{/Shift}");

    expect(within(overlay).getByRole("option")).toHaveAttribute(
      "aria-label",
      expect.stringContaining("x 100, y 130"),
    );
    expect(fetchSpy.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(0);
  });

  it("does not create a preview, prevent scrolling or request a PATCH at the frame edge", async () => {
    const edge = annotationFixture({ x: 1880, width: 40 });
    const fetchSpy = reviewApi({ frame: frameDetailFixture({ annotations: [edge] }) });
    renderApp(["/annotations/run-1"]);

    const overlay = await screen.findByRole("listbox", { name: "Bbox anotacji na klatce" });
    const classButton = screen.getByRole("button", { name: "Klasa 7, 1 anotacji" });
    fireEvent.click(classButton);
    classButton.focus();

    expect(fireEvent.keyDown(classButton, { key: "ArrowRight" })).toBe(true);
    expect(within(overlay).getByRole("option")).toHaveAttribute(
      "aria-label",
      expect.stringContaining("x 1880, y 120, szerokość 40, wysokość 32"),
    );
    expect(screen.queryByText("Niezapisane")).not.toBeInTheDocument();
    fireEvent.keyDown(classButton, { key: "Enter" });
    expect(fetchSpy.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(0);
  });

  it("leaves ArrowRight to the class filter while it owns focus", async () => {
    const user = userEvent.setup();
    const fetchSpy = reviewApi();
    renderApp(["/annotations/run-1"]);

    const overlay = await screen.findByRole("listbox", { name: "Bbox anotacji na klatce" });
    await user.click(screen.getByRole("button", { name: "Klasa 7, 1 anotacji" }));
    const dialog = screen.getByRole("dialog", { name: "Edytuj anotację 7" });
    within(dialog).getByRole("textbox", { name: "Klasa" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(within(overlay).getByRole("option")).toHaveAttribute(
      "aria-label",
      expect.stringContaining("x 100, y 120"),
    );
    expect(fetchSpy.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(0);
  });

  it("leaves arrows to the scoped class picker while it owns focus", async () => {
    const user = userEvent.setup();
    const fetchSpy = reviewApi({ profile: RICH_PROFILE });
    renderApp(["/annotations/run-1"]);

    const overlay = await screen.findByRole("listbox", { name: "Bbox anotacji na klatce" });
    await user.click(screen.getByRole("button", { name: "Klasa 7, 1 anotacji" }));
    const dialog = screen.getByRole("dialog", { name: "Edytuj anotację 7" });
    const classOption = within(dialog).getByRole("option", { name: "7" });
    classOption.focus();
    await user.keyboard("{ArrowDown}");
    expect(within(overlay).getByRole("option")).toHaveAttribute(
      "aria-label",
      expect.stringContaining("x 100, y 120"),
    );
    expect(fetchSpy.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(0);
  });

  it("does not nudge or request geometry for a frozen frame", async () => {
    const fetchSpy = reviewApi({
      frame: frameDetailFixture({ review_status: "accepted" }),
    });
    renderApp(["/annotations/run-1"]);

    const overlay = await screen.findByRole("listbox", { name: "Bbox anotacji na klatce" });
    const option = within(overlay).getByRole("option");
    fireEvent.click(option.querySelector(".df-region-overlay__shape-fill") as Element);
    fireEvent.keyDown(window, { key: "ArrowRight" });

    expect(option).toHaveAttribute("aria-label", expect.stringContaining("x 100, y 120"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetchSpy.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(0);
  });

  it("closes on the image without eating the pointerdown that starts the next box", async () => {
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

    fireEvent.pointerDown(overlay, { clientX: 300, clientY: 250, pointerId: 1 });
    fireEvent.pointerMove(overlay, { clientX: 400, clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(overlay, { clientX: 400, clientY: 300, pointerId: 1 });
    expect(screen.getByRole("dialog", { name: "Wybierz klasę dla nowego bbox" })).toBeVisible();

    // One gesture, both effects: the popover closes and the very same
    // pointerdown begins the next drawing. Losing it would leave the user
    // unable to draw straight after dismissing a popover, with nothing on
    // screen to explain why.
    fireEvent.pointerDown(overlay, { clientX: 500, clientY: 200, pointerId: 2 });
    fireEvent.pointerMove(overlay, { clientX: 600, clientY: 260, pointerId: 2 });
    fireEvent.pointerUp(overlay, { clientX: 600, clientY: 260, pointerId: 2 });

    expect(screen.getByRole("dialog", { name: "Wybierz klasę dla nowego bbox" })).toBeVisible();
    const draftShape = within(overlay).getByRole("option", { name: /^Box — wybierz klasę:/ });
    // The second rectangle, not the first: the abandoned draft did not linger.
    expect(draftShape).toHaveAttribute("aria-label", expect.stringContaining("x 1000, y 400"));
    expect(within(overlay).getAllByRole("option")).toHaveLength(2);
    expect(
      fetchSpy.mock.calls.some(
        ([url, init]) =>
          url === "/api/v1/frames/frame-1/annotations" && init?.method === "POST",
      ),
    ).toBe(false);
  });

  it("keeps the popover open while the bbox it edits is dragged", async () => {
    const user = userEvent.setup();
    reviewApi();
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
    const fill = within(overlay)
      .getByRole("option")
      .querySelector(".df-region-overlay__shape-fill");

    fireEvent.pointerDown(fill as Element, { clientX: 55, clientY: 65, pointerId: 1 });

    expect(screen.getByRole("dialog", { name: "Edytuj anotację 7" })).toBeVisible();
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
    expect(within(overlay).getByRole("option", { name: /^Box — wybierz klasę:/ })).toBeVisible();
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

  it("updates the overlay live and saves the dragged bbox through the existing PATCH", async () => {
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
    const fill = within(overlay)
      .getByRole("option")
      .querySelector(".df-region-overlay__shape-fill");
    expect(fill).not.toBeNull();

    // The surface is exactly half the source dimensions. A 100/50 CSS-pixel
    // move is therefore a 200/100 source-pixel move.
    fireEvent.pointerDown(fill as Element, { clientX: 55, clientY: 65, pointerId: 1 });
    fireEvent.pointerMove(overlay, { clientX: 155, clientY: 115, pointerId: 1 });

    expect(within(overlay).getByRole("option")).toHaveAttribute(
      "aria-label",
      expect.stringContaining("x 300, y 220, szerokość 40, wysokość 32"),
    );
    expect(screen.getByText("Niezapisane")).toBeVisible();

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

  it("resets dirty class and the scoped geometry preview when selection moves from A to B", async () => {
    const user = userEvent.setup();
    const first = annotationFixture();
    const second = annotationFixture({
      category_id: "category-2",
      height: 48,
      id: "ann-2",
      observation_id: "observation-2",
      width: 60,
      x: 500,
      y: 320,
    });
    const fetchSpy = reviewApi({
      frame: frameDetailFixture({ annotations: [first, second] }),
      profile: RICH_PROFILE,
    });
    renderApp(["/annotations/run-1"]);
    const overlay = await screen.findByRole("listbox", { name: "Bbox anotacji na klatce" });

    const firstClassButton = screen.getByRole("button", { name: "Klasa 7, 1 anotacji" });
    await user.click(firstClassButton);
    const firstDialog = screen.getByRole("dialog", { name: "Edytuj anotację 7" });
    await user.type(within(firstDialog).getByLabelText("Klasa"), "sco");
    await user.click(within(firstDialog).getByRole("option", { name: "Score" }));
    firstClassButton.focus();
    await user.keyboard("{ArrowRight}");
    expect(within(overlay).getAllByRole("option")[0]).toHaveAttribute(
      "aria-label",
      expect.stringContaining("x 101, y 120"),
    );

    const overlayOptions = within(overlay).getAllByRole("option");
    overlayOptions[0]?.focus();
    await user.keyboard("{ArrowDown}");

    const secondDialog = screen.getByRole("dialog", { name: "Edytuj anotację health" });
    expect(within(secondDialog).getByLabelText("Klasa")).toHaveValue("");
    expect(within(secondDialog).getByRole("option", { name: "health" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(within(secondDialog).getByRole("option", { name: "Score" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    expect(within(overlay).getAllByRole("option")[1]).toHaveAttribute(
      "aria-label",
      expect.stringContaining("x 500, y 320, szerokość 60, wysokość 48"),
    );
    expect(screen.queryByText("Niezapisane")).not.toBeInTheDocument();
    expect(fetchSpy.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(0);
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
    /*
     * Selecting the flagged box used to open a panel that repeated the verdict
     * in its geometry section. That section is gone, so the reason has one
     * place left — the frame-level alert — and the mapping to the annotation
     * has one carrier left: the tone of its overlay option, which selection
     * must not move onto the healthy box.
     */
    fireEvent.click(secondOption.querySelector(".df-region-overlay__shape-fill") as Element);
    expect(await screen.findByRole("dialog", { name: "Edytuj anotację health" })).toBeVisible();
    expect(screen.getByRole("option", { name: /^health, źródło OCR:/ })).toHaveClass(
      "df-region-overlay__shape--error",
    );
    expect(screen.getByRole("option", { name: /^7, źródło OCR:/ })).not.toHaveClass(
      "df-region-overlay__shape--error",
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Kod: bbox_invalid");
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
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
  it("keeps class, delete and draft controls native while geometry stays on the overlay", async () => {
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
    expect(screen.queryByRole("button", { name: "Zapisz geometrię" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Przerysuj bbox" })).not.toBeInTheDocument();
    const classButton = screen.getByRole("button", { name: "Klasa 7, 1 anotacji" });
    classButton.focus();
    await user.keyboard("{ArrowRight}");
    expect(within(overlay).getByRole("option")).toHaveAttribute(
      "aria-label",
      expect.stringContaining("x 101, y 120"),
    );
    await user.keyboard("{Enter}");
    await waitFor(() => {
      expect(requests.filter((request) => request.method === "PATCH")).toHaveLength(2);
    });

    const deleteButton = screen.getByRole("button", { name: "Usuń" });
    deleteButton.focus();
    await user.keyboard("{Enter}");

    await waitFor(() => expect(deleteButton).toBeEnabled());
    fireEvent.pointerDown(screen.getByRole("heading", { name: "Anotacje na klatce" }));
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
    await user.click(screen.getByRole("option", { name: "7" }));
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
