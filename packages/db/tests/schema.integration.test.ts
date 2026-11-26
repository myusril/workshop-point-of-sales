import { eq } from "drizzle-orm";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import {
  SEED_BUSINESS_ID,
  SEED_CUSTOMER_ID,
  SEED_OPENING_LEDGER_ID,
  SEED_OPENING_STOCK,
  SEED_OUTLET_ID,
  SEED_PRODUCT_ID,
  SEED_SERVICE_ID,
  SEED_USERS,
} from "../src/seed/fixtures.ts";
import { seedDatabase } from "../src/seed/seed.ts";
import {
  deviceTokens,
  idempotencyKeys,
  orders,
  orderLines,
  payments,
  refunds,
  stockLedger,
  vehicles,
} from "../src/schema/index.ts";
import {
  closeTestDatabase,
  expectDatabaseError,
  prepareTestDatabase,
  type TestDatabase,
  type TestDatabaseHandle,
} from "./helpers.ts";

let handle: TestDatabaseHandle;
let db: TestDatabase;

const CREATED_BY = "seed_owner_rina";

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

async function createPayment(orderId: string) {
  const [row] = await db
    .insert(payments)
    .values({
      orderId,
      method: "CASH",
      amount: 299700n,
      createdBy: CREATED_BY,
    })
    .returning();
  if (!row) throw new Error("payment insert returned no row");
  return row;
}

beforeAll(async () => {
  handle = await prepareTestDatabase();
  db = handle.db;
  await seedDatabase(db);
});

afterAll(async () => {
  await closeTestDatabase(handle);
});

const MONEY_COLUMNS: readonly (readonly [string, string])[] = [
  ["orders", "subtotal"],
  ["orders", "discount_total"],
  ["orders", "tax_total"],
  ["orders", "total"],
  ["order_lines", "unit_price"],
  ["order_lines", "discount_amount"],
  ["order_lines", "tax_amount"],
  ["order_lines", "line_total"],
  ["products", "cost"],
  ["products", "price"],
  ["services", "price"],
  ["payments", "amount"],
  ["payments", "change_amount"],
  ["refunds", "amount"],
];

describe("schema constraints", () => {
  it("stores every money column in bigint and round-trips a 299700 rupiah total", async () => {
    const pairs = MONEY_COLUMNS.map(
      ([table, column]) => `('${table}', '${column}')`,
    ).join(", ");
    const { rows: moneyColumns } = await handle.pool.query<{
      table_name: string;
      column_name: string;
      data_type: string;
    }>(
      `select table_name, column_name, data_type
         from information_schema.columns
        where table_schema = 'public'
          and (table_name, column_name) in (${pairs})
        order by table_name, column_name`,
    );

    expect(moneyColumns.length).toBe(MONEY_COLUMNS.length);
    expect(
      moneyColumns.map((column) => `${column.table_name}.${column.column_name}`).sort(),
    ).toEqual(
      MONEY_COLUMNS.map(([table, column]) => `${table}.${column}`).sort(),
    );
    for (const column of moneyColumns) {
      expect(`${column.table_name}.${column.column_name}: ${column.data_type}`).toBe(
        `${column.table_name}.${column.column_name}: bigint`,
      );
    }

    const order = await createOrder();
    const [stored] = await db
      .select({ total: orders.total })
      .from(orders)
      .where(eq(orders.id, order.id));

    expect(stored?.total).toBe(299700n);
    expect(typeof stored?.total).toBe("bigint");
  });

  it("rejects negative money (23514)", async () => {
    const error = await expectDatabaseError(() => createOrder({ total: -1n }));
    expect(error.code).toBe("23514");
  });

  it("rejects a non-normalized plate and a duplicate plate per business", async () => {
    const invalidPlate = await expectDatabaseError(() =>
      db.insert(vehicles).values({
        businessId: SEED_BUSINESS_ID,
        customerId: SEED_CUSTOMER_ID,
        normalizedPlate: "b1234xyz",
        brand: "Honda",
        model: "Beat 110",
      }),
    );
    expect(invalidPlate.code).toBe("23514");

    const duplicatePlate = await expectDatabaseError(() =>
      db.insert(vehicles).values({
        businessId: SEED_BUSINESS_ID,
        customerId: SEED_CUSTOMER_ID,
        normalizedPlate: "B1234XYZ",
        brand: "Honda",
        model: "Beat 110",
      }),
    );
    expect(duplicatePlate.code).toBe("23505");
  });

  it("allows exactly one catalog item per order line (23514)", async () => {
    const order = await createOrder();

    const bothItems = await expectDatabaseError(() =>
      db.insert(orderLines).values({
        orderId: order.id,
        lineType: "PRODUCT",
        productId: SEED_PRODUCT_ID,
        serviceId: SEED_SERVICE_ID,
        description: "Ambiguous line",
        quantity: 1,
        unitPrice: 250000n,
        lineTotal: 250000n,
      }),
    );
    expect(bothItems.code).toBe("23514");

    const zeroQuantity = await expectDatabaseError(() =>
      db.insert(orderLines).values({
        orderId: order.id,
        lineType: "PRODUCT",
        productId: SEED_PRODUCT_ID,
        description: "Kampas rem depan",
        quantity: 0,
        unitPrice: 250000n,
        lineTotal: 0n,
      }),
    );
    expect(zeroQuantity.code).toBe("23514");
  });

  it("accepts a valid product line and service line", async () => {
    const order = await createOrder();

    const [productLine] = await db
      .insert(orderLines)
      .values({
        orderId: order.id,
        lineType: "PRODUCT",
        productId: SEED_PRODUCT_ID,
        description: "Kampas rem depan",
        quantity: 1,
        unitPrice: 250000n,
        lineTotal: 250000n,
      })
      .returning();
    const [serviceLine] = await db
      .insert(orderLines)
      .values({
        orderId: order.id,
        lineType: "SERVICE",
        serviceId: SEED_SERVICE_ID,
        description: "Ganti oli mesin",
        quantity: 1,
        unitPrice: 50000n,
        lineTotal: 50000n,
      })
      .returning();

    expect(productLine?.lineType).toBe("PRODUCT");
    expect(serviceLine?.lineType).toBe("SERVICE");
  });

  it("enforces the 0..100 tax-rate range (23514)", async () => {
    const error = await expectDatabaseError(() => createOrder({ taxRate: 101 }));
    expect(error.code).toBe("23514");
  });

  it("requires a vehicle for a service order (23514)", async () => {
    const error = await expectDatabaseError(() =>
      createOrder({ kind: "SERVICE", vehicleId: null }),
    );
    expect(error.code).toBe("23514");
  });

  it("refuses a second refund on the same payment (23505)", async () => {
    const order = await createOrder();
    const payment = await createPayment(order.id);

    await db.insert(refunds).values({
      orderId: order.id,
      paymentId: payment.id,
      method: "CASH",
      amount: 299700n,
      reason: "Void seluruh pesanan",
      createdBy: CREATED_BY,
    });

    const duplicate = await expectDatabaseError(() =>
      db.insert(refunds).values({
        orderId: order.id,
        paymentId: payment.id,
        method: "CASH",
        amount: 299700n,
        reason: "Void seluruh pesanan",
        createdBy: CREATED_BY,
      }),
    );
    expect(duplicate.code).toBe("23505");
  });

  it("blocks a negative stock result without an override and accepts it with one", async () => {
    const withoutOverride = await expectDatabaseError(() =>
      db.insert(stockLedger).values({
        businessId: SEED_BUSINESS_ID,
        outletId: SEED_OUTLET_ID,
        productId: SEED_PRODUCT_ID,
        entryType: "ADJUSTMENT",
        quantityBefore: 20,
        quantityAfter: -1,
        sourceType: "ADJUSTMENT",
        reason: "Koreksi stok",
        createdBy: SEED_OPENING_STOCK.createdBy,
      }),
    );
    expect(withoutOverride.code).toBe("23514");

    const overrideWithoutReason = await expectDatabaseError(() =>
      db.insert(stockLedger).values({
        businessId: SEED_BUSINESS_ID,
        outletId: SEED_OUTLET_ID,
        productId: SEED_PRODUCT_ID,
        entryType: "ADJUSTMENT",
        quantityBefore: 20,
        quantityAfter: -1,
        override: true,
        sourceType: "ADJUSTMENT",
        createdBy: SEED_OPENING_STOCK.createdBy,
      }),
    );
    expect(overrideWithoutReason.code).toBe("23514");

    const [overridden] = await db
      .insert(stockLedger)
      .values({
        businessId: SEED_BUSINESS_ID,
        outletId: SEED_OUTLET_ID,
        productId: SEED_PRODUCT_ID,
        entryType: "ADJUSTMENT",
        quantityBefore: 20,
        quantityAfter: -1,
        override: true,
        reason: "Stok fisik belum diinput",
        sourceType: "ADJUSTMENT",
        createdBy: SEED_OPENING_STOCK.createdBy,
      })
      .returning();

    expect(overridden?.quantityAfter).toBe(-1);
    expect(overridden?.override).toBe(true);
  });

  it("requires SHA-256 hex hashes on device tokens and idempotency keys (23514)", async () => {
    const rawToken = await expectDatabaseError(() =>
      db.insert(deviceTokens).values({
        userId: "seed_owner_rina",
        tokenHash: "raw-bearer-token",
      }),
    );
    expect(rawToken.code).toBe("23514");

    const upperCaseDigest = await expectDatabaseError(() =>
      db.insert(deviceTokens).values({
        userId: "seed_owner_rina",
        tokenHash: "A".repeat(64),
      }),
    );
    expect(upperCaseDigest.code).toBe("23514");

    const [token] = await db
      .insert(deviceTokens)
      .values({
        userId: "seed_owner_rina",
        tokenHash: "a".repeat(64),
        label: "Tablet kasir",
      })
      .returning();
    expect(token?.tokenHash).toHaveLength(64);

    const shortHash = await expectDatabaseError(() =>
      db.insert(idempotencyKeys).values({
        businessId: SEED_BUSINESS_ID,
        key: "order.create:short",
        operation: "order.create",
        requestHash: "abc",
      }),
    );
    expect(shortHash.code).toBe("23514");

    const [idempotencyKey] = await db
      .insert(idempotencyKeys)
      .values({
        businessId: SEED_BUSINESS_ID,
        key: "order.create:valid",
        operation: "order.create",
        requestHash: "0123456789abcdef".repeat(4),
      })
      .returning();
    expect(idempotencyKey?.requestHash).toHaveLength(64);
  });

  it("keeps stock ledger entry and source types consistent (23514)", async () => {
    const base = {
      businessId: SEED_BUSINESS_ID,
      outletId: SEED_OUTLET_ID,
      productId: SEED_PRODUCT_ID,
      quantityBefore: 20,
      quantityAfter: 21,
      createdBy: SEED_OPENING_STOCK.createdBy,
    };

    const stockInWithOrderSource = await expectDatabaseError(() =>
      db.insert(stockLedger).values({
        ...base,
        entryType: "STOCK_IN",
        sourceType: "ORDER",
        sourceId: SEED_OPENING_LEDGER_ID,
      }),
    );
    expect(stockInWithOrderSource.code).toBe("23514");

    const adjustmentWithOrderSource = await expectDatabaseError(() =>
      db.insert(stockLedger).values({
        ...base,
        entryType: "ADJUSTMENT",
        sourceType: "ORDER",
        sourceId: SEED_OPENING_LEDGER_ID,
      }),
    );
    expect(adjustmentWithOrderSource.code).toBe("23514");

    const saleWithoutLine = await expectDatabaseError(() =>
      db.insert(stockLedger).values({
        ...base,
        entryType: "SALE_DECREMENT",
        sourceType: "ORDER",
        sourceId: SEED_OPENING_LEDGER_ID,
      }),
    );
    expect(saleWithoutLine.code).toBe("23514");

    const order = await createOrder();
    const [line] = await db
      .insert(orderLines)
      .values({
        orderId: order.id,
        lineType: "PRODUCT",
        productId: SEED_PRODUCT_ID,
        description: "Kampas rem depan",
        quantity: 1,
        unitPrice: 250000n,
        lineTotal: 250000n,
      })
      .returning();
    if (!line) throw new Error("order line insert returned no row");

    const saleWithoutSourceId = await expectDatabaseError(() =>
      db.insert(stockLedger).values({
        ...base,
        entryType: "SALE_DECREMENT",
        sourceType: "ORDER",
        orderLineId: line.id,
      }),
    );
    expect(saleWithoutSourceId.code).toBe("23514");

    const [sale] = await db
      .insert(stockLedger)
      .values({
        ...base,
        entryType: "SALE_DECREMENT",
        sourceType: "ORDER",
        sourceId: order.id,
        orderLineId: line.id,
      })
      .returning();
    expect(sale?.entryType).toBe("SALE_DECREMENT");
    expect(sale?.orderLineId).toBe(line.id);
  });

  it("has no stock-on-hand column on products", async () => {
    const { rows } = await handle.pool.query<{ count: string }>(
      `select count(*)::text as count
         from information_schema.columns
        where table_schema = 'public'
          and table_name = 'products'
          and column_name = 'stock_on_hand'`,
    );
    expect(rows[0]?.count).toBe("0");
  });

  it("seeds four staff rows, one per role", async () => {
    const { rows } = await handle.pool.query<{ id: string; role: string }>(
      `select id, role from public."user" order by id`,
    );

    expect(rows).toEqual(
      [...SEED_USERS]
        .map((fixture) => ({ id: fixture.id, role: fixture.role }))
        .sort((left, right) => left.id.localeCompare(right.id)),
    );
  });
});
