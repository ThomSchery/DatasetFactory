import { useEffect, useRef, type RefObject } from "react";
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
 * scrim. The open drawer is modal, and its scope is ☰ plus the panel:
 *
 *  - the shell (FIX2) turns the element holding both into the labelled modal
 *    (`role="dialog"`, `aria-modal`) and makes everything else in it `inert`;
 *    nothing moves in the DOM, so ☰ keeps focus and identity;
 *  - focus moves to the first section, Tab and Shift+Tab cycle ☰ ↔ the
 *    sections, Escape closes it and focus returns to ☰ (FIX1);
 *  - those keys are the drawer's only when they come from its scope and no
 *    other modal layer is open (FIX2): a native `<dialog>` above it keeps its
 *    own Tab and Escape. A key the drawer handles stops there, so the page's
 *    window-level shortcuts (e.g. Escape ending draw mode) never see it;
 *  - choosing a section closes the drawer before the navigation runs, so a
 *    guard such as "Unsaved changes" opens alone (FIX2); a click on the scrim
 *    closes it too.
 *
 * Both forms render the same `NavItem` links, so the active section keeps
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
  /** The ☰ that opens the drawer: part of its focus cycle, and where focus
   * returns when it closes. */
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

  // Keyboard scope of the open drawer: ☰ and the sections (FE-023 FIX1/FIX2).
  // Window capture runs before any page handler; the drawer takes a key only
  // when it owns the interaction, and then stops it there.
  useEffect(() => {
    if (!drawerOpen) {
      return;
    }
    const owns = (target: EventTarget | null): boolean => {
      const panel = panelRef.current;
      const toggle = returnFocusRef.current;
      if (panel === null) {
        return false;
      }
      // Another modal layer (a native dialog shown above the drawer) owns its keys.
      const layerAbove = Array.from(document.querySelectorAll("dialog[open]")).some(
        (dialog) => !panel.contains(dialog),
      );
      if (layerAbove || !(target instanceof Node)) {
        return false;
      }
      // Focus may also have dropped to the page after a tap on the inert page.
      return panel.contains(target) || (toggle?.contains(target) ?? false)
        || target === document.body || target === document.documentElement;
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.key !== "Escape" && event.key !== "Tab") || !owns(event.target)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        closeRef.current();
        return;
      }
      const toggle = returnFocusRef.current;
      const sections = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
      const scope = (toggle === null ? sections : [toggle, ...sections]).filter(
        (element) => element.closest("[hidden], [inert]") === null,
      );
      if (scope.length === 0) {
        return;
      }
      const current = scope.indexOf(document.activeElement as HTMLElement);
      const step = event.shiftKey ? -1 : 1;
      const next = current === -1
        ? (event.shiftKey ? scope.length - 1 : 0)
        : (current + step + scope.length) % scope.length;
      scope[next]?.focus();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [drawerOpen, returnFocusRef]);

  const list = (
    <ul
      className="df-side-nav__list"
      onClick={(event) => {
        // A chosen section closes the drawer before its navigation lands, so a
        // navigation guard (unsaved changes) never opens under the drawer.
        if (mode === "drawer" && event.target instanceof Element && event.target.closest("a") !== null) {
          closeRef.current();
        }
      }}
    >
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
      <div className="df-side-nav df-side-nav--drawer" ref={panelRef}>
        <nav aria-label={label}>{list}</nav>
      </div>
    </div>
  );
}
