import * as SQLite from "expo-sqlite";

import type { SqlDatabase, SqlParam } from "./executor";

/** expo-sqlite adapter. One connection per app process, opened lazily. */
export function createExpoSqlDatabase(name = "workshop-pos.db"): SqlDatabase {
  const handle = SQLite.openDatabaseSync(name);

  const database: SqlDatabase = {
    async exec(sql) {
      await handle.execAsync(sql);
    },
    async run(sql, params: readonly SqlParam[] = []) {
      const result = await handle.runAsync(sql, [...params]);
      return { changes: result.changes };
    },
    async all<T>(sql: string, params: readonly SqlParam[] = []) {
      return handle.getAllAsync<T>(sql, [...params]);
    },
    async transaction<T>(work: (db: SqlDatabase) => Promise<T>) {
      let outcome: T | undefined;
      let failed = false;
      let failure: unknown;
      await handle.withExclusiveTransactionAsync(async (txn) => {
        const scoped: SqlDatabase = {
          exec: async (sql) => {
            await txn.execAsync(sql);
          },
          run: async (sql, params = []) => {
            const result = await txn.runAsync(sql, [...params]);
            return { changes: result.changes };
          },
          all: async <R>(sql: string, params: readonly SqlParam[] = []) =>
            txn.getAllAsync<R>(sql, [...params]),
          transaction: async <R>(inner: (db: SqlDatabase) => Promise<R>) => inner(scoped),
          close: async () => undefined,
        };
        try {
          outcome = await work(scoped);
        } catch (error) {
          failed = true;
          failure = error;
          throw error;
        }
      });
      if (failed) throw failure;
      return outcome as T;
    },
    async close() {
      await handle.closeAsync();
    },
  };

  return database;
}
