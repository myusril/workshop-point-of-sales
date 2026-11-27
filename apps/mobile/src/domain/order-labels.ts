import type { OrderStatus } from "@workshop-pos/contracts";

import type { LifecycleTone } from "@/src/theme/theme";

/** One label/tone mapping for every mobile order surface (DESIGN §9.2). */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  DRAFT: "Draf",
  ESTIMATED: "Estimasi",
  APPROVED: "Disetujui",
  IN_PROGRESS: "Dikerjakan",
  COMPLETED: "Selesai",
  PAID: "Dibayar",
  VOID: "Dibatalkan",
};

export const ORDER_STATUS_TONES: Record<OrderStatus, LifecycleTone> = {
  DRAFT: "draft",
  ESTIMATED: "estimated",
  APPROVED: "approved",
  IN_PROGRESS: "inProgress",
  COMPLETED: "completed",
  PAID: "paid",
  VOID: "void",
};

export const STAFF_ROLE_LABELS: Record<string, string> = {
  OWNER: "Pemilik",
  ADMIN: "Admin",
  CASHIER: "Kasir",
  MECHANIC: "Mekanik",
};
