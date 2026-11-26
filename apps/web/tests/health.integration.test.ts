import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";

const connectionString =
  process.env.INTEGRATION_DATABASE_URL ??
  "postgresql://workshop:workshop@127.0.0.1:55432/workshop_pos_test";

const pool = new Pool({
  connectionString,
  connectionTimeoutMillis: 5_000,
  max: 1,
});

afterAll(async () => {
  await pool.end();
});

describe("integration database", () => {
  it("connects to the Compose test database and runs a query", async () => {
    const result = await pool.query<{ ok: number }>("select 1 as ok");

    expect(result.rows[0]?.ok).toBe(1);
  });
});
