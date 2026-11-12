import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router";

import { Button } from "../Button";
import { Icon } from "../Icon";
import { NavItem } from "../NavItem";
import "./AppMenu.css";

/*
 * The Figma document keeps a single mark in the top bar for everything the
 * three-way switch does not show. That mark cannot be decoration: the
 * destinations behind it — dashboard, annotations, exports — are the only way
 * to reach whole parts of the product, so this is a real disclosure with a
 * name, `aria-expanded`, Escape, an outside click and focus return.
 *
 * The list stays in the DOM when collapsed and carries `hidden` instead, so
 * `aria-controls` always points at an element that exists and the collapsed
 * links never enter the tab order (same rule as `CollapsibleGroup`).
 */

export interface AppMenuDestination {
  path: string;
  label: string;
  description: string;
  end?: boolean;
}

export interface AppMenuProps {
  destinations: readonly AppMenuDestination[];
  /** Accessible name of the toggle, e.g. "More". */
  label: string;
  /**
   * Menu rows that are not routes (FE-022: "OCR engine"). Each receives a
   * `close` callback so it can dismiss the menu before opening its own layer.
   */
  actions?: (close: () => void) => ReactNode;
}

export function AppMenu({ actions, destinations, label }: AppMenuProps) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const location = useLocation();

  // Navigating is the answer to "where do I go", so the menu has done its job
  // and closes itself rather than covering the screen it just opened.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: PointerEvent) {
      const container = containerRef.current;
      if (container !== null && !container.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <div
      className="df-app-menu"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          setOpen(false);
          toggleRef.current?.focus();
        }
      }}
      ref={containerRef}
    >
      <Button
        aria-controls={listId}
        aria-expanded={open}
        aria-label={label}
        onClick={() => {
          setOpen((current) => !current);
        }}
        ref={toggleRef}
        size="sm"
        title={label}
        variant="muted"
      >
        <Icon name="more" />
      </Button>
      <ul className="df-app-menu__list" hidden={!open} id={listId}>
        {destinations.map((destination) => (
          <li key={destination.path}>
            <NavItem
              description={destination.description}
              end={destination.end}
              to={destination.path}
            >
              {destination.label}
            </NavItem>
          </li>
        ))}
        {actions === undefined
          ? null
          : actions(() => {
              setOpen(false);
            })}
      </ul>
    </div>
  );
}
