import { randomBytes } from "node:crypto";

import { passwordSchema } from "@workshop-pos/contracts";
import {
  SEED_USERS,
  createDatabaseClient,
  requireDatabaseUrl,
} from "@workshop-pos/db";

import { createAuth } from "./config.ts";
import { provisionAccounts } from "./provisioning.ts";

async function main(): Promise<number> {
  const password = process.env.WP3_TEST_PASSWORD;
  if (!password) {
    console.error(
      "WP3_TEST_PASSWORD is required. Export it for this command; never commit it.",
    );
    return 1;
  }

  const parsedPassword = passwordSchema.safeParse(password);
  if (!parsedPassword.success) {
    console.error(
      `WP3_TEST_PASSWORD does not meet the policy: ${parsedPassword.error.issues
        .map((issue) => issue.message)
        .join(" ")}`,
    );
    return 1;
  }

  const url = requireDatabaseUrl();
  const { pool, db } = createDatabaseClient(url);

  try {
    // Provisioning only hashes passwords. The cookie-signing secret is
    // irrelevant here, so a per-run random value avoids requiring a real one.
    const auth = createAuth(db, {
      baseURL: process.env.APP_URL ?? "http://localhost:3000",
      secret: randomBytes(32).toString("base64url"),
      production: false,
    });

    const result = await provisionAccounts(
      db,
      auth,
      SEED_USERS.map((fixture) => ({
        userId: fixture.id,
        password,
      })),
    );

    console.info(
      `users=${result.users} credentials_created=${result.credentialsCreated} ` +
        `credentials_updated=${result.credentialsUpdated} usernames_set=${result.usernamesSet}`,
    );
    return 0;
  } finally {
    await pool.end();
  }
}

try {
  process.exitCode = await main();
} catch (error) {
  console.error(
    error instanceof Error ? `Provisioning failed: ${error.message}` : "Provisioning failed.",
  );
  process.exitCode = 1;
}
