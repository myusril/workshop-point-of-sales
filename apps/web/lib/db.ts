import { Pool } from "pg";

const globalForDatabase = globalThis as unknown as {
  workshopPosPool?: Pool;
};

/**
 * Returns the process-wide PostgreSQL pool.
 *
 * The pool is created lazily so `next build` and static rendering never need a
 * live database. The guard on `globalThis` keeps Next.js dev hot reloads from
 * opening a new pool on every module reload.
 */
export function getDatabasePool(): Pool {
  if (!globalForDatabase.workshopPosPool) {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error("DATABASE_URL is not configured");
    }

    const pool = new Pool({
      connectionString,
      max: 5,
      connectionTimeoutMillis: 3_000,
      idleTimeoutMillis: 30_000,
      query_timeout: 3_000,
      statement_timeout: 3_000,
      keepAlive: true,
    });

    pool.on("error", () => {
      // Idle client errors are already reflected by the health check. Log only
      // the event name; driver messages can contain host or SQL details.
      console.error("database: idle client error");
    });

    globalForDatabase.workshopPosPool = pool;
  }

  return globalForDatabase.workshopPosPool;
}
