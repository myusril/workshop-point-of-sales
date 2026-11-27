import { z } from "zod";

import { moneyStringSchema } from "./catalog.ts";
import {
  MAX_ORDER_LINES,
  MAX_ORDER_QUANTITY,
  orderDetailSchema,
  orderLineTypeSchema,
} from "./orders.ts";
import { PAYMENT_REFERENCE_MAX_LENGTH, paymentMethodSchema } from "./payments.ts";
import { orderKindSchema } from "./vehicles.ts";

/**
 * Offline sync contracts (PRD US-14/US-15, FR-041–FR-043, ADR-0001 §3.6).
 *
 * A queued sale arrives with the money the customer actually paid: unit prices,
 * discounts, tax, and payment rows are local snapshots. The server validates
 * their arithmetic against the local tax rate instead of repricing from the
 * catalog, then applies stock from its own ledger. A conflict is a first-class
 * response value, never an HTTP validation error, so a device can distinguish
 * "retry later" from "needs an explicit user decision".
 */

export const SYNC_CONFLICT_CODES = [
  "STOCK_INSUFFICIENT",
  "PRICE_CHANGED",
  "PLATE_REASSIGNED",
  "CASH_REPORTING",
] as const;
export const syncConflictCodeSchema = z.enum(SYNC_CONFLICT_CODES);
export type SyncConflictCode = z.infer<typeof syncConflictCodeSchema>;

/**
 * `RESOLVED` is derived from the resolution markers; the database enum stores
 * the narrower `QUEUED | APPLIED | CONFLICT` set by WP2.
 */
export const SYNC_STATES = ["QUEUED", "APPLIED", "CONFLICT", "RESOLVED"] as const;
export const syncStateSchema = z.enum(SYNC_STATES);
export type SyncState = z.infer<typeof syncStateSchema>;

export const SYNC_RESOLVE_ACTIONS = ["OVERRIDE", "VOID"] as const;
export const syncResolveActionSchema = z.enum(SYNC_RESOLVE_ACTIONS);
export type SyncResolveAction = z.infer<typeof syncResolveActionSchema>;

/** Client keys appear in a URL path, so the alphabet is path-safe. */
export const syncClientKeySchema = z
  .string()
  .trim()
  .min(8, "Kunci sinkronisasi minimal 8 karakter.")
  .max(128, "Kunci sinkronisasi maksimal 128 karakter.")
  .regex(
    /^[A-Za-z0-9._:-]+$/,
    "Kunci sinkronisasi hanya boleh berisi huruf, angka, titik, garis bawah, titik dua, dan tanda hubung.",
  );

const descriptionSchema = z
  .string()
  .trim()
  .min(1, "Deskripsi item wajib diisi.")
  .max(200, "Deskripsi item maksimal 200 karakter.");

const discountPercentSchema = z
  .number()
  .int("Diskon persen harus bilangan bulat.")
  .min(0, "Diskon tidak boleh negatif.")
  .max(100, "Diskon maksimal 100 persen.");

const notesSchema = z.string().trim().max(500, "Catatan maksimal 500 karakter.");

const odometerSchema = z
  .number()
  .int("Odometer harus bilangan bulat.")
  .min(0, "Odometer tidak boleh negatif.")
  .max(9_999_999, "Odometer terlalu besar.");

const technicianIdSchema = z.string().trim().min(1).max(64).nullable().optional();

function refineSingleDiscount(
  value: { discountPercent?: number; discountAmount?: string },
  context: z.RefinementCtx,
): void {
  if (value.discountPercent !== undefined && value.discountAmount !== undefined) {
    const message = "Isi diskon persen atau nominal, bukan keduanya.";
    context.addIssue({ code: "custom", path: ["discountPercent"], message });
    context.addIssue({ code: "custom", path: ["discountAmount"], message });
  }
}

/**
 * One locally recorded line. `taxAmount` and `lineTotal` are assertions of what
 * the device printed; the server recomputes them from the local unit price,
 * discount, and tax rate and rejects a mismatch instead of silently repricing.
 *
 * Allocation rule the device must mirror (shared `packages/core` /
 * `apps/web/lib/order-pricing.ts`): an order-level discount is split across
 * lines in proportion to each net line value with the largest-remainder method
 * (ties by position), so the shares sum exactly to `discountTotal`.
 * `lineTotal` is `quantity × unitPrice − line discount` and excludes that
 * order-level share; per-line tax is half-up on the fully discounted base, and
 * `taxTotal` is the sum of the already-rounded line taxes.
 */
export const syncOrderLineSchema = z
  .object({
    lineType: orderLineTypeSchema,
    /** Product id for a PRODUCT line, service id for a SERVICE line. */
    catalogItemId: z.uuid("Item katalog tidak valid."),
    description: descriptionSchema,
    quantity: z
      .number()
      .int("Jumlah harus bilangan bulat.")
      .min(1, "Jumlah minimal 1.")
      .max(MAX_ORDER_QUANTITY, `Jumlah maksimal ${MAX_ORDER_QUANTITY}.`),
    unitPrice: moneyStringSchema,
    discountPercent: discountPercentSchema.optional(),
    discountAmount: moneyStringSchema.optional(),
    taxAmount: moneyStringSchema,
    lineTotal: moneyStringSchema,
    technicianId: technicianIdSchema,
  })
  .superRefine(refineSingleDiscount);
export type SyncOrderLine = z.infer<typeof syncOrderLineSchema>;

/** A tender captured offline. `amount` is money applied, `changeAmount` is returned cash. */
export const syncOrderPaymentSchema = z.object({
  method: paymentMethodSchema,
  amount: moneyStringSchema.refine(
    (value) => value !== "0",
    "Jumlah pembayaran harus lebih dari nol.",
  ),
  changeAmount: moneyStringSchema.optional(),
  referenceNote: z
    .string()
    .trim()
    .max(PAYMENT_REFERENCE_MAX_LENGTH, "Referensi maksimal 64 karakter.")
    .optional(),
});
export type SyncOrderPayment = z.infer<typeof syncOrderPaymentSchema>;

export const syncOrderSchema = z
  .object({
    kind: orderKindSchema,
    customerId: z.uuid("Pelanggan tidak valid.").nullable().optional(),
    vehicleId: z.uuid("Kendaraan tidak valid.").nullable().optional(),
    technicianId: technicianIdSchema,
    odometer: odometerSchema.nullable().optional(),
    notes: notesSchema.nullable().optional(),
    /** Tax rate the device used; local money stays authoritative (AC15.4). */
    taxRate: z
      .number()
      .int("Tarif pajak harus bilangan bulat.")
      .min(0, "Tarif pajak tidak boleh negatif.")
      .max(100, "Tarif pajak maksimal 100 persen."),
    discountPercent: discountPercentSchema.optional(),
    discountAmount: moneyStringSchema.optional(),
    subtotal: moneyStringSchema,
    discountTotal: moneyStringSchema,
    taxTotal: moneyStringSchema,
    total: moneyStringSchema,
    lines: z
      .array(syncOrderLineSchema)
      .min(1, "Tambahkan minimal satu item.")
      .max(MAX_ORDER_LINES, `Maksimal ${MAX_ORDER_LINES} baris per transaksi.`),
    payments: z
      .array(syncOrderPaymentSchema)
      .min(1, "Sertakan minimal satu pembayaran.")
      .max(20, "Maksimal 20 pembayaran per transaksi."),
    /** When the device closed the sale; drives the sale date and cash flag. */
    deviceRecordedAt: z.iso.datetime({ offset: true }),
  })
  .superRefine(refineSingleDiscount);
export type SyncOrderPayload = z.infer<typeof syncOrderSchema>;

/**
 * The device identity is the authenticated bearer token (`device_tokens`),
 * never a client-supplied field; the body carries only the outlet the device
 * sold from, and the server pins it to the caller's session/device scope.
 */
export const syncApplyRequestSchema = z.object({
  clientKey: syncClientKeySchema,
  /** Outlet the device sold from; must be in the caller's scope (and its pin). */
  outletId: z.uuid("Outlet tidak valid."),
  order: syncOrderSchema,
});
export type SyncApplyRequest = z.infer<typeof syncApplyRequestSchema>;

/**
 * Conflict details are stable, PII-free payloads. Blocking codes require an
 * explicit resolution; `PRICE_CHANGED` and `CASH_REPORTING` are informational
 * and never by themselves stop a sale from applying.
 */
export const syncConflictDetailSchema = z.object({
  code: syncConflictCodeSchema,
  blocking: z.boolean(),
  /** Bahasa Indonesia, safe to show as-is. */
  message: z.string(),
  productId: z.uuid().nullable().optional(),
  productName: z.string().nullable().optional(),
  localQuantity: z.number().int().nullable().optional(),
  /** Server stock at the moment the sale was evaluated. */
  serverQuantity: z.number().int().nullable().optional(),
  vehicleId: z.uuid().nullable().optional(),
  plate: z.string().nullable().optional(),
});
export type SyncConflictDetail = z.infer<typeof syncConflictDetailSchema>;

export const syncResultSchema = z.object({
  clientKey: z.string(),
  state: syncStateSchema,
  /** The blocking conflict, if any (kept after resolution for the audit trail). */
  conflict: syncConflictDetailSchema.nullable(),
  /** Informational notices such as a changed catalog price. */
  notices: z.array(syncConflictDetailSchema),
  order: orderDetailSchema.nullable(),
  orderId: z.uuid().nullable(),
  attemptCount: z.number().int().min(0),
  deviceRecordedAt: z.string().nullable(),
  appliedAt: z.string().nullable(),
  resolvedAt: z.string().nullable(),
  resolution: syncResolveActionSchema.nullable(),
});
export type SyncResult = z.infer<typeof syncResultSchema>;

export const syncResolveRequestSchema = z.object({
  action: syncResolveActionSchema,
  reason: z
    .string()
    .trim()
    .min(1, "Alasan wajib diisi.")
    .max(500, "Alasan maksimal 500 karakter."),
});
export type SyncResolveRequest = z.infer<typeof syncResolveRequestSchema>;

export const syncConflictItemSchema = z.object({
  clientKey: z.string(),
  outletId: z.uuid(),
  state: syncStateSchema,
  conflict: syncConflictDetailSchema,
  orderId: z.uuid().nullable(),
  deviceRecordedAt: z.string().nullable(),
  attemptCount: z.number().int().min(0),
  lastAttemptAt: z.string().nullable(),
});
export type SyncConflictItem = z.infer<typeof syncConflictItemSchema>;

export const syncConflictListResponseSchema = z.object({
  items: z.array(syncConflictItemSchema),
});
export type SyncConflictListResponse = z.infer<
  typeof syncConflictListResponseSchema
>;
