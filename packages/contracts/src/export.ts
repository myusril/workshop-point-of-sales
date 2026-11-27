import { z } from "zod";

import { businessDateSchema, REPORT_KINDS } from "./reports.ts";

/**
 * CSV export contract (PRD FR-066, AC19.1–AC19.4).
 *
 * Export reuses the exact report query and read model shown on screen; this
 * module only names the download. The stock ledger has its own route because
 * its filters are movement filters, not a report period.
 */

export const exportReportKindSchema = z.enum(REPORT_KINDS);
export type ExportReportKind = z.infer<typeof exportReportKindSchema>;

export const exportReportQuerySchema = z
  .object({
    from: businessDateSchema,
    to: businessDateSchema,
    outletId: z.uuid("Outlet tidak valid.").optional(),
  })
  .refine((value) => value.from <= value.to, {
    message: "Tanggal akhir tidak boleh mendahului tanggal awal.",
    path: ["to"],
  });
export type ExportReportQuery = z.infer<typeof exportReportQuerySchema>;

export const LEDGER_EXPORT_MAX_ROWS = 100_000;

export const exportLedgerQuerySchema = z
  .object({
    from: businessDateSchema.optional(),
    to: businessDateSchema.optional(),
    productId: z.uuid("Produk tidak valid.").optional(),
    entryType: z
      .enum(["STOCK_IN", "ADJUSTMENT", "SALE_DECREMENT", "SALE_REVERSAL"])
      .optional(),
    outletId: z.uuid("Outlet tidak valid.").optional(),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: "Tanggal akhir tidak boleh mendahului tanggal awal.",
    path: ["to"],
  });
export type ExportLedgerQuery = z.infer<typeof exportLedgerQuerySchema>;

export const EXPORT_REPORT_LABELS: Record<ExportReportKind, string> = {
  "daily-sales": "laporan-penjualan-harian",
  "payment-mix": "laporan-komposisi-pembayaran",
  "service-product": "laporan-jasa-dan-produk",
  "technician-productivity": "laporan-produktivitas-teknisi",
  "stock-valuation": "laporan-valuasi-stok",
  "end-of-day": "laporan-akhir-hari",
};
