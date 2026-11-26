import { describe, expect, it } from "vitest";

import {
  DEFAULT_TAX_RATE_PERCENT,
  MoneyError,
  addIdr,
  discountFromSubtotal,
  formatIdr,
  idrToString,
  isIdrString,
  isValidTaxRate,
  multiplyIdrByQuantity,
  orderTax,
  parseIdr,
  parseIdrInput,
  roundHalfUp,
  taxFromSubtotal,
} from "../src/money.ts";

describe("integer IDR money", () => {
  it("computes the PRD AC3.1 figures without a float path", () => {
    const subtotal = 300_000n;
    const discount = discountFromSubtotal(subtotal, 10);
    const net = subtotal - discount;
    const tax = taxFromSubtotal(net, DEFAULT_TAX_RATE_PERCENT);

    expect(discount).toBe(30_000n);
    expect(net).toBe(270_000n);
    expect(tax).toBe(29_700n);
    expect(orderTax([tax])).toBe(29_700n);
    expect(net + tax).toBe(299_700n);
  });

  it("rounds half-up at the rupiah boundary (BR-004)", () => {
    expect(taxFromSubtotal(12_345n, 11)).toBe(1_358n); // 1357.95
    expect(taxFromSubtotal(270_000n, 11)).toBe(29_700n);
    expect(taxFromSubtotal(1n, 50)).toBe(1n); // 0.5 rounds up
    expect(taxFromSubtotal(0n, 11)).toBe(0n);
    expect(taxFromSubtotal(100_000n, 0)).toBe(0n);
    expect(roundHalfUp(5n, 10n)).toBe(1n);
    expect(roundHalfUp(4n, 10n)).toBe(0n);
    expect(roundHalfUp(-5n, 10n)).toBe(-1n);
  });

  it("accepts whole-percent rates only", () => {
    expect(isValidTaxRate(0)).toBe(true);
    expect(isValidTaxRate(11)).toBe(true);
    expect(isValidTaxRate(100)).toBe(true);
    expect(isValidTaxRate(11.5)).toBe(false);
    expect(isValidTaxRate(-1)).toBe(false);
    expect(isValidTaxRate(101)).toBe(false);
    expect(() => taxFromSubtotal(1000n, 11.5)).toThrow(MoneyError);
  });

  it("rejects floats, negatives, and malformed transport values", () => {
    expect(isIdrString("250000")).toBe(true);
    expect(isIdrString("0250000")).toBe(false);
    expect(isIdrString("250000.00")).toBe(false);
    expect(isIdrString("-1")).toBe(false);
    expect(() => parseIdr("1.5")).toThrow(MoneyError);
    expect(() => idrToString(-1n)).toThrow(MoneyError);
    expect(() => multiplyIdrByQuantity(1000n, 0)).toThrow(MoneyError);
    expect(() => multiplyIdrByQuantity(1000n, 1.5)).toThrow(MoneyError);
    expect(multiplyIdrByQuantity(250_000n, 3)).toBe(750_000n);
  });

  it("parses grouped human input and refuses decimal commas", () => {
    expect(parseIdrInput("Rp 250.000")).toBe(250_000n);
    expect(parseIdrInput("1.234.567")).toBe(1_234_567n);
    expect(parseIdrInput("0")).toBe(0n);
    expect(() => parseIdrInput("250.000,00")).toThrow(MoneyError);
    expect(() => parseIdrInput("")).toThrow(MoneyError);
  });

  it("formats rupiah with a no-break space and U+2212 negatives", () => {
    expect(formatIdr(1_234_567n)).toBe("Rp\u00a01.234.567");
    expect(formatIdr(0n)).toBe("Rp\u00a00");
    expect(formatIdr(-25_000n)).toBe("\u2212Rp\u00a025.000");
    expect(formatIdr(250_000n, { sign: "always" })).toBe("+Rp\u00a0250.000");
  });

  it("sums integer amounts exactly", () => {
    expect(addIdr(1n, 2n, 3n)).toBe(6n);
    expect(orderTax([29_700n, 13_575n])).toBe(43_275n);
  });
});
