# FE-038 - mockup re-check: scan rules per engine, full width, quiet outlines

User request (2026-11-27): re-analyse the handoff boards against the app.
Marked items: Scan rules not needed for the engine without layouts, side
gaps on a wide window, frames (outlines), the "4 regions" badge.

Analysis (boards 575-1400 vs live app, plus 1859/2560 app):
- Upload and Annotations match at 1400/575.
- The mockup's engine copy is reversed against the code: Tesseract is the
  only engine that reads the text layout (`uses_text_layout = True`),
  RapidOCR detects text itself and ignores it. The app showed Scan rules
  for both engines.
- Content was capped at 1368 px, leaving ~240 px gaps at 1859 px.
- Unselected Run controls used the control stroke #8a91a2; the mockup
  uses the workspace outline #3b4150.

User decisions: the engine that has scan rules shows them, the one without
is Automatic; content full width with the 24 px margin.

Changes:
- Run: Scan rules render only when the selected engine uses the text
  layout; with another engine preview labels read "Automatic" and
  `region_text_layouts` is not sent. Badge "N regions" removed.
- Shell: `.df-shell__content` has no max-width; `--content-max-*` removed.
- Run outlines: unselected engine cards, scan-rule tiles and rows, the
  sample-rate field and presets use `--color-workspace-outline`.

Not changed (reported, not marked): rule glyph and chevron style in region
rows, uppercase SAMPLE RATE label and mono value, Run button glyph, run
summary line under Run, Setup filter outline. Setup at 1859x900 scrolls by
36 px because the preview grows with the width.

Verification: build PASS; full frontend suite 1049/1049 before the new
test, materials/app/styles/architecture 404/404 with it. Browser at
575, 1400, 1859x900, 2560x1440: content 24 px from rail and right edge, no
horizontal overflow, no page errors; RapidOCR hides Scan rules and labels
regions Automatic.

## Follow-up (same day): pickers and "Automatic"

- Regression from the outline rule: it reached the inner input of the
  Source file / Profile pickers, drawing a frame inside the row. The rule
  now skips `.df-grouped-options` inputs; the separator before the chevron
  is hidden on Run, so a picker is one row (glass, text, chevron).
- User: "Automatic" says nothing - show the assigned value. A region
  without its own layout is read with the profile's default "auto", which
  Tesseract maps to PSM 6, the same as "block". Scan rules and preview
  labels now show "Block of lines" with its glyph and that tile is
  pressed. RapidOCR (no layouts) keeps "Automatic" on the preview.
- Build PASS; full frontend suite 1051/1051.

## Setup unified with Run (same day)

- Filter regions field: workspace outline (#3b4150) when not focused.
- Profile picker: separator before the chevron hidden, like Run.
- One place for the shown layout: `readTextLayout` / `textLayoutName` /
  `OCR_TEXT_LAYOUT_CHOICES` in profiles/schemas.ts, used by Run Scan rules
  and Profile OCR settings. "auto" and an inherited region show "Block of
  lines"; the layout picker offers the four real layouts (no "Automatic");
  the summary no longer says "Layout inherited". Saved data unchanged: a
  region keeps "auto" until the operator picks another layout. Short name
  of "sparse" is "Scattered" everywhere.
- Stale e2e (not in the unit suite): fe018-visual-qa expects the layout
  placeholder to start with "Automatic".
- Build PASS; full frontend suite 1051/1051.

## Setup preview height (same day)

- With full-width content the Setup picture (16:9 of the 9/12 column) made
  the page 936 px tall in a 1859x900 window. New token
  `--workspace-preview-max-height` (100dvh minus bar, content margins,
  switch, its gap, picture panel padding/border, tool row and its gap; never
  below the 279 px phone height) caps the picture box from 769 px up; the
  frame is fitted and centred inside (zoom/pan unchanged).
- Measured page height = window height at 1859x900, 1859x881, 1400x900,
  2560x1440, 1200x700, 1024x768, 769x900; phones stack as before.

## OCR engine choice (same day)

User: RapidOCR first, no engine selected by default; with Tesseract the
first scan-rule region must not be open or highlighted.

- Engines listed with RapidOCR first (`FIRST_OCR_ENGINE`); no engine is
  pre-selected - the backend default is no longer pressed. Run asks for one
  ("Choose an OCR engine.") together with the other missing choices when
  any engine is available; the request carries the chosen `ocr_engine`.
- No engine chosen: no Scan rules, preview labels are the region names.
- Scan rules: every region starts folded.
- Tests updated for the explicit choice and folded regions; build PASS,
  full frontend suite 1051/1051.
