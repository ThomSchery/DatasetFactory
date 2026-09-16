import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { errorEnvelope, profileFixture, profileSummaryFixture } from "../../test/fixtures";
import { renderApp, stubFetch } from "../../test/harness";

afterEach(() => {
  vi.unstubAllGlobals();
});

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
    expect(warning).toHaveTextContent("Znaki (OCR)");
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
});
