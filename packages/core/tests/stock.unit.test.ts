import { describe, expect, it } from "vitest";

import {
  StockRuleError,
  isApplicableWithoutOverride,
  isLowStock,
  lowStockShortfall,
  planStockMovement,
  recomputeStock,
} from "../src/stock.ts";

describe("stock ledger planning", () => {
  it("records stock-in and adjustment before/after pairs (AC12.1–AC12.2)", () => {
    expect(
      planStockMovement({ before: 5, delta: 50, entryType: "STOCK_IN", reason: "Pembelian" }),
    ).toEqual({
      before: 5,
      delta: 50,
      after: 55,
      entryType: "STOCK_IN",
      override: false,
      reason: "Pembelian",
    });

    expect(
      planStockMovement({ before: 55, delta: -2, entryType: "ADJUSTMENT", reason: "Rusak" }),
    ).toMatchObject({ before: 55, after: 53, override: false, reason: "Rusak" });
  });

  it("requires a reason for adjustments and for negative overrides", () => {
    expect(() =>
      planStockMovement({ before: 10, delta: -1, entryType: "ADJUSTMENT", reason: "  " }),
    ).toThrow(StockRuleError);
    expect(() =>
      planStockMovement({
        before: 1,
        delta: -2,
        entryType: "SALE_DECREMENT",
        override: true,
        reason: null,
      }),
    ).toThrow(StockRuleError);
  });

  it("blocks a negative result without override and flags it with one (AC11.2–AC11.3)", () => {
    expect(() =>
      planStockMovement({ before: 1, delta: -2, entryType: "SALE_DECREMENT" }),
    ).toThrow(/Stok tidak mencukupi/);

    const overridden = planStockMovement({
      before: 1,
      delta: -2,
      entryType: "SALE_DECREMENT",
      override: true,
      reason: "Stok fisik belum diinput",
    });
    expect(overridden.after).toBe(-1);
    expect(overridden.override).toBe(true);
    expect(overridden.reason).toBe("Stok fisik belum diinput");
  });

  it("rejects an override whose result is not negative", () => {
    expect(() =>
      planStockMovement({
        before: 10,
        delta: -1,
        entryType: "ADJUSTMENT",
        override: true,
        reason: "Coba",
      }),
    ).toThrow(/Override hanya berlaku/);
  });

  it("enforces direction per entry type and refuses a zero delta", () => {
    expect(() => planStockMovement({ before: 1, delta: 0, entryType: "ADJUSTMENT", reason: "x y" })).toThrow(
      /tidak boleh nol/,
    );
    expect(() => planStockMovement({ before: 1, delta: 1, entryType: "SALE_DECREMENT" })).toThrow(
      /harus mengurangi/,
    );
    expect(() => planStockMovement({ before: 1, delta: -1, entryType: "STOCK_IN" })).toThrow(
      /harus menambah/,
    );
    expect(() => planStockMovement({ before: 1, delta: -1, entryType: "SALE_REVERSAL" })).toThrow(
      /harus menambah/,
    );
    expect(() => planStockMovement({ before: 1, delta: 1.5, entryType: "STOCK_IN" })).toThrow(
      /bilangan bulat/,
    );
  });

  it("reports applicable-without-override only for non-negative results", () => {
    expect(isApplicableWithoutOverride(1, -1)).toBe(true);
    expect(isApplicableWithoutOverride(1, -2)).toBe(false);
    expect(isApplicableWithoutOverride(-1, 2)).toBe(true);
  });

  it("marks low stock at or below the threshold and computes the shortfall", () => {
    expect(isLowStock(3, 5)).toBe(true);
    expect(isLowStock(5, 5)).toBe(true);
    expect(isLowStock(6, 5)).toBe(false);
    expect(isLowStock(0, null)).toBe(false);
    expect(lowStockShortfall(3, 5)).toBe(2);
    expect(lowStockShortfall(6, 5)).toBe(0);
    expect(lowStockShortfall(-1, 5)).toBe(6);
  });

  it("keeps initial + Σ ledger deltas equal to stock-on-hand for random sequences", () => {
    // Deterministic LCG so a failure is reproducible without a seed library.
    let seed = 42;
    const next = (): number => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    for (let run = 0; run < 200; run += 1) {
      let stock = Math.floor(next() * 20);
      const initial = stock;
      const rows: { quantityBefore: number; quantityAfter: number }[] = [];

      for (let step = 0; step < 20; step += 1) {
        const delta = Math.floor(next() * 11) - 5;
        if (delta === 0) continue;
        const after = stock + delta;
        const needsOverride = after < 0;
        const plan = planStockMovement({
          before: stock,
          delta,
          entryType: delta > 0 ? "STOCK_IN" : "ADJUSTMENT",
          reason: "Uji acak",
          override: needsOverride,
        });
        rows.push({ quantityBefore: plan.before, quantityAfter: plan.after });
        stock = plan.after;
      }

      expect(recomputeStock(initial, rows)).toBe(stock);
    }
  });
});
