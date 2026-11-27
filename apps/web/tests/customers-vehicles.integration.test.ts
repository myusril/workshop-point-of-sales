import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthError, AuthContext } from "@workshop-pos/auth";
import {
  ANONYMIZED_CUSTOMER_NAME,
  maskPhone,
  type StaffRole,
} from "@workshop-pos/contracts";
import type { Database } from "@workshop-pos/db";

import type * as AuthModule from "@workshop-pos/auth";
import type * as CustomerModule from "../app/api/v1/customers/_lib/customer-service";
import type * as DbModule from "@workshop-pos/db";
import type * as VehicleModule from "../app/api/v1/vehicles/_lib/vehicle-service";

/**
 * Customer, vehicle, and plate-history integration coverage (WP5).
 *
 * The service modules are imported dynamically: `DATABASE_URL` must be final
 * before `@workshop-pos/db` is loaded, which a hoisted static import cannot
 * guarantee. This file owns the schema lifecycle for its run (drop, migrate,
 * synthetic tenancy) and refuses any database whose name does not end `_test`.
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

const BUSINESS_ID = "a5000000-0000-4000-8000-000000000001";
const OTHER_BUSINESS_ID = "a5000000-0000-4000-8000-000000000009";
const OUTLET_PRIMARY = "a5000000-0000-4000-8000-000000000002";
const OUTLET_SECOND = "a5000000-0000-4000-8000-000000000003";
const OUTLET_OTHER_BUSINESS = "a5000000-0000-4000-8000-00000000000a";

const OWNER_ID = "wp5_owner";
const CASHIER_ID = "wp5_cashier";
const MECHANIC_ID = "wp5_mechanic";

const BULK_ORDER_COUNT = 1_000;
const BULK_START = new Date("2025-01-01T00:00:00.000Z");

let db: Database;
let pool: Pool;
let tables: typeof DbModule;
let auth: typeof AuthModule;
let customerService: typeof CustomerModule;
let vehicleService: typeof VehicleModule;

let owner: AuthContext;
let cashier: AuthContext;
let mechanic: AuthContext;

interface SeededVehicle {
  id: string;
  normalizedPlate: string;
}

let customerPrimaryId: string;
let customerExportId: string;
let customerPaginationId: string;
let customerReassignId: string;
let customerOpenOrdersId: string;
let otherBusinessCustomerId: string;

let vehicleBulk: SeededVehicle;
let vehicleSmallHistory: SeededVehicle;
let vehicleEmptyHistory: SeededVehicle;
let vehicleExport: SeededVehicle;
let vehicleConflict: SeededVehicle;
let vehicleReassigned: SeededVehicle;
let vehicleOpenOrders: SeededVehicle;

let servicePrimaryId: string;
let serviceSecondaryId: string;
let productPrimaryId: string;

const bulkOrderIdByIndex = new Map<number, string>();

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
        outletId === OUTLET_SECOND ? "Outlet Cabang" : "Outlet Pusat",
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

async function auditRows(action: string, entityId: string) {
  return db
    .select()
    .from(tables.auditLog)
    .where(
      and(
        eq(tables.auditLog.action, action),
        eq(tables.auditLog.entityId, entityId),
      ),
    );
}

beforeAll(async () => {
  testDatabaseName(TEST_DATABASE_URL);

  tables = await import("@workshop-pos/db");
  auth = await import("@workshop-pos/auth");
  customerService = await import(
    "../app/api/v1/customers/_lib/customer-service"
  );
  vehicleService = await import(
    "../app/api/v1/vehicles/_lib/vehicle-service"
  );
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");

  await resetSchema();
  const client = tables.createDatabaseClient(TEST_DATABASE_URL);
  db = client.db;
  pool = client.pool;
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

  await db.insert(tables.businesses).values([
    { id: BUSINESS_ID, name: "Bengkel Uji WP5" },
    { id: OTHER_BUSINESS_ID, name: "Bengkel Lain WP5" },
  ]);
  await db.insert(tables.outlets).values([
    { id: OUTLET_PRIMARY, businessId: BUSINESS_ID, name: "Outlet Pusat" },
    { id: OUTLET_SECOND, businessId: BUSINESS_ID, name: "Outlet Cabang" },
    {
      id: OUTLET_OTHER_BUSINESS,
      businessId: OTHER_BUSINESS_ID,
      name: "Outlet Luar",
    },
  ]);
  await db.insert(tables.user).values([
    {
      id: OWNER_ID,
      name: "Rina Uji",
      email: "owner.wp5@example.com",
      businessId: BUSINESS_ID,
      role: "OWNER",
      phone: "081200000020",
    },
    {
      id: CASHIER_ID,
      name: "Dewi Uji",
      email: "cashier.wp5@example.com",
      businessId: BUSINESS_ID,
      role: "CASHIER",
      phone: "081200000021",
    },
    {
      id: MECHANIC_ID,
      name: "Agus Uji",
      email: "mechanic.wp5@example.com",
      businessId: BUSINESS_ID,
      role: "MECHANIC",
      phone: "081200000022",
    },
  ]);
  await db.insert(tables.staffOutlets).values([
    { userId: CASHIER_ID, outletId: OUTLET_PRIMARY },
    { userId: MECHANIC_ID, outletId: OUTLET_PRIMARY },
  ]);

  owner = makeContext(OWNER_ID, "Rina Uji", "OWNER", [OUTLET_PRIMARY, OUTLET_SECOND], OUTLET_PRIMARY);
  cashier = makeContext(CASHIER_ID, "Dewi Uji", "CASHIER", [OUTLET_PRIMARY], OUTLET_PRIMARY);
  mechanic = makeContext(MECHANIC_ID, "Agus Uji", "MECHANIC", [OUTLET_PRIMARY], OUTLET_PRIMARY);

  const [product] = await db
    .insert(tables.products)
    .values({
      businessId: BUSINESS_ID,
      outletId: OUTLET_PRIMARY,
      sku: "WP5-PRD-A",
      name: "Kampas Rem Uji",
      unit: "set",
      cost: 50_000n,
      price: 100_000n,
    })
    .returning({ id: tables.products.id });
  if (!product) throw new Error("product insert returned no row");
  productPrimaryId = product.id;

  const [servicePrimary] = await db
    .insert(tables.services)
    .values({
      businessId: BUSINESS_ID,
      outletId: OUTLET_PRIMARY,
      code: "WP5-SRV-A",
      name: "Servis Uji Pusat",
      price: 100_000n,
      durationMinutes: 30,
    })
    .returning({ id: tables.services.id });
  if (!servicePrimary) throw new Error("service insert returned no row");
  servicePrimaryId = servicePrimary.id;

  const [serviceSecondary] = await db
    .insert(tables.services)
    .values({
      businessId: BUSINESS_ID,
      outletId: OUTLET_SECOND,
      code: "WP5-SRV-B",
      name: "Servis Uji Cabang",
      price: 100_000n,
      durationMinutes: 30,
    })
    .returning({ id: tables.services.id });
  if (!serviceSecondary) throw new Error("service insert returned no row");
  serviceSecondaryId = serviceSecondary.id;

  const customerPrimary = await customerService.createCustomer(db, owner, {
    name: "Budi Santoso",
    phone: "081234567890",
    address: "Jl. Contoh No. 1",
    notes: "Pelanggan uji WP5",
  });
  customerPrimaryId = customerPrimary.id;

  const customerExport = await customerService.createCustomer(db, owner, {
    name: "Siti Rahayu",
    phone: "081298765432",
    address: "Jl. Melati No. 2",
  });
  customerExportId = customerExport.id;

  const [paginationCustomer] = await db
    .insert(tables.customers)
    .values({
      businessId: BUSINESS_ID,
      name: "Agus Pagination",
      phone: "081300009999",
    })
    .returning({ id: tables.customers.id });
  if (!paginationCustomer) throw new Error("customer insert returned no row");
  customerPaginationId = paginationCustomer.id;

  const [outsideCustomer] = await db
    .insert(tables.customers)
    .values({
      businessId: OTHER_BUSINESS_ID,
      name: "Pelanggan Luar",
      phone: "081399999999",
    })
    .returning({ id: tables.customers.id });
  if (!outsideCustomer) throw new Error("customer insert returned no row");
  otherBusinessCustomerId = outsideCustomer.id;

  await db.insert(tables.customers).values(
    Array.from({ length: 30 }, (_, index) => ({
      businessId: BUSINESS_ID,
      name: `Halaman ${String(index + 1).padStart(2, "0")}`,
      phone: `08130000${String(index + 1).padStart(4, "0")}`,
    })),
  );

  const bulk = await vehicleService.createVehicle(db, owner, {
    plate: "b 1234 xyz",
    brand: "Honda",
    model: "Beat 110",
    year: 2020,
    color: "Hitam",
    odometer: 1_200,
    vin: "MH1-JF12E1",
    notes: "Kendaraan uji WP5",
    customerId: customerPrimaryId,
  });
  vehicleBulk = {
    id: bulk.item.id,
    normalizedPlate: bulk.item.normalizedPlate,
  };

  vehicleSmallHistory = {
    id: (
      await vehicleService.createVehicle(db, owner, {
        plate: "B 5678 ABC",
        brand: "Yamaha",
        model: "Mio",
        customerId: customerPrimaryId,
      })
    ).item.id,
    normalizedPlate: "B5678ABC",
  };

  vehicleEmptyHistory = {
    id: (
      await vehicleService.createVehicle(db, owner, {
        plate: "B 0000 EMP",
        brand: "Suzuki",
        model: "Satria",
        customerId: customerPrimaryId,
      })
    ).item.id,
    normalizedPlate: "B0000EMP",
  };

  const exported = await vehicleService.createVehicle(db, owner, {
    plate: "B 4321 EXP",
    brand: "Honda",
    model: "Vario",
    year: 2021,
    customerId: customerExportId,
  });
  vehicleExport = {
    id: exported.item.id,
    normalizedPlate: exported.item.normalizedPlate,
  };

  const conflict = await vehicleService.createVehicle(db, owner, {
    plate: "B 9999 CON",
    brand: "Daihatsu",
    model: "Ayla",
    customerId: customerPrimaryId,
  });
  vehicleConflict = {
    id: conflict.item.id,
    normalizedPlate: conflict.item.normalizedPlate,
  };

  // A customer whose vehicle is moved to another customer while the old orders
  // still point at the original customer row.
  const reassignCustomer = await customerService.createCustomer(db, owner, {
    name: "Rina Pindah Tangan",
    phone: "081355550003",
  });
  customerReassignId = reassignCustomer.id;

  const reassignVehicle = await vehicleService.createVehicle(db, owner, {
    plate: "B 8888 RSN",
    brand: "Honda",
    model: "Scoopy",
    customerId: customerPrimaryId,
  });
  vehicleReassigned = {
    id: reassignVehicle.item.id,
    normalizedPlate: reassignVehicle.item.normalizedPlate,
  };

  const oldOwnerOrderId = randomUUID();
  const newOwnerOrderId = randomUUID();
  await db.insert(tables.orders).values([
    {
      id: oldOwnerOrderId,
      businessId: BUSINESS_ID,
      outletId: OUTLET_PRIMARY,
      kind: "SERVICE",
      status: "COMPLETED",
      customerId: customerPrimaryId,
      vehicleId: vehicleReassigned.id,
      orderNumber: "WP5-RSN-OLD",
      taxRate: 0,
      subtotal: 400_000n,
      discountTotal: 0n,
      taxTotal: 0n,
      total: 400_000n,
      createdBy: OWNER_ID,
      createdAt: new Date("2026-04-01T01:00:00.000Z"),
    },
    {
      id: newOwnerOrderId,
      businessId: BUSINESS_ID,
      outletId: OUTLET_PRIMARY,
      kind: "SERVICE",
      status: "COMPLETED",
      customerId: customerReassignId,
      vehicleId: vehicleReassigned.id,
      orderNumber: "WP5-RSN-NEW",
      taxRate: 0,
      subtotal: 250_000n,
      discountTotal: 0n,
      taxTotal: 0n,
      total: 250_000n,
      createdBy: OWNER_ID,
      createdAt: new Date("2026-04-01T02:00:00.000Z"),
    },
  ]);
  await db.insert(tables.payments).values({
    orderId: oldOwnerOrderId,
    method: "CASH",
    amount: 100_000n,
    changeAmount: 0n,
    receivedAt: new Date("2026-04-01T01:15:00.000Z"),
    createdBy: OWNER_ID,
  });

  // The transaction the review demanded: the vehicle changes hands, the old
  // order keeps its original customer row.
  await vehicleService.updateVehicle(db, owner, vehicleReassigned.id, {
    customerId: customerReassignId,
  });

  // Draft/estimated orders prove the outstanding roll-up and the per-row
  // balance obey one rule (every non-void order), unlike a voided order.
  const openCustomer = await customerService.createCustomer(db, owner, {
    name: "Dewi Tawar Menawar",
    phone: "081355550002",
  });
  customerOpenOrdersId = openCustomer.id;

  const openVehicle = await vehicleService.createVehicle(db, owner, {
    plate: "B 3030 OPN",
    brand: "Honda",
    model: "Beat Street",
    customerId: customerOpenOrdersId,
  });
  vehicleOpenOrders = {
    id: openVehicle.item.id,
    normalizedPlate: openVehicle.item.normalizedPlate,
  };

  const openDraftId = randomUUID();
  const openEstimatedId = randomUUID();
  const openVoidId = randomUUID();
  await db.insert(tables.orders).values([
    {
      id: openDraftId,
      businessId: BUSINESS_ID,
      outletId: OUTLET_PRIMARY,
      kind: "SERVICE",
      status: "DRAFT",
      customerId: customerOpenOrdersId,
      vehicleId: vehicleOpenOrders.id,
      orderNumber: "WP5-OPEN-DRAFT",
      taxRate: 0,
      subtotal: 120_000n,
      discountTotal: 0n,
      taxTotal: 0n,
      total: 120_000n,
      createdBy: OWNER_ID,
      createdAt: new Date("2026-03-01T01:00:00.000Z"),
    },
    {
      id: openEstimatedId,
      businessId: BUSINESS_ID,
      outletId: OUTLET_PRIMARY,
      kind: "SERVICE",
      status: "ESTIMATED",
      customerId: customerOpenOrdersId,
      vehicleId: vehicleOpenOrders.id,
      orderNumber: "WP5-OPEN-EST",
      taxRate: 0,
      subtotal: 80_000n,
      discountTotal: 0n,
      taxTotal: 0n,
      total: 80_000n,
      createdBy: OWNER_ID,
      createdAt: new Date("2026-03-01T02:00:00.000Z"),
    },
    {
      id: openVoidId,
      businessId: BUSINESS_ID,
      outletId: OUTLET_PRIMARY,
      kind: "SERVICE",
      status: "VOID",
      customerId: customerOpenOrdersId,
      vehicleId: vehicleOpenOrders.id,
      orderNumber: "WP5-OPEN-VOID",
      taxRate: 0,
      subtotal: 50_000n,
      discountTotal: 0n,
      taxTotal: 0n,
      total: 50_000n,
      voidedAt: new Date("2026-03-01T04:00:00.000Z"),
      voidReason: "Pembatalan uji",
      createdBy: OWNER_ID,
      createdAt: new Date("2026-03-01T03:00:00.000Z"),
    },
  ]);
  await db.insert(tables.payments).values({
    orderId: openEstimatedId,
    method: "CASH",
    amount: 30_000n,
    changeAmount: 0n,
    receivedAt: new Date("2026-03-01T02:10:00.000Z"),
    createdBy: OWNER_ID,
  });

  await db.insert(tables.vehicles).values(
    Array.from({ length: 27 }, (_, index) => ({
      businessId: BUSINESS_ID,
      customerId: customerPaginationId,
      normalizedPlate: `H${String(index + 1).padStart(4, "0")}PAG`,
      brand: "Honda",
      model: "Genio",
      year: 2022,
      odometer: 1_000 + index,
    })),
  );

  const smallA = randomUUID();
  const smallB = randomUUID();
  const smallC = randomUUID();
  await db.insert(tables.orders).values([
    {
      id: smallA,
      businessId: BUSINESS_ID,
      outletId: OUTLET_PRIMARY,
      kind: "SERVICE",
      status: "COMPLETED",
      customerId: customerPrimaryId,
      vehicleId: vehicleSmallHistory.id,
      odometer: 9_000,
      orderNumber: "WP5-V2-A",
      taxRate: 0,
      subtotal: 300_000n,
      discountTotal: 0n,
      taxTotal: 0n,
      total: 300_000n,
      createdBy: OWNER_ID,
      createdAt: new Date("2026-01-01T01:00:00.000Z"),
    },
    {
      id: smallB,
      businessId: BUSINESS_ID,
      outletId: OUTLET_PRIMARY,
      kind: "SERVICE",
      status: "COMPLETED",
      customerId: customerPrimaryId,
      vehicleId: vehicleSmallHistory.id,
      odometer: 9_500,
      orderNumber: "WP5-V2-B",
      taxRate: 0,
      subtotal: 150_000n,
      discountTotal: 0n,
      taxTotal: 0n,
      total: 150_000n,
      paidAt: new Date("2026-01-01T02:05:00.000Z"),
      createdBy: OWNER_ID,
      createdAt: new Date("2026-01-01T02:00:00.000Z"),
    },
    {
      id: smallC,
      businessId: BUSINESS_ID,
      outletId: OUTLET_PRIMARY,
      kind: "SERVICE",
      status: "COMPLETED",
      customerId: customerPrimaryId,
      vehicleId: vehicleSmallHistory.id,
      odometer: 9_750,
      orderNumber: "WP5-V2-C",
      taxRate: 0,
      subtotal: 75_000n,
      discountTotal: 0n,
      taxTotal: 0n,
      total: 75_000n,
      createdBy: OWNER_ID,
      createdAt: new Date("2026-01-01T03:00:00.000Z"),
    },
  ]);
  await db.insert(tables.orderLines).values([
    {
      orderId: smallA,
      lineType: "PRODUCT",
      productId: productPrimaryId,
      description: "Kampas rem uji",
      quantity: 2,
      unitPrice: 100_000n,
      lineTotal: 200_000n,
      sortOrder: 0,
    },
    {
      orderId: smallA,
      lineType: "SERVICE",
      serviceId: servicePrimaryId,
      description: "Servis uji pusat",
      quantity: 1,
      unitPrice: 100_000n,
      lineTotal: 100_000n,
      sortOrder: 1,
    },
    {
      orderId: smallB,
      lineType: "SERVICE",
      serviceId: servicePrimaryId,
      description: "Servis uji pusat",
      quantity: 1,
      unitPrice: 150_000n,
      lineTotal: 150_000n,
      sortOrder: 0,
    },
  ]);
  await db.insert(tables.payments).values([
    {
      orderId: smallA,
      method: "CASH",
      amount: 100_000n,
      changeAmount: 0n,
      receivedAt: new Date("2026-01-01T01:10:00.000Z"),
      createdBy: OWNER_ID,
    },
    {
      orderId: smallB,
      method: "CASH",
      amount: 150_000n,
      changeAmount: 0n,
      receivedAt: new Date("2026-01-01T02:10:00.000Z"),
      createdBy: OWNER_ID,
    },
  ]);

  // The financial-history guard makes a PAID order's lines immutable, so the
  // fixture lines land first and the status transition happens last.
  await db
    .update(tables.orders)
    .set({ status: "PAID" })
    .where(eq(tables.orders.id, smallB));

  const exportOne = randomUUID();
  const exportVoid = randomUUID();
  await db.insert(tables.orders).values([
    {
      id: exportOne,
      businessId: BUSINESS_ID,
      outletId: OUTLET_PRIMARY,
      kind: "SERVICE",
      status: "COMPLETED",
      customerId: customerExportId,
      vehicleId: vehicleExport.id,
      orderNumber: "WP5-EXP-1",
      taxRate: 0,
      subtotal: 200_000n,
      discountTotal: 0n,
      taxTotal: 0n,
      total: 200_000n,
      createdBy: OWNER_ID,
      createdAt: new Date("2026-02-01T10:00:00.000Z"),
    },
    {
      id: exportVoid,
      businessId: BUSINESS_ID,
      outletId: OUTLET_SECOND,
      kind: "SERVICE",
      status: "VOID",
      customerId: customerExportId,
      vehicleId: vehicleExport.id,
      orderNumber: "WP5-EXP-2",
      taxRate: 0,
      subtotal: 80_000n,
      discountTotal: 0n,
      taxTotal: 0n,
      total: 80_000n,
      voidedAt: new Date("2026-02-02T11:00:00.000Z"),
      voidReason: "Pembatalan uji",
      createdBy: OWNER_ID,
      createdAt: new Date("2026-02-02T10:00:00.000Z"),
    },
  ]);
  await db.insert(tables.payments).values({
    orderId: exportOne,
    method: "CASH",
    amount: 50_000n,
    changeAmount: 0n,
    receivedAt: new Date("2026-02-01T10:15:00.000Z"),
    createdBy: OWNER_ID,
  });

  const bulkOrderRows: (typeof tables.orders.$inferInsert)[] = [];
  const bulkLineRows: (typeof tables.orderLines.$inferInsert)[] = [];
  const bulkPaymentRows: (typeof tables.payments.$inferInsert)[] = [];

  for (let index = 1; index <= BULK_ORDER_COUNT; index += 1) {
    const orderId = randomUUID();
    const outletId = index % 2 === 1 ? OUTLET_PRIMARY : OUTLET_SECOND;
    const isVoid = index % 10 === 0;
    const createdAt = new Date(BULK_START.getTime() + index * 60_000);
    bulkOrderIdByIndex.set(index, orderId);

    bulkOrderRows.push({
      id: orderId,
      businessId: BUSINESS_ID,
      outletId,
      kind: "SERVICE",
      status: isVoid ? "VOID" : "COMPLETED",
      customerId: customerPrimaryId,
      vehicleId: vehicleBulk.id,
      orderNumber: `WP5-B${String(index).padStart(4, "0")}`,
      taxRate: 0,
      subtotal: 100_000n,
      discountTotal: 0n,
      taxTotal: 0n,
      total: 100_000n,
      createdBy: OWNER_ID,
      createdAt,
      updatedAt: createdAt,
      voidedAt: isVoid ? createdAt : null,
      voidReason: isVoid ? "Pembatalan uji" : null,
    });

    // Lines cannot be attached to a VOID order (financial-history guard), and
    // a VOID order never contributes to the history totals.
    if (!isVoid) {
      bulkLineRows.push({
        orderId,
        lineType: "SERVICE",
        serviceId:
          outletId === OUTLET_PRIMARY ? servicePrimaryId : serviceSecondaryId,
        description: "Servis berkala",
        quantity: 1,
        unitPrice: 100_000n,
        lineTotal: 100_000n,
        sortOrder: 1,
      });
      bulkPaymentRows.push({
        orderId,
        method: "CASH",
        amount: index % 2 === 0 ? 100_000n : 40_000n,
        changeAmount: 0n,
        receivedAt: createdAt,
        createdBy: OWNER_ID,
      });
    }
  }

  await db.insert(tables.orders).values(bulkOrderRows);
  await db.insert(tables.orderLines).values(bulkLineRows);
  await db.insert(tables.payments).values(bulkPaymentRows);
});

afterAll(async () => {
  await pool?.end();
});

describe(`customers and vehicles over ${DATABASE_NAME}`, () => {
  it("lists customers with a masked phone and a live vehicle count", async () => {
    const page = await customerService.listCustomers(db, owner, {
      q: "Budi",
      page: 1,
      pageSize: 25,
      sort: "name",
      dir: "asc",
    });

    expect(page.total).toBe(1);
    const item = page.items[0];
    expect(item).toBeDefined();
    expect(item?.id).toBe(customerPrimaryId);
    expect(item).not.toHaveProperty("phone");
    expect(item).not.toHaveProperty("address");
    expect(item).not.toHaveProperty("notes");
    expect(item?.phoneMasked).toBe(maskPhone("081234567890"));
    expect(item?.vehicleCount).toBe(4);
    expect(JSON.stringify(item)).not.toContain("081234567890");
    expect(JSON.stringify(item)).not.toContain("Jl. Contoh");
    expect(JSON.stringify(item)).not.toContain("Pelanggan uji WP5");
  });

  it("searches customers by canonical phone and by name with escaped wildcards", async () => {
    const byPhone = await customerService.listCustomers(db, owner, {
      q: "98765432",
      page: 1,
      pageSize: 25,
      sort: "name",
      dir: "asc",
    });
    expect(byPhone.items.map((item) => item.id)).toContain(customerExportId);

    const byName = await customerService.listCustomers(db, owner, {
      q: "Siti",
      page: 1,
      pageSize: 25,
      sort: "name",
      dir: "asc",
    });
    expect(byName.items.map((item) => item.id)).toEqual([customerExportId]);

    const byFormattedPhone = await customerService.listCustomers(db, owner, {
      q: "+62 812-9876-5432",
      page: 1,
      pageSize: 25,
      sort: "name",
      dir: "asc",
    });
    expect(byFormattedPhone.items.map((item) => item.id)).toContain(
      customerExportId,
    );

    const wildcard = await customerService.listCustomers(db, owner, {
      q: "%",
      page: 1,
      pageSize: 25,
      sort: "name",
      dir: "asc",
    });
    expect(wildcard.total).toBe(0);
  });

  it("paginates the customer list", async () => {
    const first = await customerService.listCustomers(db, owner, {
      q: "Halaman",
      page: 1,
      pageSize: 25,
      sort: "name",
      dir: "asc",
    });
    expect(first.total).toBe(30);
    expect(first.items).toHaveLength(25);
    expect(first.totalPages).toBe(2);

    const second = await customerService.listCustomers(db, owner, {
      q: "Halaman",
      page: 2,
      pageSize: 25,
      sort: "name",
      dir: "asc",
    });
    expect(second.items).toHaveLength(5);
  });

  it("records customer creation without copying personal values", async () => {
    const rows = await auditRows("customer.created", customerPrimaryId);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row?.after).toEqual({
      fields: ["address", "name", "notes", "phone"],
    });
    expect(JSON.stringify(row)).not.toContain("Budi");
    expect(JSON.stringify(row)).not.toContain("081234567890");
    expect(JSON.stringify(row)).not.toContain("Jl. Contoh");
  });

  it("returns the full phone on detail but never for another business", async () => {
    const detail = await customerService.getCustomer(
      db,
      owner,
      customerPrimaryId,
    );
    expect(detail.phone).toBe("081234567890");
    expect(detail.anonymizedAt).toBeNull();

    await expectRejection(
      () => customerService.getCustomer(db, owner, otherBusinessCustomerId),
      "NOT_FOUND",
    );
  });

  it("restricts full customer and vehicle detail reads to management roles", async () => {
    const customerBefore = await auditRows("rbac.denied", customerPrimaryId);
    const customerDenied = await expectRejection(
      () => customerService.getCustomer(db, mechanic, customerPrimaryId),
      "FORBIDDEN",
    );
    expect(customerDenied.message).toBe(
      auth.denialMessage("manage_customers"),
    );
    const customerAfter = await auditRows("rbac.denied", customerPrimaryId);
    expect(customerAfter.length).toBeGreaterThan(customerBefore.length);

    const vehicleBefore = await auditRows("rbac.denied", vehicleBulk.id);
    const vehicleDenied = await expectRejection(
      () => vehicleService.getVehicle(db, mechanic, vehicleBulk.id),
      "FORBIDDEN",
    );
    expect(vehicleDenied.message).toBe(
      auth.denialMessage("manage_customers"),
    );
    const vehicleAfter = await auditRows("rbac.denied", vehicleBulk.id);
    expect(vehicleAfter.length).toBeGreaterThan(vehicleBefore.length);

    // A Cashier manages customers within its own outlet and keeps the detail
    // read; the list stays readable for every role, Mechanic included.
    const cashierDetail = await customerService.getCustomer(
      db,
      cashier,
      customerPrimaryId,
    );
    expect(cashierDetail.id).toBe(customerPrimaryId);

    const mechanicList = await customerService.listCustomers(db, mechanic, {
      q: "Budi",
      page: 1,
      pageSize: 25,
      sort: "name",
      dir: "asc",
    });
    expect(mechanicList.items.map((item) => item.id)).toContain(
      customerPrimaryId,
    );

    // Create/update denials are audited too.
    const createBefore = await auditRows("rbac.denied", "new");
    await expectRejection(
      () =>
        customerService.createCustomer(db, mechanic, {
          name: "Mekanik Coba",
          phone: "081355550099",
        }),
      "FORBIDDEN",
    );
    const createAfter = await auditRows("rbac.denied", "new");
    expect(createAfter.length).toBeGreaterThan(createBefore.length);

    const updateBefore = await auditRows("rbac.denied", customerPrimaryId);
    await expectRejection(
      () =>
        customerService.updateCustomer(db, mechanic, customerPrimaryId, {
          name: "Mekanik Ubah",
        }),
      "FORBIDDEN",
    );
    const updateAfter = await auditRows("rbac.denied", customerPrimaryId);
    expect(updateAfter.length).toBeGreaterThan(updateBefore.length);
  });

  it("updates a customer and audits changed field names only", async () => {
    const updated = await customerService.updateCustomer(
      db,
      owner,
      customerPrimaryId,
      { name: "Budi Santoso Jaya", phone: "081234567891" },
    );
    expect(updated.name).toBe("Budi Santoso Jaya");
    expect(updated.phone).toBe("081234567891");

    const rows = await auditRows("customer.updated", customerPrimaryId);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row?.before).toEqual({ fields: ["name", "phone"] });
    expect(row?.after).toEqual({ fields: ["name", "phone"] });
    expect(JSON.stringify(row)).not.toContain("Budi");
    expect(JSON.stringify(row)).not.toContain("081234567891");
  });

  it("normalizes a raw plate once and reuses the existing vehicle on duplicate create", async () => {
    expect(vehicleBulk.normalizedPlate).toBe("B1234XYZ");

    const again = await vehicleService.createVehicle(db, owner, {
      plate: "B1234XYZ",
      brand: "Honda",
      model: "Beat 110",
      customerId: customerPrimaryId,
    });
    expect(again.reused).toBe(true);
    expect(again.item.id).toBe(vehicleBulk.id);
    expect(again.item.normalizedPlate).toBe("B1234XYZ");

    const rows = await db
      .select({ id: tables.vehicles.id })
      .from(tables.vehicles)
      .where(
        and(
          eq(tables.vehicles.businessId, BUSINESS_ID),
          eq(tables.vehicles.normalizedPlate, "B1234XYZ"),
        ),
      );
    expect(rows).toHaveLength(1);

    const detail = await vehicleService.getVehicle(db, owner, vehicleBulk.id);
    expect(detail.customerId).toBe(customerPrimaryId);
    expect(detail.customerName).toBe("Budi Santoso Jaya");
    expect(detail.customerAnonymized).toBe(false);

    const createAudits = await auditRows("vehicle.created", vehicleBulk.id);
    expect(createAudits).toHaveLength(1);
    expect(createAudits[0]?.after).toEqual({
      fields: [
        "brand",
        "color",
        "customerId",
        "model",
        "notes",
        "odometer",
        "plate",
        "vin",
        "year",
      ],
    });
    expect(JSON.stringify(createAudits[0])).not.toContain("B1234XYZ");
    expect(JSON.stringify(createAudits[0])).not.toContain("MH1-JF12E1");
  });

  it("rejects unusable plates, out-of-range year/odometer, and an unknown customer", async () => {
    const badPlate = await expectRejection(
      () =>
        vehicleService.createVehicle(db, owner, {
          plate: "***",
          brand: "Honda",
          model: "Beat",
          customerId: customerPrimaryId,
        }),
      "VALIDATION_ERROR",
    );
    expect(badPlate.fieldErrors?.plate?.[0]).toBe(
      "Nomor polisi hanya boleh huruf dan angka.",
    );

    const badOdometer = await expectRejection(
      () =>
        vehicleService.createVehicle(db, owner, {
          plate: "B 1111 ODO",
          brand: "Honda",
          model: "Beat",
          odometer: -1,
          customerId: customerPrimaryId,
        }),
      "VALIDATION_ERROR",
    );
    expect(badOdometer.fieldErrors?.odometer).toBeDefined();

    const badYear = await expectRejection(
      () =>
        vehicleService.createVehicle(db, owner, {
          plate: "B 1111 YEA",
          brand: "Honda",
          model: "Beat",
          year: 1885,
          customerId: customerPrimaryId,
        }),
      "VALIDATION_ERROR",
    );
    expect(badYear.fieldErrors?.year).toBeDefined();

    const unknownCustomer = await expectRejection(
      () =>
        vehicleService.createVehicle(db, owner, {
          plate: "B 1111 CUS",
          brand: "Honda",
          model: "Beat",
          customerId: randomUUID(),
        }),
      "VALIDATION_ERROR",
    );
    expect(unknownCustomer.fieldErrors?.customerId?.[0]).toContain("Pelanggan");

    const crossBusiness = await expectRejection(
      () =>
        vehicleService.createVehicle(db, owner, {
          plate: "B 1111 OUT",
          brand: "Honda",
          model: "Beat",
          customerId: otherBusinessCustomerId,
        }),
      "VALIDATION_ERROR",
    );
    expect(crossBusiness.fieldErrors?.customerId?.[0]).toContain("Pelanggan");
  });

  it("searches vehicles by raw plate, customer name, and customer phone", async () => {
    const byPlate = await vehicleService.listVehicles(db, owner, {
      q: "b 1234 xyz",
      page: 1,
      pageSize: 25,
      sort: "plate",
      dir: "asc",
    });
    expect(byPlate.items.map((item) => item.id)).toContain(vehicleBulk.id);
    expect(byPlate.items[0]?.normalizedPlate).toBe("B1234XYZ");

    const listRow = byPlate.items.find((item) => item.id === vehicleBulk.id);
    expect(listRow).toBeDefined();
    expect(listRow).not.toHaveProperty("vin");
    expect(listRow).not.toHaveProperty("notes");
    expect(JSON.stringify(listRow)).not.toContain("MH1-JF12E1");
    expect(JSON.stringify(listRow)).not.toContain("Kendaraan uji WP5");

    const byCustomer = await vehicleService.listVehicles(db, owner, {
      q: "Siti",
      page: 1,
      pageSize: 25,
      sort: "plate",
      dir: "asc",
    });
    expect(byCustomer.items.map((item) => item.id)).toContain(vehicleExport.id);

    const byPhone = await vehicleService.listVehicles(db, owner, {
      q: "081298765432",
      page: 1,
      pageSize: 25,
      sort: "plate",
      dir: "asc",
    });
    expect(byPhone.items.map((item) => item.id)).toContain(vehicleExport.id);

    const byFormattedPhone = await vehicleService.listVehicles(db, owner, {
      q: "+62 812-9876-5432",
      page: 1,
      pageSize: 25,
      sort: "plate",
      dir: "asc",
    });
    expect(byFormattedPhone.items.map((item) => item.id)).toContain(
      vehicleExport.id,
    );
  });

  it("paginates vehicles filtered by customer", async () => {
    const first = await vehicleService.listVehicles(db, owner, {
      customerId: customerPaginationId,
      page: 1,
      pageSize: 25,
      sort: "plate",
      dir: "asc",
    });
    expect(first.total).toBe(27);
    expect(first.items).toHaveLength(25);
    expect(first.totalPages).toBe(2);

    const second = await vehicleService.listVehicles(db, owner, {
      customerId: customerPaginationId,
      page: 2,
      pageSize: 25,
      sort: "plate",
      dir: "asc",
    });
    expect(second.items).toHaveLength(2);
  });

  it("audits vehicle updates by field name and reports a plate conflict in Bahasa", async () => {
    const updated = await vehicleService.updateVehicle(
      db,
      owner,
      vehicleConflict.id,
      { brand: "Toyota" },
    );
    expect(updated.brand).toBe("Toyota");

    const rows = await auditRows("vehicle.updated", vehicleConflict.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.before).toEqual({ fields: ["brand"] });
    expect(rows[0]?.after).toEqual({ fields: ["brand"] });
    expect(JSON.stringify(rows[0])).not.toContain("Toyota");

    const conflict = await expectRejection(
      () =>
        vehicleService.updateVehicle(db, owner, vehicleConflict.id, {
          plate: "b 4321 exp",
        }),
      "CONFLICT",
    );
    expect(conflict.message).toContain("B4321EXP");
  });

  it("returns a newest-first history with lines, odometer, totals, and payment status", async () => {
    const history = await vehicleService.getVehicleHistory(
      db,
      owner,
      vehicleSmallHistory.id,
      { page: 1, pageSize: 25 },
    );

    expect(history.total).toBe(3);
    expect(history.totalPages).toBe(1);
    expect(history.scope).toEqual({
      allOutlets: true,
      outletId: null,
      outletName: null,
    });
    expect(history.vehicle.id).toBe(vehicleSmallHistory.id);

    expect(history.orders.map((order) => order.orderNumber)).toEqual([
      "WP5-V2-C",
      "WP5-V2-B",
      "WP5-V2-A",
    ]);

    const [unpaid, paid, partial] = history.orders;
    expect(unpaid?.status).toBe("COMPLETED");
    expect(unpaid?.paymentStatus).toBe("UNPAID");
    expect(unpaid?.total).toBe("75000");
    expect(unpaid?.balanceDue).toBe("75000");

    expect(paid?.paymentStatus).toBe("PAID");
    expect(paid?.balanceDue).toBe("0");

    expect(partial?.paymentStatus).toBe("PARTIAL");
    expect(partial?.total).toBe("300000");
    expect(partial?.paidTotal).toBe("100000");
    expect(partial?.balanceDue).toBe("200000");
    expect(partial?.odometer).toBe(9_000);
    expect(partial?.lines).toEqual([
      {
        lineType: "PRODUCT",
        description: "Kampas rem uji",
        quantity: 2,
        lineTotal: "200000",
      },
      {
        lineType: "SERVICE",
        description: "Servis uji pusat",
        quantity: 1,
        lineTotal: "100000",
      },
    ]);

    expect(history.totals).toEqual({
      visits: 3,
      totalSpent: "525000",
      outstanding: "275000",
    });
  });

  it("answers an empty history with zeros rather than a 404", async () => {
    const history = await vehicleService.getVehicleHistory(
      db,
      owner,
      vehicleEmptyHistory.id,
      { page: 1, pageSize: 25 },
    );

    expect(history.orders).toEqual([]);
    expect(history.total).toBe(0);
    expect(history.totalPages).toBe(0);
    expect(history.totals).toEqual({
      visits: 0,
      totalSpent: "0",
      outstanding: "0",
    });
  });

  it("counts draft and estimated balances in the outstanding roll-up", async () => {
    const history = await vehicleService.getVehicleHistory(
      db,
      owner,
      vehicleOpenOrders.id,
      { page: 1, pageSize: 25 },
    );

    expect(history.total).toBe(3);
    expect(history.totals).toEqual({
      visits: 2,
      totalSpent: "200000",
      outstanding: "170000",
    });

    const nonVoid = history.orders.filter((order) => order.status !== "VOID");
    expect(nonVoid.map((order) => order.status).sort()).toEqual([
      "DRAFT",
      "ESTIMATED",
    ]);

    const pageBalances = history.orders.reduce(
      (sum, order) => sum + BigInt(order.balanceDue),
      0n,
    );
    expect(pageBalances).toBe(170_000n);
    expect(pageBalances.toString()).toBe(history.totals.outstanding);
    expect(history.orders.find((order) => order.status === "VOID")?.balanceDue).toBe(
      "0",
    );
  });

  it("pages a 1,000-order history and rolls up totals over the whole scope", async () => {
    const history = await vehicleService.getVehicleHistory(
      db,
      owner,
      vehicleBulk.id,
      { page: 40, pageSize: 25 },
    );

    expect(history.total).toBe(BULK_ORDER_COUNT);
    expect(history.totalPages).toBe(40);
    expect(history.orders).toHaveLength(25);

    expect(history.vehicle).not.toHaveProperty("vin");
    expect(history.vehicle).not.toHaveProperty("notes");
    expect(history.vehicle).not.toHaveProperty("customerAnonymizedAt");
    expect(JSON.stringify(history.vehicle)).not.toContain("MH1-JF12E1");
    expect(JSON.stringify(history.vehicle)).not.toContain("Kendaraan uji WP5");
    expect(history.orders[0]?.id).toBe(bulkOrderIdByIndex.get(25));
    expect(history.orders[24]?.id).toBe(bulkOrderIdByIndex.get(1));

    expect(history.orders[0]?.paymentStatus).toBe("PARTIAL");
    expect(history.orders[0]?.balanceDue).toBe("60000");
    expect(history.orders[1]?.paymentStatus).toBe("PAID");
    expect(history.orders[1]?.balanceDue).toBe("0");

    const voided = history.orders.find((order) => order.status === "VOID");
    expect(voided?.id).toBe(bulkOrderIdByIndex.get(20));
    expect(voided?.paymentStatus).toBe("VOID");
    expect(voided?.balanceDue).toBe("0");

    expect(history.totals).toEqual({
      visits: 900,
      totalSpent: "90000000",
      outstanding: "30000000",
    });
  });

  it("scopes Cashier history to the active outlet and lets Owner read all outlets", async () => {
    const cashierHistory = await vehicleService.getVehicleHistory(
      db,
      cashier,
      vehicleBulk.id,
      { page: 1, pageSize: 25 },
    );
    expect(cashierHistory.total).toBe(500);
    expect(cashierHistory.scope).toEqual({
      allOutlets: false,
      outletId: OUTLET_PRIMARY,
      outletName: "Outlet Pusat",
    });
    expect(cashierHistory.totals).toEqual({
      visits: 500,
      totalSpent: "50000000",
      outstanding: "30000000",
    });

    const mechanicHistory = await vehicleService.getVehicleHistory(
      db,
      mechanic,
      vehicleBulk.id,
      { page: 1, pageSize: 25 },
    );
    expect(mechanicHistory.total).toBe(500);

    const ownerFiltered = await vehicleService.getVehicleHistory(
      db,
      owner,
      vehicleBulk.id,
      { page: 1, pageSize: 25, outletId: OUTLET_PRIMARY },
    );
    expect(ownerFiltered.total).toBe(500);
    expect(ownerFiltered.scope).toEqual({
      allOutlets: false,
      outletId: OUTLET_PRIMARY,
      outletName: "Outlet Pusat",
    });
    expect(ownerFiltered.totals.totalSpent).toBe("50000000");

    const ownerSecond = await vehicleService.getVehicleHistory(
      db,
      owner,
      vehicleBulk.id,
      { page: 1, pageSize: 25, outletId: OUTLET_SECOND },
    );
    expect(ownerSecond.total).toBe(500);
    expect(ownerSecond.totals).toEqual({
      visits: 400,
      totalSpent: "40000000",
      outstanding: "0",
    });
  });

  it("denies a scoped role another outlet and audits the cross-outlet attempt", async () => {
    const before = await db
      .select({ id: tables.auditLog.id })
      .from(tables.auditLog)
      .where(eq(tables.auditLog.action, "rbac.cross_outlet_denied"));

    const error = await expectRejection(
      () =>
        vehicleService.getVehicleHistory(db, cashier, vehicleBulk.id, {
          page: 1,
          pageSize: 25,
          outletId: OUTLET_SECOND,
        }),
      "FORBIDDEN",
    );
    expect(error.message).toBe(auth.CROSS_OUTLET_MESSAGE);

    const rows = await auditRows("rbac.cross_outlet_denied", vehicleBulk.id);
    expect(rows.length).toBeGreaterThan(before.length);
    expect(
      rows.some(
        (row) =>
          (row.after as { requestedOutletId?: string } | null)
            ?.requestedOutletId === OUTLET_SECOND,
      ),
    ).toBe(true);
  });

  it("answers 404 for an outlet outside the business", async () => {
    await expectRejection(
      () =>
        vehicleService.getVehicleHistory(db, owner, vehicleBulk.id, {
          page: 1,
          pageSize: 25,
          outletId: OUTLET_OTHER_BUSINESS,
        }),
      "NOT_FOUND",
    );
  });

  it("denies Cashier export and records the denial", async () => {
    const before = await auditRows("rbac.denied", customerExportId);
    await expectRejection(
      () => customerService.exportCustomerPersonalData(db, cashier, customerExportId),
      "FORBIDDEN",
    );
    const after = await auditRows("rbac.denied", customerExportId);
    expect(after.length).toBeGreaterThan(before.length);
  });

  it("exports the customer, their vehicles, and referencing orders for Owner", async () => {
    const exported = await customerService.exportCustomerPersonalData(
      db,
      owner,
      customerExportId,
    );

    expect(exported.formatVersion).toBe(1);
    expect(Number.isNaN(Date.parse(exported.exportedAt))).toBe(false);
    expect(exported.customer.id).toBe(customerExportId);
    expect(exported.customer.name).toBe("Siti Rahayu");
    expect(exported.customer.phone).toBe("081298765432");

    expect(exported.vehicles).toHaveLength(1);
    expect(exported.vehicles[0]).toMatchObject({
      id: vehicleExport.id,
      normalizedPlate: "B4321EXP",
      brand: "Honda",
      model: "Vario",
    });

    expect(exported.orders).toHaveLength(2);
    expect(exported.orders.map((order) => order.orderNumber)).toEqual([
      "WP5-EXP-2",
      "WP5-EXP-1",
    ]);
    const [voided, completed] = exported.orders;
    expect(voided?.status).toBe("VOID");
    expect(voided?.outletName).toBe("Outlet Cabang");
    expect(voided?.balanceDue).toBe("0");
    expect(completed?.status).toBe("COMPLETED");
    expect(completed?.outletName).toBe("Outlet Pusat");
    expect(completed?.total).toBe("200000");
    expect(completed?.balanceDue).toBe("150000");

    const rows = await auditRows("customer.exported", customerExportId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.after).toEqual({
      formatVersion: 1,
      vehicles: 1,
      orders: 2,
    });
    expect(JSON.stringify(rows[0])).not.toContain("Siti");
    expect(JSON.stringify(rows[0])).not.toContain("081298765432");
  });

  it("exports only orders linked by customer, never by a reassigned vehicle", async () => {
    const exported = await customerService.exportCustomerPersonalData(
      db,
      owner,
      customerReassignId,
    );

    expect(exported.customer.id).toBe(customerReassignId);
    expect(exported.vehicles.map((vehicle) => vehicle.id)).toEqual([
      vehicleReassigned.id,
    ]);
    expect(exported.orders.map((order) => order.orderNumber)).toEqual([
      "WP5-RSN-NEW",
    ]);
    expect(
      exported.orders.some((order) => order.orderNumber === "WP5-RSN-OLD"),
    ).toBe(false);

    const [oldOrder] = await db
      .select({ customerId: tables.orders.customerId })
      .from(tables.orders)
      .where(eq(tables.orders.orderNumber, "WP5-RSN-OLD"));
    expect(oldOrder?.customerId).toBe(customerPrimaryId);
  });

  it("denies Cashier anonymization and audits the denial", async () => {
    const before = await auditRows("rbac.denied", customerExportId);
    await expectRejection(
      () =>
        customerService.anonymizeCustomer(db, cashier, customerExportId, {
          reason: "Permintaan penghapusan data",
        }),
      "FORBIDDEN",
    );
    const after = await auditRows("rbac.denied", customerExportId);
    expect(after.length).toBeGreaterThan(before.length);
  });

  it("anonymizes for Owner, keeps financial rows, and never audits the old values", async () => {
    const anonymized = await customerService.anonymizeCustomer(
      db,
      owner,
      customerExportId,
      { reason: "Permintaan penghapusan data pelanggan" },
    );

    expect(anonymized.name).toBe(ANONYMIZED_CUSTOMER_NAME);
    expect(anonymized.phone).toBe("");
    expect(anonymized.address).toBeNull();
    expect(anonymized.notes).toBeNull();
    expect(anonymized.anonymizedAt).not.toBeNull();

    const vehiclesLeft = await db
      .select({ id: tables.vehicles.id })
      .from(tables.vehicles)
      .where(eq(tables.vehicles.customerId, customerExportId));
    expect(vehiclesLeft.map((row) => row.id)).toEqual([vehicleExport.id]);

    const ordersLeft = await db
      .select({ id: tables.orders.id })
      .from(tables.orders)
      .where(eq(tables.orders.customerId, customerExportId));
    expect(ordersLeft).toHaveLength(2);

    const rows = await auditRows("customer.anonymized", customerExportId);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row?.before).toEqual({ anonymizedAt: null });
    expect(row?.after).toEqual({
      anonymizedAt: anonymized.anonymizedAt,
      fields: ["name", "phone", "address", "notes"],
    });
    expect(row?.reason).toBe("Permintaan penghapusan data pelanggan");
    expect(JSON.stringify(row)).not.toContain("Siti");
    expect(JSON.stringify(row)).not.toContain("081298765432");

    const detail = await vehicleService.getVehicle(db, owner, vehicleExport.id);
    expect(detail.customerAnonymized).toBe(true);
    expect(detail.customerName).toBe(ANONYMIZED_CUSTOMER_NAME);
  });

  it("refuses to re-enter or re-anonymize erased data", async () => {
    await expectRejection(
      () =>
        customerService.updateCustomer(db, owner, customerExportId, {
          name: "Siti Muncul Lagi",
        }),
      "CONFLICT",
    );

    await expectRejection(
      () =>
        customerService.anonymizeCustomer(db, owner, customerExportId, {
          reason: "Permintaan penghapusan kedua",
        }),
      "CONFLICT",
    );

    const rejectedVehicle = await expectRejection(
      () =>
        vehicleService.createVehicle(db, owner, {
          plate: "B 7777 NEW",
          brand: "Honda",
          model: "Beat",
          customerId: customerExportId,
        }),
      "VALIDATION_ERROR",
    );
    expect(rejectedVehicle.fieldErrors?.customerId?.[0]).toContain(
      "dianonimkan",
    );
  });
});
