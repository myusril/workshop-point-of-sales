import { z } from "zod";

import { moneyStringSchema } from "./catalog.ts";

/**
 * Vehicle + plate-history contracts (FR-021–FR-024, FR-026, FR-028, FR-029,
 * BR-006, BR-012).
 *
 * The normalized plate is the stored identity (`B1234XYZ`). Raw input is
 * accepted here and normalized by `normalizePlate`/`isValidPlate` from
 * `@workshop-pos/core` at the API boundary — the single implementation of
 * BR-006 — so this file must not re-implement the transformation.
 */

export const VEHICLE_PAGE_SIZES = [25, 50, 100] as const;
export const HISTORY_PAGE_SIZES = [10, 25, 50, 100] as const;
export const VEHICLE_SORT_COLUMNS = ["plate", "brand", "updatedAt"] as const;

export const ORDER_KINDS = ["SALE", "SERVICE"] as const;
export const orderKindSchema = z.enum(ORDER_KINDS);
export type OrderKind = z.infer<typeof orderKindSchema>;

export const ORDER_STATUSES = [
  "DRAFT",
  "ESTIMATED",
  "APPROVED",
  "IN_PROGRESS",
  "COMPLETED",
  "PAID",
  "VOID",
] as const;
export const orderStatusSchema = z.enum(ORDER_STATUSES);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

/**
 * `PARTIAL` means some money was recorded but the order is not settled;
 * `UNPAID` means none. `VOID` is terminal and never contributes to totals.
 */
export const HISTORY_PAYMENT_STATUSES = ["PAID", "PARTIAL", "UNPAID", "VOID"] as const;
export const historyPaymentStatusSchema = z.enum(HISTORY_PAYMENT_STATUSES);
export type HistoryPaymentStatus = z.infer<typeof historyPaymentStatusSchema>;

/**
 * Raw plate entry. Deliberately permissive: BR-006 strips whitespace and
 * symbols, so the server normalizes first and then rejects an empty/oversized
 * result with a Bahasa Indonesia field error.
 */
export const plateInputSchema = z
  .string()
  .trim()
  .min(1, "Nomor polisi wajib diisi.")
  .max(32, "Nomor polisi maksimal 32 karakter.");

const brandSchema = z
  .string()
  .trim()
  .min(1, "Merek wajib diisi.")
  .max(60, "Merek maksimal 60 karakter.");

const modelSchema = z
  .string()
  .trim()
  .min(1, "Model wajib diisi.")
  .max(60, "Model maksimal 60 karakter.");

const colorSchema = z.string().trim().max(40, "Warna maksimal 40 karakter.");

const yearSchema = z
  .number()
  .int("Tahun harus bilangan bulat.")
  .min(1886, "Tahun minimal 1886.")
  .max(2200, "Tahun maksimal 2200.");

const odometerSchema = z
  .number()
  .int("Odometer harus bilangan bulat.")
  .min(0, "Odometer tidak boleh negatif.")
  .max(10_000_000, "Odometer terlalu besar.");

/** Chassis/VIN is optional (PD-03); dashes are tolerated, control data is not. */
const vinSchema = z
  .string()
  .trim()
  .toUpperCase()
  .max(32, "Nomor rangka maksimal 32 karakter.")
  .regex(/^[A-Z0-9-]+$/, "Nomor rangka hanya boleh huruf, angka, atau tanda hubung.");

const vehicleNotesSchema = z
  .string()
  .trim()
  .max(500, "Catatan maksimal 500 karakter.");

export const vehicleSchema = z.object({
  id: z.uuid(),
  normalizedPlate: z.string(),
  brand: z.string(),
  model: z.string(),
  year: z.number().int().nullable(),
  color: z.string().nullable(),
  odometer: z.number().int().nullable(),
  vin: z.string().nullable(),
  notes: z.string().nullable(),
  customerId: z.uuid(),
  /** An anonymized customer renders `Pelanggan dianonimkan`, never a raw id. */
  customerName: z.string(),
  customerAnonymized: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Vehicle = z.infer<typeof vehicleSchema>;

/**
 * List rows omit VIN and free-text notes. They are PD-03 fields that no list
 * column renders; the edit dialog reads the full record for roles that may
 * manage vehicles.
 */
export const vehicleListItemSchema = vehicleSchema.omit({
  vin: true,
  notes: true,
});
export type VehicleListItem = z.infer<typeof vehicleListItemSchema>;

export const vehicleListQuerySchema = z.object({
  q: z.string().trim().max(80, "Pencarian maksimal 80 karakter.").optional(),
  customerId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .refine(
      (value) => (VEHICLE_PAGE_SIZES as readonly number[]).includes(value),
      "Ukuran halaman tidak didukung.",
    )
    .default(25),
  sort: z.enum(VEHICLE_SORT_COLUMNS).default("plate"),
  dir: z.enum(["asc", "desc"]).default("asc"),
});
export type VehicleListQuery = z.infer<typeof vehicleListQuerySchema>;

export const vehicleListResponseSchema = z.object({
  items: z.array(vehicleListItemSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});
export type VehicleListResponse = z.infer<typeof vehicleListResponseSchema>;

export const createVehicleSchema = z.object({
  plate: plateInputSchema,
  brand: brandSchema,
  model: modelSchema,
  year: yearSchema.nullable().optional(),
  color: colorSchema.nullable().optional(),
  odometer: odometerSchema.nullable().optional(),
  vin: vinSchema.nullable().optional(),
  notes: vehicleNotesSchema.nullable().optional(),
  customerId: z.uuid("Pelanggan wajib dipilih."),
});
export type CreateVehicleRequest = z.infer<typeof createVehicleSchema>;

export const updateVehicleSchema = z
  .object({
    plate: plateInputSchema.optional(),
    brand: brandSchema.optional(),
    model: modelSchema.optional(),
    year: yearSchema.nullable().optional(),
    color: colorSchema.nullable().optional(),
    odometer: odometerSchema.nullable().optional(),
    vin: vinSchema.nullable().optional(),
    notes: vehicleNotesSchema.nullable().optional(),
    customerId: z.uuid().optional(),
  })
  .refine(
    (value) => Object.values(value).some((entry) => entry !== undefined),
    "Tidak ada perubahan yang dikirim.",
  );
export type UpdateVehicleRequest = z.infer<typeof updateVehicleSchema>;

/**
 * Create answers `reused: true` (HTTP 200) when the normalized plate already
 * exists for the business; the existing vehicle is returned unchanged so the
 * intake flow continues without a duplicate record (AC4.2). A fresh vehicle is
 * HTTP 201 with `reused: false`.
 */
export const vehicleResponseSchema = z.object({
  item: vehicleSchema,
  reused: z.boolean(),
});
export type VehicleResponse = z.infer<typeof vehicleResponseSchema>;

/** Single-record read (management-only; carries VIN and notes). */
export const vehicleDetailResponseSchema = z.object({ item: vehicleSchema });
export type VehicleDetailResponse = z.infer<typeof vehicleDetailResponseSchema>;

export const vehicleHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .refine(
      (value) => (HISTORY_PAGE_SIZES as readonly number[]).includes(value),
      "Ukuran halaman tidak didukung.",
    )
    .default(25),
  /**
   * Optional outlet filter for roles that see several outlets (Owner/Admin).
   * A scoped role naming an outlet outside its assignment is denied and
   * audited instead of being silently narrowed (BR-012, AC10.4).
   */
  outletId: z.uuid().optional(),
});
export type VehicleHistoryQuery = z.infer<typeof vehicleHistoryQuerySchema>;

export const historyLineSchema = z.object({
  lineType: z.enum(["PRODUCT", "SERVICE"]),
  description: z.string(),
  quantity: z.number().int().positive(),
  lineTotal: moneyStringSchema,
});
export type HistoryLine = z.infer<typeof historyLineSchema>;

export const historyOrderSchema = z.object({
  id: z.uuid(),
  orderNumber: z.string().nullable(),
  kind: orderKindSchema,
  status: orderStatusSchema,
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  paidAt: z.string().nullable(),
  outletId: z.uuid(),
  outletName: z.string(),
  odometer: z.number().int().nullable(),
  total: moneyStringSchema,
  paidTotal: moneyStringSchema,
  balanceDue: moneyStringSchema,
  paymentStatus: historyPaymentStatusSchema,
  lines: z.array(historyLineSchema),
});
export type HistoryOrder = z.infer<typeof historyOrderSchema>;

/**
 * Visit totals over the whole scoped history, not just the current page.
 * `visits` and `totalSpent` exclude voided orders; `outstanding` is the sum of
 * balances still owed on non-void orders (AC10.1–AC10.2).
 */
export const vehicleHistoryTotalsSchema = z.object({
  visits: z.number().int().nonnegative(),
  totalSpent: moneyStringSchema,
  outstanding: moneyStringSchema,
});
export type VehicleHistoryTotals = z.infer<typeof vehicleHistoryTotalsSchema>;

export const vehicleHistoryScopeSchema = z.object({
  allOutlets: z.boolean(),
  outletId: z.uuid().nullable(),
  outletName: z.string().nullable(),
});
export type VehicleHistoryScope = z.infer<typeof vehicleHistoryScopeSchema>;

/**
 * History exposes the vehicle identity needed to render the page (plate,
 * brand/model, owner name) but never VIN or free-text notes; those stay on the
 * management-only detail read.
 */
export const vehicleHistoryVehicleSchema = vehicleSchema.omit({
  vin: true,
  notes: true,
});
export type VehicleHistoryVehicle = z.infer<typeof vehicleHistoryVehicleSchema>;

export const vehicleHistoryResponseSchema = z.object({
  vehicle: vehicleHistoryVehicleSchema,
  orders: z.array(historyOrderSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
  totals: vehicleHistoryTotalsSchema,
  scope: vehicleHistoryScopeSchema,
});
export type VehicleHistoryResponse = z.infer<typeof vehicleHistoryResponseSchema>;
