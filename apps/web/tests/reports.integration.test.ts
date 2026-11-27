import { fileURLToPath } from "node:url";

import { and, eq, sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthContext, AuthError } from "@workshop-pos/auth";
import type { Database } from "@workshop-pos/db";

import type * as AuthModule from "@workshop-pos/auth";
import type * as AuditModule from "../lib/audit-service";
import type * as DbModule from "@workshop-pos/db";
import type * as ExportModule from "../lib/export-csv";
import type * as ReportModule from "../lib/report-service";
import type * as SettingsModule from "../lib/settings-service";

/**
 * WP8 report, export, audit, and settings integration coverage.
 *
 * The file owns its schema lifecycle (drop, migrate, synthetic tenancy) and
 * refuses a database whose name does not end `_test`. Every money assertion is
 * an exact integer recomputed from the fixture rows below.
 */

const TEST_DATABASE_URL =
  process.env.INTEGRATION_DATABASE_URL ??
  "postgresql://workshop:workshop@127.0.0.1:55432/workshop_pos_test";
process.env.INTEGRATION_DATABASE_URL = TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DATABASE_URL;

const MIGRATIONS_FOLDER = fileURLToPath(
  new URL("../../../packages/db/drizzle", import.meta.url),
);

function assertTestDatabase(url: string): void {
  const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  if (!name.endsWith("_test")) {
    throw new Error(`This integration file refuses database "${name}"`);
  }
}

const BUSINESS_ID = "b8000000-0000-4000-8000-000000000001";
const OUTLET_A = "b8000000-0000-4000-8000-000000000002";
const OUTLET_B = "b8000000-0000-4000-8000-000000000003";
const SETTINGS_A = "b8000000-0000-4000-8000-000000000004";

const OWNER_ID = "wp8_owner";
const ADMIN_ID = "wp8_admin";
const CASHIER_A_ID = "wp8_cashier_a";
const MECHANIC_ID = "wp8_mechanic";

const CUSTOMER_ID = "c8000000-0000-4000-8000-000000000001";
const VEHICLE_ID = "c8000000-0000-4000-8000-000000000002";
const P1 = "c8000000-0000-4000-8000-000000000003";
const P2 = "c8000000-0000-4000-8000-000000000004";
const P3 = "c8000000-0000-4000-8000-000000000005";
const S1 = "c8000000-0000-4000-8000-000000000006";
const S2 = "c8000000-0000-4000-8000-000000000007";

const O1 = "d8000000-0000-4000-8000-000000000001";
const O2 = "d8000000-0000-4000-8000-000000000002";
const O3 = "d8000000-0000-4000-8000-000000000003";
const O4 = "d8000000-0000-4000-8000-000000000004";
const O5 = "d8000000-0000-4000-8000-000000000005";
const O6 = "d8000000-0000-4000-8000-000000000006";
const O7 = "d8000000-0000-4000-8000-000000000007";
const O8 = "d8000000-0000-4000-8000-000000000008";

const L1 = "e8000000-0000-4000-8000-000000000001";
const L2 = "e8000000-0000-4000-8000-000000000002";
const PAY1 = "f8000000-0000-4000-8000-000000000001";

const DATE = "2026-11-27";
const PRIOR = "2026-11-26";

let db: Database;
let pool: Pool;
let tables: typeof DbModule;
let auth: typeof AuthModule;
let reports: typeof ReportModule;
let audit: typeof AuditModule;
let settingsService: typeof SettingsModule;
let exporter: typeof ExportModule;

let owner: AuthContext;
let admin: AuthContext;
let cashierA: AuthContext;

function makeContext(
  id: string,
  name: string,
  role: "OWNER" | "ADMIN" | "CASHIER" | "MECHANIC",
  outletIds: string[],
  activeOutletId: string,
  businessId: string = BUSINESS_ID,
): AuthContext {
  return {
    user: {
      id,
      name,
      email: `${id}@example.com`,
      username: null,
      phone: "081200000080",
      role,
      businessId,
    },
    method: "web",
    activeOutletId,
    outletIds,
    outlets: outletIds.map((outletId) => ({
      id: outletId,
      name: outletId === OUTLET_B ? "Outlet Cabang" : "Outlet Pusat",
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
  throw new Error(`Expected ${code} but the call resolved`);
}

beforeAll(async () => {
  assertTestDatabase(TEST_DATABASE_URL);

  tables = await import("@workshop-pos/db");
  auth = await import("@workshop-pos/auth");
  reports = await import("../lib/report-service");
  audit = await import("../lib/audit-service");
  settingsService = await import("../lib/settings-service");
  exporter = await import("../lib/export-csv");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");

  await resetSchema();
  const client = tables.createDatabaseClient(TEST_DATABASE_URL);
  db = client.db;
  pool = client.pool;
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

  await db.insert(tables.businesses).values({ id: BUSINESS_ID, name: "Bengkel Uji WP8" });
  await db.insert(tables.outlets).values([
    { id: OUTLET_A, businessId: BUSINESS_ID, name: "Outlet Pusat" },
    { id: OUTLET_B, businessId: BUSINESS_ID, name: "Outlet Cabang" },
  ]);
  await db.insert(tables.user).values([
    {
      id: OWNER_ID,
      name: "Rina Uji",
      email: "owner.wp8@example.com",
      businessId: BUSINESS_ID,
      role: "OWNER",
      phone: "081200000081",
    },
    {
      id: ADMIN_ID,
      name: "Andi Uji",
      email: "admin.wp8@example.com",
      businessId: BUSINESS_ID,
      role: "ADMIN",
      phone: "081200000082",
    },
    {
      id: CASHIER_A_ID,
      name: "Dewi Uji",
      email: "cashier.wp8@example.com",
      businessId: BUSINESS_ID,
      role: "CASHIER",
      phone: "081200000083",
    },
    {
      id: MECHANIC_ID,
      name: "Agus Uji",
      email: "mechanic.wp8@example.com",
      businessId: BUSINESS_ID,
      role: "MECHANIC",
      phone: "081200000084",
    },
  ]);
  await db.insert(tables.settings).values({
    id: SETTINGS_A,
    businessId: BUSINESS_ID,
    outletId: OUTLET_A,
  });
  await db.insert(tables.settings).values({
    businessId: BUSINESS_ID,
    outletId: OUTLET_B,
  });

  await db.insert(tables.customers).values({
    id: CUSTOMER_ID,
    businessId: BUSINESS_ID,
    name: "Pelanggan Uji",
    phone: "081234567899",
  });
  await db.insert(tables.vehicles).values({
    id: VEHICLE_ID,
    businessId: BUSINESS_ID,
    customerId: CUSTOMER_ID,
    normalizedPlate: "B8000UJI",
    brand: "Honda",
    model: "Beat",
  });
  await db.insert(tables.products).values([
    {
      id: P1,
      businessId: BUSINESS_ID,
      outletId: OUTLET_A,
      sku: "BRK-801",
      name: "Kampas rem",
      cost: 150_000n,
      price: 250_000n,
    },
    {
      id: P2,
      businessId: BUSINESS_ID,
      outletId: OUTLET_A,
      sku: "OLI-802",
      name: "Oli mesin",
      cost: 50_000n,
      price: 100_000n,
    },
    {
      id: P3,
      businessId: BUSINESS_ID,
      outletId: OUTLET_A,
      sku: "LMP-803",
      name: "Lampu, depan",
      cost: 10_000n,
      price: 75_000n,
    },
  ]);
  await db.insert(tables.services).values([
    {
      id: S1,
      businessId: BUSINESS_ID,
      outletId: OUTLET_A,
      code: "SRV-801",
      name: "Ganti oli",
      price: 50_000n,
      durationMinutes: 30,
    },
    {
      id: S2,
      businessId: BUSINESS_ID,
      outletId: OUTLET_A,
      code: "SRV-802",
      name: "Servis besar",
      price: 100_000n,
      durationMinutes: 60,
    },
  ]);

  await db.execute(
    sql`ALTER TABLE public.stock_ledger DISABLE TRIGGER stock_ledger_server_created_at`,
  );
  await db.insert(tables.stockLedger).values([
    {
      businessId: BUSINESS_ID,
      outletId: OUTLET_A,
      productId: P1,
      entryType: "STOCK_IN",
      quantityBefore: 0,
      quantityAfter: 20,
      sourceType: "STOCK_IN",
      reason: "Stok awal",
      createdBy: OWNER_ID,
      createdAt: new Date("2026-11-26T03:00:00.000Z"),
    },
    {
      businessId: BUSINESS_ID,
      outletId: OUTLET_A,
      productId: P2,
      entryType: "STOCK_IN",
      quantityBefore: 0,
      quantityAfter: 5,
      sourceType: "STOCK_IN",
      reason: "Stok awal",
      createdBy: OWNER_ID,
      createdAt: new Date("2026-11-26T03:00:00.000Z"),
    },
    {
      businessId: BUSINESS_ID,
      outletId: OUTLET_A,
      productId: P3,
      entryType: "STOCK_IN",
      quantityBefore: 0,
      quantityAfter: 1,
      sourceType: "STOCK_IN",
      reason: "Stok awal",
      createdBy: OWNER_ID,
      createdAt: new Date("2026-11-26T03:00:00.000Z"),
    },
  ]);

  await db.insert(tables.orders).values([
    {
      id: O1,
      businessId: BUSINESS_ID,
      outletId: OUTLET_A,
      kind: "SALE",
      status: "DRAFT",
      orderNumber: "INV-801",
      technicianId: MECHANIC_ID,
      taxRate: 11,
      subtotal: 300_000n,
      discountTotal: 30_000n,
      taxTotal: 29_700n,
      total: 299_700n,
      paidAt: new Date("2026-11-27T03:05:00.000Z"),
      completedAt: new Date("2026-11-27T02:00:00.000Z"),
      createdBy: CASHIER_A_ID,
      createdAt: new Date("2026-11-27T02:00:00.000Z"),
    },
    {
      id: O2,
      businessId: BUSINESS_ID,
      outletId: OUTLET_A,
      kind: "SALE",
      status: "DRAFT",
      orderNumber: "INV-802",
      taxRate: 0,
      subtotal: 100_000n,
      discountTotal: 0n,
      taxTotal: 0n,
      total: 100_000n,
      paidAt: new Date("2026-11-27T04:00:00.000Z"),
      createdBy: ADMIN_ID,
      createdAt: new Date("2026-11-27T04:00:00.000Z"),
    },
    {
      id: O3,
      businessId: BUSINESS_ID,
      outletId: OUTLET_A,
      kind: "SALE",
      status: "DRAFT",
      orderNumber: "INV-803",
      technicianId: MECHANIC_ID,
      taxRate: 0,
      subtotal: 100_000n,
      discountTotal: 0n,
      taxTotal: 0n,
      total: 100_000n,
      paidAt: new Date("2026-11-27T05:00:00.000Z"),
      completedAt: new Date("2026-11-27T04:30:00.000Z"),
      createdBy: CASHIER_A_ID,
      createdAt: new Date("2026-11-27T04:20:00.000Z"),
    },
    {
      id: O4,
      businessId: BUSINESS_ID,
      outletId: OUTLET_A,
      kind: "SALE",
      status: "DRAFT",
      orderNumber: "INV-804",
      taxRate: 0,
      subtotal: 75_000n,
      discountTotal: 0n,
      taxTotal: 0n,
      total: 75_000n,
      paidAt: new Date("2026-11-27T06:00:00.000Z"),
      voidedAt: new Date("2026-11-27T07:00:00.000Z"),
      voidReason: "Salah input pelanggan",
      createdBy: CASHIER_A_ID,
      createdAt: new Date("2026-11-27T05:50:00.000Z"),
    },
    {
      id: O5,
      businessId: BUSINESS_ID,
      outletId: OUTLET_A,
      kind: "SERVICE",
      status: "DRAFT",
      orderNumber: "INV-805",
      customerId: CUSTOMER_ID,
      vehicleId: VEHICLE_ID,
      technicianId: MECHANIC_ID,
      taxRate: 0,
      subtotal: 50_000n,
      discountTotal: 0n,
      taxTotal: 0n,
      total: 50_000n,
      completedAt: new Date("2026-11-27T08:00:00.000Z"),
      createdBy: ADMIN_ID,
      createdAt: new Date("2026-11-27T07:00:00.000Z"),
    },
    {
      id: O6,
      businessId: BUSINESS_ID,
      outletId: OUTLET_A,
      kind: "SALE",
      status: "DRAFT",
      orderNumber: "INV-806",
      taxRate: 0,
      subtotal: 10_000n,
      discountTotal: 0n,
      taxTotal: 0n,
      total: 10_000n,
      createdBy: CASHIER_A_ID,
      createdAt: new Date("2026-11-27T09:00:00.000Z"),
    },
    {
      id: O7,
      businessId: BUSINESS_ID,
      outletId: OUTLET_A,
      kind: "SALE",
      status: "DRAFT",
      orderNumber: "INV-807",
      taxRate: 0,
      subtotal: 999_999n,
      discountTotal: 0n,
      taxTotal: 0n,
      total: 999_999n,
      paidAt: new Date("2026-11-26T03:00:00.000Z"),
      createdBy: CASHIER_A_ID,
      createdAt: new Date("2026-11-26T03:00:00.000Z"),
    },
    {
      id: O8,
      businessId: BUSINESS_ID,
      outletId: OUTLET_B,
      kind: "SALE",
      status: "DRAFT",
      orderNumber: "INV-808",
      taxRate: 0,
      subtotal: 500_000n,
      discountTotal: 0n,
      taxTotal: 0n,
      total: 500_000n,
      paidAt: new Date("2026-11-27T03:00:00.000Z"),
      createdBy: OWNER_ID,
      createdAt: new Date("2026-11-27T03:00:00.000Z"),
    },
  ]);

  await db.insert(tables.orderLines).values([
    {
      id: L1,
      orderId: O1,
      lineType: "PRODUCT",
      productId: P1,
      description: "Kampas rem",
      quantity: 1,
      unitPrice: 250_000n,
      discountAmount: 0n,
      taxAmount: 24_750n,
      lineTotal: 250_000n,
      sortOrder: 1,
    },
    {
      id: L2,
      orderId: O1,
      lineType: "SERVICE",
      serviceId: S1,
      description: "Ganti oli",
      quantity: 1,
      unitPrice: 50_000n,
      discountAmount: 0n,
      taxAmount: 4_950n,
      lineTotal: 50_000n,
      sortOrder: 2,
      technicianId: MECHANIC_ID,
    },
    {
      orderId: O2,
      lineType: "PRODUCT",
      productId: P2,
      description: "Oli mesin",
      quantity: 1,
      unitPrice: 100_000n,
      discountAmount: 0n,
      taxAmount: 0n,
      lineTotal: 100_000n,
      sortOrder: 1,
    },
    {
      orderId: O3,
      lineType: "SERVICE",
      serviceId: S2,
      description: "Servis besar",
      quantity: 1,
      unitPrice: 100_000n,
      discountAmount: 0n,
      taxAmount: 0n,
      lineTotal: 100_000n,
      sortOrder: 1,
      technicianId: MECHANIC_ID,
    },
    {
      orderId: O4,
      lineType: "PRODUCT",
      productId: P3,
      description: "Lampu, depan",
      quantity: 1,
      unitPrice: 75_000n,
      discountAmount: 0n,
      taxAmount: 0n,
      lineTotal: 75_000n,
      sortOrder: 1,
    },
    {
      orderId: O5,
      lineType: "SERVICE",
      serviceId: S1,
      description: "Ganti oli",
      quantity: 1,
      unitPrice: 50_000n,
      discountAmount: 0n,
      taxAmount: 0n,
      lineTotal: 50_000n,
      sortOrder: 1,
      technicianId: MECHANIC_ID,
    },
    {
      orderId: O6,
      lineType: "PRODUCT",
      productId: P3,
      description: "Lampu, depan",
      quantity: 1,
      unitPrice: 10_000n,
      discountAmount: 0n,
      taxAmount: 0n,
      lineTotal: 10_000n,
      sortOrder: 1,
    },
  ]);

  await db.insert(tables.payments).values([
    {
      id: PAY1,
      orderId: O1,
      method: "CASH",
      amount: 299_700n,
      changeAmount: 300n,
      receivedAt: new Date("2026-11-27T03:05:00.000Z"),
      createdBy: CASHIER_A_ID,
    },
    {
      orderId: O2,
      method: "TRANSFER",
      amount: 100_000n,
      receivedAt: new Date("2026-11-27T04:00:00.000Z"),
      createdBy: ADMIN_ID,
    },
    {
      orderId: O3,
      method: "CASH",
      amount: 50_000n,
      receivedAt: new Date("2026-11-27T05:00:00.000Z"),
      createdBy: CASHIER_A_ID,
    },
    {
      orderId: O3,
      method: "QRIS",
      amount: 50_000n,
      receivedAt: new Date("2026-11-27T05:00:00.000Z"),
      createdBy: CASHIER_A_ID,
    },
    {
      orderId: O4,
      method: "CASH",
      amount: 75_000n,
      receivedAt: new Date("2026-11-27T06:00:00.000Z"),
      createdBy: CASHIER_A_ID,
    },
    {
      orderId: O7,
      method: "CASH",
      amount: 999_999n,
      receivedAt: new Date("2026-11-26T03:00:00.000Z"),
      createdBy: CASHIER_A_ID,
    },
    {
      orderId: O8,
      method: "CASH",
      amount: 500_000n,
      receivedAt: new Date("2026-11-27T03:00:00.000Z"),
      createdBy: OWNER_ID,
    },
  ]);

  const o4Payment = (
    await db.select({ id: tables.payments.id }).from(tables.payments).where(
      and(eq(tables.payments.orderId, O4), eq(tables.payments.method, "CASH")),
    ).limit(1)
  )[0];
  if (!o4Payment) throw new Error("Void fixture payment missing");

  await db.insert(tables.stockLedger).values({
    businessId: BUSINESS_ID,
    outletId: OUTLET_A,
    productId: P1,
    entryType: "SALE_DECREMENT",
    quantityBefore: 20,
    quantityAfter: 19,
    sourceType: "ORDER",
    sourceId: O1,
    orderLineId: L1,
    createdBy: CASHIER_A_ID,
    createdAt: new Date("2026-11-27T03:00:00.000Z"),
  });
  await db.execute(
    sql`ALTER TABLE public.stock_ledger ENABLE TRIGGER stock_ledger_server_created_at`,
  );

  for (const orderId of [O1, O2, O3, O7, O8, O4]) {
    await db
      .update(tables.orders)
      .set({ status: "PAID" })
      .where(eq(tables.orders.id, orderId));
  }
  await db
    .update(tables.orders)
    .set({ status: "COMPLETED" })
    .where(eq(tables.orders.id, O5));

  await db.insert(tables.refunds).values({
    orderId: O4,
    paymentId: o4Payment.id,
    method: "CASH",
    amount: 75_000n,
    reason: "Void transaksi",
    refundedAt: new Date("2026-11-27T07:00:00.000Z"),
    createdBy: OWNER_ID,
    createdAt: new Date("2026-11-27T07:00:00.000Z"),
  });
  await db
    .update(tables.orders)
    .set({ status: "VOID" })
    .where(eq(tables.orders.id, O4));

  owner = makeContext(OWNER_ID, "Rina Uji", "OWNER", [OUTLET_A, OUTLET_B], OUTLET_A);
  admin = makeContext(ADMIN_ID, "Andi Uji", "ADMIN", [OUTLET_A, OUTLET_B], OUTLET_A);
  cashierA = makeContext(CASHIER_A_ID, "Dewi Uji", "CASHIER", [OUTLET_A], OUTLET_A);
});

afterAll(async () => {
  await pool?.end().catch(() => undefined);
});

describe("daily sales report (FR-060, FR-068)", () => {
  it("recomputes gross, discounts, tax, net, and status counts exactly", async () => {
    const report = await reports.getDailySalesReport(db, owner, {
      from: DATE,
      to: DATE,
      outletId: OUTLET_A,
    });
    const day = report.days[0];
    expect(day?.figures).toEqual({
      orderCount: 3,
      grossSales: "500000",
      discounts: "30000",
      tax: "29700",
      netSales: "499700",
    });
    expect(day?.countsByStatus).toEqual({
      DRAFT: 1,
      ESTIMATED: 0,
      APPROVED: 0,
      IN_PROGRESS: 0,
      COMPLETED: 1,
      PAID: 3,
      VOID: 1,
    });
    expect(report.totals.figures.netSales).toBe("499700");
  });

  it("shows explicit zeros for an empty date and never leaks another outlet", async () => {
    const empty = await reports.getDailySalesReport(db, owner, {
      from: "2026-12-10",
      to: "2026-12-10",
      outletId: OUTLET_A,
    });
    expect(empty.days[0]?.figures).toEqual({
      orderCount: 0,
      grossSales: "0",
      discounts: "0",
      tax: "0",
      netSales: "0",
    });
    expect(empty.days[0]?.countsByStatus.PAID).toBe(0);

    const outletB = await reports.getDailySalesReport(db, owner, {
      from: DATE,
      to: DATE,
      outletId: OUTLET_B,
    });
    expect(outletB.days[0]?.figures.netSales).toBe("500000");
    expect(outletB.days[0]?.countsByStatus.PAID).toBe(1);

    const prior = await reports.getDailySalesReport(db, owner, {
      from: PRIOR,
      to: PRIOR,
      outletId: OUTLET_A,
    });
    expect(prior.days[0]?.figures.netSales).toBe("999999");
  });
});

describe("payment mix and expected cash (FR-061)", () => {
  it("subtracts refunds and keeps change inside the cash row", async () => {
    const report = await reports.getPaymentMixReport(db, owner, {
      from: DATE,
      to: DATE,
      outletId: OUTLET_A,
    });
    const cash = report.methods.find((row) => row.method === "CASH");
    expect(cash).toEqual({
      method: "CASH",
      payments: "424700",
      refunds: "75000",
      net: "349700",
      change: "300",
    });
    expect(report.expectedCash).toBe("349700");
    expect(report.totalNet).toBe("499700");
    expect(report.changeTotal).toBe("300");
  });
});

describe("service-versus-product revenue (FR-062)", () => {
  it("allocates the order discount so the lines reconcile with net sales", async () => {
    const report = await reports.getServiceProductReport(db, owner, {
      from: DATE,
      to: DATE,
      outletId: OUTLET_A,
    });
    expect(report.product.revenue).toBe("349750");
    expect(report.service.revenue).toBe("149950");
    expect(report.totalRevenue).toBe("499700");
    expect(report.taxTotal).toBe("29700");
    expect(report.discountTotal).toBe("30000");
  });
});

describe("technician productivity (FR-063)", () => {
  it("counts completed orders, lines, and labor value", async () => {
    const report = await reports.getTechnicianProductivityReport(db, owner, {
      from: DATE,
      to: DATE,
      outletId: OUTLET_A,
    });
    expect(report.technicians).toEqual([
      {
        technicianId: MECHANIC_ID,
        technicianName: "Agus Uji",
        completedOrders: 3,
        completedLines: 3,
        laborValue: "199950",
      },
    ]);
  });
});

describe("stock valuation (FR-064)", () => {
  it("values on-hand at recorded cost on the stated date", async () => {
    const report = await reports.getStockValuationReport(db, owner, {
      asOf: DATE,
      outletId: OUTLET_A,
    });
    expect(report.asOf).toBe(DATE);
    expect(report.totalValue).toBe("3110000");
    const p1 = report.items.find((item) => item.sku === "BRK-801");
    expect(p1).toMatchObject({ onHand: 19, unitCost: "150000", value: "2850000" });
  });

  it("uses the valuation date's end as the ledger cut-off", async () => {
    const report = await reports.getStockValuationReport(db, owner, {
      asOf: "2026-11-25",
      outletId: OUTLET_A,
    });
    expect(report.totalValue).toBe("0");
  });
});

describe("end-of-day report (FR-065)", () => {
  it("combines figures, mix, and void reasons; empty days stay explicit", async () => {
    const report = await reports.getEndOfDayReport(db, owner, {
      date: DATE,
      outletId: OUTLET_A,
    });
    expect(report.figures.netSales).toBe("499700");
    expect(report.paymentMix.expectedCash).toBe("349700");
    expect(report.voids).toHaveLength(1);
    expect(report.voids[0]?.reason).toBe("Salah input pelanggan");
    expect(report.voids[0]?.total).toBe("75000");

    const empty = await reports.getEndOfDayReport(db, owner, {
      date: "2026-12-10",
      outletId: OUTLET_A,
    });
    expect(empty.figures).toEqual({
      orderCount: 0,
      grossSales: "0",
      discounts: "0",
      tax: "0",
      netSales: "0",
    });
    expect(empty.voids).toEqual([]);
  });
});

describe("report permissions and outlet scope (FR-003, FR-004, BR-012)", () => {
  it("lets a Cashier read their own outlet but audits a cross-outlet attempt", async () => {
    const own = await reports.getDailySalesReport(db, cashierA, {
      from: DATE,
      to: DATE,
      outletId: OUTLET_A,
    });
    expect(own.days[0]?.figures.netSales).toBe("499700");

    await expectRejection(
      () =>
        reports.getDailySalesReport(db, cashierA, {
          from: DATE,
          to: DATE,
          outletId: OUTLET_B,
        }),
      "FORBIDDEN",
    );
    const denials = await db
      .select({ id: tables.auditLog.id })
      .from(tables.auditLog)
      .where(eq(tables.auditLog.action, "rbac.cross_outlet_denied"));
    expect(denials.length).toBeGreaterThan(0);
  });

  it("denies a Mechanic every report", async () => {
    const mechanic = makeContext(MECHANIC_ID, "Agus Uji", "MECHANIC", [OUTLET_A], OUTLET_A);
    await expectRejection(
      () =>
        reports.getDailySalesReport(db, mechanic, {
          from: DATE,
          to: DATE,
          outletId: OUTLET_A,
        }),
      "FORBIDDEN",
    );
  });
});

describe("CSV export (FR-066, AC19)", () => {
  it("writes a BOM, Bahasa headers, integer money, and matching values", async () => {
    const result = await exporter.buildReportCsv(db, owner, "daily-sales", {
      from: DATE,
      to: DATE,
      outletId: OUTLET_A,
    });
    expect(result.content.charCodeAt(0)).toBe(0xfeff);
    expect(result.content).toContain("Tanggal,Outlet,Draf,Estimasi,Disetujui,Dikerjakan,Selesai,Dibayar,Dibatalkan");
    expect(result.content).toContain("2026-11-27,Outlet Pusat,1,0,0,0,1,3,1,3,500000,30000,29700,499700");
    expect(result.content).not.toContain("Rp");
  });

  it("exports the stock ledger with +07:00 timestamps and a formula guard", async () => {
    const result = await exporter.buildLedgerCsv(db, owner, {
      from: DATE,
      to: DATE,
      outletId: OUTLET_A,
    });
    expect(result.content.charCodeAt(0)).toBe(0xfeff);
    expect(result.content).toContain("+07:00");
    expect(result.content).toContain("Pengurangan penjualan");
    expect(exporter.csvText("=SUM(A1:A2)")).toBe("'=SUM(A1:A2)");
    expect(exporter.csvText('Lampu, depan')).toBe('"Lampu, depan"');
  });

  it("denies a Cashier export path and records the denial at the route guard", async () => {
    await expectRejection(
      () =>
        exporter.buildReportCsv(db, cashierA, "daily-sales", {
          from: DATE,
          to: DATE,
          outletId: OUTLET_A,
        }),
      "FORBIDDEN",
    );
  });

  it("records a successful export in the audit log", async () => {
    const rows = await db
      .select({ id: tables.auditLog.id })
      .from(tables.auditLog)
      .where(eq(tables.auditLog.action, "report.exported"));
    expect(rows.length).toBeGreaterThan(0);
  });
});

describe("audit log API (FR-069, AC20)", () => {
  it("filters by action and keeps before/after detail", async () => {
    const list = await audit.listAuditEntries(db, owner, {
      action: "report.exported",
      page: 1,
      pageSize: 25,
    });
    expect(list.total).toBeGreaterThan(0);
    expect(list.items.every((entry) => entry.action === "report.exported")).toBe(true);
    expect(list.items[0]?.after).toMatchObject({ from: DATE, to: DATE });
  });

  it("denies Admin and Cashier", async () => {
    await expectRejection(
      () => audit.listAuditEntries(db, admin, { page: 1, pageSize: 25 }),
      "FORBIDDEN",
    );
    await expectRejection(
      () => audit.listAuditEntries(db, cashierA, { page: 1, pageSize: 25 }),
      "FORBIDDEN",
    );
  });

  it("is append-only end to end", async () => {
    const [entry] = await db.select({ id: tables.auditLog.id }).from(tables.auditLog).limit(1);
    expect(entry?.id).toBeTruthy();
    await expect(
      db.execute(sql`update public.audit_log set reason = 'changed' where id = ${entry?.id}`),
    ).rejects.toThrow();
    await expect(
      db.execute(sql`delete from public.audit_log where id = ${entry?.id}`),
    ).rejects.toThrow();
  });
});

describe("settings and branding (FR-070, FR-071)", () => {
  it("updates Owner-only settings, audits before/after, and never rewrites orders", async () => {
    const before = await settingsService.getOutletSettings(db, owner, OUTLET_A);
    const updated = await settingsService.updateOutletSettings(db, owner, {
      outletId: OUTLET_A,
      taxRate: 12,
      cashierDiscountCapPercent: 5,
      idleTimeoutMinutes: 45,
      receiptPaperWidth: 80,
      voidReasonMinLength: 12,
      receiptPrefix: "INV/",
      receiptHeaderText: "Bengkel Uji",
      receiptFooterText: null,
    });
    expect(updated.taxRate).toBe(12);
    expect(updated.updatedByName).toBe("Rina Uji");
    expect(before.taxRate).toBe(11);

    const auditRows = await db
      .select({ before: tables.auditLog.before, after: tables.auditLog.after })
      .from(tables.auditLog)
      .where(eq(tables.auditLog.action, "settings.updated"));
    expect(auditRows.length).toBeGreaterThan(0);
    expect(auditRows[0]?.before).toMatchObject({ taxRate: 11 });
    expect(auditRows[0]?.after).toMatchObject({ taxRate: 12 });

    const [order] = await db
      .select({ taxRate: tables.orders.taxRate, total: tables.orders.total })
      .from(tables.orders)
      .where(eq(tables.orders.id, O1));
    expect(order?.taxRate).toBe(11);
    expect(order?.total).toBe(299_700n);
  });

  it("denies Admin and Cashier settings, and audits branding changes", async () => {
    const valid = {
      outletId: OUTLET_A,
      taxRate: 11,
      cashierDiscountCapPercent: 0,
      idleTimeoutMinutes: 30,
      receiptPaperWidth: 58 as const,
      voidReasonMinLength: 10,
      receiptPrefix: "",
      receiptHeaderText: null,
      receiptFooterText: null,
    };
    await expectRejection(
      () => settingsService.updateOutletSettings(db, admin, valid),
      "FORBIDDEN",
    );
    await expectRejection(
      () => settingsService.updateOutletSettings(db, cashierA, valid),
      "FORBIDDEN",
    );

    const branding = await settingsService.updateBranding(db, owner, {
      productName: "Bengkel Uji POS",
      logoPath: "/logo.svg",
    });
    expect(branding.productName).toBe("Bengkel Uji POS");
    const rows = await db
      .select({ id: tables.auditLog.id })
      .from(tables.auditLog)
      .where(eq(tables.auditLog.action, "branding.updated"));
    expect(rows).toHaveLength(1);
  });
});

describe("12-month performance at NFR-013 volumes", () => {
  it(
    "keeps every report p95 under 10 seconds",
    async () => {
      const perfBusiness = "b8100000-0000-4000-8000-000000000001";
      const perfOutlet = "b8100000-0000-4000-8000-000000000002";
      const perfUser = "wp8_perf_owner";
      const perfProduct = "c8100000-0000-4000-8000-000000000001";
      const perfCustomer = "c8100000-0000-4000-8000-000000000002";

      await db.insert(tables.businesses).values({ id: perfBusiness, name: "Bengkel Performa" });
      await db.insert(tables.outlets).values({
        id: perfOutlet,
        businessId: perfBusiness,
        name: "Outlet Performa",
      });
      await db.insert(tables.user).values({
        id: perfUser,
        name: "Pemilik Performa",
        email: "owner.perf@example.com",
        businessId: perfBusiness,
        role: "OWNER",
        phone: "081200000090",
      });
      await db.insert(tables.products).values({
        id: perfProduct,
        businessId: perfBusiness,
        outletId: perfOutlet,
        sku: "PRF-001",
        name: "Produk performa",
        cost: 1_000n,
        price: 10_000n,
      });
      await db.insert(tables.customers).values({
        id: perfCustomer,
        businessId: perfBusiness,
        name: "Pelanggan Performa",
        phone: "081200000091",
      });

      await db.execute(sql`
        insert into public.vehicles (business_id, customer_id, normalized_plate, brand, model)
        select ${perfBusiness}::uuid, ${perfCustomer}::uuid,
               'PRF' || lpad(g::text, 7, '0'), 'Honda', 'Beat'
        from generate_series(1, 20000) g
      `);

      await db.execute(sql`
        insert into public.orders
          (business_id, outlet_id, kind, status, tax_rate, subtotal, discount_total,
           tax_total, total, paid_at, completed_at, created_by, created_at)
        select ${perfBusiness}::uuid, ${perfOutlet}::uuid, 'SALE', 'DRAFT', 11,
               1000000, 0, 110000, 1110000,
               timestamptz '2025-12-01 00:00:00+07' + (g % 365) * interval '1 day' + interval '10 hours',
               timestamptz '2025-12-01 00:00:00+07' + (g % 365) * interval '1 day' + interval '9 hours',
               ${perfUser}, timestamptz '2025-12-01 00:00:00+07' + (g % 365) * interval '1 day' + interval '9 hours'
        from generate_series(1, 1000) g
      `);
      await db.execute(sql`
        insert into public.order_lines
          (order_id, line_type, product_id, description, quantity, unit_price,
           discount_amount, tax_amount, line_total, sort_order, technician_id)
        select o.id, 'PRODUCT', ${perfProduct}::uuid, 'Baris performa', 1, 10000,
               0, 1100, 10000, gs, ${perfUser}
        from public.orders o
        cross join generate_series(1, 100) gs
        where o.business_id = ${perfBusiness}::uuid
      `);
      await db.execute(sql`
        insert into public.payments (order_id, method, amount, received_at, created_by)
        select o.id, 'CASH', 1110000, o.paid_at, ${perfUser}
        from public.orders o
        where o.business_id = ${perfBusiness}::uuid
      `);
      await db.execute(sql`
        update public.orders set status = 'PAID'
        where business_id = ${perfBusiness}::uuid
      `);

      const perfContext = makeContext(
        perfUser,
        "Pemilik Performa",
        "OWNER",
        [perfOutlet],
        perfOutlet,
        perfBusiness,
      );
      const range = { from: "2025-12-01", to: "2026-11-30", outletId: perfOutlet };
      const samples: Record<string, number[]> = {
        "daily-sales": [],
        "payment-mix": [],
        "service-product": [],
        "technician-productivity": [],
        "stock-valuation": [],
        "end-of-day": [],
      };

      for (let run = 0; run < 3; run += 1) {
        const timed = async (key: string, work: () => Promise<unknown>) => {
          const start = performance.now();
          await work();
          samples[key]?.push(performance.now() - start);
        };
        await timed("daily-sales", () => reports.getDailySalesReport(db, perfContext, range));
        await timed("payment-mix", () => reports.getPaymentMixReport(db, perfContext, range));
        await timed("service-product", () =>
          reports.getServiceProductReport(db, perfContext, range),
        );
        await timed("technician-productivity", () =>
          reports.getTechnicianProductivityReport(db, perfContext, range),
        );
        await timed("stock-valuation", () =>
          reports.getStockValuationReport(db, perfContext, {
            asOf: "2026-11-30",
            outletId: perfOutlet,
          }),
        );
        await timed("end-of-day", () =>
          reports.getEndOfDayReport(db, perfContext, {
            date: "2026-11-30",
            outletId: perfOutlet,
          }),
        );
      }

      const p95: Record<string, number> = {};
      for (const [key, values] of Object.entries(samples)) {
        const sorted = [...values].sort((a, b) => a - b);
        p95[key] = sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0;
        expect(p95[key], `${key} p95`).toBeLessThan(10_000);
      }
      console.info("WP8 report p95 (ms):", JSON.stringify(p95));
    },
    180_000,
  );
});
