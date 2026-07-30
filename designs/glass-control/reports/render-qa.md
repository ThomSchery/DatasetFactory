# Render QA

## Integration state

- Target page: Instatic `Home — Glass Control` (`/glass-control`)
- Native adapter write: complete
- Token creation: complete
- Semantic structure replacement: complete
- Desktop snapshot: not captured
- Tablet snapshot: not captured
- Mobile snapshot: not captured
- Publish: intentionally omitted

## Blocker

The Instatic connector reported `siteConnected: false` after the page was written. The user confirmed the editor tab was open, but the live workspace bridge did not reconnect. Per the adapter contract, render QA remains incomplete until `site_render_snapshot` succeeds at desktop, tablet and mobile.

## Acceptance criteria pending

- no horizontal overflow at 1440, 768 or 375 px;
- profile → pipeline → verification hierarchy remains legible;
- buttons and search retain visible keyboard focus;
- body/secondary text meet contrast requirements over the glass surfaces;
- no missing assets or hidden essential controls;
- reduced-motion fallback remains active.

