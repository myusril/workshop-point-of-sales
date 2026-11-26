import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  closeTestDatabase,
  migrateTestDatabase,
  resetPublicSchema,
  type TestDatabaseHandle,
} from "./helpers.ts";

let handle: TestDatabaseHandle | undefined;

async function appliedMigrationCount(pool: TestDatabaseHandle["pool"]): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    "select count(*)::text as count from drizzle.__drizzle_migrations",
  );
  return Number(rows[0]?.count ?? "0");
}

beforeAll(async () => {
  await resetPublicSchema();
});

afterAll(async () => {
  if (handle) await closeTestDatabase(handle);
});

describe("migrations", () => {
  it("applies the schema and guard migrations", async () => {
    handle = await migrateTestDatabase();

    expect(await appliedMigrationCount(handle.pool)).toBe(4);

    const { rows: tableRows } = await handle.pool.query<{ count: string }>(
      `select count(*)::text as count
         from information_schema.tables
        where table_schema = 'public' and table_type = 'BASE TABLE'`,
    );
    expect(Number(tableRows[0]?.count ?? "0")).toBe(23);

    const { rows: triggerRows } = await handle.pool.query<{ tgname: string }>(
      `select tgname from pg_trigger where not tgisinternal order by tgname`,
    );
    expect(triggerRows.map((row) => row.tgname)).toEqual([
      "audit_log_append_only_guard",
      "audit_log_server_created_at",
      "order_lines_paid_immutable_guard",
      "order_status_events_server_created_at",
      "orders_paid_immutable_guard",
      "payments_paid_immutable_guard",
      "refunds_full_refund_guard",
      "stock_ledger_append_only_guard",
      "stock_ledger_server_created_at",
    ]);
  });

  it("is a no-op when run a second time", async () => {
    if (!handle) throw new Error("first migration test did not run");
    const before = await appliedMigrationCount(handle.pool);

    const second = await migrateTestDatabase();
    try {
      expect(await appliedMigrationCount(second.pool)).toBe(before);
    } finally {
      await closeTestDatabase(second);
    }
  });
});
