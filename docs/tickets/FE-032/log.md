# FE-032 — Automatic profile preview when starting a run

User request (2026-11-25): a new run must use the screenshot already defined in its profile instead of asking to load an image.

## Diagnosis and scope

The review screen requests `/frames/:id/image` while the selected frame is still `pending`; the worker has not saved that image yet. Its image error survives because frame detail and frame lists do not poll while the run advances. Run Setup already uses the selected profile's screenshot.

Use the run's own profile reference while no sampled frame exists. Once sampling commits, automatically show the real frame; editing remains governed by the existing review capabilities. Never substitute a profile screenshot for a missing image of a completed frame. Refresh frame lists/counts and unfinished frame detail with the existing run polling policy.

## Design Plan

Affected UI: Review frames preview, existing processing message, frame navigator and filter counts (refresh only). Run Setup and profile editing stay as implemented.

- [x] Layout / GRID-01/02: reuse the existing preview section and `ReferenceImage`; existing `--element-gap-lg` spacing, no new layout values.
- [x] Typography / TYPO-02, FONTSIZE-08/09, LHEIGHT-09/10: reuse the reference caption, `--font-size-xs`, `--line-height-standard`.
- [x] Colours / COLOR-07/08/09: existing surface, text and error tokens; waiting for sampling is an ordinary state.
- [x] Borders / BORDER-05/06, RADIUS-02/03: reuse the existing image border and radius.
- [x] Shadows / SHADOW: no added shadow.
- [x] Interaction / OPACITY-02: no editing surface on the profile preview; real-frame editing follows backend stage. No new buttons or pickers.
- [x] Components: reuse `ReferenceImage`, `RegionOverlay`, `UiStates`, existing navigator and filter components.

Implementation: API frame policy, review screen polling, frame editor preview. Validation: regression for pending → sampled → review-ready, first frame appearing after empty list, existing missing-image retry, historical profile selection, typecheck/build and architecture checks.

## Work log

- Located the screenshot's exact error and UI in DatasetFactory, not the initial Highlights workspace.
- Browser inspection unavailable initially: restoring the existing browser tab failed on viewport/zoom application. Continue with repository tests and independent browser verification if available.
- Implemented default profile reference for empty active runs and pending frames, then automatic switch to the sampled image. API stage policy controls polling; terminal transition refreshes both lists and counts.
- Initial tests caught two fixture mistakes (empty annotations cannot be accepted; accessible filter name is `Pending 1`) and one old expectation of an empty screen during startup. Corrected the fixtures and updated that expectation; retained coverage for a finished run with no matching frames.
- Existing `ReferenceImage` now fills the review preview's established height, keeping its caption inside the available space on narrow screens. No new design tokens.
- Browser verification used the existing Playwright installation against the local Vite app. Read existing run/profile/frame data and intercepted only GET responses to step through pending → sampled → review_pending. No API writes or new production runs. Confirmed: real profile image decodes; no premature frame-image request; automatic switch; editing enabled after OCR; no page errors or horizontal overflow at 390 px. Screenshots in this ticket: `profile-preview-desktop.png`, `profile-preview-mobile.png`, `frame-ready-desktop.png`.
- `npm run build`: PASS (TypeScript + Vite; existing advisory about a bundle above 500 kB).
- `git diff --check`: PASS.
- Final regression gate: 428/428 tests passed in six suites (`annotationReviewFixup`, `annotationReviewFlow`, `annotationTerminalRefresh`, `materialsFlow`, `frameReview`, `architecture`).
- Completed 2026-11-25. The running Vite app picks up these frontend changes; no backend migration or restart is needed.

## Completion on top of FE-036/037 (2026-11-27)

- The change had never been committed. Re-checked against main after
  FE-036/037: no overlap, build and full suite green.
- Fix: a pending frame of a failed or cancelled run no longer shows the
  profile screenshot captioned "being sampled" — nothing will sample it. The
  profile preview is gated on an active run (`runPollInterval(runStatus)`),
  otherwise the existing missing-image error stays. `LoadedFrameEditor` now
  destructures `runStatus`. Regression test added.
- New layout: before the first frame the profile picture spans the workspace
  and overflowed a 1400x900 window by 40 px; capped at the window-fitted
  image height minus the navigator row. Checked 390x844, 1200x700, 1400x900,
  1920x1080 with real run/profile data and GET-only interception: no page
  scroll, no premature frame-image request, no page errors.
- Screenshots in this folder replaced with the FE-036/037 layout.
- `npm run build` PASS; full frontend suite 1049/1049.
