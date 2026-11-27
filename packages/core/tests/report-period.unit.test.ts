import { describe, expect, it } from "vitest";

import {
  addBusinessDays,
  businessDateOf,
  businessDayDistance,
  formatJakartaTimestamp,
  isBusinessDate,
  jakartaDayEndExclusiveUtc,
  jakartaDayStartUtc,
  jakartaRangeUtc,
  listBusinessDates,
  normalizeBusinessDateRange,
  ReportPeriodError,
  todayBusinessDate,
} from "../src/report-period.ts";

describe("Asia/Jakarta business dates (BR-010)", () => {
  it("assigns the Jakarta day, not the UTC day, to a late-evening instant", () => {
    expect(businessDateOf("2026-11-27T18:30:00.000Z")).toBe("2026-11-28");
    expect(businessDateOf("2026-11-27T16:59:59.999Z")).toBe("2026-11-27");
    expect(businessDateOf("2026-11-27T17:00:00.000Z")).toBe("2026-11-28");
  });

  it("assigns the Jakarta day to an early-morning instant", () => {
    expect(businessDateOf("2026-11-27T00:00:00.000Z")).toBe("2026-11-27");
    expect(businessDateOf(new Date("2026-12-31T17:00:00.000Z"))).toBe("2027-01-01");
  });

  it("derives today from the instant, not the host timezone", () => {
    expect(todayBusinessDate(new Date("2026-06-01T20:00:00.000Z"))).toBe("2026-06-02");
  });

  it("converts a date to a half-open UTC window", () => {
    const start = jakartaDayStartUtc("2026-11-27");
    const end = jakartaDayEndExclusiveUtc("2026-11-27");
    expect(start.toISOString()).toBe("2026-11-26T17:00:00.000Z");
    expect(end.toISOString()).toBe("2026-11-27T17:00:00.000Z");

    const range = jakartaRangeUtc("2026-11-27", "2026-11-28");
    expect(range.start.toISOString()).toBe("2026-11-26T17:00:00.000Z");
    expect(range.endExclusive.toISOString()).toBe("2026-11-28T17:00:00.000Z");
  });

  it("adds calendar days across month and year boundaries", () => {
    expect(addBusinessDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addBusinessDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addBusinessDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addBusinessDays("2028-02-29", 1)).toBe("2028-03-01");
    expect(addBusinessDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("lists every inclusive date and distances them", () => {
    expect(listBusinessDates("2026-11-27", "2026-11-29")).toEqual([
      "2026-11-27",
      "2026-11-28",
      "2026-11-29",
    ]);
    expect(listBusinessDates("2026-11-27", "2026-11-27")).toEqual(["2026-11-27"]);
    expect(businessDayDistance("2026-11-27", "2026-12-27")).toBe(30);
  });

  it("renders an explicit +07:00 timestamp for CSV", () => {
    expect(formatJakartaTimestamp("2026-11-27T00:05:00.000Z")).toBe(
      "2026-11-27T07:05:00+07:00",
    );
    expect(formatJakartaTimestamp("2026-11-27T18:30:45.000Z")).toBe(
      "2026-11-28T01:30:45+07:00",
    );
  });

  it("rejects malformed or impossible dates and reversed ranges", () => {
    expect(isBusinessDate("2026-02-29")).toBe(false);
    expect(isBusinessDate("2028-02-29")).toBe(true);
    expect(isBusinessDate("2026-13-01")).toBe(false);
    expect(() => jakartaDayStartUtc("2026-11-31")).toThrow(ReportPeriodError);
    expect(() => normalizeBusinessDateRange("2026-11-28", "2026-11-27")).toThrow(
      ReportPeriodError,
    );
    expect(() => listBusinessDates("2026-11-28", "2026-11-27")).toThrow(ReportPeriodError);
  });
});
