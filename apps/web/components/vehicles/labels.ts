import type { HistoryPaymentStatus, OrderKind } from "@workshop-pos/contracts";

import type { StatusChipTone } from "@/components/back-office/status-chip";

/** Bahasa Indonesia labels for the vehicle-history vocabulary (§9.9). */
export const ORDER_KIND_LABELS: Record<OrderKind, string> = {
  SALE: "Penjualan",
  SERVICE: "Jasa",
};

/**
 * Payment status always carries text, never colour alone. `UNPAID` and
 * `PARTIAL` are the two states where a remaining balance must stay visible.
 */
export const PAYMENT_STATUS_LABELS: Record<HistoryPaymentStatus, string> = {
  PAID: "Lunas",
  PARTIAL: "Dibayar sebagian",
  UNPAID: "Belum lunas",
  VOID: "Dibatalkan",
};

export const PAYMENT_STATUS_TONES: Record<HistoryPaymentStatus, StatusChipTone> = {
  PAID: "success",
  PARTIAL: "warning",
  UNPAID: "warning",
  VOID: "danger",
};
