import { fileURLToPath } from "node:url";

import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

import {
  createDatabaseClient,
  type Database,
  type DatabaseClient,
} from "@workshop-pos/db";

export const TEST_DATABASE_URL =
  process.env.INTEGRATION_DATABASE_URL ??
  "postgresql://workshop:workshop@127.0.0.1:55432/workshop_pos_test";

const MIGRATIONS_FOLDER = fileURLToPath(
  new URL("../../db/drizzle", import.meta.url),
);

function databaseNameFromUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(
      "Integration database URL is not a valid URL (credentials are not echoed)",
    );
  }
  const name = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (name.length === 0) {
    throw new Error("Integration database URL has no database name");
  }
  return name;
}

/**
 * Integration tests drop the public schema. Refuse any database whose name
 * does not end in `_test`, mirroring the WP2 guard.
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

async function resetPublicSchema(url: string): Promise<void> {
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

export interface AuthTestDatabase {
  client: DatabaseClient;
  db: Database;
}

export async function prepareAuthTestDatabase(): Promise<AuthTestDatabase> {
  await resetPublicSchema(TEST_DATABASE_URL);
  const client = createDatabaseClient(TEST_DATABASE_URL);
  await migrate(client.db, { migrationsFolder: MIGRATIONS_FOLDER });
  return { client, db: client.db };
}

export async function closeAuthTestDatabase(
  handle: AuthTestDatabase,
): Promise<void> {
  await handle.client.pool.end();
}
