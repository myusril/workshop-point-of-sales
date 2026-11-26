import {
  AuthError,
  auditDenial,
  buildSessionPayload,
  can,
  denialMessage,
  resolveAuth,
  resolveAuthContext,
} from "@workshop-pos/auth";
import type { AuthContext, AuthRuntime, RbacAction } from "@workshop-pos/auth";
import { createAuth } from "@workshop-pos/auth";
import type { SessionPayload } from "@workshop-pos/contracts";
import { createDatabaseClient, type DatabaseClient } from "@workshop-pos/db";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { loginRedirectPath } from "./request-guard";

interface AuthSingletons {
  client: DatabaseClient;
  runtime: AuthRuntime;
}

const globalForAuth = globalThis as unknown as {
  workshopPosAuth?: AuthSingletons;
};

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "DATABASE_URL is not configured. Set it in the environment before starting the web app.",
    );
  }
  return url;
}

function requireAuthSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error(
      "BETTER_AUTH_SECRET must be set to at least 32 characters. Generate one with: openssl rand -base64 32",
    );
  }
  return secret;
}

/**
 * Lazy process-wide auth runtime. Importing this module never opens a database
 * connection, so `next build` and static rendering work without env or DB.
 */
export function getAuthRuntime(): AuthRuntime {
  const existing = globalForAuth.workshopPosAuth;
  if (existing) return existing.runtime;

  const production = process.env.NODE_ENV === "production";
  const client = createDatabaseClient(requireDatabaseUrl());
  const auth = createAuth(client.db, {
    baseURL: process.env.APP_URL?.trim() || "http://localhost:3000",
    secret: requireAuthSecret(),
    production,
  });
  const runtime: AuthRuntime = { db: client.db, auth, production };

  globalForAuth.workshopPosAuth = { client, runtime };
  return runtime;
}

/** Current server-component context, or null when unauthenticated/expired. */
export async function getPageAuthContext(): Promise<AuthContext | null> {
  const headerList = await headers();
  return resolveAuthContext(getAuthRuntime(), headerList);
}

/** Server-component guard: redirects to `/login?next=…` when unauthenticated. */
export async function requirePageAuthContext(): Promise<AuthContext> {
  const runtime = getAuthRuntime();
  const headerList = await headers();
  const resolution = await resolveAuth(runtime, headerList);

  if (resolution.status === "authenticated") return resolution.context;

  // An idle-timeout sign-out is explained on the login page; a plain
  // unauthenticated visit is not.
  redirect(
    loginRedirectPath(
      headerList.get("x-workshop-path"),
      resolution.status === "expired",
    ),
  );
}

/** Public session payload shared by the session route and server components. */
export async function getSessionPayload(
  context: AuthContext,
): Promise<SessionPayload> {
  return buildSessionPayload(context);
}

/**
 * Route-handler guard. Throws `AuthError` 401 when unauthenticated, 403 when
 * the action is outside the role's Appendix A permissions. Denied attempts are
 * audited without leaking account details.
 */
export async function getApiAuthContext(
  request: Request,
  action?: RbacAction,
): Promise<AuthContext> {
  const runtime = getAuthRuntime();
  const context = await resolveAuthContext(runtime, request.headers);

  if (!context) {
    throw AuthError.unauthenticated();
  }

  if (action && !can(context.user.role, action)) {
    await auditDenial(runtime.db, context, {
      action,
      entityType: "endpoint",
      entityId: new URL(request.url).pathname,
      outletId: context.activeOutletId,
    });
    throw AuthError.forbidden(denialMessage(action));
  }

  return context;
}
