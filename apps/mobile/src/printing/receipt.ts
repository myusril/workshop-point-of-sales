import { buildReceiptTemplate, type ReceiptTemplate } from "@workshop-pos/core";

import type { ReceiptSnapshot } from "@/src/db/repository";

/**
 * Local receipt built from the same `packages/core` template the server prints
 * (FR-040). The only addition is the offline stamp the design requires while a
 * sale has not synced; after sync the final invoice number replaces the local
 * reference and the stamp disappears.
 */

export const OFFLINE_STAMP = "SALINAN LOKAL — BELUM TERSINKRON";

export interface ReceiptRenderOptions {
  isReprint?: boolean;
  syncedOrderNumber?: string | null;
  voided?: boolean;
  /** A blocked sale is evidence, not a final invoice. */
  conflictPending?: boolean;
}

function centerInColumns(text: string, columns: number): string {
  const normalized = text.replace(/\s+/g, " ").trim().slice(0, columns);
  if (normalized.length >= columns) return normalized;
  const left = Math.floor((columns - normalized.length) / 2);
  return `${" ".repeat(left)}${normalized}`;
}

export function buildLocalReceipt(
  snapshot: ReceiptSnapshot,
  options: ReceiptRenderOptions = {},
): ReceiptTemplate {
  const template = buildReceiptTemplate({
    documentKind: "RECEIPT",
    paperWidth: snapshot.paperWidth,
    outletName: snapshot.outletName,
    headerText: snapshot.headerText,
    footerText: snapshot.footerText,
    orderNumber: options.syncedOrderNumber ?? snapshot.localNumber,
    orderDate: snapshot.deviceRecordedAt,
    cashierName: snapshot.cashierName,
    customerName: snapshot.customerName,
    vehiclePlate: snapshot.vehiclePlate,
    vehicleLabel: snapshot.vehicleLabel,
    technicianName: snapshot.technicianName,
    lines: snapshot.lines.map((line) => ({
      lineType: line.lineType,
      description: line.description,
      quantity: line.quantity,
      unitPrice: BigInt(line.unitPrice),
      discountAmount: BigInt(line.discountAmount),
      lineTotal: BigInt(line.lineTotal),
    })),
    subtotal: BigInt(snapshot.subtotal),
    discountTotal: BigInt(snapshot.discountTotal),
    taxRatePercent: snapshot.taxRatePercent,
    taxTotal: BigInt(snapshot.taxTotal),
    total: BigInt(snapshot.total),
    payments: snapshot.payments.map((payment) => ({
      method: payment.method,
      amount: BigInt(payment.amount),
    })),
    paidTotal: snapshot.payments.reduce((sum, payment) => sum + BigInt(payment.amount), 0n),
    changeTotal: BigInt(snapshot.changeTotal),
    status: options.voided ? "VOID" : "PAID",
    isReprint: options.isReprint,
  });

  const rows = [...template.rows];
  const titleIndex = template.rows.findIndex((row) => row.trim() === "STRUK");
  const insertAt = titleIndex >= 0 ? titleIndex + 1 : 0;
  if (options.conflictPending) {
    rows.splice(insertAt, 0, centerInColumns("PERLU TINJAUAN", template.columns));
  }
  if (options.syncedOrderNumber) return { ...template, rows };

  rows.splice(options.conflictPending ? insertAt + 1 : insertAt, 0, centerInColumns(OFFLINE_STAMP, template.columns));
  return { ...template, rows };
}

/** Plain text document for sharing; identical bytes to the preview rows. */
export function receiptToText(template: ReceiptTemplate): string {
  return `${template.rows.join("\n")}\n`;
}
