# FE-037 - full-window DatasetFactory handoff

Approved: implement datasetfactory-handoff/agent-brief/index.md and screens
canvas. User clarification: OCR rule changes apply only to the individual run,
never to the saved profile. This explicitly authorises the additive run request
field; reuse persisted region snapshots, no schema migration/new profile writes.

Design plan before code:
- [x] GRID-01..14 / SPACING-01..13: shell at 0,0/full width/min-height100dvh;
  bar40, rail44/52; separate content container with24px margin and caps
  549/732/960/1164/1368. Preserve768/769 stacking and24px workspace gutter.
- [x] COLOR-01..10 / BORDER-01..09 / RADIUS-01..05: retain approved graphite/amber
  tokens; remove shell border/radius at source. Retain panel/control outlines.
- [x] TYPO-02..11 / FONTSIZE-02..10 / LHEIGHT-01..06: existing type tokens;
  dynamic counts, source metadata, sketch hint and counts. No demo literals.
- [x] OVERLAY-01..07 / SHADOW-01..05 / COLOR-07: preserve focus, disabled,
  dialogs, loading/errors and all toolbar actions. No viewport clipping.
- [x] Components: reuse AppShell/SideNav/NavItem/Icon, GroupedOptionList,
  TextField, Button, Panel, RegionOverlay, DataList, UiStates, Dialog.
- [x] UI inventory: Upload tile/path; Setup profile, name/Enter hint,
  Accept/Reject, filter/Select all/count/list, save; Run source/profile/engines,
  same-rule choice/per-region layout tiles/count, sampling/presets/action,
  active run, preview/zoom/pan/reset; Annotations explanation/list/actions.

Backend: optional region_text_layouts map on POST /runs. Validate keys against
creation context and values against existing layouts; derive provenance and
freeze overrides in existing ocr_regions snapshot. Defaults remain compatible;
retry profile version checks remain intact; neither profiles nor other runs
are updated. Include tests for independent runs, unchanged profile, invalid
keys/layouts and actual worker consumption.

Verification: build/frontend tests, backend workflow/API tests,36 populated
screen-width combinations plus wide cap measurement, interactions and review.

Verification results (2026-11-27, after the session handoff):
- Fixed three defects found by the checks: the invalid-layout backend test
  expected 422 although validation errors map to 400 (now asserts the error
  code); `getByRole(..., { exact })` does not exist; the new region list had
  dropped the FE-029 character count, now restored as the row detail `(N)`.
- `npm run build` passes; frontend suite 1048 tests, the one failure (FE-029
  count) fixed and its files re-run green. Backend suite 674 passed (run
  alone: two pytest processes share `tmp/pytest` and break each other).
- Playwright against the live dev server, 12 widths (375-1920) x 4 screens:
  shell at 0,0 and full viewport width everywhere, content margin 24 px, caps
  respected (1368 px at 1920), no horizontal overflow, no page errors.
- Not updated: e2e visual-QA specs FE-016/019/021/022/025 still click the
  removed "Select region ..." buttons and assert the former Figma layout.

Canvas comparison correction (same viewport, live API vs handoff boards):
- [x] GRID-01..14/SPACING: switch and upload tile, unified Setup controls,
  picture toolbar and Run note, run list identity/metadata/progress/actions.
- [x] TYPO/FONTSIZE/LHEIGHT: selected metadata, run estimate and card heading.
- [x] COLOR/BORDER/RADIUS: control outlines, scan rule badges, glyphs and status.
- [x] OVERLAY/SHADOW/OPACITY: preserve zoom, focus, disabled and error handling.
  Reuse GroupedOptionList, Panel, Button, RegionOverlay, Progress and StatusBadge.

Compared 24 canvas boards to the live application at matching widths. Saved
36 full-page app screenshots (including 375, 767 and 769) and two comparison
sheets in tmp/fe037-canvas. Checked workspace ordering and visible zoom value at
all nine widths on Setup and Run, selected file/profile metadata, bulk OCR layout
selection and subsequent individual override. No horizontal overflow or page
errors in that pass. Production frontend build and full Vitest suite passed.
Live material/profile data, engine availability and zoom fit determine the
contents of the previews. Profile OCR settings are available outside sketch naming.

Screenshot correction: remove the permanent OCR settings panel from Setup in
every selection/sketch state. Keep existing profile character/layout editing
reachable from More in a dialog. Reuse AppMenu, Dialog, OcrSettingsPanel and
Button. GRID/SPACING, BORDER/COLOR, FONTSIZE and OVERLAY/FOCUS apply to the
Setup controls, region filter/checkboxes, save row and explicit dialog.
