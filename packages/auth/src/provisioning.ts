import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Auth } from "better-auth";

import { passwordSchema } from "@workshop-pos/contracts";
import {
  account,
  user as userTable,
  type Database,
} from "@workshop-pos/db";

/** Seed usernames, applied only when provisioning the deterministic fixtures. */
export const SEED_USERNAMES: Readonly<Record<string, string>> = {
  seed_owner_rina: "owner",
  seed_admin_andi: "admin",
  seed_cashier_dewi: "cashier",
  seed_mechanic_agus: "mechanic",
};

export interface ProvisionCredential {
  userId: string;
  password: string;
}

export interface ProvisionOptions {
  /** Explicit escape hatch for a buyer-approved production bootstrap. */
  allowProduction?: boolean;
  now?: Date;
}

export interface ProvisionResult {
  users: number;
  credentialsCreated: number;
  credentialsUpdated: number;
  usernamesSet: number;
}

function assertProvisioningAllowed(options: ProvisionOptions): void {
  if (process.env.NODE_ENV !== "production") return;
  if (options.allowProduction || process.env.WP3_ALLOW_PROVISION === "1") return;
  throw new Error(
    "Refusing to provision credentials in production. " +
      "Set WP3_ALLOW_PROVISION=1 only for an approved initial bootstrap.",
  );
}

/**
 * Upserts Better Auth credential accounts for existing staff rows and applies
 * the seed usernames. Passwords are hashed through Better Auth's context and
 * are never logged. The password is validated against the contract policy
 * before any hash is computed.
 */
export async function provisionAccounts(
  db: Database,
  auth: Auth,
  credentials: readonly ProvisionCredential[],
  options: ProvisionOptions = {},
): Promise<ProvisionResult> {
  assertProvisioningAllowed(options);
  const now = options.now ?? new Date();
  const authContext = await auth.$context;

  let credentialsCreated = 0;
  let credentialsUpdated = 0;
  let usernamesSet = 0;

  for (const credential of credentials) {
    const password = passwordSchema.safeParse(credential.password);
    if (!password.success) {
      throw new Error(
        `Password for ${credential.userId} does not meet the policy: ` +
          password.error.issues.map((issue) => issue.message).join(" "),
      );
    }

    const [existingUser] = await db
      .select({ id: userTable.id, username: userTable.username })
      .from(userTable)
      .where(eq(userTable.id, credential.userId))
      .limit(1);

    if (!existingUser) {
      throw new Error(
        `User ${credential.userId} does not exist. Run the database seed first.`,
      );
    }

    const passwordHash = await authContext.password.hash(credential.password);
    const username = SEED_USERNAMES[credential.userId];

    const outcome = await db.transaction(async (tx) => {
      const [existingAccount] = await tx
        .select({ id: account.id })
        .from(account)
        .where(
          and(
            eq(account.userId, credential.userId),
            eq(account.providerId, "credential"),
          ),
        )
        .limit(1);

      if (existingAccount) {
        await tx
          .update(account)
          .set({ password: passwordHash, updatedAt: now })
          .where(eq(account.id, existingAccount.id));
      } else {
        await tx.insert(account).values({
          id: randomUUID(),
          accountId: credential.userId,
          providerId: "credential",
          userId: credential.userId,
          password: passwordHash,
          updatedAt: now,
        });
      }

      let usernameApplied = false;
      if (username && existingUser.username !== username) {
        await tx
          .update(userTable)
          .set({ username, displayUsername: username, updatedAt: now })
          .where(eq(userTable.id, credential.userId));
        usernameApplied = true;
      }

      return { created: !existingAccount, usernameApplied };
    });

    if (outcome.created) credentialsCreated += 1;
    else credentialsUpdated += 1;
    if (outcome.usernameApplied) usernamesSet += 1;
  }

  return {
    users: credentials.length,
    credentialsCreated,
    credentialsUpdated,
    usernamesSet,
  };
}
