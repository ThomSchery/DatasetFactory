# FE-036 — Final mockup (grid)

User approved implementation of the saved Instatic page `df-final-mockup`.
Scope: application frame and icon rail, Upload, Setup for scan (profile search,
region list/actions, OCR layout/character groups, save), Run (source/profile/OCR
engine/sample rate/actions, preview and status), Annotations run list. Preserve
live API behaviour, existing review editor and in-progress FE-032 changes.

Design plan (before UI code):
- [x] GRID-01..14 / SPACING-01..13: 24px outer margin and column gutter;
  12-column workspace, panel 5/12 above 768, 4/12 at LG, 3/12 at XL;
  preview first through 768 inclusive. All sizes named in tokens.css.
- [x] TYPO-02..11 / FONTSIZE-02..10 / LHEIGHT-01..06: Inter regular/semibold,
  retain 12px minimum; compact metadata, clear uppercase group labels.
- [x] COLOR-01..10: extract graphite/amber palette from saved Instatic rules;
  replace active preset, retain accessible text/control contrast.
- [x] BORDER-01..09 / BWIDTH-01..14 / RADIUS-01..05: soft panel outlines,
  8px controls, 10px panels, 12px frame, amber selection and focus.
- [x] OVERLAY-01..07 / SHADOW-01..05: preserve dialogs, focus and hit targets;
  no decorative shadow added.
- [x] Common components: reuse Button, NavItem, SideNav, Panel, TextField,
  GroupedOptionList, RegionOverlay, FilePickerTile, DataList and UiStates.
- [x] Review local AGENTS.md and full applicable Grid/Spacing and Visuals
  modules plus Typography family/weight/size/line-height modules.

Sources: Instatic .tmp/dev.db read-only, df-final-mockup; chat on alternate UI
(latest icon and <=768 correction); Centralizacja zmiennych projektowych;
docs/CONTEXT.md; frontend/src/styles/README.md; common component catalogue.
The Highlights Tailwind implementation informs centralisation only: this
project keeps its CSS preset/mapping architecture.

Validation: production build, existing frontend suite and architecture/contrast
checks, browser widths 375,575,576,768,769,992,1200,1400 and populated screens.

## Completion and verification

Implemented frame/rail/pills, graphite-amber preset, shared rounded controls,
Upload tile, responsive Setup/Run grid, engine cards and sample-rate presets,
profile scan-rule summary with exact-profile edit link, character chips and
compact Annotations run rows. Preserved existing API workflows and pre-existing
FE-032 edits. No backend code or per-run override contract changed.

QA found auto-placement reversed desktop columns because preview is first in
DOM; fixed with explicit grid column starts. Removed obsolete shell drawer and
resize state now that the approved rail exists at every width. Fixed the file
picker accessible name so the format hint does not rename the action. Adapted
route test backdrop to a completed processing state after pre-existing FE-032
changed the zero-frame running state to a reference preview.

Validation:
- Production build (TypeScript + Vite): passed. Existing >500kB bundle warning.
- Full frontend suite: 1043 passed, 0 failed. Initial default worker run hit
  startup timeouts; rerun with maxWorkers=2 completed successfully.
- After final shell cleanup: focused shell/architecture/material tests 349/349.
- Populated real API browser QA: Upload, Setup, Run, Annotations at 375,575,576,
  768,769,992,1200,1400px: no document overflow, no JS errors, correct stacking.
- Browser interactions: engine choice, 500ms preset, exact-profile edit link,
  left-controls/right-preview placement, rail collapse and restore passed.
- Independent read-only review via traycer-review: desktop column issue fixed;
  final shell check reported no further actionable findings.
- git diff --check: passed.

Visual baseline and design-centre docs updated. Previous Figma export retained
in designs/final-mockup-grid/previous-preset.css. Local preview remains at
http://127.0.0.1:5181/profiles using the existing API on port8001. No commit or push.
