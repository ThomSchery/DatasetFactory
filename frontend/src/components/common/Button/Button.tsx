import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";

import "./Button.css";

export type ButtonVariant = "primary" | "secondary" | "muted";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  loading?: boolean;
  loadingLabel?: string;
  /** Needed where a roving tabindex has to move focus onto this control. */
  ref?: Ref<HTMLButtonElement>;
  size?: ButtonSize;
  variant?: ButtonVariant;
}

export function Button({
  children,
  className,
  disabled = false,
  loading = false,
  loadingLabel = "Ładowanie…",
  ref,
  size = "md",
  type = "button",
  variant = "primary",
  "aria-label": ariaLabel,
  ...buttonProps
}: ButtonProps) {
  const classes = [
    "df-button",
    `df-button--${variant}`,
    `df-button--${size}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      {...buttonProps}
      aria-busy={loading || undefined}
      aria-label={loading ? loadingLabel : ariaLabel}
      className={classes}
      data-loading={loading || undefined}
      disabled={disabled || loading}
      ref={ref}
      type={type}
    >
      <span className="df-button__content">{children}</span>
      {loading ? <span aria-hidden="true" className="df-button__spinner" /> : null}
    </button>
  );
}

