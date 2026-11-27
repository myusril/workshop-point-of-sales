import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type {
  AuditEntry,
  DailySalesReport,
  EndOfDayReport,
  PaymentMixReport,
  StockValuationReport,
  TechnicianProductivityReport,
} from "@workshop-pos/contracts";

import { AuditTable } from "../components/audit/audit-table";
import {
  DailySalesTable,
  PaymentMixTable,
  SalesFiguresSummary,
  StockValuationTable,
  TechnicianTable,
  VoidsTable,
} from "../components/reports/report-tables";

const OUTLET = { id: "00000000-0000-4000-8000-000000000001", name: "Outlet Pusat" };

function dailyReport(overrides: Partial<DailySalesReport> = {}): DailySalesReport {
  return {
    report: "daily-sales",
    outlet: OUTLET,
    from: "2026-11-27",
    to: "2026-11-27",
    generatedAt: "2026-11-27T10:00:00.000Z",
    days: [
      {
        date: "2026-11-27",
        countsByStatus: {
          DRAFT: 1,
          ESTIMATED: 0,
          APPROVED: 0,
          IN_PROGRESS: 0,
          COMPLETED: 1,
          PAID: 3,
          VOID: 1,
        },
        figures: {
          orderCount: 3,
          grossSales: "500000",
          discounts: "30000",
          tax: "29700",
          netSales: "499700",
        },
      },
      {
        date: "2026-11-28",
        countsByStatus: {
          DRAFT: 0,
          ESTIMATED: 0,
          APPROVED: 0,
          IN_PROGRESS: 0,
          COMPLETED: 0,
          PAID: 0,
          VOID: 0,
        },
        figures: {
          orderCount: 0,
          grossSales: "0",
          discounts: "0",
          tax: "0",
          netSales: "0",
        },
      },
    ],
    totals: {
      countsByStatus: {
        DRAFT: 1,
        ESTIMATED: 0,
        APPROVED: 0,
        IN_PROGRESS: 0,
        COMPLETED: 1,
        PAID: 3,
        VOID: 1,
      },
      figures: {
        orderCount: 3,
        grossSales: "500000",
        discounts: "30000",
        tax: "29700",
        netSales: "499700",
      },
    },
    ...overrides,
  };
}

function paymentMix(): PaymentMixReport {
  return {
    report: "payment-mix",
    outlet: OUTLET,
    from: "2026-11-27",
    to: "2026-11-27",
    generatedAt: "2026-11-27T10:00:00.000Z",
    methods: [
      {
        method: "CASH",
        payments: "424700",
        refunds: "75000",
        net: "349700",
        change: "300",
      },
      { method: "TRANSFER", payments: "100000", refunds: "0", net: "100000", change: "0" },
      { method: "QRIS", payments: "50000", refunds: "0", net: "50000", change: "0" },
    ],
    expectedCash: "349700",
    totalNet: "499700",
    changeTotal: "300",
  };
}

function endOfDay(): EndOfDayReport {
  return {
    report: "end-of-day",
    outlet: OUTLET,
    date: "2026-11-27",
    generatedAt: "2026-11-27T10:00:00.000Z",
    countsByStatus: dailyReport().days[0]!.countsByStatus,
    figures: dailyReport().days[0]!.figures,
    paymentMix: {
      methods: paymentMix().methods,
      expectedCash: "349700",
      totalNet: "499700",
      changeTotal: "300",
    },
    voids: [
      {
        orderId: "11111111-1111-4111-8111-111111111111",
        orderNumber: "INV-804",
        voidedAt: "2026-11-27T07:00:00.000Z",
        total: "75000",
        reason: "Salah input pelanggan",
      },
    ],
  };
}

describe("report tables", () => {
  it("renders every status, exact money, and an explicit zero day", () => {
    const html = renderToStaticMarkup(<DailySalesTable report={dailyReport()} />);
    expect(html).toContain("Tanggal");
    expect(html).toContain("Dibatalkan");
    expect(html).toContain("Rp\u00a0499.700");
    expect(html).toContain("Rp\u00a00");
    expect(html.match(/28 Nov 2026/g)?.length ?? 0).toBeGreaterThan(0);
    expect(html).toContain("Total");
  });

  it("shows expected cash in words and the cash change separate from net", () => {
    const html = renderToStaticMarkup(<PaymentMixTable report={paymentMix()} />);
    expect(html).toContain("Tunai");
    expect(html).toContain("Kas diharapkan");
    expect(html).toContain("Rp\u00a0349.700");
    expect(html).toContain("Rp\u00a0300");
    expect(html).toContain("Rp\u00a075.000");
  });

  it("renders a refund-only day as negative expected cash, never a false zero", () => {
    const report = paymentMix();
    report.methods = [
      {
        method: "CASH",
        payments: "0",
        refunds: "75000",
        net: "-75000",
        change: "0",
      },
      { method: "TRANSFER", payments: "0", refunds: "0", net: "0", change: "0" },
      { method: "QRIS", payments: "0", refunds: "0", net: "0", change: "0" },
    ];
    report.expectedCash = "-75000";
    report.totalNet = "-75000";
    const html = renderToStaticMarkup(<PaymentMixTable report={report} />);
    expect(html).toContain("−Rp\u00a075.000");
  });

  it("shows an explicit empty state instead of inventing technician rows", () => {
    const report: TechnicianProductivityReport = {
      report: "technician-productivity",
      outlet: OUTLET,
      from: "2026-11-27",
      to: "2026-11-27",
      generatedAt: "2026-11-27T10:00:00.000Z",
      technicians: [],
    };
    const html = renderToStaticMarkup(<TechnicianTable report={report} />);
    expect(html).toContain("Belum ada pekerjaan selesai");
    expect(html).not.toContain("<table");
  });

  it("states the valuation date and totals on-hand × cost", () => {
    const report: StockValuationReport = {
      report: "stock-valuation",
      outlet: OUTLET,
      asOf: "2026-11-27",
      generatedAt: "2026-11-27T10:00:00.000Z",
      items: [
        {
          productId: "22222222-2222-4222-8222-222222222222",
          sku: "BRK-801",
          name: "Kampas rem",
          onHand: 19,
          unitCost: "150000",
          value: "2850000",
        },
      ],
      totalValue: "2850000",
    };
    const html = renderToStaticMarkup(<StockValuationTable report={report} />);
    expect(html).toContain("BRK-801");
    expect(html).toContain("Rp\u00a02.850.000");
    expect(html).toContain("Total nilai persediaan");
  });

  it("renders void reasons and the day summary", () => {
    const report = endOfDay();
    const voidHtml = renderToStaticMarkup(<VoidsTable report={report} />);
    expect(voidHtml).toContain("Salah input pelanggan");
    expect(voidHtml).toContain("INV-804");
    const summaryHtml = renderToStaticMarkup(<SalesFiguresSummary report={report} />);
    expect(summaryHtml).toContain("Kas diharapkan");
    expect(summaryHtml).toContain("Rp\u00a0499.700");
  });

  it("renders an explicit empty void state", () => {
    const html = renderToStaticMarkup(
      <VoidsTable report={{ ...endOfDay(), voids: [] }} />,
    );
    expect(html).toContain("Tidak ada transaksi yang dibatalkan");
  });
});

describe("audit table", () => {
  const entry: AuditEntry = {
    id: "33333333-3333-4333-8333-333333333333",
    createdAt: "2026-11-27T07:00:00.000Z",
    actorId: "wp8_owner",
    actorName: "Rina Uji",
    action: "settings.updated",
    entityType: "settings",
    entityId: "44444444-4444-4444-8444-444444444444",
    outletId: OUTLET.id,
    outletName: OUTLET.name,
    reason: null,
    before: { taxRate: 11 },
    after: { taxRate: 12 },
  };

  it("renders actor, action, timestamp, and a before/after diff", () => {
    const html = renderToStaticMarkup(<AuditTable items={[entry]} />);
    expect(html).toContain("Rina Uji");
    expect(html).toContain("Pengaturan outlet diubah");
    expect(html).toContain("27 November 2026, 14.00 WIB");
    expect(html).toContain("Lihat perubahan");
    expect(html).toContain("taxRate");
    expect(html).toContain("11");
    expect(html).toContain("12");
  });

  it("renders an explicit empty state for a filtered result", () => {
    const html = renderToStaticMarkup(<AuditTable items={[]} />);
    expect(html).toContain("Tidak ada entri audit");
  });
});
