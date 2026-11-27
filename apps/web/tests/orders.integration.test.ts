import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { and, eq, sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthContext, AuthError } from "@workshop-pos/auth";
import type { CreateOrderRequest, OrderDetail } from "@workshop-pos/contracts";
import { createOrderSchema } from "@workshop-pos/contracts";
import type { Database } from "@workshop-pos/db";

import type * as AuthModule from "@workshop-pos/auth";
import type * as CoreModule from "@workshop-pos/core";
import type * as DbModule from "@workshop-pos/db";
import type * as OrderModule from "../lib/order-service";
import type * as ReceiptModule from "../lib/receipt-service";
import type * as VehicleModule from "../app/api/v1/vehicles/_lib/vehicle-service";

/**
 * WP6 order, payment, void, receipt, and stock integration coverage.
 *
 * Services are imported dynamically so `DATABASE_URL` is final before
 * `@workshop-pos/db` loads. The file owns its schema lifecycle and refuses a
 * database whose name does not end `_test`.
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
    throw new Error("Integration database URL is not a valid URL");
  }
  const name = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!name.endsWith("_test")) {
    throw new Error(`This integration file refuses database "${name}"`);
  }
  return name;
}

const BUSINESS_ID = "b6000000-0000-4000-8000-000000000001";
const OUTLET_A = "b6000000-0000-4000-8000-000000000002";
const OUTLET_B = "b6000000-0000-4000-8000-000000000003";

const OWNER_ID = "wp6_owner";
const ADMIN_ID = "wp6_admin";
const CASHIER_A_ID = "wp6_cashier_a";
const CASHIER_B_ID = "wp6_cashier_b";
const MECHANIC_ID = "wp6_mechanic";

const CUSTOMER_ID = "c6000000-0000-4000-8000-000000000001";
const VEHICLE_ID = "c6000000-0000-4000-8000-000000000002";
const PRODUCT_BRK_ID = "c6000000-0000-4000-8000-000000000003";
const SERVICE_OIL_ID = "c6000000-0000-4000-8000-000000000004";
const PRODUCT_PART_ID = "c6000000-0000-4000-8000-000000000005";
const PRODUCT_B_ID = "c6000000-0000-4000-8000-000000000006";
const PRODUCT_ZERO_ID = "c6000000-0000-4000-8000-000000000007";

let db: Database;
let pool: Pool;
let tables: typeof DbModule;
let auth: typeof AuthModule;
let core: typeof CoreModule;
let orders: typeof OrderModule;
let receipts: typeof ReceiptModule;
let vehicles: typeof VehicleModule;

let owner: AuthContext;
let admin: AuthContext;
let cashierA: AuthContext;
let cashierB: AuthContext;
let mechanic: AuthContext;

let ac31OrderId: string;
let ac31Detail: OrderDetail;

function makeContext(
  id: string,
  name: string,
  role: "OWNER" | "ADMIN" | "CASHIER" | "MECHANIC",
  outletIds: string[],
  activeOutletId: string | null,
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

async function auditRows(action: string, entityId?: string) {
  const conditions = [eq(tables.auditLog.action, action)];
  if (entityId) conditions.push(eq(tables.auditLog.entityId, entityId));
  return db.select().from(tables.auditLog).where(and(...conditions));
}

async function stockOf(productId: string): Promise<bigint> {
  const [row] = await db
    .select({
      value: sql<string>`coalesce(sum(${tables.stockLedger.quantityAfter} - ${tables.stockLedger.quantityBefore}), 0)`,
    })
    .from(tables.stockLedger)
    .where(eq(tables.stockLedger.productId, productId));
  return BigInt(row?.value ?? "0");
}

function ledgerRows(orderId: string, entryType: "SALE_DECREMENT" | "SALE_REVERSAL") {
  return db
    .select()
    .from(tables.stockLedger)
    .where(
      and(
        eq(tables.stockLedger.sourceId, orderId),
        eq(tables.stockLedger.entryType, entryType),
      ),
    );
}

function mixedSaleInput(overrides: Partial<CreateOrderRequest> = {}): CreateOrderRequest {
  return {
    kind: "SALE",
    customerId: CUSTOMER_ID,
    vehicleId: VEHICLE_ID,
    lines: [
      { lineType: "PRODUCT", catalogItemId: PRODUCT_BRK_ID, quantity: 1 },
      { lineType: "SERVICE", catalogItemId: SERVICE_OIL_ID, quantity: 1 },
    ],
    discountPercent: 10,
    discountReason: "Promo pelanggan tetap",
    idempotencyKey: randomUUID(),
    ...overrides,
  };
}

function serviceOrderInput(
  context: AuthContext,
  productId?: string,
  overrides: Partial<CreateOrderRequest> = {},
): CreateOrderRequest {
  return {
    kind: "SERVICE",
    outletId: context.activeOutletId ?? OUTLET_A,
    customerId: CUSTOMER_ID,
    vehicleId: VEHICLE_ID,
    lines: [
      ...(productId
        ? [{ lineType: "PRODUCT" as const, catalogItemId: productId, quantity: 1 }]
        : []),
      { lineType: "SERVICE" as const, catalogItemId: SERVICE_OIL_ID, quantity: 1 },
    ],
    idempotencyKey: randomUUID(),
    ...overrides,
  };
}

async function pay(
  context: AuthContext,
  orderId: string,
  method: "CASH" | "TRANSFER" | "QRIS",
  amount: string,
  referenceNote?: string,
) {
  return orders.recordPayment(db, context, {
    orderId,
    method,
    amount,
    referenceNote,
    idempotencyKey: randomUUID(),
  });
}

async function advance(
  context: AuthContext,
  orderId: string,
  to: "ESTIMATED" | "APPROVED" | "IN_PROGRESS" | "COMPLETED" | "DRAFT",
  reason?: string,
) {
  return orders.transitionOrder(db, context, orderId, { to, reason });
}

beforeAll(async () => {
  testDatabaseName(TEST_DATABASE_URL);

  tables = await import("@workshop-pos/db");
  auth = await import("@workshop-pos/auth");
  core = await import("@workshop-pos/core");
  orders = await import("../lib/order-service");
  receipts = await import("../lib/receipt-service");
  vehicles = await import("../app/api/v1/vehicles/_lib/vehicle-service");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");

  await resetSchema();
  const client = tables.createDatabaseClient(TEST_DATABASE_URL);
  db = client.db;
  pool = client.pool;
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

  await db.insert(tables.businesses).values({
    id: BUSINESS_ID,
    name: "Bengkel Uji WP6",
  });
  await db.insert(tables.outlets).values([
    { id: OUTLET_A, businessId: BUSINESS_ID, name: "Outlet Pusat" },
    { id: OUTLET_B, businessId: BUSINESS_ID, name: "Outlet Cabang" },
  ]);
  await db.insert(tables.user).values([
    {
      id: OWNER_ID,
      name: "Rina Uji",
      email: "owner.wp6@example.com",
      businessId: BUSINESS_ID,
      role: "OWNER",
      phone: "081200000030",
    },
    {
      id: ADMIN_ID,
      name: "Andi Uji",
      email: "admin.wp6@example.com",
      businessId: BUSINESS_ID,
      role: "ADMIN",
      phone: "081200000031",
    },
    {
      id: CASHIER_A_ID,
      name: "Dewi Uji",
      email: "cashier.a.wp6@example.com",
      businessId: BUSINESS_ID,
      role: "CASHIER",
      phone: "081200000032",
    },
    {
      id: CASHIER_B_ID,
      name: "Sari Uji",
      email: "cashier.b.wp6@example.com",
      businessId: BUSINESS_ID,
      role: "CASHIER",
      phone: "081200000033",
    },
    {
      id: MECHANIC_ID,
      name: "Agus Uji",
      email: "mechanic.wp6@example.com",
      businessId: BUSINESS_ID,
      role: "MECHANIC",
      phone: "081200000034",
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
      receiptPrefix: "",
      receiptHeaderText: "Jl. Contoh No. 1, Jakarta",
      receiptFooterText: "Terima kasih",
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
  await db.insert(tables.customers).values({
    id: CUSTOMER_ID,
    businessId: BUSINESS_ID,
    name: "Budi Santoso",
    phone: "081234567890",
  });
  await db.insert(tables.vehicles).values({
    id: VEHICLE_ID,
    businessId: BUSINESS_ID,
    customerId: CUSTOMER_ID,
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
      id: PRODUCT_PART_ID,
      businessId: BUSINESS_ID,
      outletId: OUTLET_A,
      sku: "PRT-002",
      name: "Filter oli",
      unit: "pcs",
      cost: 40_000n,
      price: 100_000n,
    },
    {
      id: PRODUCT_B_ID,
      businessId: BUSINESS_ID,
      outletId: OUTLET_B,
      sku: "PRT-B01",
      name: "Busi cabang",
      unit: "pcs",
      cost: 20_000n,
      price: 100_000n,
    },
    {
      id: PRODUCT_ZERO_ID,
      businessId: BUSINESS_ID,
      outletId: OUTLET_A,
      sku: "PRT-Z00",
      name: "Busi kosong",
      unit: "pcs",
      cost: 20_000n,
      price: 50_000n,
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
      productId: PRODUCT_PART_ID,
      entryType: "STOCK_IN",
      quantityBefore: 0,
      quantityAfter: 1_000,
      sourceType: "STOCK_IN",
      reason: "Stok awal",
      createdBy: OWNER_ID,
    },
    {
      businessId: BUSINESS_ID,
      outletId: OUTLET_B,
      productId: PRODUCT_B_ID,
      entryType: "STOCK_IN",
      quantityBefore: 0,
      quantityAfter: 10,
      sourceType: "STOCK_IN",
      reason: "Stok awal",
      createdBy: OWNER_ID,
    },
  ]);

  owner = makeContext(OWNER_ID, "Rina Uji", "OWNER", [OUTLET_A, OUTLET_B], OUTLET_A);
  admin = makeContext(ADMIN_ID, "Andi Uji", "ADMIN", [OUTLET_A, OUTLET_B], OUTLET_A);
  cashierA = makeContext(CASHIER_A_ID, "Dewi Uji", "CASHIER", [OUTLET_A], OUTLET_A);
  cashierB = makeContext(CASHIER_B_ID, "Sari Uji", "CASHIER", [OUTLET_B], OUTLET_B);
  mechanic = makeContext(MECHANIC_ID, "Agus Uji", "MECHANIC", [OUTLET_A], OUTLET_A);
});

afterAll(async () => {
  await pool.end();
});

describe("AC3.1 mixed sale and payment", () => {
  it("recomputes the exact figures, settles stock once, and reaches PAID", async () => {
    const created = await orders.createOrder(db, admin, mixedSaleInput());
    ac31Detail = created.item;
    ac31OrderId = ac31Detail.id;

    expect(ac31Detail.status).toBe("DRAFT");
    expect(ac31Detail.subtotal).toBe("300000");
    expect(ac31Detail.discountTotal).toBe("30000");
    expect(ac31Detail.taxTotal).toBe("29700");
    expect(ac31Detail.total).toBe("299700");
    expect(ac31Detail.lines.map((line) => line.taxAmount)).toEqual(["24750", "4950"]);
    expect(ac31Detail.orderNumber).toMatch(/^INV\/\d{4}\/000001$/);
    expect(ac31Detail.timeline).toHaveLength(1);
    expect(ac31Detail.timeline[0]?.toStatus).toBe("DRAFT");
    expect(await stockOf(PRODUCT_BRK_ID)).toBe(20n);

    const paid = await pay(cashierA, ac31OrderId, "CASH", "300000");
    expect(paid.item.status).toBe("PAID");
    expect(paid.payment.amount).toBe("299700");
    expect(paid.payment.changeAmount).toBe("300");
    expect(paid.item.paidTotal).toBe("299700");
    expect(paid.item.changeTotal).toBe("300");
    expect(paid.item.balanceDue).toBe("0");
    expect(paid.item.receiptAvailable).toBe(true);
    expect(paid.item.timeline.map((event) => event.toStatus)).toEqual(["DRAFT", "PAID"]);

    expect(await stockOf(PRODUCT_BRK_ID)).toBe(19n);
    const decrements = await ledgerRows(ac31OrderId, "SALE_DECREMENT");
    expect(decrements).toHaveLength(1);
    expect(decrements[0]?.quantityBefore).toBe(20);
    expect(decrements[0]?.quantityAfter).toBe(19);

    const audit = await auditRows("order.discount_override", ac31OrderId);
    expect(audit).toHaveLength(1);
    expect(audit[0]?.reason).toBe("Promo pelanggan tetap");
  });

  it("blocks an empty order, invalid quantities, and invalid discounts", async () => {
    const empty = await expectRejection(
      () => orders.createOrder(db, admin, mixedSaleInput({ lines: [] })),
      "VALIDATION_ERROR",
    );
    expect(empty.fieldErrors?.lines?.join(" ")).toContain("Tambahkan minimal satu item.");

    await expectRejection(
      () =>
        orders.createOrder(
          db,
          admin,
          mixedSaleInput({
            lines: [{ lineType: "PRODUCT", catalogItemId: PRODUCT_PART_ID, quantity: 0 }],
          }),
        ),
      "VALIDATION_ERROR",
    );

    await expectRejection(
      () =>
        orders.createOrder(
          db,
          admin,
          mixedSaleInput({ discountPercent: 101, discountReason: "Terlalu besar" }),
        ),
      "VALIDATION_ERROR",
    );

    await expectRejection(
      () =>
        orders.createOrder(
          db,
          admin,
          mixedSaleInput({
            lines: [
              {
                lineType: "PRODUCT",
                catalogItemId: PRODUCT_PART_ID,
                quantity: 1,
                discountPercent: 101,
              },
            ],
          }),
        ),
      "VALIDATION_ERROR",
    );
  });

  it("denies a Cashier discount above the cap and audits the attempt", async () => {
    const input = mixedSaleInput({
      lines: [{ lineType: "PRODUCT", catalogItemId: PRODUCT_PART_ID, quantity: 1 }],
    });
    const error = await expectRejection(
      () => orders.createOrder(db, cashierA, input),
      "FORBIDDEN",
    );
    expect(error.message).toContain("Minta persetujuan Admin atau Pemilik");

    const audit = await auditRows("order.discount_denied", input.idempotencyKey);
    expect(audit).toHaveLength(1);
    expect(audit[0]?.actorId).toBe(CASHIER_A_ID);
  });

  it("requires an approval reason for an Admin override and audits it", async () => {
    const noReason = mixedSaleInput({
      lines: [{ lineType: "PRODUCT", catalogItemId: PRODUCT_PART_ID, quantity: 1 }],
      discountReason: undefined,
    });
    const error = await expectRejection(
      () => orders.createOrder(db, admin, noReason),
      "VALIDATION_ERROR",
    );
    expect(error.fieldErrors?.discountReason?.length).toBe(1);

    const approved = await orders.createOrder(
      db,
      admin,
      mixedSaleInput({
        lines: [{ lineType: "PRODUCT", catalogItemId: PRODUCT_PART_ID, quantity: 1 }],
        discountReason: "Pelanggan langganan",
      }),
    );
    const audit = await auditRows("order.discount_override", approved.item.id);
    expect(audit).toHaveLength(1);
    expect(audit[0]?.actorId).toBe(ADMIN_ID);
    expect(audit[0]?.after).toMatchObject({ discountTotal: "10000" });
  });

  it("requires a vehicle when any line is a service", async () => {
    const error = await expectRejection(
      () =>
        orders.createOrder(
          db,
          cashierA,
          mixedSaleInput({ vehicleId: null, customerId: null }),
        ),
      "VALIDATION_ERROR",
    );
    expect(error.fieldErrors?.vehicleId?.length).toBe(1);
  });

  it("accepts a product-only walk-in sale without a customer or vehicle", async () => {
    const result = await orders.createOrder(db, cashierA, {
      kind: "SALE",
      lines: [{ lineType: "PRODUCT", catalogItemId: PRODUCT_PART_ID, quantity: 2 }],
      idempotencyKey: randomUUID(),
    });
    expect(result.item.customer).toBeNull();
    expect(result.item.vehicle).toBeNull();
    expect(result.item.subtotal).toBe("200000");
    expect(result.item.taxTotal).toBe("22000");
    expect(result.item.total).toBe("222000");
  });
});

describe("idempotency (BR-011, AC3.6)", () => {
  it("returns the original order for a replay and conflicts on a different body", async () => {
    const input = mixedSaleInput({
      lines: [{ lineType: "PRODUCT", catalogItemId: PRODUCT_PART_ID, quantity: 1 }],
      discountPercent: undefined,
      discountReason: undefined,
    });

    const first = await orders.createOrder(db, admin, input);
    const second = await orders.createOrder(db, admin, input);
    expect(second.item.id).toBe(first.item.id);
    expect(second.item.orderNumber).toBe(first.item.orderNumber);

    const rows = await db
      .select()
      .from(tables.orders)
      .where(eq(tables.orders.id, first.item.id));
    expect(rows).toHaveLength(1);

    await expectRejection(
      () => orders.createOrder(db, admin, { ...input, notes: "isi berbeda" }),
      "CONFLICT",
    );
  });

  it("creates exactly one order under a concurrent double submit", async () => {
    const input = mixedSaleInput({
      lines: [{ lineType: "PRODUCT", catalogItemId: PRODUCT_PART_ID, quantity: 1 }],
      discountPercent: undefined,
      discountReason: undefined,
    });

    const [first, second] = await Promise.all([
      orders.createOrder(db, admin, input),
      orders.createOrder(db, admin, input),
    ]);
    expect(first.item.id).toBe(second.item.id);

    const rows = await db
      .select()
      .from(tables.orders)
      .where(eq(tables.orders.id, first.item.id));
    expect(rows).toHaveLength(1);
  });
});

describe("payments (BR-009, AC7.1–AC7.5)", () => {
  it("reaches PAID with a split tender and lists both payments", async () => {
    const created = await orders.createOrder(db, admin, mixedSaleInput());
    const orderId = created.item.id;

    const first = await pay(cashierA, orderId, "CASH", "100000");
    expect(first.item.status).toBe("DRAFT");
    expect(first.item.balanceDue).toBe("199700");

    const second = await pay(cashierA, orderId, "TRANSFER", "199700", "TRF-001");
    expect(second.item.status).toBe("PAID");
    expect(second.item.balanceDue).toBe("0");
    expect(second.item.payments).toHaveLength(2);
    expect(second.item.payments.map((payment) => payment.method)).toEqual([
      "CASH",
      "TRANSFER",
    ]);
    expect(second.item.timeline.map((event) => event.toStatus)).toEqual([
      "DRAFT",
      "PAID",
    ]);

    const decrements = await ledgerRows(orderId, "SALE_DECREMENT");
    expect(decrements).toHaveLength(1);
  });

  it("leaves a partially paid completed order unfinished", async () => {
    const created = await orders.createOrder(db, cashierA, serviceOrderInput(cashierA));
    const orderId = created.item.id;
    await advance(cashierA, orderId, "ESTIMATED");
    await advance(cashierA, orderId, "APPROVED");
    await advance(cashierA, orderId, "IN_PROGRESS");
    await advance(cashierA, orderId, "COMPLETED");

    const partial = await pay(cashierA, orderId, "CASH", "10000");
    expect(partial.item.status).toBe("COMPLETED");
    expect(partial.item.balanceDue).toBe(String(BigInt(partial.item.total) - 10_000n));
  });

  it("rejects non-cash overpayment and stores cash change", async () => {
    const created = await orders.createOrder(db, cashierA, {
      kind: "SALE",
      lines: [{ lineType: "PRODUCT", catalogItemId: PRODUCT_PART_ID, quantity: 1 }],
      idempotencyKey: randomUUID(),
    });
    const orderId = created.item.id;
    const total = BigInt(created.item.total);

    const error = await expectRejection(
      () => pay(cashierA, orderId, "TRANSFER", String(total + 1n), "TRF-OVER"),
      "VALIDATION_ERROR",
    );
    expect(error.fieldErrors?.amount?.[0]).toContain("tidak boleh melebihi sisa tagihan");

    const cash = await pay(cashierA, orderId, "CASH", String(total + 5_000n));
    expect(cash.payment.amount).toBe(String(total));
    expect(cash.payment.changeAmount).toBe("5000");
    expect(cash.item.status).toBe("PAID");
    expect(cash.item.balanceDue).toBe("0");
    expect(cash.item.changeTotal).toBe("5000");
  });

  it("rejects a method outside cash/transfer/QRIS at the boundary", async () => {
    const { recordPaymentSchema } = await import("@workshop-pos/contracts");
    const parsed = recordPaymentSchema.safeParse({
      orderId: ac31OrderId,
      method: "CARD",
      amount: "1000",
      idempotencyKey: randomUUID(),
    });
    expect(parsed.success).toBe(false);
  });
});

describe("estimates (AC5.1–AC5.4)", () => {
  it("issues and approves an estimate, blocking payment and edits in between", async () => {
    const created = await orders.createOrder(db, cashierA, serviceOrderInput(cashierA));
    const orderId = created.item.id;

    const estimated = await advance(cashierA, orderId, "ESTIMATED");
    expect(estimated.item.status).toBe("ESTIMATED");
    expect((await auditRows("order.estimate_issued", orderId))).toHaveLength(1);

    const blocked = await expectRejection(
      () => pay(cashierA, orderId, "CASH", "10000"),
      "CONFLICT",
    );
    expect(blocked.message).toContain("Estimasi belum dapat dibayar");

    await expectRejection(
      () =>
        orders.addOrderLine(db, cashierA, orderId, {
          lineType: "PRODUCT",
          catalogItemId: PRODUCT_PART_ID,
          quantity: 1,
        }),
      "CONFLICT",
    );
    await expectRejection(
      () =>
        orders.updateOrderLine(db, admin, orderId, created.item.lines[0]!.id, {
          quantity: 2,
        }),
      "CONFLICT",
    );

    const approved = await advance(cashierA, orderId, "APPROVED");
    expect(approved.item.status).toBe("APPROVED");
    const audit = await auditRows("order.estimate_approved", orderId);
    expect(audit).toHaveLength(1);
    expect(audit[0]?.actorId).toBe(CASHIER_A_ID);
  });

  it("allows only Admin/Owner to revert an estimate, with an audited reason", async () => {
    const created = await orders.createOrder(db, cashierA, serviceOrderInput(cashierA));
    const orderId = created.item.id;
    await advance(cashierA, orderId, "ESTIMATED");

    await expectRejection(
      () => advance(cashierA, orderId, "DRAFT", "Salah harga"),
      "FORBIDDEN",
    );
    await expectRejection(() => advance(admin, orderId, "DRAFT", "x"), "VALIDATION_ERROR");

    const reverted = await advance(admin, orderId, "DRAFT", "Harga spare part berubah");
    expect(reverted.item.status).toBe("DRAFT");
    const audit = await auditRows("order.estimate_reverted", orderId);
    expect(audit).toHaveLength(1);
    expect(audit[0]?.reason).toBe("Harga spare part berubah");

    const edited = await orders.addOrderLine(db, cashierA, orderId, {
      lineType: "PRODUCT",
      catalogItemId: PRODUCT_PART_ID,
      quantity: 1,
    });
    expect(edited.item.lines).toHaveLength(2);
  });
});

describe("completion and stock (AC6.1–AC6.2, AC11.5)", () => {
  it("decrements stock exactly once at completion and rejects a repeat", async () => {
    const before = await stockOf(PRODUCT_PART_ID);
    const created = await orders.createOrder(
      db,
      cashierA,
      serviceOrderInput(cashierA, PRODUCT_PART_ID),
    );
    const orderId = created.item.id;
    await advance(cashierA, orderId, "ESTIMATED");
    await advance(cashierA, orderId, "APPROVED");
    await advance(cashierA, orderId, "IN_PROGRESS");

    const completed = await advance(admin, orderId, "COMPLETED");
    expect(completed.item.status).toBe("COMPLETED");
    expect(completed.item.completedAt).not.toBeNull();

    expect((await ledgerRows(orderId, "SALE_DECREMENT")).length).toBe(1);
    expect(await stockOf(PRODUCT_PART_ID)).toBe(before - 1n);

    await expectRejection(() => advance(admin, orderId, "COMPLETED"), "CONFLICT");
    expect((await ledgerRows(orderId, "SALE_DECREMENT")).length).toBe(1);
  });

  it("settles once when paid during work and refuses a later completion", async () => {
    const created = await orders.createOrder(
      db,
      cashierA,
      serviceOrderInput(cashierA, PRODUCT_PART_ID),
    );
    const orderId = created.item.id;
    await advance(cashierA, orderId, "ESTIMATED");
    await advance(cashierA, orderId, "APPROVED");
    await advance(cashierA, orderId, "IN_PROGRESS");

    const paid = await pay(cashierA, orderId, "CASH", created.item.total);
    expect(paid.item.status).toBe("PAID");
    expect((await ledgerRows(orderId, "SALE_DECREMENT")).length).toBe(1);

    const error = await expectRejection(() => advance(admin, orderId, "COMPLETED"), "CONFLICT");
    expect(error.message).toContain("PAID");
    expect((await ledgerRows(orderId, "SALE_DECREMENT")).length).toBe(1);
  });
});

describe("void and refund (BR-008, AC9.1–AC9.5)", () => {
  it("restores stock once for an unpaid void and refuses non-Admin roles", async () => {
    const created = await orders.createOrder(
      db,
      cashierA,
      serviceOrderInput(cashierA, PRODUCT_PART_ID),
    );
    const orderId = created.item.id;
    await advance(cashierA, orderId, "ESTIMATED");
    await advance(cashierA, orderId, "APPROVED");
    await advance(cashierA, orderId, "IN_PROGRESS");
    await advance(cashierA, orderId, "COMPLETED");
    const afterCompletion = await stockOf(PRODUCT_PART_ID);

    await expectRejection(
      () => orders.voidOrder(db, cashierA, orderId, { reason: "Salah input pelanggan" }),
      "FORBIDDEN",
    );
    const denial = await auditRows("rbac.denied", orderId);
    expect(denial.some((row) => row.actorId === CASHIER_A_ID)).toBe(true);

    await expectRejection(
      () => orders.voidOrder(db, admin, orderId, { reason: "salah" }),
      "VALIDATION_ERROR",
    );

    const voided = await orders.voidOrder(db, admin, orderId, {
      reason: "Salah input pelanggan",
    });
    expect(voided.item.status).toBe("VOID");
    expect(voided.item.receiptAvailable).toBe(false);
    expect(await stockOf(PRODUCT_PART_ID)).toBe(afterCompletion + 1n);
    expect((await ledgerRows(orderId, "SALE_REVERSAL")).length).toBe(1);

    const audit = await auditRows("order.void_unpaid", orderId);
    expect(audit).toHaveLength(1);
    expect(audit[0]?.reason).toBe("Salah input pelanggan");

    await expectRejection(
      () => orders.voidOrder(db, owner, orderId, { reason: "Salah input pelanggan" }),
      "CONFLICT",
    );
  });

  it("limits a paid void to the Owner and refunds every tender", async () => {
    const created = await orders.createOrder(db, admin, mixedSaleInput());
    const orderId = created.item.id;
    const beforeStock = await stockOf(PRODUCT_BRK_ID);

    const cash = await pay(cashierA, orderId, "CASH", "100000");
    const split = await pay(cashierA, orderId, "TRANSFER", "199700", "TRF-002");
    expect(split.item.status).toBe("PAID");

    await expectRejection(
      () => orders.voidOrder(db, admin, orderId, { reason: "Salah input pelanggan" }),
      "FORBIDDEN",
    );
    const denial = await auditRows("rbac.denied", orderId);
    expect(denial.some((row) => row.actorId === ADMIN_ID)).toBe(true);

    await expectRejection(
      () =>
        orders.voidOrder(db, owner, orderId, { reason: "Pelanggan membatalkan pekerjaan" }, async () => true),
      "VALIDATION_ERROR",
    );
    await expectRejection(
      () =>
        orders.voidOrder(
          db,
          owner,
          orderId,
          { reason: "Pelanggan membatalkan pekerjaan", password: "salah" },
          async (password) => password === "kunci-owner",
        ),
      "FORBIDDEN",
    );
    expect((await auditRows("order.void_reauth_denied", orderId)).length).toBe(1);

    const voided = await orders.voidOrder(
      db,
      owner,
      orderId,
      { reason: "Pelanggan membatalkan pekerjaan", password: "kunci-owner" },
      async (password) => password === "kunci-owner",
    );
    expect(voided.item.status).toBe("VOID");
    expect(voided.item.receiptAvailable).toBe(true);

    const refundRows = await db
      .select()
      .from(tables.refunds)
      .where(eq(tables.refunds.orderId, orderId));
    expect(refundRows).toHaveLength(2);
    expect(refundRows.map((row) => row.method).sort()).toEqual(["CASH", "TRANSFER"]);
    const refundTotal = refundRows.reduce((sum, row) => sum + row.amount, 0n);
    expect(refundTotal).toBe(BigInt(cash.payment.amount) + BigInt(split.payment.amount));

    expect((await ledgerRows(orderId, "SALE_REVERSAL")).length).toBe(1);
    expect(await stockOf(PRODUCT_BRK_ID)).toBe(beforeStock);

    expect(voided.item.refunds).toHaveLength(2);
    expect(
      voided.item.refunds.reduce((sum, refund) => sum + BigInt(refund.amount), 0n),
    ).toBe(BigInt(cash.payment.amount) + BigInt(split.payment.amount));

    const document = await receipts.getReceiptDocument(db, owner, orderId, "RECEIPT");
    expect(document.isVoided).toBe(true);
    expect(document.rows.join("\n")).toContain("DIBATALKAN");
  });
});

describe("payment correction (FR-048, D-11)", () => {
  it("corrects a pre-paid tender with before/after audit and refuses after PAID", async () => {
    const created = await orders.createOrder(db, cashierA, {
      kind: "SALE",
      lines: [{ lineType: "PRODUCT", catalogItemId: PRODUCT_PART_ID, quantity: 1 }],
      idempotencyKey: randomUUID(),
    });
    const orderId = created.item.id;
    const paid = await pay(cashierA, orderId, "CASH", "10000");

    const corrected = await orders.correctPayment(db, admin, paid.payment.id, {
      amount: "20000",
      method: "TRANSFER",
      referenceNote: "TRF-KOREKSI",
      reason: "Salah pilih metode",
    });
    expect(corrected.payment.amount).toBe("20000");
    expect(corrected.payment.method).toBe("TRANSFER");

    const audit = await auditRows("order.payment_corrected", paid.payment.id);
    expect(audit).toHaveLength(1);
    expect(audit[0]?.before).toMatchObject({
      method: "CASH",
      amount: "10000",
    });
    expect(audit[0]?.after).toMatchObject({
      method: "TRANSFER",
      amount: "20000",
    });
    expect(audit[0]?.reason).toBe("Salah pilih metode");

    await expectRejection(
      () => orders.correctPayment(db, cashierA, paid.payment.id, { amount: "30000", reason: "Coba" }),
      "FORBIDDEN",
    );

    await pay(cashierA, orderId, "CASH", String(BigInt(created.item.total) - 20000n));
    await expectRejection(
      () => orders.correctPayment(db, admin, paid.payment.id, { amount: "30000", reason: "Coba" }),
      "CONFLICT",
    );
  });
});

describe("RBAC and outlet scoping (BR-012)", () => {
  it("denies another outlet's order read and audits the cross-outlet attempt", async () => {
    const created = await orders.createOrder(db, cashierA, serviceOrderInput(cashierA));
    const orderId = created.item.id;

    await expectRejection(
      () => orders.getOrderDetail(db, cashierB, orderId),
      "FORBIDDEN",
    );
    const audit = await auditRows("rbac.cross_outlet_denied", orderId);
    expect(audit.some((row) => row.actorId === CASHIER_B_ID)).toBe(true);

    await expectRejection(
      () =>
        orders.createOrder(db, cashierB, {
          ...serviceOrderInput(cashierA),
          outletId: OUTLET_A,
        }),
      "FORBIDDEN",
    );
  });

  it("shows a Mechanic only assigned work and denies other orders", async () => {
    const assigned = await orders.createOrder(db, cashierA, {
      ...serviceOrderInput(cashierA),
      technicianId: MECHANIC_ID,
    });
    const other = await orders.createOrder(db, cashierA, serviceOrderInput(cashierA));

    const list = await orders.listOrders(db, mechanic, { page: 1, pageSize: 100 });
    const ids = list.items.map((item) => item.id);
    expect(ids).toContain(assigned.item.id);
    expect(ids).not.toContain(other.item.id);

    await expectRejection(
      () => orders.getOrderDetail(db, mechanic, other.item.id),
      "FORBIDDEN",
    );
  });

  it("ignores a client-supplied total", async () => {
    const parsed = createOrderSchema.parse({
      ...serviceOrderInput(cashierA),
      subtotal: "1",
      total: "1",
      taxTotal: "0",
    });
    const created = await orders.createOrder(db, cashierA, parsed);
    expect(created.item.total).not.toBe("1");
    expect(created.item.total).toBe("55500");
  });
});

describe("receipts and estimates (FR-040, FR-047)", () => {
  it("renders AC3.1 exactly, counts reprints, and stamps copies", async () => {
    const original = await receipts.getReceiptDocument(db, cashierA, ac31OrderId, "RECEIPT");
    const text = original.rows.join("\n");

    expect(original.paperWidth).toBe(58);
    expect(original.columns).toBe(35);
    expect(original.isReprint).toBe(false);
    expect(text).toContain("Kampas rem depan");
    expect(text).toContain("Ganti oli mesin");
    expect(text).toContain(core.formatIdr(300_000n));
    expect(text).toContain(core.formatIdr(30_000n));
    expect(text).toContain(core.formatIdr(29_700n));
    expect(text).toContain(core.formatIdr(299_700n));
    expect(text).toContain("Tunai");
    expect(text).toContain("Kembali");
    expect(text).toContain("B1234XYZ");
    for (const row of original.rows) {
      expect(row.length).toBeLessThanOrEqual(35);
    }

    const first = await receipts.printReceiptDocument(
      db,
      cashierA,
      ac31OrderId,
      "RECEIPT",
    );
    expect(first.isReprint).toBe(false);
    expect(first.reprintCount).toBe(0);

    const second = await receipts.printReceiptDocument(
      db,
      cashierA,
      ac31OrderId,
      "RECEIPT",
    );
    expect(second.isReprint).toBe(true);
    expect(second.reprintCount).toBe(1);
    expect(second.rows.join("\n")).toContain("SALINAN");
    expect(second.total).toBe(first.total);

    const prints = await auditRows("receipt.printed", ac31OrderId);
    expect(prints).toHaveLength(2);
  });

  it("refuses a receipt before payment and renders an estimate for a draft service order", async () => {
    const created = await orders.createOrder(db, cashierA, serviceOrderInput(cashierA));
    const orderId = created.item.id;

    const error = await expectRejection(
      () => receipts.getReceiptDocument(db, cashierA, orderId, "RECEIPT"),
      "CONFLICT",
    );
    expect(error.message).toContain("setelah pembayaran");

    const estimate = await receipts.getReceiptDocument(db, cashierA, orderId, "ESTIMATE");
    expect(estimate.title).toBe("ESTIMASI");
    expect(estimate.rows.join("\n")).toContain("Bukan bukti pembayaran.");
    expect(estimate.rows.join("\n")).not.toContain("Tunai");
  });

  it("honours the 80 mm template configured for the second outlet", async () => {
    const created = await orders.createOrder(db, owner, {
      kind: "SALE",
      outletId: OUTLET_B,
      lines: [{ lineType: "PRODUCT", catalogItemId: PRODUCT_B_ID, quantity: 1 }],
      idempotencyKey: randomUUID(),
    });
    await pay(owner, created.item.id, "CASH", created.item.total);
    const document = await receipts.getReceiptDocument(db, owner, created.item.id, "RECEIPT");

    expect(document.paperWidth).toBe(80);
    expect(document.columns).toBe(48);
    for (const row of document.rows) {
      expect(row.length).toBeLessThanOrEqual(48);
    }
  });
});


describe("review regressions", () => {
  it("persists and re-prices a percent line discount", async () => {
    const created = await orders.createOrder(db, admin, {
      kind: "SALE",
      discountReason: "Diskon pelanggan langganan",
      lines: [
        {
          lineType: "PRODUCT",
          catalogItemId: PRODUCT_PART_ID,
          quantity: 1,
          discountPercent: 10,
        },
      ],
      idempotencyKey: randomUUID(),
    });
    expect(created.item.lines[0]?.discountPercent).toBe(10);
    expect(created.item.lines[0]?.discountAmount).toBe("10000");
    expect(created.item.total).toBe("99900");

    // Any later re-price used to throw "both shapes" for this stored line.
    const added = await orders.addOrderLine(db, admin, created.item.id, {
      lineType: "PRODUCT",
      catalogItemId: PRODUCT_PART_ID,
      quantity: 1,
      discountReason: "Diskon pelanggan langganan",
    });
    expect(added.item.lines).toHaveLength(2);
    expect(added.item.total).toBe("210900");
  });

  it("rolls back a whole completion when one line is out of stock", async () => {
    const partBefore = await stockOf(PRODUCT_PART_ID);
    const created = await orders.createOrder(db, cashierA, {
      kind: "SERVICE",
      customerId: CUSTOMER_ID,
      vehicleId: VEHICLE_ID,
      lines: [
        { lineType: "PRODUCT", catalogItemId: PRODUCT_PART_ID, quantity: 1 },
        { lineType: "PRODUCT", catalogItemId: PRODUCT_ZERO_ID, quantity: 1 },
      ],
      idempotencyKey: randomUUID(),
    });
    await advance(cashierA, created.item.id, "ESTIMATED");
    await advance(cashierA, created.item.id, "APPROVED");
    await advance(cashierA, created.item.id, "IN_PROGRESS");

    await expectRejection(
      () => advance(admin, created.item.id, "COMPLETED"),
      "CONFLICT",
    );

    const detail = await orders.getOrderDetail(db, cashierA, created.item.id);
    expect(detail.item.status).toBe("IN_PROGRESS");
    expect((await ledgerRows(created.item.id, "SALE_DECREMENT")).length).toBe(0);
    expect(await stockOf(PRODUCT_PART_ID)).toBe(partBefore);
  });

  it("settles to PAID when a correction brings the tender up to the total", async () => {
    const created = await orders.createOrder(db, cashierA, {
      kind: "SALE",
      lines: [{ lineType: "PRODUCT", catalogItemId: PRODUCT_PART_ID, quantity: 1 }],
      idempotencyKey: randomUUID(),
    });
    const partial = await pay(cashierA, created.item.id, "CASH", "50000");

    const corrected = await orders.correctPayment(db, admin, partial.payment.id, {
      amount: created.item.total,
      reason: "Koreksi jumlah pembayaran",
    });
    expect(corrected.item.status).toBe("PAID");
    expect(corrected.item.paidAt).not.toBeNull();
    expect(corrected.item.balanceDue).toBe("0");
    expect((await ledgerRows(created.item.id, "SALE_DECREMENT")).length).toBe(1);
    expect(corrected.item.timeline.map((event) => event.toStatus)).toContain("PAID");
  });

  it("refunds a partially paid order when it is voided", async () => {
    const created = await orders.createOrder(db, cashierA, {
      kind: "SALE",
      lines: [{ lineType: "PRODUCT", catalogItemId: PRODUCT_PART_ID, quantity: 1 }],
      idempotencyKey: randomUUID(),
    });
    const partial = await pay(cashierA, created.item.id, "CASH", "10000");
    expect(partial.item.status).toBe("DRAFT");

    const voided = await orders.voidOrder(db, admin, created.item.id, {
      reason: "Pelanggan membatalkan pembelian",
    });
    expect(voided.item.status).toBe("VOID");

    const refundRows = await db
      .select()
      .from(tables.refunds)
      .where(eq(tables.refunds.orderId, created.item.id));
    expect(refundRows).toHaveLength(1);
    expect(refundRows[0]?.amount).toBe(10_000n);
    expect(voided.item.refunds).toHaveLength(1);
    expect(voided.item.refunds[0]?.amount).toBe("10000");
    expect((await ledgerRows(created.item.id, "SALE_REVERSAL")).length).toBe(0);
  });

  it("refuses an edit that would fall below the money already collected", async () => {
    const created = await orders.createOrder(db, cashierA, {
      kind: "SALE",
      lines: [{ lineType: "PRODUCT", catalogItemId: PRODUCT_PART_ID, quantity: 2 }],
      idempotencyKey: randomUUID(),
    });
    expect(created.item.total).toBe("222000");
    await pay(cashierA, created.item.id, "CASH", "150000");

    await expectRejection(
      () =>
        orders.updateOrderLine(db, cashierA, created.item.id, created.item.lines[0]!.id, {
          quantity: 1,
        }),
      "CONFLICT",
    );
  });

  it("does not stamp the first receipt SALINAN after an estimate print", async () => {
    const created = await orders.createOrder(db, cashierA, serviceOrderInput(cashierA));
    const estimate = await receipts.printReceiptDocument(
      db,
      cashierA,
      created.item.id,
      "ESTIMATE",
    );
    expect(estimate.isReprint).toBe(false);

    await advance(cashierA, created.item.id, "ESTIMATED");
    await advance(cashierA, created.item.id, "APPROVED");
    await advance(cashierA, created.item.id, "IN_PROGRESS");
    await advance(cashierA, created.item.id, "COMPLETED");
    await pay(cashierA, created.item.id, "CASH", created.item.total);

    const receipt = await receipts.getReceiptDocument(
      db,
      cashierA,
      created.item.id,
      "RECEIPT",
    );
    expect(receipt.isReprint).toBe(false);
    expect(receipt.reprintCount).toBe(0);
    expect(receipt.rows.join("\n")).not.toContain("SALINAN");
  });

  it("assigns a Mechanic's own intake so it is readable immediately", async () => {
    const created = await orders.createOrder(db, mechanic, {
      kind: "SERVICE",
      customerId: CUSTOMER_ID,
      vehicleId: VEHICLE_ID,
      lines: [{ lineType: "SERVICE", catalogItemId: SERVICE_OIL_ID, quantity: 1 }],
      idempotencyKey: randomUUID(),
    });

    expect(created.item.technician?.id).toBe(MECHANIC_ID);
    const detail = await orders.getOrderDetail(db, mechanic, created.item.id);
    expect(detail.item.id).toBe(created.item.id);
    const list = await orders.listOrders(db, mechanic, { page: 1, pageSize: 100 });
    expect(list.items.map((item) => item.id)).toContain(created.item.id);
  });

  it("edits a discounted order header without re-approving the discount", async () => {
    const created = await orders.createOrder(db, admin, mixedSaleInput());
    expect((await auditRows("order.discount_override", created.item.id)).length).toBe(1);

    const updated = await orders.updateOrderHeader(db, admin, created.item.id, {
      notes: "Pelanggan menunggu di ruang tunggu",
      technicianId: MECHANIC_ID,
    });
    expect(updated.item.notes).toBe("Pelanggan menunggu di ruang tunggu");
    expect(updated.item.technician?.id).toBe(MECHANIC_ID);
    expect(updated.item.total).toBe(created.item.total);
    expect((await auditRows("order.discount_override", created.item.id)).length).toBe(1);

    await expectRejection(
      () => orders.updateOrderHeader(db, admin, created.item.id, { discountPercent: 20 }),
      "VALIDATION_ERROR",
    );
    const reapproved = await orders.updateOrderHeader(db, admin, created.item.id, {
      discountPercent: 20,
      discountReason: "Pelanggan langganan",
    });
    expect(reapproved.item.total).not.toBe(created.item.total);
    expect((await auditRows("order.discount_override", created.item.id)).length).toBe(2);
  });

  it("accepts only an active Mechanic as a technician", async () => {
    const error = await expectRejection(
      () =>
        orders.createOrder(db, admin, {
          kind: "SALE",
          technicianId: CASHIER_A_ID,
          lines: [{ lineType: "PRODUCT", catalogItemId: PRODUCT_PART_ID, quantity: 1 }],
          idempotencyKey: randomUUID(),
        }),
      "VALIDATION_ERROR",
    );
    expect(error.fieldErrors?.technicianId?.length).toBe(1);
  });
});

describe("vehicle history regression (WP5)", () => {
  it("shows the paid order with the settled total", async () => {
    const history = await vehicles.getVehicleHistory(db, cashierA, VEHICLE_ID, {
      page: 1,
      pageSize: 100,
    });
    const entry = history.orders.find((item) => item.id === ac31OrderId);
    expect(entry).toBeDefined();
    expect(entry?.status).toBe("PAID");
    expect(entry?.paidTotal).toBe("299700");
    expect(entry?.balanceDue).toBe("0");
    expect(BigInt(history.totals.totalSpent)).toBeGreaterThanOrEqual(299_700n);
  });
});
