import { useId, type ReactNode } from "react";

import "./Panel.css";

export interface PanelProps {
  /** Rendered at the top right of the header, e.g. a status badge. */
  aside?: ReactNode;
  children: ReactNode;
  description?: string;
  /** Small uppercase label above the title; groups panels that belong together. */
  eyebrow?: string;
  title: string;
}

/**
 * A titled content section. Panels are separated by whitespace rather than by
 * borders (BORDER-02); the single weak outline exists only so a panel reads as
 * one surface, and matches `df-ui-state--panel` so the application has one
 * panel style rather than two.
 *
 * Always a landmark `<section>` labelled by its own heading, so the page has a
 * real outline for keyboard and screen reader users (FE-08).
 */
export function Panel({ aside, children, description, eyebrow, title }: PanelProps) {
  const titleId = useId();

  return (
    <section aria-labelledby={titleId} className="df-panel">
      <header className="df-panel__header">
        <div className="df-panel__heading">
          {eyebrow === undefined ? null : <p className="df-panel__eyebrow">{eyebrow}</p>}
          <h2 className="df-panel__title" id={titleId}>
            {title}
          </h2>
          {description === undefined ? null : (
            <p className="df-panel__description">{description}</p>
          )}
        </div>
        {aside === undefined ? null : <div className="df-panel__aside">{aside}</div>}
      </header>
      <div className="df-panel__body">{children}</div>
    </section>
  );
}
