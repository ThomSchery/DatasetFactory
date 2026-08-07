import { useId, type ReactNode } from "react";

import "./Field.css";

export type FieldWidth = "full" | "short";

export interface FieldControlProps {
  "aria-describedby": string | undefined;
  "aria-invalid": true | undefined;
  className: string;
  id: string;
}

export interface FieldProps {
  /** Renders the control itself, wired to the accessibility ids this owns. */
  children: (control: FieldControlProps) => ReactNode;
  description?: string;
  /** Validation message. Present means invalid — there is no separate flag. */
  error?: string;
  label: string;
  /** GRID-10: the control is as wide as the value it expects, not wider. */
  width?: FieldWidth;
}

/**
 * The chrome every form control shares: label, help text, validation message,
 * and the `aria-describedby` / `aria-invalid` wiring between them.
 *
 * `error` doubles as the invalid flag, so a caller cannot render a red border
 * with no message, or a message the control is not described by. Compose this
 * rather than repeating the wiring — `TextField` and `SelectField` both do.
 */
export function Field({ children, description, error, label, width = "full" }: FieldProps) {
  const controlId = useId();
  const descriptionId = `${controlId}-description`;
  const errorId = `${controlId}-error`;
  const describedBy = [
    description === undefined ? undefined : descriptionId,
    error === undefined ? undefined : errorId,
  ]
    .filter((value) => value !== undefined)
    .join(" ");

  return (
    <div className={`df-field df-field--${width}`}>
      <label className="df-field__label" htmlFor={controlId}>
        {label}
      </label>
      {description === undefined ? null : (
        <p className="df-field__description" id={descriptionId}>
          {description}
        </p>
      )}
      {children({
        "aria-describedby": describedBy === "" ? undefined : describedBy,
        "aria-invalid": error === undefined ? undefined : true,
        className: "df-field__control",
        id: controlId,
      })}
      {/* SPACING-04: the slot exists whether or not there is a message, so a
          validation error does not push the next field down the page. */}
      <p
        className="df-field__error"
        id={errorId}
        role={error === undefined ? undefined : "alert"}
      >
        {error}
      </p>
    </div>
  );
}
