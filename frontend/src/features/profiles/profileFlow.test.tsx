import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { errorEnvelope, profileFixture } from "../../test/fixtures";
import { renderApp, stubFetch, type StubbedResponse } from "../../test/harness";

/*
 * CF-01 through the shipped route table. The stubbed client answers exactly
 * what the FastAPI routers answer and decides nothing on its own — a fake that
 * reimplemented a backend rule would be testing itself (Gate 3).
 */

const SOURCE = { width: 1920, height: 1080 };

interface StubOptions {
  /** What `POST /profiles/reference-preview` answers. */
  preview?: StubbedResponse;
  /** What `POST /profiles` answers. */
  create?: StubbedResponse;
}

function stubProfileApi({ create, preview }: StubOptions = {}) {
  return stubFetch((url, init) => {
    if (url.includes("/profiles/reference-preview") && init?.method === "POST") {
      return preview ?? {
        status: 201,
        body: { asset_id: "preview-asset-1", width: SOURCE.width, height: SOURCE.height },
      };
    }
    if (url.endsWith("/profiles") && init?.method === "POST") {
      return create ?? { status: 201, body: profileFixture() };
    }
    if (url.includes("/materials")) {
      return { status: 200, body: { items: [], page: 1, page_size: 100, total: 0 } };
    }
    return { status: 200, body: null };
  });
}

/** Completes the reference image load with the natural dimensions it decodes. */
async function loadReferenceImage(): Promise<HTMLElement> {
  const image = await screen.findByAltText(/Obraz referencyjny profilu/);
  Object.defineProperty(image, "naturalWidth", { configurable: true, value: SOURCE.width });
  Object.defineProperty(image, "naturalHeight", { configurable: true, value: SOURCE.height });
  fireEvent.load(image);
  return screen.getByRole("listbox", { name: /Regiony HUD/ });
}

async function requestPreview(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  const path = screen.getByLabelText("Ścieżka obrazu referencyjnego");
  if (!String((path as HTMLInputElement).value)) {
    await user.type(path, "D:\\gry\\hud.png");
  }
  await user.click(screen.getByRole("button", { name: "Wczytaj podgląd" }));
  return loadReferenceImage();
}

/** Lays the surface out at `width` CSS px and drags a rectangle across it. */
function drawRegion(
  surface: HTMLElement,
  from: { xRatio: number; yRatio: number },
  to: { xRatio: number; yRatio: number },
  width = 960,
): void {
  const height = (width * SOURCE.height) / SOURCE.width;
  vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width,
    height,
    right: width,
    bottom: height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);

  const at = (ratios: { xRatio: number; yRatio: number }) => ({
    clientX: width * ratios.xRatio,
    clientY: height * ratios.yRatio,
  });
  fireEvent.pointerDown(surface, { ...at(from), pointerId: 1 });
  fireEvent.pointerMove(surface, { ...at(to), pointerId: 1 });
  fireEvent.pointerUp(surface, { ...at(to), pointerId: 1 });
}

function requestBodies(
  spy: ReturnType<typeof stubFetch>,
  endpoint: "/profiles" | "/profiles/reference-preview",
): unknown[] {
  return spy.mock.calls
    .filter(([input, init]) => {
      const url = String(input);
      return init?.method === "POST" &&
        (endpoint === "/profiles" ? url.endsWith(endpoint) : url.includes(endpoint));
    })
    .map(([, init]) => JSON.parse(String(init?.body)));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the reference image view has every state", () => {
  it("starts empty with an instruction for staging the image", () => {
    stubProfileApi();
    renderApp(["/profiles/new"]);

    expect(
      screen.getByRole("region", { name: "Wczytaj obraz do rysowania" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("surfaces a failed preview through the central error dictionary", async () => {
    const user = userEvent.setup();
    stubProfileApi({
      preview: { status: 404, body: errorEnvelope("source_missing") },
    });
    renderApp(["/profiles/new"]);

    await user.type(screen.getByLabelText("Ścieżka obrazu referencyjnego"), "D:\\missing.png");
    await user.click(screen.getByRole("button", { name: "Wczytaj podgląd" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Plik źródłowy nie istnieje pod zapisaną ścieżką.",
    );
  });

  it("disables the preview control and shows its spinner while staging", async () => {
    const user = userEvent.setup();
    let answerPreview: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        new Promise<Response>((resolve) => {
          answerPreview = resolve;
        }),
      ),
    );
    renderApp(["/profiles/new"]);

    await user.type(screen.getByLabelText("Ścieżka obrazu referencyjnego"), "D:\\gry\\hud.png");
    await user.click(screen.getByRole("button", { name: "Wczytaj podgląd" }));

    const pending = await screen.findByRole("button", { name: "Wczytywanie podglądu…" });
    expect(pending).toBeDisabled();
    expect(pending).toHaveAttribute("aria-busy", "true");

    answerPreview?.(
      new Response(
        JSON.stringify({
          asset_id: "preview-asset-1",
          width: SOURCE.width,
          height: SOURCE.height,
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );
    expect(await screen.findByAltText(/Obraz referencyjny profilu/)).toBeInTheDocument();
  });

  it("draws the surface from the natural dimensions once the image decodes", async () => {
    const user = userEvent.setup();
    stubProfileApi();
    renderApp(["/profiles/new"]);

    const surface = await requestPreview(user);

    expect(surface).toHaveAttribute("viewBox", "0 0 1920 1080");
  });

  it("loads the picture through the opaque asset endpoint, never a file path", async () => {
    const user = userEvent.setup();
    stubProfileApi();
    renderApp(["/profiles/new"]);

    await user.type(screen.getByLabelText("Ścieżka obrazu referencyjnego"), "D:\\gry\\hud.png");
    await user.click(screen.getByRole("button", { name: "Wczytaj podgląd" }));
    const image = await screen.findByAltText(/Obraz referencyjny profilu/);

    expect(image).toHaveAttribute("src", "/api/v1/assets/references/preview-asset-1");
  });
});

describe("creating a profile", () => {
  it("sends the regions in source coordinates and moves on to material import", async () => {
    const user = userEvent.setup();
    const fetchSpy = stubProfileApi();
    renderApp(["/profiles/new"]);

    await user.type(screen.getByLabelText("Nazwa profilu"), "Gra testowa");
    await user.type(
      screen.getByLabelText("Ścieżka obrazu referencyjnego"),
      "D:\\gry\\hud.png",
    );

    await user.click(screen.getByRole("button", { name: "Wczytaj podgląd" }));
    const surface = await loadReferenceImage();
    drawRegion(surface, { xRatio: 0.25, yRatio: 0.25 }, { xRatio: 0.75, yRatio: 0.5 });

    await user.click(screen.getByRole("button", { name: "7" }));
    await user.type(screen.getByLabelText("Klasa specyficzna dla gry"), "nazwa mapy");
    await user.click(screen.getByRole("button", { name: "Dodaj klasę" }));

    await user.click(screen.getByRole("button", { name: "Utwórz profil" }));

    await waitFor(() => {
      expect(requestBodies(fetchSpy, "/profiles")).toHaveLength(1);
    });
    expect(requestBodies(fetchSpy, "/profiles/reference-preview")).toEqual([
      { reference_image_path: "D:\\gry\\hud.png" },
    ]);
    expect(requestBodies(fetchSpy, "/profiles")[0]).toEqual({
      name: "Gra testowa",
      reference_image_path: "D:\\gry\\hud.png",
      regions: [{ name: "Region 1", x: 480, y: 270, width: 960, height: 270 }],
      categories: [
        { kind: "character", name: "7" },
        { kind: "game", name: "nazwa mapy" },
      ],
    });

    // CF-01.6 — a saved profile leads straight to importing material. The
    // heading element is always present, so this waits on its content rather
    // than on its existence.
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Materiały");
    });
  });

  it("blocks the request until the form itself is valid", async () => {
    const user = userEvent.setup();
    const fetchSpy = stubProfileApi();
    renderApp(["/profiles/new"]);

    await user.click(screen.getByRole("button", { name: "Utwórz profil" }));

    expect(await screen.findByText("Podaj nazwę profilu.")).toBeInTheDocument();
    expect(screen.getByText("Podaj ścieżkę do obrazu referencyjnego.")).toBeInTheDocument();
    expect(
      screen.getByText("Zaznacz przynajmniej jeden region HUD na obrazie."),
    ).toBeInTheDocument();
    expect(screen.getByText("Dodaj przynajmniej jedną klasę.")).toBeInTheDocument();
    expect(requestBodies(fetchSpy, "/profiles/reference-preview")).toHaveLength(0);
    expect(requestBodies(fetchSpy, "/profiles")).toHaveLength(0);
  });

  it("rejects a relative path before it leaves the browser", async () => {
    const user = userEvent.setup();
    const fetchSpy = stubProfileApi();
    renderApp(["/profiles/new"]);

    await user.type(screen.getByLabelText("Nazwa profilu"), "Gra");
    await user.type(screen.getByLabelText("Ścieżka obrazu referencyjnego"), "gry\\hud.png");
    await user.click(screen.getByRole("button", { name: "Wczytaj podgląd" }));

    expect(await screen.findByText(/Ścieżka musi być bezwzględna/)).toBeInTheDocument();
    expect(requestBodies(fetchSpy, "/profiles/reference-preview")).toHaveLength(0);
    expect(requestBodies(fetchSpy, "/profiles")).toHaveLength(0);
  });

  it("disables its control and shows a spinner while the mutation is in flight", async () => {
    const user = userEvent.setup();
    // The write is held open on purpose: the pending state is the thing under
    // test, and a stub that answers instantly never has one.
    let answerCreate: ((response: Response) => void) | undefined;
    const json = (body: unknown, status: number) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).includes("/profiles/reference-preview")) {
          return Promise.resolve(
            json({ asset_id: "preview-asset-1", width: SOURCE.width, height: SOURCE.height }, 201),
          );
        }
        if (String(input).endsWith("/profiles") && init?.method === "POST") {
          return new Promise<Response>((resolve) => {
            answerCreate = resolve;
          });
        }
        return Promise.resolve(json(null, 200));
      }),
    );
    renderApp(["/profiles/new"]);

    await user.type(screen.getByLabelText("Nazwa profilu"), "Gra testowa");
    await user.type(screen.getByLabelText("Ścieżka obrazu referencyjnego"), "D:\\gry\\hud.png");
    await user.click(screen.getByRole("button", { name: "Wczytaj podgląd" }));
    const surface = await loadReferenceImage();
    drawRegion(surface, { xRatio: 0.1, yRatio: 0.1 }, { xRatio: 0.4, yRatio: 0.4 });
    await user.click(screen.getByRole("button", { name: "7" }));

    const submit = screen.getByRole("button", { name: "Utwórz profil" });
    await user.click(submit);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Zapisywanie profilu…" })).toHaveAttribute(
        "aria-busy",
        "true",
      );
    });
    expect(screen.getByRole("button", { name: "Zapisywanie profilu…" })).toBeDisabled();

    // Settling with a rejection keeps the screen mounted, so the control is
    // observably released rather than unmounted by a navigation.
    answerCreate?.(json(errorEnvelope("profile_name_exists"), 409));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Profil o tej nazwie już istnieje.",
    );
    expect(screen.getByRole("button", { name: "Utwórz profil" })).toBeEnabled();
  });
});

/*
 * Backend verdicts reach the screen exactly as the backend classified them,
 * through the central dictionary. Neither of these is folded into a generic
 * "profile could not be created": they name different repairs.
 */
describe("backend rejections", () => {
  async function submitAgainst(create: StubbedResponse) {
    const user = userEvent.setup();
    stubProfileApi({ create });
    renderApp(["/profiles/new"]);

    await user.type(screen.getByLabelText("Nazwa profilu"), "Gra testowa");
    await user.type(screen.getByLabelText("Ścieżka obrazu referencyjnego"), "D:\\gry\\hud.png");
    await user.click(screen.getByRole("button", { name: "Wczytaj podgląd" }));
    const surface = await loadReferenceImage();
    drawRegion(surface, { xRatio: 0.1, yRatio: 0.1 }, { xRatio: 0.4, yRatio: 0.4 });
    await user.click(screen.getByRole("button", { name: "7" }));
    await user.click(screen.getByRole("button", { name: "Utwórz profil" }));
  }

  it("renders 409 profile_name_exists as a message naming the repair", async () => {
    await submitAgainst({ status: 409, body: errorEnvelope("profile_name_exists") });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Profil o tej nazwie już istnieje.");
    expect(alert).toHaveTextContent("Podaj inną nazwę profilu.");
    expect(screen.getByText("profile_name_exists")).toBeInTheDocument();
    // Still on the profile screen: nothing was created, so nothing moves on.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Nowy profil gry");
  });

  it("renders 404 source_missing as a message naming the repair", async () => {
    await submitAgainst({ status: 404, body: errorEnvelope("source_missing") });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Plik źródłowy nie istnieje pod zapisaną ścieżką.");
    expect(alert).toHaveTextContent(/Przywróć plik w tym samym miejscu/);
    expect(screen.getByText("source_missing")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Nowy profil gry");
  });

  it("renders region_out_of_bounds without reinterpreting it", async () => {
    await submitAgainst({ status: 400, body: errorEnvelope("region_out_of_bounds") });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Region wykracza poza obraz referencyjny.");
    expect(screen.getByText("region_out_of_bounds")).toBeInTheDocument();
  });
});

describe("regions are reachable without precise clicking", () => {
  it("selects and removes a region from the list alone", async () => {
    const user = userEvent.setup();
    stubProfileApi();
    renderApp(["/profiles/new"]);

    const surface = await requestPreview(user);
    drawRegion(surface, { xRatio: 0.1, yRatio: 0.1 }, { xRatio: 0.4, yRatio: 0.4 });

    expect(screen.getByText("x 192, y 108, 576 × 324 px")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Zaznacz region Region 1" }));
    expect(screen.getByRole("option", { name: /Region 1/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await user.click(screen.getByRole("button", { name: "Usuń region Region 1" }));

    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Nie ma jeszcze żadnego regionu" }),
    ).toBeInTheDocument();
  });

  it("renames the selected region and keeps its geometry", async () => {
    const user = userEvent.setup();
    const fetchSpy = stubProfileApi();
    renderApp(["/profiles/new"]);

    await user.type(screen.getByLabelText("Nazwa profilu"), "Gra testowa");
    await user.type(screen.getByLabelText("Ścieżka obrazu referencyjnego"), "D:\\gry\\hud.png");
    await user.click(screen.getByRole("button", { name: "Wczytaj podgląd" }));
    const surface = await loadReferenceImage();
    drawRegion(surface, { xRatio: 0.1, yRatio: 0.1 }, { xRatio: 0.4, yRatio: 0.4 });

    const nameField = screen.getByLabelText(/Nazwa zaznaczonego regionu/);
    await user.clear(nameField);
    await user.type(nameField, "Pasek zdrowia");

    await user.click(screen.getByRole("button", { name: "7" }));
    await user.click(screen.getByRole("button", { name: "Utwórz profil" }));

    await waitFor(() => {
      expect(requestBodies(fetchSpy, "/profiles")).toHaveLength(1);
    });
    expect(requestBodies(fetchSpy, "/profiles")[0]).toMatchObject({
      regions: [{ name: "Pasek zdrowia", x: 192, y: 108, width: 576, height: 324 }],
    });
  });
});
