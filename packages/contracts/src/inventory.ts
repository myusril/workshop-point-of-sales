import { z } from "zod";

export const LEDGER_ENTRY_TYPES = [
  "STOCK_IN",
  "ADJUSTMENT",
  "SALE_DECREMENT",
  "SALE_REVERSAL",
] as const;
export const ledgerEntryTypeSchema = z.enum(LEDGER_ENTRY_TYPES);
export type LedgerEntryType = z.infer<typeof ledgerEntryTypeSchema>;

export const LEDGER_SOURCE_TYPES = ["ORDER", "STOCK_IN", "ADJUSTMENT", "CYCLE_COUNT"] as const;
export const ledgerSourceTypeSchema = z.enum(LEDGER_SOURCE_TYPES);
export type LedgerSourceType = z.infer<typeof ledgerSourceTypeSchema>;

export const INVENTORY_PAGE_SIZES = [25, 50, 100] as const;

const referenceSchema = z.string().trim().max(100, "Referensi maksimal 100 karakter.");

export const stockInRequestSchema = z.object({
  productId: z.uuid("Produk tidak valid."),
  quantity: z
    .number()
    .int("Jumlah harus bilangan bulat.")
    .min(1, "Jumlah stok masuk minimal 1.")
    .max(1_000_000, "Jumlah stok masuk terlalu besar."),
  note: z.string().trim().max(200, "Catatan maksimal 200 karakter.").optional(),
  reference: referenceSchema.optional(),
});
export type StockInRequest = z.infer<typeof stockInRequestSchema>;

export const adjustmentRequestSchema = z.object({
  productId: z.uuid("Produk tidak valid."),
  quantityDelta: z
    .number()
    .int("Jumlah harus bilangan bulat.")
    .min(-1_000_000, "Jumlah terlalu kecil.")
    .max(1_000_000, "Jumlah terlalu besar.")
    .refine((value) => value !== 0, "Jumlah penyesuaian tidak boleh nol."),
  reason: z
    .string()
    .trim()
    .min(3, "Alasan minimal 3 karakter.")
    .max(200, "Alasan maksimal 200 karakter."),
  reference: referenceSchema.optional(),
  /** Only an Admin/Owner may request a negative-stock override (FR-053). */
  override: z.boolean().default(false),
});
export type AdjustmentRequest = z.infer<typeof adjustmentRequestSchema>;

export const ledgerListQuerySchema = z.object({
  productId: z.uuid("Produk tidak valid.").optional(),
  entryType: ledgerEntryTypeSchema.optional(),
  from: z.iso.date("Tanggal awal tidak valid.").optional(),
  to: z.iso.date("Tanggal akhir tidak valid.").optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .refine((value) => (INVENTORY_PAGE_SIZES as readonly number[]).includes(value), "Ukuran halaman tidak didukung.")
    .default(25),
});
export type LedgerListQuery = z.infer<typeof ledgerListQuerySchema>;

export const ledgerEntrySchema = z.object({
  id: z.uuid(),
  productId: z.uuid(),
  productSku: z.string(),
  productName: z.string(),
  entryType: ledgerEntryTypeSchema,
  quantityBefore: z.number().int(),
  quantityAfter: z.number().int(),
  quantityDelta: z.number().int(),
  override: z.boolean(),
  reason: z.string().nullable(),
  sourceType: ledgerSourceTypeSchema,
  sourceRef: z.string().nullable(),
  actorId: z.string(),
  actorName: z.string(),
  createdAt: z.string(),
});
export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;

export const ledgerListResponseSchema = z.object({
  items: z.array(ledgerEntrySchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});
export type LedgerListResponse = z.infer<typeof ledgerListResponseSchema>;

export const inventoryProductSchema = z.object({
  id: z.uuid(),
  outletId: z.uuid(),
  outletName: z.string(),
  sku: z.string(),
  name: z.string(),
  unit: z.string(),
  stockOnHand: z.number().int(),
  lowStockThreshold: z.number().int().nullable(),
  isLowStock: z.boolean(),
  isActive: z.boolean(),
});
export type InventoryProduct = z.infer<typeof inventoryProductSchema>;

export const movementResponseSchema = z.object({
  entry: ledgerEntrySchema,
  product: inventoryProductSchema,
  stockOnHand: z.number().int(),
});
export type MovementResponse = z.infer<typeof movementResponseSchema>;

export const lowStockItemSchema = z.object({
  productId: z.uuid(),
  sku: z.string(),
  name: z.string(),
  unit: z.string(),
  stockOnHand: z.number().int(),
  lowStockThreshold: z.number().int(),
  shortfall: z.number().int().nonnegative(),
});
export type LowStockItem = z.infer<typeof lowStockItemSchema>;

export const lowStockResponseSchema = z.object({
  items: z.array(lowStockItemSchema),
});
export type LowStockResponse = z.infer<typeof lowStockResponseSchema>;
