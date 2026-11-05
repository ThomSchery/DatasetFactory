import type { ReactNode } from "react";
import { NavLink } from "react-router";

import "./NavItem.css";

/**
 * `rail` is the stacked list item the menu uses. `segment` is the pill the
 * Figma document draws for the Upload / Profil / Run switch: same link, same
 * active semantics, different shape (FE-021).
 */
/** `strip` is the icon-only item of the FE-022 side bar; its label stays as
 * accessible text and as the tooltip. */
export type NavItemVariant = "rail" | "segment" | "strip";

export interface NavItemProps {
  /** Route path this item navigates to. */
  to: string;
  children: ReactNode;
  /** Optional one-line explanation shown under the label. */
  description?: string;
  /** Match the path exactly instead of by prefix; needed for `/`. */
  end?: boolean;
  variant?: NavItemVariant;
  /** Decorative mark before the label; must carry no meaning of its own. */
  icon?: ReactNode;
  /** Native tooltip; the strip variant shows only an icon. */
  title?: string;
}

/**
 * The only way to render a navigation link in the application.
 *
 * `NavLink` sets `aria-current="page"` on the active item, so the active state
 * is announced rather than being colour-only (TYPO-18/20).
 */
export function NavItem({
  to,
  children,
  description,
  end = false,
  variant = "rail",
  icon,
  title,
}: NavItemProps) {
  const base = `df-nav-item df-nav-item--${variant}`;
  return (
    <NavLink
      className={({ isActive }) => (isActive ? `${base} df-nav-item--active` : base)}
      end={end}
      title={title}
      to={to}
    >
      {icon === undefined ? null : (
        <span aria-hidden="true" className="df-nav-item__icon">
          {icon}
        </span>
      )}
      <span
        className={
          variant === "strip" ? "df-nav-item__label df-visually-hidden" : "df-nav-item__label"
        }
      >
        {children}
      </span>
      {description === undefined ? null : (
        <span className="df-nav-item__description">{description}</span>
      )}
    </NavLink>
  );
}
