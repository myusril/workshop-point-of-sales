import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appendAuditEntry } from "../src/query/audit.ts";
import { listProducts, listServices } from "../src/query/catalog.ts";
import { appendOrderStatusEvent, listOrders } from "../src/query/orders.ts";
import { getSettings } from "../src/query/settings.ts";
import {
  appendStockLedgerEntry,
  listStockLedger,
  stockOnHand,
} from "../src/query/stock.ts";
import { ScopeViolationError, type OutletScope } from "../src/query/scope.ts";
import {
  SEED_BUSINESS_ID,
  SEED_OUTLET_ID,
  SEED_PRODUCT_ID,
  SEED_SERVICE_ID,
} from "../src/seed/fixtures.ts";
import { seedDatabase } from "../src/seed/seed.ts";
import {
  businesses,
  orderLines,
  orders,
  outlets,
  products,
  user,
} from "../src/schema/index.ts";
import {
  closeTestDatabase,
  prepareTestDatabase,
  type TestDatabase,
  type TestDatabaseHandle,
} from "./helpers.ts";

const SECOND_OUTLET_ID = "f0000000-0000-4000-8000-000000000001";
const SECOND_PRODUCT_ID = "f0000000-0000-4000-8000-000000000002";
const FOREIGN_BUSINESS_ID = "f0000000-0000-4000-8000-00000000000a";
const FOREIGN_OUTLET_ID = "f0000000-0000-4000-8000-00000000000b";
const FOREIGN_USER_ID = "foreign_owner";
const CREATED_BY = "seed_owner_rina";

let handle: TestDatabaseHandle;
let db: TestDatabase;
let scopeA: OutletScope;
let scopeB: OutletScope;
let orderA: typeof orders.$inferSelect;
let orderB: typeof orders.$inferSelect;
let orderLineB: typeof orderLines.$inferSelect;

async function createOrder(outletId: string, orderNumber: string) {
  const [row] = await db
    .insert(orders)
    .values({
      businessId: SEED_BUSINESS_ID,
      outletId,
      kind: "SALE",
      orderNumber,
      taxRate: 11,
      subtotal: 0n,
      discountTotal: 0n,
      taxTotal: 0n,
      total: 0n,
      createdBy: CREATED_BY,
    })
    .returning();
  if (!row) throw new Error("order insert returned no row");
  return row;
}

beforeAll(async () => {
  handle = await prepareTestDatabase();
  db = handle.db;
  await seedDatabase(db);

  await db.insert(outlets).values({
    id: SECOND_OUTLET_ID,
    businessId: SEED_BUSINESS_ID,
    name: "Outlet Cabang",
  });
  await db.insert(products).values({
    id: SECOND_PRODUCT_ID,
    businessId: SEED_BUSINESS_ID,
    outletId: SECOND_OUTLET_ID,
    sku: "BRK-002",
    name: "Filter oli",
    cost: 40000n,
    price: 75000n,
  });

  orderA = await createOrder(SEED_OUTLET_ID, "SC-A");
  orderB = await createOrder(SECOND_OUTLET_ID, "SC-B");

  const [line] = await db
    .insert(orderLines)
    .values({
      orderId: orderB.id,
      lineType: "PRODUCT",
      productId: SEED_PRODUCT_ID,
      description: "Kampas rem depan",
      quantity: 1,
      unitPrice: 250000n,
      lineTotal: 250000n,
    })
    .returning();
  if (!line) throw new Error("order line insert returned no row");
  orderLineB = line;

  await db.insert(businesses).values({
    id: FOREIGN_BUSINESS_ID,
    name: "Bengkel Lain",
  });
  await db.insert(outlets).values({
    id: FOREIGN_OUTLET_ID,
    businessId: FOREIGN_BUSINESS_ID,
    name: "Outlet Lain",
  });
  await db.insert(user).values({
    id: FOREIGN_USER_ID,
    name: "Staf Bisnis Lain",
    email: "foreign@example.com",
    businessId: FOREIGN_BUSINESS_ID,
    role: "OWNER",
    phone: "081200000099",
  });

  scopeA = { businessId: SEED_BUSINESS_ID, outletIds: [SEED_OUTLET_ID] };
  scopeB = { businessId: SEED_BUSINESS_ID, outletIds: [SECOND_OUTLET_ID] };
});

afterAll(async () => {
  await closeTestDatabase(handle);
});

describe("outlet-scoped reads", () => {
  it("lists only the requested outlet's products", async () => {
    const outletA = await listProducts(db, scopeA);
    const outletB = await listProducts(db, scopeB);

    expect(outletA.map((row) => row.id)).toEqual([SEED_PRODUCT_ID]);
    expect(outletB.map((row) => row.id)).toEqual([SECOND_PRODUCT_ID]);
  });

  it("lists only the requested outlet's services", async () => {
    const outletA = await listServices(db, scopeA);
    const outletB = await listServices(db, scopeB);

    expect(outletA.map((row) => row.id)).toEqual([SEED_SERVICE_ID]);
    expect(outletB).toEqual([]);
  });

  it("lists only the requested outlet's orders", async () => {
    const outletA = await listOrders(db, scopeA);
    const outletB = await listOrders(db, scopeB);

    expect(outletA.map((row) => row.outletId)).toEqual([SEED_OUTLET_ID]);
    expect(outletB.map((row) => row.outletId)).toEqual([SECOND_OUTLET_ID]);
  });

  it("filters orders by status inside the scope", async () => {
    const drafts = await listOrders(db, scopeA, { status: "DRAFT" });
    const paid = await listOrders(db, scopeA, { status: "PAID" });

    expect(drafts.map((row) => row.outletId)).toEqual([SEED_OUTLET_ID]);
    expect(paid).toEqual([]);
  });

  it("reads ledger rows and stock-on-hand only inside the scope", async () => {
    expect(await stockOnHand(db, scopeA, SEED_PRODUCT_ID)).toBe(20n);
    expect(await stockOnHand(db, scopeB, SEED_PRODUCT_ID)).toBe(0n);

    const scopedLedger = await listStockLedger(db, scopeA, {
      productId: SEED_PRODUCT_ID,
    });
    const crossOutletLedger = await listStockLedger(db, scopeB, {
      productId: SEED_PRODUCT_ID,
    });

    expect(scopedLedger.length).toBe(1);
    expect(crossOutletLedger).toEqual([]);
  });

  it("reads settings only for an outlet inside the scope", async () => {
    const settingsA = await getSettings(db, scopeA, SEED_OUTLET_ID);
    expect(settingsA?.taxRate).toBe(11);

    await expect(getSettings(db, scopeA, SECOND_OUTLET_ID)).rejects.toBeInstanceOf(
      ScopeViolationError,
    );
  });

  it("rejects an empty scope before touching the database", () => {
    expect(() =>
      listProducts(db, { businessId: SEED_BUSINESS_ID, outletIds: [] }),
    ).toThrow(ScopeViolationError);
  });
});

describe("scope-checked writes", () => {
  it("refuses a ledger entry for a product from another outlet", async () => {
    await expect(
      appendStockLedgerEntry(db, scopeA, {
        productId: SECOND_PRODUCT_ID,
        entryType: "STOCK_IN",
        quantityBefore: 0,
        quantityAfter: 5,
        sourceType: "STOCK_IN",
        createdBy: CREATED_BY,
      }),
    ).rejects.toBeInstanceOf(ScopeViolationError);
  });

  it("appends a ledger entry for a product inside the scope", async () => {
    const entry = await appendStockLedgerEntry(db, scopeA, {
      productId: SEED_PRODUCT_ID,
      entryType: "ADJUSTMENT",
      quantityBefore: 20,
      quantityAfter: 19,
      sourceType: "ADJUSTMENT",
      reason: "Koreksi stok",
      createdBy: CREATED_BY,
    });

    expect(entry.outletId).toBe(SEED_OUTLET_ID);
    expect(await stockOnHand(db, scopeA, SEED_PRODUCT_ID)).toBe(19n);
  });

  it("refuses an audit entry whose outlet is outside the scope", async () => {
    await expect(
      appendAuditEntry(db, scopeA, {
        action: "settings.update",
        entityType: "settings",
        entityId: "seed-settings",
        outletId: SECOND_OUTLET_ID,
      }),
    ).rejects.toBeInstanceOf(ScopeViolationError);
  });

  it("appends an audit entry with the business taken from the scope", async () => {
    const entry = await appendAuditEntry(db, scopeA, {
      action: "settings.update",
      entityType: "settings",
      entityId: "seed-settings",
      outletId: SEED_OUTLET_ID,
      actorId: CREATED_BY,
      reason: "Uji coba",
    });

    expect(entry.businessId).toBe(SEED_BUSINESS_ID);
    expect(entry.outletId).toBe(SEED_OUTLET_ID);
  });

  it("refuses an audit entry whose outlet belongs to another business", async () => {
    await expect(
      appendAuditEntry(
        db,
        { businessId: SEED_BUSINESS_ID, outletIds: [FOREIGN_OUTLET_ID] },
        {
          action: "settings.update",
          entityType: "settings",
          entityId: "foreign-settings",
          outletId: FOREIGN_OUTLET_ID,
        },
      ),
    ).rejects.toBeInstanceOf(ScopeViolationError);
  });

  it("refuses an audit entry whose actor belongs to another business", async () => {
    await expect(
      appendAuditEntry(db, scopeA, {
        action: "settings.update",
        entityType: "settings",
        entityId: "seed-settings",
        actorId: FOREIGN_USER_ID,
      }),
    ).rejects.toBeInstanceOf(ScopeViolationError);
  });

  it("serializes bigint and Date audit payloads as JSON-safe values", async () => {
    const paidAt = new Date("2026-01-02T03:04:05.000Z");
    const entry = await appendAuditEntry(db, scopeA, {
      action: "order.price_corrected",
      entityType: "orders",
      entityId: orderA.id,
      before: { total: 299700n, paidAt },
      after: { total: 250000n, paidAt: null },
    });

    expect(entry.before).toEqual({
      total: "299700",
      paidAt: paidAt.toISOString(),
    });
    expect(entry.after).toEqual({ total: "250000", paidAt: null });
  });

  it("refuses a ledger entry whose actor belongs to another business", async () => {
    await expect(
      appendStockLedgerEntry(db, scopeA, {
        productId: SEED_PRODUCT_ID,
        entryType: "ADJUSTMENT",
        quantityBefore: 20,
        quantityAfter: 19,
        sourceType: "ADJUSTMENT",
        reason: "Koreksi stok",
        createdBy: FOREIGN_USER_ID,
      }),
    ).rejects.toBeInstanceOf(ScopeViolationError);
  });

  it("refuses a ledger entry tied to an order line from another outlet", async () => {
    await expect(
      appendStockLedgerEntry(db, scopeA, {
        productId: SEED_PRODUCT_ID,
        entryType: "SALE_DECREMENT",
        quantityBefore: 20,
        quantityAfter: 19,
        sourceType: "ORDER",
        sourceId: orderB.id,
        orderLineId: orderLineB.id,
        createdBy: CREATED_BY,
      }),
    ).rejects.toBeInstanceOf(ScopeViolationError);
  });

  it("refuses a ledger entry whose ORDER source is outside the scope", async () => {
    await expect(
      appendStockLedgerEntry(db, scopeA, {
        productId: SEED_PRODUCT_ID,
        entryType: "ADJUSTMENT",
        quantityBefore: 20,
        quantityAfter: 19,
        sourceType: "ORDER",
        sourceId: orderB.id,
        reason: "Koreksi stok",
        createdBy: CREATED_BY,
      }),
    ).rejects.toBeInstanceOf(ScopeViolationError);
  });

  it("appends an order status event only for an order and actor in scope", async () => {
    await expect(
      appendOrderStatusEvent(db, scopeA, {
        orderId: orderB.id,
        fromStatus: "DRAFT",
        toStatus: "ESTIMATED",
        actorId: CREATED_BY,
      }),
    ).rejects.toBeInstanceOf(ScopeViolationError);

    await expect(
      appendOrderStatusEvent(db, scopeA, {
        orderId: orderA.id,
        fromStatus: "DRAFT",
        toStatus: "ESTIMATED",
        actorId: FOREIGN_USER_ID,
      }),
    ).rejects.toBeInstanceOf(ScopeViolationError);

    const event = await appendOrderStatusEvent(db, scopeA, {
      orderId: orderA.id,
      fromStatus: "DRAFT",
      toStatus: "ESTIMATED",
      actorId: CREATED_BY,
      reason: "Mulai estimasi",
    });

    expect(event.orderId).toBe(orderA.id);
    expect(event.actorId).toBe(CREATED_BY);
    expect(event.toStatus).toBe("ESTIMATED");
  });
});
