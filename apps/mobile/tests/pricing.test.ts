import { syncApplyRequestSchema } from "@workshop-pos/contracts";

import {
  buildSalePayload,
  cartPricing,
  emptyCart,
  lineSubtotal,
  planPayments,
  SaleRuleError,
} from "@/src/domain/sale";
import { isDiscountAboveCap } from "@/src/pricing/order-pricing";
import { ac31Cart, line } from "./helpers/fixtures";

describe("offline pricing parity (AC3.1, AC3.7)", () => {
  it("reproduces the AC3.1 figures the server will validate", () => {
    const pricing = cartPricing(ac31Cart(), 11);
    expect(pricing.subtotal).toBe(300_000n);
    expect(pricing.orderDiscountTotal).toBe(30_000n);
    expect(pricing.taxTotal).toBe(29_700n);
    expect(pricing.total).toBe(299_700n);
    expect(pricing.lines.map((entry) => entry.taxAmount)).toEqual([24_750n, 4_950n]);
    expect(pricing.lines.map((entry) => entry.orderDiscountShare)).toEqual([25_000n, 5_000n]);
  });

  it("rounds per-line tax half-up and sums the rounded values", () => {
    const cart = { ...emptyCart(), lines: [line({ unitPrice: 12_345n })] };
    expect(cartPricing(cart, 11).taxTotal).toBe(1_358n);

    const twoLines = {
      ...emptyCart(),
      lines: [line({ lineKey: "a", unitPrice: 12_345n }), line({ lineKey: "b", unitPrice: 12_345n })],
    };
    expect(cartPricing(twoLines, 11).taxTotal).toBe(2_716n);
  });

  it("applies tax after both line and order discounts", () => {
    const cart = {
      ...emptyCart(),
      lines: [line({ unitPrice: 100_000n, quantity: 2, discountPercent: 10 })],
      discountAmount: 20_000n,
    };
    const pricing = cartPricing(cart, 11);
    expect(pricing.subtotal).toBe(200_000n);
    expect(pricing.lineDiscountTotal).toBe(20_000n);
    expect(pricing.taxableTotal).toBe(160_000n);
    expect(pricing.taxTotal).toBe(17_600n);
    expect(pricing.total).toBe(177_600n);
  });

  it("computes product and service subtotals separately", () => {
    const cart = ac31Cart();
    expect(lineSubtotal(cart, "PRODUCT")).toBe(250_000n);
    expect(lineSubtotal(cart, "SERVICE")).toBe(50_000n);
  });

  it("compares the discount against the outlet cap", () => {
    expect(isDiscountAboveCap(300_000n, 30_000n, 0)).toBe(true);
    expect(isDiscountAboveCap(300_000n, 30_000n, 10)).toBe(false);
    expect(isDiscountAboveCap(300_000n, 30_001n, 10)).toBe(true);
    expect(isDiscountAboveCap(300_000n, 0n, 0)).toBe(false);
  });

  it("builds a payload the shared sync contract accepts", () => {
    const cart = ac31Cart();
    const pricing = cartPricing(cart, 11);
    const plan = planPayments(pricing.total, [{ method: "CASH", tendered: 300_000n }]);
    const payload = buildSalePayload({
      clientKey: "sale-test-000001",
      outletId: "11111111-1111-4111-8111-111111111111",
      cart,
      pricing,
      taxRatePercent: 11,
      payments: plan.payments,
      deviceRecordedAt: "2026-11-27T02:00:00.000Z",
    });

    const parsed = syncApplyRequestSchema.parse(payload);
    expect(parsed.order.total).toBe("299700");
    expect(parsed.order.taxTotal).toBe("29700");
    expect(parsed.order.lines.map((entry) => entry.taxAmount)).toEqual(["24750", "4950"]);
    expect(parsed.order.payments).toEqual([
      { method: "CASH", amount: "299700", changeAmount: "300" },
    ]);
    expect(parsed.order.deviceRecordedAt).toBe("2026-11-27T02:00:00.000Z");
  });
});

describe("payment planning (FR-034, BR-009)", () => {
  it("turns cash overpayment into change, not a bigger payment row", () => {
    const plan = planPayments(299_700n, [{ method: "CASH", tendered: 300_000n }]);
    expect(plan.payments).toEqual([
      { method: "CASH", amount: 299_700n, changeAmount: 300n, referenceNote: null },
    ]);
    expect(plan.paidTotal).toBe(299_700n);
    expect(plan.changeTotal).toBe(300n);
  });

  it("supports split tenders and keeps each applied amount", () => {
    const plan = planPayments(299_700n, [
      { method: "TRANSFER", tendered: 200_000n, referenceNote: "BCA 1234" },
      { method: "CASH", tendered: 100_000n },
    ]);
    expect(plan.payments.map((payment) => payment.amount)).toEqual([200_000n, 99_700n]);
    expect(plan.changeTotal).toBe(300n);
  });

  it("rejects incomplete tenders", () => {
    expect(() => planPayments(100_000n, [{ method: "CASH", tendered: 50_000n }])).toThrow(
      SaleRuleError,
    );
  });

  it("rejects non-cash overpayment and missing references", () => {
    expect(() =>
      planPayments(100_000n, [{ method: "QRIS", tendered: 150_000n, referenceNote: "QR-1" }]),
    ).toThrow(SaleRuleError);
    expect(() => planPayments(100_000n, [{ method: "TRANSFER", tendered: 100_000n }])).toThrow(
      "Referensi wajib diisi",
    );
  });

  it("rejects a tender after the bill is settled", () => {
    expect(() =>
      planPayments(100_000n, [
        { method: "CASH", tendered: 100_000n },
        { method: "CASH", tendered: 10_000n },
      ]),
    ).toThrow(SaleRuleError);
  });
});
