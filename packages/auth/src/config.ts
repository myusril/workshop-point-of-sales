import { APIError, betterAuth, type Auth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq } from "drizzle-orm";

import {
  account,
  session as sessionTable,
  user as userTable,
  verification,
  type Database,
} from "@workshop-pos/db";

import { getOutletScope, resolveIdleTimeoutMinutes } from "./scope.ts";
import { SESSION_COOKIE_PREFIX, getSessionCookieNames } from "./cookies.ts";

export interface CreateAuthOptions {
  baseURL: string;
  secret: string;
  production: boolean;
}

export { getSessionCookieNames };

/**
 * Better Auth configuration.
 *
 * The session `create.before` hook owns outlet scoping and the per-outlet idle
 * timeout: Better Auth's own `expiresIn` stays a 12-hour absolute backstop,
 * while the WP3 guard enforces real inactivity on every request.
 */
export function createAuth(db: Database, options: CreateAuthOptions): Auth {
  // Better Auth's `Auth<Options>` is invariant over its concrete options.
  // Consumers only use the stable server API (`$context`, `api.getSession`,
  // `api.signInEmail`), so the configured instance is exposed as the base type.
  return betterAuth({
    appName: "Workshop POS",
    baseURL: options.baseURL,
    secret: options.secret,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: userTable,
        session: sessionTable,
        account,
        verification,
      },
      usePlural: false,
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      autoSignIn: false,
      minPasswordLength: 8,
      maxPasswordLength: 256,
    },
    user: {
      additionalFields: {
        businessId: { type: "string", required: false, input: false },
        role: { type: "string", required: false, input: false },
        phone: { type: "string", required: false, input: false },
        deactivatedAt: { type: "date", required: false, input: false },
      },
    },
    session: {
      expiresIn: 60 * 60 * 12,
      updateAge: 60 * 60 * 12,
      additionalFields: {
        activeOutletId: { type: "string", required: false, input: false },
      },
    },
    advanced: {
      cookiePrefix: SESSION_COOKIE_PREFIX,
      useSecureCookies: options.production,
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (sessionRecord) => {
            const userId =
              typeof sessionRecord.userId === "string" ? sessionRecord.userId : "";
            const [record] = await db
              .select({
                id: userTable.id,
                businessId: userTable.businessId,
                role: userTable.role,
                deactivatedAt: userTable.deactivatedAt,
              })
              .from(userTable)
              .where(eq(userTable.id, userId))
              .limit(1);

            if (!record || record.deactivatedAt !== null) {
              throw new APIError("FORBIDDEN", {
                message: "Akun dinonaktifkan. Hubungi Pemilik.",
                code: "ACCOUNT_DEACTIVATED",
              });
            }

            const scope = await getOutletScope(db, {
              id: record.id,
              businessId: record.businessId,
              role: record.role,
            });
            if (scope.outlets.length === 0) {
              throw new APIError("FORBIDDEN", {
                message: "Akun belum ditugaskan ke outlet aktif.",
                code: "NO_ACTIVE_OUTLET",
              });
            }

            const requested =
              typeof sessionRecord.activeOutletId === "string"
                ? sessionRecord.activeOutletId
                : null;
            const activeOutletId =
              requested && scope.outletIds.includes(requested)
                ? requested
                : (scope.outlets[0]?.id ?? null);

            const idleTimeoutMinutes = await resolveIdleTimeoutMinutes(
              db,
              record.businessId,
              scope.outletIds,
              activeOutletId,
            );

            return {
              data: {
                ...sessionRecord,
                activeOutletId,
                expiresAt: new Date(Date.now() + idleTimeoutMinutes * 60_000),
              },
            };
          },
        },
      },
    },
  }) as unknown as Auth;
}
