import type { OutletSettings, ReceiptSnapshot } from "@/src/db/repository";
import { emptyCart, type CartLine } from "@/src/domain/sale";
import type { StoredSession } from "@/src/auth/session-store";

export const TEST_OUTLET_ID = "11111111-1111-4111-8111-111111111111";
export const TEST_PRODUCT_ID = "22222222-2222-4222-8222-222222222222";
export const TEST_SERVICE_ID = "33333333-3333-4333-8333-333333333333";

export function testSettings(overrides: Partial<OutletSettings> = {}): OutletSettings {
  return {
    outletId: TEST_OUTLET_ID,
    taxRate: 11,
    paperWidth: 58,
    cashierDiscountCapPercent: 100,
    voidReasonMinLength: 10,
    headerText: null,
    footerText: null,
    source: "SERVER",
    cachedAt: "2026-11-27T02:00:00.000Z",
    ...overrides,
  };
}

export function testSession(overrides: Partial<StoredSession> = {}): StoredSession {
  return {
    user: {
      id: "user-cashier",
      name: "Dewi",
      email: "dewi@example.com",
      username: "dewi",
      phone: "+6281200000000",
      role: "CASHIER",
    },
    activeOutletId: TEST_OUTLET_ID,
    outlets: [{ id: TEST_OUTLET_ID, name: "Outlet A", isActive: true }],
    allowedActions: [
      "create_sale",
      "record_payment",
      "void_paid",
      "manage_customers",
      "service_intake",
      "view_vehicle_history",
    ],
    idleTimeoutMinutes: 30,
    sessionExpiresAt: "2026-11-27T10:00:00.000Z",
    signedInAt: "2026-11-27T01:00:00.000Z",
    tokenExpiresAt: null,
    ...overrides,
  };
}

export function line(overrides: Partial<CartLine> = {}): CartLine {
  return {
    lineKey: "line-1",
    lineType: "PRODUCT",
    catalogItemId: TEST_PRODUCT_ID,
    description: "Kampas rem depan",
    unitPrice: 250_000n,
    quantity: 1,
    discountPercent: null,
    discountAmount: 0n,
    technicianId: null,
    ...overrides,
  };
}

export function ac31Cart() {
  return {
    ...emptyCart(),
    lines: [
      line(),
      line({
        lineKey: "line-2",
        lineType: "SERVICE",
        catalogItemId: TEST_SERVICE_ID,
        description: "Jasa pasang kampas",
        unitPrice: 50_000n,
      }),
    ],
    discountPercent: 10,
  };
}

export function testReceipt(overrides: Partial<ReceiptSnapshot> = {}): ReceiptSnapshot {
  return {
    paperWidth: 58,
    outletName: "Bengkel Jaya",
    headerText: "Jl. Contoh No. 1",
    footerText: "Terima kasih",
    localNumber: "LOKAL-ABCDEF",
    deviceRecordedAt: "2026-11-27T02:00:00.000Z",
    cashierName: "Dewi",
    customerName: "Budi",
    vehiclePlate: "B1234XYZ",
    vehicleLabel: "Honda Beat",
    technicianName: null,
    lines: [
      {
        lineType: "PRODUCT",
        description: "Kampas rem depan",
        quantity: 1,
        unitPrice: "250000",
        discountAmount: "0",
        lineTotal: "250000",
      },
      {
        lineType: "SERVICE",
        description: "Jasa pasang kampas",
        quantity: 1,
        unitPrice: "50000",
        discountAmount: "0",
        lineTotal: "50000",
      },
    ],
    subtotal: "300000",
    discountTotal: "30000",
    taxRatePercent: 11,
    taxTotal: "29700",
    total: "299700",
    payments: [{ method: "CASH", amount: "299700", changeAmount: "300" }],
    changeTotal: "300",
    ...overrides,
  };
}

export { emptyCart };
