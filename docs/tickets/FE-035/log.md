# FE-035 — Profile and Run share one frame

User request (2026-11-27): "Unify the layout dimensions between Profile and Run. There is a strange jump when I change tabs." (two screenshots, 1881 px wide).

## Diagnosis

Measured in the repository Chromium at 1881 × 944 against the dev server (real Quake Champions profile), scrollbars on:

| | Profile | Run Setup (before) |
|---|---|---|
| Left column (grid track) | 247 px | 205 px |
| Panels in it | x 80, 231 px wide | x 72, 205 px wide |
| Picture panel | x 335, 1515 px wide | x 293, 1557 px wide |
| First element in the column | y 124 | y 159 (the "Run Setup" heading, 19 px + 16 px gap, sits above it) |

So the picture panel moved 42 px sideways and the column 35 px down whenever the tab changed. With an active run the column plus the heading was also taller than the picture panel, so the page grew past the window and scrolled by 7 px (the user's second screenshot is shifted up by exactly that).

## Change

- `--workspace-run-column` is `--workspace-profile-column` (247 px; Figma draws 205). `tokens.css`, `styles/README.md`.
- From 768 px the Run column panel is inset by `--element-padding-x-md`, as Profile inset its panels inside the same 247 px, so the visible edges coincide (x 80, 231 px).
- The "Run Setup" heading stays in the DOM and for a screen reader, but is hidden at every width instead of becoming a line above the column. One grid row (`auto`) holds both the column and the picture panel, so the column starts at the same y as Profile's first element and stretches to the picture panel.
- `e2e/fe022-figma-parity.spec.ts`: the Run column is compared with 231 px (`expectedWidth`, with its reason) instead of Figma's 205.

- Phone (user, 2026-11-27, follow-up): the gap under the picture was 16 px on Run and 8 px on Profile (Figma draws 16, but Profile has the user's approval as it is). Run's grid gap is now `--element-gap-lg` below 768 px and `--site-padding` from 768 px, exactly as Profile's; the column under the picture starts at y 453 on both at 390 and 576 px.

Not changed: the Run button stays at the foot of the column (FE-034).

## Verification

- Profile vs Run, same numbers at 1881 × 944, 1440 × 900, 1280 × 800, 992 × 900, 768 × 900: picture panel x 335 / y 124 / full height, picture 352 / 133, column x 80 / 231 px. Run with a mocked `running` run: page does not overflow at any of those sizes.
- 390 × 844: the picture panel is identical (16, 124, 343 × 321).
- `tsc --noEmit` PASS. Vitest `features/materials`, `features/profiles`, `app`: 114/117 — the 3 failures are the Review route tests of the uncommitted FE-032 work, as in FE-033/FE-034.
- `fe022-figma-parity` was red before this change (14/14 of the designed frames: the picture height since FE-033, the Run `ready` selector `.df-reference-image__img` since FE-034). Fixed in this ticket (user, 2026-11-27, follow-up), 26/26 on spare ports (5199 / 8099 / 8098):
  - `image.height: "grows"` (Profile, Run): from 768 px Figma's 479 px is a minimum (−4 %) and the document must fit the 900 px window (`overflowY`); on a phone the field stays fixed.
  - `image.sameAs`: Run's picture is compared with the Profile frame of the same width (FE-034).
  - Run `ready` is `.df-region-overlay__surface`.
  - Run's Run button: from 768 px its bottom must sit 0–16 px above the foot of the column (`footOf`, measured 9 px); on a phone it may sit lower by the picture field's excess over Figma's picture and by the OCR engine picker (`shiftedBy` list, `replaces`). Content bottom gets the same allowance (`contentShifts`). New class `df-run-setup__picker--engine` marks the picker.
