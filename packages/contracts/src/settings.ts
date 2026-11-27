import { z } from "zod";

import { receiptPaperWidthSchema } from "./receipts.ts";

/**
 * Per-outlet settings and branding contracts (PRD FR-070, FR-071).
 *
 * Defaults match the PRD exactly. A settings change is audited and never
 * rewrites an existing order: order rows keep their own tax / discount
 * snapshots, which the report layer reads from the order, not from here.
 */

export const OUTLET_SETTINGS_DEFAULTS = {
  taxRate: 11,
  cashierDiscountCapPercent: 0,
  idleTimeoutMinutes: 30,
  receiptPaperWidth: 58,
  voidReasonMinLength: 10,
  receiptPrefix: "",
  receiptHeaderText: null,
  receiptFooterText: null,
} as const;


const optionalText = (max: number, message: string) =>
  z
    .union([z.string(), z.null()])
    .transform((value) => {
      if (value === null) return null;
      const trimmed = value.trim();
      return trimmed.length === 0 ? null : trimmed;
    })
    .refine((value) => value === null || value.length <= max, message);

export const settingsQuerySchema = z.object({
  outletId: z.uuid("Outlet tidak valid."),
});
export type SettingsQuery = z.infer<typeof settingsQuerySchema>;

export const outletSettingsSchema = z.object({
  outletId: z.uuid(),
  outletName: z.string(),
  taxRate: z.number().int().min(0).max(100),
  cashierDiscountCapPercent: z.number().int().min(0).max(100),
  idleTimeoutMinutes: z.number().int().min(1).max(1440),
  receiptPaperWidth: receiptPaperWidthSchema,
  voidReasonMinLength: z.number().int().min(1).max(200),
  receiptPrefix: z.string(),
  receiptHeaderText: z.string().nullable(),
  receiptFooterText: z.string().nullable(),
  updatedAt: z.string().nullable(),
  updatedByName: z.string().nullable(),
});
export type OutletSettings = z.infer<typeof outletSettingsSchema>;

export const updateOutletSettingsSchema = z.object({
  outletId: z.uuid("Outlet tidak valid."),
  taxRate: z
    .number()
    .int("Tarif pajak harus bilangan bulat.")
    .min(0, "Tarif pajak minimal 0%.")
    .max(100, "Tarif pajak maksimal 100%."),
  cashierDiscountCapPercent: z
    .number()
    .int("Batas diskon harus bilangan bulat.")
    .min(0, "Batas diskon minimal 0%.")
    .max(100, "Batas diskon maksimal 100%."),
  idleTimeoutMinutes: z
    .number()
    .int("Batas waktu harus bilangan bulat.")
    .min(1, "Batas waktu minimal 1 menit.")
    .max(1440, "Batas waktu maksimal 1440 menit."),
  receiptPaperWidth: receiptPaperWidthSchema,
  voidReasonMinLength: z
    .number()
    .int("Panjang alasan harus bilangan bulat.")
    .min(1, "Panjang alasan minimal 1 karakter.")
    .max(200, "Panjang alasan maksimal 200 karakter."),
  receiptPrefix: z
    .string()
    .trim()
    .max(20, "Awalan struk maksimal 20 karakter.")
    .regex(
      /^[A-Za-z0-9/-]*$/,
      "Awalan struk hanya boleh berisi huruf, angka, garis miring, atau tanda hubung.",
    ),
  receiptHeaderText: optionalText(300, "Teks kepala struk maksimal 300 karakter."),
  receiptFooterText: optionalText(300, "Teks kaki struk maksimal 300 karakter."),
});
export type UpdateOutletSettingsRequest = z.infer<
  typeof updateOutletSettingsSchema
>;

export const brandingSchema = z.object({
  productName: z.string(),
  logoPath: z.string().nullable(),
});
export type Branding = z.infer<typeof brandingSchema>;

const logoPathSchema = z
  .union([z.string(), z.null()])
  .transform((value) => {
    if (value === null) return null;
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  })
  .refine(
    (value) =>
      value === null ||
      /^\/[A-Za-z0-9._/-]*$/.test(value) ||
      /^https:\/\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+$/.test(value),
    "Logo harus berupa path lokal (/) atau URL https.",
  )
  .refine((value) => value === null || value.length <= 300, "Path logo maksimal 300 karakter.");

export const updateBrandingSchema = z.object({
  productName: z
    .string()
    .trim()
    .min(1, "Nama produk wajib diisi.")
    .max(80, "Nama produk maksimal 80 karakter."),
  logoPath: logoPathSchema,
});
export type UpdateBrandingRequest = z.infer<typeof updateBrandingSchema>;
