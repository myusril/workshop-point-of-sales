import type {
  PaymentMethod,
  SyncApplyRequest,
  SyncOrderLine,
  SyncOrderPayment,
} from "@workshop-pos/contracts";
import { idrToString } from "@workshop-pos/core";

import { priceOrder, type OrderPricing } from "@/src/pricing/order-pricing";

/**
 * Cart and tender rules for a counter sale.
 *
 * The device is the money authority until sync (AC15.4): unit prices come from
 * the cache snapshot the cashier saw, tax comes from the cached outlet rate,
 * and nothing is repriced when connectivity returns. Stock is not authority
 * here — the server decides it at apply time.
 */

export type SaleLineType = "PRODUCT" | "SERVICE";

export interface CartLine {
  lineKey: string;
  lineType: SaleLineType;
  catalogItemId: string;
  description: string;
  unitPrice: bigint;
  quantity: number;
  discountPercent: number | null;
  discountAmount: bigint;
  technicianId: string | null;
}

export interface CartState {
  lines: CartLine[];
  discountPercent: number | null;
  discountAmount: bigint;
}

export interface TenderInput {
  method: PaymentMethod;
  /** Cash received at the counter; for non-cash, the amount transferred. */
  tendered: bigint;
  /** Required for TRANSFER/QRIS (server rule). */
  referenceNote?: string | null;
}

export interface PlannedPayment {
  method: PaymentMethod;
  /** Money applied to the balance, never the cash tendered. */
  amount: bigint;
  changeAmount: bigint;
  referenceNote: string | null;
}

export interface PaymentPlan {
  payments: PlannedPayment[];
  paidTotal: bigint;
  changeTotal: bigint;
  balanceDue: bigint;
}

export class SaleRuleError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = "SaleRuleError";
    this.field = field;
  }
}

export function emptyCart(): CartState {
  return { lines: [], discountPercent: null, discountAmount: 0n };
}

export function cartPricing(cart: CartState, taxRatePercent: number): OrderPricing {
  return priceOrder({
    lines: cart.lines.map((line) => ({
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountPercent: line.discountPercent,
      discountAmount: line.discountAmount,
    })),
    taxRatePercent,
    orderDiscountPercent: cart.discountPercent,
    orderDiscountAmount: cart.discountAmount,
  });
}

export function lineSubtotal(cart: CartState, lineType: SaleLineType): bigint {
  return cart.lines
    .filter((line) => line.lineType === lineType)
    .reduce((sum, line) => sum + line.unitPrice * BigInt(line.quantity), 0n);
}

/**
 * Turns the tenders entered at the counter into the payment rows the sync
 * contract expects: `amount` is money applied, cash overpayment becomes
 * `changeAmount`, and non-cash can never exceed the remaining balance.
 */
export function planPayments(total: bigint, tenders: readonly TenderInput[]): PaymentPlan {
  if (total <= 0n) {
    throw new SaleRuleError("total", "Total transaksi harus lebih dari nol.");
  }

  const payments: PlannedPayment[] = [];
  let remaining = total;
  let changeTotal = 0n;

  tenders.forEach((tender, index) => {
    if (tender.tendered <= 0n) {
      throw new SaleRuleError(
        `payments.${index}.amount`,
        "Jumlah pembayaran harus lebih dari nol.",
      );
    }
    if (remaining <= 0n) {
      throw new SaleRuleError(
        `payments.${index}.amount`,
        "Tagihan sudah lunas; hapus pembayaran tambahan.",
      );
    }

    const reference = tender.referenceNote?.trim() ?? "";
    if (tender.method !== "CASH" && reference.length === 0) {
      throw new SaleRuleError(
        `payments.${index}.referenceNote`,
        "Referensi wajib diisi untuk pembayaran non-tunai.",
      );
    }

    if (tender.method === "CASH") {
      const applied = tender.tendered < remaining ? tender.tendered : remaining;
      const change = tender.tendered - applied;
      payments.push({
        method: "CASH",
        amount: applied,
        changeAmount: change,
        referenceNote: reference.length > 0 ? reference : null,
      });
      remaining -= applied;
      changeTotal += change;
      return;
    }

    if (tender.tendered > remaining) {
      throw new SaleRuleError(
        `payments.${index}.amount`,
        "Pembayaran non-tunai tidak boleh melebihi sisa tagihan.",
      );
    }
    payments.push({
      method: tender.method,
      amount: tender.tendered,
      changeAmount: 0n,
      referenceNote: reference,
    });
    remaining -= tender.tendered;
  });

  if (remaining !== 0n) {
    throw new SaleRuleError(
      "payments",
      `Sisa tagihan ${idrToString(remaining)} belum dibayar.`,
    );
  }

  const paidTotal = payments.reduce((sum, payment) => sum + payment.amount, 0n);
  return { payments, paidTotal, changeTotal, balanceDue: 0n };
}

export interface SaleDraftInput {
  clientKey: string;
  outletId: string;
  cart: CartState;
  pricing: OrderPricing;
  taxRatePercent: number;
  payments: readonly PlannedPayment[];
  customerId?: string | null;
  vehicleId?: string | null;
  technicianId?: string | null;
  odometer?: number | null;
  notes?: string | null;
  /** ISO-8601 with offset; defaults to now. */
  deviceRecordedAt?: string;
}

/**
 * Builds the exact `POST /api/v1/sync` body. `payments` must already be planned
 * against `pricing.total`; the function asserts the contract's own invariants so
 * an offline sale can never be recorded with money the server will reject.
 */
export function buildSalePayload(input: SaleDraftInput): SyncApplyRequest {
  const { pricing, cart } = input;
  if (cart.lines.length !== pricing.lines.length) {
    throw new SaleRuleError("lines", "Keranjang berubah saat transaksi disimpan.");
  }

  const lines: SyncOrderLine[] = cart.lines.map((line, index) => {
    const priced = pricing.lines[index];
    if (!priced) throw new SaleRuleError("lines", "Baris keranjang tidak lengkap.");
    return {
      lineType: line.lineType,
      catalogItemId: line.catalogItemId,
      description: line.description,
      quantity: line.quantity,
      unitPrice: idrToString(line.unitPrice),
      ...(line.discountPercent != null ? { discountPercent: line.discountPercent } : {}),
      ...(line.discountPercent == null && line.discountAmount > 0n
        ? { discountAmount: idrToString(line.discountAmount) }
        : {}),
      taxAmount: idrToString(priced.taxAmount),
      lineTotal: idrToString(priced.lineTotal),
      technicianId: line.technicianId ?? undefined,
    };
  });

  const payments: SyncOrderPayment[] = input.payments.map((payment) => ({
    method: payment.method,
    amount: idrToString(payment.amount),
    ...(payment.changeAmount > 0n
      ? { changeAmount: idrToString(payment.changeAmount) }
      : {}),
    ...(payment.referenceNote ? { referenceNote: payment.referenceNote } : {}),
  }));

  return {
    clientKey: input.clientKey,
    outletId: input.outletId,
    order: {
      kind: "SALE",
      customerId: input.customerId ?? undefined,
      vehicleId: input.vehicleId ?? undefined,
      technicianId: input.technicianId ?? undefined,
      odometer: input.odometer ?? undefined,
      notes: input.notes?.trim() ? input.notes.trim() : undefined,
      taxRate: input.taxRatePercent,
      ...(cart.discountPercent != null ? { discountPercent: cart.discountPercent } : {}),
      ...(cart.discountPercent == null && cart.discountAmount > 0n
        ? { discountAmount: idrToString(cart.discountAmount) }
        : {}),
      subtotal: idrToString(pricing.subtotal),
      discountTotal: idrToString(pricing.discountTotal),
      taxTotal: idrToString(pricing.taxTotal),
      total: idrToString(pricing.total),
      lines,
      payments,
      deviceRecordedAt: input.deviceRecordedAt ?? new Date().toISOString(),
    },
  };
}

const CLIENT_KEY_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

function randomSuffix(length: number): string {
  const bytes = new Uint8Array(length);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    // React Native without a crypto polyfill: keep the key non-constant.
    for (let index = 0; index < length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (byte) => CLIENT_KEY_ALPHABET[byte % CLIENT_KEY_ALPHABET.length] ?? "0").join("");
}

/**
 * Stable, path-safe idempotency key for a device-created sale. It is generated
 * once and reused verbatim on every retry, which is what makes a replay return
 * the original server result instead of a duplicate order.
 */
export function generateClientKey(now: Date = new Date()): string {
  return `sale-${now.getTime().toString(36)}-${randomSuffix(10)}`;
}
