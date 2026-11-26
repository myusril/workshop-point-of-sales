import type { LedgerEntryType, LedgerSourceType } from "@workshop-pos/contracts";

/** Bahasa Indonesia labels shared by the ledger table, filters, and chips. */
export const LEDGER_ENTRY_TYPE_LABELS: Record<LedgerEntryType, string> = {
  STOCK_IN: "Stok masuk",
  ADJUSTMENT: "Penyesuaian",
  SALE_DECREMENT: "Penjualan",
  SALE_REVERSAL: "Pembatalan penjualan",
};

export const LEDGER_SOURCE_TYPE_LABELS: Record<LedgerSourceType, string> = {
  ORDER: "Nota",
  STOCK_IN: "Stok masuk",
  ADJUSTMENT: "Penyesuaian",
  CYCLE_COUNT: "Hitung ulang",
};
