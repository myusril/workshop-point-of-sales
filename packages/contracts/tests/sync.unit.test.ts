import { describe, expect, it } from "vitest";

import {
  SYNC_CONFLICT_CODES,
  SYNC_STATES,
  syncApplyRequestSchema,
  syncConflictDetailSchema,
  syncResolveRequestSchema,
  syncResultSchema,
} from "../src/index.ts";

const PRODUCT_ID = "22222222-2222-4222-8222-222222222222";
const SERVICE_ID = "33333333-3333-4333-8333-333333333333";
const ORDER_ID = "11111111-1111-4111-8111-111111111111";
const OUTLET_ID = "44444444-4444-4444-8444-444444444444";

function validRequest() {
  return {
    clientKey: "offline-sale-2026-0001",
    outletId: OUTLET_ID,
    order: {
      kind: "SALE",
      taxRate: 11,
      subtotal: "200000",
      discountTotal: "0",
      taxTotal: "22000",
      total: "222000",
      deviceRecordedAt: "2026-11-27T03:05:00+07:00",
      lines: [
        {
          lineType: "PRODUCT",
          catalogItemId: PRODUCT_ID,
          description: "Kampas rem depan",
          quantity: 1,
          unitPrice: "200000",
          taxAmount: "22000",
          lineTotal: "200000",
        },
      ],
      payments: [
        {
          method: "CASH",
          amount: "222000",
          changeAmount: "0",
          receivedAt: "2026-11-27T03:05:00+07:00",
        },
      ],
    },
  };
}

function validDetail() {
  return {
    id: ORDER_ID,
    orderNumber: "INV/2026/000009",
    kind: "SALE",
    status: "PAID",
    outletId: OUTLET_ID,
    outletName: "Outlet Pusat",
    createdByName: "Dewi Lestari",
    customer: null,
    vehicle: null,
    technician: null,
    odometer: null,
    notes: null,
    taxRate: 11,
    subtotal: "200000",
    discountTotal: "0",
    discountPercent: null,
    discountAmount: "0",
    taxTotal: "22000",
    total: "222000",
    paidTotal: "222000",
    balanceDue: "0",
    changeTotal: "0",
    voidReason: null,
    voidedAt: null,
    completedAt: null,
    paidAt: "2026-11-26T20:05:00.000Z",
    createdAt: "2026-11-26T20:05:00.000Z",
    updatedAt: "2026-11-26T20:05:00.000Z",
    lines: [
      {
        id: "55555555-5555-4555-8555-555555555555",
        lineType: "PRODUCT",
        productId: PRODUCT_ID,
        serviceId: null,
        description: "Kampas rem depan",
        quantity: 1,
        unitPrice: "200000",
        discountPercent: null,
        discountAmount: "0",
        taxAmount: "22000",
        lineTotal: "200000",
        technicianId: null,
        technicianName: null,
      },
    ],
    payments: [
      {
        id: "66666666-6666-4666-8666-666666666666",
        method: "CASH",
        amount: "222000",
        changeAmount: "0",
        referenceNote: null,
        receivedAt: "2026-11-26T20:05:00.000Z",
        createdByName: "Dewi Lestari",
      },
    ],
    refunds: [],
    timeline: [],
    permissions: {
      canEditLines: false,
      canEditHeader: false,
      canIssueEstimate: false,
      canApprove: false,
      canRevertEstimate: false,
      canStartWork: false,
      canComplete: false,
      canRecordPayment: false,
      canCorrectPayment: false,
      canVoid: false,
      canPrintReceipt: true,
      canPrintEstimate: false,
    },
    settings: {
      paperWidth: 58,
      taxRate: 11,
      cashierDiscountCapPercent: 0,
      voidReasonMinLength: 10,
    },
    receiptAvailable: true,
    printCount: 0,
  };
}

describe("sync apply envelope", () => {
  it("accepts a locally priced sale with integer rupiah money", () => {
    const parsed = syncApplyRequestSchema.parse(validRequest());
    expect(parsed.clientKey).toBe("offline-sale-2026-0001");
    expect(parsed.order.lines[0]?.unitPrice).toBe("200000");
  });

  it("rejects decimal money, a float quantity, and mixed discount shapes", () => {
    const decimalMoney = validRequest();
    decimalMoney.order.total = "222000.50";
    expect(syncApplyRequestSchema.safeParse(decimalMoney).success).toBe(false);

    const floatQuantity = validRequest();
    Object.assign(floatQuantity.order.lines[0] ?? {}, { quantity: 1.5 });
    expect(syncApplyRequestSchema.safeParse(floatQuantity).success).toBe(false);

    const mixedDiscount = validRequest();
    Object.assign(mixedDiscount.order.lines[0] ?? {}, {
      discountPercent: 10,
      discountAmount: "5000",
    });
    expect(syncApplyRequestSchema.safeParse(mixedDiscount).success).toBe(false);
  });

  it("rejects an unknown conflict code and an unknown resolve action", () => {
    expect(
      syncConflictDetailSchema.safeParse({
        code: "NETWORK_DOWN",
        blocking: true,
        message: "x",
      }).success,
    ).toBe(false);
    expect(
      syncResolveRequestSchema.safeParse({ action: "DELETE", reason: "x" })
        .success,
    ).toBe(false);
    expect(
      syncResolveRequestSchema.safeParse({ action: "OVERRIDE", reason: "Stok fisik" })
        .success,
    ).toBe(true);
  });

  it("publishes exactly the four sync conflict codes", () => {
    expect([...SYNC_CONFLICT_CODES]).toEqual([
      "STOCK_INSUFFICIENT",
      "PRICE_CHANGED",
      "PLATE_REASSIGNED",
      "CASH_REPORTING",
    ]);
    expect([...SYNC_STATES]).toEqual([
      "QUEUED",
      "APPLIED",
      "CONFLICT",
      "RESOLVED",
    ]);
  });
});

describe("sync result envelope", () => {
  it("round-trips an applied sale with informational notices", () => {
    const result = {
      clientKey: "offline-sale-2026-0001",
      state: "APPLIED",
      conflict: null,
      notices: [
        {
          code: "PRICE_CHANGED",
          blocking: false,
          message: "Harga berubah; transaksi memakai harga lokal.",
          productId: PRODUCT_ID,
          productName: "Kampas rem depan",
        },
      ],
      order: validDetail(),
      orderId: ORDER_ID,
      attemptCount: 1,
      deviceRecordedAt: "2026-11-26T20:05:00.000Z",
      appliedAt: "2026-11-27T01:00:00.000Z",
      resolvedAt: null,
      resolution: null,
    };
    const parsed = syncResultSchema.parse(result);
    expect(parsed.state).toBe("APPLIED");
    expect(parsed.notices[0]?.code).toBe("PRICE_CHANGED");
  });

  it("carries a blocking stock conflict without an order", () => {
    const parsed = syncResultSchema.parse({
      clientKey: "offline-sale-2026-0002",
      state: "CONFLICT",
      conflict: {
        code: "STOCK_INSUFFICIENT",
        blocking: true,
        message: "Stok tidak mencukupi.",
        productId: PRODUCT_ID,
        localQuantity: 3,
        serverQuantity: 1,
      },
      notices: [],
      order: null,
      orderId: null,
      attemptCount: 1,
      deviceRecordedAt: "2026-11-26T20:05:00.000Z",
      appliedAt: null,
      resolvedAt: null,
      resolution: null,
    });
    expect(parsed.conflict?.localQuantity).toBe(3);
    expect(parsed.order).toBeNull();
  });

  it("round-trips a resolved override result", () => {
    const parsed = syncResultSchema.parse({
      clientKey: "offline-sale-2026-0003",
      state: "RESOLVED",
      conflict: {
        code: "STOCK_INSUFFICIENT",
        blocking: true,
        message: "Stok tidak mencukupi.",
      },
      notices: [],
      order: validDetail(),
      orderId: ORDER_ID,
      attemptCount: 2,
      deviceRecordedAt: "2026-11-26T20:05:00.000Z",
      appliedAt: "2026-11-27T01:00:00.000Z",
      resolvedAt: "2026-11-27T01:05:00.000Z",
      resolution: "OVERRIDE",
    });
    expect(parsed.state).toBe("RESOLVED");
    expect(parsed.resolution).toBe("OVERRIDE");
  });

  it("accepts both catalog item kinds in the request contract", () => {
    const request = validRequest();
    request.order.lines.push({
      lineType: "SERVICE",
      catalogItemId: SERVICE_ID,
      description: "Ganti oli mesin",
      quantity: 1,
      unitPrice: "50000",
      taxAmount: "5500",
      lineTotal: "50000",
    });
    request.order.subtotal = "250000";
    request.order.taxTotal = "27500";
    request.order.total = "277500";
    Object.assign(request.order.payments[0] ?? {}, { amount: "277500" });
    expect(syncApplyRequestSchema.safeParse(request).success).toBe(true);
  });
});
