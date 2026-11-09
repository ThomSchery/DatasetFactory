import { ICON_PATHS, type IconName } from "./iconPaths";
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

export type { IconName };

export interface IconProps {
  name: IconName;
}

/** A decorative glyph; the control around it owns the accessible name. */
export function Icon({ name }: IconProps) {
  return (
    <svg aria-hidden="true" className="df-icon" focusable="false" viewBox="0 0 24 24">
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}
