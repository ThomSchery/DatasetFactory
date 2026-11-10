import type { Plugin } from "vite";

/*
 * FE-024 — the design preset exported by the user's figma-tailwind-tokens
 * plugin (`design-preset.css`) is a Tailwind v4 `@theme` block. Tailwind is
 * not part of v1 (decision F16), so this module turns the `@theme` blocks into
 * plain custom properties on `:root` at build time, in Vite (dev, build, the
 * Playwright dev server) and in Vitest (which reads the file through
 * `convertThemeBlocks` directly).
 *
 * Only the subset the plugin emits is supported: `@theme`, `@theme static`
 * and `@theme inline`, holding `--name: value;` declarations and comments.
 * Anything else Tailwind would interpret (`@theme reference`, `@utility`,
 * `@variant`, `@apply`, namespace resets such as `--color-*: initial`,
 * nested rules) is refused with the file and line, rather than reaching the
 * browser as an at-rule it silently drops.
 */

export class DesignPresetSyntaxError extends Error {
  readonly file: string;
  readonly line: number;

  constructor(file: string, line: number, detail: string) {
    super(`${file}:${String(line)}: ${detail}`);
    this.name = "DesignPresetSyntaxError";
    this.file = file;
    this.line = line;
  }
}

const SUPPORTED_THEME_OPTIONS = new Set(["static", "inline"]);

/** Tailwind-only at-rules that have no meaning without Tailwind. */
const UNSUPPORTED_AT_RULES =
  /@(utility|variant|custom-variant|apply|plugin|source|config|reference)\b/g;

const TAILWIND_IMPORT = /@import\s+(?:url\()?\s*["']tailwindcss/g;

function lineAt(text: string, index: number): number {
  let line = 1;
  for (let position = 0; position < index && position < text.length; position += 1) {
    if (text.charCodeAt(position) === 10) line += 1;
  }
  return line;
}

/** Replaces every comment with spaces of the same length, so indices and lines stay aligned. */
function blankComments(css: string): string {
  return css.replaceAll(/\/\*[\s\S]*?\*\//g, (comment) => comment.replaceAll(/[^\n]/g, " "));
}

interface ThemeBlock {
  bodyEnd: number;
  bodyStart: number;
  end: number;
  options: string[];
  start: number;
}

function findThemeBlocks(css: string, blanked: string, file: string): ThemeBlock[] {
  const blocks: ThemeBlock[] = [];
  const atTheme = /@theme\b/g;
  let match: RegExpExecArray | null;
  while ((match = atTheme.exec(blanked)) !== null) {
    const start = match.index;
    const open = blanked.indexOf("{", start);
    if (open === -1) {
      throw new DesignPresetSyntaxError(file, lineAt(css, start), "`@theme` without a `{` block");
    }
    const prelude = blanked.slice(start + "@theme".length, open).trim();
    const options = prelude.length === 0 ? [] : prelude.split(/\s+/);
    for (const option of options) {
      if (!SUPPORTED_THEME_OPTIONS.has(option)) {
        throw new DesignPresetSyntaxError(
          file,
          lineAt(css, start),
          `unsupported \`@theme ${prelude}\`; only \`@theme\`, \`@theme static\` and \`@theme inline\` are converted`,
        );
      }
    }
    let depth = 0;
    let close = -1;
    for (let position = open; position < blanked.length; position += 1) {
      const character = blanked[position];
      if (character === "{") {
        depth += 1;
        if (depth > 1) {
          throw new DesignPresetSyntaxError(
            file,
            lineAt(css, position),
            "nested block inside `@theme`; only `--name: value;` declarations are converted",
          );
        }
      } else if (character === "}") {
        depth -= 1;
        if (depth === 0) {
          close = position;
          break;
        }
      }
    }
    if (close === -1) {
      throw new DesignPresetSyntaxError(file, lineAt(css, start), "unclosed `@theme` block");
    }
    blocks.push({ start, bodyStart: open + 1, bodyEnd: close, end: close + 1, options });
    atTheme.lastIndex = close + 1;
  }
  return blocks;
}

function validateDeclarations(css: string, blanked: string, block: ThemeBlock, file: string): void {
  const body = blanked.slice(block.bodyStart, block.bodyEnd);
  let offset = block.bodyStart;
  for (const statement of body.split(";")) {
    const trimmedStart = offset + (statement.length - statement.trimStart().length);
    const declaration = statement.trim();
    offset += statement.length + 1;
    if (declaration.length === 0) continue;
    const line = lineAt(css, trimmedStart);
    const parts = /^(--[A-Za-z0-9_-]+)\s*:\s*([\s\S]+)$/.exec(declaration);
    if (parts === null) {
      throw new DesignPresetSyntaxError(
        file,
        line,
        `\`${declaration}\` is not a \`--name: value\` declaration`,
      );
    }
    const [, name, value] = parts;
    if (name.includes("*")) {
      throw new DesignPresetSyntaxError(file, line, `namespace declaration \`${name}\` is Tailwind-only`);
    }
    if (/^initial$/i.test(value.trim())) {
      throw new DesignPresetSyntaxError(
        file,
        line,
        `\`${name}: initial\` is a Tailwind namespace reset, not a value`,
      );
    }
  }
}

/**
 * Converts every `@theme` block in `css` to a `:root { … }` rule with the same
 * declarations and comments; the rest of the file is returned unchanged.
 * Throws `DesignPresetSyntaxError` for Tailwind syntax that has no plain-CSS
 * equivalent.
 */
export function convertThemeBlocks(css: string, file = "design-preset.css"): string {
  const blanked = blankComments(css);

  for (const pattern of [UNSUPPORTED_AT_RULES, TAILWIND_IMPORT]) {
    pattern.lastIndex = 0;
    const offender = pattern.exec(blanked);
    if (offender !== null) {
      throw new DesignPresetSyntaxError(
        file,
        lineAt(css, offender.index),
        `\`${offender[0].trim()}\` needs Tailwind, which this project does not use (F16)`,
      );
    }
  }
  const wildcard = /--[A-Za-z0-9_-]*\*\s*:/.exec(blanked);
  if (wildcard !== null) {
    throw new DesignPresetSyntaxError(
      file,
      lineAt(css, wildcard.index),
      `namespace declaration \`${wildcard[0].replace(/\s*:$/, "")}\` is Tailwind-only`,
    );
  }

  const blocks = findThemeBlocks(css, blanked, file);
  if (blocks.length === 0) return css;

  let output = "";
  let cursor = 0;
  for (const block of blocks) {
    validateDeclarations(css, blanked, block, file);
    output += css.slice(cursor, block.start);
    output += `:root {${css.slice(block.bodyStart, block.bodyEnd)}}`;
    cursor = block.end;
  }
  output += css.slice(cursor);
  return output;
}

/**
 * Custom properties declared in `:root { … }` rules of plain CSS (the output of
 * `convertThemeBlocks`, or `tokens.css`), in source order; a later declaration
 * of the same name wins, as in the cascade.
 */
export function parseRootVariables(css: string): Map<string, string> {
  const variables = new Map<string, string>();
  const blanked = blankComments(css);
  const rootRule = /:root\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = rootRule.exec(blanked)) !== null) {
    const bodyStart = match.index + match[0].length;
    const bodyEnd = blanked.indexOf("}", bodyStart);
    if (bodyEnd === -1) break;
    for (const statement of blanked.slice(bodyStart, bodyEnd).split(";")) {
      const parts = /^\s*(--[A-Za-z0-9_-]+)\s*:\s*([\s\S]+?)\s*$/.exec(statement);
      if (parts !== null) variables.set(parts[1], parts[2]);
    }
    rootRule.lastIndex = bodyEnd + 1;
  }
  return variables;
}

/** Vite plugin: converts `@theme` blocks in any imported `.css` file before Vite's own CSS pipeline. */
export function designPresetPlugin(): Plugin {
  return {
    name: "datasetfactory:design-preset",
    enforce: "pre",
    transform(code, id) {
      const file = id.split("?")[0];
      if (!file.endsWith(".css") || !/@theme\b/.test(code)) return null;
      return { code: convertThemeBlocks(code, file), map: null };
    },
  };
}
