import { sql } from "drizzle-orm";

import type { Database } from "@workshop-pos/db";

/**
 * Services run reads and writes inside the same drizzle transaction as their
 * audit row. `appendAuditEntry` only issues selects and inserts, which the
 * transaction handle supports; Drizzle's transaction type is narrower than
 * `Database`.
 */
export type TransactionHandle = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

export function asDatabase(tx: TransactionHandle): Database {
  return tx as unknown as Database;
}

/**
 * Serializes every transaction that uses the same logical key until the
 * transaction commits. Used to make check-then-act sequences (login lockout
 * counters, last-active-outlet guards) atomic without a dedicated table.
 *
 * `hashtext` can collide across unrelated keys; a collision only adds
 * serialization, never an incorrect decision.
 */
export async function acquireAdvisoryXactLock(
  tx: TransactionHandle,
  key: string,
): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
}
