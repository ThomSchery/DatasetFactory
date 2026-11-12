import { useEffect, useId, useRef, useState } from "react";
import { Outlet, useLocation, useMatches } from "react-router";

import { AppMenu } from "../components/common/AppMenu";
import { Button } from "../components/common/Button";
import { Icon } from "../components/common/Icon";
import { NavItem } from "../components/common/NavItem";
import { SideNav } from "../components/common/SideNav";
import { useTouchTargets } from "../components/common/TouchTargets/useTouchTargets";
import { BREAKPOINTS } from "../styles/breakpoints";
import { OcrEngineDialog } from "./OcrEngineDialog";
import {
  MENU_DESTINATIONS,
  SECTION_DESTINATIONS,
  WORKSPACE_DESTINATIONS,
  WORKSPACE_SWITCH_PATHS,
} from "./navigation";
import "./AppShell.css";

const MAIN_CONTENT_ID = "df-main";
/** Figma: below the `md` breakpoint the side bar is hidden and ☰ opens it as a drawer. */
const STRIP_MIN_WIDTH = BREAKPOINTS.md;

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

function useStripLayout(): boolean {
  const [wide, setWide] = useState(() => window.innerWidth >= STRIP_MIN_WIDTH);
  useEffect(() => {
    const update = () => {
      setWide(window.innerWidth >= STRIP_MIN_WIDTH);
    };
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
    };
  }, []);
  return wide;
}

/**
 * Application shell, as the Figma document of 2026-11-05 draws it (FE-022):
 * a 44 px bar holding only ☰ and ⋮ (☰ is the side bar's only control, FE-023:
 * the strip collapses and returns from it, the drawer opens and closes from it),
 * the side bar with the four sections, the
 * Upload / Profile / Run switch on those three screens, and the routed region.
 *
 * Every route stays reachable: the sections are in the side bar, Exports and
 * the OCR engine report are behind ⋮. The page heading is kept for assistive
 * technology even where the design draws none.
 */
export function AppShell() {
  useTouchTargets();
  const handle = useRouteHandle();
  const location = useLocation();
  const strip = useStripLayout();
  const [stripOpen, setStripOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [ocrOpen, setOcrOpen] = useState(false);
  const navId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const navVisible = strip ? stripOpen : drawerOpen;
  /* FE-023 FIX1/FIX2: the open drawer is modal, and its scope is ☰ plus the
     panel. The shell is the element that holds both, so while the drawer is
     open it is the labelled modal dialog, and the rest of it — the bar's other
     controls, the skip link and the page — is inert: not clickable, not
     focusable, not exposed to assistive technology. No element moves, so ☰
     keeps focus across open and close. Closed, the shell is a plain container
     and ☰ an ordinary header button. */
  const drawerModal = !strip && drawerOpen;
  const outsideDrawer = drawerModal ? true : undefined;
  const showSwitch = WORKSPACE_SWITCH_PATHS.includes(location.pathname);

  return (
    <div
      aria-label={drawerModal ? "Sections" : undefined}
      aria-modal={drawerModal ? true : undefined}
      className="df-shell"
      data-strip={strip && stripOpen ? "open" : "closed"}
      role={drawerModal ? "dialog" : undefined}
    >
      <a className="df-shell__skip" href={`#${MAIN_CONTENT_ID}`} inert={outsideDrawer}>
        Skip to content
      </a>

      <header className="df-shell__bar">
        <Button
          aria-controls={navId}
          aria-expanded={navVisible}
          aria-label="Sections"
          className="df-shell__toggle"
          onClick={() => {
            if (strip) {
              setStripOpen((open) => !open);
            } else {
              setDrawerOpen((open) => !open);
            }
          }}
          ref={toggleRef}
          title="Sections"
          variant="muted"
        >
          <Icon name="menu" />
        </Button>
        <nav aria-label="More destinations" className="df-shell__more" inert={outsideDrawer}>
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
        mode={strip ? "strip" : "drawer"}
        onClose={() => {
          // Only the drawer closes itself; the strip answers to ☰ alone.
          setDrawerOpen(false);
        }}
        open={navVisible}
        returnFocusRef={toggleRef}
      />

      <main className="df-shell__main" id={MAIN_CONTENT_ID} inert={outsideDrawer}>
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
