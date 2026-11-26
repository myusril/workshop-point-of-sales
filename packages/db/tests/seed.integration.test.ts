import { count, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  SEED_BUSINESS_ID,
  SEED_OUTLET_ID,
  SEED_PRODUCT_ID,
} from "../src/seed/fixtures.ts";
import { seedDatabase, type SeedCounts } from "../src/seed/seed.ts";
import { stockOnHand } from "../src/query/stock.ts";
import { account, businesses, orders, stockLedger, user } from "../src/schema/index.ts";
import {
  closeTestDatabase,
  prepareTestDatabase,
  type TestDatabase,
  type TestDatabaseHandle,
} from "./helpers.ts";

let handle: TestDatabaseHandle;
let db: TestDatabase;
let firstRun: SeedCounts;
let secondRun: SeedCounts;

const expectedCounts = {
  businesses: 1,
  outlets: 1,
  settings: 1,
  users: 4,
  staffOutlets: 4,
  products: 1,
  services: 1,
  customers: 1,
  vehicles: 1,
  stockLedgerEntries: 1,
};

beforeAll(async () => {
  handle = await prepareTestDatabase();
  db = handle.db;
  firstRun = await seedDatabase(db);
  secondRun = await seedDatabase(db);
});

afterAll(async () => {
  await closeTestDatabase(handle);
});

describe("seed idempotency", () => {
  it("produces the fixture counts on the first run", () => {
    expect(firstRun).toMatchObject(expectedCounts);
    expect(firstRun.stockOnHand).toBe(20n);
  });

  it("produces identical counts on a second run", () => {
    expect(secondRun).toMatchObject(expectedCounts);
    expect(secondRun.stockOnHand).toBe(20n);
  });

  it("keeps exactly one row per fixture and one opening ledger row", async () => {
    const [users] = await db.select({ value: count() }).from(user);
    const [ledgerRows] = await db
      .select({ value: count() })
      .from(stockLedger)
      .where(eq(stockLedger.productId, SEED_PRODUCT_ID));

    expect(users?.value).toBe(4);
    expect(ledgerRows?.value).toBe(1);
    expect(
      await stockOnHand(
        db,
        { businessId: SEED_BUSINESS_ID, outletIds: [SEED_OUTLET_ID] },
        SEED_PRODUCT_ID,
      ),
    ).toBe(20n);
  });

  it("writes no credential rows and no password hashes", async () => {
    const [accounts] = await db.select({ value: count() }).from(account);
    expect(accounts?.value).toBe(0);

    const { rows } = await handle.pool.query<{ count: string }>(
      `select count(*)::text as count
         from public."user"
        where "username" is not null`,
    );
    expect(rows[0]?.count).toBe("0");
  });
});

describe("seed guard", () => {
  const FOREIGN_BUSINESS_ID = "f0000000-0000-4000-8000-0000000000c1";

  it("refuses to seed a database that contains a non-seed business", async () => {
    await db
      .insert(businesses)
      .values({ id: FOREIGN_BUSINESS_ID, name: "Bengkel Lain" });

    try {
      await expect(seedDatabase(db)).rejects.toThrow(/non-seed business/);
    } finally {
      await db.delete(businesses).where(eq(businesses.id, FOREIGN_BUSINESS_ID));
    }

    const [users] = await db.select({ value: count() }).from(user);
    expect(users?.value).toBe(4);
  });

  it("refuses to seed a database that already contains orders", async () => {
    await db.insert(orders).values({
      businessId: SEED_BUSINESS_ID,
      outletId: SEED_OUTLET_ID,
      kind: "SALE",
      taxRate: 11,
      subtotal: 0n,
      discountTotal: 0n,
      taxTotal: 0n,
      total: 0n,
      createdBy: "seed_owner_rina",
    });

    await expect(seedDatabase(db)).rejects.toThrow(/already contains orders/);

    const [users] = await db.select({ value: count() }).from(user);
    expect(users?.value).toBe(4);
    const [ledgerRows] = await db.select({ value: count() }).from(stockLedger);
    expect(ledgerRows?.value).toBe(1);
  });
});
