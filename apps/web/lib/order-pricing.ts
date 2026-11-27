import {
  discountFromSubtotal,
  multiplyIdrByQuantity,
  taxFromSubtotal,
} from "@workshop-pos/core";

/**
 * Server-recomputed order pricing (PRD BR-002–BR-004, FR-031–FR-033).
 *
 * The client may display its own arithmetic, but only this module decides the
 * figures the API persists. Money stays `bigint` throughout; the single
 * rounding point is per-line tax, half-up, on the fully discounted line value.
 *
 * An order-level discount is allocated across lines in proportion to their
 * value after line discounts (largest-remainder method), so per-line tax can be
 * computed exactly and the allocated shares always add up to the order discount.
 */

export type PricingErrorCode =
  | "INVALID_QUANTITY"
  | "INVALID_UNIT_PRICE"
  | "INVALID_DISCOUNT"
  | "DISCOUNT_TOO_LARGE"
  | "EMPTY_ORDER"
  | "ZERO_TOTAL";

export class PricingError extends Error {
  readonly code: PricingErrorCode;

  constructor(code: PricingErrorCode, message: string) {
    super(message);
    this.name = "PricingError";
    this.code = code;
  }
}

export interface PricingLineInput {
  quantity: number;
  unitPrice: bigint;
  discountPercent?: number | null;
  discountAmount?: bigint | null;
}

export interface PricedLine {
  gross: bigint;
  /** Line-level discount stored on `order_lines.discount_amount`. */
  discountAmount: bigint;
  /** This line's share of the order-level discount (not stored on the line). */
  orderDiscountShare: bigint;
  /** `gross − discountAmount − orderDiscountShare`; the tax base. */
  taxableBase: bigint;
  taxAmount: bigint;
  /** Pre-tax line value after the line's own discount (`order_lines.line_total`). */
  lineTotal: bigint;
}

export interface OrderPricingInput {
  lines: readonly PricingLineInput[];
  taxRatePercent: number;
  orderDiscountPercent?: number | null;
  orderDiscountAmount?: bigint | null;
}

export interface OrderPricing {
  lines: PricedLine[];
  subtotal: bigint;
  lineDiscountTotal: bigint;
  orderDiscountTotal: bigint;
  discountTotal: bigint;
  taxableTotal: bigint;
  taxTotal: bigint;
  total: bigint;
}

function lineDiscount(gross: bigint, percent?: number | null, amount?: bigint | null): bigint {
  // A stored line keeps `discount_amount = 0` alongside a percent; zero is
  // absence, not a second discount shape.
  if (percent != null && amount != null && amount !== 0n) {
    throw new PricingError(
      "INVALID_DISCOUNT",
      "Isi diskon persen atau nominal, bukan keduanya.",
    );
  }
  if (percent != null) {
    if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
      throw new PricingError("INVALID_DISCOUNT", "Diskon harus bilangan bulat 0 sampai 100 persen.");
    }
    return discountFromSubtotal(gross, percent);
  }
  if (amount != null && amount !== 0n) {
    if (amount < 0n) {
      throw new PricingError("INVALID_DISCOUNT", "Diskon tidak boleh negatif.");
    }
    return amount;
  }
  return 0n;
}

/**
 * Splits `amount` across `weights` so the shares sum exactly to `amount`.
 * Floor shares first, then one extra rupiah to the largest remainders, ties
 * broken by position, which keeps the allocation deterministic and auditable.
 */
export function allocateDiscount(amount: bigint, weights: readonly bigint[]): bigint[] {
  if (amount < 0n) {
    throw new PricingError("INVALID_DISCOUNT", "Diskon tidak boleh negatif.");
  }
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0n);
  if (amount === 0n || weights.length === 0) return weights.map(() => 0n);
  if (totalWeight <= 0n) {
    throw new PricingError("INVALID_DISCOUNT", "Diskon tidak dapat dialokasikan ke nilai nol.");
  }
  if (amount > totalWeight) {
    throw new PricingError("DISCOUNT_TOO_LARGE", "Diskon melebihi nilai transaksi.");
  }

  const shares = weights.map((weight) => (amount * weight) / totalWeight);
  let remainderTotal = amount - shares.reduce((sum, share) => sum + share, 0n);

  const ranked = weights
    .map((weight, index) => ({ index, remainder: (amount * weight) % totalWeight }))
    .sort((left, right) =>
      left.remainder === right.remainder
        ? left.index - right.index
        : left.remainder > right.remainder
          ? -1
          : 1,
    );

  for (const entry of ranked) {
    if (remainderTotal === 0n) break;
    shares[entry.index] = (shares[entry.index] ?? 0n) + 1n;
    remainderTotal -= 1n;
  }

  return shares;
}

/** True when the aggregate discount exceeds the role's cap (BR-003, AC3.5). */
export function isDiscountAboveCap(
  subtotal: bigint,
  discountTotal: bigint,
  capPercent: number,
): boolean {
  if (discountTotal <= 0n) return false;
  if (!Number.isInteger(capPercent) || capPercent < 0 || capPercent > 100) return true;
  return discountTotal * 100n > BigInt(capPercent) * subtotal;
}

/**
 * Prices an order from its line data. Throws `PricingError` for any input the
 * product must never store (AC3.3/AC3.4), so a rejected order writes nothing.
 */
export function priceOrder(input: OrderPricingInput): OrderPricing {
  if (input.lines.length === 0) {
    throw new PricingError("EMPTY_ORDER", "Tambahkan minimal satu item.");
  }

  const grossByLine = input.lines.map((line) => {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new PricingError("INVALID_QUANTITY", "Jumlah harus bilangan bulat positif.");
    }
    if (line.unitPrice < 0n) {
      throw new PricingError("INVALID_UNIT_PRICE", "Harga satuan tidak boleh negatif.");
    }
    return multiplyIdrByQuantity(line.unitPrice, line.quantity);
  });

  const discountsByLine = input.lines.map((line, index) => {
    const gross = grossByLine[index] ?? 0n;
    const discount = lineDiscount(gross, line.discountPercent, line.discountAmount);
    if (discount > gross) {
      throw new PricingError("DISCOUNT_TOO_LARGE", "Diskon baris melebihi nilai baris.");
    }
    return discount;
  });

  const subtotal = grossByLine.reduce((sum, gross) => sum + gross, 0n);
  const lineDiscountTotal = discountsByLine.reduce((sum, discount) => sum + discount, 0n);
  const netByLine = grossByLine.map((gross, index) => gross - (discountsByLine[index] ?? 0n));
  const netTotal = netByLine.reduce((sum, net) => sum + net, 0n);

  const orderDiscountTotal = lineDiscount(
    subtotal,
    input.orderDiscountPercent,
    input.orderDiscountAmount,
  );
  const discountTotal = lineDiscountTotal + orderDiscountTotal;

  if (discountTotal > subtotal) {
    throw new PricingError("DISCOUNT_TOO_LARGE", "Total diskon melebihi subtotal.");
  }
  if (orderDiscountTotal >= netTotal) {
    throw new PricingError(
      "ZERO_TOTAL",
      "Diskon tidak boleh menghabiskan seluruh nilai transaksi.",
    );
  }

  const shares = allocateDiscount(orderDiscountTotal, netByLine);

  const lines: PricedLine[] = input.lines.map((_line, index) => {
    const gross = grossByLine[index] ?? 0n;
    const discountAmount = discountsByLine[index] ?? 0n;
    const lineTotal = netByLine[index] ?? 0n;
    const orderDiscountShare = shares[index] ?? 0n;
    const taxableBase = lineTotal - orderDiscountShare;
    return {
      gross,
      discountAmount,
      orderDiscountShare,
      taxableBase,
      taxAmount: taxFromSubtotal(taxableBase, input.taxRatePercent),
      lineTotal,
    };
  });

  const taxableTotal = lines.reduce((sum, line) => sum + line.taxableBase, 0n);
  const taxTotal = lines.reduce((sum, line) => sum + line.taxAmount, 0n);
  const total = subtotal - discountTotal + taxTotal;

  return {
    lines,
    subtotal,
    lineDiscountTotal,
    orderDiscountTotal,
    discountTotal,
    taxableTotal,
    taxTotal,
    total,
  };
}
