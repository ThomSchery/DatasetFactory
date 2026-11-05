import "./Icon.css";

/*
 * The line marks the Figma document draws beside labels and inside square
 * buttons, 24 px as in the document (FE-022). Every one of them is decorative:
 * the control it sits in always carries its own text or accessible name, so
 * the glyph is `aria-hidden` and never the only way to tell two controls apart
 * (COLOR-09).
 *
 * They are inline SVG rather than an icon font or a package: they must inherit
 * `currentColor`, and a font would be another file to serve offline.
 */

export type IconName =
  | "upload"
  | "profile"
  | "run"
  | "menu"
  | "hamburger"
  | "collapse"
  | "scan"
  | "edit"
  | "folder"
  | "search"
  | "save"
  | "plus"
  | "chevron-down"
  | "chevron-right"
  | "arrow-left"
  | "arrow-right"
  | "image"
  | "draw"
  | "zoom-in"
  | "zoom-out"
  | "reset"
  | "trash"
  | "close"
  | "video"
  | "info"
  | "settings";

export interface IconProps {
  name: IconName;
}

const PATHS: Record<IconName, string> = {
  upload: "M12 16V4m0 0 4 4m-4-4-4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2",
  profile:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 13.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7h-.3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.1-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1v-.3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.8 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.3a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.4.9Z",
  run: "M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM8 12h7m0 0-3-3m3 3-3 3",
  menu: "M12 6.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1Zm0 6a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1Zm0 6a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1Z",
  hamburger: "M4 7h16M4 12h16M4 17h16",
  collapse: "M5 5v14M19 12H9m0 0 4-4m-4 4 4 4",
  scan: "M4 9V6a2 2 0 0 1 2-2h3M15 4h3a2 2 0 0 1 2 2v3M20 15v3a2 2 0 0 1-2 2h-3M9 20H6a2 2 0 0 1-2-2v-3M4 12h16",
  edit: "M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16zM13.5 6.5l4 4",
  folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5.2-1.8L21 21",
  save: "M5 4h10l4 4v12H5zM8 4v5h7V4M8 20v-6h8v6",
  plus: "M12 5v14M5 12h14",
  "chevron-down": "m6 9 6 6 6-6",
  "chevron-right": "m9 6 6 6-6 6",
  "arrow-left": "M20 12H4m0 0 6-6m-6 6 6 6",
  "arrow-right": "M4 12h16m0 0-6-6m6 6-6 6",
  image: "M4 5h16v14H4zM4 16l4.5-4.5 3 3L15 11l5 5M9.5 9.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z",
  draw: "M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M9 12h6M12 9v6",
  "zoom-in": "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5.2-1.8L21 21M8 11h6M11 8v6",
  "zoom-out": "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5.2-1.8L21 21M8 11h6",
  reset: "M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4",
  trash: "M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  close: "M6 6l12 12M18 6 6 18",
  video: "M4 6h11v12H4zM15 10l5-3v10l-5-3",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v6M12 7.5v.5",
  settings: "M4 7h10M18 7h2M4 17h4M12 17h8M14 5v4M8 15v4",
};

/** A decorative glyph; the control around it owns the accessible name. */
export function Icon({ name }: IconProps) {
  return (
    <svg aria-hidden="true" className="df-icon" focusable="false" viewBox="0 0 24 24">
      <path d={PATHS[name]} />
    </svg>
  );
}
