import { randomBytes } from "node:crypto";

import { eq, or, sql } from "drizzle-orm";
import type { Auth } from "better-auth";

import {
  normalizePhoneNumber,
  type LoginRequest,
  type LoginResponse,
} from "@workshop-pos/contracts";
import { user as userTable, type Database } from "@workshop-pos/db";

import { getSessionCookieNames } from "./config.ts";
import { acquireAdvisoryXactLock, asDatabase } from "./db-locks.ts";
import { issueDeviceToken } from "./device-tokens.ts";
import { AuthError } from "./errors.ts";
import { checkIpThrottle, recordIpFailure } from "./ip-rate-limit.ts";
import { buildSessionPayload } from "./session-payload.ts";
import {
  accountLockKeys,
  getLockStatusForKeys,
  maybePruneExpiredLoginAttempts,
  normalizeIdentifier,
  pruneLoginAttempts,
  recordLoginAttempts,
} from "./login-attempts.ts";
import { getOutletScope, resolveIdleTimeoutMinutes } from "./scope.ts";
import { resolveAuthContext } from "./guard.ts";
import type { AuthContext, AuthRuntime } from "./types.ts";

export interface LoginDeps extends AuthRuntime {
  /** Forwarded so Better Auth can set cookies in the caller's response. */
  headers?: Headers;
  /** Client address for the bounded per-IP throttle (DEC-0011); absent in tests. */
  clientIp?: string | null;
  /**
   * Test-only observation hook fired immediately before each password
   * verification, including the dummy verification used for unknown accounts.
   * Production callers never pass it.
   */
  onPasswordVerify?: () => void;
}

export interface LoginOutcome {
  payload: LoginResponse;
  /** Every `Set-Cookie` value to forward to the browser. */
  setCookies: string[];
}

interface ResolvedUser {
  id: string;
  name: string;
  email: string;
  username: string | null;
  phone: string;
  role: AuthContext["user"]["role"];
  businessId: string;
  deactivatedAt: Date | null;
}

const ALL_DIGITS = /^[0-9]+$/;
const PHONE_PATTERN = /^0[0-9]{7,14}$/;

/**
 * The scrypt hash verified for unknown accounts and accounts without a
 * credential row, so both paths cost one verification. Random bytes produce a
 * hash no password can match; it is never logged, stored, or committed.
 */
const dummyHashByAuth = new WeakMap<Auth, Promise<string>>();

function dummyPasswordHash(auth: Auth): Promise<string> {
  const cached = dummyHashByAuth.get(auth);
  if (cached) return cached;

  const created = auth.$context
    .then((authContext) => authContext.password.hash(randomBytes(32).toString("hex")))
    .catch((error: unknown) => {
      dummyHashByAuth.delete(auth);
      throw error;
    });

  dummyHashByAuth.set(auth, created);
  return created;
}

/**
 * Resolves one user by email, username, or phone with an explicit priority:
 * all-digit identifiers prefer the phone column, everything else prefers email
 * then username then phone. Without the ORDER BY a phone number that is also a
 * username resolves arbitrarily.
 */
async function findUserByIdentifier(
  db: Database,
  identifier: string,
): Promise<ResolvedUser | null> {
  const phoneCandidate = normalizePhoneNumber(identifier);
  const phoneClause = PHONE_PATTERN.test(phoneCandidate)
    ? eq(userTable.phone, phoneCandidate)
    : null;

  const clauses = [eq(userTable.email, identifier), eq(userTable.username, identifier)];
  if (phoneClause) clauses.push(phoneClause);

  const phoneMatch = sql`${userTable.phone} = ${phoneCandidate}`;
  const priority = ALL_DIGITS.test(identifier)
    ? sql`case
        when ${phoneClause ? phoneMatch : sql`false`} then 0
        when ${userTable.email} = ${identifier} then 1
        when ${userTable.username} = ${identifier} then 2
        else 3
      end`
    : sql`case
        when ${userTable.email} = ${identifier} then 0
        when ${userTable.username} = ${identifier} then 1
        when ${phoneClause ? phoneMatch : sql`false`} then 2
        else 3
      end`;

  const [row] = await db
    .select({
      id: userTable.id,
      name: userTable.name,
      email: userTable.email,
      username: userTable.username,
      phone: userTable.phone,
      role: userTable.role,
      businessId: userTable.businessId,
      deactivatedAt: userTable.deactivatedAt,
    })
    .from(userTable)
    .where(or(...clauses))
    .orderBy(priority, userTable.id)
    .limit(1);

  return row ?? null;
}

function cookieHeaderFromSetCookies(setCookies: readonly string[]): Headers {
  const accepted = new Set(getSessionCookieNames());
  const pairs: string[] = [];

  for (const raw of setCookies) {
    const pair = raw.split(";")[0]?.trim();
    if (!pair) continue;
    const separator = pair.indexOf("=");
    if (separator <= 0) continue;
    const name = pair.slice(0, separator);
    if (accepted.has(name)) pairs.push(pair);
  }

  const headers = new Headers();
  headers.set("cookie", pairs.join("; "));
  return headers;
}

function lockoutError(retryAfterSeconds: number): AuthError {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return new AuthError(
    "ACCOUNT_LOCKED",
    `Terlalu banyak percobaan. Tunggu ${minutes} menit sebelum mencoba lagi.`,
    { retryAfterSeconds },
  );
}

function ipThrottleError(retryAfterSeconds: number): AuthError {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return new AuthError(
    "RATE_LIMITED",
    `Terlalu banyak percobaan dari jaringan ini. Tunggu ${minutes} menit sebelum mencoba lagi.`,
    { retryAfterSeconds },
  );
}

function accountLockKey(identifier: string, userId: string | null): string {
  return userId ? `user:${userId}` : identifier;
}

/**
 * Retention housekeeping: a failed prune must never fail a login or leak a
 * driver message, so the error is logged by category only.
 */
async function pruneLoginAttemptHistory(db: Database, now: Date): Promise<void> {
  try {
    await maybePruneExpiredLoginAttempts(db, now);
  } catch {
    console.error("auth: failed to prune expired login attempts");
  }
}

/**
 * The decision taken inside the attempt transaction. Nothing is thrown until
 * the transaction commits, so a rolled-back attempt never releases a lock.
 */
type AttemptOutcome =
  | { status: "locked"; retryAfterSeconds: number }
  | { status: "ip_limited"; retryAfterSeconds: number }
  | { status: "invalid_credentials" }
  | { status: "deactivated" }
  | { status: "verified" };

/**
 * The single password-login path for both surfaces.
 *
 * The lock re-check, password verification, and attempt write all happen under
 * one advisory lock inside one transaction, so concurrent guesses cannot slip
 * past the five-failure budget. Order matters: a locked key exits before any
 * verification, unknown accounts still pay for one scrypt verification, and
 * the deactivation message only appears after the password has been proven.
 */
export async function loginWithPassword(
  deps: LoginDeps,
  input: LoginRequest,
  now: Date = new Date(),
): Promise<LoginOutcome> {
  const identifier = normalizeIdentifier(input.identifier);

  // The per-IP budget sits ahead of the account budget so rotating identifiers
  // cannot spend the whole credential allowance (DEC-0011).
  const ipPreflight = checkIpThrottle(deps.clientIp, now);
  if (ipPreflight.limited) throw ipThrottleError(ipPreflight.retryAfterSeconds);

  const user = await findUserByIdentifier(deps.db, identifier);
  const keys = accountLockKeys(identifier, user?.id ?? null);

  // Cheap pre-check: a locked key never opens a transaction or a verification.
  const preflight = await getLockStatusForKeys(deps.db, keys, now);
  if (preflight.locked) throw lockoutError(preflight.retryAfterSeconds);

  const authContext = await deps.auth.$context;
  const credential = user
    ? await authContext.internalAdapter.findCredentialAccount(user.id)
    : null;
  const storedHash = credential?.password;
  const passwordHash =
    typeof storedHash === "string" && storedHash.length > 0 ? storedHash : null;

  const outcome = await deps.db.transaction(async (tx): Promise<AttemptOutcome> => {
    const store = asDatabase(tx);
    await acquireAdvisoryXactLock(tx, accountLockKey(identifier, user?.id ?? null));

    const lock = await getLockStatusForKeys(store, keys, now);
    if (lock.locked) {
      return { status: "locked", retryAfterSeconds: lock.retryAfterSeconds };
    }

    const hash = passwordHash ?? (await dummyPasswordHash(deps.auth));
    deps.onPasswordVerify?.();
    const passwordMatches = await authContext.password.verify({
      hash,
      password: input.password,
    });

    if (!user || passwordHash === null || !passwordMatches) {
      await recordLoginAttempts(
        store,
        keys.map((key) => ({
          identifier: key,
          succeeded: false,
          userId: user?.id ?? null,
          now,
        })),
      );
      await pruneLoginAttempts(store, keys, now);

      const ipAfterFailure = recordIpFailure(deps.clientIp, now);
      if (ipAfterFailure.limited) {
        return { status: "ip_limited", retryAfterSeconds: ipAfterFailure.retryAfterSeconds };
      }

      // The fifth failure must surface the lock immediately, not on request six.
      const afterFailure = await getLockStatusForKeys(store, keys, now);
      if (afterFailure.locked) {
        return { status: "locked", retryAfterSeconds: afterFailure.retryAfterSeconds };
      }
      return { status: "invalid_credentials" };
    }

    // Re-read the deactivation flag under the lock so a concurrent deactivation
    // cannot race a successful sign-in.
    const [fresh] = await tx
      .select({ deactivatedAt: userTable.deactivatedAt })
      .from(userTable)
      .where(eq(userTable.id, user.id))
      .limit(1);
    if (!fresh || fresh.deactivatedAt !== null) {
      return { status: "deactivated" };
    }

    await recordLoginAttempts(
      store,
      keys.map((key) => ({ identifier: key, succeeded: true, userId: user.id, now })),
    );
    await pruneLoginAttempts(store, keys, now);
    return { status: "verified" };
  });

  // Housekeeping after commit: bounded, at most once per process-hour, and
  // never able to fail the request.
  await pruneLoginAttemptHistory(deps.db, now);

  switch (outcome.status) {
    case "locked":
      throw lockoutError(outcome.retryAfterSeconds);
    case "ip_limited":
      throw ipThrottleError(outcome.retryAfterSeconds);
    case "invalid_credentials":
      throw AuthError.invalidCredentials();
    case "deactivated":
      throw new AuthError(
        "ACCOUNT_DEACTIVATED",
        "Akun dinonaktifkan. Hubungi Pemilik.",
      );
    case "verified":
      break;
  }

  // `verified` is unreachable without a resolved user; the guard keeps a future
  // edit from dereferencing a null row.
  if (!user) throw AuthError.invalidCredentials();

  const scope = await getOutletScope(deps.db, {
    id: user.id,
    businessId: user.businessId,
    role: user.role,
  });
  if (scope.outlets.length === 0) {
    throw AuthError.forbidden("Akun belum ditugaskan ke outlet aktif.");
  }

  if (input.surface === "mobile") {
    const activeOutletId = scope.outlets[0]?.id ?? null;
    const idleTimeoutMinutes = await resolveIdleTimeoutMinutes(
      deps.db,
      user.businessId,
      scope.outletIds,
      activeOutletId,
    );
    const issued = await issueDeviceToken(deps.db, {
      userId: user.id,
      outletId: activeOutletId,
      label: "mobile",
      now,
    });

    const context: AuthContext = {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        username: user.username,
        phone: user.phone,
        role: user.role,
        businessId: user.businessId,
      },
      method: "bearer",
      activeOutletId,
      outletIds: scope.outletIds,
      outlets: scope.outlets,
      idleTimeoutMinutes,
      sessionExpiresAt: issued.expiresAt.toISOString(),
    };

    return {
      payload: {
        ...buildSessionPayload(context),
        token: issued.token,
        tokenExpiresAt: issued.expiresAt.toISOString(),
      },
      setCookies: [],
    };
  }

  const response = await deps.auth.api.signInEmail({
    body: { email: user.email, password: input.password },
    headers: deps.headers ?? new Headers(),
    asResponse: true,
  });

  if (!response.ok) {
    throw AuthError.internal("Gagal memulai sesi.");
  }

  const setCookies = response.headers.getSetCookie();
  const sessionHeaders = cookieHeaderFromSetCookies(setCookies);
  const context = await resolveAuthContext(deps, sessionHeaders, now);

  if (!context || context.method !== "web") {
    throw AuthError.internal("Gagal membaca sesi yang baru dibuat.");
  }

  return {
    payload: buildSessionPayload(context),
    setCookies,
  };
}
