import { syncApplyRequestSchema, type SyncApplyRequest } from "@workshop-pos/contracts";

import {
  isDiscountAboveCap,
  type OrderPricing,
  PricingError,
} from "@/src/pricing/order-pricing";
import {
  buildSalePayload,
  cartPricing,
  generateClientKey,
  SaleRuleError,
  type CartState,
  type PlannedPayment,
} from "@/src/domain/sale";
import type { StoredSession } from "@/src/auth/session-store";
import {
  saveLocalSale,
  type LocalOrderDisplay,
  type OutletSettings,
  type ReceiptSnapshot,
} from "@/src/db/repository";
import type { SqlDatabase } from "@/src/db/executor";
import { hasAction } from "@/src/auth/session-store";

/**
 * Local commit of a paid sale (AC14.1, AC3.7).
 *
 * One SQLite transaction writes the order snapshot and its outbox row, after
 * the payload has passed the shared sync contract. Nothing is sent here: the
 * queue owns delivery, so a network failure after the customer leaves can never
 * lose the sale or ask the cashier to charge again.
 */

export interface CommitSaleInput {
  cart: CartState;
  settings: OutletSettings;
  session: StoredSession;
  outletName: string;
  payments: readonly PlannedPayment[];
  customer?: { id: string; name: string } | null;
  vehicle?: { id: string; plate: string; brand: string; model: string } | null;
  notes?: string | null;
  odometer?: number | null;
  clientKey?: string;
  now?: Date;
}

export interface CommitSaleResult {
  clientKey: string;
  payload: SyncApplyRequest;
  receipt: ReceiptSnapshot;
  display: LocalOrderDisplay;
  pricing: OrderPricing;
}

export function localReference(clientKey: string): string {
  return `LOKAL-${clientKey.slice(-6).toUpperCase()}`;
}

function assertDiscountCap(
  pricing: OrderPricing,
  settings: OutletSettings,
  session: StoredSession,
): void {
  if (
    isDiscountAboveCap(pricing.subtotal, pricing.discountTotal, settings.cashierDiscountCapPercent) &&
    !hasAction(session, "override_discount")
  ) {
    throw new SaleRuleError(
      "discount",
      `Diskon di atas ${settings.cashierDiscountCapPercent}% memerlukan persetujuan Admin atau Pemilik.`,
    );
  }
}

export async function commitLocalSale(
  db: SqlDatabase,
  input: CommitSaleInput,
): Promise<CommitSaleResult> {
  if (!hasAction(input.session, "create_sale")) {
    throw new SaleRuleError(
      "role",
      "Peran Anda tidak dapat membuat penjualan. Hubungi Admin atau Pemilik.",
    );
  }
  const now = input.now ?? new Date();
  let pricing: OrderPricing;
  try {
    pricing = cartPricing(input.cart, input.settings.taxRate);
  } catch (error) {
    if (error instanceof PricingError) {
      throw new SaleRuleError("cart", error.message);
    }
    throw error;
  }
  assertDiscountCap(pricing, input.settings, input.session);

  const paidTotal = input.payments.reduce((sum, payment) => sum + payment.amount, 0n);
  if (paidTotal !== pricing.total) {
    throw new SaleRuleError(
      "payments",
      "Total pembayaran tidak sama dengan total transaksi. Periksa kembali.",
    );
  }

  const clientKey = input.clientKey ?? generateClientKey(now);
  const payload = syncApplyRequestSchema.parse(
    buildSalePayload({
      clientKey,
      outletId: input.session.activeOutletId,
      cart: input.cart,
      pricing,
      taxRatePercent: input.settings.taxRate,
      payments: input.payments,
      customerId: input.customer?.id ?? null,
      vehicleId: input.vehicle?.id ?? null,
      odometer: input.odometer ?? null,
      notes: input.notes ?? null,
      deviceRecordedAt: now.toISOString(),
    }),
  );

  const localNumber = localReference(clientKey);
  const changeTotal = input.payments.reduce((sum, payment) => sum + payment.changeAmount, 0n);
  const receipt: ReceiptSnapshot = {
    paperWidth: input.settings.paperWidth,
    outletName: input.outletName,
    headerText: input.settings.headerText,
    footerText: input.settings.footerText,
    localNumber,
    deviceRecordedAt: now.toISOString(),
    cashierName: input.session.user.name,
    customerName: input.customer?.name ?? null,
    vehiclePlate: input.vehicle?.plate ?? null,
    vehicleLabel: input.vehicle ? `${input.vehicle.brand} ${input.vehicle.model}` : null,
    technicianName: null,
    lines: input.cart.lines.map((line, index) => {
      const priced = pricing.lines[index];
      return {
        lineType: line.lineType,
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice.toString(),
        discountAmount: (priced?.discountAmount ?? 0n).toString(),
        lineTotal: (priced?.lineTotal ?? 0n).toString(),
      };
    }),
    subtotal: pricing.subtotal.toString(),
    discountTotal: pricing.discountTotal.toString(),
    taxRatePercent: input.settings.taxRate,
    taxTotal: pricing.taxTotal.toString(),
    total: pricing.total.toString(),
    payments: input.payments.map((payment) => ({
      method: payment.method,
      amount: payment.amount.toString(),
      changeAmount: payment.changeAmount.toString(),
    })),
    changeTotal: changeTotal.toString(),
  };

  const display: LocalOrderDisplay = {
    localNumber,
    total: pricing.total.toString(),
    changeTotal: changeTotal.toString(),
    lineCount: input.cart.lines.length,
    customerName: input.customer?.name ?? null,
    vehiclePlate: input.vehicle?.plate ?? null,
  };

  await saveLocalSale(db, {
    payload,
    receipt,
    display,
    createdAt: now.toISOString(),
  });

  return { clientKey, payload, receipt, display, pricing };
}
