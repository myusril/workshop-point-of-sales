import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  createOrderSchema,
  orderDetailSchema,
  orderListQuerySchema,
  orderStatusSchema,
  paymentMethodSchema,
  receiptDocumentSchema,
  recordPaymentSchema,
  updateOrderLineSchema,
  updateOrderSchema,
  voidOrderSchema,
} from "../src/index.ts";

const ORDER_ID = "11111111-1111-4111-8111-111111111111";
const PRODUCT_ID = "22222222-2222-4222-8222-222222222222";
const SERVICE_ID = "33333333-3333-4333-8333-333333333333";

function validCreateOrder() {
  return {
    kind: "SALE",
    lines: [
      { lineType: "PRODUCT", catalogItemId: PRODUCT_ID, quantity: 1 },
      { lineType: "SERVICE", catalogItemId: SERVICE_ID, quantity: 1 },
    ],
    discountPercent: 10,
    idempotencyKey: randomUUID(),
  };
}

function validOrderDetail() {
  return {
    id: ORDER_ID,
    orderNumber: "INV/2026/000001",
    kind: "SALE",
    status: "PAID",
    outletId: "44444444-4444-4444-8444-444444444444",
    outletName: "Outlet Pusat",
    createdByName: "Dewi Lestari",
    customer: null,
    vehicle: null,
    technician: null,
    odometer: null,
    notes: null,
    taxRate: 11,
    subtotal: "300000",
    discountTotal: "30000",
    discountPercent: null,
    discountAmount: "30000",
    taxTotal: "29700",
    total: "299700",
    paidTotal: "299700",
    balanceDue: "0",
    changeTotal: "300",
    voidReason: null,
    voidedAt: null,
    completedAt: null,
    paidAt: "2026-11-27T07:05:00.000Z",
    createdAt: "2026-11-27T07:00:00.000Z",
    updatedAt: "2026-11-27T07:05:00.000Z",
    lines: [
      {
        id: "55555555-5555-4555-8555-555555555555",
        lineType: "PRODUCT",
        productId: PRODUCT_ID,
        serviceId: null,
        description: "Kampas rem depan",
        quantity: 1,
        unitPrice: "250000",
        discountPercent: null,
        discountAmount: "0",
        taxAmount: "24750",
        lineTotal: "250000",
        technicianId: null,
        technicianName: null,
      },
    ],
    payments: [
      {
        id: "66666666-6666-4666-8666-666666666666",
        method: "CASH",
        amount: "299700",
        changeAmount: "300",
        referenceNote: null,
        receivedAt: "2026-11-27T07:05:00.000Z",
        createdByName: "Dewi Lestari",
      },
    ],
    refunds: [],
    timeline: [
      {
        id: "77777777-7777-4777-8777-777777777777",
        fromStatus: null,
        toStatus: "DRAFT",
        actorName: "Dewi Lestari",
        reason: null,
        createdAt: "2026-11-27T07:00:00.000Z",
      },
    ],
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

describe("order contracts", () => {
  it("round-trips a mixed sale request and keeps money as digit strings", () => {
    const parsed = createOrderSchema.parse(validCreateOrder());
    expect(parsed.lines).toHaveLength(2);
    expect(parsed.discountPercent).toBe(10);
    const fixed = validCreateOrder();
    delete (fixed as { discountPercent?: number }).discountPercent;
    expect(createOrderSchema.parse({ ...fixed, discountAmount: "30000" }).discountAmount).toBe("30000");
  });

  it("blocks an empty order with the product copy", () => {
    const result = createOrderSchema.safeParse({ ...validCreateOrder(), lines: [] });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Tambahkan minimal satu item.");
  });

  it("rejects a non-positive quantity and a non-integer quantity", () => {
    const zero = createOrderSchema.safeParse({
      ...validCreateOrder(),
      lines: [{ lineType: "PRODUCT", catalogItemId: PRODUCT_ID, quantity: 0 }],
    });
    expect(zero.success).toBe(false);
    const fractional = createOrderSchema.safeParse({
      ...validCreateOrder(),
      lines: [{ lineType: "PRODUCT", catalogItemId: PRODUCT_ID, quantity: 1.5 }],
    });
    expect(fractional.success).toBe(false);
  });

  it("rejects two discount shapes at once", () => {
    const result = createOrderSchema.safeParse({
      ...validCreateOrder(),
      discountPercent: 10,
      discountAmount: "30000",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain(
      "Isi diskon persen atau nominal, bukan keduanya.",
    );
  });

  it("rejects float money and a short idempotency key", () => {
    expect(
      createOrderSchema.safeParse({ ...validCreateOrder(), discountAmount: "30000.50" })
        .success,
    ).toBe(false);
    expect(
      createOrderSchema.safeParse({ ...validCreateOrder(), idempotencyKey: "short" })
        .success,
    ).toBe(false);
  });

  it("validates the order detail and the full status enum", () => {
    expect(orderDetailSchema.parse(validOrderDetail()).total).toBe("299700");
    expect(orderStatusSchema.options).toEqual([
      "DRAFT",
      "ESTIMATED",
      "APPROVED",
      "IN_PROGRESS",
      "COMPLETED",
      "PAID",
      "VOID",
    ]);
  });

  it("requires at least one field on a header or line update", () => {
    expect(updateOrderSchema.safeParse({}).success).toBe(false);
    expect(updateOrderLineSchema.safeParse({}).success).toBe(false);
    expect(updateOrderLineSchema.parse({ quantity: 2 }).quantity).toBe(2);
  });

  it("validates the list query defaults and date order", () => {
    const query = orderListQuerySchema.parse({});
    expect(query.page).toBe(1);
    expect(query.pageSize).toBe(25);
    expect(
      orderListQuerySchema.safeParse({ from: "2026-11-27", to: "2026-11-26" }).success,
    ).toBe(false);
  });
});

describe("payment and void contracts", () => {
  it("accepts only cash, transfer, and QRIS", () => {
    expect(paymentMethodSchema.options).toEqual(["CASH", "TRANSFER", "QRIS"]);
    const result = recordPaymentSchema.safeParse({
      orderId: ORDER_ID,
      method: "CARD",
      amount: "100000",
      idempotencyKey: randomUUID(),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a zero tender and a malformed amount", () => {
    const base = {
      orderId: ORDER_ID,
      method: "CASH",
      idempotencyKey: randomUUID(),
    };
    expect(recordPaymentSchema.safeParse({ ...base, amount: "0" }).success).toBe(false);
    expect(recordPaymentSchema.safeParse({ ...base, amount: "1e5" }).success).toBe(false);
    expect(recordPaymentSchema.safeParse({ ...base, amount: "100000" }).success).toBe(true);
  });

  it("requires a void reason", () => {
    expect(voidOrderSchema.safeParse({ reason: "   " }).success).toBe(false);
    expect(voidOrderSchema.parse({ reason: "Salah input pelanggan" }).reason).toBe(
      "Salah input pelanggan",
    );
  });
});

describe("receipt contract", () => {
  it("round-trips a rendered receipt document", () => {
    const document = {
      orderId: ORDER_ID,
      orderNumber: "INV/2026/000001",
      documentKind: "RECEIPT",
      title: "STRUK",
      orderStatus: "PAID",
      paperWidth: 58,
      columns: 35,
      issuedAt: "2026-11-27T07:05:00.000Z",
      rows: ["BENGKEL CONTOH JAYA", "TOTAL              Rp 299.700"],
      reprintCount: 1,
      isReprint: true,
      isVoided: false,
      total: "299700",
      changeTotal: "300",
      outletName: "Outlet Pusat",
    };
    const parsed = receiptDocumentSchema.parse(document);
    expect(parsed.paperWidth).toBe(58);
    expect(parsed.isReprint).toBe(true);
    expect(receiptDocumentSchema.safeParse({ ...document, paperWidth: 72 }).success).toBe(
      false,
    );
  });
});
