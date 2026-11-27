/**
 * Business-date assignment for reports (PRD BR-010, FR-068).
 *
 * A business date is the Asia/Jakarta calendar day of the order's payment (or
 * creation time when no payment exists yet). Jakarta has a fixed UTC+07:00
 * offset and observes no daylight saving, so day boundaries below are plain
 * calendar arithmetic — never a local-machine timezone.
 *
 * The database stores UTC timestamps. Every report converts a timestamp to its
 * Jakarta date here and converts a date range back to a half-open UTC window,
 * so an order can never appear on two days or drift with the server locale.
 */

export const JAKARTA_TIME_ZONE = "Asia/Jakarta";
export const JAKARTA_OFFSET = "+07:00";

const JAKARTA_OFFSET_MINUTES = 7 * 60;
const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const jakartaDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: JAKARTA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export class ReportPeriodError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReportPeriodError";
  }
}

function parseDateParts(value: string): { year: number; month: number; day: number } {
  const match = DATE_PATTERN.exec(value);
  if (!match) {
    throw new ReportPeriodError(`Tanggal tidak valid: ${value}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new ReportPeriodError(`Tanggal tidak valid: ${value}`);
  }
  return { year, month, day };
}

/** True for a real calendar date in `YYYY-MM-DD` form. */
export function isBusinessDate(value: string): boolean {
  try {
    parseDateParts(value);
    return true;
  } catch {
    return false;
  }
}

function toDate(value: Date | string): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ReportPeriodError("Waktu tidak valid.");
  }
  return date;
}

/**
 * The Asia/Jakarta calendar day of an instant, as `YYYY-MM-DD`.
 * `2026-11-27T18:30:00Z` is `2026-11-28` in Jakarta.
 */
export function businessDateOf(value: Date | string): string {
  return jakartaDateFormatter.format(toDate(value));
}

/** Today's business date in Jakarta, independent of the host timezone. */
export function todayBusinessDate(now: Date = new Date()): string {
  return businessDateOf(now);
}

/** Calendar arithmetic on a validated business date. */
export function addBusinessDays(date: string, days: number): string {
  const { year, month, day } = parseDateParts(date);
  if (!Number.isInteger(days)) {
    throw new ReportPeriodError("Selisih hari harus bilangan bulat.");
  }
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

/** Inclusive list of every business date between `from` and `to`. */
export function listBusinessDates(from: string, to: string): string[] {
  const start = jakartaDayStartUtc(from);
  const endExclusive = jakartaDayStartUtc(addBusinessDays(to, 1));
  if (endExclusive.getTime() <= start.getTime()) {
    throw new ReportPeriodError("Tanggal akhir harus sama atau setelah tanggal awal.");
  }

  const dates: string[] = [];
  const days = Math.round((endExclusive.getTime() - start.getTime()) / MS_PER_DAY);
  for (let index = 0; index < days; index += 1) {
    dates.push(addBusinessDays(from, index));
  }
  return dates;
}

/** Whole-day distance between two business dates. */
export function businessDayDistance(from: string, to: string): number {
  const start = parseDateParts(from);
  const end = parseDateParts(to);
  const startMs = Date.UTC(start.year, start.month - 1, start.day);
  const endMs = Date.UTC(end.year, end.month - 1, end.day);
  return Math.round((endMs - startMs) / MS_PER_DAY);
}

/** First instant (UTC) of a Jakarta business date: 00:00:00+07:00. */
export function jakartaDayStartUtc(date: string): Date {
  const { year, month, day } = parseDateParts(date);
  return new Date(
    Date.UTC(year, month - 1, day, 0, 0, 0) - JAKARTA_OFFSET_MINUTES * MS_PER_MINUTE,
  );
}

/** First instant (UTC) of the day after `date` — an exclusive upper bound. */
export function jakartaDayEndExclusiveUtc(date: string): Date {
  return jakartaDayStartUtc(addBusinessDays(date, 1));
}

/**
 * Half-open UTC window covering the inclusive Jakarta date range
 * `from … to`, suitable for `timestamp >= start AND timestamp < endExclusive`.
 */
export function jakartaRangeUtc(
  from: string,
  to: string,
): { start: Date; endExclusive: Date } {
  const start = jakartaDayStartUtc(from);
  const endExclusive = jakartaDayEndExclusiveUtc(to);
  if (endExclusive.getTime() <= start.getTime()) {
    throw new ReportPeriodError("Rentang tanggal tidak valid.");
  }
  return { start, endExclusive };
}

/**
 * ISO 8601 instant rendered in Jakarta local time with an explicit offset:
 * `2026-11-27T07:05:00+07:00`. Used by CSV exports (FR-066) so a spreadsheet
 * never has to guess the timezone.
 */
export function formatJakartaTimestamp(value: Date | string): string {
  const date = toDate(value);
  const shifted = new Date(date.getTime() + JAKARTA_OFFSET_MINUTES * MS_PER_MINUTE);
  return `${shifted.toISOString().slice(0, 19)}${JAKARTA_OFFSET}`;
}

/** The Jakarta business date's display range as `from … to` (inclusive). */
export function normalizeBusinessDateRange(from: string, to: string): {
  from: string;
  to: string;
} {
  if (!isBusinessDate(from) || !isBusinessDate(to)) {
    throw new ReportPeriodError("Rentang tanggal tidak valid.");
  }
  if (businessDayDistance(from, to) < 0) {
    throw new ReportPeriodError("Tanggal akhir tidak boleh mendahului tanggal awal.");
  }
  return { from, to };
}
