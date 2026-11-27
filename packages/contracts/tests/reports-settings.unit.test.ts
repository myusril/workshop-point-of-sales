import { describe, expect, it } from "vitest";

import { auditListQuerySchema } from "../src/audit.ts";
import { exportLedgerQuerySchema, exportReportQuerySchema } from "../src/export.ts";
import {
  endOfDayReportSchema,
  reportRangeQuerySchema,
  stockValuationQuerySchema,
} from "../src/reports.ts";
import {
  OUTLET_SETTINGS_DEFAULTS,
  updateBrandingSchema,
  updateOutletSettingsSchema,
} from "../src/settings.ts";

describe("report query contracts", () => {
  it("accepts an inclusive one-day range and rejects reversed or overlong ranges", () => {
    expect(
      reportRangeQuerySchema.safeParse({ from: "2026-11-27", to: "2026-11-27" }).success,
    ).toBe(true);

    const reversed = reportRangeQuerySchema.safeParse({
      from: "2026-11-28",
      to: "2026-11-27",
    });
    expect(reversed.success).toBe(false);

    const overlong = reportRangeQuerySchema.safeParse({
      from: "2025-01-01",
      to: "2026-11-27",
    });
    expect(overlong.success).toBe(false);
  });

  it("rejects impossible business dates", () => {
    expect(
      reportRangeQuerySchema.safeParse({ from: "2026-02-29", to: "2026-03-01" }).success,
    ).toBe(false);
    expect(stockValuationQuerySchema.safeParse({ asOf: "2026-13-01" }).success).toBe(false);
  });

  it("requires a rendered zero state to carry every status key", () => {
    const withoutStatus = endOfDayReportSchema.safeParse({
      report: "end-of-day",
      outlet: { id: "00000000-0000-4000-8000-000000000001", name: "Outlet Pusat" },
      date: "2026-11-27",
      generatedAt: "2026-11-27T10:00:00.000Z",
      countsByStatus: { PAID: 0 },
      figures: {
        orderCount: 0,
        grossSales: "0",
        discounts: "0",
        tax: "0",
        netSales: "0",
      },
      paymentMix: { methods: [], expectedCash: "0", totalNet: "0", changeTotal: "0" },
      voids: [],
    });
    expect(withoutStatus.success).toBe(false);
  });
});

describe("audit and export query contracts", () => {
  it("defaults audit pagination and rejects unsupported page sizes", () => {
    const parsed = auditListQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(25);
    expect(auditListQuerySchema.safeParse({ pageSize: "30" }).success).toBe(false);
  });

  it("validates export dates and optional filters", () => {
    expect(
      exportReportQuerySchema.safeParse({ from: "2026-11-01", to: "2026-11-30" }).success,
    ).toBe(true);
    expect(
      exportLedgerQuerySchema.safeParse({ entryType: "SALE_DECREMENT" }).success,
    ).toBe(true);
    expect(
      exportLedgerQuerySchema.safeParse({ entryType: "UNKNOWN" }).success,
    ).toBe(false);
  });
});

describe("settings contracts", () => {
  const valid = {
    outletId: "00000000-0000-4000-8000-000000000001",
    taxRate: 11,
    cashierDiscountCapPercent: 0,
    idleTimeoutMinutes: 30,
    receiptPaperWidth: 58 as const,
    voidReasonMinLength: 10,
    receiptPrefix: "INV/",
    receiptHeaderText: "  Bengkel Contoh  ",
    receiptFooterText: "",
  };

  it("pins the PRD defaults", () => {
    expect(OUTLET_SETTINGS_DEFAULTS).toMatchObject({
      taxRate: 11,
      cashierDiscountCapPercent: 0,
      idleTimeoutMinutes: 30,
      receiptPaperWidth: 58,
      voidReasonMinLength: 10,
    });
  });

  it("trims text and treats an empty footer as absent", () => {
    const parsed = updateOutletSettingsSchema.parse(valid);
    expect(parsed.receiptHeaderText).toBe("Bengkel Contoh");
    expect(parsed.receiptFooterText).toBeNull();
  });

  it("rejects out-of-range tax, paper width, and prefix characters", () => {
    expect(updateOutletSettingsSchema.safeParse({ ...valid, taxRate: 101 }).success).toBe(false);
    expect(
      updateOutletSettingsSchema.safeParse({ ...valid, receiptPaperWidth: 70 }).success,
    ).toBe(false);
    expect(
      updateOutletSettingsSchema.safeParse({ ...valid, receiptPrefix: "INV #1" }).success,
    ).toBe(false);
  });

  it("accepts a relative or https logo and rejects script-like values", () => {
    expect(
      updateBrandingSchema.safeParse({ productName: "Bengkel Kita", logoPath: "/logo.svg" })
        .success,
    ).toBe(true);
    expect(
      updateBrandingSchema.safeParse({
        productName: "Bengkel Kita",
        logoPath: "https://example.com/logo.svg",
      }).success,
    ).toBe(true);
    expect(
      updateBrandingSchema.safeParse({
        productName: "Bengkel Kita",
        logoPath: "javascript:alert(1)",
      }).success,
    ).toBe(false);
  });
});
