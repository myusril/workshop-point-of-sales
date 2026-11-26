"use client";

import { Input } from "@/components/ui/input";

interface MoneyInputProps {
  id: string;
  /** Canonical digit string (no separators); never a float. */
  value: string;
  onChange: (digits: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
}

const MAX_DIGITS = 15;

function groupDigits(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Rupiah input (§6.8): digits only, live thousand grouping, "Rp" prefix
 * inside the field, no decimals, and the raw digit count while a value is
 * present. The value the caller receives is always a canonical digit string.
 *
 * The count is derived from `value` only. An earlier focus/blur state update
 * re-rendered the input during Tab traversal and made the dialog's focus scope
 * bounce focus to the dialog container, skipping every later field.
 */
export function MoneyInput({ id, value, onChange, disabled = false, invalid = false, describedBy }: MoneyInputProps) {
  return (
    <div className="bo-money-input">
      <span className="bo-money-input__prefix" aria-hidden="true">
        Rp
      </span>
      <Input
        id={id}
        className="bo-money-input__field"
        value={groupDigits(value)}
        inputMode="numeric"
        autoComplete="off"
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(event) => {
          onChange(event.currentTarget.value.replace(/\D/g, "").slice(0, MAX_DIGITS));
        }}
      />
      <span className="bo-money-input__count" aria-live="polite">
        {value.length > 0 ? `${value.length} digit` : ""}
      </span>
    </div>
  );
}
