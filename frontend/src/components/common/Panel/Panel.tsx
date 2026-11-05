import { useId, type ReactNode } from "react";

import "./Panel.css";

export type PanelRadius = "sm" | "md";

export interface PanelProps {
  /** Rendered at the right of the label, e.g. a status badge. */
  aside?: ReactNode;
  children: ReactNode;
  /** Optional feature layout hook; the visual authority remains `df-panel`. */
  className?: string;
  /**
   * Keeps the label for assistive technology only. Several Figma panels carry
   * no visible label (the class groups, the run fields), yet every section
   * still needs a name in the page outline.
   */
  hideTitle?: boolean;
  /** Figma draws lists with radius 4 and the named panels with radius 8. */
  radius?: PanelRadius;
  title: string;
}

/**
 * A labelled content section, drawn as the Figma document draws it since
 * FE-022: a flat surface with a single `border/default` outline, a 12 px label
 * and nothing else — no eyebrow, no 20 px title, no explanatory paragraph.
 * Text that used to explain a panel now lives in an accessible name, a
 * tooltip or the dialog where the decision is taken.
 *
 * Always a landmark `<section>` labelled by its own heading, so the page keeps
 * a real outline for keyboard and screen reader users (FE-08).
 */
export function Panel({
  aside,
  children,
  className,
  hideTitle = false,
  radius = "md",
  title,
}: PanelProps) {
  const titleId = useId();
  const classes = ["df-panel", `df-panel--radius-${radius}`, className].filter(Boolean).join(" ");

  return (
    <section aria-labelledby={titleId} className={classes}>
      {hideTitle && aside === undefined ? (
        <h2 className="df-panel__title df-visually-hidden" id={titleId}>
          {title}
        </h2>
      ) : (
        <header className="df-panel__header">
          <h2
            className={hideTitle ? "df-panel__title df-visually-hidden" : "df-panel__title"}
            id={titleId}
          >
            {title}
          </h2>
          {aside === undefined ? null : <div className="df-panel__aside">{aside}</div>}
        </header>
      )}
      <div className="df-panel__body">{children}</div>
    </section>
  );
}
