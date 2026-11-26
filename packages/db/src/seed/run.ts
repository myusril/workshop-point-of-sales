import { createDatabaseClientFromEnv } from "../client.ts";
import { seedDatabase } from "./seed.ts";

async function main(): Promise<void> {
  const { pool, db } = createDatabaseClientFromEnv();
  try {
    const counts = await seedDatabase(db);
    // Counts only: the fixture names, phones, and emails are not logged.
    console.log(
      "Seed complete: " +
        `${counts.businesses} business, ${counts.outlets} outlet, ` +
        `${counts.settings} settings, ${counts.users} users, ` +
        `${counts.staffOutlets} staff-outlet rows, ${counts.products} product, ` +
        `${counts.services} service, ${counts.customers} customer, ` +
        `${counts.vehicles} vehicle, ${counts.stockLedgerEntries} opening ledger row, ` +
        `stock-on-hand ${counts.stockOnHand.toString()}`,
    );
  } finally {
    await pool.end();
  }
}

function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    return typeof error.code === "string" ? error.code : String(error.code);
  }
  return undefined;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  // Never echo a connection URL (it can carry the password) into deploy logs.
  const redacted = message.replace(/postgres(?:ql)?:\/\/\S+/gi, "postgresql://<redacted>");
  const code = errorCode(error);
  console.error(code ? `Seed failed (${code}): ${redacted}` : `Seed failed: ${redacted}`);
  process.exitCode = 1;
});
