# Instatic adapter

Use native Instatic tools against the live Site workspace. Never mutate SQLite directly.

1. Call `get_context` and confirm `siteConnected`.
2. Read existing styles and the target document.
3. Establish reusable color/font/type/spacing tokens with framework-token tools.
4. Add semantic structure through `site_insert_html` or `site_replace_node_html`.
5. Add classes, pseudo states, `border-image`, media queries, and reduced-motion through `site_apply_css`.
6. Store runtime files only through `site_write_code_asset`.
7. Render desktop, tablet, and mobile with `site_render_snapshot` when those breakpoints are declared.
8. Fix material warnings and re-render.
9. Never publish unless the user explicitly requests it.

The adapter must be idempotent. Namespace owned selectors and assets. Re-importing one package version updates owned resources instead of duplicating them or touching unrelated classes.

For versioned experiments, use Instatic's canonical SiteBundle export/import and the repository's `design:iterations` commands. Never use a copied runtime database as an iteration artifact. On a fresh installation, first detect whether these commands exist; if absent, preserve the same package contract manually rather than modifying Instatic internals without approval.
