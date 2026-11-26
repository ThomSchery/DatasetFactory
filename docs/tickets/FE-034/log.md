# FE-034 — Run Setup picture preview unified with Profile

User request (2026-11-26, after FE-033): "Profiles already looks as it should, but Run must be unified with how it is in Profiles."

## Diagnosis

Run Setup shows the profile screenshot through `ReferenceImage` in a box of fixed proportions (`aspect-ratio: 947 / 521`) across the whole column. At 1858 × 950 the box is 1534 × 844 and the page scrolls (984 px). Unlike Profile it has no panel around the picture, no zoom tools, no source-relative scale and no region boxes.

## Scope

1. The picture field height is one shared token, `--workspace-image-field-height` (FE-033 formula: the Figma field as a minimum, otherwise the window height minus the shell chrome). Profile and Run Setup both use it.
2. Run Setup from 768 px: the preview is the same panel as the Profile canvas (padding, border, radius, surface) and the field fills the window height; below 768 px the same phone field as Profile.
3. The picture is a read-only `RegionOverlay` with `fill`: start at most 1:1, the same zoom tools (Ctrl-wheel, buttons, source-relative %), and the selected profile's regions drawn with their names, as on Profile. No drawing, no removal, no selection callbacks.
4. A failed image keeps the existing `FatalError` with retry.

Out of scope: moving the Run button (it stays at the foot of the Run Setup column), changes to Review.

## Design Plan

Affected UI: Run Setup preview panel, its placeholder states (choose a profile, loading, error), the zoom tool row under the picture.

- [x] Layout / GRID-08, GRID-10: columns unchanged (205 px column + preview); the preview panel reuses the Profile canvas paddings `--element-padding-y-lg` / `--element-padding-x-lg`; the field height is the shared token built only from existing tokens.
- [x] Typography / FONTSIZE-08/09, LHEIGHT-09/10: placeholder text unchanged (`--font-size-xs`); zoom value as in `RegionOverlay`.
- [x] Colours / COLOR-07/08: panel `--color-surface-neutral-default`, stroke `--color-stroke-panel-default` — the Profile canvas values.
- [x] Borders / BORDER-05/06, RADIUS-02/03: `--border-width-default`, `--radius-sm` as the Profile canvas.
- [x] Shadows / SHADOW: none.
- [x] Interaction / OPACITY-02: zoom buttons disable through `Button`; region boxes are read-only (no `onDraw`, `onRemove`, `onShapeChange`).
- [x] Components: reuse `RegionOverlay`, `FatalError`, `InlineError`, `Loading`; no new components.

## Work log

- 2026-11-26: measured the current screen (1858 × 950: preview 1534 × 844, page height 984).
- `tokens.css`: `--workspace-image-field-height` (moved from the FE-033 local variable in `ProfileWorkspaceScreen.css`). Run Setup: preview `<section aria-label="Reference screenshot">` with the Profile canvas chrome from 768 px, read-only `RegionOverlay` (`fill`, profile regions, API source size), `FatalError` with retry on a failed image; `aspect-ratio` rules removed.
- New test (`materialsFlow`): Run Setup shows the profile's regions as a listbox, the Canvas view tools, and no drawing.
- `tsc --noEmit` PASS; `npm run build` PASS (existing >500 kB advisory). Full suite 1043/1046 — the same 3 Review route failures from FE-032's uncommitted work as in FE-033; materials 16/16.
- Browser (repository Playwright via Edge, read-only): Run Setup at 1858 × 950 — panel 1534 × 810, picture 1330 × 748, 69 %, page fits the window (950); 1280 × 800 — 48 %, fits (800); 390 × 844 — 279 px phone field like Profile. Profile unchanged by the token move (1319 × 742, 69 %, fits). No page errors. Screenshots: `run-1858x950.png`, `run-390x844.png`.
- 2026-11-26: committed and pushed to `origin/main` on the user's request, FE-034 files only (FE-032 stays uncommitted in the working tree).
