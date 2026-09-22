import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { errorEnvelope, profileFixture, profileSummaryFixture } from "../../test/fixtures";
import { renderApp, stubFetch } from "../../test/harness";

afterEach(() => {
  vi.unstubAllGlobals();
});

function drawRegion(surface: SVGElement): void {
  vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 960,
    height: 540,
    right: 960,
    bottom: 540,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  fireEvent.pointerDown(surface, { clientX: 480, clientY: 54, pointerId: 1 });
  fireEvent.pointerMove(surface, { clientX: 600, clientY: 108, pointerId: 1 });
  fireEvent.pointerUp(surface, { clientX: 600, clientY: 108, pointerId: 1 });
}

describe("profile collection and explicit selection", () => {
  it("shows historical profiles, previews their definition and persists a new selection", async () => {
    const user = userEvent.setup();
    let secondActive = false;
    const first = profileSummaryFixture({ id: "profile-1", name: "Quake Champions" });
    const second = profileSummaryFixture({
      id: "profile-2",
      name: "Doom Eternal",
      active: false,
      created_at: "2026-08-08T09:00:00Z",
    });
    const fetchSpy = stubFetch((url, init) => {
      if (url.endsWith("/profiles/profile-2/activate") && init?.method === "POST") {
        secondActive = true;
        return { status: 200, body: profileFixture({ id: "profile-2", name: "Doom Eternal" }) };
      }
      if (url.endsWith("/profiles")) {
        return {
          status: 200,
          body: [
            { ...second, active: secondActive },
            { ...first, active: !secondActive },
          ],
        };
      }
      if (url.endsWith("/profiles/profile-2")) {
        return { status: 200, body: profileFixture({ id: "profile-2", name: "Doom Eternal" }) };
      }
      if (url.endsWith("/profiles/profile-1")) {
        return { status: 200, body: profileFixture({ name: "Quake Champions" }) };
      }
      return { status: 200, body: {} };
    });

    renderApp(["/profiles"]);

    expect(await screen.findByText("Quake Champions")).toBeInTheDocument();
    expect(screen.getByText("Doom Eternal")).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "Quake Champions" })).toBeInTheDocument();

    const secondRow = screen.getByText("Doom Eternal").closest("li");
    expect(secondRow).not.toBeNull();
    await user.click(within(secondRow as HTMLElement).getByRole("button", { name: "Podgląd" }));
    expect(await screen.findByRole("region", { name: "Doom Eternal" })).toBeInTheDocument();

    await user.click(
      within(secondRow as HTMLElement).getByRole("button", { name: "Ustaw aktywny" }),
    );
    await waitFor(() => {
      expect(within(secondRow as HTMLElement).getByText("Aktywny")).toBeInTheDocument();
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/v1/profiles/profile-2/activate",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("keeps profile creation as an action on the collection screen", async () => {
    const user = userEvent.setup();
    stubFetch((url) => {
      if (url.endsWith("/profiles")) {
        return { status: 200, body: [] };
      }
      // The creation screen offers the reference frame from imported material,
      // so it asks for the material page as soon as it mounts.
      if (url.includes("/materials")) {
        return { status: 200, body: { items: [], page: 1, page_size: 100, total: 0 } };
      }
      return { status: 200, body: {} };
    });

    renderApp(["/profiles"]);
    await user.click(await screen.findByRole("button", { name: "Utwórz pierwszy profil" }));

    expect(screen.getByRole("region", { name: "Obraz referencyjny" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Wróć do profili" })).toBeInTheDocument();
  });

  it("previews a kind change and sends the current profile version when renaming", async () => {
    const user = userEvent.setup();
    let current = profileFixture({
      name: "Quake Champions",
      categories: [{ id: "category-1", name: "7", kind: "character" }],
      version: 1,
    });
    let requestBody: unknown = null;
    stubFetch((url, init) => {
      if (url.endsWith("/profiles")) {
        return { status: 200, body: [profileSummaryFixture({ name: current.name })] };
      }
      if (url.endsWith("/profiles/profile-1/categories/category-1") && init?.method === "PATCH") {
        requestBody = JSON.parse(String(init.body));
        current = {
          ...current,
          version: 2,
          categories: [{ id: "category-1", name: "osiem", kind: "game" }],
        };
        return { status: 200, body: current };
      }
      if (url.endsWith("/profiles/profile-1")) {
        return { status: 200, body: current };
      }
      return { status: 500, body: errorEnvelope("unexpected_request") };
    });

    renderApp(["/profiles"]);
    await user.click(await screen.findByRole("button", { name: "Zmień nazwę klasy 7" }));
    const input = screen.getByRole("textbox", { name: "Nowa nazwa klasy 7" });
    await user.clear(input);
    await user.type(input, "osiem");

    const warning = screen.getByText("Klasa zmieni grupę").closest("div");
    expect(warning).not.toBeNull();
    expect(warning).toHaveTextContent("Liczby");
    expect(warning).toHaveTextContent("Pola HUD (gra)");
    expect(screen.getByText("Ukończone eksporty pozostają niezmienne")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Zapisz nazwę" }));
    await waitFor(() => {
      expect(requestBody).toEqual({ name: "osiem", kind: "game", expected_version: 1 });
    });
    expect(await screen.findByText("osiem")).toBeInTheDocument();
    expect(screen.getByText("Gra")).toBeInTheDocument();
  });

  it("keeps the editor open and explains a backend category-name conflict", async () => {
    const user = userEvent.setup();
    const current = profileFixture({
      categories: [
        { id: "category-1", name: "7", kind: "character" },
        { id: "category-2", name: "health", kind: "game" },
      ],
    });
    stubFetch((url, init) => {
      if (url.endsWith("/profiles")) {
        return { status: 200, body: [profileSummaryFixture({ category_count: 2 })] };
      }
      if (url.endsWith("/profiles/profile-1/categories/category-1") && init?.method === "PATCH") {
        return {
          status: 409,
          body: errorEnvelope("category_name_exists", "Nazwa klasy jest zajęta.", {
            category_id: "category-2",
            category_name: "health",
          }),
        };
      }
      if (url.endsWith("/profiles/profile-1")) {
        return { status: 200, body: current };
      }
      return { status: 500, body: errorEnvelope("unexpected_request") };
    });

    renderApp(["/profiles"]);
    await user.click(await screen.findByRole("button", { name: "Zmień nazwę klasy 7" }));
    const input = screen.getByRole("textbox", { name: "Nowa nazwa klasy 7" });
    await user.clear(input);
    await user.type(input, "HEALTH");
    await user.click(screen.getByRole("button", { name: "Zapisz nazwę" }));

    expect(await screen.findByText(/Klasa „health” już istnieje/)).toBeInTheDocument();
    expect(input).toHaveValue("HEALTH");
  });

  it("shows and collapses the same four class groups, including an in-kind rename warning", async () => {
    const user = userEvent.setup();
    const current = profileFixture({
      categories: [
        { id: "category-game", name: "score", kind: "game" },
        { id: "category-digit", name: "7", kind: "character" },
        { id: "category-letter", name: "B", kind: "character" },
        { id: "category-symbol", name: "-", kind: "character" },
      ],
    });
    stubFetch((url) => {
      if (url.endsWith("/profiles")) {
        return { status: 200, body: [profileSummaryFixture({ category_count: 4 })] };
      }
      if (url.endsWith("/profiles/profile-1")) {
        return { status: 200, body: current };
      }
      return { status: 500, body: errorEnvelope("unexpected_request") };
    });

    renderApp(["/profiles"]);
    for (const label of ["Pola HUD (gra)", "Liczby", "Litery", "Symbole"]) {
      expect(await screen.findByRole("group", { name: label })).toBeInTheDocument();
    }

    await user.click(screen.getByRole("button", { name: "Zwiń grupę Litery" }));
    expect(screen.getByText("B")).not.toBeVisible();

    await user.click(screen.getByRole("button", { name: "Zmień nazwę klasy 7" }));
    const input = screen.getByRole("textbox", { name: "Nowa nazwa klasy 7" });
    await user.clear(input);
    await user.type(input, "A");
    const warning = screen.getByText("Klasa zmieni grupę").closest("div");
    expect(warning).toHaveTextContent("Liczby");
    expect(warning).toHaveTextContent("Litery");
  });

  it("adds a drawn region for future runs and sends the current profile version", async () => {
    const user = userEvent.setup();
    let current = profileFixture({ name: "Quake Champions", version: 4 });
    let requestBody: unknown = null;
    stubFetch((url, init) => {
      if (url.endsWith("/profiles")) {
        return { status: 200, body: [profileSummaryFixture({ name: current.name })] };
      }
      if (url.endsWith("/profiles/profile-1/regions") && init?.method === "POST") {
        requestBody = JSON.parse(String(init.body));
        current = {
          ...current,
          version: 5,
          regions: [
            ...current.regions,
            { id: "region-timer", name: "timer", x: 960, y: 108, width: 240, height: 108 },
          ],
        };
        return { status: 201, body: current };
      }
      if (url.endsWith("/profiles/profile-1")) {
        return { status: 200, body: current };
      }
      return { status: 500, body: errorEnvelope("unexpected_request") };
    });

    renderApp(["/profiles"]);
    await user.click(await screen.findByRole("button", { name: "Dodaj region" }));

    expect(screen.getByText("Nowy region obowiązuje od kolejnego runu")).toBeInTheDocument();
    expect(screen.getByText(/nie tworzy brakujących region_samples/)).toBeInTheDocument();

    const surface = screen.getByRole("listbox", { name: /narysuj nowy region/ });
    drawRegion(surface as unknown as SVGElement);
    await user.type(screen.getByRole("textbox", { name: "Nazwa nowego regionu" }), "timer");
    await user.click(screen.getByRole("button", { name: "Zapisz region" }));

    await waitFor(() => {
      expect(requestBody).toEqual({
        expected_version: 4,
        height: 108,
        name: "timer",
        width: 240,
        x: 960,
        y: 108,
      });
    });
    expect(await screen.findByText("2 zapisanych regionów")).toBeInTheDocument();
  });

  it("keeps the region draft open and names the backend conflict", async () => {
    const user = userEvent.setup();
    const current = profileFixture({ name: "Quake Champions", version: 4 });
    stubFetch((url, init) => {
      if (url.endsWith("/profiles")) {
        return { status: 200, body: [profileSummaryFixture({ name: current.name })] };
      }
      if (url.endsWith("/profiles/profile-1/regions") && init?.method === "POST") {
        return {
          status: 409,
          body: errorEnvelope("region_name_exists", "Nazwa regionu jest zajęta.", {
            region_id: "region-1",
            region_name: "Pasek zdrowia",
          }),
        };
      }
      if (url.endsWith("/profiles/profile-1")) {
        return { status: 200, body: current };
      }
      return { status: 500, body: errorEnvelope("unexpected_request") };
    });

    renderApp(["/profiles"]);
    await user.click(await screen.findByRole("button", { name: "Dodaj region" }));
    drawRegion(
      screen.getByRole("listbox", { name: /narysuj nowy region/ }) as unknown as SVGElement,
    );
    const input = screen.getByRole("textbox", { name: "Nazwa nowego regionu" });
    await user.type(input, "Pasek zdrowia");
    await user.click(screen.getByRole("button", { name: "Zapisz region" }));

    expect(await screen.findByText(/Region „Pasek zdrowia” już istnieje/)).toBeInTheDocument();
    expect(input).toHaveValue("Pasek zdrowia");
    expect(screen.getByText("Nowy region obowiązuje od kolejnego runu")).toBeInTheDocument();
  });
});
