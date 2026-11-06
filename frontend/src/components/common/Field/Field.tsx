import { useId, type ReactNode } from "react";

import { Icon, type IconName } from "../Icon";
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
  /** Keeps the label for assistive technology only (a Figma field with a placeholder). */
  hideLabel?: boolean;
  label: string;
  /** 24 px glyph before the label, as Figma draws `Source file` and `Sample rate`. */
  labelIcon?: IconName;
  /** GRID-10: the control is as wide as the value it expects, not wider. */
  width?: FieldWidth;
}

/**
 * The chrome every form control shares: label, help text, validation message,
 * and the `aria-describedby` / `aria-invalid` wiring between them.
 *
 * `error` doubles as the invalid flag, so a caller cannot render a red border
 * with no message, or a message the control is not described by. Compose this
 * rather than repeating the wiring — `TextField` does.
 *
 * FE-022: `description` is no longer drawn under the label (Figma has no help
 * paragraphs); it stays as hidden text the control is described by, so the
 * explanation still reaches a screen reader.
 */
export function Field({
  children,
  description,
  error,
  hideLabel = false,
  label,
  labelIcon,
  width = "full",
}: FieldProps) {
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
      <label
        className={hideLabel ? "df-field__label df-visually-hidden" : "df-field__label"}
        htmlFor={controlId}
      >
        {labelIcon === undefined ? null : <Icon name={labelIcon} />}
        <span>{label}</span>
      </label>
      {description === undefined ? null : (
        <p className="df-visually-hidden" id={descriptionId}>
          {description}
        </p>
      )}
      <div className="df-field__target">
        <label aria-hidden="true" className="df-field__touch" htmlFor={controlId} />
        {children({
          "aria-describedby": describedBy === "" ? undefined : describedBy,
          "aria-invalid": error === undefined ? undefined : true,
          className: "df-field__control",
          id: controlId,
        })}
      </div>
      {/* SPACING-04: the message gets a slot only while it exists; it opens
          below the control and does not move the control itself. */}
      <p
        className="df-field__error"
        hidden={error === undefined}
        id={errorId}
        role={error === undefined ? undefined : "alert"}
      >
        {error}
      </p>
    </div>
  );
}
