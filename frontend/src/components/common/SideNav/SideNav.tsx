import { useEffect, useRef, type KeyboardEvent, type RefObject } from "react";
import { useLocation } from "react-router";

import { Icon, type IconName } from "../Icon";
import { NavItem } from "../NavItem";
import "./SideNav.css";

/*
 * The Figma `sidebar` (FE-022): the four sections of the workflow as a bar of
 * 24 px icons. The user chose how it behaves on 2026-11-05:
 *
 *  - from 768 px it is a visible strip; the top bar's ☰ collapses and
 *    restores it;
 *  - below 768 px it is hidden, and ☰ opens it as a drawer over the screen
 *    and closes it again.
 *
 * FE-023: ☰ is the only control; the side bar has no `|←` of its own. The
 * drawer opens below the top bar, so ☰ stays visible and clickable above the
 * scrim. It is a modal layer otherwise: focus moves to the first section and is
 * trapped there, Escape and a click on the scrim close it, and focus returns to
 * ☰. Both forms render the same `NavItem` links, so the active section keeps
 * `aria-current` and every item has a name — the strip shows it as a tooltip.
 */

export interface SideNavItem {
  path: string;
  label: string;
  description: string;
  icon: IconName;
  end?: boolean;
}

export type SideNavMode = "strip" | "drawer";

export interface SideNavProps {
  /** Element id, so ☰ can point at the bar with `aria-controls`. */
  id: string;
  items: readonly SideNavItem[];
  /** Accessible name of the navigation landmark. */
  label: string;
  mode: SideNavMode;
  /** Strip: shown rather than collapsed. Drawer: open. */
  open: boolean;
  /** Drawer: close (Escape, scrim, a chosen section). The strip closes only from ☰. */
  onClose: () => void;
  /** Where focus goes when the drawer closes — the ☰ that opened it. */
  returnFocusRef: RefObject<HTMLElement | null>;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function SideNav({ id, items, label, mode, open, onClose, returnFocusRef }: SideNavProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const drawerOpen = mode === "drawer" && open;

  // Choosing a section is the answer the drawer was opened for.
  useEffect(() => {
    if (mode === "drawer") {
      closeRef.current();
    }
    // Only a change of address closes it, not a re-render.
  }, [location.pathname, mode]);

  useEffect(() => {
    if (!drawerOpen) {
      return;
    }
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    const opener = returnFocusRef.current;
    return () => {
      if (opener !== null && opener.isConnected) {
        opener.focus();
      }
    };
  }, [drawerOpen, returnFocusRef]);

  function trapFocus(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") {
      return;
    }
    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE),
    ).filter((element) => element.closest("[hidden]") === null);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (first === undefined || last === undefined) {
      event.preventDefault();
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const list = (
    <ul className="df-side-nav__list">
      {items.map((item) => (
        <li key={item.path}>
          <NavItem
            end={item.end}
            icon={<Icon name={item.icon} />}
            title={`${item.label} — ${item.description}`}
            to={item.path}
            variant={mode === "strip" ? "strip" : "rail"}
          >
            {item.label}
          </NavItem>
        </li>
      ))}
    </ul>
  );

  if (mode === "strip") {
    return (
      <nav aria-label={label} className="df-side-nav df-side-nav--strip" hidden={!open} id={id}>
        {list}
      </nav>
    );
  }

  return (
    <div className="df-side-nav-drawer" hidden={!open} id={id}>
      <div
        aria-hidden="true"
        className="df-side-nav-drawer__scrim"
        data-testid="side-nav-scrim"
        onPointerDown={onClose}
      />
      <div
        aria-label={label}
        aria-modal="true"
        className="df-side-nav df-side-nav--drawer"
        onKeyDown={trapFocus}
        ref={panelRef}
        role="dialog"
      >
        <nav aria-label={label}>{list}</nav>
      </div>
    </div>
  );
}
