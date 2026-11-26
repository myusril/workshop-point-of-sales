import type { ReactNode } from "react";

import { Label } from "@/components/ui/label";

interface FieldProps {
  /** Visible label text; the word "Wajib" is added for required fields. */
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
}

/**
 * Form field wrapper (§6.8): real `<label>`, required word rather than a bare
 * asterisk, helper text below the control, and error text that replaces the
 * helper and is linked by id. The control owns `aria-invalid`.
 */
export function Field({ label, htmlFor, required = false, hint, error, children }: FieldProps) {
  return (
    <div className="bo-field">
      <Label className="bo-field__label" htmlFor={htmlFor}>
        {label}
        {required ? <span className="bo-field__required"> Wajib</span> : null}
      </Label>
      {children}
      {error ? (
        <p className="bo-field__error" id={`${htmlFor}-error`}>
          {error}
        </p>
      ) : hint ? (
        <p className="bo-field__hint" id={`${htmlFor}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
