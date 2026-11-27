import { DatabaseSync } from "node:sqlite";

import type { SqlDatabase, SqlParam } from "@/src/db/executor";

/**
 * Test-only SQLite adapter. The queue, cache, and conflict tests run against
 * real SQLite (`node:sqlite`) so the DDL, foreign keys, and transaction
 * boundaries are exercised exactly as on the device.
 */

function createScoped(handle: DatabaseSync): SqlDatabase {
  const scoped: SqlDatabase = {
    async exec(sql) {
      handle.exec(sql);
    },
    async run(sql, params: readonly SqlParam[] = []) {
      const statement = handle.prepare(sql);
      const result = statement.run(...params);
      return { changes: Number(result.changes) };
    },
    async all<T>(sql: string, params: readonly SqlParam[] = []) {
      return handle.prepare(sql).all(...params) as T[];
    },
    async transaction<T>(work: (db: SqlDatabase) => Promise<T>) {
      return withTransaction(handle, scoped, work);
    },
    async close() {
      handle.close();
    },
  };
  return scoped;
}

async function withTransaction<T>(
  handle: DatabaseSync,
  scoped: SqlDatabase,
  work: (db: SqlDatabase) => Promise<T>,
): Promise<T> {
  handle.exec("BEGIN IMMEDIATE");
  try {
    const result = await work(scoped);
    handle.exec("COMMIT");
    return result;
  } catch (error) {
    handle.exec("ROLLBACK");
    throw error;
  }
}

export function createNodeSqlDatabase(path = ":memory:"): SqlDatabase {
  const handle = new DatabaseSync(path);
  handle.exec("PRAGMA foreign_keys = ON");
  handle.exec("PRAGMA journal_mode = WAL");
  return createScoped(handle);
}
