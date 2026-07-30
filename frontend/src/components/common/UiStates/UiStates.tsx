import { useId, type ReactNode } from "react";

import { Button } from "../Button";
import "./UiStates.css";

export interface LoadingProps {
  label?: string;
}

export function Loading({ label = "Ładowanie…" }: LoadingProps) {
  return (
    <div aria-live="polite" className="df-ui-state df-ui-state--loading" role="status">
      <span aria-hidden="true" className="df-ui-state__spinner" />
      <span>{label}</span>
    </div>
  );
}

export interface EmptyProps {
  action?: ReactNode;
  description: string;
  title: string;
}

export function Empty({ action, description, title }: EmptyProps) {
  const titleId = useId();

  return (
    <section aria-labelledby={titleId} className="df-ui-state df-ui-state--panel">
      <p className="df-ui-state__eyebrow">Brak danych</p>
      <h2 className="df-ui-state__title" id={titleId}>
        {title}
      </h2>
      <p className="df-ui-state__description">{description}</p>
      {action ? <div className="df-ui-state__action">{action}</div> : null}
    </section>
  );
}

export interface InlineErrorProps {
  message: string;
}

export function InlineError({ message }: InlineErrorProps) {
  return (
    <div className="df-ui-state df-ui-state--inline-error" role="alert">
      <span aria-hidden="true" className="df-ui-state__marker" />
      <span>{message}</span>
    </div>
  );
}

export interface FatalErrorProps {
  description: string;
  onRetry?: () => void;
  retryLabel?: string;
  title?: string;
}

export function FatalError({
  description,
  onRetry,
  retryLabel = "Spróbuj ponownie",
  title = "Nie udało się wykonać operacji",
}: FatalErrorProps) {
  const titleId = useId();

  return (
    <section
      aria-labelledby={titleId}
      className="df-ui-state df-ui-state--panel df-ui-state--fatal-error"
      role="alert"
    >
      <p className="df-ui-state__eyebrow">Błąd</p>
      <h2 className="df-ui-state__title" id={titleId}>
        {title}
      </h2>
      <p className="df-ui-state__description">{description}</p>
      {onRetry ? (
        <div className="df-ui-state__action">
          <Button onClick={onRetry} variant="secondary">
            {retryLabel}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

export interface ProgressProps {
  label?: string;
  max?: number;
  value: number;
}

export function Progress({ label = "Postęp", max = 100, value }: ProgressProps) {
  const safeMax = max > 0 ? max : 100;
  const safeValue = Math.min(Math.max(value, 0), safeMax);
  const percentage = Math.round((safeValue / safeMax) * 100);

  return (
    <div className="df-ui-state df-ui-state--progress">
      <div className="df-ui-state__progress-label">
        <span>{label}</span>
        <strong>{percentage}%</strong>
      </div>
      <progress aria-label={label} max={safeMax} value={safeValue} />
    </div>
  );
}

