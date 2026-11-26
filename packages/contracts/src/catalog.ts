import { z } from "zod";

/** Canonical unsigned integer rupiah for API transport (BR-001: no floats). */
export const moneyStringSchema = z
  .string()
  .trim()
  .max(15, "Jumlah uang terlalu besar.")
  .regex(/^(0|[1-9][0-9]*)$/, "Jumlah uang harus angka rupiah bulat tanpa desimal.");

const itemNameSchema = z
  .string()
  .trim()
  .min(2, "Nama minimal 2 karakter.")
  .max(120, "Nama maksimal 120 karakter.");

const unitSchema = z
  .string()
  .trim()
  .min(1, "Satuan wajib diisi.")
  .max(20, "Satuan maksimal 20 karakter.");

const skuSchema = z
  .string()
  .trim()
  .min(1, "SKU wajib diisi.")
  .max(32, "SKU maksimal 32 karakter.")
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "SKU hanya boleh huruf, angka, titik, garis bawah, atau tanda hubung.")
  .transform((value) => value.toUpperCase());

const serviceCodeSchema = z
  .string()
  .trim()
  .min(1, "Kode layanan wajib diisi.")
  .max(32, "Kode layanan maksimal 32 karakter.")
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "Kode layanan hanya boleh huruf, angka, titik, garis bawah, atau tanda hubung.")
  .transform((value) => value.toUpperCase());

const thresholdSchema = z
  .number()
  .int("Batas stok menipis harus bilangan bulat.")
  .min(0, "Batas stok menipis tidak boleh negatif.")
  .max(1_000_000, "Batas stok menipis terlalu besar.");

const COUNT_LIMIT = 1_000_000;

export const catalogItemTypeSchema = z.enum(["PRODUCT", "SERVICE"]);
export type CatalogItemType = z.infer<typeof catalogItemTypeSchema>;

export const catalogTypeFilterSchema = z.enum(["all", "product", "service"]);
export type CatalogTypeFilter = z.infer<typeof catalogTypeFilterSchema>;

export const catalogStatusFilterSchema = z.enum(["all", "active", "inactive"]);
export type CatalogStatusFilter = z.infer<typeof catalogStatusFilterSchema>;

export const catalogSortSchema = z.enum(["name", "sku", "price", "stock", "updatedAt"]);
export type CatalogSort = z.infer<typeof catalogSortSchema>;

export const sortDirectionSchema = z.enum(["asc", "desc"]);
export type SortDirection = z.infer<typeof sortDirectionSchema>;

export const CATALOG_PAGE_SIZES = [25, 50, 100] as const;

export const catalogListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  type: catalogTypeFilterSchema.default("all"),
  status: catalogStatusFilterSchema.default("all"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .refine((value) => (CATALOG_PAGE_SIZES as readonly number[]).includes(value), "Ukuran halaman tidak didukung.")
    .default(25),
  sort: catalogSortSchema.default("name"),
  dir: sortDirectionSchema.default("asc"),
});
export type CatalogListQuery = z.infer<typeof catalogListQuerySchema>;

export const productItemSchema = z.object({
  itemType: z.literal("PRODUCT"),
  id: z.uuid(),
  outletId: z.uuid(),
  outletName: z.string(),
  sku: z.string(),
  name: z.string(),
  unit: z.string(),
  price: moneyStringSchema,
  /** Absent from every response for Cashier/Mechanic (FR-014). */
  cost: moneyStringSchema.optional(),
  lowStockThreshold: z.number().int().nullable(),
  stockOnHand: z.number().int(),
  isLowStock: z.boolean(),
  isActive: z.boolean(),
  updatedAt: z.string(),
});
export type ProductItem = z.infer<typeof productItemSchema>;

export const serviceItemSchema = z.object({
  itemType: z.literal("SERVICE"),
  id: z.uuid(),
  outletId: z.uuid(),
  outletName: z.string(),
  code: z.string(),
  name: z.string(),
  price: moneyStringSchema,
  durationMinutes: z.number().int().positive(),
  isActive: z.boolean(),
  updatedAt: z.string(),
});
export type ServiceItem = z.infer<typeof serviceItemSchema>;

export const catalogItemSchema = z.discriminatedUnion("itemType", [
  productItemSchema,
  serviceItemSchema,
]);
export type CatalogItem = z.infer<typeof catalogItemSchema>;

export const catalogListResponseSchema = z.object({
  items: z.array(catalogItemSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});
export type CatalogListResponse = z.infer<typeof catalogListResponseSchema>;

export const createProductSchema = z.object({
  sku: skuSchema,
  name: itemNameSchema,
  unit: unitSchema.default("pcs"),
  cost: moneyStringSchema,
  price: moneyStringSchema,
  lowStockThreshold: thresholdSchema.nullable().optional(),
  openingStock: z
    .number()
    .int("Stok awal harus bilangan bulat.")
    .min(0, "Stok awal tidak boleh negatif.")
    .max(COUNT_LIMIT, "Stok awal terlalu besar.")
    .default(0),
  openingStockNote: z.string().trim().max(200, "Catatan maksimal 200 karakter.").optional(),
});
export type CreateProductRequest = z.infer<typeof createProductSchema>;

export const updateProductSchema = z
  .object({
    name: itemNameSchema.optional(),
    unit: unitSchema.optional(),
    cost: moneyStringSchema.optional(),
    price: moneyStringSchema.optional(),
    lowStockThreshold: thresholdSchema.nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (value) => Object.values(value).some((entry) => entry !== undefined),
    "Tidak ada perubahan yang dikirim.",
  );
export type UpdateProductRequest = z.infer<typeof updateProductSchema>;

export const createServiceSchema = z.object({
  code: serviceCodeSchema,
  name: itemNameSchema,
  price: moneyStringSchema,
  durationMinutes: z
    .number()
    .int("Durasi harus bilangan bulat.")
    .min(1, "Durasi minimal 1 menit.")
    .max(1_440, "Durasi maksimal 1.440 menit."),
});
export type CreateServiceRequest = z.infer<typeof createServiceSchema>;

export const updateServiceSchema = z
  .object({
    name: itemNameSchema.optional(),
    price: moneyStringSchema.optional(),
    durationMinutes: z
      .number()
      .int("Durasi harus bilangan bulat.")
      .min(1, "Durasi minimal 1 menit.")
      .max(1_440, "Durasi maksimal 1.440 menit.")
      .optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (value) => Object.values(value).some((entry) => entry !== undefined),
    "Tidak ada perubahan yang dikirim.",
  );
export type UpdateServiceRequest = z.infer<typeof updateServiceSchema>;

export const productResponseSchema = z.object({ item: productItemSchema });
export const serviceResponseSchema = z.object({ item: serviceItemSchema });
