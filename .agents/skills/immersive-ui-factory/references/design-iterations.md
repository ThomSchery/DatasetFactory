# Versioned design iterations

Use this workflow only when multiple variants must be compared or a final direction must be selected.

1. Define the invariant product facts, target tasks, breakpoints, and evaluation criteria.
2. Give every variant a kebab-case id and one falsifiable hypothesis.
3. Initialize the package with Instatic's `bun run design:iterations init` when available.
4. Build the variant through the selected adapter without publishing.
5. Export the canonical SiteBundle and capture declared screenshots.
6. Store checksums, source version, source commit, hypothesis, and evaluation in the iteration package.
7. Validate the package before review.
8. Score hierarchy, task efficiency, functional completeness, consistency, responsive behavior, accessibility, and implementation cost. Add concrete evidence for every score.
9. Mark the variant `candidate`, `rejected`, or `accepted`; record reasons for rejected directions.
10. Build the final direction from explicitly accepted properties. Do not silently combine variants.

Keep runtime databases, credentials, uploads, logs, and unsaved browser drafts outside version control. Restore only through the canonical import path. DatasetFactory may consume accepted packages but must not depend on Instatic's local database or repository location.
