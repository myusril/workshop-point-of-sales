/**
 * Pure stock-ledger rules (PRD BR-005, FR-050–FR-053).
 *
 * Stock-on-hand is never stored: it is the sum of ledger deltas. This module
 * plans a movement before the API writes it, so the same invariants are tested
 * without a database and enforced again inside the locked transaction.
 */

export const LEDGER_ENTRY_TYPES = [
  "STOCK_IN",
  "ADJUSTMENT",
  "SALE_DECREMENT",
  "SALE_REVERSAL",
] as const;

export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];

export const STOCK_REASON_MIN_LENGTH = 3;
export const STOCK_REASON_MAX_LENGTH = 200;

export type StockRuleErrorCode =
  | "INVALID_QUANTITY"
  | "ZERO_DELTA"
  | "INVALID_DIRECTION"
  | "REASON_REQUIRED"
  | "REASON_TOO_LONG"
  | "NEGATIVE_WITHOUT_OVERRIDE"
  | "OVERRIDE_NOT_ALLOWED"
  | "OVERRIDE_REQUIRES_REASON";

export class StockRuleError extends Error {
  readonly code: StockRuleErrorCode;

  constructor(code: StockRuleErrorCode, message: string) {
    super(message);
    this.name = "StockRuleError";
    this.code = code;
  }
}

export interface StockMovementInput {
  /** Ledger stock-on-hand before the movement; may be negative from an override. */
  before: number;
  /** Signed whole-unit change: stock-in/reversal positive, sale negative. */
  delta: number;
  entryType: LedgerEntryType;
  /** True only when the caller deliberately allows a negative result. */
  override?: boolean;
  reason?: string | null;
}

export interface StockMovementPlan {
  before: number;
  delta: number;
  after: number;
  entryType: LedgerEntryType;
  override: boolean;
  reason: string | null;
}

function assertWholeUnits(value: number, label: string): void {
  if (!Number.isInteger(value)) {
    throw new StockRuleError("INVALID_QUANTITY", `${label} harus bilangan bulat.`);
  }
}

function normalizeReason(reason: string | null | undefined): string | null {
  if (reason === null || reason === undefined) return null;
  const trimmed = reason.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Validates one movement and returns the exact before/after pair that must be
 * written. A rejected plan means no ledger row is written.
 */
export function planStockMovement(input: StockMovementInput): StockMovementPlan {
  assertWholeUnits(input.before, "Stok sebelum");
  assertWholeUnits(input.delta, "Jumlah perubahan");

  if (input.delta === 0) {
    throw new StockRuleError("ZERO_DELTA", "Jumlah perubahan tidak boleh nol.");
  }
  if (!LEDGER_ENTRY_TYPES.includes(input.entryType)) {
    throw new StockRuleError("INVALID_DIRECTION", "Jenis pergerakan stok tidak dikenal.");
  }

  switch (input.entryType) {
    case "STOCK_IN":
      if (input.delta <= 0) {
        throw new StockRuleError("INVALID_DIRECTION", "Stok masuk harus menambah jumlah.");
      }
      break;
    case "SALE_REVERSAL":
      if (input.delta <= 0) {
        throw new StockRuleError("INVALID_DIRECTION", "Pembalikan stok harus menambah jumlah.");
      }
      break;
    case "SALE_DECREMENT":
      if (input.delta >= 0) {
        throw new StockRuleError("INVALID_DIRECTION", "Pengurangan stok harus mengurangi jumlah.");
      }
      break;
    case "ADJUSTMENT":
      break;
  }

  const reason = normalizeReason(input.reason);
  if (input.entryType === "ADJUSTMENT" && reason === null) {
    throw new StockRuleError("REASON_REQUIRED", "Alasan penyesuaian wajib diisi.");
  }
  if (reason !== null && reason.length < STOCK_REASON_MIN_LENGTH) {
    throw new StockRuleError(
      "REASON_REQUIRED",
      `Alasan minimal ${STOCK_REASON_MIN_LENGTH} karakter.`,
    );
  }
  if (reason !== null && reason.length > STOCK_REASON_MAX_LENGTH) {
    throw new StockRuleError(
      "REASON_TOO_LONG",
      `Alasan maksimal ${STOCK_REASON_MAX_LENGTH} karakter.`,
    );
  }

  const after = input.before + input.delta;
  const override = input.override === true;

  if (after < 0) {
    if (!override) {
      throw new StockRuleError(
        "NEGATIVE_WITHOUT_OVERRIDE",
        "Stok tidak mencukupi. Stok tidak boleh negatif tanpa override Admin atau Pemilik.",
      );
    }
    if (reason === null) {
      throw new StockRuleError(
        "OVERRIDE_REQUIRES_REASON",
        "Override stok negatif wajib disertai alasan.",
      );
    }
  } else if (override) {
    throw new StockRuleError(
      "OVERRIDE_NOT_ALLOWED",
      "Override hanya berlaku jika hasil akhirnya negatif.",
    );
  }

  return {
    before: input.before,
    delta: input.delta,
    after,
    entryType: input.entryType,
    override,
    reason,
  };
}

/** True when the movement can be applied without an Admin/Owner override. */
export function isApplicableWithoutOverride(before: number, delta: number): boolean {
  return before + delta >= 0;
}

export function isLowStock(stockOnHand: number, threshold: number | null): boolean {
  return threshold !== null && stockOnHand <= threshold;
}

/** Units needed to reach the threshold; zero when stock is at or above it. */
export function lowStockShortfall(stockOnHand: number, threshold: number | null): number {
  if (threshold === null) return 0;
  return Math.max(0, threshold - stockOnHand);
}

/** Recomputes stock-on-hand from an initial quantity plus ledger deltas. */
export function recomputeStock(
  initial: number,
  rows: Iterable<{ quantityBefore: number; quantityAfter: number }>,
): number {
  let stock = initial;
  for (const row of rows) {
    stock += row.quantityAfter - row.quantityBefore;
  }
  return stock;
}
