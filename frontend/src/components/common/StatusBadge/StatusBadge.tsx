import type { ReactNode } from "react";

import "./StatusBadge.css";

/**
 * `muted` is the tone for "not part of this version" — deliberately not a
 * status hue, because COLOR-09 reserves error/warning/success hue ranges for
 * actual status and SAM 3 being out of v1 is neither a warning nor a failure.
 */
export type StatusTone = "neutral" | "muted" | "brand" | "success" | "warning" | "error";

export interface StatusBadgeProps {
  children: ReactNode;
  tone?: StatusTone;
  /**
   * Prefix read by assistive tech, e.g. "Status:". The badge is not
   * interactive, so meaning must not rest on colour alone.
   */
  srLabel?: string;
}

export function StatusBadge({ children, tone = "neutral", srLabel }: StatusBadgeProps) {
  return (
    <span className={`df-status-badge df-status-badge--${tone}`}>
      {srLabel === undefined ? null : <span className="df-status-badge__sr">{srLabel} </span>}
      {children}
    </span>
  );
}
