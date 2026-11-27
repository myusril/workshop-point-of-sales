import type {
  HistoryLine,
  HistoryOrder,
  HistoryPaymentStatus,
  OrderKind,
  OrderStatus,
} from "@workshop-pos/contracts";
import { idrToString } from "@workshop-pos/core";

/**
 * Pure presentation/math helpers for vehicle service history (FR-022–FR-024).
 *
 * No database or framework imports: the route layer feeds already-loaded rows
 * and every rule below is unit-testable in isolation. Money stays `bigint`
 * until the transport string is produced, so no float ever enters the path.
 */

/**
 * Statuses whose remaining balance is still owed money (AC10.1–AC10.2).
 * Every non-void order counts, draft and estimated included, so the row-level
 * `balanceDue` and the scope-level `outstanding` roll-up always agree.
 * The SQL roll-up in `getVehicleHistory` uses the same rule (`status <> 'VOID'`).
 */
const OUTSTANDING_BY_STATUS: Record<OrderStatus, boolean> = {
  DRAFT: true,
  ESTIMATED: true,
  APPROVED: true,
  IN_PROGRESS: true,
  COMPLETED: true,
  PAID: true,
  VOID: false,
};

/** Remaining money on an order, never negative (overpayment is a change, not debt). */
export function balanceDueOf(total: bigint, paidTotal: bigint): bigint {
  const remaining = total - paidTotal;
  return remaining > 0n ? remaining : 0n;
}

/**
 * Settlement badge for one order. A voided order is terminal and reports
 * `VOID` regardless of any money recorded before the void.
 */
export function paymentStatusOf(
  status: OrderStatus,
  total: bigint,
  paidTotal: bigint,
): HistoryPaymentStatus {
  if (status === "VOID") return "VOID";
  if (total > 0n && paidTotal >= total) return "PAID";
  if (paidTotal > 0n) return "PARTIAL";
  return "UNPAID";
}

export interface HistoryLineSource {
  lineType: HistoryLine["lineType"];
  description: string;
  quantity: number;
  lineTotal: bigint;
}

export interface HistoryOrderSource {
  id: string;
  orderNumber: string | null;
  kind: OrderKind;
  status: OrderStatus;
  createdAt: Date;
  completedAt: Date | null;
  paidAt: Date | null;
  outletId: string;
  outletName: string;
  odometer: number | null;
  total: bigint;
  paidTotal: bigint;
  lines: readonly HistoryLineSource[];
}

/** Maps one loaded order (plus its lines) onto the history contract. */
export function toHistoryOrder(input: HistoryOrderSource): HistoryOrder {
  const balanceDue = OUTSTANDING_BY_STATUS[input.status]
    ? balanceDueOf(input.total, input.paidTotal)
    : 0n;

  return {
    id: input.id,
    orderNumber: input.orderNumber,
    kind: input.kind,
    status: input.status,
    createdAt: input.createdAt.toISOString(),
    completedAt: input.completedAt?.toISOString() ?? null,
    paidAt: input.paidAt?.toISOString() ?? null,
    outletId: input.outletId,
    outletName: input.outletName,
    odometer: input.odometer,
    total: idrToString(input.total),
    paidTotal: idrToString(input.paidTotal),
    balanceDue: idrToString(balanceDue),
    paymentStatus: paymentStatusOf(input.status, input.total, input.paidTotal),
    lines: input.lines.map((line) => ({
      lineType: line.lineType,
      description: line.description,
      quantity: line.quantity,
      lineTotal: idrToString(line.lineTotal),
    })),
  };
}
