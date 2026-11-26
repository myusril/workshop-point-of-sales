import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  SEED_BUSINESS_ID,
  SEED_OUTLET_ID,
  SEED_PRODUCT_ID,
} from "../src/seed/fixtures.ts";
import { seedDatabase } from "../src/seed/seed.ts";
import {
  auditLog,
  orderLines,
  orders,
  orderStatusEvents,
  payments,
  refunds,
  stockLedger,
} from "../src/schema/index.ts";
import {
  closeTestDatabase,
  expectDatabaseError,
  prepareTestDatabase,
  type TestDatabase,
  type TestDatabaseHandle,
} from "./helpers.ts";

const CREATED_BY = "seed_owner_rina";

let handle: TestDatabaseHandle;
let db: TestDatabase;

async function createOrder(
  overrides: Partial<typeof orders.$inferInsert> = {},
) {
  const [row] = await db
    .insert(orders)
    .values({
      businessId: SEED_BUSINESS_ID,
      outletId: SEED_OUTLET_ID,
      kind: "SALE",
      taxRate: 11,
      subtotal: 300000n,
      discountTotal: 30000n,
      taxTotal: 29700n,
      total: 299700n,
      createdBy: CREATED_BY,
      ...overrides,
    })
    .returning();
  if (!row) throw new Error("order insert returned no row");
  return row;
}

async function createPayment(
  orderId: string,
  overrides: Partial<typeof payments.$inferInsert> = {},
) {
  const [row] = await db
    .insert(payments)
    .values({
      orderId,
      method: "CASH",
      amount: 299700n,
      createdBy: CREATED_BY,
      ...overrides,
    })
    .returning();
  if (!row) throw new Error("payment insert returned no row");
  return row;
}

async function createLine(orderId: string) {
  const [row] = await db
    .insert(orderLines)
    .values({
      orderId,
      lineType: "PRODUCT",
      productId: SEED_PRODUCT_ID,
      description: "Kampas rem depan",
      quantity: 1,
      unitPrice: 250000n,
      lineTotal: 250000n,
    })
    .returning();
  if (!row) throw new Error("order line insert returned no row");
  return row;
}

async function markPaid(orderId: string) {
  await db
    .update(orders)
    .set({ status: "PAID", paidAt: new Date() })
    .where(eq(orders.id, orderId));
}

beforeAll(async () => {
  handle = await prepareTestDatabase();
  db = handle.db;
  await seedDatabase(db);
});

afterAll(async () => {
  await closeTestDatabase(handle);
});

describe("paid and void order history", () => {
  it("rejects a money edit on a PAID order", async () => {
    const order = await createOrder();
    await markPaid(order.id);

    const error = await expectDatabaseError(() =>
      db.update(orders).set({ total: 100n }).where(eq(orders.id, order.id)),
    );
    expect(error.code).toBe("P0001");
    expect(error.message).toContain("immutable");
  });

  it("rejects a non-VOID status change on a PAID order", async () => {
    const order = await createOrder();
    await markPaid(order.id);

    const error = await expectDatabaseError(() =>
      db.update(orders).set({ status: "COMPLETED" }).where(eq(orders.id, order.id)),
    );
    expect(error.code).toBe("P0001");
  });

  it("allows the PAID to VOID transition and treats VOID as terminal", async () => {
    const order = await createOrder();
    await markPaid(order.id);

    const [voided] = await db
      .update(orders)
      .set({
        status: "VOID",
        voidedAt: new Date(),
        voidReason: "Pelanggan membatalkan pekerjaan",
      })
      .where(eq(orders.id, order.id))
      .returning();
    expect(voided?.status).toBe("VOID");

    const terminal = await expectDatabaseError(() =>
      db
        .update(orders)
        .set({ voidReason: "Alasan lain yang lebih panjang" })
        .where(eq(orders.id, order.id)),
    );
    expect(terminal.code).toBe("P0001");
  });

  it("rejects a PAID to VOID transition that also rewrites money", async () => {
    const order = await createOrder();
    await markPaid(order.id);

    const error = await expectDatabaseError(() =>
      db
        .update(orders)
        .set({
          status: "VOID",
          total: 1n,
          voidedAt: new Date(),
          voidReason: "Pelanggan membatalkan pekerjaan",
        })
        .where(eq(orders.id, order.id)),
    );
    expect(error.code).toBe("P0001");
  });

  it("keeps pre-PAID updates allowed", async () => {
    const order = await createOrder();

    const [updated] = await db
      .update(orders)
      .set({ status: "ESTIMATED", total: 250000n })
      .where(eq(orders.id, order.id))
      .returning();

    expect(updated?.status).toBe("ESTIMATED");
    expect(updated?.total).toBe(250000n);
  });
});

describe("payments of paid and void orders", () => {
  it("allows correcting a payment before the order is paid", async () => {
    const order = await createOrder();
    const payment = await createPayment(order.id);

    const [updated] = await db
      .update(payments)
      .set({ amount: 290000n })
      .where(eq(payments.id, payment.id))
      .returning();

    expect(updated?.amount).toBe(290000n);
  });

  it("rejects updating or deleting a payment of a PAID order", async () => {
    const order = await createOrder();
    const payment = await createPayment(order.id);
    await markPaid(order.id);

    const updateError = await expectDatabaseError(() =>
      db.update(payments).set({ amount: 100n }).where(eq(payments.id, payment.id)),
    );
    expect(updateError.code).toBe("P0001");
    expect(updateError.message).toContain("immutable");

    const deleteError = await expectDatabaseError(() =>
      db.delete(payments).where(eq(payments.id, payment.id)),
    );
    expect(deleteError.code).toBe("P0001");
  });

  it("rejects payment changes once the order is VOID", async () => {
    const order = await createOrder();
    const payment = await createPayment(order.id);
    await db
      .update(orders)
      .set({
        status: "VOID",
        voidedAt: new Date(),
        voidReason: "Pelanggan membatalkan pekerjaan",
      })
      .where(eq(orders.id, order.id));

    const error = await expectDatabaseError(() =>
      db.update(payments).set({ method: "TRANSFER" }).where(eq(payments.id, payment.id)),
    );
    expect(error.code).toBe("P0001");
  });
});

describe("order lines of paid and void orders", () => {
  it("allows line edits while the order is editable", async () => {
    const order = await createOrder();
    const line = await createLine(order.id);

    const [updated] = await db
      .update(orderLines)
      .set({ quantity: 2, lineTotal: 500000n })
      .where(eq(orderLines.id, line.id))
      .returning();

    expect(updated?.quantity).toBe(2);
  });

  it("rejects inserting, updating, or deleting a line on a PAID order", async () => {
    const order = await createOrder();
    const line = await createLine(order.id);
    await markPaid(order.id);

    const insertError = await expectDatabaseError(() => createLine(order.id));
    expect(insertError.code).toBe("P0001");

    const updateError = await expectDatabaseError(() =>
      db
        .update(orderLines)
        .set({ quantity: 5 })
        .where(eq(orderLines.id, line.id)),
    );
    expect(updateError.code).toBe("P0001");

    const deleteError = await expectDatabaseError(() =>
      db.delete(orderLines).where(eq(orderLines.id, line.id)),
    );
    expect(deleteError.code).toBe("P0001");
  });
});

describe("whole-payment refunds", () => {
  it("accepts a refund that matches the payment", async () => {
    const order = await createOrder();
    const payment = await createPayment(order.id);

    const [refund] = await db
      .insert(refunds)
      .values({
        orderId: order.id,
        paymentId: payment.id,
        method: "CASH",
        amount: 299700n,
        reason: "Void seluruh pesanan",
        createdBy: CREATED_BY,
      })
      .returning();

    expect(refund?.amount).toBe(299700n);
  });

  it("rejects a refund whose amount differs from the payment", async () => {
    const order = await createOrder();
    const payment = await createPayment(order.id);

    const error = await expectDatabaseError(() =>
      db.insert(refunds).values({
        orderId: order.id,
        paymentId: payment.id,
        method: "CASH",
        amount: 1n,
        reason: "Refund sebagian",
        createdBy: CREATED_BY,
      }),
    );
    expect(error.code).toBe("P0001");
    expect(error.message).toContain("does not match payment amount");
  });

  it("rejects a refund whose method differs from the payment", async () => {
    const order = await createOrder();
    const payment = await createPayment(order.id);

    const error = await expectDatabaseError(() =>
      db.insert(refunds).values({
        orderId: order.id,
        paymentId: payment.id,
        method: "TRANSFER",
        amount: 299700n,
        reason: "Void seluruh pesanan",
        createdBy: CREATED_BY,
      }),
    );
    expect(error.code).toBe("P0001");
    expect(error.message).toContain("does not match payment method");
  });

  it("rejects a refund that references another order's payment", async () => {
    const firstOrder = await createOrder();
    const firstPayment = await createPayment(firstOrder.id);
    const secondOrder = await createOrder();

    const error = await expectDatabaseError(() =>
      db.insert(refunds).values({
        orderId: secondOrder.id,
        paymentId: firstPayment.id,
        method: "CASH",
        amount: 299700n,
        reason: "Void seluruh pesanan",
        createdBy: CREATED_BY,
      }),
    );
    expect(error.code).toBe("P0001");
    expect(error.message).toContain("does not match payment order");
  });
});

describe("server-assigned chronology", () => {
  it("overwrites a caller-supplied created_at on ledgers and the order timeline", async () => {
    const backdated = new Date("2024-01-01T00:00:00Z");
    const order = await createOrder();

    const [audit] = await db
      .insert(auditLog)
      .values({
        businessId: SEED_BUSINESS_ID,
        action: "audit.backdated",
        entityType: "orders",
        entityId: order.id,
        createdAt: backdated,
      })
      .returning();
    const [ledger] = await db
      .insert(stockLedger)
      .values({
        businessId: SEED_BUSINESS_ID,
        outletId: SEED_OUTLET_ID,
        productId: SEED_PRODUCT_ID,
        entryType: "ADJUSTMENT",
        quantityBefore: 20,
        quantityAfter: 21,
        sourceType: "ADJUSTMENT",
        reason: "Uji stempel waktu server",
        createdBy: CREATED_BY,
        createdAt: backdated,
      })
      .returning();
    const [event] = await db
      .insert(orderStatusEvents)
      .values({
        orderId: order.id,
        fromStatus: "DRAFT",
        toStatus: "ESTIMATED",
        actorId: CREATED_BY,
        createdAt: backdated,
      })
      .returning();

    for (const row of [audit, ledger, event]) {
      if (!row) throw new Error("insert returned no row");
      expect(row.createdAt).toBeInstanceOf(Date);
      expect(row.createdAt.getTime()).toBeGreaterThan(backdated.getTime());
      expect(row.createdAt.getTime()).toBeLessThanOrEqual(Date.now() + 60_000);
    }
  });
});
