import { ICONS, type IconName } from "./iconPaths";
import "./Icon.css";

/*
 * The marks the Figma document draws beside labels and inside square buttons,
 * 24 px as in the document (FE-022). Every one of them is decorative: the
 * control it sits in always carries its own text or accessible name, so the
 * glyph is `aria-hidden` and never the only way to tell two controls apart
 * (COLOR-09).
 *
 * They are inline SVG rather than an icon font or a package: they must inherit
 * `currentColor`, and a font would be another file to serve offline. Since
 * FE-025 the data is the Figma vectors themselves (`iconPaths.ts`); each
 * element's paint is a data attribute that `Icon.css` resolves to a token.
 */

export type { IconName };

export interface IconProps {
  name: IconName;
}

/** A decorative glyph; the control around it owns the accessible name. */
export function Icon({ name }: IconProps) {
  return (
    <svg aria-hidden="true" className="df-icon" data-icon={name} fill="none" focusable="false" viewBox="0 0 24 24">
      {ICONS[name].elements.map((element, index) => {
        const paint = {
          "clipRule": element.evenOdd === true ? "evenodd" : undefined,
          "data-fill": element.fill,
          "data-stroke": element.stroke,
          "fillRule": element.evenOdd === true ? "evenodd" : undefined,
          "strokeWidth": element.strokeWidth,
        } as const;
        return element.circle === undefined ? (
          <path d={element.d} key={index} {...paint} />
        ) : (
          <circle cx={element.circle.cx} cy={element.circle.cy} key={index} r={element.circle.r} {...paint} />
        );
      })}
    </svg>
  );
}
