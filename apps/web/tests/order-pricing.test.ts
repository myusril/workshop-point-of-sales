import { describe, expect, it } from "vitest";

import {
  allocateDiscount,
  isDiscountAboveCap,
  priceOrder,
  PricingError,
} from "../lib/order-pricing";

/** AC3.1 worked example: 250000 + 50000, 10% order discount, 11% PPN. */
describe("order pricing (AC3.1, BR-002–BR-004)", () => {
  it("reproduces the AC3.1 figures exactly", () => {
    const pricing = priceOrder({
      lines: [
        { quantity: 1, unitPrice: 250_000n },
        { quantity: 1, unitPrice: 50_000n },
      ],
      taxRatePercent: 11,
      orderDiscountPercent: 10,
    });

    expect(pricing.subtotal).toBe(300_000n);
    expect(pricing.orderDiscountTotal).toBe(30_000n);
    expect(pricing.discountTotal).toBe(30_000n);
    expect(pricing.taxTotal).toBe(29_700n);
    expect(pricing.total).toBe(299_700n);
    expect(pricing.lines.map((line) => line.taxAmount)).toEqual([24_750n, 4_950n]);
    expect(pricing.lines.map((line) => line.orderDiscountShare)).toEqual([
      25_000n, 5_000n,
    ]);
  });

  it("rounds per-line tax half-up once and sums the rounded values", () => {
    const single = priceOrder({
      lines: [{ quantity: 1, unitPrice: 12_345n }],
      taxRatePercent: 11,
    });
    expect(single.taxTotal).toBe(1_358n);
    expect(single.total).toBe(13_703n);

    const twoLines = priceOrder({
      lines: [
        { quantity: 1, unitPrice: 12_345n },
        { quantity: 1, unitPrice: 12_345n },
      ],
      taxRatePercent: 11,
    });
    expect(twoLines.taxTotal).toBe(2_716n);
  });

  it("applies tax after both line and order discounts", () => {
    const pricing = priceOrder({
      lines: [{ quantity: 2, unitPrice: 100_000n, discountPercent: 10 }],
      taxRatePercent: 11,
      orderDiscountAmount: 20_000n,
    });
    expect(pricing.subtotal).toBe(200_000n);
    expect(pricing.lineDiscountTotal).toBe(20_000n);
    expect(pricing.taxableTotal).toBe(160_000n);
    expect(pricing.taxTotal).toBe(17_600n);
    expect(pricing.total).toBe(177_600n);
    expect(pricing.lines[0]?.lineTotal).toBe(180_000n);
  });

  it("supports a zero tax rate", () => {
    const pricing = priceOrder({
      lines: [{ quantity: 3, unitPrice: 10_000n }],
      taxRatePercent: 0,
    });
    expect(pricing.taxTotal).toBe(0n);
    expect(pricing.total).toBe(30_000n);
  });

  it("accepts a percent line discount stored with a zero amount", () => {
    const pricing = priceOrder({
      lines: [
        {
          quantity: 1,
          unitPrice: 100_000n,
          discountPercent: 10,
          discountAmount: 0n,
        },
      ],
      taxRatePercent: 11,
    });
    expect(pricing.lineDiscountTotal).toBe(10_000n);
    expect(pricing.taxTotal).toBe(9_900n);
    expect(pricing.total).toBe(99_900n);
  });

  it("rejects two non-zero discount shapes", () => {
    expect(() =>
      priceOrder({
        lines: [
          {
            quantity: 1,
            unitPrice: 100_000n,
            discountPercent: 10,
            discountAmount: 5_000n,
          },
        ],
        taxRatePercent: 11,
      }),
    ).toThrow(/bukan keduanya/);
  });

  it("allocates an order discount without losing or creating a rupiah", () => {
    const shares = allocateDiscount(12_345n, [50_000n, 30_000n, 20_000n]);
    expect(shares.reduce((sum, share) => sum + share, 0n)).toBe(12_345n);
    expect(shares.every((share, index) => share <= [50_000n, 30_000n, 20_000n][index]!)).toBe(true);

    // Deterministic tie-break by position keeps the stored figures repeatable.
    expect(allocateDiscount(2n, [1n, 1n, 1n])).toEqual([1n, 1n, 0n]);
    expect(allocateDiscount(0n, [1n, 2n])).toEqual([0n, 0n]);
  });

  it("keeps the allocated shares consistent with per-line tax", () => {
    const pricing = priceOrder({
      lines: [
        { quantity: 1, unitPrice: 33_333n },
        { quantity: 1, unitPrice: 33_333n },
        { quantity: 1, unitPrice: 33_334n },
      ],
      taxRatePercent: 11,
      orderDiscountAmount: 10_001n,
    });
    const shareTotal = pricing.lines.reduce(
      (sum, line) => sum + line.orderDiscountShare,
      0n,
    );
    expect(shareTotal).toBe(10_001n);
    for (const line of pricing.lines) {
      expect(line.taxableBase).toBeGreaterThanOrEqual(0n);
      expect(line.taxAmount).toBe(
        (line.taxableBase * 11n + 50n) / 100n,
      );
    }
  });

  it("rejects invalid quantities, discounts, and a zero-priced order", () => {
    const bad = (input: Parameters<typeof priceOrder>[0]) => () => priceOrder(input);

    expect(bad({ lines: [], taxRatePercent: 11 })).toThrow(PricingError);
    expect(bad({ lines: [], taxRatePercent: 11 })).toThrow(/minimal satu item/);
    expect(
      bad({ lines: [{ quantity: 0, unitPrice: 1_000n }], taxRatePercent: 11 }),
    ).toThrow(/bilangan bulat positif/);
    expect(
      bad({ lines: [{ quantity: -1, unitPrice: 1_000n }], taxRatePercent: 11 }),
    ).toThrow(/bilangan bulat positif/);
    expect(
      bad({
        lines: [{ quantity: 1, unitPrice: 1_000n, discountPercent: 101 }],
        taxRatePercent: 11,
      }),
    ).toThrow(/0 sampai 100/);
    expect(
      bad({
        lines: [
          { quantity: 1, unitPrice: 1_000n, discountPercent: 5, discountAmount: 50n },
        ],
        taxRatePercent: 11,
      }),
    ).toThrow(/bukan keduanya/);
    expect(
      bad({
        lines: [{ quantity: 1, unitPrice: 1_000n, discountAmount: 1_001n }],
        taxRatePercent: 11,
      }),
    ).toThrow(/melebihi nilai baris/);
    expect(
      bad({
        lines: [{ quantity: 1, unitPrice: 1_000n }],
        taxRatePercent: 11,
        orderDiscountAmount: 1_000n,
      }),
    ).toThrow(/seluruh nilai transaksi/);
  });

  it("flags discounts above the role cap, including a zero cap", () => {
    expect(isDiscountAboveCap(300_000n, 30_000n, 0)).toBe(true);
    expect(isDiscountAboveCap(300_000n, 30_000n, 10)).toBe(false);
    expect(isDiscountAboveCap(300_000n, 30_000n, 9)).toBe(true);
    expect(isDiscountAboveCap(300_000n, 0n, 0)).toBe(false);
    expect(isDiscountAboveCap(0n, 0n, 0)).toBe(false);
  });
});
