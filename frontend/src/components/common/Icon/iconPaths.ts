/*
 * The glyphs, apart from the component so geometry tests can load them without
 * the stylesheet (FE-023). Every glyph is drawn in a 24 × 24 `viewBox` and must
 * stay inside it together with half of its stroke.
 *
 * FE-025: the icons the Figma document draws are its own vectors, exported on
 * 2026-11-10 to `designs/figma-2026-11-05/icons/` (`figma.file`) and checked
 * element for element against those files in `Icon.test.tsx`. Two families:
 * Iconly Light (outlined, stroke 1.5, round caps — free for personal and
 * commercial use) and Remix Icon (filled, Apache 2.0). A colour in the export
 * is the paint at its point of use, mapped onto the matching token:
 *
 *   #F6F7F8 → `current` (the role around the glyph decides: icon/secondary at
 *             rest, icon/primary on hover or when selected)
 *   #B9BFCB → `icon-secondary`   #959EB0 → `icon-placeholder`
 *   #23262C → `surface-page`
 *
 * The rest (`draw`, `image`, the zoom tools, `trash`, `close`, `check`, `video`,
 * `info`, `folder`) have no counterpart in the document and keep the line glyphs
 * drawn for FE-022. `checkbox-mixed` is the Figma empty box with a centre bar:
 * the document has no partial state, and that one must differ in shape
 * (COLOR-09).
 */

/** A paint of one element: `current` follows the text colour around it. */
export type IconPaint = "current" | "icon-secondary" | "icon-placeholder" | "surface-page";

export interface IconElement {
  /** Path data; absent for a circle. */
  d?: string;
  circle?: { cx: number; cy: number; r: number };
  fill?: IconPaint;
  stroke?: IconPaint;
  strokeWidth?: number;
  /** `fill-rule` / `clip-rule: evenodd`, as the export draws it. */
  evenOdd?: boolean;
}

export interface IconDefinition {
  /** The Figma component and the exported file it was read from. */
  figma?: { name: string; file: string };
  elements: readonly IconElement[];
}

/** The FE-022 line glyphs: one outlined path in `currentColor`, stroke 1.5. */
function line(d: string): IconDefinition {
  return { elements: [{ d, stroke: "current", strokeWidth: 1.5 }] };
}

const FIGMA = {
  "menu": {
    figma: { name: "Frame 1", file: "frame-1-frame-1.svg" },
    elements: [
      { d: "M3 4H21V6H3V4ZM3 11H21V13H3V11ZM3 18H21V20H3V18Z", fill: "current" },
    ],
  },
  "more": {
    figma: { name: "more-horizontal", file: "more-horizontal-1008-1453.svg" },
    elements: [
      { d: "M11 12C11 12.5523 11.4477 13 12 13C12.5523 13 13 12.5523 13 12C13 11.4477 12.5523 11 12 11C11.4477 11 11 11.4477 11 12Z", stroke: "current", strokeWidth: 2 },
      { d: "M11 19C11 19.5523 11.4477 20 12 20C12.5523 20 13 19.5523 13 19C13 18.4477 12.5523 18 12 18C11.4477 18 11 18.4477 11 19Z", stroke: "current", strokeWidth: 2 },
      { d: "M11 5C11 5.55228 11.4477 6 12 6C12.5523 6 13 5.55228 13 5C13 4.44772 12.5523 4 12 4C11.4477 4 11 4.44772 11 5Z", stroke: "current", strokeWidth: 2 },
    ],
  },
  "upload": {
    figma: { name: "Upload", file: "upload-1008-1383.svg" },
    elements: [
      { d: "M7.3895 8.98403H6.4565C4.4215 8.98403 2.7715 10.634 2.7715 12.669V17.544C2.7715 19.578 4.4215 21.228 6.4565 21.228H17.5865C19.6215 21.228 21.2715 19.578 21.2715 17.544V12.659C21.2715 10.63 19.6265 8.98403 17.5975 8.98403L16.6545 8.98403", stroke: "current", strokeWidth: 1.5 },
      { d: "M12.0214 2.19044V14.2314", stroke: "current", strokeWidth: 1.5 },
      { d: "M9.1063 5.11865L12.0213 2.19065L14.9373 5.11865", stroke: "current", strokeWidth: 1.5 },
    ],
  },
  "setting": {
    figma: { name: "Setting", file: "setting-1008-1155.svg" },
    elements: [
      { d: "M20.8066 7.62337L20.1842 6.54328C19.6576 5.62936 18.4907 5.31408 17.5755 5.83847V5.83847C17.1399 6.0951 16.6201 6.16791 16.1307 6.04084C15.6413 5.91378 15.2226 5.59727 14.9668 5.16113C14.8023 4.8839 14.7139 4.56815 14.7105 4.2458V4.2458C14.7254 3.72898 14.5304 3.22816 14.17 2.85743C13.8096 2.48669 13.3145 2.27762 12.7975 2.27783H11.5435C11.037 2.27783 10.5513 2.47967 10.194 2.8387C9.83667 3.19773 9.63716 3.68435 9.63959 4.19088V4.19088C9.62458 5.23668 8.77246 6.07657 7.72655 6.07646C7.4042 6.07311 7.08844 5.9847 6.81122 5.82017V5.82017C5.89605 5.29577 4.7291 5.61105 4.20252 6.52497L3.53433 7.62337C3.00839 8.53615 3.31938 9.70236 4.22998 10.2321V10.2321C4.82189 10.5738 5.18652 11.2053 5.18652 11.8888C5.18652 12.5723 4.82189 13.2038 4.22998 13.5456V13.5456C3.32054 14.0717 3.00921 15.2351 3.53433 16.1451V16.1451L4.16591 17.2344C4.41263 17.6795 4.82659 18.0081 5.31618 18.1472C5.80577 18.2863 6.33062 18.2247 6.77461 17.9758V17.9758C7.21106 17.7211 7.73117 17.6513 8.21932 17.782C8.70748 17.9126 9.12322 18.2328 9.37415 18.6714C9.53868 18.9486 9.62709 19.2644 9.63044 19.5868V19.5868C9.63044 20.6433 10.4869 21.4998 11.5435 21.4998H12.7975C13.8505 21.4998 14.7055 20.6489 14.7105 19.5959V19.5959C14.7081 19.0878 14.9089 18.5998 15.2681 18.2405C15.6274 17.8812 16.1155 17.6804 16.6236 17.6829C16.9452 17.6915 17.2596 17.7795 17.5389 17.9392V17.9392C18.4517 18.4651 19.6179 18.1541 20.1476 17.2435V17.2435L20.8066 16.1451C21.0617 15.7073 21.1318 15.1858 21.0012 14.6961C20.8706 14.2065 20.5502 13.7891 20.111 13.5364V13.5364C19.6717 13.2837 19.3514 12.8663 19.2208 12.3767C19.0902 11.8871 19.1602 11.3656 19.4153 10.9277C19.5812 10.6381 19.8214 10.398 20.111 10.2321V10.2321C21.0161 9.70265 21.3264 8.54325 20.8066 7.63252V7.63252V7.62337Z", stroke: "current", strokeWidth: 1.5, evenOdd: true },
      { circle: { cx: 12.1751, cy: 11.8886, r: 2.63616 }, stroke: "current", strokeWidth: 1.5 },
    ],
  },
  "scan": {
    figma: { name: "Scan", file: "scan-1008-1064.svg" },
    elements: [
      { d: "M22.6315 13.0142H1.5", stroke: "current", strokeWidth: 1.5 },
      { d: "M20.7501 8.7779V6.82514C20.7501 4.996 19.2541 3.5 17.425 3.5H15.7812", stroke: "current", strokeWidth: 1.5 },
      { d: "M3.38152 8.7779V6.82095C3.38152 4.98867 4.866 3.50314 6.69829 3.50105L8.37867 3.5", stroke: "current", strokeWidth: 1.5 },
      { d: "M20.7501 13.0142V17.5451C20.7501 19.3732 19.2541 20.8703 17.425 20.8703H15.7812", stroke: "current", strokeWidth: 1.5 },
      { d: "M3.38152 13.0142V17.5493C3.38152 19.3816 4.866 20.8671 6.69829 20.8692L8.37867 20.8703", stroke: "current", strokeWidth: 1.5 },
    ],
  },
  "edit": {
    figma: { name: "Edit", file: "edit-1008-1448.svg" },
    elements: [
      { d: "M13.6996 19.8979H20.0766", stroke: "current", strokeWidth: 1.5 },
      { d: "M12.8549 4.95561C13.5919 4.01661 14.7829 4.06561 15.7229 4.80261L17.1129 5.89261C18.0529 6.62961 18.3859 7.77261 17.6489 8.71361L9.3599 19.2886C9.0829 19.6426 8.6599 19.8516 8.2099 19.8566L5.0129 19.8976L4.2889 16.7826C4.1869 16.3456 4.2889 15.8856 4.5659 15.5306L12.8549 4.95561Z", stroke: "current", strokeWidth: 1.5, evenOdd: true },
      { d: "M11.3026 6.93604L16.0966 10.694", stroke: "current", strokeWidth: 1.5 },
    ],
  },
  "arrow-right-square": {
    figma: { name: "Arrow - Right Square", file: "arrow-right-square-1008-1397.svg" },
    elements: [
      { d: "M21.25 16.334V7.665C21.25 4.645 19.111 2.75 16.084 2.75H7.916C4.889 2.75 2.75 4.635 2.75 7.665L2.75 16.334C2.75 19.364 4.889 21.25 7.916 21.25H16.084C19.111 21.25 21.25 19.364 21.25 16.334Z", stroke: "current", strokeWidth: 1.5, evenOdd: true },
      { d: "M16.086 12H7.914", stroke: "current", strokeWidth: 1.5 },
      { d: "M12.3223 8.25205L16.0863 12L12.3223 15.748", stroke: "current", strokeWidth: 1.5 },
    ],
  },
  "search": {
    figma: { name: "search-2", file: "search-2-1292-1548.svg" },
    elements: [
      { d: "M7.3832 18.031L3.1005 22.3137L1.6863 20.8995L5.969 16.6168C4.737 15.0769 4 13.124 4 11C4 6.032 8.032 2 13 2C17.968 2 22 6.032 22 11C22 15.968 17.968 20 13 20C10.876 20 8.9231 19.263 7.3832 18.031ZM8.1252 16.0247C9.3854 17.2475 11.1044 18 13 18C16.8675 18 20 14.8675 20 11C20 7.1325 16.8675 4 13 4C9.1325 4 6 7.1325 6 11C6 12.8956 6.7525 14.6146 7.9753 15.8748L8.1252 16.0247Z", fill: "current" },
    ],
  },
  "chevron-down": {
    figma: { name: "Arrow - Down 2", file: "arrow-down-2-1008-1434.svg" },
    elements: [
      { d: "M19 8.5L12 15.5L5 8.5", stroke: "current", strokeWidth: 1.5 },
    ],
  },
  "chevron-right": {
    figma: { name: "Arrow - Right 2", file: "arrow-right-2-1008-1399.svg" },
    elements: [
      { d: "M8.5 5L15.5 12L8.5 19", stroke: "icon-secondary", strokeWidth: 1.5 },
    ],
  },
  "save": {
    figma: { name: "save-line", file: "save-line-1372-1792.svg" },
    elements: [
      { d: "M7 19V13H17V19H19V7.82843L16.1716 5H5V19H7ZM4 3H17L21 7V20C21 20.5523 20.5523 21 20 21H4C3.44772 21 3 20.5523 3 20V4C3 3.44772 3.44772 3 4 3ZM9 15V19H15V15H9Z", fill: "icon-secondary" },
    ],
  },
  "add": {
    figma: { name: "add-fill", file: "add-fill-1355-1458.svg" },
    elements: [
      { d: "M11 11V5H13V11H19V13H13V19H11V13H5V11H11Z", fill: "current" },
    ],
  },
  "play": {
    figma: { name: "Play", file: "play-1008-1198.svg" },
    elements: [
      { d: "M12 2C17.5228 2 22 6.47716 22 12C22 17.5228 17.5228 22 12 22C6.47716 22 2 17.5228 2 12C2 6.47716 6.47716 2 12 2Z", stroke: "icon-placeholder", strokeWidth: 1.5, evenOdd: true },
      { d: "M15.0501 12.467C14.3211 13.253 12.3371 14.583 11.3221 15.01C11.1601 15.078 10.7471 15.222 10.6581 15.224C10.4691 15.23 10.2871 15.124 10.1991 14.954C10.1651 14.888 10.0651 14.457 10.0331 14.265C9.93811 13.681 9.88911 12.774 9.89011 11.862C9.88911 10.905 9.94211 9.95495 10.0481 9.37695C10.0761 9.22095 10.1581 8.86195 10.1821 8.80395C10.2271 8.69595 10.3091 8.61095 10.4081 8.55795C10.4841 8.51695 10.5711 8.49495 10.6581 8.49795C10.7471 8.49995 11.1091 8.62695 11.2331 8.67595C12.2111 9.05595 14.2801 10.434 15.0401 11.244C15.1081 11.317 15.2951 11.513 15.3261 11.553C15.3971 11.643 15.4321 11.752 15.4321 11.862C15.4321 11.964 15.4011 12.068 15.3371 12.155C15.3041 12.2 15.1131 12.4 15.0501 12.467Z", stroke: "icon-placeholder", strokeWidth: 1.5, evenOdd: true },
    ],
  },
  "film": {
    figma: { name: "film-line", file: "film-line-1436-2394.svg" },
    elements: [
      { d: "M2 3.9934C2 3.44476 2.45531 3 2.9918 3H21.0082C21.556 3 22 3.44495 22 3.9934V20.0066C22 20.5552 21.5447 21 21.0082 21H2.9918C2.44405 21 2 20.5551 2 20.0066V3.9934ZM8 5V19H16V5H8ZM4 5V7H6V5H4ZM18 5V7H20V5H18ZM4 9V11H6V9H4ZM18 9V11H20V9H18ZM4 13V15H6V13H4ZM18 13V15H20V13H18ZM4 17V19H6V17H4ZM18 17V19H20V17H18Z", fill: "icon-secondary" },
    ],
  },
  "profile": {
    figma: { name: "Profile", file: "profile-1008-1092.svg" },
    elements: [
      { circle: { cx: 11.579, cy: 7.27803, r: 4.77803 }, stroke: "current", strokeWidth: 1.5 },
      { d: "M4.00002 18.7016C3.99873 18.3657 4.07385 18.0339 4.2197 17.7313C4.67736 16.816 5.96798 16.3308 7.03892 16.1112C7.81128 15.9463 8.59431 15.8362 9.38217 15.7816C10.8408 15.6535 12.3079 15.6535 13.7666 15.7816C14.5544 15.8369 15.3374 15.947 16.1099 16.1112C17.1808 16.3308 18.4714 16.7702 18.9291 17.7313C19.2224 18.3481 19.2224 19.0642 18.9291 19.681C18.4714 20.6421 17.1808 21.0814 16.1099 21.2919C15.3384 21.4636 14.5551 21.5768 13.7666 21.6306C12.5794 21.7313 11.3866 21.7496 10.1968 21.6855C9.92221 21.6855 9.65677 21.6855 9.38217 21.6306C8.59663 21.5775 7.81632 21.4642 7.04807 21.2919C5.96798 21.0814 4.68652 20.6421 4.2197 19.681C4.0746 19.3749 3.99955 19.0403 4.00002 18.7016Z", stroke: "current", strokeWidth: 1.5, evenOdd: true },
    ],
  },
  "arrow-left": {
    figma: { name: "Arrow - Left", file: "arrow-left-1008-1420.svg" },
    elements: [
      { d: "M4.25 12.2739L19.25 12.2739", stroke: "current", strokeWidth: 1.5 },
      { d: "M10.2998 18.2985L4.2498 12.2745L10.2998 6.24951", stroke: "current", strokeWidth: 1.5 },
    ],
  },
  "arrow-right": {
    figma: { name: "Arrow - Right", file: "arrow-right-1008-1395.svg" },
    elements: [
      { d: "M19.75 11.7261L4.75 11.7261", stroke: "current", strokeWidth: 1.5 },
      { d: "M13.7002 5.70149L19.7502 11.7255L13.7002 17.7505", stroke: "current", strokeWidth: 1.5 },
    ],
  },
  "checkbox-selected": {
    figma: { name: "Checkbox- selected", file: "arrow-down-3-1008-1372.svg" },
    elements: [
      { d: "M16.3344 2.75024H7.6654C4.6444 2.75024 2.7504 4.88924 2.7504 7.91624V16.0842C2.7504 19.1112 4.6354 21.2502 7.6654 21.2502H16.3334C19.3644 21.2502 21.2504 19.1112 21.2504 16.0842V7.91624C21.2504 4.88924 19.3644 2.75024 16.3344 2.75024Z", fill: "surface-page", stroke: "icon-placeholder", strokeWidth: 1.5, evenOdd: true },
      { d: "M8.4399 12.0002L10.8139 14.3732L15.5599 9.6272", stroke: "icon-secondary", strokeWidth: 1.5 },
    ],
  },
  "checkbox-empty": {
    figma: { name: "Checkbox - Empty", file: "arrow-down-3-1008-1376.svg" },
    elements: [
      { d: "M16.3344 2.75024H7.6654C4.6444 2.75024 2.7504 4.88924 2.7504 7.91624V16.0842C2.7504 19.1112 4.6354 21.2502 7.6654 21.2502H16.3334C19.3644 21.2502 21.2504 19.1112 21.2504 16.0842V7.91624C21.2504 4.88924 19.3644 2.75024 16.3344 2.75024Z", stroke: "current", strokeWidth: 1.5, evenOdd: true },
    ],
  },
} satisfies Record<string, IconDefinition>;

const OWN = {
  "checkbox-mixed": {
    elements: [
      {
        d: FIGMA["checkbox-empty"].elements[0].d,
        stroke: "current",
        strokeWidth: 1.5,
        evenOdd: true,
      },
      { d: "M8.4399 12H15.5599", stroke: "icon-secondary", strokeWidth: 1.5 },
    ],
  },
  /* Confirm an edit (FE-025): a tick in the same line style; the document has
     no stand-alone one. */
  check: line("M4.75 12.25 9.5 17 19.25 7.25"),
  folder: line("M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"),
  image: line("M4 5h16v14H4zM4 16l4.5-4.5 3 3L15 11l5 5M9.5 9.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"),
  draw: line("M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M9 12h6M12 9v6"),
  "zoom-in": line("M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5.2-1.8L21 21M8 11h6M11 8v6"),
  "zoom-out": line("M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5.2-1.8L21 21M8 11h6"),
  reset: line("M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4"),
  trash: line("M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"),
  close: line("M6 6l12 12M18 6 6 18"),
  video: line("M4 6h11v12H4zM15 10l5-3v10l-5-3"),
  info: line("M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v6M12 7.5v.5"),
} satisfies Record<string, IconDefinition>;

export type IconName = keyof typeof FIGMA | keyof typeof OWN;

export const ICONS: Record<IconName, IconDefinition> = { ...FIGMA, ...OWN };
