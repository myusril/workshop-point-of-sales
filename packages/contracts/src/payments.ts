import { z } from "zod";

import { moneyStringSchema } from "./catalog.ts";
import { orderDetailSchema } from "./orders.ts";

/**
 * Payment contracts (FR-034, FR-035, FR-048, BR-009, D-11).
 *
 * Only cash, bank transfer, and QRIS exist; the enum is the whole method set so
 * a free-form string is rejected at the boundary. Transfers and QRIS are
 * recorded manually and require a reference note.
 */

export const PAYMENT_METHODS = ["CASH", "TRANSFER", "QRIS"] as const;
export const paymentMethodSchema = z.enum(PAYMENT_METHODS);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const PAYMENT_REFERENCE_MAX_LENGTH = 64;

const paymentReferenceSchema = z
  .string()
  .trim()
  .max(PAYMENT_REFERENCE_MAX_LENGTH, "Referensi maksimal 64 karakter.");

const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8, "Kunci idempotensi minimal 8 karakter.")
  .max(128, "Kunci idempotensi maksimal 128 karakter.");

const paymentAmountSchema = moneyStringSchema.refine(
  (value) => value !== "0",
  "Jumlah pembayaran harus lebih dari nol.",
);

export const recordPaymentSchema = z.object({
  orderId: z.uuid("Transaksi tidak valid."),
  method: paymentMethodSchema,
  amount: paymentAmountSchema,
  referenceNote: paymentReferenceSchema.optional(),
  idempotencyKey: idempotencyKeySchema,
});
export type RecordPaymentRequest = z.infer<typeof recordPaymentSchema>;

export const paymentSchema = z.object({
  id: z.uuid(),
  method: paymentMethodSchema,
  amount: moneyStringSchema,
  changeAmount: moneyStringSchema,
  referenceNote: z.string().nullable(),
  receivedAt: z.string(),
  createdByName: z.string(),
});
export type Payment = z.infer<typeof paymentSchema>;

export const recordPaymentResponseSchema = z.object({
  item: orderDetailSchema,
  payment: paymentSchema,
});
export type RecordPaymentResponse = z.infer<typeof recordPaymentResponseSchema>;

/**
 * Pre-`PAID` payment correction (FR-048, D-11). A reason is always required
 * because the before/after values are written to the audit log.
 */
export const correctPaymentSchema = z
  .object({
    amount: paymentAmountSchema.optional(),
    method: paymentMethodSchema.optional(),
    referenceNote: paymentReferenceSchema.nullable().optional(),
    reason: z
      .string()
      .trim()
      .min(3, "Alasan koreksi minimal 3 karakter.")
      .max(300, "Alasan koreksi maksimal 300 karakter."),
  })
  .superRefine((value, context) => {
    if (
      value.amount === undefined &&
      value.method === undefined &&
      value.referenceNote === undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["_root"],
        message: "Tidak ada perubahan yang dikirim.",
      });
    }
  });
export type CorrectPaymentRequest = z.infer<typeof correctPaymentSchema>;

export const deletePaymentSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, "Alasan koreksi minimal 3 karakter.")
    .max(300, "Alasan koreksi maksimal 300 karakter."),
});
export type DeletePaymentRequest = z.infer<typeof deletePaymentSchema>;

export const correctPaymentResponseSchema = z.object({
  item: orderDetailSchema,
  payment: paymentSchema,
});
export type CorrectPaymentResponse = z.infer<typeof correctPaymentResponseSchema>;
