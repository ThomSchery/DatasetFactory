/*
 * The path data of every glyph, apart from the component so geometry tests can
 * load it without the stylesheet (FE-023). Every glyph is drawn in a 24 × 24
 * `viewBox` and must stay inside it together with half of the 1.5 stroke.
 */

export type IconName =
  | "upload"
  | "profile"
  | "run"
  | "menu"
  | "hamburger"
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

export const ICON_PATHS: Record<IconName, string> = {
  upload: "M12 16V4m0 0 4 4m-4-4-4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2",
  /* FE-023: an 8-tooth gear drawn for this set (no third-party source): tips on
     r 9.75 (±9°), roots on r 7.25 (±14°), teeth every 45° from the top, hub
     r 3 — all centred on 12/12. Extent 2.25–21.75, 1.5–22.5 with the stroke.
     The previous outline was shifted 1.4 px up and clipped by the viewBox. */
  profile:
    "M10.25 4.97L10.47 2.37A9.75 9.75 0 0 1 13.53 2.37L13.75 4.97A7.25 7.25 0 0 1 15.73 5.79L17.73 4.11A9.75 9.75 0 0 1 19.89 6.27L18.21 8.27A7.25 7.25 0 0 1 19.03 10.25L21.63 10.47A9.75 9.75 0 0 1 21.63 13.53L19.03 13.75A7.25 7.25 0 0 1 18.21 15.73L19.89 17.73A9.75 9.75 0 0 1 17.73 19.89L15.73 18.21A7.25 7.25 0 0 1 13.75 19.03L13.53 21.63A9.75 9.75 0 0 1 10.47 21.63L10.25 19.03A7.25 7.25 0 0 1 8.27 18.21L6.27 19.89A9.75 9.75 0 0 1 4.11 17.73L5.79 15.73A7.25 7.25 0 0 1 4.97 13.75L2.37 13.53A9.75 9.75 0 0 1 2.37 10.47L4.97 10.25A7.25 7.25 0 0 1 5.79 8.27L4.11 6.27A9.75 9.75 0 0 1 6.27 4.11L8.27 5.79A7.25 7.25 0 0 1 10.25 4.97ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  run: "M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM8 12h7m0 0-3-3m3 3-3 3",
  menu: "M12 6.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1Zm0 6a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1Zm0 6a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1Z",
  hamburger: "M4 7h16M4 12h16M4 17h16",
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

