import type {
  OrderKind,
  OrderStatus,
  PaymentMethod,
} from "@workshop-pos/contracts";

/**
 * Bahasa Indonesia labels and chip tones shared by the orders screens and
 * tests. Copy lives here once so a status never reads differently on the list,
 * the detail page, and a receipt stamp.
 */

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  DRAFT: "Draf",
  ESTIMATED: "Estimasi",
  APPROVED: "Disetujui",
  IN_PROGRESS: "Dikerjakan",
  COMPLETED: "Selesai",
  PAID: "Dibayar",
  VOID: "Dibatalkan",
};

export type OrderChipTone = "neutral" | "info" | "success" | "warning" | "danger";

export const ORDER_STATUS_TONES: Record<OrderStatus, OrderChipTone> = {
  DRAFT: "neutral",
  ESTIMATED: "info",
  APPROVED: "info",
  IN_PROGRESS: "warning",
  COMPLETED: "success",
  PAID: "success",
  VOID: "danger",
};

export const ORDER_KIND_LABELS: Record<OrderKind, string> = {
  SALE: "Penjualan",
  SERVICE: "Servis",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Tunai",
  TRANSFER: "Transfer",
  QRIS: "QRIS",
};

export const ORDER_LINE_TYPE_LABELS = {
  PRODUCT: "Spare part",
  SERVICE: "Jasa",
} as const;

/** A voided order is reported as cancelled regardless of money recorded. */
export function orderPaymentStatusLabel(status: OrderStatus, balanceDue: bigint): string {
  if (status === "VOID") return "Dibatalkan";
  if (status === "PAID") return "Lunas";
  return balanceDue > 0n ? "Belum lunas" : "Lunas";
}
