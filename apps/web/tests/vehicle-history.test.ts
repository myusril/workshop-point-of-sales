import { describe, expect, it } from "vitest";

import type { HistoryOrderSource } from "../lib/vehicle-history";
import {
  balanceDueOf,
  paymentStatusOf,
  toHistoryOrder,
} from "../lib/vehicle-history";

const OUTLET_ID = "b0000000-0000-4000-8000-000000000002";
const ORDER_ID = "f0000000-0000-4000-8000-000000000001";

function orderSource(
  overrides: Partial<HistoryOrderSource> = {},
): HistoryOrderSource {
  return {
    id: ORDER_ID,
    orderNumber: "INV-0001",
    kind: "SERVICE",
    status: "IN_PROGRESS",
    createdAt: new Date("2026-01-02T03:04:05.000Z"),
    completedAt: null,
    paidAt: null,
    outletId: OUTLET_ID,
    outletName: "Outlet Pusat",
    odometer: 12_450,
    total: 300_000n,
    paidTotal: 100_000n,
    lines: [
      {
        lineType: "PRODUCT",
        description: "Kampas rem depan",
        quantity: 2,
        lineTotal: 200_000n,
      },
      {
        lineType: "SERVICE",
        description: "Ganti oli mesin",
        quantity: 1,
        lineTotal: 100_000n,
      },
    ],
    ...overrides,
  };
}

describe("paymentStatusOf", () => {
  it("treats a voided order as terminal regardless of recorded money", () => {
    expect(paymentStatusOf("VOID", 300_000n, 300_000n)).toBe("VOID");
    expect(paymentStatusOf("VOID", 300_000n, 0n)).toBe("VOID");
  });

  it("marks a fully settled order paid and an overpayment paid", () => {
    expect(paymentStatusOf("COMPLETED", 300_000n, 300_000n)).toBe("PAID");
    expect(paymentStatusOf("COMPLETED", 300_000n, 350_000n)).toBe("PAID");
    expect(paymentStatusOf("PAID", 300_000n, 300_000n)).toBe("PAID");
  });

  it("distinguishes partial payment from no payment", () => {
    expect(paymentStatusOf("IN_PROGRESS", 300_000n, 1n)).toBe("PARTIAL");
    expect(paymentStatusOf("COMPLETED", 300_000n, 299_999n)).toBe("PARTIAL");
    expect(paymentStatusOf("APPROVED", 300_000n, 0n)).toBe("UNPAID");
    expect(paymentStatusOf("COMPLETED", 0n, 0n)).toBe("UNPAID");
  });
});

describe("balanceDueOf", () => {
  it("returns the shortfall and never a negative debt", () => {
    expect(balanceDueOf(300_000n, 100_000n)).toBe(200_000n);
    expect(balanceDueOf(300_000n, 300_000n)).toBe(0n);
    expect(balanceDueOf(300_000n, 400_000n)).toBe(0n);
    expect(balanceDueOf(0n, 0n)).toBe(0n);
  });
});

describe("toHistoryOrder", () => {
  it("serializes money as decimal strings and keeps the line order", () => {
    const mapped = toHistoryOrder(orderSource());

    expect(mapped).toEqual({
      id: ORDER_ID,
      orderNumber: "INV-0001",
      kind: "SERVICE",
      status: "IN_PROGRESS",
      createdAt: "2026-01-02T03:04:05.000Z",
      completedAt: null,
      paidAt: null,
      outletId: OUTLET_ID,
      outletName: "Outlet Pusat",
      odometer: 12_450,
      total: "300000",
      paidTotal: "100000",
      balanceDue: "200000",
      paymentStatus: "PARTIAL",
      lines: [
        {
          lineType: "PRODUCT",
          description: "Kampas rem depan",
          quantity: 2,
          lineTotal: "200000",
        },
        {
          lineType: "SERVICE",
          description: "Ganti oli mesin",
          quantity: 1,
          lineTotal: "100000",
        },
      ],
    });
  });

  it("keeps the full remaining balance on draft and estimated orders", () => {
    const draft = toHistoryOrder(
      orderSource({ status: "DRAFT", total: 120_000n, paidTotal: 0n }),
    );
    expect(draft.paymentStatus).toBe("UNPAID");
    expect(draft.balanceDue).toBe("120000");

    const estimated = toHistoryOrder(
      orderSource({ status: "ESTIMATED", total: 120_000n, paidTotal: 20_000n }),
    );
    expect(estimated.paymentStatus).toBe("PARTIAL");
    expect(estimated.balanceDue).toBe("100000");
  });

  it("zeroes the balance and reports VOID for a voided order", () => {
    const mapped = toHistoryOrder(
      orderSource({
        status: "VOID",
        total: 500_000n,
        paidTotal: 100_000n,
        lines: [],
      }),
    );

    expect(mapped.paymentStatus).toBe("VOID");
    expect(mapped.balanceDue).toBe("0");
    expect(mapped.total).toBe("500000");
    expect(mapped.paidTotal).toBe("100000");
    expect(mapped.lines).toEqual([]);
  });

  it("serializes completion and payment timestamps when present", () => {
    const mapped = toHistoryOrder(
      orderSource({
        status: "PAID",
        paidTotal: 300_000n,
        completedAt: new Date("2026-01-02T04:00:00.000Z"),
        paidAt: new Date("2026-01-02T04:05:00.000Z"),
      }),
    );

    expect(mapped.completedAt).toBe("2026-01-02T04:00:00.000Z");
    expect(mapped.paidAt).toBe("2026-01-02T04:05:00.000Z");
    expect(mapped.paymentStatus).toBe("PAID");
    expect(mapped.balanceDue).toBe("0");
  });
});
