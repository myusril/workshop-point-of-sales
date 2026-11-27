import { z } from "zod";

import { moneyStringSchema } from "./catalog.ts";
import { orderStatusSchema } from "./vehicles.ts";

/**
 * Receipt and estimate document contracts (FR-037, FR-040, FR-047, BR-008).
 *
 * The document is produced by the pure template in `@workshop-pos/core`, so the
 * API transports already-rendered monospace rows plus metadata. The renderer is
 * the same for the on-screen preview and the browser print page; reprinting
 * changes no figure, only the copy/reprint stamps.
 */

export const RECEIPT_DOCUMENTS = ["RECEIPT", "ESTIMATE"] as const;
export const receiptDocumentKindSchema = z.enum(RECEIPT_DOCUMENTS);
export type ReceiptDocumentKind = z.infer<typeof receiptDocumentKindSchema>;

export const RECEIPT_PAPER_WIDTHS = [58, 80] as const;
export const receiptPaperWidthSchema = z.union([z.literal(58), z.literal(80)]);

export const receiptDocumentSchema = z.object({
  orderId: z.uuid(),
  orderNumber: z.string(),
  documentKind: receiptDocumentKindSchema,
  title: z.string(),
  orderStatus: orderStatusSchema,
  paperWidth: receiptPaperWidthSchema,
  /** Monospace columns: 35 for 58 mm paper, 48 for 80 mm. */
  columns: z.number().int().positive(),
  issuedAt: z.string(),
  /** Monospace rows, each already wrapped to `columns`. */
  rows: z.array(z.string()),
  reprintCount: z.number().int().nonnegative(),
  isReprint: z.boolean(),
  isVoided: z.boolean(),
  total: moneyStringSchema,
  changeTotal: moneyStringSchema,
  outletName: z.string(),
});
export type ReceiptDocument = z.infer<typeof receiptDocumentSchema>;

export const receiptResponseSchema = z.object({ item: receiptDocumentSchema });
export type ReceiptResponse = z.infer<typeof receiptResponseSchema>;

/** `?doc=estimate` previews the estimate document instead of the receipt. */
export const receiptQuerySchema = z.object({
  doc: z.enum(["receipt", "estimate"]).default("receipt"),
});
export type ReceiptQuery = z.infer<typeof receiptQuerySchema>;

export const printReceiptSchema = z.object({
  doc: z.enum(["receipt", "estimate"]).default("receipt"),
});
export type PrintReceiptRequest = z.infer<typeof printReceiptSchema>;
