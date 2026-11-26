import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import * as schema from "../src/schema/index.ts";

export type TestDatabase = NodePgDatabase<typeof schema>;

export const TEST_DATABASE_URL =
  process.env.INTEGRATION_DATABASE_URL ??
  "postgresql://workshop:workshop@127.0.0.1:55432/workshop_pos_test";

const MIGRATIONS_FOLDER = fileURLToPath(new URL("../drizzle", import.meta.url));

export interface TestDatabaseHandle {
  pool: Pool;
  db: TestDatabase;
}

export function databaseNameFromUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // The URL may embed a password: never echo the raw value.
    throw new Error(
      "Integration database URL is not a valid URL (credentials are not echoed)",
    );
  }

  const name = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (name.length === 0) {
    throw new Error(
      `Integration database URL has no database name (host: ${parsed.hostname || "unknown"})`,
    );
  }
  return name;
}

/**
 * Hard guard: integration tests drop schemas. Refuse anything whose database
 * name does not end in `_test`, even if a developer points the variable at
 * production by mistake.
 */
export function assertTestDatabase(url: string = TEST_DATABASE_URL): string {
  const name = databaseNameFromUrl(url);
  if (!name.endsWith("_test")) {
    throw new Error(
      `Integration tests refuse to run against "${name}": the database name must end with "_test"`,
    );
  }
  return name;
}

export async function resetPublicSchema(
  url: string = TEST_DATABASE_URL,
): Promise<void> {
  assertTestDatabase(url);
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("CREATE SCHEMA public");
  } finally {
    await pool.end();
  }
}

export async function migrateTestDatabase(
  url: string = TEST_DATABASE_URL,
): Promise<TestDatabaseHandle> {
  assertTestDatabase(url);
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return { pool, db };
}

export async function prepareTestDatabase(): Promise<TestDatabaseHandle> {
  await resetPublicSchema();
  return migrateTestDatabase();
}

export async function closeTestDatabase(
  handle: TestDatabaseHandle,
): Promise<void> {
  await handle.pool.end();
}

export interface PgErrorInfo {
  code?: string;
  message: string;
}

function isErrorLike(value: unknown): value is { code?: unknown; message?: unknown; cause?: unknown } {
  return typeof value === "object" && value !== null;
}

/** Unwraps Drizzle's query error around the original pg error (SQLSTATE codes). */
export function pgErrorInfo(error: unknown): PgErrorInfo {
  let current: unknown = error;
  while (isErrorLike(current)) {
    if (typeof current.code === "string") {
      return {
        code: current.code,
        message: typeof current.message === "string" ? current.message : String(current.message),
      };
    }
    current = current.cause;
  }
  return {
    code: undefined,
    message: error instanceof Error ? error.message : String(error),
  };
}

export async function expectDatabaseError(
  run: () => Promise<unknown>,
): Promise<PgErrorInfo> {
  try {
    await run();
  } catch (error) {
    return pgErrorInfo(error);
  }
  throw new Error("Expected a database error but the statement succeeded");
}
