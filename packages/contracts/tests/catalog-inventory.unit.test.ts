import { describe, expect, it } from "vitest";

import {
  adjustmentRequestSchema,
  catalogItemSchema,
  catalogListQuerySchema,
  catalogListResponseSchema,
  createProductSchema,
  createServiceSchema,
  inventoryProductSchema,
  ledgerEntrySchema,
  ledgerListQuerySchema,
  ledgerListResponseSchema,
  lowStockItemSchema,
  movementResponseSchema,
  productItemSchema,
  serviceItemSchema,
  stockInRequestSchema,
  updateProductSchema,
  updateServiceSchema,
} from "../src/index.ts";

const PRODUCT_ID = "c0000000-0000-4000-8000-000000000001";
const OUTLET_ID = "b0000000-0000-4000-8000-000000000002";
const LEDGER_ID = "e0000000-0000-4000-8000-000000000001";

describe("catalog money transport", () => {
  it("accepts canonical digit strings only and never floats", () => {
    const valid = createProductSchema.parse({
      sku: "brk-001",
      name: "Kampas Rem Depan",
      cost: "150000",
      price: "250000",
    });
    expect(valid.cost).toBe("150000");
    expect(valid.price).toBe("250000");
    // Defaults come from the contract, not the caller.
    expect(valid.unit).toBe("pcs");
    expect(valid.openingStock).toBe(0);

    for (const money of ["1.5", "01", "-1", "1e3", "Rp 250.000", ""]) {
      const result = createProductSchema.safeParse({
        sku: "BRK-001",
        name: "Kampas Rem Depan",
        cost: money,
        price: "250000",
      });
      expect(result.success, `money ${JSON.stringify(money)} must be rejected`).toBe(false);
    }
  });

  it("round-trips a product item through JSON unchanged", () => {
    const item = productItemSchema.parse({
      itemType: "PRODUCT",
      id: PRODUCT_ID,
      outletId: OUTLET_ID,
      outletName: "Outlet Pusat",
      sku: "BRK-001",
      name: "Kampas Rem Depan",
      unit: "set",
      price: "250000",
      lowStockThreshold: 5,
      stockOnHand: 20,
      isLowStock: false,
      isActive: true,
      updatedAt: "2026-01-02T03:04:05.000Z",
    });

    expect(item.cost).toBeUndefined();
    expect(productItemSchema.parse(JSON.parse(JSON.stringify(item)))).toEqual(item);
  });

  it("keeps cost optional so a Cashier payload can omit it", () => {
    const withCost = productItemSchema.parse({
      itemType: "PRODUCT",
      id: PRODUCT_ID,
      outletId: OUTLET_ID,
      outletName: "Outlet Pusat",
      sku: "BRK-001",
      name: "Kampas Rem Depan",
      unit: "set",
      price: "250000",
      cost: "150000",
      lowStockThreshold: null,
      stockOnHand: 0,
      isLowStock: false,
      isActive: true,
      updatedAt: "2026-01-02T03:04:05.000Z",
    });
    expect(withCost.cost).toBe("150000");

    const withoutCost = { ...withCost } as Record<string, unknown>;
    delete withoutCost.cost;
    expect(productItemSchema.safeParse(withoutCost).success).toBe(true);
  });
});

describe("catalog request contracts", () => {
  it("uppercases SKU and service codes and trims names", () => {
    const product = createProductSchema.parse({
      sku: " brk-001 ",
      name: "  Kampas Rem Depan  ",
      cost: "150000",
      price: "250000",
    });
    expect(product.sku).toBe("BRK-001");
    expect(product.name).toBe("Kampas Rem Depan");

    const service = createServiceSchema.parse({
      code: " srv-01 ",
      name: "Servis Rem",
      price: "50000",
      durationMinutes: 30,
    });
    expect(service.code).toBe("SRV-01");
  });

  it("rejects an update without any change and invalid service duration", () => {
    expect(updateProductSchema.safeParse({}).success).toBe(false);
    expect(updateServiceSchema.safeParse({}).success).toBe(false);
    expect(
      updateProductSchema.safeParse({ lowStockThreshold: null }).success,
    ).toBe(true);

    const tooShort = createServiceSchema.safeParse({
      code: "SRV-01",
      name: "Servis Rem",
      price: "50000",
      durationMinutes: 0,
    });
    expect(tooShort.success).toBe(false);
  });

  it("defaults catalog list paging and rejects unsupported page sizes", () => {
    const defaults = catalogListQuerySchema.parse({});
    expect(defaults).toEqual({
      type: "all",
      status: "all",
      page: 1,
      pageSize: 25,
      sort: "name",
      dir: "asc",
    });

    expect(catalogListQuerySchema.safeParse({ pageSize: "50" }).success).toBe(true);
    expect(catalogListQuerySchema.safeParse({ pageSize: "30" }).success).toBe(false);
    expect(catalogListQuerySchema.safeParse({ page: "0" }).success).toBe(false);
    expect(catalogListQuerySchema.safeParse({ sort: "cost" }).success).toBe(false);
  });
});

describe("inventory request contracts", () => {
  it("requires a reason for adjustments and rejects a zero delta", () => {
    expect(
      adjustmentRequestSchema.safeParse({
        productId: PRODUCT_ID,
        quantityDelta: -5,
      }).success,
    ).toBe(false);

    expect(
      adjustmentRequestSchema.safeParse({
        productId: PRODUCT_ID,
        quantityDelta: -5,
        reason: "ab",
      }).success,
    ).toBe(false);

    expect(
      adjustmentRequestSchema.safeParse({
        productId: PRODUCT_ID,
        quantityDelta: 0,
        reason: "Koreksi opname",
      }).success,
    ).toBe(false);

    const parsed = adjustmentRequestSchema.parse({
      productId: PRODUCT_ID,
      quantityDelta: -5,
      reason: "Koreksi opname",
    });
    expect(parsed.override).toBe(false);

    expect(
      adjustmentRequestSchema.safeParse({
        productId: PRODUCT_ID,
        quantityDelta: -5,
        reason: "Koreksi opname",
        override: true,
      }).success,
    ).toBe(true);
  });

  it("requires a positive stock-in quantity", () => {
    expect(
      stockInRequestSchema.safeParse({ productId: PRODUCT_ID, quantity: 0 }).success,
    ).toBe(false);
    expect(
      stockInRequestSchema.safeParse({ productId: PRODUCT_ID, quantity: 1.5 }).success,
    ).toBe(false);
    expect(
      stockInRequestSchema.parse({
        productId: PRODUCT_ID,
        quantity: 3,
        note: "Restok",
        reference: "PO-1",
      }).quantity,
    ).toBe(3);
  });

  it("defaults ledger paging and validates the date range inputs", () => {
    const defaults = ledgerListQuerySchema.parse({});
    expect(defaults.page).toBe(1);
    expect(defaults.pageSize).toBe(25);
    expect(defaults.from).toBeUndefined();

    expect(ledgerListQuerySchema.safeParse({ pageSize: "100" }).success).toBe(true);
    expect(ledgerListQuerySchema.safeParse({ pageSize: "30" }).success).toBe(false);
    expect(ledgerListQuerySchema.safeParse({ from: "2026-01-01" }).success).toBe(true);
    expect(ledgerListQuerySchema.safeParse({ from: "01/01/2026" }).success).toBe(false);
    expect(ledgerListQuerySchema.safeParse({ entryType: "PAYMENT" }).success).toBe(false);
  });
});

describe("inventory response contracts", () => {
  it("round-trips a movement response and a ledger page", () => {
    const entry = ledgerEntrySchema.parse({
      id: LEDGER_ID,
      productId: PRODUCT_ID,
      productSku: "BRK-001",
      productName: "Kampas Rem Depan",
      entryType: "SALE_DECREMENT",
      quantityBefore: 1,
      quantityAfter: 0,
      quantityDelta: -1,
      override: false,
      reason: null,
      sourceType: "ORDER",
      sourceRef: null,
      actorId: "wp4_cashier",
      actorName: "Dewi Uji",
      createdAt: "2026-01-02T03:04:05.000Z",
    });

    const product = inventoryProductSchema.parse({
      id: PRODUCT_ID,
      outletId: OUTLET_ID,
      outletName: "Outlet Pusat",
      sku: "BRK-001",
      name: "Kampas Rem Depan",
      unit: "set",
      stockOnHand: 0,
      lowStockThreshold: 5,
      isLowStock: true,
      isActive: true,
    });

    const movement = movementResponseSchema.parse({
      entry,
      product,
      stockOnHand: 0,
    });
    expect(movementResponseSchema.parse(JSON.parse(JSON.stringify(movement)))).toEqual(
      movement,
    );

    const page = ledgerListResponseSchema.parse({
      items: [entry],
      page: 1,
      pageSize: 25,
      total: 1,
      totalPages: 1,
    });
    expect(ledgerListResponseSchema.parse(JSON.parse(JSON.stringify(page)))).toEqual(page);
  });

  it("validates low-stock shortfall and the merged catalog response", () => {
    const lowStock = lowStockItemSchema.parse({
      productId: PRODUCT_ID,
      sku: "BRK-001",
      name: "Kampas Rem Depan",
      unit: "set",
      stockOnHand: 2,
      lowStockThreshold: 5,
      shortfall: 3,
    });
    expect(lowStock.shortfall).toBe(3);
    expect(
      lowStockItemSchema.safeParse({ ...lowStock, shortfall: -1 }).success,
    ).toBe(false);

    const service = serviceItemSchema.parse({
      itemType: "SERVICE",
      id: PRODUCT_ID,
      outletId: OUTLET_ID,
      outletName: "Outlet Pusat",
      code: "SRV-001",
      name: "Servis Rem",
      price: "50000",
      durationMinutes: 30,
      isActive: true,
      updatedAt: "2026-01-02T03:04:05.000Z",
    });

    const page = catalogListResponseSchema.parse({
      items: [service],
      page: 1,
      pageSize: 25,
      total: 1,
      totalPages: 1,
    });
    expect(catalogItemSchema.parse(page.items[0])).toEqual(service);
    expect(catalogListResponseSchema.safeParse({ ...page, totalPages: -1 }).success).toBe(
      false,
    );
  });
});
