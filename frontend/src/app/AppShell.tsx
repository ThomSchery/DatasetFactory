import { useId, useRef, useState } from "react";
import { Outlet, useLocation, useMatches } from "react-router";

import { AppMenu } from "../components/common/AppMenu";
import { Button } from "../components/common/Button";
import { Icon } from "../components/common/Icon";
import { NavItem } from "../components/common/NavItem";
import { SideNav } from "../components/common/SideNav";
import { useTouchTargets } from "../components/common/TouchTargets/useTouchTargets";
import { OcrEngineDialog } from "./OcrEngineDialog";
import {
  MENU_DESTINATIONS,
  SECTION_DESTINATIONS,
  WORKSPACE_DESTINATIONS,
  WORKSPACE_SWITCH_PATHS,
} from "./navigation";
import "./AppShell.css";

const MAIN_CONTENT_ID = "df-main";

interface RouteHandle {
  heading?: string;
  /** The screen draws its own visible `<h1>` (Run Setup, Review frames). */
  headingInScreen?: boolean;
}

function useRouteHandle(): RouteHandle {
  const matches = useMatches();
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const handle = matches[index].handle as RouteHandle | undefined;
    if (handle?.heading !== undefined) {
      return handle;
    }
  }
  return { heading: "DatasetFactory" };
}

/**
 * Final mockup frame: a compact top bar, collapsible icon rail at every width,
 * shared Upload / Profile / Run switch and the live routed screen. Exports and
 * OCR diagnostics stay reachable from More. The heading remains accessible.
 */
export function AppShell() {
  useTouchTargets();
  const handle = useRouteHandle();
  const location = useLocation();
  const [stripOpen, setStripOpen] = useState(true);
  const [ocrOpen, setOcrOpen] = useState(false);
  const navId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const showSwitch = WORKSPACE_SWITCH_PATHS.includes(location.pathname);

  return (
    <div className="df-shell" data-strip={stripOpen ? "open" : "closed"}>
      <a className="df-shell__skip" href={`#${MAIN_CONTENT_ID}`}>
        Skip to content
      </a>

      <header className="df-shell__bar">
        <Button
          aria-controls={navId}
          aria-expanded={stripOpen}
          aria-label="Sections"
          className="df-shell__toggle"
          onClick={() => { setStripOpen((open) => !open); }}
          ref={toggleRef}
          title="Sections"
          variant="muted"
        >
          <Icon name="menu" />
        </Button>
        <nav aria-label="More destinations" className="df-shell__more">
          <AppMenu
            actions={(close) => (
              <li>
                <Button
                  className="df-shell__menu-action"
                  onClick={() => {
                    close();
                    setOcrOpen(true);
                  }}
                  variant="muted"
                >
                  <Icon name="info" />
                  OCR engine
                </Button>
              </li>
            )}
            destinations={MENU_DESTINATIONS}
            label="More"
          />
        </nav>
      </header>

      <SideNav
        id={navId}
        items={SECTION_DESTINATIONS}
        label="Sections"
        mode="strip"
        onClose={() => { setStripOpen(false); }}
        open={stripOpen}
        returnFocusRef={toggleRef}
      />

      <main className="df-shell__main" id={MAIN_CONTENT_ID}>
        <div className="df-shell__content">
        {handle.headingInScreen === true ? null : (
          <h1 className="df-visually-hidden">{handle.heading}</h1>
        )}
        {showSwitch ? (
          <nav aria-label="Workspace steps" className="df-shell__switch">
            <ul className="df-shell__segments">
              {WORKSPACE_DESTINATIONS.map((destination) => (
                <li key={destination.path}>
                  <NavItem
                    end={destination.end}
                    icon={<Icon name={destination.icon} />}
                    to={destination.path}
                    variant="segment"
                  >
                    {destination.label}
                  </NavItem>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
        <Outlet />
        </div>
      </main>

      <OcrEngineDialog
        onClose={() => {
          setOcrOpen(false);
        }}
        open={ocrOpen}
      />
    </div>
  );
}
