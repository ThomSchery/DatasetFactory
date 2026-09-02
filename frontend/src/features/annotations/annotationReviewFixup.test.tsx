import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { FrameDetail, FrameSummary, Page, PipelineRun } from "../../api";
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
  id: "profile-history",
  categories: [
    { id: "category-1", kind: "character", name: "7" },
    { id: "category-2", kind: "game", name: "health" },
  ],
});

interface ReviewGetOptions {
  frame?: FrameDetail | ((frameId: string) => FrameDetail);
  frames?: Page<FrameSummary> | ((url: string) => Page<FrameSummary>);
  profile?: typeof PROFILE;
  run?: PipelineRun;
}

function reviewGet(options: ReviewGetOptions = {}) {
  const run = options.run ?? runFixture({ id: "run-1", profile_id: PROFILE.id });
  const profile = options.profile ?? PROFILE;
  return (url: string): StubbedResponse | undefined => {
    if (url === "/api/v1/runs/run-1") {
      return { body: run, status: 200 };
    }
    if (url === `/api/v1/profiles/${run.profile_id}`) {
      return { body: profile, status: 200 };
    }
    if (url.startsWith("/api/v1/runs/run-1/frames?")) {
      const frames =
        typeof options.frames === "function"
          ? options.frames(url)
          : (options.frames ?? framePageFixture());
      return { body: frames, status: 200 };
    }
    if (url.startsWith("/api/v1/frames/") && !url.endsWith("/image")) {
      const frameId = url.slice("/api/v1/frames/".length);
      const frame =
        typeof options.frame === "function"
          ? options.frame(frameId)
          : (options.frame ?? frameDetailFixture({ id: frameId }));
      return { body: frame, status: 200 };
    }
    if (url === "/api/v1/dashboard") {
      return { body: dashboardFixture({ profile }), status: 200 };
    }
    return undefined;
  };
}

function requireResponse(response: StubbedResponse | undefined, url: string): StubbedResponse {
  if (response === undefined) {
    throw new Error(`Nieobsłużone żądanie testowe: ${url}`);
  }
  return response;
}

function overlayOptions(): HTMLElement[] {
  return within(screen.getByRole("listbox", { name: "Bbox anotacji na klatce" })).getAllByRole(
    "option",
  );
}

function layOut(surface: Element): void {
  vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({
    bottom: 100,
    height: 100,
    left: 0,
    right: 100,
    top: 0,
    width: 100,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("FE-001-F4-FIX1 interaction regressions", () => {
  it("cancels redraw A when B is selected, so the next gesture never patches A", async () => {
    const user = userEvent.setup();
    const second = annotationFixture({ id: "ann-2", category_id: "category-2", x: 400 });
    const get = reviewGet({
      frame: frameDetailFixture({ annotations: [annotationFixture(), second] }),
    });
    const fetchSpy = stubFetch((url, init) => {
      if (init?.method === "POST" && url.endsWith("/annotations")) {
        return { body: errorEnvelope("version_conflict"), status: 409 };
      }
      return requireResponse(get(url), url);
    });
    renderApp(["/annotations/run-1"]);

    await screen.findByText("Obraz i bbox");
    await user.click(screen.getByRole("button", { name: "Klasa 7, 1 anotacji" }));
    await user.click(screen.getByText(/^x 100 · y 120/));
    await user.click(screen.getByRole("button", { name: "Przerysuj bbox" }));
    expect(screen.getByText(/Tryb zmiany geometrii: 7 \(ann-1\)/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Klasa health, 1 anotacji" }));
    expect(screen.queryByText(/Tryb zmiany geometrii:/)).not.toBeInTheDocument();
    expect(screen.getByText("Przeciągnij na obrazie, aby dodać ręczny bbox.")).toBeInTheDocument();

    const surface = screen.getByRole("listbox", { name: "Bbox anotacji na klatce" });
    layOut(surface);
    fireEvent.pointerDown(surface, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 30, clientY: 30, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 30, clientY: 30, pointerId: 1 });

    await waitFor(() => {
      expect(
        fetchSpy.mock.calls.some(
          ([url, init]) => url === "/api/v1/annotations/ann-1" && init?.method === "PATCH",
        ),
      ).toBe(false);
      expect(
        fetchSpy.mock.calls.some(
          ([url, init]) =>
            url === "/api/v1/frames/frame-1/annotations" && init?.method === "POST",
        ),
      ).toBe(true);
    });
  });

  it("keeps unresolved bbox IDs after one success and after a later 409", async () => {
    const user = userEvent.setup();
    const second = annotationFixture({ id: "ann-2", category_id: "category-2", x: 400 });
    const get = reviewGet({
      frame: frameDetailFixture({ annotations: [annotationFixture(), second] }),
    });
    let patchCount = 0;
    stubFetch((url, init) => {
      if (init?.method === "POST" && url.endsWith("/review")) {
        return {
          body: errorEnvelope("bbox_invalid", "Niepoprawny bbox.", {
            annotation_ids: ["ann-1", "ann-2"],
          }),
          status: 400,
        };
      }
      if (init?.method === "PATCH") {
        patchCount += 1;
        return patchCount === 1
          ? { body: annotationFixture({ version: 4 }), status: 200 }
          : { body: errorEnvelope("version_conflict"), status: 409 };
      }
      return requireResponse(get(url), url);
    });
    renderApp(["/annotations/run-1"]);

    await user.click(await screen.findByRole("button", { name: "Zaakceptuj klatkę" }));
    await waitFor(() => {
      expect(overlayOptions()[0]).toHaveClass("df-region-overlay__shape--error");
      expect(overlayOptions()[1]).toHaveClass("df-region-overlay__shape--error");
    });

    await user.click(screen.getByRole("button", { name: "Klasa 7, 1 anotacji" }));
    await user.click(screen.getByRole("button", { name: "Zapisz geometrię" }));
    await waitFor(() => {
      expect(overlayOptions()[0]).not.toHaveClass("df-region-overlay__shape--error");
      expect(overlayOptions()[1]).toHaveClass("df-region-overlay__shape--error");
    });

    await user.click(screen.getByRole("button", { name: "Zapisz geometrię" }));
    expect(await screen.findByText(/Kod: version_conflict/)).toBeInTheDocument();
    expect(overlayOptions()[1]).toHaveClass("df-region-overlay__shape--error");
  });

  it("loads the exact historical profile after the run resolves", async () => {
    const get = reviewGet();
    const fetchSpy = stubFetch((url) => requireResponse(get(url), url));
    renderApp(["/annotations/run-1"]);

    expect(await screen.findByText("Obraz i bbox")).toBeInTheDocument();
    expect(
      fetchSpy.mock.calls.some(([url]) => url === `/api/v1/profiles/${PROFILE.id}`),
    ).toBe(true);
    expect(fetchSpy.mock.calls.some(([url]) => url === "/api/v1/profiles/current")).toBe(false);
    expect(screen.getAllByRole("option", { name: "health" })).toHaveLength(1);
  });

  it("shows central profile_not_found copy for a missing run profile", async () => {
    const get = reviewGet();
    stubFetch((url) => {
      if (url === `/api/v1/profiles/${PROFILE.id}`) {
        return { body: errorEnvelope("profile_not_found"), status: 404 };
      }
      return requireResponse(get(url), url);
    });
    renderApp(["/annotations/run-1"]);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Nie znaleziono profilu");
    expect(alert).toHaveTextContent("Kod: profile_not_found");
  });

  it("clamps an empty second page after reviewing its last frame", async () => {
    const user = userEvent.setup();
    const firstSummary = frameSummaryFixture({ id: "frame-page-1", frame_index: 1 });
    const lastSummary = frameSummaryFixture({ id: "frame-page-2", frame_index: 13 });
    let reviewed = false;
    const get = reviewGet({
      frame: (frameId) => frameDetailFixture({ frame_index: frameId === "frame-page-2" ? 13 : 1, id: frameId }),
      frames: (url) => {
        if (url.includes("page=2")) {
          return reviewed
            ? framePageFixture({ items: [], page: 2, total: 12 })
            : framePageFixture({ items: [lastSummary], page: 2, total: 13 });
        }
        return framePageFixture({ items: [firstSummary], page: 1, total: reviewed ? 12 : 13 });
      },
    });
    stubFetch((url, init) => {
      if (init?.method === "POST" && url === "/api/v1/frames/frame-page-2/review") {
        reviewed = true;
        return {
          body: frameDetailFixture({ id: "frame-page-2", review_status: "accepted", version: 8 }),
          status: 200,
        };
      }
      return requireResponse(get(url), url);
    });
    renderApp(["/annotations/run-1"]);

    await user.click(await screen.findByRole("button", { name: "Następna" }));
    expect(await screen.findByText("Klatka 13")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Zaakceptuj klatkę" }));

    await waitFor(() => {
      expect(screen.getByText("Strona 1 z 1")).toBeInTheDocument();
      expect(screen.getAllByText("Klatka 1").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("serializes the whole run screen while a write is pending", async () => {
    const user = userEvent.setup();
    const second = frameSummaryFixture({ id: "frame-2", frame_index: 18 });
    const frames = framePageFixture({
      items: [frameSummaryFixture(), second],
      total: 13,
    });
    const get = reviewGet({
      frame: (frameId) => frameDetailFixture({ id: frameId }),
      frames,
    });
    const fetchSpy = stubFetch((url) => requireResponse(get(url), url));
    const original = fetchSpy.getMockImplementation()!;
    let resolveMutation: ((response: Response) => void) | undefined;
    const pending = new Promise<Response>((resolve) => {
      resolveMutation = resolve;
    });
    fetchSpy.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        return pending;
      }
      return original(input, init);
    });
    renderApp(["/annotations/run-1"]);

    await screen.findByText("Obraz i bbox");
    await user.click(screen.getByRole("button", { name: "Klasa 7, 1 anotacji" }));
    const classField = screen.getByLabelText("Klasa");
    await user.clear(classField);
    await user.type(classField, "health");
    const save = screen.getByRole("button", { name: "Zapisz klasę" });
    await user.click(save);

    expect(save).toHaveAttribute("aria-busy", "true");
    for (const filterButton of within(
      screen.getByRole("group", { name: "Filtr statusu klatek" }),
    ).getAllByRole("button")) {
      expect(filterButton).toBeDisabled();
    }
    expect(screen.getByRole("button", { name: "Następna" })).toBeDisabled();
    const openSecond = screen.getByRole("button", { name: "Otwórz" });
    expect(openSecond).toBeDisabled();
    await user.click(openSecond);
    expect(screen.queryByText("Klatka 18", { selector: "p" })).not.toBeInTheDocument();
    expect(fetchSpy.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(1);

    resolveMutation?.(
      new Response(JSON.stringify(annotationFixture({ category_id: "category-2", version: 4 })), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("retries the opaque image request and clears the error after load", async () => {
    const user = userEvent.setup();
    const get = reviewGet();
    stubFetch((url) => requireResponse(get(url), url));
    renderApp(["/annotations/run-1"]);

    const originalImage = await screen.findByRole("img", { name: /Klatka 17 runu run-1/ });
    const originalSurface = screen.getByRole("listbox", { name: "Bbox anotacji na klatce" });
    expect(originalSurface).toHaveAttribute("viewBox", "0 0 1920 1080");
    fireEvent.error(originalImage);
    expect(await screen.findByText(/Kod: frame_image_not_found/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Spróbuj ponownie załadować obraz" }));
    const retryImage = screen.getByRole("img", { name: /Klatka 17 runu run-1/ });
    expect(retryImage).not.toBe(originalImage);
    expect(retryImage).toHaveAttribute("src", "/api/v1/frames/frame-1/image?attempt=1");
    fireEvent.load(retryImage);

    expect(screen.queryByText(/Kod: frame_image_not_found/)).not.toBeInTheDocument();
    expect(screen.getByRole("listbox", { name: "Bbox anotacji na klatce" })).toHaveAttribute(
      "viewBox",
      "0 0 1920 1080",
    );
    expect(screen.getByRole("option", { name: /^7, źródło OCR:/ })).toBeInTheDocument();
  });
});

describe("success refetches authoritative versions", () => {
  it("uses the refetched annotation version when retrying after version_conflict", async () => {
    const user = userEvent.setup();
    const oldAnnotation = annotationFixture({ category_id: "category-1", version: 3 });
    const refetchedAnnotation = annotationFixture({ category_id: "category-1", version: 4 });
    const savedAnnotation = annotationFixture({ category_id: "category-2", version: 5 });
    const frameDtos = [
      frameDetailFixture({ annotations: [oldAnnotation] }),
      frameDetailFixture({ annotations: [refetchedAnnotation] }),
      frameDetailFixture({ annotations: [savedAnnotation] }),
    ];
    let frameRead = 0;
    let patchCount = 0;
    const get = reviewGet({
      frame: () => frameDtos[Math.min(frameRead++, frameDtos.length - 1)]!,
    });
    const fetchSpy = stubFetch((url, init) => {
      if (init?.method === "PATCH") {
        patchCount += 1;
        return patchCount === 1
          ? { body: errorEnvelope("version_conflict"), status: 409 }
          : { body: savedAnnotation, status: 200 };
      }
      return requireResponse(get(url), url);
    });
    renderApp(["/annotations/run-1"]);

    await screen.findByText("Obraz i bbox");
    await user.click(screen.getByRole("button", { name: "Klasa 7, 1 anotacji" }));
    const classField = screen.getByLabelText("Klasa");
    await user.clear(classField);
    await user.type(classField, "health");
    await user.click(screen.getByRole("button", { name: "Zapisz klasę" }));

    const conflict = await screen.findByRole("alert");
    expect(conflict).toHaveTextContent("Kod: version_conflict");
    await waitFor(() => {
      expect(frameRead).toBeGreaterThanOrEqual(2);
      expect(screen.getByLabelText("Klasa")).toBeEnabled();
    });

    await user.clear(screen.getByLabelText("Klasa"));
    await user.type(screen.getByLabelText("Klasa"), "health");
    await user.click(screen.getByRole("button", { name: "Zapisz klasę" }));

    await waitFor(() => {
      const patchBodies = fetchSpy.mock.calls
        .filter(
          ([url, init]) => url === "/api/v1/annotations/ann-1" && init?.method === "PATCH",
        )
        .map(([, init]) => JSON.parse(String(init?.body)) as unknown);
      expect(patchBodies).toEqual([
        { category_id: "category-2", expected_version: 3 },
        { category_id: "category-2", expected_version: 4 },
      ]);
    });
  });

  it("uses annotation.version + 1 from refetch in the next delete", async () => {
    const user = userEvent.setup();
    const oldAnnotation = annotationFixture({ version: 3 });
    const updatedAnnotation = annotationFixture({ category_id: "category-2", version: 4 });
    const frameDtos = [
      frameDetailFixture({ annotations: [oldAnnotation] }),
      frameDetailFixture({ annotations: [updatedAnnotation] }),
      frameDetailFixture({ annotations: [] }),
    ];
    let frameRead = 0;
    const get = reviewGet({
      frame: () => frameDtos[Math.min(frameRead++, frameDtos.length - 1)]!,
    });
    const fetchSpy = stubFetch((url, init) => {
      if (init?.method === "PATCH") {
        return { body: updatedAnnotation, status: 200 };
      }
      if (init?.method === "DELETE") {
        return { status: 204 };
      }
      return requireResponse(get(url), url);
    });
    renderApp(["/annotations/run-1"]);

    await screen.findByText("Obraz i bbox");
    await user.click(screen.getByRole("button", { name: "Klasa 7, 1 anotacji" }));
    const classField = screen.getByLabelText("Klasa");
    await user.clear(classField);
    await user.type(classField, "health");
    const save = screen.getByRole("button", { name: "Zapisz klasę" });
    await user.click(save);
    await waitFor(() => {
      expect(frameRead).toBeGreaterThanOrEqual(2);
      expect(save).not.toHaveAttribute("aria-busy");
    });

    await user.click(screen.getByRole("button", { name: "Klasa health, 1 anotacji" }));
    await user.click(screen.getByRole("button", { name: "Usuń" }));
    await waitFor(() => {
      expect(
        fetchSpy.mock.calls.some(
          ([url, init]) =>
            url === "/api/v1/annotations/ann-1?expected_version=4" &&
            init?.method === "DELETE",
        ),
      ).toBe(true);
    });
  });

  it.each([
    ["Zaakceptuj klatkę", "accept"],
    ["Odrzuć klatkę", "reject"],
  ] as const)(
    "uses frame.version + 1 after create before %s",
    async (decisionButton, decision) => {
      const user = userEvent.setup();
      const created = annotationFixture({
        confidence: null,
        id: "ann-created",
        observation_id: null,
        source: "manual",
        version: 1,
      });
      const oldFrame = frameDetailFixture({ version: 7 });
      const refetchedFrame = frameDetailFixture({
        annotations: [...oldFrame.annotations, created],
        version: 8,
      });
      const decidedFrame = frameDetailFixture({
        ...refetchedFrame,
        review_status: decision === "accept" ? "accepted" : "rejected",
        version: 9,
      });
      const frameDtos = [oldFrame, refetchedFrame, decidedFrame];
      let frameRead = 0;
      const get = reviewGet({
        frame: () => frameDtos[Math.min(frameRead++, frameDtos.length - 1)]!,
      });
      const fetchSpy = stubFetch((url, init) => {
        if (init?.method === "POST" && url.endsWith("/annotations")) {
          return { body: created, status: 201 };
        }
        if (init?.method === "POST" && url.endsWith("/review")) {
          return { body: decidedFrame, status: 200 };
        }
        return requireResponse(get(url), url);
      });
      renderApp(["/annotations/run-1"]);

      await screen.findByText("Obraz i bbox");
      for (const [label, value] of [
        ["Nowy x", "10"],
        ["Nowy y", "20"],
        ["Nowy width", "30"],
        ["Nowy height", "40"],
      ] as const) {
        await user.type(screen.getByLabelText(label), value);
      }
      const create = screen.getByRole("button", { name: "Dodaj bbox z pól" });
      await user.click(create);
      await waitFor(() => {
        expect(frameRead).toBeGreaterThanOrEqual(2);
        expect(create).not.toHaveAttribute("aria-busy");
      });

      await user.click(screen.getByRole("button", { name: decisionButton }));
      await waitFor(() => {
        const call = fetchSpy.mock.calls.find(
          ([url, init]) => url === "/api/v1/frames/frame-1/review" && init?.method === "POST",
        );
        expect(JSON.parse(String(call?.[1]?.body))).toEqual({
          decision,
          expected_version: 8,
        });
      });
    },
  );

  it("uses the rejected filter between reject and reopen with the refetched version", async () => {
    const user = userEvent.setup();
    const pendingFrame = frameDetailFixture({ review_status: "pending", version: 7 });
    const rejectedFrame = frameDetailFixture({ review_status: "rejected", version: 8 });
    const reopenedFrame = frameDetailFixture({ review_status: "pending", version: 9 });
    const frameDtos = [pendingFrame, rejectedFrame, rejectedFrame, reopenedFrame];
    let frameRead = 0;
    let pendingListRead = 0;
    let rejectedListRead = 0;
    const get = reviewGet({
      frame: () => frameDtos[Math.min(frameRead++, frameDtos.length - 1)]!,
      frames: (url) => {
        if (url.includes("review_status=rejected")) {
          if (new URL(url, "http://datasetfactory.test").searchParams.get("page_size") === "1") {
            return framePageFixture({ items: [], page_size: 1, total: 1 });
          }
          rejectedListRead += 1;
          return rejectedListRead === 1
            ? framePageFixture({
                items: [frameSummaryFixture({ review_status: "rejected", version: 8 })],
              })
            : framePageFixture({ items: [], total: 0 });
        }
        if (new URL(url, "http://datasetfactory.test").searchParams.get("page_size") === "1") {
          return framePageFixture({ items: [], page_size: 1, total: 1 });
        }
        pendingListRead += 1;
        return pendingListRead === 1
          ? framePageFixture()
          : framePageFixture({ items: [], total: 0 });
      },
    });
    const fetchSpy = stubFetch((url, init) => {
      if (init?.method === "POST" && url.endsWith("/review")) {
        const body = JSON.parse(String(init.body)) as { decision: string };
        return {
          body: body.decision === "reject" ? rejectedFrame : reopenedFrame,
          status: 200,
        };
      }
      return requireResponse(get(url), url);
    });
    renderApp(["/annotations/run-1"]);

    await user.click(await screen.findByRole("button", { name: "Odrzuć klatkę" }));
    expect(await screen.findByText("Brak klatek dla wybranego filtra")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Odrzucone/ }));
    await user.click(await screen.findByRole("button", { name: "Otwórz ponownie" }));

    await waitFor(() => {
      const decisions = fetchSpy.mock.calls
        .filter(
          ([url, init]) => url === "/api/v1/frames/frame-1/review" && init?.method === "POST",
        )
        .map(([, init]) => JSON.parse(String(init?.body)) as unknown);
      expect(decisions).toEqual([
        { decision: "reject", expected_version: 7 },
        { decision: "reopen", expected_version: 8 },
      ]);
    });
  });
});
