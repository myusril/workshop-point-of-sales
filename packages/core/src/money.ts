/**
 * Integer IDR money rules (PRD BR-001, BR-002, BR-004).
 *
 * Amounts are `bigint` rupiah — never `number`, never a float. Callers receive
 * API money as digit strings and convert with {@link parseIdr}; display uses
 * {@link formatIdr}. The only rounding in the system is per-line tax, which is
 * half-up to the nearest whole rupiah.
 */

/** Default PPN rate before the outlet settings override (PRD BR-002). */
export const DEFAULT_TAX_RATE_PERCENT = 11;

/** Rupiah has no minor unit; the scale exists to make that explicit. */
export const IDR_MINOR_UNIT = 0;

/** Guards absurd API input while staying far above realistic workshop totals. */
export const MAX_IDR_DIGITS = 15;

const IDR_PATTERN = /^(0|[1-9][0-9]*)$/;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

/** True for a canonical unsigned integer string with no leading zero. */
export function isIdrString(value: string): boolean {
  return value.length <= MAX_IDR_DIGITS && IDR_PATTERN.test(value);
}

/** Parses a canonical unsigned integer string into bigint rupiah. */
export function parseIdr(value: string): bigint {
  if (!isIdrString(value)) {
    throw new MoneyError("Jumlah uang harus berupa angka rupiah bulat tanpa desimal.");
  }
  return BigInt(value);
}

/** Serializes non-negative bigint rupiah for API transport. */
export function idrToString(value: bigint): string {
  if (value < 0n) {
    throw new MoneyError("Jumlah uang tidak boleh negatif.");
  }
  return value.toString();
}

/**
 * Parses human input such as `Rp 250.000`, `250000`, or `250.000` into bigint.
 * Dots and spaces are grouping; any other character is rejected so a decimal
 * comma (or a malformed paste) can never silently become a different amount.
 */
export function parseIdrInput(input: string): bigint {
  const compact = input.replace(/rp/gi, "").replace(/[\s.]/g, "");
  if (compact.length === 0 || !/^[0-9]+$/.test(compact) || compact.length > MAX_IDR_DIGITS) {
    throw new MoneyError("Masukkan angka rupiah tanpa desimal.");
  }
  return BigInt(compact);
}

export function addIdr(...amounts: readonly bigint[]): bigint {
  return amounts.reduce((total, amount) => total + amount, 0n);
}

export function sumIdr(amounts: Iterable<bigint>): bigint {
  let total = 0n;
  for (const amount of amounts) total += amount;
  return total;
}

/** quantity × unit price in integer rupiah; quantity must be a positive integer. */
export function multiplyIdrByQuantity(unitPrice: bigint, quantity: number): bigint {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new MoneyError("Jumlah barang harus bilangan bulat positif.");
  }
  if (unitPrice < 0n) {
    throw new MoneyError("Harga satuan tidak boleh negatif.");
  }
  return unitPrice * BigInt(quantity);
}

/**
 * Half-up rounding of numerator/denominator to a whole rupiah (BR-004).
 * Positive values round 0.5 upward; negative values round away from zero so a
 * future credit note cannot round in the customer's favour by accident.
 */
export function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) {
    throw new MoneyError("Pembagi pembulatan harus lebih besar dari nol.");
  }

  const negative = numerator < 0n;
  const magnitude = negative ? -numerator : numerator;
  const rounded = (magnitude + denominator / 2n) / denominator;
  return negative ? -rounded : rounded;
}

/** Validates a PPN rate: whole percent, 0–100 inclusive. */
export function isValidTaxRate(ratePercent: number): boolean {
  return Number.isInteger(ratePercent) && ratePercent >= 0 && ratePercent <= 100;
}

/**
 * Tax on a discounted line subtotal at the outlet rate, rounded half-up once.
 * AC3.1: 11% of 270000 = 29700. BR-004: 11% of 12345 = 1358.
 */
export function taxFromSubtotal(subtotal: bigint, ratePercent: number): bigint {
  if (subtotal < 0n) {
    throw new MoneyError("Subtotal pajak tidak boleh negatif.");
  }
  if (!isValidTaxRate(ratePercent)) {
    throw new MoneyError("Tarif pajak harus bilangan bulat 0 sampai 100.");
  }
  return roundHalfUp(subtotal * BigInt(ratePercent), 100n);
}

/**
 * Applies a whole-percent discount to a line subtotal with half-up rounding.
 * Discounts are not part of WP4's UI yet, but the money path must have exactly
 * one implementation before WP6 composes them.
 */
export function discountFromSubtotal(subtotal: bigint, percent: number): bigint {
  if (subtotal < 0n) {
    throw new MoneyError("Subtotal diskon tidak boleh negatif.");
  }
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
    throw new MoneyError("Diskon harus bilangan bulat 0 sampai 100 persen.");
  }
  return roundHalfUp(subtotal * BigInt(percent), 100n);
}

/** Order tax is the sum of already-rounded line taxes (BR-002). */
export function orderTax(lineTaxes: Iterable<bigint>): bigint {
  return sumIdr(lineTaxes);
}

/**
 * Formats bigint rupiah for display: `Rp 1.234.567` with a no-break space.
 * Negative amounts use U+2212 before the prefix (`−Rp 25.000`), and a positive
 * delta can force an explicit `+` sign.
 */
export function formatIdr(
  value: bigint,
  options: { sign?: "auto" | "always" } = {},
): string {
  const negative = value < 0n;
  const magnitude = negative ? -value : value;
  const digits = magnitude.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const sign = negative ? "\u2212" : options.sign === "always" && value > 0n ? "+" : "";
  return `${sign}Rp\u00a0${digits}`;
}
