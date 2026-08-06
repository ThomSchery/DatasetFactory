import { useId, type ReactNode } from "react";

import { WORKSPACE_MIN_WIDTH, useViewportWidth } from "./viewport";
import "./WidthGuard.css";

export interface WidthGuardProps {
  children: ReactNode;
}

/**
 * FE-07: below the minimum working width the application states that the
 * window is unsupported instead of squeezing the layout. Box review is not
 * usable on a narrow viewport, and a compressed editor would quietly produce
 * bad annotations rather than obviously refusing.
 */
export function WidthGuard({ children }: WidthGuardProps) {
  const width = useViewportWidth();
  const titleId = useId();

  if (width >= WORKSPACE_MIN_WIDTH) {
    return children;
  }

  return (
    <section aria-labelledby={titleId} className="df-width-guard">
      <p className="df-width-guard__eyebrow">Niewspierana szerokość</p>
      <h1 className="df-width-guard__title" id={titleId}>
        Okno jest za wąskie dla DatasetFactory
      </h1>
      <p className="df-width-guard__description">
        Weryfikacja boksów wymaga co najmniej {WORKSPACE_MIN_WIDTH} px szerokości okna. Obecnie
        masz {width} px. Rozszerz okno albo przenieś aplikację na większy monitor — układ nie
        zostanie ściśnięty, bo na wąskim ekranie praca z boksami przestaje być precyzyjna.
      </p>
    </section>
  );
}
