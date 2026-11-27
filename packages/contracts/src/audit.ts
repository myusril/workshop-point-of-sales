import { z } from "zod";

/**
 * Audit-log read contract (PRD FR-069, AC20.1–AC20.4).
 *
 * Entries are append-only at the database level; this surface has no write
 * operation. Payloads stay `unknown` because every action records its own
 * before/after shape, and the UI renders a field diff rather than assuming one.
 */

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal harus berformat YYYY-MM-DD.");

export const AUDIT_PAGE_SIZES = [25, 50, 100] as const;

export const auditListQuerySchema = z
  .object({
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
    actorId: z.string().trim().max(100, "Pelaku tidak valid.").optional(),
    action: z.string().trim().max(120, "Jenis aksi tidak valid.").optional(),
    entityType: z.string().trim().max(100, "Jenis data tidak valid.").optional(),
    entityId: z.string().trim().max(200, "ID data tidak valid.").optional(),
    outletId: z.uuid("Outlet tidak valid.").optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce
      .number()
      .int()
      .refine(
        (value) => (AUDIT_PAGE_SIZES as readonly number[]).includes(value),
        "Ukuran halaman tidak didukung.",
      )
      .default(25),
  })
  .refine(
    (value) => {
      if (!value.from || !value.to) return true;
      return value.from <= value.to;
    },
    { message: "Tanggal akhir tidak boleh mendahului tanggal awal.", path: ["to"] },
  );
export type AuditListQuery = z.infer<typeof auditListQuerySchema>;

export const auditEntrySchema = z.object({
  id: z.uuid(),
  createdAt: z.string(),
  actorId: z.string().nullable(),
  actorName: z.string().nullable(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  outletId: z.uuid().nullable(),
  outletName: z.string().nullable(),
  reason: z.string().nullable(),
  before: z.unknown(),
  after: z.unknown(),
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;

export const auditListResponseSchema = z.object({
  items: z.array(auditEntrySchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});
export type AuditListResponse = z.infer<typeof auditListResponseSchema>;

export const auditFiltersResponseSchema = z.object({
  actions: z.array(z.string()),
  entityTypes: z.array(z.string()),
  actors: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
    }),
  ),
});
export type AuditFiltersResponse = z.infer<typeof auditFiltersResponseSchema>;
