import { Outlet, useMatches } from "react-router";

import { AppMenu } from "../components/common/AppMenu";
import { Icon } from "../components/common/Icon";
import { NavItem } from "../components/common/NavItem";
import { NAV_DESTINATIONS, WORKSPACE_DESTINATIONS } from "./navigation";
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
 * Application shell: a compact bar, the three-way workspace switch from the
 * Figma document, the menu that holds every other destination, and the routed
 * region.
 *
 * FE-021 replaced the fixed 280 px rail with this. The rail spent a quarter of
 * a 1200 px window on navigation that the design puts in one row, and the
 * screens underneath need that width for the image they are built around. No
 * destination was dropped: what the switch does not show, the menu does.
 *
 * The shell renders no data of its own — the `runId` it links to comes from
 * the URL, never from local state.
 */
export function AppShell() {
  const heading = useRouteHeading();
  return (
    <div className="df-shell">
      <a className="df-shell__skip" href={`#${MAIN_CONTENT_ID}`}>
        Przejdź do treści
      </a>

      <header className="df-shell__bar">
        <p className="df-shell__brand">DatasetFactory</p>
        <h1 className="df-shell__heading">{heading}</h1>
        {/* The complete destination map, so the switch below can stay at the
            three steps the design draws without hiding anything. */}
        <nav aria-label="Nawigacja główna">
          <AppMenu destinations={NAV_DESTINATIONS} label="Wszystkie sekcje" />
        </nav>
      </header>

      <nav aria-label="Kroki workspace'u" className="df-shell__switch">
        <ul className="df-shell__segments">
          {WORKSPACE_DESTINATIONS.map((destination) => (
            <li key={destination.path}>
              <NavItem
                end={destination.end}
                icon={destination.icon === undefined ? undefined : <Icon name={destination.icon} />}
                to={destination.path}
                variant="segment"
              >
                {destination.label}
              </NavItem>
            </li>
          ))}
        </ul>
      </nav>

      <main className="df-shell__main" id={MAIN_CONTENT_ID}>
        <Outlet />
      </main>
    </div>
  );
}
