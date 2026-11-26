/**
 * Plate normalization (PRD BR-006, AC4.4).
 *
 * Canonical form is uppercase A–Z and 0–9 with all whitespace removed.
 * Normalization is idempotent: `b1234xyz`, `B 1234 XYZ`, and `B1234XYZ` all
 * resolve to `B1234XYZ`.
 */

/** Indonesian plates are short; the cap rejects pasted paragraphs. */
export const PLATE_MAX_LENGTH = 12;

/** Strips whitespace and symbols, uppercases, and keeps only A–Z/0–9. */
export function normalizePlate(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isNormalizedPlate(input: string): boolean {
  return (
    input.length > 0 &&
    input.length <= PLATE_MAX_LENGTH &&
    /^[A-Z0-9]+$/.test(input)
  );
}

/** True when the input normalizes to a non-empty, length-bounded plate. */
export function isValidPlate(input: string): boolean {
  return isNormalizedPlate(normalizePlate(input));
}

/** Compares two plate strings after normalization. */
export function platesMatch(left: string, right: string): boolean {
  const normalizedLeft = normalizePlate(left);
  return normalizedLeft.length > 0 && normalizedLeft === normalizePlate(right);
}
