import type { ButtonHTMLAttributes, ReactNode } from "react";

import "./Button.css";

export type ButtonVariant = "primary" | "secondary" | "muted";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  loading?: boolean;
  loadingLabel?: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
}

export function Button({
  children,
  className,
  disabled = false,
  loading = false,
  loadingLabel = "Ładowanie…",
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
      type={type}
    >
      <span className="df-button__content">{children}</span>
      {loading ? <span aria-hidden="true" className="df-button__spinner" /> : null}
    </button>
  );
}

