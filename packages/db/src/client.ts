import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema/index.ts";
import { requireDatabaseUrl } from "./env.ts";

export type Database = NodePgDatabase<typeof schema>;

export interface DatabaseClient {
  pool: Pool;
  db: Database;
}

/**
 * Creates the pool and Drizzle handle without connecting. Callers own the
 * lifecycle and must `await pool.end()` when finished.
 */
export function createDatabaseClient(url: string): DatabaseClient {
  const pool = new Pool({ connectionString: url, max: 10 });
  const db = drizzle(pool, { schema });
  return { pool, db };
}

export function createDatabaseClientFromEnv(): DatabaseClient {
  return createDatabaseClient(requireDatabaseUrl());
}
