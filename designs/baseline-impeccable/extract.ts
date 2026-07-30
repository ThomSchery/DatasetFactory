/**
 * Extracts the Instatic page "Home — Impeccable" into a portable HTML/CSS baseline.
 *
 * Source of truth: Instatic local SQLite database (page node tree + site style rules).
 * Output: page.html, page.css, tokens.json, source.json in this directory.
 *
 * Run: bun run designs/baseline-impeccable/extract.ts
 */
import { Database } from "bun:sqlite";
import { mkdirSync, writeFileSync } from "node:fs";

const DB_PATH = process.env.INSTATIC_DB ?? "D:/my/Projects/Instatic/.tmp/dev.db";
const SLUG = process.env.INSTATIC_PAGE ?? "impeccable";
const OUT = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

mkdirSync(OUT, { recursive: true });

const db = new Database(DB_PATH, { readonly: true });
const row = db
  .query("select cells_json, updated_at, status from data_rows where table_id='pages' and slug=?")
  .get(SLUG) as { cells_json: string; updated_at: string; status: string } | null;
if (!row) throw new Error(`page '${SLUG}' not found in ${DB_PATH}`);

const cells = JSON.parse(row.cells_json);
const { nodes, rootNodeId } = cells.body as { nodes: Record<string, any>; rootNodeId: string };
const site = JSON.parse((db.query("select settings_json from site limit 1").get() as any).settings_json).site;
const styleRules: Record<string, any> = site.styleRules;

/* ---------------- HTML ---------------- */

const VOID_TAGS = new Set(["br", "hr", "img", "input", "meta", "link", "source", "track", "wbr", "area", "base", "col", "embed", "param"]);
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const className = (id: string) => styleRules[id]?.name ?? id;

const usedClassIds = new Set<string>();
for (const n of Object.values<any>(nodes)) (n.classIds ?? []).forEach((c: string) => usedClassIds.add(c));

function attrs(node: any) {
  const out: string[] = [];
  const cls = (node.classIds ?? []).map(className).join(" ");
  if (cls) out.push(`class="${cls}"`);
  for (const [k, v] of Object.entries(node.props?.htmlAttributes ?? {})) out.push(`${k}="${esc(v)}"`);
  return out.length ? " " + out.join(" ") : "";
}

function render(id: string, depth = 1): string {
  const node = nodes[id];
  if (!node) return "";
  const pad = "  ".repeat(depth);
  const kids = () => (node.children ?? []).map((c: string) => render(c, depth + 1)).filter(Boolean).join("\n");

  switch (node.moduleId) {
    case "base.body":
      return kids();

    case "base.text": {
      const tag = node.props?.tag && node.props.tag !== "none" ? node.props.tag : null;
      const text = esc(node.props?.text);
      return tag ? `${pad}<${tag}${attrs(node)}>${text}</${tag}>` : `${pad}${text}`;
    }

    case "base.container": {
      const tag = node.props?.customTag || node.props?.tag || "div";
      if (VOID_TAGS.has(tag)) return `${pad}<${tag}${attrs(node)}>`;
      const inner = [node.props?.text ? `${pad}  ${esc(node.props.text)}` : "", kids()].filter(Boolean).join("\n");
      return inner ? `${pad}<${tag}${attrs(node)}>\n${inner}\n${pad}</${tag}>` : `${pad}<${tag}${attrs(node)}></${tag}>`;
    }

    case "base.link": {
      const target = node.props?.target ? ` target="${esc(node.props.target)}"` : "";
      const inner = kids();
      const open = `<a href="${esc(node.props?.href ?? "#")}"${target}${attrs(node)}>`;
      return inner ? `${pad}${open}\n${inner}\n${pad}</a>` : `${pad}${open}</a>`;
    }

    case "base.button": {
      const label = esc(node.props?.label);
      if (node.props?.href) {
        const target = node.props.target ? ` target="${esc(node.props.target)}"` : "";
        return `${pad}<a href="${esc(node.props.href)}"${target}${attrs(node)}>${label}</a>`;
      }
      return `${pad}<button type="button"${node.props?.disabled ? " disabled" : ""}${attrs(node)}>${label}</button>`;
    }

    default:
      return `${pad}<!-- unsupported module ${node.moduleId} -->`;
  }
}

/* ---------------- CSS ---------------- */

// Instatic stores declarations with camelCase property names; CSS needs kebab-case.
const cssProp = (p: string) => (p.startsWith("--") ? p : p.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`));
const declBlock = (styles: Record<string, string>, pad = "  ") =>
  Object.entries(styles)
    .map(([p, v]) => `${pad}${cssProp(p)}: ${v};`)
    .join("\n");

function ruleCss(rule: any): string {
  const parts: string[] = [];
  if (rule.styles && Object.keys(rule.styles).length) parts.push(`${rule.selector} {\n${declBlock(rule.styles)}\n}`);
  for (const [ctx, styles] of Object.entries<any>(rule.contextStyles ?? {})) {
    if (!styles || !Object.keys(styles).length) continue;
    const bp = site.breakpoints?.find((b: any) => b.id === ctx);
    if (bp) parts.push(`@media ${bp.mediaQuery} {\n  ${rule.selector} {\n${declBlock(styles, "    ")}\n  }\n}`);
    else parts.push(`${rule.selector}:${ctx} {\n${declBlock(styles)}\n}`);
  }
  return parts.join("\n\n");
}

const allRules = Object.values<any>(styleRules).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
const usedRules = [...usedClassIds].map((id) => styleRules[id]).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
const usedNames = new Set(usedRules.map((r) => r.name));

// Ambient rules carry the descendant selectors (`.df-impeccable .df-nav a:hover`). Other page
// variants live in the same style sheet, so keep only rules whose classes this page actually uses.
const selectorClasses = (selector: string) => [...String(selector).matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]);
const globalRules = allRules.filter((r) => {
  if (r.kind === "class" && String(r.selector).startsWith(".")) return false;
  return selectorClasses(r.selector).every((c) => usedNames.has(c));
});

// Colour tokens live in site settings, not in styleRules; emit them as custom properties.
const colorTokens: Record<string, { light: string; dark: string }> = {};
for (const t of site.settings?.framework?.colors?.tokens ?? []) {
  if (!t.slug) continue;
  colorTokens[`--${t.slug}`] = { light: t.lightValue, dark: t.darkValue ?? t.lightValue };
}

const fluidType: Record<string, string> = {};
for (const group of site.settings?.framework?.typography?.groups ?? []) {
  for (const s of group.manualSizes ?? []) {
    const lo = Math.min(s.min, s.max);
    const hi = Math.max(s.min, s.max);
    fluidType[`--${s.name}`] = `clamp(${lo}px, ${lo}px + 1vw, ${hi}px)`;
  }
}

// Font tokens map a CSS variable to a loaded family plus its fallback stack.
const fontFamilies: Record<string, string> = {};
for (const f of site.settings?.fonts?.items ?? []) fontFamilies[f.id] = f.family;
const fontTokens: Record<string, string> = {};
for (const t of site.settings?.fonts?.tokens ?? []) {
  const family = fontFamilies[t.familyId];
  if (!t.variable || !family) continue;
  fontTokens[`--${t.variable}`] = [`"${family}"`, t.fallback].filter(Boolean).join(", ");
}

const fonts: string[] = Object.values(fontFamilies);
const googleHref = fonts.length
  ? `https://fonts.googleapis.com/css2?${fonts.map((f) => `family=${f.replace(/ /g, "+")}:wght@400;500;600;700`).join("&")}&display=swap`
  : null;

const tokenCss = [
  ":root {",
  ...Object.entries(colorTokens).map(([n, v]) => `  ${n}: ${v.dark};`),
  ...Object.entries(fluidType).map(([n, v]) => `  ${n}: ${v};`),
  ...Object.entries(fontTokens).map(([n, v]) => `  ${n}: ${v};`),
  "}",
  "",
  "/* light values, kept for reference — the shell is dark by design */",
  '[data-theme="light"] {',
  ...Object.entries(colorTokens).map(([n, v]) => `  ${n}: ${v.light};`),
  "}",
].join("\n");

const css = [
  `/* Extracted from Instatic page '${SLUG}' (${cells.title}).`,
  `   Source: ${DB_PATH}  page updated_at=${row.updated_at} status=${row.status}`,
  `   Generated artifact — do not hand-edit; re-run extract.ts instead. */`,
  "",
  "/* ---------- colour + typography tokens (site settings) ---------- */",
  tokenCss,
  "",
  "/* ---------- global rules ---------- */",
  ...globalRules.map(ruleCss).filter(Boolean),
  "",
  "/* ---------- classes used by this page ---------- */",
  ...usedRules.map(ruleCss).filter(Boolean),
].join("\n");

const html = `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(cells.title)}</title>
${googleHref ? `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link rel="stylesheet" href="${googleHref}">` : ""}
<link rel="stylesheet" href="./page.css">
</head>
<body>
${render(rootNodeId)}
</body>
</html>
`;

/* ---------------- unresolved var() report ---------------- */

const defined = new Set([
  ...Object.keys(colorTokens),
  ...Object.keys(fluidType),
  ...Object.keys(fontTokens),
  ...[...globalRules, ...usedRules].flatMap((r) => Object.keys(r.styles ?? {}).filter((k) => k.startsWith("--"))),
]);
const referenced = new Set<string>();
for (const m of css.matchAll(/var\((--[a-zA-Z0-9-]+)/g)) referenced.add(m[1]);
const unresolved = [...referenced].filter((v) => !defined.has(v)).sort();

writeFileSync(`${OUT}/page.html`, html, "utf8");
writeFileSync(`${OUT}/page.css`, css, "utf8");
writeFileSync(
  `${OUT}/tokens.json`,
  JSON.stringify(
    { colors: colorTokens, typography: fluidType, fontTokens, fonts, scales: globalRules.find((r) => r.selector === ":root")?.styles ?? {} },
    null,
    2,
  ),
  "utf8",
);
writeFileSync(
  `${OUT}/source.json`,
  JSON.stringify(
    {
      extractedAt: new Date().toISOString(),
      source: { db: DB_PATH, table: "data_rows", slug: SLUG, title: cells.title, pageUpdatedAt: row.updated_at, status: row.status },
      counts: {
        nodes: Object.keys(nodes).length,
        usedClasses: usedClassIds.size,
        globalRules: globalRules.length,
        colorTokens: Object.keys(colorTokens).length,
        typographySteps: Object.keys(fluidType).length,
      },
      breakpoints: site.breakpoints,
      responsiveOverrides: Object.values<any>(nodes).filter((n) => Object.keys(n.breakpointOverrides ?? {}).length).length,
      unresolvedCssVars: unresolved,
      classInventory: usedRules.map((r) => ({ name: r.name, selector: r.selector, contexts: Object.keys(r.contextStyles ?? {}) })),
    },
    null,
    2,
  ),
  "utf8",
);

console.log(`nodes=${Object.keys(nodes).length} classes=${usedClassIds.size} globalRules=${globalRules.length} colorTokens=${Object.keys(colorTokens).length}`);
console.log(`unresolved vars (${unresolved.length}): ${unresolved.join(", ") || "none"}`);
