import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { and, eq, sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthContext, AuthError } from "@workshop-pos/auth";
import type {
  SyncApplyRequest,
  SyncOrderLine,
  SyncResult,
} from "@workshop-pos/contracts";
import type { Database } from "@workshop-pos/db";

import type * as AuthModule from "@workshop-pos/auth";
import type * as DbModule from "@workshop-pos/db";
import type * as SyncModule from "../app/api/v1/sync/_lib/sync-service";

/**
 * WP6.1 offline-sync integration coverage (PRD US-14/US-15, FR-041–FR-043).
 *
 * Services are imported dynamically after `DATABASE_URL` is final. Each test
 * drives the same service the route handlers call, against a disposable
 * `_test` database, and asserts the money, stock, idempotency, conflict, and
 * audit rows the endpoint is responsible for.
 */

const TEST_DATABASE_URL =
  process.env.INTEGRATION_DATABASE_URL ??
  "postgresql://workshop:workshop@127.0.0.1:55432/workshop_pos_test";
process.env.INTEGRATION_DATABASE_URL = TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DATABASE_URL;

const MIGRATIONS_FOLDER = fileURLToPath(
  new URL("../../../packages/db/drizzle", import.meta.url),
);

const BUSINESS_ID = "b7000000-0000-4000-8000-000000000001";
const OUTLET_A = "b7000000-0000-4000-8000-000000000002";
const OUTLET_B = "b7000000-0000-4000-8000-000000000003";

const OWNER_ID = "wp61_owner";
const ADMIN_ID = "wp61_admin";
const CASHIER_A_ID = "wp61_cashier_a";
const CASHIER_B_ID = "wp61_cashier_b";
const MECHANIC_ID = "wp61_mechanic";

const DEVICE_A_ID = "b7000000-0000-4000-8000-000000000010";
const DEVICE_B_ID = "b7000000-0000-4000-8000-000000000011";

const CUSTOMER_A_ID = "c7000000-0000-4000-8000-000000000001";
const CUSTOMER_B_ID = "c7000000-0000-4000-8000-000000000002";
const VEHICLE_ID = "c7000000-0000-4000-8000-000000000003";
const PRODUCT_BRK_ID = "c7000000-0000-4000-8000-000000000004";
const PRODUCT_FILTER_ID = "c7000000-0000-4000-8000-000000000005";
const SERVICE_OIL_ID = "c7000000-0000-4000-8000-000000000006";

let db: Database;
let pool: Pool;
let tables: typeof DbModule;
let auth: typeof AuthModule;
let sync: typeof SyncModule;

let owner: AuthContext;
let admin: AuthContext;
let cashierA: AuthContext;
let cashierB: AuthContext;
let mechanic: AuthContext;

function testDatabaseName(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Integration database URL is not a valid URL");
  }
  const name = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!name.endsWith("_test")) {
    throw new Error(`This integration file refuses database "${name}"`);
  }
  return name;
}

function makeContext(
  id: string,
  name: string,
  role: "OWNER" | "ADMIN" | "CASHIER" | "MECHANIC",
  outletIds: string[],
  activeOutletId: string,
  deviceId?: string,
): AuthContext {
  return {
    user: {
      id,
      name,
      email: `${id}@example.com`,
      username: null,
      phone: "081200000099",
      role,
      businessId: BUSINESS_ID,
    },
    method: deviceId ? "bearer" : "web",
    activeOutletId,
    outletIds,
    outlets: outletIds.map((outletId) => ({
      id: outletId,
      name: outletId === OUTLET_B ? "Outlet Cabang" : "Outlet Pusat",
      isActive: true,
    })),
    idleTimeoutMinutes: 30,
    sessionExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    ...(deviceId ? { tokenId: deviceId } : {}),
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
  throw new Error(`Expected ${code} but the call resolved`);
}

async function stockOf(productId: string): Promise<number> {
  const [row] = await db
    .select({
      value: sql<string>`coalesce(sum(${tables.stockLedger.quantityAfter} - ${tables.stockLedger.quantityBefore}), 0)`,
    })
    .from(tables.stockLedger)
    .where(eq(tables.stockLedger.productId, productId));
  return Number(row?.value ?? "0");
}

async function auditRows(action: string, entityId?: string) {
  const conditions = [eq(tables.auditLog.action, action)];
  if (entityId) conditions.push(eq(tables.auditLog.entityId, entityId));
  return db.select().from(tables.auditLog).where(and(...conditions));
}

async function syncKeyRow(clientKey: string) {
  const [row] = await db
    .select()
    .from(tables.syncKeys)
    .where(
      and(
        eq(tables.syncKeys.businessId, BUSINESS_ID),
        eq(tables.syncKeys.clientKey, clientKey),
      ),
    )
    .limit(1);
  return row ?? null;
}

function offlineLine(
  overrides: Partial<SyncOrderLine> = {},
): SyncOrderLine {
  const line: SyncOrderLine = {
    lineType: "PRODUCT",
    catalogItemId: PRODUCT_BRK_ID,
    description: "Kampas rem depan",
    quantity: 1,
    unitPrice: "250000",
    taxAmount: "27500",
    lineTotal: "250000",
    ...overrides,
  };
  if (line.discountPercent !== undefined && line.discountAmount !== undefined) {
    delete line.discountAmount;
  }
  return line;
}

interface SaleTotals {
  subtotal: string;
  discountTotal?: string;
  taxTotal: string;
  total: string;
}

function totals(subtotal: string, taxRatePercent = 11): SaleTotals {
  const gross = BigInt(subtotal);
  const tax = (gross * BigInt(taxRatePercent) + 50n) / 100n;
  return {
    subtotal,
    taxTotal: tax.toString(),
    total: (gross + tax).toString(),
  };
}

function saleInput(
  options: {
    clientKey?: string;
    outletId?: string;
    lines?: SyncOrderLine[];
    customerId?: string | null;
    vehicleId?: string | null;
    deviceRecordedAt?: string;
    payments?: SyncApplyRequest["order"]["payments"];
    totals?: SaleTotals;
    taxRate?: number;
  } = {},
): SyncApplyRequest {
  const lines = options.lines ?? [offlineLine()];
  const computed = options.totals ?? totals(lines[0]?.lineTotal ?? "0");
  const paymentAmount =
    options.payments?.[0]?.amount ?? computed.total;
  return {
    clientKey: options.clientKey ?? randomUUID(),
    outletId: options.outletId ?? OUTLET_A,
    order: {
      kind: "SALE",
      customerId:
        options.customerId === undefined ? CUSTOMER_A_ID : options.customerId,
      vehicleId:
        options.vehicleId === undefined ? VEHICLE_ID : options.vehicleId,
      taxRate: options.taxRate ?? 11,
      subtotal: computed.subtotal,
      discountTotal: computed.discountTotal ?? "0",
      taxTotal: computed.taxTotal,
      total: computed.total,
      lines,
      payments:
        options.payments ??
        [{ method: "CASH", amount: paymentAmount, changeAmount: "0" }],
      deviceRecordedAt: options.deviceRecordedAt ?? new Date().toISOString(),
    },
  };
}

function filterSale(
  quantity: number,
  overrides: {
    clientKey?: string;
    deviceRecordedAt?: string;
    customerId?: string | null;
  } = {},
): SyncApplyRequest {
  const line = offlineLine({
    catalogItemId: PRODUCT_FILTER_ID,
    description: "Filter oli",
    quantity,
    unitPrice: "100000",
    taxAmount: ((100000n * BigInt(quantity) * 11n + 50n) / 100n).toString(),
    lineTotal: (100000n * BigInt(quantity)).toString(),
  });
  const computed = totals(line.lineTotal);
  return saleInput({
    ...overrides,
    lines: [line],
    totals: computed,
    payments: [{ method: "CASH", amount: computed.total, changeAmount: "0" }],
  });
}

beforeAll(async () => {
  testDatabaseName(TEST_DATABASE_URL);

  tables = await import("@workshop-pos/db");
  auth = await import("@workshop-pos/auth");
  sync = await import("../app/api/v1/sync/_lib/sync-service");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");

  await resetSchema();
  const client = tables.createDatabaseClient(TEST_DATABASE_URL);
  db = client.db;
  pool = client.pool;
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

  await db.insert(tables.businesses).values({
    id: BUSINESS_ID,
    name: "Bengkel Uji WP6.1",
  });
  await db.insert(tables.outlets).values([
    { id: OUTLET_A, businessId: BUSINESS_ID, name: "Outlet Pusat" },
    { id: OUTLET_B, businessId: BUSINESS_ID, name: "Outlet Cabang" },
  ]);
  await db.insert(tables.user).values([
    {
      id: OWNER_ID,
      name: "Rina Uji",
      email: "owner.wp61@example.com",
      businessId: BUSINESS_ID,
      role: "OWNER",
      phone: "081200000040",
    },
    {
      id: ADMIN_ID,
      name: "Andi Uji",
      email: "admin.wp61@example.com",
      businessId: BUSINESS_ID,
      role: "ADMIN",
      phone: "081200000041",
    },
    {
      id: CASHIER_A_ID,
      name: "Dewi Uji",
      email: "cashier.a.wp61@example.com",
      businessId: BUSINESS_ID,
      role: "CASHIER",
      phone: "081200000042",
    },
    {
      id: CASHIER_B_ID,
      name: "Sari Uji",
      email: "cashier.b.wp61@example.com",
      businessId: BUSINESS_ID,
      role: "CASHIER",
      phone: "081200000043",
    },
    {
      id: MECHANIC_ID,
      name: "Agus Uji",
      email: "mechanic.wp61@example.com",
      businessId: BUSINESS_ID,
      role: "MECHANIC",
      phone: "081200000044",
    },
  ]);
  await db.insert(tables.staffOutlets).values([
    { userId: OWNER_ID, outletId: OUTLET_A },
    { userId: OWNER_ID, outletId: OUTLET_B },
    { userId: ADMIN_ID, outletId: OUTLET_A },
    { userId: ADMIN_ID, outletId: OUTLET_B },
    { userId: CASHIER_A_ID, outletId: OUTLET_A },
    { userId: CASHIER_B_ID, outletId: OUTLET_B },
    { userId: MECHANIC_ID, outletId: OUTLET_A },
  ]);
  await db.insert(tables.settings).values([
    {
      businessId: BUSINESS_ID,
      outletId: OUTLET_A,
      taxRate: 11,
      cashierDiscountCapPercent: 0,
      receiptPaperWidth: 58,
      voidReasonMinLength: 10,
    },
    {
      businessId: BUSINESS_ID,
      outletId: OUTLET_B,
      taxRate: 11,
      cashierDiscountCapPercent: 0,
      receiptPaperWidth: 80,
      voidReasonMinLength: 10,
    },
  ]);
  const digest = (label: string) =>
    createHash("sha256").update(`${label}-${randomUUID()}`).digest("hex");
  await db.insert(tables.deviceTokens).values([
    {
      id: DEVICE_A_ID,
      userId: CASHIER_A_ID,
      outletId: OUTLET_A,
      tokenHash: digest("device-a"),
      label: "Perangkat kasir A",
      expiresAt: new Date(Date.now() + 86_400_000),
    },
    {
      id: DEVICE_B_ID,
      userId: CASHIER_B_ID,
      outletId: OUTLET_B,
      tokenHash: digest("device-b"),
      label: "Perangkat kasir B",
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  ]);
  await db.insert(tables.customers).values([
    { id: CUSTOMER_A_ID, businessId: BUSINESS_ID, name: "Budi Santoso", phone: "081234567890" },
    { id: CUSTOMER_B_ID, businessId: BUSINESS_ID, name: "Siti Aminah", phone: "081234567891" },
  ]);
  await db.insert(tables.vehicles).values({
    id: VEHICLE_ID,
    businessId: BUSINESS_ID,
    customerId: CUSTOMER_A_ID,
    normalizedPlate: "B1234XYZ",
    brand: "Honda",
    model: "Beat 110",
    odometer: 12450,
  });
  await db.insert(tables.products).values([
    {
      id: PRODUCT_BRK_ID,
      businessId: BUSINESS_ID,
      outletId: OUTLET_A,
      sku: "BRK-001",
      name: "Kampas rem depan",
      unit: "pcs",
      cost: 150_000n,
      price: 250_000n,
      lowStockThreshold: 5,
    },
    {
      id: PRODUCT_FILTER_ID,
      businessId: BUSINESS_ID,
      outletId: OUTLET_A,
      sku: "PRT-002",
      name: "Filter oli",
      unit: "pcs",
      cost: 40_000n,
      price: 100_000n,
    },
  ]);
  await db.insert(tables.services).values({
    id: SERVICE_OIL_ID,
    businessId: BUSINESS_ID,
    outletId: OUTLET_A,
    code: "SRV-001",
    name: "Ganti oli mesin",
    price: 50_000n,
    durationMinutes: 30,
  });
  await db.insert(tables.stockLedger).values([
    {
      businessId: BUSINESS_ID,
      outletId: OUTLET_A,
      productId: PRODUCT_BRK_ID,
      entryType: "STOCK_IN",
      quantityBefore: 0,
      quantityAfter: 20,
      sourceType: "STOCK_IN",
      reason: "Stok awal",
      createdBy: OWNER_ID,
    },
    {
      businessId: BUSINESS_ID,
      outletId: OUTLET_A,
      productId: PRODUCT_FILTER_ID,
      entryType: "STOCK_IN",
      quantityBefore: 0,
      quantityAfter: 1_000,
      sourceType: "STOCK_IN",
      reason: "Stok awal",
      createdBy: OWNER_ID,
    },
  ]);

  owner = makeContext(OWNER_ID, "Rina Uji", "OWNER", [OUTLET_A, OUTLET_B], OUTLET_A);
  admin = makeContext(ADMIN_ID, "Andi Uji", "ADMIN", [OUTLET_A, OUTLET_B], OUTLET_A);
  cashierA = makeContext(
    CASHIER_A_ID,
    "Dewi Uji",
    "CASHIER",
    [OUTLET_A],
    OUTLET_A,
    DEVICE_A_ID,
  );
  cashierB = makeContext(
    CASHIER_B_ID,
    "Sari Uji",
    "CASHIER",
    [OUTLET_B],
    OUTLET_B,
    DEVICE_B_ID,
  );
  mechanic = makeContext(
    MECHANIC_ID,
    "Agus Uji",
    "MECHANIC",
    [OUTLET_A],
    OUTLET_A,
  );
});

afterAll(async () => {
  await pool.end();
});

describe("POST /api/v1/sync — apply", () => {
  const appliedKey = "offline-sale-price-changed";
  let appliedInput: SyncApplyRequest;

  it("applies once at the local price, decrements stock, and records the device", async () => {
    const localRecordedAt = new Date(Date.now() - 10 * 60_000).toISOString();
    const input = saleInput({
      clientKey: appliedKey,
      deviceRecordedAt: localRecordedAt,
      lines: [
        offlineLine({
          unitPrice: "200000",
          taxAmount: "22000",
          lineTotal: "200000",
        }),
      ],
      totals: totals("200000"),
      payments: [{ method: "CASH", amount: "222000", changeAmount: "0" }],
    });
    appliedInput = input;

    const result = await sync.applySyncSale(db, cashierA, input);

    expect(result.state).toBe("APPLIED");
    expect(result.orderId).toBe(result.order?.id ?? null);
    expect(result.order?.status).toBe("PAID");
    expect(result.order?.total).toBe("222000");
    expect(result.order?.lines[0]?.unitPrice).toBe("200000");
    expect(result.order?.payments).toHaveLength(1);
    expect(result.order?.timeline.map((event) => event.toStatus)).toEqual([
      "DRAFT",
      "PAID",
    ]);
    // The report date is the server's; the device time is retained separately.
    expect(result.deviceRecordedAt).toBe(localRecordedAt);
    expect(
      new Date(result.order?.createdAt ?? 0).getTime(),
    ).toBeGreaterThan(new Date(localRecordedAt).getTime());
    expect(result.order?.paidAt).toBe(result.order?.createdAt);
    expect(result.notices.map((notice) => notice.code)).toContain(
      "PRICE_CHANGED",
    );

    expect(await stockOf(PRODUCT_BRK_ID)).toBe(19);

    const decrements = await db
      .select()
      .from(tables.stockLedger)
      .where(
        and(
          eq(tables.stockLedger.sourceId, result.orderId ?? ""),
          eq(tables.stockLedger.entryType, "SALE_DECREMENT"),
        ),
      );
    expect(decrements).toHaveLength(1);
    expect(decrements[0]?.quantityBefore).toBe(20);
    expect(decrements[0]?.quantityAfter).toBe(19);
    expect(decrements[0]?.override).toBe(false);

    const keyRow = await syncKeyRow(appliedKey);
    expect(keyRow?.state).toBe("APPLIED");
    expect(keyRow?.orderId).toBe(result.orderId);
    expect(keyRow?.deviceTokenId).toBe(DEVICE_A_ID);

    expect(await auditRows("sync.sale_applied", result.orderId ?? "")).toHaveLength(1);
  });

  it("returns the original result on replay without duplicate rows", async () => {
    const first = await sync.applySyncSale(db, cashierA, appliedInput);
    const second = await sync.applySyncSale(db, cashierA, appliedInput);

    expect(second.orderId).toBe(first.orderId);
    expect(second.attemptCount).toBe(3);
    expect(second.notices.map((notice) => notice.code)).toContain(
      "PRICE_CHANGED",
    );

    const orderRow = await db
      .select()
      .from(tables.orders)
      .where(eq(tables.orders.id, first.orderId ?? ""));
    expect(orderRow).toHaveLength(1);

    const orderPayments = await db
      .select()
      .from(tables.payments)
      .where(eq(tables.payments.orderId, first.orderId ?? ""));
    expect(orderPayments).toHaveLength(1);

    expect(await stockOf(PRODUCT_BRK_ID)).toBe(19);
    expect((await syncKeyRow(appliedKey))?.attemptCount).toBe(3);

    const changed = saleInput({
      clientKey: appliedKey,
      lines: [offlineLine({ unitPrice: "210000", taxAmount: "23100", lineTotal: "210000" })],
      totals: totals("210000"),
      payments: [{ method: "CASH", amount: "233100", changeAmount: "0" }],
    });
    const reused = await expectRejection(
      () => sync.applySyncSale(db, cashierA, changed),
      "CONFLICT",
    );
    expect(reused.message).toContain("transaksi yang berbeda");
  });
});

describe("conflict lifecycle", () => {
  const stockConflictKey = "offline-sale-stock-conflict";
  let conflictResult: SyncResult;
  let stockConflictInput: SyncApplyRequest;

  it("raises STOCK_INSUFFICIENT without writing an order or ledger row", async () => {
    const line = offlineLine({
      quantity: 15,
      unitPrice: "250000",
      taxAmount: "412500",
      lineTotal: "3750000",
    });
    const input = saleInput({
      clientKey: stockConflictKey,
      lines: [line, { ...line }],
      totals: totals("7500000"),
      payments: [{ method: "CASH", amount: "8325000", changeAmount: "0" }],
    });
    stockConflictInput = input;

    conflictResult = await sync.applySyncSale(db, cashierA, input);
    expect(conflictResult.state).toBe("CONFLICT");
    expect(conflictResult.conflict?.code).toBe("STOCK_INSUFFICIENT");
    expect(conflictResult.conflict?.localQuantity).toBe(30);
    expect(conflictResult.conflict?.serverQuantity).toBe(19);
    expect(conflictResult.conflict?.productName).toBe("Kampas rem depan");
    expect(conflictResult.order).toBeNull();

    const keyRow = await syncKeyRow(stockConflictKey);
    expect(keyRow?.state).toBe("CONFLICT");
    expect(keyRow?.conflictCode).toBe("STOCK_INSUFFICIENT");
    expect(keyRow?.orderId).toBeNull();

    expect(await stockOf(PRODUCT_BRK_ID)).toBe(19);
    const decrements = await db
      .select()
      .from(tables.stockLedger)
      .where(eq(tables.stockLedger.entryType, "SALE_DECREMENT"));
    expect(decrements).toHaveLength(1);

    await expectRejection(
      () => sync.listSyncConflicts(db, mechanic),
      "FORBIDDEN",
    );
    expect(await auditRows("rbac.denied", "sync.conflicts")).toHaveLength(1);

    const visible = await sync.listSyncConflicts(db, cashierA);
    const item = visible.items.find((entry) => entry.clientKey === stockConflictKey);
    expect(item?.conflict.localQuantity).toBe(30);
    expect(item?.conflict.serverQuantity).toBe(19);

    expect(await auditRows("sync.conflict_raised", stockConflictKey)).toHaveLength(1);
  });

  it("does not let one failing sale block the next queued sale", async () => {
    const nextKey = "offline-sale-after-conflict";
    const result = await sync.applySyncSale(
      db,
      cashierA,
      filterSale(1, { clientKey: nextKey }),
    );
    expect(result.state).toBe("APPLIED");
    expect(result.order?.status).toBe("PAID");
    expect((await syncKeyRow(nextKey))?.state).toBe("APPLIED");
  });

  it("applies an Admin override with an OVERRIDE ledger flag and clears the conflict", async () => {
    const resolved = await sync.resolveSyncConflict(db, admin, stockConflictKey, {
      action: "OVERRIDE",
      reason: "Stok fisik belum diinput",
    });

    expect(resolved.state).toBe("RESOLVED");
    expect(resolved.resolution).toBe("OVERRIDE");
    expect(resolved.order?.status).toBe("PAID");
    expect(resolved.order?.total).toBe("8325000");
    expect(resolved.order?.orderNumber).toMatch(/^INV\/\d{4}\/000003$/);
    // The resolving Admin is the override actor, but the sale stays attributed
    // to the cashier who captured it offline.
    expect(resolved.order?.createdByName).toBe("Dewi Uji");
    expect(resolved.order?.payments[0]?.createdByName).toBe("Dewi Uji");

    expect(await stockOf(PRODUCT_BRK_ID)).toBe(-11);
    const decrements = await db
      .select()
      .from(tables.stockLedger)
      .where(
        and(
          eq(tables.stockLedger.sourceId, resolved.orderId ?? ""),
          eq(tables.stockLedger.entryType, "SALE_DECREMENT"),
        ),
      );
    expect(decrements).toHaveLength(2);
    const flagged = decrements.filter((row) => row.override);
    expect(flagged).toHaveLength(1);
    expect(flagged[0]?.reason).toBe("Stok fisik belum diinput");
    expect(flagged[0]?.quantityAfter).toBe(-11);
    const unflagged = decrements.find((row) => !row.override);
    expect(unflagged?.quantityAfter).toBe(4);

    const keyRow = await syncKeyRow(stockConflictKey);
    expect(keyRow?.state).toBe("APPLIED");
    expect(keyRow?.resolvedAt).not.toBeNull();
    expect(keyRow?.resolvedBy).toBe(ADMIN_ID);

    const visible = await sync.listSyncConflicts(db, cashierA);
    expect(
      visible.items.some((item) => item.clientKey === stockConflictKey),
    ).toBe(false);

    expect(
      await auditRows("sync.conflict_resolved_override", stockConflictKey),
    ).toHaveLength(1);
    expect(
      await auditRows("sync.conflict_override", resolved.orderId ?? ""),
    ).toHaveLength(1);

    const replay = await sync.applySyncSale(db, cashierA, stockConflictInput);
    expect(replay.state).toBe("RESOLVED");
    expect(replay.orderId).toBe(resolved.orderId);
    expect(await stockOf(PRODUCT_BRK_ID)).toBe(-11);
  });

  it("voids a Cashier conflict with a cash refund and no stock movement", async () => {
    const voidKey = "offline-sale-void-conflict";
    const input = saleInput({ clientKey: voidKey });
    const conflict = await sync.applySyncSale(db, cashierA, input);
    expect(conflict.state).toBe("CONFLICT");
    expect(conflict.conflict?.code).toBe("STOCK_INSUFFICIENT");
    expect(conflict.conflict?.serverQuantity).toBe(-11);

    // A Mechanic has no sale/void capability; a Cashier may void the queued
    // sale and record the refund (PRD AC15.3).
    const denied = await expectRejection(
      () =>
        sync.resolveSyncConflict(db, mechanic, voidKey, {
          action: "VOID",
          reason: "Barang tidak tersedia, uang dikembalikan",
        }),
      "FORBIDDEN",
    );
    expect(denied.message).toContain("penjualan");
    expect(await auditRows("rbac.denied", voidKey)).toHaveLength(1);
    expect((await syncKeyRow(voidKey))?.resolvedAt).toBeNull();

    const resolved = await sync.resolveSyncConflict(db, cashierA, voidKey, {
      action: "VOID",
      reason: "Barang tidak tersedia, uang dikembalikan",
    });
    expect(resolved.state).toBe("RESOLVED");
    expect(resolved.resolution).toBe("VOID");
    expect(resolved.order?.status).toBe("VOID");
    expect(resolved.order?.voidReason).toBe(
      "Barang tidak tersedia, uang dikembalikan",
    );
    expect(resolved.order?.payments).toHaveLength(1);
    expect(resolved.order?.refunds).toHaveLength(1);
    expect(resolved.order?.refunds[0]?.amount).toBe("277500");
    expect(resolved.order?.refunds[0]?.method).toBe("CASH");
    expect(resolved.order?.timeline.map((event) => event.toStatus)).toEqual([
      "DRAFT",
      "VOID",
    ]);

    expect(await stockOf(PRODUCT_BRK_ID)).toBe(-11);
    const decrements = await db
      .select()
      .from(tables.stockLedger)
      .where(eq(tables.stockLedger.sourceId, resolved.orderId ?? ""));
    expect(decrements).toHaveLength(0);

    const keyRow = await syncKeyRow(voidKey);
    expect(keyRow?.state).toBe("CONFLICT");
    expect(keyRow?.resolvedAt).not.toBeNull();
    expect(keyRow?.resolvedBy).toBe(CASHIER_A_ID);
    expect(
      (await sync.listSyncConflicts(db, cashierA)).items.some(
        (item) => item.clientKey === voidKey,
      ),
    ).toBe(false);

    expect(
      await auditRows("sync.conflict_resolved_void", voidKey),
    ).toHaveLength(1);
    expect(
      await auditRows("sync.conflict_void", resolved.orderId ?? ""),
    ).toHaveLength(1);
  });
});

describe("scoping and conflict codes", () => {
  it("denies a device pinned to another outlet and audits it", async () => {
    const input = saleInput({ clientKey: "offline-sale-cross-outlet-device" });
    await expectRejection(
      () => sync.applySyncSale(db, cashierB, input),
      "FORBIDDEN",
    );

    const audit = await auditRows(
      "rbac.cross_outlet_denied",
      "offline-sale-cross-outlet-device",
    );
    expect(audit).toHaveLength(1);
    expect(await syncKeyRow("offline-sale-cross-outlet-device")).toBeNull();
  });

  it("raises PLATE_REASSIGNED and re-links only on an explicit override", async () => {
    await db
      .update(tables.vehicles)
      .set({ customerId: CUSTOMER_B_ID })
      .where(eq(tables.vehicles.id, VEHICLE_ID));

    const key = "offline-sale-plate-reassigned";
    const input = filterSale(1, { clientKey: key, customerId: CUSTOMER_A_ID });
    const conflict = await sync.applySyncSale(db, cashierA, input);
    expect(conflict.state).toBe("CONFLICT");
    expect(conflict.conflict?.code).toBe("PLATE_REASSIGNED");
    expect(conflict.conflict?.plate).toBe("B1234XYZ");
    expect(await stockOf(PRODUCT_FILTER_ID)).toBe(999);

    const [vehicleBefore] = await db
      .select({ customerId: tables.vehicles.customerId })
      .from(tables.vehicles)
      .where(eq(tables.vehicles.id, VEHICLE_ID));
    expect(vehicleBefore?.customerId).toBe(CUSTOMER_B_ID);

    const resolved = await sync.resolveSyncConflict(db, owner, key, {
      action: "OVERRIDE",
      reason: "Pelanggan kendaraan sudah diperbarui",
    });
    expect(resolved.state).toBe("RESOLVED");
    expect(resolved.order?.customer?.id).toBe(CUSTOMER_B_ID);
    expect(await stockOf(PRODUCT_FILTER_ID)).toBe(998);

    const [vehicleAfter] = await db
      .select({ customerId: tables.vehicles.customerId })
      .from(tables.vehicles)
      .where(eq(tables.vehicles.id, VEHICLE_ID));
    expect(vehicleAfter?.customerId).toBe(CUSTOMER_B_ID);
  });

  it("voids a PLATE_REASSIGNED conflict without re-linking or touching stock", async () => {
    const key = "offline-sale-plate-void";
    const input = filterSale(1, { clientKey: key, customerId: CUSTOMER_A_ID });
    const conflict = await sync.applySyncSale(db, cashierA, input);
    expect(conflict.state).toBe("CONFLICT");
    expect(conflict.conflict?.code).toBe("PLATE_REASSIGNED");

    const resolved = await sync.resolveSyncConflict(db, admin, key, {
      action: "VOID",
      reason: "Pelanggan memilih pembatalan",
    });
    expect(resolved.state).toBe("RESOLVED");
    expect(resolved.order?.status).toBe("VOID");
    expect(resolved.order?.customer?.id).toBe(CUSTOMER_A_ID);
    expect(resolved.order?.refunds).toHaveLength(1);
    expect(await stockOf(PRODUCT_FILTER_ID)).toBe(998);

    const [vehicle] = await db
      .select({ customerId: tables.vehicles.customerId })
      .from(tables.vehicles)
      .where(eq(tables.vehicles.id, VEHICLE_ID));
    expect(vehicle?.customerId).toBe(CUSTOMER_B_ID);
  });

  it("resolves a PLATE conflict that is also short on stock after re-confirming", async () => {
    const key = "offline-sale-plate-and-stock";
    const input = saleInput({ clientKey: key, customerId: CUSTOMER_A_ID });

    const conflict = await sync.applySyncSale(db, cashierA, input);
    expect(conflict.conflict?.code).toBe("PLATE_REASSIGNED");

    const resolved = await sync.resolveSyncConflict(db, owner, key, {
      action: "OVERRIDE",
      reason: "Pelanggan sudah dikonfirmasi dan stok fisik tersedia",
    });
    expect(resolved.state).toBe("RESOLVED");
    expect(resolved.order?.customer?.id).toBe(CUSTOMER_B_ID);
    expect(await stockOf(PRODUCT_BRK_ID)).toBe(-12);

    const decrements = await db
      .select()
      .from(tables.stockLedger)
      .where(
        and(
          eq(tables.stockLedger.sourceId, resolved.orderId ?? ""),
          eq(tables.stockLedger.entryType, "SALE_DECREMENT"),
        ),
      );
    expect(decrements).toHaveLength(1);
    expect(decrements[0]?.override).toBe(true);
  });

  it("scopes a bearer device's conflict list to its pinned outlet", async () => {
    await db.insert(tables.syncKeys).values({
      businessId: BUSINESS_ID,
      outletId: OUTLET_B,
      clientKey: "offline-outlet-b-visible",
      state: "CONFLICT",
      conflictCode: "STOCK_INSUFFICIENT",
      deviceRecordedAt: new Date(),
      attemptCount: 1,
      lastAttemptAt: new Date(),
    });

    const floating: AuthContext = {
      ...cashierA,
      method: "bearer",
      outletIds: [OUTLET_A, OUTLET_B],
      outlets: [
        { id: OUTLET_A, name: "Outlet Pusat", isActive: true },
        { id: OUTLET_B, name: "Outlet Cabang", isActive: true },
      ],
      activeOutletId: OUTLET_A,
    };
    const pinned = await sync.listSyncConflicts(db, floating);
    expect(
      pinned.items.some((item) => item.clientKey === "offline-outlet-b-visible"),
    ).toBe(false);

    const webView = await sync.listSyncConflicts(db, {
      ...floating,
      method: "web",
    });
    expect(
      webView.items.some((item) => item.clientKey === "offline-outlet-b-visible"),
    ).toBe(true);
  });

  it("flags a sale synced after the business date rolled over for cash reporting", async () => {
    const key = "offline-sale-cash-reporting";
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const result = await sync.applySyncSale(
      db,
      cashierA,
      filterSale(1, {
        clientKey: key,
        deviceRecordedAt: yesterday,
        customerId: CUSTOMER_B_ID,
      }),
    );

    expect(result.state).toBe("APPLIED");
    expect(result.notices.map((notice) => notice.code)).toContain(
      "CASH_REPORTING",
    );
    expect(result.deviceRecordedAt).toBe(yesterday);
    expect(result.order?.createdAt).not.toBe(yesterday);
    expect(await auditRows("sync.cash_reporting_flagged", result.orderId ?? "")).toHaveLength(1);
    expect(await stockOf(PRODUCT_FILTER_ID)).toBe(997);
  });
});

describe("validation", () => {
  it("rejects a payment set that does not settle the locally recorded total", async () => {
    const key = "offline-sale-unsettled";
    const input = saleInput({
      clientKey: key,
      lines: [offlineLine()],
      totals: totals("250000"),
      payments: [{ method: "CASH", amount: "100000", changeAmount: "0" }],
    });
    const rejection = await expectRejection(
      () => sync.applySyncSale(db, cashierA, input),
      "VALIDATION_ERROR",
    );
    expect(rejection.fieldErrors?.["order.payments"]?.join(" ")).toContain(
      "tidak sama dengan total",
    );
    expect(await syncKeyRow(key)).toBeNull();
  });

  it("rejects local tax arithmetic that does not match the local rate", async () => {
    const key = "offline-sale-bad-tax";
    const input = saleInput({
      clientKey: key,
      lines: [offlineLine({ taxAmount: "999", lineTotal: "250000" })],
      totals: { subtotal: "250000", taxTotal: "27500", total: "277500" },
      payments: [{ method: "CASH", amount: "277500", changeAmount: "0" }],
    });
    const rejection = await expectRejection(
      () => sync.applySyncSale(db, cashierA, input),
      "VALIDATION_ERROR",
    );
    expect(rejection.fieldErrors?.["order.lines.0.taxAmount"]).toBeTruthy();
    expect(await syncKeyRow(key)).toBeNull();
  });
});

describe("offline money deviations and key collisions", () => {
  it("applies a discount above the cashier cap but records the deviation", async () => {
    const key = "offline-sale-discount-cap";
    const line = offlineLine({
      catalogItemId: PRODUCT_FILTER_ID,
      description: "Filter oli",
      quantity: 1,
      unitPrice: "100000",
      discountPercent: 50,
      taxAmount: "5500",
      lineTotal: "50000",
    });
    const input = saleInput({
      clientKey: key,
      customerId: CUSTOMER_B_ID,
      lines: [line],
      totals: {
        subtotal: "100000",
        discountTotal: "50000",
        taxTotal: "5500",
        total: "55500",
      },
      payments: [{ method: "CASH", amount: "55500", changeAmount: "0" }],
    });

    const result = await sync.applySyncSale(db, cashierA, input);
    expect(result.state).toBe("APPLIED");
    expect(result.order?.discountTotal).toBe("50000");
    const audit = await auditRows("sync.discount_above_cap", result.orderId ?? "");
    expect(audit).toHaveLength(1);
    expect(audit[0]?.after).toMatchObject({ capPercent: 0, authorized: false });
  });

  it("applies a locally recorded tax rate but records the setting mismatch", async () => {
    const key = "offline-sale-tax-mismatch";
    const line = offlineLine({
      catalogItemId: PRODUCT_FILTER_ID,
      description: "Filter oli",
      quantity: 1,
      unitPrice: "100000",
      taxAmount: "0",
      lineTotal: "100000",
    });
    const input = saleInput({
      clientKey: key,
      customerId: CUSTOMER_B_ID,
      lines: [line],
      taxRate: 0,
      totals: { subtotal: "100000", taxTotal: "0", total: "100000" },
      payments: [{ method: "CASH", amount: "100000", changeAmount: "0" }],
    });

    const result = await sync.applySyncSale(db, cashierA, input);
    expect(result.state).toBe("APPLIED");
    expect(result.order?.taxRate).toBe(0);
    expect(result.order?.total).toBe("100000");
    const audit = await auditRows("sync.tax_rate_mismatch", result.orderId ?? "");
    expect(audit).toHaveLength(1);
    expect(audit[0]?.after).toMatchObject({ deviceRate: 0, settingRate: 11 });
  });

  it("maps an idempotency-key collision to a stable conflict without a sale", async () => {
    const key = "collision-key-0001";
    await db.insert(tables.idempotencyKeys).values({
      businessId: BUSINESS_ID,
      key: `sync:${key}`,
      operation: "order.create",
      requestHash: "a".repeat(64),
      completedAt: new Date(),
    });

    const stockBefore = await stockOf(PRODUCT_FILTER_ID);
    const rejection = await expectRejection(
      () =>
        sync.applySyncSale(
          db,
          cashierA,
          filterSale(1, { clientKey: key, customerId: CUSTOMER_B_ID }),
        ),
      "CONFLICT",
    );
    expect(rejection.message).toContain("bertabrakan");
    expect(await syncKeyRow(key)).toBeNull();
    expect(await stockOf(PRODUCT_FILTER_ID)).toBe(stockBefore);
  });
});
