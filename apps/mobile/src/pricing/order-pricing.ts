import {
  discountFromSubtotal,
  multiplyIdrByQuantity,
  taxFromSubtotal,
} from "@workshop-pos/core";

/**
 * Mobile mirror of the server pricing rule (PRD AC3.1, AC3.7, BR-002–BR-004).
 *
 * The device must print exactly the figures the server will validate when the
 * queued sale syncs, so this module mirrors
 * `apps/web/lib/order-pricing.ts` line for line. The sync contract states the
 * allocation rule the device has to reproduce: an order-level discount is
 * spread across lines in proportion to their net value with the largest
 * remainder method (ties by position), per-line tax is half-up on the fully
 * discounted base, and `taxTotal` is the sum of the rounded line taxes.
 *
 * Money stays `bigint`; the only rounding point is per-line tax.
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
  discountAmount: bigint;
  orderDiscountShare: bigint;
  taxableBase: bigint;
  taxAmount: bigint;
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

function lineDiscount(
  gross: bigint,
  percent?: number | null,
  amount?: bigint | null,
): bigint {
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

/** Largest-remainder split so the shares sum exactly to `amount`. */
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

export function isDiscountAboveCap(
  subtotal: bigint,
  discountTotal: bigint,
  capPercent: number,
): boolean {
  if (discountTotal <= 0n) return false;
  if (!Number.isInteger(capPercent) || capPercent < 0 || capPercent > 100) return true;
  return discountTotal * 100n > BigInt(capPercent) * subtotal;
}

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
