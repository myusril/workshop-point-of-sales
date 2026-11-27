import { and, eq } from "drizzle-orm";

import type { OrderDetail, ReceiptDocument } from "@workshop-pos/contracts";
import { receiptDocumentSchema } from "@workshop-pos/contracts";
import { AuthError, type AuthContext } from "@workshop-pos/auth";
import { buildReceiptTemplate, parseIdr } from "@workshop-pos/core";
import { settings, type Database } from "@workshop-pos/db";

import {
  countDocumentPrints,
  loadOrderForDocument,
  recordReceiptPrint,
} from "./order-service";

/**
 * Receipt and estimate documents (FR-037, FR-040, FR-047, BR-008).
 *
 * The order detail is the single source of figures; this module only selects
 * the template, converts transport money back to `bigint`, and stamps the
 * document. Printing appends one audit row (`receipt.printed`) whose count is
 * the reprint number shown as `SALINAN`; nothing about the sale changes.
 */

const PRINTABLE_ESTIMATE_STATUSES = ["DRAFT", "ESTIMATED", "APPROVED", "IN_PROGRESS"] as const;

async function loadReceiptBranding(
  db: Database,
  businessId: string,
  outletId: string,
): Promise<{ headerText: string | null; footerText: string | null }> {
  const [row] = await db
    .select({
      headerText: settings.receiptHeaderText,
      footerText: settings.receiptFooterText,
    })
    .from(settings)
    .where(and(eq(settings.businessId, businessId), eq(settings.outletId, outletId)))
    .limit(1);
  return { headerText: row?.headerText ?? null, footerText: row?.footerText ?? null };
}

function assertDocumentAllowed(
  detail: OrderDetail,
  documentKind: "RECEIPT" | "ESTIMATE",
): void {
  if (documentKind === "RECEIPT") {
    if (!detail.receiptAvailable) {
      throw AuthError.conflict("Struk tersedia setelah pembayaran.");
    }
    return;
  }
  if (
    detail.status === "VOID" ||
    !PRINTABLE_ESTIMATE_STATUSES.includes(
      detail.status as (typeof PRINTABLE_ESTIMATE_STATUSES)[number],
    )
  ) {
    throw AuthError.conflict(
      "Estimasi hanya dapat dicetak sebelum pembayaran atau pembatalan.",
    );
  }
}

async function buildDocument(
  db: Database,
  context: AuthContext,
  detail: OrderDetail,
  documentKind: "RECEIPT" | "ESTIMATE",
  printCount: number,
): Promise<ReceiptDocument> {
  const orderNumber = detail.orderNumber;
  if (!orderNumber) {
    throw AuthError.conflict("Nomor nota belum tersedia untuk dokumen ini.");
  }

  const branding = await loadReceiptBranding(
    db,
    context.user.businessId,
    detail.outletId,
  );
  const issuedAt =
    documentKind === "RECEIPT"
      ? (detail.paidAt ?? detail.createdAt)
      : detail.createdAt;

  const template = buildReceiptTemplate({
    documentKind,
    paperWidth: detail.settings.paperWidth,
    outletName: detail.outletName,
    headerText: branding.headerText,
    footerText: branding.footerText,
    orderNumber,
    orderDate: issuedAt,
    cashierName: detail.createdByName,
    customerName: detail.customer?.name ?? null,
    vehiclePlate: detail.vehicle?.plate ?? null,
    vehicleLabel: detail.vehicle ? `${detail.vehicle.brand} ${detail.vehicle.model}` : null,
    technicianName: detail.technician?.name ?? null,
    lines: detail.lines.map((line) => ({
      lineType: line.lineType,
      description: line.description,
      quantity: line.quantity,
      unitPrice: parseIdr(line.unitPrice),
      discountAmount: parseIdr(line.discountAmount),
      lineTotal: parseIdr(line.lineTotal),
    })),
    subtotal: parseIdr(detail.subtotal),
    discountTotal: parseIdr(detail.discountTotal),
    taxRatePercent: detail.taxRate,
    taxTotal: parseIdr(detail.taxTotal),
    total: parseIdr(detail.total),
    // Cash rows store the applied amount; the customer handed over
    // `applied + change`, which is what a paper receipt must show.
    payments: detail.payments.map((payment) => ({
      method: payment.method,
      amount: parseIdr(payment.amount) + parseIdr(payment.changeAmount),
    })),
    paidTotal: parseIdr(detail.paidTotal),
    changeTotal: parseIdr(detail.changeTotal),
    status: detail.status,
    isReprint: printCount > 0,
  });

  return receiptDocumentSchema.parse({
    orderId: detail.id,
    orderNumber,
    documentKind,
    title: template.title,
    orderStatus: detail.status,
    paperWidth: detail.settings.paperWidth,
    columns: template.columns,
    issuedAt,
    rows: template.rows,
    reprintCount: printCount,
    isReprint: printCount > 0,
    isVoided: detail.status === "VOID",
    total: detail.total,
    changeTotal: detail.changeTotal,
    outletName: detail.outletName,
  });
}

export async function getReceiptDocument(
  db: Database,
  context: AuthContext,
  orderId: string,
  documentKind: "RECEIPT" | "ESTIMATE",
): Promise<ReceiptDocument> {
  const detail = await loadOrderForDocument(db, context, orderId);
  assertDocumentAllowed(detail, documentKind);
  const printCount =
    documentKind === "RECEIPT"
      ? detail.printCount
      : await countDocumentPrints(db, context.user.businessId, orderId, "ESTIMATE");
  return buildDocument(db, context, detail, documentKind, printCount);
}

export async function printReceiptDocument(
  db: Database,
  context: AuthContext,
  orderId: string,
  documentKind: "RECEIPT" | "ESTIMATE",
): Promise<ReceiptDocument> {
  const detail = await loadOrderForDocument(db, context, orderId);
  assertDocumentAllowed(detail, documentKind);
  const nextCount = await recordReceiptPrint(db, context, detail, documentKind);
  // The first print is the original; only a later print is a copy.
  return buildDocument(db, context, detail, documentKind, nextCount - 1);
}
