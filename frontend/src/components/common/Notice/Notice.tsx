import { useId, type ReactNode } from "react";

import "./Notice.css";

export type NoticeTone = "info" | "warning" | "error";

export interface NoticeProps {
  children: ReactNode;
  title: string;
  tone?: NoticeTone;
}

/**
 * A message that stays on screen for as long as its condition holds.
 *
 * Deliberately has no dismiss control and no internal state: the OCR quality
 * warning (FE-001-F2 §Logika.5) must not be dismissible, and a component that
 * could hide itself would make that impossible to guarantee. Use `InlineError`
 * from `UiStates` for the transient result of one action instead.
 *
 * `role="status"` rather than `alert`: the notice is usually present from first
 * paint, and an assertive live region would interrupt the user on every render.
 */
export function Notice({ children, title, tone = "info" }: NoticeProps) {
  const titleId = useId();

  return (
    <section
      aria-labelledby={titleId}
      className={`df-notice df-notice--${tone}`}
      role="status"
    >
      <p className="df-notice__title" id={titleId}>
        {title}
      </p>
      <div className="df-notice__body">{children}</div>
    </section>
  );
}
