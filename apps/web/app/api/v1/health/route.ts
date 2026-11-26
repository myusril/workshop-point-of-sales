import { NextResponse } from "next/server";
import type { Pool } from "pg";

import { getDatabasePool } from "@/lib/db";
import { buildHealthPayload, migrationLabel } from "@/lib/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIGRATION_TABLE = "drizzle.__drizzle_migrations";

async function migrationTableExists(pool: Pool): Promise<boolean> {
  const result = await pool.query<{ present: string | null }>(
    "select to_regclass($1)::text as present",
    [MIGRATION_TABLE],
  );

  return Boolean(result.rows[0]?.present);
}

async function readMigrationVersion(pool: Pool): Promise<string> {
  if (!(await migrationTableExists(pool))) {
    return "none";
  }

  const result = await pool.query<{ created_at: string | number | null }>(
    `select created_at from ${MIGRATION_TABLE} order by created_at desc limit 1`,
  );

  return migrationLabel(result.rows[0]?.created_at);
}

export async function GET() {
  let databaseUp = false;
  let migration: string | null = null;

  try {
    const pool = getDatabasePool();
    await pool.query("select 1");
    databaseUp = true;

    try {
      migration = await readMigrationVersion(pool);
    } catch {
      migration = "unknown";
    }
  } catch {
    databaseUp = false;
  }

  return NextResponse.json(buildHealthPayload({ databaseUp, migration }), {
    status: databaseUp ? 200 : 503,
    headers: {
      "cache-control": "no-store",
    },
  });
}
