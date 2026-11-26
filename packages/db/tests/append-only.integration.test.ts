import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  SEED_BUSINESS_ID,
  SEED_OPENING_LEDGER_ID,
  SEED_OPENING_STOCK,
  SEED_OUTLET_ID,
  SEED_PRODUCT_ID,
} from "../src/seed/fixtures.ts";
import { seedDatabase } from "../src/seed/seed.ts";
import {
  closeTestDatabase,
  expectDatabaseError,
  prepareTestDatabase,
  TEST_DATABASE_URL,
  type TestDatabase,
  type TestDatabaseHandle,
} from "./helpers.ts";

let handle: TestDatabaseHandle;
let db: TestDatabase;
let appRw: Client;

const READ_UPDATE_GRANTS = [
  "businesses",
  "outlets",
  "products",
  "services",
  "customers",
  "vehicles",
  "orders",
  "payments",
  "settings",
  "idempotency_keys",
  "sync_keys",
  "user",
];

const READ_UPDATE_DELETE_GRANTS = [
  "staff_outlets",
  "device_tokens",
  "login_attempts",
  "order_lines",
  "session",
  "account",
  "verification",
];

const READ_INSERT_GRANTS = [
  "refunds",
  "stock_ledger",
  "audit_log",
  "order_status_events",
];

beforeAll(async () => {
  handle = await prepareTestDatabase();
  db = handle.db;
  await seedDatabase(db);

  appRw = new Client({ connectionString: TEST_DATABASE_URL });
  await appRw.connect();
  await appRw.query("SET ROLE app_rw");
});

afterAll(async () => {
  await appRw.end();
  await closeTestDatabase(handle);
});

describe("append-only enforcement and grants", () => {
  it("connects as the least-privilege application role", async () => {
    const { rows } = await appRw.query<{ current_user: string }>(
      "select current_user",
    );
    expect(rows[0]?.current_user).toBe("app_rw");
  });

  it("lets app_rw append to the stock ledger but not update or delete it", async () => {
    const inserted = await appRw.query(
      `insert into stock_ledger
         (business_id, outlet_id, product_id, entry_type, quantity_before,
          quantity_after, source_type, created_by)
       values ($1, $2, $3, 'STOCK_IN', 20, 21, 'STOCK_IN', $4)
       returning id`,
      [SEED_BUSINESS_ID, SEED_OUTLET_ID, SEED_PRODUCT_ID, SEED_OPENING_STOCK.createdBy],
    );
    expect(inserted.rowCount).toBe(1);

    const updateError = await expectDatabaseError(() =>
      appRw.query("update stock_ledger set reason = 'tampered' where id = $1", [
        SEED_OPENING_LEDGER_ID,
      ]),
    );
    expect(updateError.code).toBe("42501");

    const deleteError = await expectDatabaseError(() =>
      appRw.query("delete from stock_ledger where id = $1", [SEED_OPENING_LEDGER_ID]),
    );
    expect(deleteError.code).toBe("42501");
  });

  it("lets app_rw append to the audit log but not update or delete it", async () => {
    const inserted = await appRw.query(
      `insert into audit_log (business_id, action, entity_type, entity_id)
       values ($1, 'settings.update', 'settings', 'seed-settings')
       returning id`,
      [SEED_BUSINESS_ID],
    );
    expect(inserted.rowCount).toBe(1);

    const updateError = await expectDatabaseError(() =>
      appRw.query("update audit_log set reason = 'tampered'"),
    );
    expect(updateError.code).toBe("42501");

    const deleteError = await expectDatabaseError(() =>
      appRw.query("delete from audit_log"),
    );
    expect(deleteError.code).toBe("42501");
  });

  it("denies app_rw destructive operations on financial history", async () => {
    const deleteOrder = await expectDatabaseError(() =>
      appRw.query("delete from orders"),
    );
    expect(deleteOrder.code).toBe("42501");

    const updateRefund = await expectDatabaseError(() =>
      appRw.query("update refunds set amount = 1"),
    );
    expect(updateRefund.code).toBe("42501");

    const deleteRefund = await expectDatabaseError(() =>
      appRw.query("delete from refunds"),
    );
    expect(deleteRefund.code).toBe("42501");

    const updateEvent = await expectDatabaseError(() =>
      appRw.query("update order_status_events set reason = 'tampered'"),
    );
    expect(updateEvent.code).toBe("42501");

    const deleteEvent = await expectDatabaseError(() =>
      appRw.query("delete from order_status_events"),
    );
    expect(deleteEvent.code).toBe("42501");
  });

  it("grants app_rw SELECT on every public table, verified as the owner", async () => {
    const { rows: tables } = await handle.pool.query<{ relname: string }>(
      `select c.relname
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
        order by c.relname`,
    );

    expect(tables.length).toBe(23);
    for (const table of tables) {
      const { rows } = await handle.pool.query<{ allowed: boolean }>(
        `select has_table_privilege(
                  'app_rw',
                  format('%I.%I', 'public', $1::text),
                  'SELECT'
                ) as allowed`,
        [table.relname],
      );
      expect(`${table.relname}:${rows[0]?.allowed}`).toBe(`${table.relname}:true`);
    }
  });

  it("never grants app_rw TRUNCATE on append-only or financial tables", async () => {
    const { rows } = await handle.pool.query<{
      ledger: boolean;
      audit: boolean;
      orders: boolean;
    }>(
      `select has_table_privilege('app_rw', 'public.stock_ledger', 'TRUNCATE') as ledger,
              has_table_privilege('app_rw', 'public.audit_log', 'TRUNCATE') as audit,
              has_table_privilege('app_rw', 'public.orders', 'TRUNCATE') as orders`,
    );

    expect(rows[0]).toEqual({ ledger: false, audit: false, orders: false });
  });

  it("grants exactly the documented privilege groups", async () => {
    const expected: Record<string, string[]> = {};
    for (const table of READ_UPDATE_GRANTS) {
      expected[table] = ["INSERT", "SELECT", "UPDATE"];
    }
    for (const table of READ_UPDATE_DELETE_GRANTS) {
      expected[table] = ["DELETE", "INSERT", "SELECT", "UPDATE"];
    }
    for (const table of READ_INSERT_GRANTS) {
      expected[table] = ["INSERT", "SELECT"];
    }

    expect(Object.keys(expected)).toHaveLength(23);
    expect(READ_UPDATE_GRANTS).toHaveLength(12);
    expect(READ_UPDATE_DELETE_GRANTS).toHaveLength(7);
    expect(READ_INSERT_GRANTS).toHaveLength(4);

    const { rows } = await handle.pool.query<{
      table_name: string;
      privilege_type: string;
    }>(
      `select table_name, privilege_type
         from information_schema.role_table_grants
        where grantee = 'app_rw' and table_schema = 'public'
        order by table_name, privilege_type`,
    );

    const actual: Record<string, string[]> = {};
    for (const row of rows) {
      const list = actual[row.table_name] ?? [];
      list.push(row.privilege_type);
      actual[row.table_name] = list;
    }

    expect(actual).toEqual(expected);
  });

  it("blocks UPDATE and DELETE on append-only tables for the owner too", async () => {
    const updateError = await expectDatabaseError(() =>
      handle.pool.query("update stock_ledger set reason = 'owner tamper' where id = $1", [
        SEED_OPENING_LEDGER_ID,
      ]),
    );
    expect(updateError.code).toBe("P0001");
    expect(updateError.message).toContain("append-only");

    const { rows } = await handle.pool.query<{ id: string }>(
      `insert into audit_log (business_id, action, entity_type, entity_id)
       values ($1, 'test.owner-delete', 'audit_log', 'owner-delete')
       returning id`,
      [SEED_BUSINESS_ID],
    );
    const auditId = rows[0]?.id;
    if (!auditId) throw new Error("audit insert returned no row");

    const deleteError = await expectDatabaseError(() =>
      handle.pool.query("delete from audit_log where id = $1", [auditId]),
    );
    expect(deleteError.code).toBe("P0001");
    expect(deleteError.message).toContain("append-only");
  });
});
