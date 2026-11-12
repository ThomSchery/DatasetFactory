import { configure, fireEvent, getConfig, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { errorEnvelope, profileFixture, profileSummaryFixture } from "../../test/fixtures";
import { renderApp, stubFetch, type StubbedResponse } from "../../test/harness";
import type { GameProfile } from "../../api";
import { createRequestFrom, draftFromProfile, isDirty, saveRequestFrom } from "./profileDraft";

/* The workspace's first render waits on several queries. Under the full parallel
 * suite that can pass Testing Library's 1 s default (FE-022 FIX1/FIX2 gate runs),
 * so waits in this file get 5 s. FE-023 P3-a: that equalled Vitest's 5 s test
 * limit, so one slow wait used up the whole test ("sends a complete explicit
 * OCR pair…" timed out in 2 of 3 review runs). The tests of this file get
 * 15 s (`describe` below), three slow waits' worth. No assertion changes. */
const TEST_TIMEOUT_MS = 15_000;
beforeAll(() => configure({ asyncUtilTimeout: 5000 }));
afterAll(() => configure({ asyncUtilTimeout: 1000 }));

/** FE-022: the open profile is named in the closed Search profile combobox. */
async function expectOpenProfile(name: string) {
  await waitFor(() => {
    expect(screen.getByRole("combobox", { name: "Search profile" })).toHaveValue(name);
  });
}

/*
 * FE-021: the one workspace that opens a saved profile and defines a new one.
 *
 * These are the regressions the ticket names, and each of them is about a way
 * work can be lost rather than about a widget: a late answer landing on the
 * wrong profile, a save that silently drops a region, a conflict that throws
 * away the draft, a switch that discards it without asking.
 *
 * The stub answers what the FastAPI routers answer and decides nothing of its
 * own. Where a test needs the backend's state to move, the test moves it.
 */

const SOURCE = { width: 1920, height: 1080 };

function alpha(): GameProfile {
  return profileFixture({
    id: "profile-alpha",
    name: "Alpha",
    version: 3,
    regions: [
      {
        id: "region-hp",
        name: "Pasek zdrowia",
        x: 10,
        y: 20,
        width: 100,
        height: 40,
        allowed_chars: "7",
        page_segmentation_mode: 7,
      },
    ],
    categories: [
      { id: "category-7", name: "7", kind: "character" },
      { id: "category-hud", name: "health", kind: "game" },
    ],
  });
}

function beta(): GameProfile {
  return profileFixture({
    id: "profile-beta",
    name: "Beta",
    version: 1,
    reference_asset_id: "asset-beta",
    reference_asset_url: "/api/v1/assets/references/asset-beta",
    regions: [
      {
        id: "region-timer",
        name: "Zegar",
        x: 0,
        y: 0,
        width: 50,
        height: 20,
        allowed_chars: "7",
        page_segmentation_mode: 7,
      },
    ],
    categories: [{ id: "category-7b", name: "7", kind: "character" }],
  });
}

interface StubOptions {
  /** `PUT /profiles/{id}/definition`. */
  save?: StubbedResponse;
  /** `POST /profiles`. */
  create?: StubbedResponse;
  /** `POST /profiles/reference-preview`. */
  preview?: StubbedResponse;
  /** Resolves a detail request only once the test lets it. */
  holdDetail?: Record<string, Promise<void>>;
  holdSave?: Promise<void>;
  holdCreate?: Promise<void>;
  holdPreview?: Promise<void>;
  profiles?: GameProfile[];
}

function stubProfiles({ create, holdCreate, holdDetail, holdPreview, holdSave, preview, profiles, save }: StubOptions = {}) {
  const known = profiles ?? [alpha(), beta()];
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const answer = async (): Promise<StubbedResponse> => {
      if (url.includes("/profiles/reference-preview") && method === "POST") {
        await holdPreview;
        return (
          preview ?? {
            status: 201,
            body: { asset_id: "preview-asset", width: SOURCE.width, height: SOURCE.height },
          }
        );
      }
      if (url.endsWith("/definition") && method === "PUT") {
        await holdSave;
        return save ?? { status: 200, body: { ...alpha(), version: 4 } };
      }
      if (url.endsWith("/api/v1/profiles") && method === "POST") {
        await holdCreate;
        return create ?? { status: 201, body: profileFixture({ id: "profile-copy" }) };
      }
      if (url.endsWith("/api/v1/profiles")) {
        return {
          status: 200,
          body: known.map((profile, index) =>
            profileSummaryFixture({
              active: index === 0,
              id: profile.id,
              name: profile.name,
              region_count: profile.regions.length,
            }),
          ),
        };
      }
      const detail = known.find((profile) => url.endsWith(`/profiles/${profile.id}`));
      if (detail !== undefined) {
        await holdDetail?.[detail.id];
        return { status: 200, body: detail };
      }
      return { status: 200, body: null };
    };
    const { status, body } = await answer();
    const payload = body === undefined ? "" : JSON.stringify(body);
    return new Response(payload === "" ? null : payload, {
      status,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

/** Completes the image load so the overlay has a coordinate system. */
async function loadScreenshot(): Promise<HTMLElement> {
  const image = await screen.findByAltText(/screenshot/);
  Object.defineProperty(image, "naturalWidth", { configurable: true, value: SOURCE.width });
  Object.defineProperty(image, "naturalHeight", { configurable: true, value: SOURCE.height });
  fireEvent.load(image);
  return screen.getByRole("listbox", { name: /HUD regions/ });
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

async function chooseProfile(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
): Promise<void> {
  await user.click(await screen.findByLabelText("Search profile"));
  await user.click(await screen.findByRole("option", { name: new RegExp(name) }));
}

function savedBody(spy: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const call = spy.mock.calls.find(
    ([url, init]) => String(url).endsWith("/definition") && init?.method === "PUT",
  );
  return JSON.parse(String(call?.[1]?.body)) as Record<string, unknown>;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the profile workspace", { timeout: TEST_TIMEOUT_MS }, () => {
  it("gives each test room for several slow waits, not just one (FE-023 P3-a)", ({ task }) => {
    // A test that spends one full `asyncUtilTimeout` on a slow first render
    // must still have time for the rest of its steps under the parallel suite.
    expect(task.timeout).toBeGreaterThanOrEqual(getConfig().asyncUtilTimeout * 3);
  });

  it("preserves inherited OCR on edits and copies, and distinguishes an empty whitelist", () => {
    const profile = alpha();
    profile.regions[0].allowed_chars = null;
    profile.regions[0].page_segmentation_mode = null;
    const baseline = draftFromProfile(profile);
    const edited = { ...baseline, regions: baseline.regions.map((region) => ({ ...region, name: "Nowa", x: 15 })) };
    expect(saveRequestFrom(edited).regions[0]).toMatchObject({ name: "Nowa", x: 15, allowed_chars: null, page_segmentation_mode: null });
    expect(createRequestFrom(edited, "Kopia").regions[0]).toMatchObject({ allowed_chars: null, page_segmentation_mode: null });
    expect(createRequestFrom(edited, "Kopia").regions[0]).not.toHaveProperty("id");
    const empty = { ...baseline, regions: baseline.regions.map((region) => ({ ...region, allowed_chars: "" })) };
    expect(isDirty(empty, baseline)).toBe(true);
  });

  it("sends a complete explicit OCR pair after editing an inherited region", async () => {
    const user = userEvent.setup();
    const profile = alpha();
    profile.regions[0].allowed_chars = null;
    profile.regions[0].page_segmentation_mode = null;
    const spy = stubProfiles({ profiles: [profile] });
    renderApp(["/profiles"]);
    await user.click(await screen.findByRole("button", { name: "Select region Pasek zdrowia" }));
    await user.click(screen.getByRole("button", { name: "Expand group OCR settings" }));
    await user.click(screen.getByRole("combobox", { name: "Text layout (PSM)" }));
    await user.click(screen.getByRole("option", { name: /^6 —/ }));
    expect(screen.getByRole("combobox", { name: "Text layout (PSM)" })).toHaveValue("6 — One uniform block of text");
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    await waitFor(() => expect(savedBody(spy)).toMatchObject({ regions: [{ allowed_chars: "7", page_segmentation_mode: 6 }] }));
  });

  it("blocks both saves while an unaccepted sketch exists", async () => {
    const user = userEvent.setup();
    stubProfiles();
    renderApp(["/profiles"]);
    await user.click(await screen.findByRole("button", { name: "Select region Pasek zdrowia" }));
    await user.clear(screen.getByLabelText(/^Region name/));
    await user.type(screen.getByLabelText(/^Region name/), "Zdrowie");
    const surface = await loadScreenshot();
    drawRegion(surface, { xRatio: 0.2, yRatio: 0.2 }, { xRatio: 0.4, yRatio: 0.4 });
    expect(await screen.findByLabelText("Name of the drawn region")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save profile" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save as" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save profile" })).toHaveAttribute("title", "Accept or reject the drawn box first");
  });

  it("discards draft and sketch when reselecting the current profile", async () => {
    const user = userEvent.setup();
    stubProfiles();
    renderApp(["/profiles"]);
    await user.click(await screen.findByRole("button", { name: "Select region Pasek zdrowia" }));
    await user.clear(screen.getByLabelText(/^Region name/));
    await user.type(screen.getByLabelText(/^Region name/), "Zdrowie");
    const surface = await loadScreenshot();
    drawRegion(surface, { xRatio: 0.2, yRatio: 0.2 }, { xRatio: 0.4, yRatio: 0.4 });
    await chooseProfile(user, "Alpha");
    await user.click(await screen.findByRole("button", { name: "Discard changes" }));
    expect(screen.queryByLabelText("Name of the drawn region")).toBeNull();
    expect(within(screen.getByRole("region", { name: "Annotations" })).getByText("Pasek zdrowia")).toBeInTheDocument();
    await chooseProfile(user, "Alpha");
    expect(screen.queryByRole("dialog", { name: "Unsaved changes" })).toBeNull();
  });

  it("opens the active profile with its regions, classes and screenshot", async () => {
    stubProfiles();
    renderApp(["/profiles"]);

    await expectOpenProfile("Alpha");
    const annotations = screen.getByRole("region", { name: "Annotations" });
    expect(within(annotations).getByText("Pasek zdrowia")).toBeInTheDocument();
    const classes = screen.getByRole("region", { name: "Classes" });
    expect(within(classes).getByText("health")).toBeInTheDocument();
    expect(await screen.findByAltText(/Reference screenshot of profile Alpha/)).toBeInTheDocument();
  });

  it("keeps Save profile inactive until the draft says something new", async () => {
    const user = userEvent.setup();
    stubProfiles();
    renderApp(["/profiles"]);

    const save = await screen.findByRole("button", { name: "Save profile" });
    expect(save).toBeDisabled();

    await user.click(await screen.findByRole("button", { name: "Select region Pasek zdrowia" }));
    const name = await screen.findByLabelText(/^Region name/);
    await user.clear(name);
    await user.type(name, "Zdrowie");

    expect(screen.getByRole("button", { name: "Save profile" })).toBeEnabled();
    // The state is not carried by the button alone.
    expect(screen.getByText("Unsaved changes", { selector: "p[role=status]" })).toBeInTheDocument();
    // Figma: Save profile changes colour once the draft differs.
    expect(screen.getByRole("button", { name: "Save profile" })).toHaveClass("df-button--emphasis");
  });

  it("sends every region with the identity it already had", async () => {
    const user = userEvent.setup();
    const spy = stubProfiles();
    renderApp(["/profiles"]);

    await user.click(await screen.findByRole("button", { name: "Select region Pasek zdrowia" }));
    const name = await screen.findByLabelText(/^Region name/);
    await user.clear(name);
    await user.type(name, "Zdrowie");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => {
      expect(savedBody(spy)).toEqual({
        expected_version: 3,
        regions: [
          {
            allowed_chars: "7",
            height: 40,
            id: "region-hp",
            name: "Zdrowie",
            page_segmentation_mode: 7,
            width: 100,
            x: 10,
            y: 20,
          },
        ],
        categories: [
          { id: "category-7", kind: "character", name: "7" },
          { id: "category-hud", kind: "game", name: "health" },
        ],
      });
    });
    // A successful save is also what refreshes the concurrency token.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save profile" })).toBeDisabled();
    });
  });

  it("renames a custom class without changing its durable identifier", async () => {
    const user = userEvent.setup();
    const spy = stubProfiles();
    renderApp(["/profiles"]);
    await user.click(await screen.findByRole("button", { name: "Rename class health" }));
    const field = screen.getByLabelText("New name of class health");
    await user.clear(field);
    await user.type(field, "armour");
    await user.click(screen.getByRole("button", { name: /^Save the new name of class / }));
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    await waitFor(() => expect(savedBody(spy)).toMatchObject({
      categories: expect.arrayContaining([{ id: "category-hud", kind: "game", name: "armour" }]),
    }));
  });

  it("FE-025: renames in the row with icon actions; Enter saves, Escape cancels", async () => {
    const user = userEvent.setup();
    stubProfiles();
    renderApp(["/profiles"]);
    await user.click(await screen.findByRole("button", { name: "Rename class health" }));
    const confirm = screen.getByRole("button", { name: "Save the new name of class health" });
    const cancel = screen.getByRole("button", { name: "Cancel renaming class health" });
    // Icon buttons: the Figma-sized glyph, no text label to overflow the row.
    expect(confirm.textContent).toBe("");
    expect(cancel.textContent).toBe("");
    expect(confirm.querySelector("svg[data-icon]")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
    const field = screen.getByLabelText("New name of class health");
    await user.clear(field);
    await user.type(field, "armour{Escape}");
    expect(screen.getByRole("button", { name: "Rename class health" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Rename class health" }));
    const again = screen.getByLabelText("New name of class health");
    await user.clear(again);
    await user.type(again, "armour{Enter}");
    expect(screen.getByRole("button", { name: "Rename class armour" })).toBeVisible();
  });

  it("keeps a renamed class when the server rejects a duplicate name", async () => {
    const user = userEvent.setup();
    stubProfiles({ save: { status: 409, body: errorEnvelope("category_name_exists") } });
    renderApp(["/profiles"]);
    await user.click(await screen.findByRole("button", { name: "Rename class health" }));
    const field = screen.getByLabelText("New name of class health");
    await user.clear(field);
    await user.type(field, "armour");
    await user.click(screen.getByRole("button", { name: /^Save the new name of class / }));
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.getByRole("button", { name: "Rename class armour" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Save profile" })).toBeEnabled();
  });

  it("allows renaming an OCR class and warns when it changes group", async () => {
    const user = userEvent.setup();
    const profile = alpha();
    profile.regions[0].allowed_chars = null;
    profile.regions[0].page_segmentation_mode = null;
    const spy = stubProfiles({ profiles: [profile] });
    renderApp(["/profiles"]);
    await user.click(await screen.findByRole("button", { name: "Expand group OCR settings" }));
    await user.click(screen.getByRole("button", { name: "Rename class 7" }));
    const field = screen.getByLabelText("New name of class 7");
    await user.clear(field);
    await user.type(field, "score");
    expect(screen.getByText(/Moves the class from/)).toHaveTextContent("Moves the class from Numbers to Custom.");
    await user.click(screen.getByRole("button", { name: /^Save the new name of class / }));
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    await waitFor(() => expect(savedBody(spy)).toMatchObject({
      categories: expect.arrayContaining([{ id: "category-7", kind: "game", name: "score" }]),
    }));
  });

  it("names regions whose explicit OCR whitelist still uses a renamed class", async () => {
    const user = userEvent.setup();
    stubProfiles();
    renderApp(["/profiles"]);
    await user.click(await screen.findByRole("button", { name: "Expand group OCR settings" }));
    await user.click(screen.getByRole("button", { name: "Rename class 7" }));
    const field = screen.getByLabelText("New name of class 7");
    await user.clear(field);
    await user.type(field, "8");
    await user.click(screen.getByRole("button", { name: /^Save the new name of class / }));
    expect(screen.getByRole("alert")).toHaveTextContent("First change the OCR character range of these regions: “Pasek zdrowia”");
  });

  it("names a drawn box, accepts it, and files the name under Custom", async () => {
    const user = userEvent.setup();
    stubProfiles();
    renderApp(["/profiles"]);

    const surface = await loadScreenshot();
    drawRegion(surface, { xRatio: 0.1, yRatio: 0.1 }, { xRatio: 0.3, yRatio: 0.25 });

    const field = await screen.findByLabelText("Name of the drawn region");
    await waitFor(() => {
      expect(field).toHaveFocus();
    });
    await user.clear(field);
    await user.type(field, "Amunicja");
    await user.click(screen.getByRole("button", { name: "Accept" }));

    const annotations = screen.getByRole("region", { name: "Annotations" });
    expect(within(annotations).getByText("Amunicja")).toBeInTheDocument();
    const classes = screen.getByRole("region", { name: "Classes" });
    expect(within(classes).getByText("Amunicja")).toBeInTheDocument();
    expect(within(classes).getByLabelText("OCR text layout")).toBeEnabled();
    expect(screen.queryByLabelText("Name of the drawn region")).toBeNull();
  });

  it("rejects a drawn box without touching the profile", async () => {
    const user = userEvent.setup();
    const spy = stubProfiles();
    renderApp(["/profiles"]);

    const surface = await loadScreenshot();
    drawRegion(surface, { xRatio: 0.1, yRatio: 0.1 }, { xRatio: 0.3, yRatio: 0.25 });
    await screen.findByLabelText("Name of the drawn region");
    await user.click(screen.getByRole("button", { name: "Reject" }));

    expect(screen.queryByLabelText("Name of the drawn region")).toBeNull();
    expect(screen.getByRole("button", { name: "Save profile" })).toBeDisabled();
    expect(
      spy.mock.calls.some(([, init]) => (init?.method ?? "GET") !== "GET"),
    ).toBe(false);
  });

  it("refuses to name two regions the same", async () => {
    const user = userEvent.setup();
    stubProfiles();
    renderApp(["/profiles"]);

    const surface = await loadScreenshot();
    drawRegion(surface, { xRatio: 0.1, yRatio: 0.1 }, { xRatio: 0.3, yRatio: 0.25 });
    const field = await screen.findByLabelText("Name of the drawn region");
    await user.clear(field);
    await user.type(field, "Pasek zdrowia");
    await user.click(screen.getByRole("button", { name: "Accept" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A region with this name already exists",
    );
    expect(screen.getByLabelText("Name of the drawn region")).toBeInTheDocument();
  });

  it("asks before dropping a draft when another profile is chosen", async () => {
    const user = userEvent.setup();
    stubProfiles();
    renderApp(["/profiles"]);

    await user.click(await screen.findByRole("button", { name: "Select region Pasek zdrowia" }));
    const name = await screen.findByLabelText(/^Region name/);
    await user.clear(name);
    await user.type(name, "Zdrowie");

    await chooseProfile(user, "Beta");

    expect(await screen.findByRole("heading", { name: "Unsaved changes" })).toBeVisible();
    // Backing out leaves the draft exactly where it was.
    await user.click(screen.getByRole("button", { name: "Back to the draft" }));
    expect(screen.getByLabelText("Search profile")).toHaveAttribute("placeholder", "Alpha");
    expect(screen.getByLabelText(/^Region name/)).toHaveValue("Zdrowie");

    await chooseProfile(user, "Beta");
    await user.click(await screen.findByRole("button", { name: "Discard changes" }));

    await expectOpenProfile("Beta");
    expect(within(screen.getByRole("region", { name: "Annotations" })).getByText("Zegar")).toBeInTheDocument();
  });

  it("blocks route navigation until the operator discards the draft", async () => {
    const user = userEvent.setup();
    stubProfiles();
    const { router } = renderApp(["/profiles"]);
    await user.click(await screen.findByRole("button", { name: "Select region Pasek zdrowia" }));
    await user.clear(screen.getByLabelText(/^Region name/));
    await user.type(screen.getByLabelText(/^Region name/), "Zdrowie");
    await user.click(screen.getByRole("link", { name: "Run" }));
    expect(await screen.findByRole("dialog", { name: "Unsaved changes" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Back to the draft" }));
    expect(router.state.location.pathname).toBe("/profiles");
    expect(screen.getByLabelText(/^Region name/)).toHaveValue("Zdrowie");
    await user.click(screen.getByRole("link", { name: "Run" }));
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/run"));
  });

  it("prevents a pending save from replacing work in another context", async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    stubProfiles({ holdSave: held });
    const { router } = renderApp(["/profiles"]);
    await user.click(await screen.findByRole("button", { name: "Select region Pasek zdrowia" }));
    await user.clear(screen.getByLabelText(/^Region name/));
    await user.type(screen.getByLabelText(/^Region name/), "Zdrowie");
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    expect(screen.getByLabelText("Search profile")).toBeDisabled();
    await user.click(screen.getByRole("link", { name: "Run" }));
    expect(await screen.findByRole("dialog", { name: "Unsaved changes" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Discard changes" })).toBeDisabled();
    expect(router.state.location.pathname).toBe("/profiles");
    release();
    await waitFor(() => expect(screen.getByRole("button", { name: "Discard changes" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/run"));
  });

  it("blocks leaving while a Save as request is pending", async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    stubProfiles({ holdCreate: held });
    const { router } = renderApp(["/profiles"]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Save as" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Save as" }));
    await user.click(screen.getByRole("button", { name: "Save as new profile" }));
    expect(screen.getByRole("button", { name: "Creating the profile…" })).toBeDisabled();
    const dialog = screen.getByRole("dialog", { name: "Save as" });
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    expect(dialog).toBeVisible();
    expect(router.state.location.pathname).toBe("/profiles");
    release();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Save as" })).toBeNull());
  });

  it("blocks navigation while a reference preview request is pending", async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    stubProfiles({ holdPreview: held });
    const { router } = renderApp(["/profiles/new"]);
    await user.click(await screen.findByRole("button", { name: "Enter path" }));
    await user.type(screen.getByLabelText("Screenshot path"), "D:\\hud.png");
    await user.click(screen.getByRole("button", { name: "Open" }));
    await user.click(screen.getByRole("link", { name: "Run" }));
    expect(await screen.findByRole("dialog", { name: "Unsaved changes" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Discard changes" })).toBeDisabled();
    expect(router.state.location.pathname).toBe("/profiles/new");
    release();
    await waitFor(() => expect(screen.getByRole("button", { name: "Discard changes" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Back to the draft" }));
    expect(await screen.findByAltText(/Screenshot of the new profile/)).toBeInTheDocument();
  });

  it("does not let a late answer for one profile land on another", async () => {
    const user = userEvent.setup();
    let releaseAlpha!: () => void;
    const alphaHeld = new Promise<void>((resolve) => {
      releaseAlpha = resolve;
    });
    stubProfiles({ holdDetail: { "profile-alpha": alphaHeld } });
    renderApp(["/profiles"]);

    // Alpha is the active profile and is still in flight; switch to Beta.
    await chooseProfile(user, "Beta");
    await expectOpenProfile("Beta");

    releaseAlpha();

    // Beta stays open, with Beta's regions, and no Alpha region appears.
    await waitFor(() => {
      expect(within(screen.getByRole("region", { name: "Annotations" })).getByText("Zegar")).toBeInTheDocument();
    });
    expect(screen.queryByText("Pasek zdrowia")).toBeNull();
    expect(screen.getByLabelText("Search profile")).toHaveAttribute("placeholder", "Beta");
  });

  it("does not allow editing the previous draft while the selected profile loads", async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    stubProfiles({ holdDetail: { "profile-beta": held } });
    renderApp(["/profiles"]);
    await expectOpenProfile("Alpha");
    await chooseProfile(user, "Beta");
    expect(screen.getByRole("button", { name: "Select region Pasek zdrowia" })).toBeDisabled();
    release();
    await expectOpenProfile("Beta");
  });

  it("keeps the draft when the backend reports a version conflict", async () => {
    const user = userEvent.setup();
    stubProfiles({
      save: { status: 409, body: errorEnvelope("version_conflict") },
    });
    renderApp(["/profiles"]);

    await user.click(await screen.findByRole("button", { name: "Select region Pasek zdrowia" }));
    const name = await screen.findByLabelText(/^Region name/);
    await user.clear(name);
    await user.type(name, "Zdrowie");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("The profile changed in another tab");
    expect(screen.getByLabelText(/^Region name/)).toHaveValue("Zdrowie");
    expect(screen.getByRole("button", { name: "Save profile" })).toBeEnabled();
  });

  it("names the classes a save cannot drop and points at Save as", async () => {
    const user = userEvent.setup();
    stubProfiles({
      save: {
        status: 409,
        body: errorEnvelope("category_in_use", "Operacja odrzucona.", {
          categories: [{ id: "category-hud", name: "health" }],
        }),
      },
    });
    renderApp(["/profiles"]);

    const classes = await screen.findByRole("region", { name: "Classes" });
    await user.click(await within(classes).findByRole("button", { name: "Remove class health from the profile" }));
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    const notice = await screen.findByText(/Saved annotations use these classes/);
    expect(notice).toHaveTextContent("health");
    expect(notice).toHaveTextContent("Save as");
    // The draft survives the refusal, so Save as has something to save.
    expect(within(classes).queryByText("health")).toBeNull();
  });

  it("copies the draft into a new profile without inheriting its identifiers", async () => {
    const user = userEvent.setup();
    const spy = stubProfiles({
      create: { status: 201, body: profileFixture({ id: "profile-copy", name: "Alpha kopia" }) },
    });
    renderApp(["/profiles"]);

    await waitFor(() => expect(screen.getByRole("button", { name: "Save as" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Save as" }));
    const name = await screen.findByLabelText("New profile name");
    await user.clear(name);
    await user.type(name, "Alpha kopia");
    await user.click(screen.getByRole("button", { name: "Save as new profile" }));

    await waitFor(() => {
      const call = spy.mock.calls.find(
        ([url, init]) => String(url).endsWith("/api/v1/profiles") && init?.method === "POST",
      );
      expect(call).toBeDefined();
      const body = JSON.parse(String(call?.[1]?.body)) as Record<string, unknown>;
      expect(body.name).toBe("Alpha kopia");
      expect(body.reference_asset_id).toBe("asset-1");
      expect(JSON.stringify(body)).not.toContain("region-hp");
      expect(JSON.stringify(body)).not.toContain("category-hud\"");
    });
  });

  it("refuses a Save as name the project already uses, before any request", async () => {
    const user = userEvent.setup();
    const spy = stubProfiles();
    renderApp(["/profiles"]);

    await waitFor(() => expect(screen.getByRole("button", { name: "Save as" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Save as" }));
    const name = await screen.findByLabelText("New profile name");
    await user.clear(name);
    await user.type(name, "  beta ");
    await user.click(screen.getByRole("button", { name: "Save as new profile" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("A profile with this name already exists");
    expect(
      spy.mock.calls.some(
        ([url, init]) => String(url).endsWith("/api/v1/profiles") && init?.method === "POST",
      ),
    ).toBe(false);
  });

  it("starts a blank draft with the base character groups and an empty Custom", async () => {
    stubProfiles();
    renderApp(["/profiles/new"]);

    expect(await screen.findByRole("button", { name: "Add screenshot (JPG/PNG)" })).toBeInTheDocument();
    const classes = screen.getByRole("region", { name: "Classes" });
    expect(within(classes).getByText("Name a drawn box to add a class here.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save profile" })).toBeDisabled();
  });

  it("keeps an invalid image path for correction when preview fails", async () => {
    const user = userEvent.setup();
    stubProfiles({ preview: { status: 404, body: errorEnvelope("source_missing") } });
    renderApp(["/profiles/new"]);
    await user.click(await screen.findByRole("button", { name: "Enter path" }));
    const path = screen.getByLabelText("Screenshot path");
    await user.type(path, "D:\\missing.png");
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(path).toHaveValue("D:\\missing.png");
    expect(screen.getByRole("button", { name: "Add screenshot (JPG/PNG)" })).toBeVisible();
  });
});
