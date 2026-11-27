import { describe, expect, it } from "vitest";

import { formatIdr } from "../src/money.ts";
import {
  buildReceiptTemplate,
  formatReceiptTimestamp,
  RECEIPT_COLUMNS,
  wrapReceiptText,
  type ReceiptTemplateInput,
} from "../src/receipt.ts";

/**
 * AC3.1 receipt: subtotal 300000, discount 30000, tax 29700, total 299700,
 * cash tendered 300000, change 300. Rendered at both paper widths.
 */
function ac31(overrides: Partial<ReceiptTemplateInput> = {}): ReceiptTemplateInput {
  return {
    documentKind: "RECEIPT",
    paperWidth: 58,
    outletName: "Bengkel Contoh Jaya",
    headerText: "Jl. Contoh No. 1, Jakarta",
    footerText: "Terima kasih",
    orderNumber: "INV/2026/000001",
    orderDate: "2026-11-27T07:05:00.000Z",
    cashierName: "Dewi Lestari",
    customerName: "Budi Santoso",
    vehiclePlate: "B1234XYZ",
    vehicleLabel: "Honda Beat 110",
    technicianName: "Agus Saputra",
    lines: [
      {
        lineType: "PRODUCT",
        description: "Kampas rem depan",
        quantity: 1,
        unitPrice: 250_000n,
        discountAmount: 0n,
        lineTotal: 250_000n,
      },
      {
        lineType: "SERVICE",
        description: "Ganti oli mesin",
        quantity: 1,
        unitPrice: 50_000n,
        discountAmount: 0n,
        lineTotal: 50_000n,
      },
    ],
    subtotal: 300_000n,
    discountTotal: 30_000n,
    taxRatePercent: 11,
    taxTotal: 29_700n,
    total: 299_700n,
    payments: [{ method: "CASH", amount: 300_000n }],
    paidTotal: 299_700n,
    changeTotal: 300n,
    status: "PAID",
    ...overrides,
  };
}

function expectWidths(rows: readonly string[], columns: number): void {
  for (const row of rows) {
    expect(row.split("\n")).toHaveLength(1);
    expect(row.length).toBeLessThanOrEqual(columns);
  }
}

describe("receipt template", () => {
  it("uses 35 columns for 58 mm paper and 48 for 80 mm", () => {
    expect(RECEIPT_COLUMNS).toEqual({ 58: 35, 80: 48 });
    expect(buildReceiptTemplate(ac31({ paperWidth: 58 })).columns).toBe(35);
    expect(buildReceiptTemplate(ac31({ paperWidth: 80 })).columns).toBe(48);
  });

  it("prints every AC3.1 figure at both widths", () => {
    for (const paperWidth of [58, 80] as const) {
      const document = buildReceiptTemplate(ac31({ paperWidth }));
      const text = document.rows.join("\n");

      expect(document.title).toBe("STRUK");
      expect(text).toContain("BENGKEL CONTOH JAYA");
      expect(text).toContain("INV/2026/000001");
      expect(text).toContain("Kampas rem depan");
      expect(text).toContain("Ganti oli mesin");
      expect(text).toContain(formatIdr(300_000n));
      expect(text).toContain(formatIdr(30_000n));
      expect(text).toContain("PPN 11%");
      expect(text).toContain(formatIdr(29_700n));
      expect(text).toContain("TOTAL");
      expect(text).toContain(formatIdr(299_700n));
      expect(text).toContain("Tunai");
      expect(text).toContain("Kembali");
      expect(text).toContain(formatIdr(300n));
      expect(text).toContain("Budi Santoso");
      expect(text).toContain("B1234XYZ");
      expect(text).toContain("Agus Saputra");
      expectWidths(document.rows, document.columns);
    }
  });

  it("stamps a reprint SALINAN and a void DIBATALKAN without changing figures", () => {
    const original = buildReceiptTemplate(ac31());
    const reprint = buildReceiptTemplate(ac31({ isReprint: true }));
    const voided = buildReceiptTemplate(ac31({ status: "VOID" }));

    expect(original.rows.join("\n")).not.toContain("SALINAN");
    expect(reprint.rows.join("\n")).toContain("SALINAN");
    expect(voided.rows.join("\n")).toContain("*** DIBATALKAN ***");
    const totalRows = reprint.rows.filter((row) => row.startsWith("TOTAL"));
    expect(totalRows).toHaveLength(1);
    expect(totalRows[0]?.endsWith(formatIdr(299_700n))).toBe(true);
    expect(totalRows[0]?.length).toBe(35);
    expect(voided.rows.some((row) => row.startsWith("TOTAL") && row.endsWith(formatIdr(299_700n)))).toBe(true);
    expectWidths(reprint.rows, 35);
  });

  it("wraps a long item name and never exceeds the paper width", () => {
    const document = buildReceiptTemplate(
      ac31({
        lines: [
          {
            lineType: "PRODUCT",
            description:
              "Kampas rem depan tipe panjang dengan nama suku cadang yang sangat panjang sekali",
            quantity: 12,
            unitPrice: 1_250_000n,
            discountAmount: 500_000n,
            lineTotal: 14_500_000n,
          },
        ],
        subtotal: 15_000_000n,
        discountTotal: 500_000n,
        taxTotal: 1_595_000n,
        total: 16_095_000n,
        payments: [{ method: "TRANSFER", amount: 16_095_000n }],
        changeTotal: 0n,
      }),
    );
    expectWidths(document.rows, 35);
    expect(document.rows.join("\n")).toContain("Kampas rem depan tipe panjang");
    expect(document.rows.some((row) => row.startsWith("12 x "))).toBe(true);
    expect(document.rows.join("\n")).toContain("Diskon");
  });

  it("renders an estimate without tender rows and says it is not a payment", () => {
    const document = buildReceiptTemplate(
      ac31({ documentKind: "ESTIMATE", status: "ESTIMATED", isReprint: false }),
    );
    const text = document.rows.join("\n");
    expect(document.title).toBe("ESTIMASI");
    expect(text).toContain("Bukan bukti pembayaran.");
    expect(text).not.toContain("Tunai");
    expect(text).not.toContain("Kembali");
    expect(text).toContain(formatIdr(299_700n));
  });

  it("omits the order discount row when only line discounts exist", () => {
    const document = buildReceiptTemplate(
      ac31({
        lines: [
          {
            lineType: "PRODUCT",
            description: "Kampas rem depan",
            quantity: 1,
            unitPrice: 250_000n,
            discountAmount: 25_000n,
            lineTotal: 225_000n,
          },
        ],
        subtotal: 250_000n,
        discountTotal: 25_000n,
        taxTotal: 24_750n,
        total: 249_750n,
        payments: [{ method: "CASH", amount: 250_000n }],
        changeTotal: 250n,
      }),
    );
    const lines = document.rows.filter((row) => row.startsWith("Diskon"));
    // One inline line-discount row, never a second order-level "Diskon" row.
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("−");
    expect(document.rows.join("\n")).toContain(formatIdr(249_750n));
  });

  it("formats the timestamp in Asia/Jakarta regardless of host zone", () => {
    expect(formatReceiptTimestamp("2026-11-27T07:05:00.000Z")).toBe(
      "27 Nov 2026 14.05",
    );
    expect(formatReceiptTimestamp("invalid")).toBe("—");
  });

  it("hard-wraps an unbreakable token instead of overflowing", () => {
    const rows = wrapReceiptText("X".repeat(80), 35);
    expect(rows.every((row) => row.length <= 35)).toBe(true);
    expect(rows.join("")).toBe("X".repeat(80));
  });
});
