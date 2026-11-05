import type { InputHTMLAttributes, Ref } from "react";

import { Field, type FieldWidth } from "../Field";
import type { IconName } from "../Icon";

export interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "className"> {
  description?: string;
  /** Validation message. Present means invalid — there is no separate flag. */
  error?: string;
  hideLabel?: boolean;
  label: string;
  labelIcon?: IconName;
  ref?: Ref<HTMLInputElement>;
  /** A unit drawn inside the control after the value, e.g. `ms`. */
  suffix?: string;
  width?: FieldWidth;
}

/** A single-line text control with the shared `Field` chrome around it. */
export function TextField({
  description,
  error,
  hideLabel,
  label,
  labelIcon,
  ref,
  suffix,
  width,
  ...inputProps
}: TextFieldProps) {
  return (
    <Field
      description={description}
      error={error}
      hideLabel={hideLabel}
      label={label}
      labelIcon={labelIcon}
      width={width}
    >
      {(control) =>
        suffix === undefined ? (
          <input {...inputProps} {...control} ref={ref} />
        ) : (
          <div className="df-field__affix">
            <input {...inputProps} {...control} ref={ref} />
            <span aria-hidden="true" className="df-field__suffix">
              {suffix}
            </span>
          </div>
        )
      }
    </Field>
  );
}
