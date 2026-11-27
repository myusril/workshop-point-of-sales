import { OFFLINE_STAMP, buildLocalReceipt, receiptToText } from "@/src/printing/receipt";
import { encodeEscPos, toPrinterAscii } from "@/src/printing/escpos";
import { testReceipt } from "./helpers/fixtures";

describe("local receipt (AC14.1, DESIGN §7.6)", () => {
  it("prints 35 columns with the offline stamp and local reference", () => {
    const template = buildLocalReceipt(testReceipt());
    expect(template.columns).toBe(35);
    expect(template.rows.every((row) => row.length <= 35)).toBe(true);
    expect(template.rows.some((row) => row.includes("LOKAL-ABCDEF"))).toBe(true);
    expect(template.rows.some((row) => row.trim() === OFFLINE_STAMP)).toBe(true);
    expect(template.rows.some((row) => row.includes("TOTAL"))).toBe(true);
    expect(template.rows.some((row) => row.includes("Kembali"))).toBe(true);
  });

  it("drops the offline stamp once the server invoice number exists", () => {
    const template = buildLocalReceipt(testReceipt(), { syncedOrderNumber: "INV-2026-0001" });
    expect(template.rows.some((row) => row.trim() === OFFLINE_STAMP)).toBe(false);
    expect(template.rows.some((row) => row.includes("INV-2026-0001"))).toBe(true);
  });

  it("uses 48 columns and fits long descriptions at 80 mm", () => {
    const template = buildLocalReceipt(
      testReceipt({
        paperWidth: 80,
        lines: [
          {
            lineType: "SERVICE",
            description: "Jasa bongkar pasang kampas rem depan dan pengecekan sistem rem",
            quantity: 2,
            unitPrice: "125000",
            discountAmount: "0",
            lineTotal: "250000",
          },
        ],
        subtotal: "250000",
        discountTotal: "0",
        taxTotal: "27500",
        total: "277500",
      }),
    );
    expect(template.columns).toBe(48);
    expect(template.rows.every((row) => row.length <= 48)).toBe(true);
    expect(template.rows.some((row) => row.includes("sistem rem"))).toBe(true);
  });

  it("stamps a voided and a reprinted copy without changing figures", () => {
    const original = buildLocalReceipt(testReceipt());
    const reprint = buildLocalReceipt(testReceipt(), {
      syncedOrderNumber: "INV-1",
      isReprint: true,
    });
    const voided = buildLocalReceipt(testReceipt(), {
      syncedOrderNumber: "INV-1",
      voided: true,
    });
    expect(reprint.rows.some((row) => row.trim() === "SALINAN")).toBe(true);
    expect(voided.rows.some((row) => row.includes("DIBATALKAN"))).toBe(true);
    expect(reprint.rows).toContain(original.rows.find((row) => row.includes("299.700")));
  });

  it("stamps a blocked conflict as needing review, not as a final invoice", () => {
    const template = buildLocalReceipt(testReceipt(), { conflictPending: true });
    expect(template.rows.some((row) => row.trim() === "PERLU TINJAUAN")).toBe(true);
    expect(template.rows.some((row) => row.trim() === OFFLINE_STAMP)).toBe(true);
  });

  it("exports the same text as the preview rows", () => {
    const template = buildLocalReceipt(testReceipt());
    expect(receiptToText(template)).toBe(`${template.rows.join("\n")}\n`);
  });
});

describe("ESC/POS encoding", () => {
  it("initializes, prints every row, and cuts", () => {
    const template = buildLocalReceipt(testReceipt());
    const bytes = encodeEscPos(template);
    expect(Array.from(bytes.slice(0, 2))).toEqual([0x1b, 0x40]);
    expect(Array.from(bytes.slice(-3))).toEqual([0x1d, 0x56, 0x00]);
    const text = new TextDecoder("ascii").decode(bytes);
    expect(text).toContain("Kampas rem depan");
    expect(text).toContain("299.700");
  });

  it("transliterates receipt punctuation the printer cannot encode", () => {
    expect(toPrinterAscii("SALINAN LOKAL — BELUM TERSINKRON")).toBe(
      "SALINAN LOKAL - BELUM TERSINKRON",
    );
    expect(toPrinterAscii("\u2212300")).toBe("-300");
    expect(toPrinterAscii("2 × 3")).toBe("2 x 3");
  });
});
