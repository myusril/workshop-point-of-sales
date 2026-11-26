import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  normalizeScope,
  outletScoped,
  ScopeViolationError,
} from "../src/query/scope.ts";
import { products } from "../src/schema/index.ts";

const dialect = new PgDialect();

describe("outlet scope", () => {
  it("rejects a blank business id", () => {
    expect(() =>
      normalizeScope({ businessId: "   ", outletIds: ["11111111-1111-4111-8111-111111111111"] }),
    ).toThrow(ScopeViolationError);
  });

  it("rejects an empty outlet list", () => {
    expect(() =>
      normalizeScope({ businessId: "b1", outletIds: [] }),
    ).toThrow(ScopeViolationError);
  });

  it("rejects outlet ids that are only whitespace", () => {
    expect(() =>
      normalizeScope({ businessId: "b1", outletIds: ["", "   "] }),
    ).toThrow(ScopeViolationError);
  });

  it("collapses duplicate outlet ids and trims them", () => {
    const normalized = normalizeScope({
      businessId: "b1",
      outletIds: ["o1", "o1", " o2 ", "o2", "o1"],
    });

    expect(normalized).toEqual({ businessId: "b1", outletIds: ["o1", "o2"] });
  });

  it("refuses to build a predicate for an empty scope", () => {
    expect(() =>
      outletScoped(products, { businessId: "b1", outletIds: [] }),
    ).toThrow(ScopeViolationError);
  });

  it("builds a business + outlet predicate with bound parameters", () => {
    const predicate = outletScoped(products, {
      businessId: "b1",
      outletIds: ["o1", "o2"],
    });

    expect(dialect.sqlToQuery(predicate)).toMatchObject({
      sql: '("products"."business_id" = $1 and "products"."outlet_id" in ($2, $3))',
      params: ["b1", "o1", "o2"],
    });
  });

  it("binds the normalized (trimmed, de-duplicated) outlet ids", () => {
    const predicate = outletScoped(products, {
      businessId: " b1 ",
      outletIds: [" o1 ", "o1", "o2"],
    });

    expect(dialect.sqlToQuery(predicate).params).toEqual(["b1", "o1", "o2"]);
  });
});
