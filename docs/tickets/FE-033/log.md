# FE-033 — Picture preview: start at most 1:1, honest zoom, no page zoom at limits

User request (2026-11-26, comparing the Profile preview with Roboflow on the same video):

- the Profile preview is small on a wide screen while Roboflow shows the frame "just right";
- Ctrl + wheel at the zoom limits zooms the whole browser page when the cursor is over the picture;
- decision: start every picture at most 1:1 (never upscaled), keep zoom on Ctrl + wheel, implement the rest of the proposal.

## Diagnosis

- Profile: the picture field is a fixed `--profile-image-height-md` (479 px) from the 768–1200 Figma frame. A 16:9 frame fitted into it is ~850 px wide whatever the window width.
- `RegionOverlay` `fill` (FE-025) fits the frame into its field with no upper limit, so a small source is upscaled and blurred (Run Setup shows it full width, ~1650 px for a smaller source).
- The zoom label shows the scale relative to the fitted view, so "100%" did not mean 1:1.
- The Ctrl-wheel handler returned before `preventDefault()` when the requested scale was already at a limit (1× or 8×), so the browser's own page zoom ran. A test asserted that behaviour; the user rejected it.

## Scope

1. Ctrl-wheel over the picture is always the picture's gesture: `preventDefault()` before any limit or layout check.
2. `fill` start view = fit the field, but never larger than the source (scale-down). Same rule for `ReferenceImage` (`object-fit: scale-down`).
3. Zoom out below the start view to 50 % in `fill` mode; zoom in stays capped at 8× the start view.
4. The zoom value is the displayed size relative to source pixels (1 image px = 1 CSS px is 100 %) in `fill` mode.
5. Profile from 768 px: the picture field grows with the window height instead of a fixed 479 px (479 px stays the minimum).

Out of scope: zoom with a plain wheel (user: keep Ctrl), Review/Run layout changes beyond the shared component rule.

## Design Plan

Affected UI: Profile picture field (workspace canvas), `RegionOverlay` zoom tools (Zoom out / value / Zoom in / Pan / Reset), `ReferenceImage` in Run Setup and Review, Review frame editor (shared `RegionOverlay` start view).

- [x] Layout / GRID-08, GRID-10: workspace columns unchanged; the Profile field height becomes `max(--profile-image-height-md, available height)` computed only from existing tokens (`--topbar-height`, `--site-padding`, `--control-height-md`, `--element-padding-y-md`, `--element-padding-y-lg`, `--element-gap-lg`, `--border-width-default`). No new spacing values.
- [x] Typography / FONTSIZE-08/09: zoom value keeps its existing style; only its number changes.
- [x] Colours / COLOR-07/08: no new colours; the empty space around a picture smaller than its field is the existing field surface.
- [x] Borders / BORDER-05/06, RADIUS-02/03: unchanged image border and radius.
- [x] Shadows / SHADOW: none added.
- [x] Interaction / OPACITY-02: Zoom out disabled at the 50 % floor, Zoom in at 8×, Pan while the picture is not enlarged, Reset at the start view — all through the existing `Button` disabled state.
- [x] Components: reuse `RegionOverlay`, `ReferenceImage`, `Button`, `Icon`; no new components.

## Work log

- 2026-11-26: diagnosis above; FE-032 (parallel, uncommitted, annotations files) left untouched.
- `RegionOverlay`: `fillLayout` caps the start box at the source size; `MIN_FILL_ZOOM = 0.5` in `fill`; Ctrl-wheel calls `preventDefault()` before the delta, layout and limit checks; the zoom value is `scale × baseWidth / source.width` with a placed `fill` stage. Pre-placement `object-fit` and `ReferenceImage` use `scale-down`.
- Profile ≥ 768 px: `--df-profile-field-height = max(old fixed field, 100dvh − shell chrome)` from existing tokens only.
- Tests: the old "leave Ctrl-wheel to the browser at a limit" test is inverted (user rejected that behaviour); the `fill` test expects source-relative values (21 % for 1920 px in a 400 px field); new test: 1280 × 720 in a 1600 × 900 field starts 1280 × 720 centred at 100 %, zooms out to 50 %, Ctrl-wheel at the floor is prevented.
- `vitest run src/components/common/RegionOverlay`: 116/116 PASS. Full suite in the shared checkout: 1042/1045 — the 3 failures are Review route tests (`routes.test.tsx`) caused by FE-032's uncommitted Review changes; on a clean worktree of HEAD plus only the FE-033 files, `routes`, `profiles`, `materials` and `annotations` suites pass 270/270.
- `npm run build`: PASS (existing advisory about a bundle above 500 kB).
- Browser check (repository Playwright against the running Vite app, read-only; the Traycer browser failed to apply its viewport again): profile source 1920 × 1080. At 1858 × 950 the field is 1458 × 744, the picture 1319 × 742 (was ~850 px wide), and the page fills the window exactly (scroll height = window height); start 69 %, floor 34 %, ceiling 550 %. At 1280 × 800: start 46 %. At 390 × 844: phone field unchanged (279 px), no horizontal overflow. Ctrl-wheel: 28/28 events prevented at every width, including at both limits. No page errors. Screenshots: `profile-1858x950.png`, `profile-390x844.png`.
- 2026-11-26: committed and pushed to `origin/main` on the user's request, FE-033 files only (FE-032 stays uncommitted in the working tree).
