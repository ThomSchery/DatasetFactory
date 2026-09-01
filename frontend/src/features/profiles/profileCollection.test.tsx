import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { profileFixture, profileSummaryFixture } from "../../test/fixtures";
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
      return { status: 200, body: {} };
    });

    renderApp(["/profiles"]);
    await user.click(await screen.findByRole("button", { name: "Utwórz pierwszy profil" }));

    expect(screen.getByRole("region", { name: "Obraz referencyjny" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Wróć do profili" })).toBeInTheDocument();
  });
});
