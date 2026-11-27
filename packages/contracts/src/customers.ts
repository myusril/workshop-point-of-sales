import { z } from "zod";

import { moneyStringSchema } from "./catalog.ts";
import { phoneNumberSchema } from "./users.ts";

/**
 * Customer contracts (FR-020, FR-025, FR-027, FR-029, PD-02, PD-04).
 *
 * Personal-data rules encoded here:
 * - List payloads carry a masked phone only; the full number is returned by the
 *   single-record read used to edit the record.
 * - Anonymization replaces the personal fields with fixed sentinel values and
 *   keeps the row (and every financial/audit reference) intact.
 * - Exports are a flat JSON document with a version so a buyer can rely on the
 *   shape; no other customer's data is included.
 */

export const CUSTOMER_PAGE_SIZES = [25, 50, 100] as const;
export const CUSTOMER_SORT_COLUMNS = ["name", "updatedAt"] as const;

/** Sentinels written by anonymization; never treated as user input. */
export const ANONYMIZED_CUSTOMER_NAME = "Pelanggan dianonimkan";
export const ANONYMIZED_CUSTOMER_PHONE = "";

/** Minimum reason length for the append-only audit entry of an anonymization. */
export const ANONYMIZE_REASON_MIN_LENGTH = 10;

const customerNameSchema = z
  .string()
  .trim()
  .min(2, "Nama pelanggan minimal 2 karakter.")
  .max(120, "Nama pelanggan maksimal 120 karakter.");

const customerAddressSchema = z
  .string()
  .trim()
  .max(240, "Alamat maksimal 240 karakter.");

const customerNotesSchema = z
  .string()
  .trim()
  .max(500, "Catatan maksimal 500 karakter.");

/**
 * List/detail display mask (DESIGN §9.7): first four and last four digits, with
 * a bullet run in between. Shorter numbers reveal two digits at each end, and
 * very short values are fully masked, so a list never exposes most of a number.
 */
export function maskPhone(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.length === 0) return "—";
  if (trimmed.length < 6) return "•".repeat(trimmed.length);
  const reveal = trimmed.length >= 12 ? 4 : 2;
  return `${trimmed.slice(0, reveal)}${"•".repeat(trimmed.length - reveal * 2)}${trimmed.slice(-reveal)}`;
}

export const customerSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  phone: z.string(),
  address: z.string().nullable(),
  notes: z.string().nullable(),
  /** ISO-8601; non-null means the personal fields are already anonymized. */
  anonymizedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Customer = z.infer<typeof customerSchema>;

/**
 * List rows never contain the full phone, address, or notes: the table renders
 * only `phoneMasked`, and the edit dialog fetches the full record. Keeping the
 * unrendered personal fields out of the list payload also keeps them out of the
 * RSC/HTML document.
 */
export const customerListItemSchema = customerSchema
  .omit({ phone: true, address: true, notes: true })
  .extend({
    phoneMasked: z.string(),
    vehicleCount: z.number().int().nonnegative(),
  });
export type CustomerListItem = z.infer<typeof customerListItemSchema>;

export const customerListQuerySchema = z.object({
  q: z.string().trim().max(80, "Pencarian maksimal 80 karakter.").optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .refine(
      (value) => (CUSTOMER_PAGE_SIZES as readonly number[]).includes(value),
      "Ukuran halaman tidak didukung.",
    )
    .default(25),
  sort: z.enum(CUSTOMER_SORT_COLUMNS).default("name"),
  dir: z.enum(["asc", "desc"]).default("asc"),
});
export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;

export const customerListResponseSchema = z.object({
  items: z.array(customerListItemSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});
export type CustomerListResponse = z.infer<typeof customerListResponseSchema>;

export const createCustomerSchema = z.object({
  name: customerNameSchema,
  phone: phoneNumberSchema,
  address: customerAddressSchema.optional(),
  notes: customerNotesSchema.optional(),
});
export type CreateCustomerRequest = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = z
  .object({
    name: customerNameSchema.optional(),
    phone: phoneNumberSchema.optional(),
    address: customerAddressSchema.nullable().optional(),
    notes: customerNotesSchema.nullable().optional(),
  })
  .refine(
    (value) => Object.values(value).some((entry) => entry !== undefined),
    "Tidak ada perubahan yang dikirim.",
  );
export type UpdateCustomerRequest = z.infer<typeof updateCustomerSchema>;

export const anonymizeCustomerSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(
      ANONYMIZE_REASON_MIN_LENGTH,
      `Alasan minimal ${ANONYMIZE_REASON_MIN_LENGTH} karakter.`,
    )
    .max(200, "Alasan maksimal 200 karakter."),
});
export type AnonymizeCustomerRequest = z.infer<typeof anonymizeCustomerSchema>;

export const customerResponseSchema = z.object({ item: customerSchema });
export type CustomerResponse = z.infer<typeof customerResponseSchema>;

/**
 * Export document (FR-029, PRD §7.4). The customer, their vehicles, and the
 * order-level service history that references them; no staff, catalog, or other
 * customer's data. `formatVersion` lets the buyer validate a stored export.
 */
export const customerExportVehicleSchema = z.object({
  id: z.uuid(),
  normalizedPlate: z.string(),
  brand: z.string(),
  model: z.string(),
  year: z.number().int().nullable(),
  color: z.string().nullable(),
  odometer: z.number().int().nullable(),
  vin: z.string().nullable(),
  notes: z.string().nullable(),
});
export type CustomerExportVehicle = z.infer<typeof customerExportVehicleSchema>;

export const customerExportOrderSchema = z.object({
  id: z.uuid(),
  orderNumber: z.string().nullable(),
  kind: z.enum(["SALE", "SERVICE"]),
  status: z.enum([
    "DRAFT",
    "ESTIMATED",
    "APPROVED",
    "IN_PROGRESS",
    "COMPLETED",
    "PAID",
    "VOID",
  ]),
  outletName: z.string(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  odometer: z.number().int().nullable(),
  total: moneyStringSchema,
  balanceDue: moneyStringSchema,
});
export type CustomerExportOrder = z.infer<typeof customerExportOrderSchema>;

export const customerExportSchema = z.object({
  formatVersion: z.literal(1),
  exportedAt: z.string(),
  customer: customerSchema,
  vehicles: z.array(customerExportVehicleSchema),
  orders: z.array(customerExportOrderSchema),
});
export type CustomerExport = z.infer<typeof customerExportSchema>;
