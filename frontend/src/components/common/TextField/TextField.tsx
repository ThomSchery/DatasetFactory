import type { InputHTMLAttributes, Ref } from "react";

import { Field, type FieldWidth } from "../Field";

export interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "className"> {
  description?: string;
  /** Validation message. Present means invalid — there is no separate flag. */
  error?: string;
  label: string;
  ref?: Ref<HTMLInputElement>;
  width?: FieldWidth;
}

/** A single-line text control with the shared `Field` chrome around it. */
export function TextField({
  description,
  error,
  label,
  ref,
  width,
  ...inputProps
}: TextFieldProps) {
  return (
    <Field description={description} error={error} label={label} width={width}>
      {(control) => <input {...inputProps} {...control} ref={ref} />}
    </Field>
  );
}
