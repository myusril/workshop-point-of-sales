import { and, eq } from "drizzle-orm";

import {
  staffRoleSchema,
  type OutletSummary,
  type StaffRole,
} from "@workshop-pos/contracts";
import {
  appendAuditEntry,
  outlets as outletsTable,
  session as sessionTable,
  type Database,
} from "@workshop-pos/db";

import { getSessionCookieNames } from "./config.ts";
import {
  pinDeviceTokenOutlet,
  resolveDeviceToken,
  revokeDeviceTokenById,
  touchDeviceToken,
} from "./device-tokens.ts";
import { AuthError } from "./errors.ts";
import {
  CROSS_OUTLET_MESSAGE,
  POLICY,
  can,
  denialMessage,
  scopeFor,
  type RbacAction,
} from "./rbac.ts";
import { getOutletScope, resolveIdleTimeoutMinutes } from "./scope.ts";
import type { AuthContext, AuthContextUser, AuthRuntime } from "./types.ts";

export const BEARER_PREFIX = /^Bearer\s+(.+)$/i;
export const ABSOLUTE_SESSION_MS = POLICY.absoluteSessionHours * 60 * 60 * 1000;

export type AuthResolution =
  | { status: "authenticated"; context: AuthContext }
  | { status: "unauthenticated" }
  | { status: "expired" };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "string" && value.length > 0) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function asRole(value: unknown): StaffRole | null {
  const parsed = staffRoleSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

interface ParsedBetterAuthSession {
  sessionId: string;
  token: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  activeOutletId: string | null;
  user: AuthContextUser;
  deactivatedAt: Date | null;
}

function parseBetterAuthSession(raw: unknown): ParsedBetterAuthSession | null {
  const root = asRecord(raw);
  const session = asRecord(root?.session);
  const user = asRecord(root?.user);
  if (!root || !session || !user) return null;

  const sessionId = asString(session.id);
  const token = asString(session.token);
  const expiresAt = asDate(session.expiresAt);
  const updatedAt = asDate(session.updatedAt);
  const createdAt = asDate(session.createdAt) ?? updatedAt;
  const userId = asString(session.userId) ?? asString(user.id);
  const id = asString(user.id);
  const name = asString(user.name);
  const email = asString(user.email);
  const phone = asString(user.phone);
  const businessId = asString(user.businessId);
  const role = asRole(user.role);

  if (
    !sessionId ||
    !token ||
    !expiresAt ||
    !updatedAt ||
    !createdAt ||
    !userId ||
    !id ||
    !name ||
    !email ||
    !phone ||
    !businessId ||
    !role
  ) {
    return null;
  }

  return {
    sessionId,
    token,
    userId,
    expiresAt,
    createdAt,
    updatedAt,
    activeOutletId: asString(session.activeOutletId),
    deactivatedAt: asDate(user.deactivatedAt),
    user: {
      id,
      name,
      email,
      username: asString(user.username),
      phone,
      role,
      businessId,
    },
  };
}

export function getBearerToken(headers: Headers): string | null {
  const header = headers.get("authorization");
  if (!header) return null;
  const match = BEARER_PREFIX.exec(header.trim());
  return match?.[1]?.trim() || null;
}

function pickActiveOutletId(
  requested: string | null,
  outletIds: readonly string[],
  outletsList: readonly OutletSummary[],
): string | null {
  if (requested && outletIds.includes(requested)) return requested;
  return outletsList[0]?.id ?? null;
}

/**
 * Resolves an authenticated context from a bearer token first (mobile), then
 * the session cookie (web). No framework imports: route handlers and server
 * components both call this with a plain `Headers` object.
 */
export async function resolveAuth(
  runtime: AuthRuntime,
  headers: Headers,
  now: Date = new Date(),
): Promise<AuthResolution> {
  const bearer = getBearerToken(headers);

  if (bearer) {
    const resolution = await resolveDeviceToken(runtime.db, bearer, now);
    if (!resolution) return { status: "unauthenticated" };

    const scope = await getOutletScope(runtime.db, {
      id: resolution.user.id,
      businessId: resolution.user.businessId,
      role: resolution.user.role,
    });
    if (scope.outlets.length === 0) return { status: "unauthenticated" };

    const activeOutletId = pickActiveOutletId(
      resolution.outletId,
      scope.outletIds,
      scope.outlets,
    );

    const idleTimeoutMinutes = await resolveIdleTimeoutMinutes(
      runtime.db,
      resolution.user.businessId,
      scope.outletIds,
      activeOutletId,
    );

    // Idle enforcement for bearer clients (FR-070). The check runs before any
    // write, so a request outside the window can never renew `last_used_at`.
    const lastActivity = resolution.lastUsedAt ?? resolution.createdAt;
    if (now.getTime() - lastActivity.getTime() > idleTimeoutMinutes * 60_000) {
      await revokeDeviceTokenById(runtime.db, resolution.tokenId, now);
      return { status: "expired" };
    }

    if (activeOutletId && activeOutletId !== resolution.outletId) {
      await pinDeviceTokenOutlet(runtime.db, resolution.tokenId, activeOutletId);
    }
    await touchDeviceToken(
      runtime.db,
      resolution.tokenId,
      now,
      resolution.lastUsedAt,
    );

    const sessionExpiresAt =
      resolution.expiresAt ??
      new Date(now.getTime() + POLICY.deviceTokenTtlDays * 24 * 60 * 60 * 1000);

    return {
      status: "authenticated",
      context: {
        user: {
          id: resolution.user.id,
          name: resolution.user.name,
          email: resolution.user.email,
          username: resolution.user.username,
          phone: resolution.user.phone,
          role: resolution.user.role,
          businessId: resolution.user.businessId,
        },
        method: "bearer",
        activeOutletId,
        outletIds: scope.outletIds,
        outlets: scope.outlets,
        idleTimeoutMinutes,
        sessionExpiresAt: sessionExpiresAt.toISOString(),
        tokenId: resolution.tokenId,
      },
    };
  }

  const result = await runtime.auth.api.getSession({
    headers,
    query: { disableRefresh: true },
  });
  const parsed = parseBetterAuthSession(result as unknown);
  if (!parsed) return { status: "unauthenticated" };

  if (parsed.deactivatedAt !== null) {
    await deleteWebSession(runtime, parsed.token);
    return { status: "unauthenticated" };
  }

  const scope = await getOutletScope(runtime.db, {
    id: parsed.user.id,
    businessId: parsed.user.businessId,
    role: parsed.user.role,
  });
  if (scope.outlets.length === 0) {
    await deleteWebSession(runtime, parsed.token);
    return { status: "unauthenticated" };
  }

  const activeOutletId = pickActiveOutletId(
    parsed.activeOutletId,
    scope.outletIds,
    scope.outlets,
  );
  const idleTimeoutMinutes = await resolveIdleTimeoutMinutes(
    runtime.db,
    parsed.user.businessId,
    scope.outletIds,
    activeOutletId,
  );

  if (now.getTime() - parsed.updatedAt.getTime() > idleTimeoutMinutes * 60_000) {
    await deleteWebSession(runtime, parsed.token);
    return { status: "expired" };
  }

  const absoluteExpiry = parsed.createdAt.getTime() + ABSOLUTE_SESSION_MS;
  const slidExpiry = now.getTime() + idleTimeoutMinutes * 60_000;
  const nextExpiresAt = new Date(Math.min(slidExpiry, absoluteExpiry));
  if (nextExpiresAt.getTime() <= now.getTime()) {
    await deleteWebSession(runtime, parsed.token);
    return { status: "expired" };
  }

  let sessionExpiresAt = parsed.expiresAt;
  const shouldTouch =
    now.getTime() - parsed.updatedAt.getTime() >= POLICY.sessionTouchIntervalMs;
  const outletChanged =
    activeOutletId !== null && activeOutletId !== parsed.activeOutletId;

  if (shouldTouch || outletChanged) {
    sessionExpiresAt = shouldTouch ? nextExpiresAt : parsed.expiresAt;
    await runtime.db
      .update(sessionTable)
      .set({
        ...(shouldTouch ? { expiresAt: sessionExpiresAt, updatedAt: now } : {}),
        ...(outletChanged ? { activeOutletId } : {}),
      })
      .where(eq(sessionTable.id, parsed.sessionId));
  }

  return {
    status: "authenticated",
    context: {
      user: parsed.user,
      method: "web",
      activeOutletId,
      outletIds: scope.outletIds,
      outlets: scope.outlets,
      idleTimeoutMinutes,
      sessionExpiresAt: sessionExpiresAt.toISOString(),
      sessionToken: parsed.token,
      sessionId: parsed.sessionId,
    },
  };
}

/** Convenience wrapper used by pages and route helpers. */
export async function resolveAuthContext(
  runtime: AuthRuntime,
  headers: Headers,
  now: Date = new Date(),
): Promise<AuthContext | null> {
  const resolution = await resolveAuth(runtime, headers, now);
  return resolution.status === "authenticated" ? resolution.context : null;
}

async function deleteWebSession(
  runtime: AuthRuntime,
  token: string,
): Promise<void> {
  try {
    const context = await runtime.auth.$context;
    await context.internalAdapter.deleteSession(token);
  } catch {
    // The session is unusable either way; a failed cleanup must not turn an
    // expired session into a server error.
    console.error("auth: failed to delete unusable session");
  }
}

export function assertPermission(context: AuthContext, action: RbacAction): void {
  if (!can(context.user.role, action)) {
    throw AuthError.forbidden(denialMessage(action));
  }
}

/**
 * Rejects an outlet that is outside the caller's scope. OWNER/ADMIN are scoped
 * to all active outlets of the business, so an unknown id is still denied.
 */
export function assertOutletAccess(
  context: AuthContext,
  outletId: string,
  action: RbacAction,
): void {
  if (scopeFor(context.user.role, action) === "NONE") {
    throw AuthError.forbidden(denialMessage(action));
  }
  if (!context.outletIds.includes(outletId)) {
    throw AuthError.forbidden(CROSS_OUTLET_MESSAGE);
  }
}

/**
 * Audited outlet-scope rejection. It checks the outlet dimension only:
 * permission for the action is decided by `assertPermission` or the route
 * guard, so a caller that has already authorised the action can audit and
 * reject an out-of-scope outlet here. The action labels the denial.
 */
export async function assertOutletAccessAudited(
  db: Database,
  context: AuthContext,
  outletId: string,
  action: RbacAction,
  target: { entityType: string; entityId: string },
): Promise<void> {
  if (context.outletIds.includes(outletId)) return;

  await auditDenial(db, context, {
    action,
    entityType: target.entityType,
    entityId: target.entityId,
    outletId,
    crossOutlet: true,
  });
  throw AuthError.forbidden(CROSS_OUTLET_MESSAGE);
}

export interface DenialAuditInput {
  action: RbacAction;
  entityType: string;
  entityId: string;
  outletId?: string | null;
  crossOutlet?: boolean;
  reason?: string;
}

/**
 * Appends an audit row for a denied RBAC or cross-outlet attempt. Audit
 * failures are logged generically and never mask the denial response.
 */
export async function auditDenial(
  db: Database,
  context: AuthContext,
  input: DenialAuditInput,
): Promise<void> {
  if (context.outletIds.length === 0) return;

  const requestedOutletId = input.outletId?.trim() || null;
  const requestedInScope =
    requestedOutletId !== null && context.outletIds.includes(requestedOutletId);
  const auditOutletId =
    (requestedInScope ? requestedOutletId : null) ??
    (context.activeOutletId && context.outletIds.includes(context.activeOutletId)
      ? context.activeOutletId
      : (context.outletIds[0] ?? null));

  const action = input.crossOutlet ? "rbac.cross_outlet_denied" : "rbac.denied";
  const reason =
    input.reason ??
    (input.crossOutlet
      ? "outlet outside the caller's assigned scope"
      : denialMessage(input.action));

  try {
    await appendAuditEntry(
      db,
      { businessId: context.user.businessId, outletIds: context.outletIds },
      {
        action,
        entityType: input.entityType,
        entityId: input.entityId,
        actorId: context.user.id,
        outletId: auditOutletId,
        reason,
        after:
          requestedOutletId !== null && !requestedInScope
            ? { requestedOutletId }
            : null,
      },
    );
  } catch {
    console.error(`audit: failed to record ${action}`);
  }
}

export interface SwitchOutletResult {
  context: AuthContext;
}

/**
 * Changes the active outlet for the caller (FR-004 switcher). Any role may
 * switch between the active outlets assigned to it; a caller with a single
 * outlet has nothing to switch to, and a target outside the assigned scope is
 * denied and audited. Web sessions persist the choice in
 * `session.activeOutletId`; bearer clients pin it on the device token.
 */
export async function switchActiveOutlet(
  runtime: AuthRuntime,
  context: AuthContext,
  outletId: string,
  now: Date = new Date(),
): Promise<SwitchOutletResult> {
  const entityType = context.method === "web" ? "session" : "device_token";
  const entityId = context.sessionId ?? context.tokenId ?? outletId;

  if (context.outletIds.length <= 1) {
    await auditDenial(runtime.db, context, {
      action: "manage_outlets",
      entityType,
      entityId,
      outletId,
      reason: "caller has a single assigned outlet",
    });
    throw AuthError.forbidden(
      "Akun Anda hanya memiliki satu outlet aktif sehingga tidak dapat berganti outlet.",
    );
  }

  const [outlet] = await runtime.db
    .select({ id: outletsTable.id })
    .from(outletsTable)
    .where(
      and(
        eq(outletsTable.id, outletId),
        eq(outletsTable.businessId, context.user.businessId),
        eq(outletsTable.isActive, true),
      ),
    )
    .limit(1);

  if (!outlet) {
    throw AuthError.notFound("Outlet tidak ditemukan.");
  }

  // Scope only: switching carries no RBAC permission of its own, so the action
  // merely labels the audit row of a cross-outlet attempt.
  await assertOutletAccessAudited(runtime.db, context, outlet.id, "manage_outlets", {
    entityType,
    entityId,
  });

  const idleTimeoutMinutes = await resolveIdleTimeoutMinutes(
    runtime.db,
    context.user.businessId,
    context.outletIds,
    outlet.id,
  );

  let sessionExpiresAt = context.sessionExpiresAt;

  if (context.method === "web") {
    if (!context.sessionId) throw AuthError.unauthenticated();
    const expiresAt = new Date(now.getTime() + idleTimeoutMinutes * 60_000);
    await runtime.db
      .update(sessionTable)
      .set({ activeOutletId: outlet.id, expiresAt, updatedAt: now })
      .where(eq(sessionTable.id, context.sessionId));
    sessionExpiresAt = expiresAt.toISOString();
  } else {
    if (!context.tokenId) throw AuthError.unauthenticated();
    await pinDeviceTokenOutlet(runtime.db, context.tokenId, outlet.id);
  }

  await appendAuditEntry(
    runtime.db,
    { businessId: context.user.businessId, outletIds: context.outletIds },
    {
      action: "session.outlet_switched",
      entityType,
      entityId,
      actorId: context.user.id,
      outletId: outlet.id,
      after: { activeOutletId: outlet.id },
    },
  );

  return {
    context: {
      ...context,
      activeOutletId: outlet.id,
      idleTimeoutMinutes,
      sessionExpiresAt,
    },
  };
}

export interface LogoutResult {
  setCookies: string[];
}

function clearCookieValues(): string[] {
  const epoch = "Thu, 01 Jan 1970 00:00:00 GMT";
  return getSessionCookieNames().map((name) => {
    const secure = name.startsWith("__Secure-") ? "; Secure" : "";
    return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=${epoch}${secure}`;
  });
}

/**
 * Ends the current session: deletes the Better Auth session (web) or revokes
 * the device token (mobile), then returns the cookie-clearing headers.
 */
export async function logoutCurrentSession(
  runtime: AuthRuntime,
  context: AuthContext,
  now: Date = new Date(),
): Promise<LogoutResult> {
  if (context.method === "web") {
    if (context.sessionToken) await deleteWebSession(runtime, context.sessionToken);
    return { setCookies: clearCookieValues() };
  }

  if (!context.tokenId) throw AuthError.unauthenticated();
  const revoked = await revokeDeviceTokenById(runtime.db, context.tokenId, now);
  if (revoked) {
    await appendAuditEntry(
      runtime.db,
      { businessId: context.user.businessId, outletIds: context.outletIds },
      {
        action: "device_token.revoked",
        entityType: "device_token",
        entityId: context.tokenId,
        actorId: context.user.id,
        outletId: context.activeOutletId,
        reason: "mobile logout",
      },
    );
  }
  return { setCookies: clearCookieValues() };
}
