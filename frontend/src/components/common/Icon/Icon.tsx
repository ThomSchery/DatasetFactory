import "./Icon.css";

/*
 * The small line marks the Figma document draws beside labels and inside
 * square buttons. Every one of them is decorative: the control it sits in
 * always carries its own text or accessible name, so the glyph is
 * `aria-hidden` and never the only way to tell two controls apart (COLOR-09).
 *
 * They are inline SVG rather than an icon font or a package: there are a dozen
 * of them, they must inherit `currentColor`, and a font would be another file
 * to serve offline.
 */

export type IconName =
  | "upload"
  | "profile"
  | "run"
  | "menu"
  | "search"
  | "save"
  | "plus"
  | "chevron-down"
  | "chevron-right"
  | "arrow-left"
  | "arrow-right"
  | "image";

export interface IconProps {
  name: IconName;
}

const PATHS: Record<IconName, string> = {
  upload: "M12 16V4m0 0 4 4m-4-4-4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2",
  profile:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 13.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7h-.3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.1-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1v-.3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.8 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.3a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.4.9Z",
  run: "M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM8 12h7m0 0-3-3m3 3-3 3",
  menu: "M12 6.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1Zm0 6a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1Zm0 6a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1Z",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5.2-1.8L21 21",
  save: "M5 4h10l4 4v12H5zM8 4v5h7V4M8 20v-6h8v6",
  plus: "M12 5v14M5 12h14",
  "chevron-down": "m6 9 6 6 6-6",
  "chevron-right": "m9 6 6 6-6 6",
  "arrow-left": "M20 12H4m0 0 6-6m-6 6 6 6",
  "arrow-right": "M4 12h16m0 0-6-6m6 6-6 6",
  image: "M4 5h16v14H4zM4 16l4.5-4.5 3 3L15 11l5 5M9.5 9.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z",
};

/** A decorative glyph; the control around it owns the accessible name. */
export function Icon({ name }: IconProps) {
  return (
    <svg aria-hidden="true" className="df-icon" focusable="false" viewBox="0 0 24 24">
      <path d={PATHS[name]} />
    </svg>
  );
}
