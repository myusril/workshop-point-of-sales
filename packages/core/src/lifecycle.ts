/**
 * Order lifecycle rules (PRD BR-007, BR-008, BR-009, FR-036, FR-044, FR-051).
 *
 * Pure functions only: the API layer asks this module whether a transition is
 * legal, which role may request it, whether it needs an audited reason, and
 * whether it settles stock. The database still enforces the financial-history
 * guards; this module is the single readable statement of the business table.
 */

export const ORDER_STATUSES = [
  "DRAFT",
  "ESTIMATED",
  "APPROVED",
  "IN_PROGRESS",
  "COMPLETED",
  "PAID",
  "VOID",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type OrderKind = "SALE" | "SERVICE";
export type OrderRole = "OWNER" | "ADMIN" | "CASHIER" | "MECHANIC";

/**
 * BR-007 verbatim. `PAID` is reachable from every payable status because a
 * payment may settle an order before or after work starts; `VOID` is terminal.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  DRAFT: ["ESTIMATED", "PAID", "VOID"],
  ESTIMATED: ["APPROVED", "DRAFT", "VOID"],
  APPROVED: ["IN_PROGRESS", "PAID", "VOID"],
  IN_PROGRESS: ["COMPLETED", "PAID", "VOID"],
  COMPLETED: ["PAID", "VOID"],
  PAID: ["VOID"],
  VOID: [],
};

/** Statuses whose figures may still change (ESTIMATED must revert first). */
const EDITABLE_STATUSES: readonly OrderStatus[] = ["DRAFT", "APPROVED", "IN_PROGRESS"];

export type LifecycleErrorCode =
  | "ILLEGAL_TRANSITION"
  | "VOID_TERMINAL"
  | "REASON_REQUIRED"
  | "ROLE_FORBIDDEN"
  | "PAYMENT_STATUS"
  | "PAYMENT_KIND";

export class OrderLifecycleError extends Error {
  readonly code: LifecycleErrorCode;
  readonly currentStatus: OrderStatus;

  constructor(code: LifecycleErrorCode, currentStatus: OrderStatus, message: string) {
    super(message);
    this.name = "OrderLifecycleError";
    this.code = code;
    this.currentStatus = currentStatus;
  }
}

export function transitionsFrom(status: OrderStatus): readonly OrderStatus[] {
  return ORDER_TRANSITIONS[status];
}

export function isTransitionAllowed(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

/**
 * BR-007 / AC8.1: an unlisted pair is rejected with a message naming the
 * current status. `VOID` gets its own message because it is terminal, not just
 * another missing edge.
 */
export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (from === "VOID") {
    throw new OrderLifecycleError(
      "VOID_TERMINAL",
      from,
      `Transaksi berstatus VOID bersifat final dan tidak dapat diubah menjadi ${to}.`,
    );
  }
  if (from === to) {
    throw new OrderLifecycleError(
      "ILLEGAL_TRANSITION",
      from,
      `Transaksi sudah berstatus ${from}.`,
    );
  }
  if (!isTransitionAllowed(from, to)) {
    throw new OrderLifecycleError(
      "ILLEGAL_TRANSITION",
      from,
      `Transaksi berstatus ${from} tidak dapat berubah menjadi ${to}.`,
    );
  }
}

/** Reverting an estimate to DRAFT is Admin/Owner only and always audited. */
export function requiresRevertApproval(from: OrderStatus, to: OrderStatus): boolean {
  return from === "ESTIMATED" && to === "DRAFT";
}

export function canRevertEstimate(role: OrderRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}

/**
 * AC5.3: an ESTIMATED order's lines are frozen for everyone; an Admin/Owner
 * must revert to DRAFT (audited) before re-estimating. Work already paid or
 * voided is never editable, and a COMPLETED order's figures are frozen for
 * payment and the receipt.
 */
export function isLineEditable(status: OrderStatus): boolean {
  return EDITABLE_STATUSES.includes(status);
}

export function isHeaderEditable(status: OrderStatus): boolean {
  return EDITABLE_STATUSES.includes(status);
}

/** BR-009: `DRAFT` is payable only for a walk-in sale, never a service intake. */
export const PAYABLE_STATUSES: readonly OrderStatus[] = [
  "DRAFT",
  "APPROVED",
  "IN_PROGRESS",
  "COMPLETED",
];

export function canAcceptPayment(status: OrderStatus, kind: OrderKind): boolean {
  if (status === "DRAFT") return kind === "SALE";
  return PAYABLE_STATUSES.includes(status);
}

export function assertCanAcceptPayment(status: OrderStatus, kind: OrderKind): void {
  if (canAcceptPayment(status, kind)) return;

  if (status === "ESTIMATED") {
    throw new OrderLifecycleError(
      "PAYMENT_STATUS",
      status,
      "Estimasi belum dapat dibayar. Catat persetujuan pelanggan terlebih dahulu.",
    );
  }
  if (status === "DRAFT" && kind === "SERVICE") {
    throw new OrderLifecycleError(
      "PAYMENT_KIND",
      status,
      "Nota servis harus disetujui sebelum pembayaran dapat dicatat.",
    );
  }
  if (status === "PAID") {
    throw new OrderLifecycleError("PAYMENT_STATUS", status, "Transaksi ini sudah dibayar.");
  }
  if (status === "VOID") {
    throw new OrderLifecycleError(
      "VOID_TERMINAL",
      status,
      "Transaksi berstatus VOID tidak dapat menerima pembayaran.",
    );
  }
  throw new OrderLifecycleError(
    "PAYMENT_STATUS",
    status,
    `Pembayaran tidak dapat dicatat saat transaksi berstatus ${status}.`,
  );
}

/**
 * BR-008: unpaid orders are voided by Admin/Owner, a PAID order only by the
 * Owner. A VOID order cannot be voided twice.
 */
export function canVoid(status: OrderStatus, role: OrderRole): boolean {
  if (status === "VOID") return false;
  if (status === "PAID") return role === "OWNER";
  return role === "OWNER" || role === "ADMIN";
}

export function assertCanVoid(status: OrderStatus, role: OrderRole): void {
  if (status === "VOID") {
    throw new OrderLifecycleError(
      "VOID_TERMINAL",
      status,
      "Transaksi ini sudah dibatalkan.",
    );
  }
  if (canVoid(status, role)) return;

  throw new OrderLifecycleError(
    "ROLE_FORBIDDEN",
    status,
    status === "PAID"
      ? "Hanya Pemilik yang dapat membatalkan transaksi yang sudah dibayar."
      : "Hanya Admin atau Pemilik yang dapat membatalkan transaksi.",
  );
}

/** Trimmed void reason that satisfies the outlet minimum, or a typed error. */
export function normalizeVoidReason(reason: string, minimumLength: number): string {
  const trimmed = reason.trim();
  const minimum = Number.isInteger(minimumLength) && minimumLength > 0 ? minimumLength : 1;
  if (trimmed.length === 0) {
    throw new OrderLifecycleError("REASON_REQUIRED", "COMPLETED", "Alasan pembatalan wajib diisi.");
  }
  if (trimmed.length < minimum) {
    throw new OrderLifecycleError(
      "REASON_REQUIRED",
      "COMPLETED",
      `Alasan pembatalan minimal ${minimum} karakter.`,
    );
  }
  return trimmed;
}

/**
 * BR-005 / FR-051: stock settles at the earlier of `COMPLETED` and `PAID`.
 * Both transitions request settlement; the ledger's unique
 * `(order_line_id, entry_type)` index makes the second attempt a replay.
 */
export function transitionSettlesStock(from: OrderStatus, to: OrderStatus): boolean {
  if (!isTransitionAllowed(from, to)) return false;
  return to === "COMPLETED" || to === "PAID";
}

/** Every decrement is reversed whole on a void, exactly once. */
export function voidReversesStock(status: OrderStatus): boolean {
  return status !== "VOID";
}

/** Manual transitions never set PAID (payments own it) or VOID (void owns it). */
export const MANUAL_TRANSITION_TARGETS: readonly OrderStatus[] = [
  "ESTIMATED",
  "APPROVED",
  "DRAFT",
  "IN_PROGRESS",
  "COMPLETED",
];
