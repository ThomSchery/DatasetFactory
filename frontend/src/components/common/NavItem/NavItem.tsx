import type { ReactNode } from "react";
import { NavLink } from "react-router";

import "./NavItem.css";

export interface NavItemProps {
  /** Route path this item navigates to. */
  to: string;
  children: ReactNode;
  /** Optional one-line explanation shown under the label. */
  description?: string;
  /** Match the path exactly instead of by prefix; needed for `/`. */
  end?: boolean;
}

/**
 * The only way to render a navigation link in the application.
 *
 * `NavLink` sets `aria-current="page"` on the active item, so the active state
 * is announced rather than being colour-only (TYPO-18/20).
 */
export function NavItem({ to, children, description, end = false }: NavItemProps) {
  return (
    <NavLink
      className={({ isActive }) =>
        isActive ? "df-nav-item df-nav-item--active" : "df-nav-item"
      }
      end={end}
      to={to}
    >
      <span className="df-nav-item__label">{children}</span>
      {description === undefined ? null : (
        <span className="df-nav-item__description">{description}</span>
      )}
    </NavLink>
  );
}
