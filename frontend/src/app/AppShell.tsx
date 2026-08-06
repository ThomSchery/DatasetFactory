import { Outlet, useMatch, useMatches } from "react-router";

import { NavItem } from "../components/common/NavItem";
import { StatusBadge } from "../components/common/StatusBadge";
import { NAV_DESTINATIONS, PIPELINE_STAGES, annotationsPath } from "./navigation";
import "./AppShell.css";

const MAIN_CONTENT_ID = "df-main";

interface RouteHandle {
  heading?: string;
}

function useRouteHeading(): string {
  const matches = useMatches();
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const handle = matches[index].handle as RouteHandle | undefined;
    if (handle?.heading !== undefined) {
      return handle.heading;
    }
  }
  return "DatasetFactory";
}

/**
 * Application shell: the five FE-04 destinations, the five pipeline stages and
 * the routed region. It renders no data of its own — the `runId` it links to
 * comes from the URL, never from local state.
 */
export function AppShell() {
  const heading = useRouteHeading();
  // The only source of the current run: the URL itself (FE-04).
  const annotationsMatch = useMatch("/annotations/:runId");
  const runId = annotationsMatch?.params.runId;

  return (
    <div className="df-shell">
      <a className="df-shell__skip" href={`#${MAIN_CONTENT_ID}`}>
        Przejdź do treści
      </a>

      <nav aria-label="Nawigacja główna" className="df-shell__rail">
        <p className="df-shell__brand">DatasetFactory</p>

        <ul className="df-shell__destinations">
          {NAV_DESTINATIONS.map((destination) => {
            const path =
              destination.path ?? (runId === undefined ? null : annotationsPath(runId));
            return (
              <li key={destination.label}>
                {path === null ? (
                  <span className="df-shell__destination-disabled">
                    <span className="df-shell__destination-label">{destination.label}</span>
                    <span className="df-shell__destination-description">
                      {destination.description}
                    </span>
                    <StatusBadge srLabel="Stan destynacji:" tone="muted">
                      Wymaga runu
                    </StatusBadge>
                  </span>
                ) : (
                  <NavItem
                    description={destination.description}
                    end={destination.end}
                    to={path}
                  >
                    {destination.label}
                  </NavItem>
                )}
              </li>
            );
          })}
        </ul>

        <section aria-labelledby="df-shell-stages" className="df-shell__stages">
          <h2 className="df-shell__stages-title" id="df-shell-stages">
            Etapy pipeline&apos;u
          </h2>
          <ol className="df-shell__stage-list">
            {PIPELINE_STAGES.map((stage) => (
              <li className="df-shell__stage" key={stage.label}>
                <span className="df-shell__stage-label">{stage.label}</span>
                {stage.inV1 ? null : (
                  <StatusBadge srLabel="Zakres:" tone="muted">
                    Poza v1
                  </StatusBadge>
                )}
                <span className="df-shell__stage-description">{stage.description}</span>
              </li>
            ))}
          </ol>
        </section>
      </nav>

      <main className="df-shell__main" id={MAIN_CONTENT_ID}>
        <h1 className="df-shell__heading">{heading}</h1>
        <Outlet />
      </main>
    </div>
  );
}
