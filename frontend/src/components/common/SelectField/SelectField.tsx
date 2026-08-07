import type { Ref, SelectHTMLAttributes } from "react";

import { Field, type FieldWidth } from "../Field";

export interface SelectOption {
  label: string;
  value: string;
}

export interface SelectFieldProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "id" | "className" | "children"> {
  description?: string;
  /** Validation message. Present means invalid — there is no separate flag. */
  error?: string;
  label: string;
  options: readonly SelectOption[];
  /** Shown as a disabled first entry when no value is chosen yet. */
  placeholder?: string;
  ref?: Ref<HTMLSelectElement>;
  width?: FieldWidth;
}

/**
 * A native `<select>` with the shared `Field` chrome. Native rather than a
 * custom listbox: it is keyboard accessible for free and needs no overlay,
 * which keeps FE-001 free of a popup layer it has no other use for.
 */
export function SelectField({
  description,
  error,
  label,
  options,
  placeholder,
  ref,
  width,
  ...selectProps
}: SelectFieldProps) {
  return (
    <Field description={description} error={error} label={label} width={width}>
      {(control) => (
        <select {...selectProps} {...control} ref={ref}>
          {placeholder === undefined ? null : (
            <option disabled value="">
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}
