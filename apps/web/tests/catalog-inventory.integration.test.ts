import { fileURLToPath } from "node:url";
import { and, asc, eq, lt } from "drizzle-orm";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthError, AuthContext } from "@workshop-pos/auth";
import type { LedgerEntryType, MovementResponse, StaffRole } from "@workshop-pos/contracts";
import type { Database } from "@workshop-pos/db";

import type * as AuthModule from "@workshop-pos/auth";
import type * as CatalogModule from "../app/api/v1/catalog/_lib/catalog-service";
import type * as CoreModule from "@workshop-pos/core";
import type * as DbModule from "@workshop-pos/db";
import type * as InventoryModule from "../app/api/v1/inventory/_lib/inventory-service";

/**
 * Catalog + inventory integration coverage (WP4).
 *
 * This is the only web integration file that resets the database, so it owns
 * the schema lifecycle: the test database is dropped, migrated, and filled with
 * synthetic tenancy before any service runs. It refuses to run unless the
 * database name ends in `_test`.
 *
 * The service modules are imported dynamically on purpose: `DATABASE_URL` must
 * be final before `@workshop-pos/db` is loaded, which a hoisted static import
 * cannot guarantee.
 */

const TEST_DATABASE_URL =
  process.env.INTEGRATION_DATABASE_URL ??
  "postgresql://workshop:workshop@127.0.0.1:55432/workshop_pos_test";
process.env.INTEGRATION_DATABASE_URL = TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DATABASE_URL;

const MIGRATIONS_FOLDER = fileURLToPath(
  new URL("../../../packages/db/drizzle", import.meta.url),
);

function testDatabaseName(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(
      "Integration database URL is not a valid URL (credentials are not echoed)",
    );
  }
  const name = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!name.endsWith("_test")) {
    throw new Error(
      `This integration file refuses database "${name}": its name must end with "_test"`,
    );
  }
  return name;
}

const DATABASE_NAME = testDatabaseName(TEST_DATABASE_URL);

const BUSINESS_ID = "a4000000-0000-4000-8000-000000000001";
const OUTLET_PRIMARY = "a4000000-0000-4000-8000-000000000002";
const OUTLET_SECOND = "a4000000-0000-4000-8000-000000000003";
const OUTLET_EMPTY = "a4000000-0000-4000-8000-000000000004";

const OWNER_ID = "wp4_owner";
const ADMIN_ID = "wp4_admin";
const CASHIER_ID = "wp4_cashier";
const MECHANIC_ID = "wp4_mechanic";

let db: Database;
let pool: Pool;
let tables: typeof DbModule;
let auth: typeof AuthModule;
let catalog: typeof CatalogModule;
let inventory: typeof InventoryModule;
let core: typeof CoreModule;

let owner: AuthContext;
let admin: AuthContext;
let cashier: AuthContext;
let mechanic: AuthContext;
/** Admin-like caller restricted to one outlet, to probe the cross-outlet seam. */
let adminPrimaryOnly: AuthContext;

interface SeededProduct {
  id: string;
  sku: string;
}

let brk001: SeededProduct;
let brkLow: SeededProduct;
let brkCons: SeededProduct;
let brkSecond: SeededProduct;
let brkPage: SeededProduct;
let brkIdem: SeededProduct;
let serviceId: string;

let concurrentOrderId: string;
let concurrentLineIds: string[];
let idemOrderId: string;
let idemLineId: string;

function makeContext(
  id: string,
  name: string,
  role: StaffRole,
  outletIds: string[],
  activeOutletId: string | null,
): AuthContext {
  return {
    user: {
      id,
      name,
      email: `${id}@example.com`,
      username: null,
      phone: "081200000001",
      role,
      businessId: BUSINESS_ID,
    },
    method: "web",
    activeOutletId,
    outletIds,
    outlets: outletIds.map((outletId) => ({
      id: outletId,
      name:
        outletId === OUTLET_SECOND
          ? "Outlet Cabang"
          : outletId === OUTLET_EMPTY
            ? "Outlet Kosong"
            : "Outlet Pusat",
      isActive: true,
    })),
    idleTimeoutMinutes: 30,
    sessionExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  };
}

async function resetSchema(): Promise<void> {
  const resetPool = new Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
  try {
    await resetPool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await resetPool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await resetPool.query("CREATE SCHEMA public");
  } finally {
    await resetPool.end();
  }
}

async function expectRejection(
  run: () => Promise<unknown>,
  code: string,
): Promise<AuthError> {
  try {
    await run();
  } catch (error) {
    if (!auth.isAuthError(error)) throw error;
    expect(error.code).toBe(code);
    return error;
  }
  throw new Error(`Expected the call to fail with ${code} but it resolved`);
}

function todayIso(daysFromNow = 0): string {
  return new Date(Date.now() + daysFromNow * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

async function ledgerRows(productId: string) {
  return db
    .select({
      id: tables.stockLedger.id,
      quantityBefore: tables.stockLedger.quantityBefore,
      quantityAfter: tables.stockLedger.quantityAfter,
    })
    .from(tables.stockLedger)
    .where(eq(tables.stockLedger.productId, productId))
    .orderBy(asc(tables.stockLedger.createdAt), asc(tables.stockLedger.id));
}

async function recomputedStock(productId: string): Promise<number> {
  return core.recomputeStock(0, await ledgerRows(productId));
}

/** Every row must start where the previous row ended (BR-005 continuity). */
async function assertLedgerContinuity(productId: string): Promise<void> {
  let previousAfter: number | null = null;
  for (const row of await ledgerRows(productId)) {
    if (previousAfter !== null) expect(row.quantityBefore).toBe(previousAfter);
    previousAfter = row.quantityAfter;
  }
}

async function ledgerRowCount(productId: string): Promise<number> {
  return (await ledgerRows(productId)).length;
}

async function auditsFor(entityId: string) {
  return db
    .select()
    .from(tables.auditLog)
    .where(eq(tables.auditLog.entityId, entityId))
    .orderBy(asc(tables.auditLog.createdAt));
}

async function insertOrder(outletId: string, orderNumber: string): Promise<string> {
  const [row] = await db
    .insert(tables.orders)
    .values({
      businessId: BUSINESS_ID,
      outletId,
      kind: "SALE",
      orderNumber,
      taxRate: 11,
      subtotal: 0n,
      discountTotal: 0n,
      taxTotal: 0n,
      total: 0n,
      createdBy: OWNER_ID,
    })
    .returning({ id: tables.orders.id });
  if (!row) throw new Error("order insert returned no row");
  return row.id;
}

async function insertOrderLine(
  orderId: string,
  productId: string,
  quantity: number,
): Promise<string> {
  const [row] = await db
    .insert(tables.orderLines)
    .values({
      orderId,
      lineType: "PRODUCT",
      productId,
      description: "Baris uji WP4",
      quantity,
      unitPrice: 100_000n,
      lineTotal: BigInt(quantity) * 100_000n,
    })
    .returning({ id: tables.orderLines.id });
  if (!row) throw new Error("order line insert returned no row");
  return row.id;
}

beforeAll(async () => {
  testDatabaseName(TEST_DATABASE_URL);

  tables = await import("@workshop-pos/db");
  auth = await import("@workshop-pos/auth");
  core = await import("@workshop-pos/core");
  catalog = await import("../app/api/v1/catalog/_lib/catalog-service");
  inventory = await import("../app/api/v1/inventory/_lib/inventory-service");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");

  await resetSchema();
  const client = tables.createDatabaseClient(TEST_DATABASE_URL);
  db = client.db;
  pool = client.pool;
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

  await db.insert(tables.businesses).values({
    id: BUSINESS_ID,
    name: "Bengkel Uji WP4",
  });
  await db.insert(tables.outlets).values([
    { id: OUTLET_PRIMARY, businessId: BUSINESS_ID, name: "Outlet Pusat" },
    { id: OUTLET_SECOND, businessId: BUSINESS_ID, name: "Outlet Cabang" },
    { id: OUTLET_EMPTY, businessId: BUSINESS_ID, name: "Outlet Kosong" },
  ]);
  await db.insert(tables.user).values([
    {
      id: OWNER_ID,
      name: "Rina Uji",
      email: "owner.wp4@example.com",
      businessId: BUSINESS_ID,
      role: "OWNER",
      phone: "081200000010",
    },
    {
      id: ADMIN_ID,
      name: "Andi Uji",
      email: "admin.wp4@example.com",
      businessId: BUSINESS_ID,
      role: "ADMIN",
      phone: "081200000011",
    },
    {
      id: CASHIER_ID,
      name: "Dewi Uji",
      email: "cashier.wp4@example.com",
      businessId: BUSINESS_ID,
      role: "CASHIER",
      phone: "081200000012",
    },
    {
      id: MECHANIC_ID,
      name: "Agus Uji",
      email: "mechanic.wp4@example.com",
      businessId: BUSINESS_ID,
      role: "MECHANIC",
      phone: "081200000013",
    },
  ]);
  await db.insert(tables.staffOutlets).values([
    { userId: CASHIER_ID, outletId: OUTLET_PRIMARY },
    { userId: MECHANIC_ID, outletId: OUTLET_PRIMARY },
  ]);

  owner = makeContext(OWNER_ID, "Rina Uji", "OWNER", [OUTLET_PRIMARY, OUTLET_SECOND], OUTLET_PRIMARY);
  admin = makeContext(ADMIN_ID, "Andi Uji", "ADMIN", [OUTLET_PRIMARY, OUTLET_SECOND], OUTLET_PRIMARY);
  cashier = makeContext(CASHIER_ID, "Dewi Uji", "CASHIER", [OUTLET_PRIMARY], OUTLET_PRIMARY);
  mechanic = makeContext(MECHANIC_ID, "Agus Uji", "MECHANIC", [OUTLET_PRIMARY], OUTLET_PRIMARY);
  adminPrimaryOnly = makeContext(ADMIN_ID, "Andi Uji", "ADMIN", [OUTLET_PRIMARY], OUTLET_PRIMARY);

  const created = await catalog.createProduct(db, owner, {
    sku: "BRK-001",
    name: "Kampas Rem Depan",
    unit: "set",
    cost: "150000",
    price: "250000",
    lowStockThreshold: 5,
    openingStock: 20,
  });
  brk001 = { id: created.id, sku: created.sku };

  const low = await catalog.createProduct(db, owner, {
    sku: "BRK-LOW",
    name: "Ban Dalam",
    unit: "pcs",
    cost: "40000",
    price: "75000",
    lowStockThreshold: 5,
    openingStock: 2,
  });
  brkLow = { id: low.id, sku: low.sku };

  const cons = await catalog.createProduct(db, owner, {
    sku: "BRK-CONS",
    name: "Busi",
    unit: "pcs",
    cost: "20000",
    price: "45000",
    lowStockThreshold: 1,
    openingStock: 1,
  });
  brkCons = { id: cons.id, sku: cons.sku };

  const idem = await catalog.createProduct(db, owner, {
    sku: "BRK-IDEM",
    name: "Filter Oli",
    unit: "pcs",
    cost: "30000",
    price: "60000",
    lowStockThreshold: null,
    openingStock: 5,
  });
  brkIdem = { id: idem.id, sku: idem.sku };

  const second = await catalog.createProduct(
    db,
    makeContext(OWNER_ID, "Rina Uji", "OWNER", [OUTLET_PRIMARY, OUTLET_SECOND], OUTLET_SECOND),
    {
      sku: "BRK-002",
      name: "Kampas Belakang",
      unit: "set",
      cost: "120000",
      price: "200000",
      lowStockThreshold: null,
      openingStock: 4,
    },
  );
  brkSecond = { id: second.id, sku: second.sku };

  const service = await catalog.createService(db, owner, {
    code: "SRV-001",
    name: "Servis Rem",
    price: "50000",
    durationMinutes: 30,
  });
  serviceId = service.id;

  // Pagination fixture: one product with 27 ledger rows, inserted directly so
  // the list can be paged past one page without 27 API-shaped calls.
  const [pageProduct] = await db
    .insert(tables.products)
    .values({
      businessId: BUSINESS_ID,
      outletId: OUTLET_PRIMARY,
      sku: "BRK-PAGE",
      name: "Produk Halaman",
      unit: "pcs",
      cost: 1_000n,
      price: 2_000n,
      lowStockThreshold: null,
    })
    .returning({ id: tables.products.id });
  if (!pageProduct) throw new Error("page product insert returned no row");
  brkPage = { id: pageProduct.id, sku: "BRK-PAGE" };

  await db.insert(tables.stockLedger).values(
    Array.from({ length: 27 }, (_, index) => ({
      businessId: BUSINESS_ID,
      outletId: OUTLET_PRIMARY,
      productId: brkPage.id,
      entryType: "STOCK_IN" as const,
      quantityBefore: index,
      quantityAfter: index + 1,
      sourceType: "STOCK_IN" as const,
      createdBy: OWNER_ID,
    })),
  );

  concurrentOrderId = await insertOrder(OUTLET_PRIMARY, "WP4-CONC");
  concurrentLineIds = [
    await insertOrderLine(concurrentOrderId, brkCons.id, 1),
    await insertOrderLine(concurrentOrderId, brkCons.id, 1),
  ];

  idemOrderId = await insertOrder(OUTLET_PRIMARY, "WP4-IDEM");
  idemLineId = await insertOrderLine(idemOrderId, brkIdem.id, 2);
});

afterAll(async () => {
  await pool?.end();
});

describe(`catalog and inventory over ${DATABASE_NAME}`, () => {
  it("hides cost from Cashier/Mechanic payloads and includes it for Owner/Admin", async () => {
    const ownerPage = await catalog.listCatalog(db, owner, {
      type: "product",
      status: "all",
      page: 1,
      pageSize: 50,
      sort: "name",
      dir: "asc",
    });
    const ownerRow = ownerPage.items.find((item) => item.id === brk001.id);
    if (ownerRow?.itemType !== "PRODUCT") throw new Error("expected a product row");
    expect(ownerRow.cost).toBe("150000");
    expect(ownerRow.price).toBe("250000");

    for (const context of [cashier, mechanic]) {
      const page = await catalog.listCatalog(db, context, {
        type: "product",
        status: "all",
        page: 1,
        pageSize: 50,
        sort: "name",
        dir: "asc",
      });
      const row = page.items.find((item) => item.id === brk001.id);
      expect(row).toBeDefined();
      expect(row && "cost" in row).toBe(false);
      expect(page.items.length).toBeGreaterThan(0);
    }

    const adminPage = await catalog.listCatalog(db, admin, {
      type: "product",
      status: "all",
      page: 1,
      pageSize: 25,
      sort: "sku",
      dir: "asc",
    });
    const adminRow = adminPage.items.find((item) => item.id === brk001.id);
    expect(adminRow?.itemType === "PRODUCT" ? adminRow.cost : undefined).toBe("150000");

    expect(auth.can("CASHIER", "manage_catalog")).toBe(false);
    expect(auth.can("MECHANIC", "manage_catalog")).toBe(false);
    expect(auth.can("CASHIER", "manage_stock")).toBe(false);
    expect(auth.can("ADMIN", "manage_catalog")).toBe(true);
  });

  it("refuses catalog mutation for Cashier and Mechanic", async () => {
    for (const context of [cashier, mechanic]) {
      await expectRejection(
        () =>
          catalog.createProduct(db, context, {
            sku: "BRK-DENY",
            name: "Produk Ditolak",
            unit: "pcs",
            cost: "1000",
            price: "2000",
            openingStock: 0,
          }),
        "FORBIDDEN",
      );
      await expectRejection(
        () => catalog.updateProduct(db, context, brk001.id, { price: "1" }),
        "FORBIDDEN",
      );
      await expectRejection(
        () =>
          catalog.createService(db, context, {
            code: "SRV-DENY",
            name: "Layanan Ditolak",
            price: "1000",
            durationMinutes: 10,
          }),
        "FORBIDDEN",
      );
    }

    const denied = await db
      .select({ id: tables.products.id })
      .from(tables.products)
      .where(eq(tables.products.sku, "BRK-DENY"));
    expect(denied).toHaveLength(0);
  });

  it("keeps SKU/code unique per outlet and answers a Bahasa 409 on conflict", async () => {
    const error = await expectRejection(
      () =>
        catalog.createProduct(db, owner, {
          sku: "BRK-001",
          name: "Duplikat SKU",
          unit: "pcs",
          cost: "1000",
          price: "2000",
          openingStock: 0,
        }),
      "CONFLICT",
    );
    expect(error.message).toContain("SKU");

    // The same SKU in another outlet is legal: uniqueness is per outlet.
    const secondOutletOwner = makeContext(
      OWNER_ID,
      "Rina Uji",
      "OWNER",
      [OUTLET_PRIMARY, OUTLET_SECOND],
      OUTLET_SECOND,
    );
    const duplicateInSecondOutlet = await catalog.createProduct(db, secondOutletOwner, {
      sku: "BRK-001",
      name: "Kampas Rem Outlet Cabang",
      unit: "set",
      cost: "150000",
      price: "250000",
      openingStock: 0,
    });
    expect(duplicateInSecondOutlet.outletId).toBe(OUTLET_SECOND);
    expect(duplicateInSecondOutlet.outletName).toBe("Outlet Cabang");

    await expectRejection(
      () =>
        catalog.createService(db, owner, {
          code: "SRV-001",
          name: "Duplikat Layanan",
          price: "1000",
          durationMinutes: 10,
        }),
      "CONFLICT",
    );
  });

  it("records opening stock as a STOCK_IN ledger row in the product transaction", async () => {
    const rows = await db
      .select()
      .from(tables.stockLedger)
      .where(eq(tables.stockLedger.productId, brk001.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.entryType).toBe("STOCK_IN");
    expect(rows[0]?.quantityBefore).toBe(0);
    expect(rows[0]?.quantityAfter).toBe(20);
    expect(rows[0]?.createdBy).toBe(OWNER_ID);

    const inventoryProducts = await inventory.listInventoryProducts(db, owner);
    expect(inventoryProducts.find((item) => item.id === brk001.id)?.stockOnHand).toBe(20);
    expect(await recomputedStock(brk001.id)).toBe(20);
  });

  it("audits product price and cost edits separately with decimal strings", async () => {
    const updated = await catalog.updateProduct(db, owner, brk001.id, {
      price: "260000",
      cost: "160000",
    });
    expect(updated.price).toBe("260000");
    expect(updated.cost).toBe("160000");
    expect(updated.outletName).toBe("Outlet Pusat");

    const audits = await auditsFor(brk001.id);
    const priceAudit = audits.find((row) => row.action === "catalog.product.price_changed");
    const costAudit = audits.find((row) => row.action === "catalog.product.cost_changed");

    expect(priceAudit?.before).toEqual({ price: "250000" });
    expect(priceAudit?.after).toEqual({ price: "260000" });
    expect(costAudit?.before).toEqual({ cost: "150000" });
    expect(costAudit?.after).toEqual({ cost: "160000" });
    expect(priceAudit?.actorId).toBe(OWNER_ID);

    await catalog.updateProduct(db, owner, brk001.id, { isActive: false });
    const deactivated = (await auditsFor(brk001.id)).find(
      (row) => row.action === "catalog.product.deactivated",
    );
    expect(deactivated?.after).toEqual({ isActive: false });

    await catalog.updateProduct(db, owner, brk001.id, { isActive: true });
    const reactivated = (await auditsFor(brk001.id)).find(
      (row) => row.action === "catalog.product.reactivated",
    );
    expect(reactivated?.after).toEqual({ isActive: true });
  });

  it("audits service price edits", async () => {
    const updated = await catalog.updateService(db, owner, serviceId, {
      price: "55000",
    });
    expect(updated.price).toBe("55000");
    expect(updated.outletName).toBe("Outlet Pusat");

    const priceAudit = (await auditsFor(serviceId)).find(
      (row) => row.action === "catalog.service.price_changed",
    );
    expect(priceAudit?.before).toEqual({ price: "50000" });
    expect(priceAudit?.after).toEqual({ price: "55000" });
  });

  it("lists low stock with shortfall and clears it after stock-in", async () => {
    const initial = await inventory.listLowStock(db, owner);
    const low = initial.items.find((item) => item.productId === brkLow.id);
    expect(low?.stockOnHand).toBe(2);
    expect(low?.lowStockThreshold).toBe(5);
    expect(low?.shortfall).toBe(3);
    expect(initial.items.find((item) => item.productId === brkCons.id)?.shortfall).toBe(0);
    expect(initial.items.some((item) => item.productId === brk001.id)).toBe(false);

    const stockIn = await inventory.recordStockIn(db, admin, {
      productId: brkLow.id,
      quantity: 5,
      note: "Restok pemasok",
      reference: "PO-77",
    });
    expect(stockIn.stockOnHand).toBe(7);
    expect(stockIn.entry.quantityBefore).toBe(2);
    expect(stockIn.entry.quantityAfter).toBe(7);
    expect(stockIn.entry.actorId).toBe(ADMIN_ID);
    expect(stockIn.entry.actorName).toBe("Andi Uji");

    const restockedMain = await inventory.recordStockIn(db, admin, {
      productId: brk001.id,
      quantity: 5,
      note: "Restok utama",
    });
    expect(restockedMain.stockOnHand).toBe(25);

    const after = await inventory.listLowStock(db, owner);
    expect(after.items.some((item) => item.productId === brkLow.id)).toBe(false);
    expect(await recomputedStock(brkLow.id)).toBe(7);
    expect(await recomputedStock(brk001.id)).toBe(25);
  });

  it("returns an empty low-stock and inventory list for an outlet with no products", async () => {
    const emptyContext = makeContext(
      OWNER_ID,
      "Rina Uji",
      "OWNER",
      [OUTLET_EMPTY],
      OUTLET_EMPTY,
    );
    expect((await inventory.listLowStock(db, emptyContext)).items).toEqual([]);
    expect(await inventory.listInventoryProducts(db, emptyContext)).toEqual([]);
  });

  it("rejects an adjustment below zero with a 409 naming the product and writes nothing", async () => {
    const rowsBefore = await ledgerRowCount(brkLow.id);

    const error = await expectRejection(
      () =>
        inventory.recordAdjustment(db, admin, {
          productId: brkLow.id,
          quantityDelta: -100,
          reason: "Uji kurang stok",
          override: false,
        }),
      "CONFLICT",
    );
    expect(error.message).toContain("Ban Dalam");

    expect(await ledgerRowCount(brkLow.id)).toBe(rowsBefore);
    const audits = await db
      .select({ id: tables.auditLog.id, reason: tables.auditLog.reason })
      .from(tables.auditLog)
      .where(eq(tables.auditLog.action, "inventory.adjustment"));
    expect(audits.some((row) => row.reason === "Uji kurang stok")).toBe(false);
    expect(await recomputedStock(brkLow.id)).toBe(7);
  });

  it("lands an Admin override as a flagged negative ledger row with reason", async () => {
    const movement = await inventory.recordAdjustment(db, admin, {
      productId: brkLow.id,
      quantityDelta: -10,
      reason: "Stok rusak saat opname",
      override: true,
    });

    expect(movement.stockOnHand).toBe(-3);
    expect(movement.entry.override).toBe(true);
    expect(movement.entry.reason).toBe("Stok rusak saat opname");
    expect(movement.entry.quantityBefore).toBe(7);
    expect(movement.entry.quantityAfter).toBe(-3);

    const low = await inventory.listLowStock(db, owner);
    expect(low.items.find((item) => item.productId === brkLow.id)?.shortfall).toBe(8);
  });

  it("refuses stock reads and writes for Cashier", async () => {
    await expectRejection(
      () => inventory.listLedger(db, cashier, { page: 1, pageSize: 25 }),
      "FORBIDDEN",
    );
    await expectRejection(() => inventory.listLowStock(db, cashier), "FORBIDDEN");
    await expectRejection(
      () => inventory.recordStockIn(db, cashier, { productId: brk001.id, quantity: 1 }),
      "FORBIDDEN",
    );
    await expectRejection(
      () =>
        inventory.recordAdjustment(db, cashier, {
          productId: brk001.id,
          quantityDelta: -1,
          reason: "Uji izin kasir",
          override: false,
        }),
      "FORBIDDEN",
    );
    expect(await recomputedStock(brk001.id)).toBe(25);
  });

  it("pages and filters the ledger newest-first with actor and product names", async () => {
    const forProduct = await inventory.listLedger(db, owner, {
      productId: brk001.id,
      page: 1,
      pageSize: 25,
    });
    expect(forProduct.total).toBe(2);
    expect(forProduct.items).toHaveLength(2);
    expect(forProduct.items[0]?.quantityAfter).toBe(25);
    expect(forProduct.items[0]?.productSku).toBe("BRK-001");
    expect(forProduct.items[0]?.productName).toBe("Kampas Rem Depan");
    expect(forProduct.items[0]?.actorName).toBe("Andi Uji");

    const stockIns = await inventory.listLedger(db, owner, {
      entryType: "STOCK_IN" as LedgerEntryType,
      page: 1,
      pageSize: 100,
    });
    expect(stockIns.total).toBeGreaterThan(0);
    expect(stockIns.items.every((item) => item.entryType === "STOCK_IN")).toBe(true);

    const inRange = await inventory.listLedger(db, owner, {
      from: todayIso(-10),
      to: todayIso(1),
      page: 1,
      pageSize: 25,
    });
    expect(inRange.total).toBeGreaterThan(0);

    const future = await inventory.listLedger(db, owner, {
      from: todayIso(2),
      page: 1,
      pageSize: 25,
    });
    expect(future.total).toBe(0);

    await expectRejection(
      () =>
        inventory.listLedger(db, owner, {
          from: todayIso(2),
          to: todayIso(1),
          page: 1,
          pageSize: 25,
        }),
      "VALIDATION_ERROR",
    );

    const firstPage = await inventory.listLedger(db, owner, {
      productId: brkPage.id,
      page: 1,
      pageSize: 25,
    });
    expect(firstPage.total).toBe(27);
    expect(firstPage.items).toHaveLength(25);
    expect(firstPage.totalPages).toBe(2);

    const secondPage = await inventory.listLedger(db, owner, {
      productId: brkPage.id,
      page: 2,
      pageSize: 25,
    });
    expect(secondPage.items).toHaveLength(2);
    expect(secondPage.page).toBe(2);
  });

  it("keeps the ledger append-only and recomputable", async () => {
    const displayed = await inventory.listInventoryProducts(db, owner);
    expect(displayed.find((item) => item.id === brk001.id)?.stockOnHand).toBe(
      await recomputedStock(brk001.id),
    );

    const [entry] = await db
      .select({ id: tables.stockLedger.id })
      .from(tables.stockLedger)
      .where(eq(tables.stockLedger.productId, brk001.id))
      .limit(1);
    if (!entry) throw new Error("expected a ledger row");

    const raw = new Client({ connectionString: TEST_DATABASE_URL });
    await raw.connect();
    try {
      await expect(
        raw.query("update stock_ledger set reason = 'x' where id = $1", [entry.id]),
      ).rejects.toThrow(/append-only/);
      await expect(
        raw.query("delete from stock_ledger where id = $1", [entry.id]),
      ).rejects.toThrow(/append-only/);
    } finally {
      await raw.end();
    }

    expect(await ledgerRowCount(brk001.id)).toBe(2);
    await assertLedgerContinuity(brk001.id);
  });

  it("scopes catalog and stock to the active outlet and audits cross-outlet access", async () => {
    const ownerPage = await catalog.listCatalog(db, owner, {
      type: "product",
      status: "all",
      page: 1,
      pageSize: 100,
      sort: "name",
      dir: "asc",
    });
    expect(ownerPage.items.some((item) => item.id === brkSecond.id)).toBe(false);

    const ownerSecond = makeContext(
      OWNER_ID,
      "Rina Uji",
      "OWNER",
      [OUTLET_PRIMARY, OUTLET_SECOND],
      OUTLET_SECOND,
    );
    const secondPage = await catalog.listCatalog(db, ownerSecond, {
      type: "product",
      status: "all",
      page: 1,
      pageSize: 100,
      sort: "name",
      dir: "asc",
    });
    expect(secondPage.items.some((item) => item.id === brkSecond.id)).toBe(true);
    expect(secondPage.items.some((item) => item.id === brk001.id)).toBe(false);

    const secondInventory = await inventory.listInventoryProducts(db, ownerSecond);
    expect(secondInventory.some((item) => item.id === brkSecond.id)).toBe(true);
    expect(secondInventory.some((item) => item.id === brk001.id)).toBe(false);

    const cashierPage = await catalog.listCatalog(db, cashier, {
      type: "product",
      status: "all",
      page: 1,
      pageSize: 100,
      sort: "name",
      dir: "asc",
    });
    expect(cashierPage.items.some((item) => item.id === brkSecond.id)).toBe(false);

    const foreignLedger = await inventory.listLedger(db, adminPrimaryOnly, {
      productId: brkSecond.id,
      page: 1,
      pageSize: 25,
    });
    expect(foreignLedger.total).toBe(0);

    await expectRejection(
      () => catalog.updateProduct(db, adminPrimaryOnly, brkSecond.id, { price: "1" }),
      "FORBIDDEN",
    );

    const denialAudit = (await auditsFor(brkSecond.id)).find(
      (row) => row.action === "rbac.cross_outlet_denied",
    );
    expect(denialAudit).toBeDefined();
    expect(denialAudit?.after).toEqual({ requestedOutletId: OUTLET_SECOND });

    await expectRejection(
      () =>
        inventory.recordStockIn(db, adminPrimaryOnly, {
          productId: brkSecond.id,
          quantity: 1,
        }),
      "FORBIDDEN",
    );

    const notFound = await expectRejection(
      () =>
        catalog.updateProduct(db, owner, "a4000000-0000-4000-8000-0000000000ff", {
          price: "1000",
        }),
      "NOT_FOUND",
    );
    expect(notFound.message).toContain("tidak ditemukan");
  });

  it("allows exactly one concurrent last-unit sale decrement", async () => {
    const attempts = await Promise.allSettled(
      concurrentLineIds.map((orderLineId) =>
        inventory.applyStockMovement(db, cashier, {
          productId: brkCons.id,
          orderLineId,
          sourceId: concurrentOrderId,
          entryType: "SALE_DECREMENT",
          quantity: 1,
        }),
      ),
    );

    const fulfilled = attempts.filter((result) => result.status === "fulfilled");
    const rejected = attempts.filter((result) => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const failure = rejected[0];
    if (failure?.status !== "rejected") throw new Error("expected one rejection");
    expect(auth.isAuthError(failure.reason)).toBe(true);
    expect((failure.reason as AuthError).code).toBe("CONFLICT");
    expect((failure.reason as AuthError).message).toContain("Busi");

    expect(await recomputedStock(brkCons.id)).toBe(0);
    const saleRows = await db
      .select()
      .from(tables.stockLedger)
      .where(
        and(
          eq(tables.stockLedger.productId, brkCons.id),
          eq(tables.stockLedger.entryType, "SALE_DECREMENT"),
        ),
      );
    expect(saleRows).toHaveLength(1);
    expect(saleRows[0]?.quantityBefore).toBe(1);
    expect(saleRows[0]?.quantityAfter).toBe(0);
    expect(saleRows[0]?.override).toBe(false);

    const negativeUnflagged = await db
      .select({ id: tables.stockLedger.id })
      .from(tables.stockLedger)
      .where(
        and(
          eq(tables.stockLedger.entryType, "SALE_DECREMENT"),
          eq(tables.stockLedger.override, false),
          lt(tables.stockLedger.quantityAfter, 0),
        ),
      );
    expect(negativeUnflagged).toHaveLength(0);
  });

  it("replays a duplicate decrement idempotently and reverses exactly once", async () => {
    const first = await inventory.applyStockMovement(db, cashier, {
      productId: brkIdem.id,
      orderLineId: idemLineId,
      sourceId: idemOrderId,
      entryType: "SALE_DECREMENT",
      quantity: 2,
    });
    expect(first.stockOnHand).toBe(3);
    expect(first.entry.quantityBefore).toBe(5);
    expect(first.entry.quantityAfter).toBe(3);

    const replay = await inventory.applyStockMovement(db, cashier, {
      productId: brkIdem.id,
      orderLineId: idemLineId,
      sourceId: idemOrderId,
      entryType: "SALE_DECREMENT",
      quantity: 2,
    });
    expect(replay.entry.id).toBe(first.entry.id);
    expect(replay.stockOnHand).toBe(3);
    expect(await ledgerRowCount(brkIdem.id)).toBe(2);
    expect(await recomputedStock(brkIdem.id)).toBe(3);

    const reversal = await inventory.applyStockMovement(db, cashier, {
      productId: brkIdem.id,
      orderLineId: idemLineId,
      sourceId: idemOrderId,
      entryType: "SALE_REVERSAL",
      quantity: 2,
    });
    expect(reversal.entry.entryType).toBe("SALE_REVERSAL");
    expect(reversal.stockOnHand).toBe(5);

    const reversalReplay = await inventory.applyStockMovement(db, cashier, {
      productId: brkIdem.id,
      orderLineId: idemLineId,
      sourceId: idemOrderId,
      entryType: "SALE_REVERSAL",
      quantity: 2,
    });
    expect(reversalReplay.entry.id).toBe(reversal.entry.id);
    expect(await recomputedStock(brkIdem.id)).toBe(5);
  });

  it("refuses a reversal without a decrement and a mismatched reversal quantity", async () => {
    const suffix = Date.now().toString(36).toUpperCase();
    const product = await catalog.createProduct(db, owner, {
      sku: `REV-${suffix}`,
      name: "Produk pembalikan uji",
      unit: "pcs",
      cost: "10000",
      price: "20000",
      lowStockThreshold: null,
      openingStock: 5,
    });
    const orderId = await insertOrder(OUTLET_PRIMARY, `WP4-REV-${suffix}`);
    const lineId = await insertOrderLine(orderId, product.id, 1);

    await expectRejection(
      () =>
        inventory.applyStockMovement(db, cashier, {
          productId: product.id,
          orderLineId: lineId,
          sourceId: orderId,
          entryType: "SALE_REVERSAL",
          quantity: 1,
        }),
      "CONFLICT",
    );

    const decrement = await inventory.applyStockMovement(db, cashier, {
      productId: product.id,
      orderLineId: lineId,
      sourceId: orderId,
      entryType: "SALE_DECREMENT",
      quantity: 1,
      sourceRef: "SRV/2026/000777",
    });
    expect(decrement.entry.sourceRef).toBe("SRV/2026/000777");
    expect(decrement.stockOnHand).toBe(4);

    await expectRejection(
      () =>
        inventory.applyStockMovement(db, cashier, {
          productId: product.id,
          orderLineId: lineId,
          sourceId: orderId,
          entryType: "SALE_REVERSAL",
          quantity: 2,
        }),
      "VALIDATION_ERROR",
    );

    const reversal = await inventory.applyStockMovement(db, cashier, {
      productId: product.id,
      orderLineId: lineId,
      sourceId: orderId,
      entryType: "SALE_REVERSAL",
      quantity: 1,
    });
    expect(reversal.stockOnHand).toBe(5);
    await assertLedgerContinuity(product.id);
  });

  it("answers a concurrent duplicate decrement from the committed ledger row", async () => {
    const suffix = Date.now().toString(36).toUpperCase();
    const product = await catalog.createProduct(db, owner, {
      sku: `DUP-${suffix}`,
      name: "Produk duplikat uji",
      unit: "pcs",
      cost: "10000",
      price: "20000",
      lowStockThreshold: null,
      openingStock: 5,
    });
    const orderId = await insertOrder(OUTLET_PRIMARY, `WP4-DUP-${suffix}`);
    const lineId = await insertOrderLine(orderId, product.id, 1);

    const attempts = await Promise.allSettled([
      inventory.applyStockMovement(db, cashier, {
        productId: product.id,
        orderLineId: lineId,
        sourceId: orderId,
        entryType: "SALE_DECREMENT",
        quantity: 1,
      }),
      inventory.applyStockMovement(db, cashier, {
        productId: product.id,
        orderLineId: lineId,
        sourceId: orderId,
        entryType: "SALE_DECREMENT",
        quantity: 1,
      }),
    ]);

    const fulfilled = attempts.filter(
      (result): result is PromiseFulfilledResult<MovementResponse> =>
        result.status === "fulfilled",
    );
    expect(fulfilled).toHaveLength(2);
    expect(fulfilled[0]?.value.entry.id).toBe(fulfilled[1]?.value.entry.id);
    expect(fulfilled[0]?.value.stockOnHand).toBe(4);
    expect(await recomputedStock(product.id)).toBe(4);

    const decrements = await db
      .select({ id: tables.stockLedger.id })
      .from(tables.stockLedger)
      .where(
        and(
          eq(tables.stockLedger.productId, product.id),
          eq(tables.stockLedger.entryType, "SALE_DECREMENT"),
        ),
      );
    expect(decrements).toHaveLength(1);
    await assertLedgerContinuity(product.id);
  });

  it("filters ledger dates by the Asia/Jakarta business day", async () => {
    const suffix = Date.now().toString(36).toUpperCase();
    const product = await catalog.createProduct(db, owner, {
      sku: `TZ-${suffix}`,
      name: "Produk zona waktu uji",
      unit: "pcs",
      cost: "10000",
      price: "20000",
      lowStockThreshold: null,
      openingStock: 0,
    });

    // 2026-11-26T18:30Z is 2026-11-27 01:30 WIB.
    await db.insert(tables.stockLedger).values({
      businessId: BUSINESS_ID,
      outletId: OUTLET_PRIMARY,
      productId: product.id,
      entryType: "STOCK_IN",
      quantityBefore: 0,
      quantityAfter: 1,
      sourceType: "STOCK_IN",
      createdBy: OWNER_ID,
      createdAt: new Date("2026-11-26T18:30:00.000Z"),
    });

    const onWibDay = await inventory.listLedger(db, owner, {
      productId: product.id,
      from: "2026-11-27",
      to: "2026-11-27",
      page: 1,
      pageSize: 25,
    });
    expect(onWibDay.items).toHaveLength(1);

    const previousWibDay = await inventory.listLedger(db, owner, {
      productId: product.id,
      from: "2026-11-26",
      to: "2026-11-26",
      page: 1,
      pageSize: 25,
    });
    expect(previousWibDay.items).toHaveLength(0);
  });

  it("requires override_stock for a negative sale and audits the denial", async () => {
    const orderId = await insertOrder(OUTLET_PRIMARY, "WP4-OVR");
    const lineId = await insertOrderLine(orderId, brkCons.id, 1);

    await expectRejection(
      () =>
        inventory.applyStockMovement(db, cashier, {
          productId: brkCons.id,
          orderLineId: lineId,
          sourceId: orderId,
          entryType: "SALE_DECREMENT",
          quantity: 1,
          override: true,
          reason: "Uji override kasir",
        }),
      "FORBIDDEN",
    );

    const denial = (await auditsFor(brkCons.id)).find(
      (row) => row.action === "rbac.denied",
    );
    expect(denial).toBeDefined();
    expect(denial?.reason).toContain("override");

    const conflict = await expectRejection(
      () =>
        inventory.applyStockMovement(db, cashier, {
          productId: brkCons.id,
          orderLineId: lineId,
          sourceId: orderId,
          entryType: "SALE_DECREMENT",
          quantity: 1,
        }),
      "CONFLICT",
    );
    expect(conflict.message).toContain("Busi");

    const untouched = await db
      .select({ id: tables.stockLedger.id })
      .from(tables.stockLedger)
      .where(eq(tables.stockLedger.orderLineId, lineId));
    expect(untouched).toHaveLength(0);

    const override = await inventory.applyStockMovement(db, admin, {
      productId: brkCons.id,
      orderLineId: lineId,
      sourceId: orderId,
      entryType: "SALE_DECREMENT",
      quantity: 1,
      override: true,
      reason: "Barang keluar tanpa catatan",
    });
    expect(override.stockOnHand).toBe(-1);
    expect(override.entry.override).toBe(true);
    expect(override.entry.reason).toBe("Barang keluar tanpa catatan");
  });
});
