import { formatIdr as formatIdrCore, parseIdr } from "@workshop-pos/core";

export type IdrInput = bigint | string | number;

function toBigInt(value: IdrInput): bigint | null {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    return Number.isSafeInteger(value) ? BigInt(value) : null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  try {
    return parseIdr(trimmed);
  } catch {
    return null;
  }
}

/**
 * Formats an API money string (or bigint) as `Rp 1.234.567`. Unknown or
 * malformed values render the em dash the design system requires for failed
 * data — never a plausible-looking `Rp 0` (§9.3).
 */
export function formatIdr(value: IdrInput | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const amount = toBigInt(value);
  return amount === null ? "—" : formatIdrCore(amount);
}

/** Formats a signed stock/money delta with an explicit `+` when positive. */
export function formatIdrDelta(value: IdrInput | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const amount = toBigInt(value);
  return amount === null ? "—" : formatIdrCore(amount, { sign: "always" });
}

const WIB_TIME_ZONE = "Asia/Jakarta";

const wibDateTime = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: WIB_TIME_ZONE,
});

const wibDate = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: WIB_TIME_ZONE,
});

function parseTimestamp(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `26 November 2026, 14.05 WIB` for audit and ledger timestamps (§9.5). */
export function formatWibDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = parseTimestamp(value);
  if (!date) return "—";
  const parts = wibDateTime.formatToParts(date);
  const lookup = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  const day = lookup("day");
  const month = lookup("month");
  const year = lookup("year");
  const hour = lookup("hour");
  const minute = lookup("minute");
  return `${day} ${month} ${year}, ${hour}.${minute} WIB`;
}

/** `26 Nov 2026` for dense table cells (§9.5). */
export function formatWibDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = parseTimestamp(value);
  return date ? wibDate.format(date) : "—";
}

/**
 * Signed stock quantity with the typographic minus from the design system
 * (`−1`, not `-1`). Unknown values stay an em dash.
 */
export function formatStockQuantity(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value < 0 ? `\u2212${Math.abs(value)}` : String(value);
}

/** Signed ledger delta: `+5`, `−2`, or `0`, never a bare hyphen. */
export function formatStockDelta(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (value > 0) return `+${value}`;
  return value < 0 ? `\u2212${Math.abs(value)}` : "0";
}


