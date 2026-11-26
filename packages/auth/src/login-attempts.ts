import { and, desc, gte, inArray, lt } from "drizzle-orm";

import { normalizePhoneNumber } from "@workshop-pos/contracts";
import { loginAttempts, type Database } from "@workshop-pos/db";

import { POLICY } from "./rbac.ts";

/**
 * Hard cap on a stored identifier, in characters. The login contract caps the
 * raw input too; this is the defence-in-depth bound for direct callers.
 */
export const MAX_IDENTIFIER_LENGTH = 320;

/**
 * Retention for operational attempt rows (DEC-0009 keeps the 30-day window).
 * The lockout logic only ever reads the attempt window; older rows are pruned
 * opportunistically so the table cannot grow without bound.
 */
export const ATTEMPT_RETENTION_HOURS = 30 * 24;

const LOCKOUT_MS = POLICY.lockoutMinutes * 60 * 1000;
const WINDOW_MS = POLICY.attemptWindowMinutes * 60 * 1000;
const RETENTION_MS = ATTEMPT_RETENTION_HOURS * 60 * 60 * 1000;

/** Rows deleted per global prune run, so one pass never holds a long lock. */
const GLOBAL_PRUNE_BATCH = 1_000;
/** Global prune cadence per process. */
const GLOBAL_PRUNE_INTERVAL_MS = 60 * 60 * 1000;

let lastGlobalPruneAt = 0;
let globalPruneInFlight: Promise<number> | null = null;

const PHONE_PATTERN = /^0[0-9]{7,14}$/;

/**
 * One canonical identifier per login attempt row: lowercased email/username or
 * the normalized phone number. The raw password is never part of this shape.
 */
export function normalizeIdentifier(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return "";

  const normalized = trimmed.includes("@")
    ? trimmed.toLowerCase()
    : normalizeNonEmail(trimmed);

  return normalized.length > MAX_IDENTIFIER_LENGTH
    ? normalized.slice(0, MAX_IDENTIFIER_LENGTH)
    : normalized;
}

function normalizeNonEmail(input: string): string {
  const phone = normalizePhoneNumber(input);
  return PHONE_PATTERN.test(phone) ? phone : input.toLowerCase();
}

/**
 * Lockout keys for an attempt. A resolved account counts attempts on every
 * alias (email, username, phone) through `user:<id>`, so rotating the
 * identifier cannot buy a fresh failure budget. Unknown identifiers are keyed
 * by the submitted identifier alone, because there is no account to protect.
 */
export function accountLockKeys(
  identifier: string,
  userId: string | null,
): string[] {
  const keys = [identifier];
  if (userId) keys.push(`user:${userId}`);
  return keys;
}

export interface LockStatus {
  locked: boolean;
  retryAfterSeconds: number;
}

interface AttemptRow {
  identifier: string;
  succeeded: boolean;
  attemptedAt: Date;
}

/**
 * Pure lockout arithmetic: `failureTimes` is the current consecutive-failure
 * streak, newest first. The lock anchors on the failure that completed the
 * streak, so rejected attempts while locked cannot extend it.
 */
export function evaluateLockStatus(
  failureTimes: readonly Date[],
  now: Date,
): LockStatus {
  const count = failureTimes.length;
  if (count < POLICY.maxFailures) {
    return { locked: false, retryAfterSeconds: 0 };
  }

  const anchor =
    count === POLICY.maxFailures
      ? failureTimes[0]
      : failureTimes[count - POLICY.maxFailures];
  if (!anchor) return { locked: false, retryAfterSeconds: 0 };

  const remainingMs = anchor.getTime() + LOCKOUT_MS - now.getTime();
  if (remainingMs <= 0) return { locked: false, retryAfterSeconds: 0 };

  return {
    locked: true,
    retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)),
  };
}

function statusForRows(
  rows: readonly AttemptRow[],
  windowStart: Date,
  now: Date,
): LockStatus {
  const lastSuccess = rows.find(
    (row) => row.succeeded && row.attemptedAt.getTime() > windowStart.getTime(),
  );
  const streakStart = lastSuccess ? lastSuccess.attemptedAt : windowStart;
  const failures = rows
    .filter(
      (row) => !row.succeeded && row.attemptedAt.getTime() >= streakStart.getTime(),
    )
    .map((row) => row.attemptedAt);
  return evaluateLockStatus(failures, now);
}

/**
 * Five consecutive failures within the attempt window lock every key for 15
 * minutes. A success on any alias resets the streak for all of them, and once
 * the lock expires the failures fall outside the window, so the counter starts
 * again.
 */
export async function getLockStatusForKeys(
  db: Database,
  keys: readonly string[],
  now: Date = new Date(),
): Promise<LockStatus> {
  const keyList = [...new Set(keys)].filter((key) => key.length > 0);
  if (keyList.length === 0) return { locked: false, retryAfterSeconds: 0 };

  const windowStart = new Date(now.getTime() - WINDOW_MS);
  const rows = await db
    .select({
      identifier: loginAttempts.identifier,
      succeeded: loginAttempts.succeeded,
      attemptedAt: loginAttempts.attemptedAt,
    })
    .from(loginAttempts)
    .where(
      and(
        inArray(loginAttempts.identifier, keyList),
        gte(loginAttempts.attemptedAt, windowStart),
      ),
    )
    .orderBy(desc(loginAttempts.attemptedAt));

  let retryAfterSeconds = 0;
  for (const key of keyList) {
    const keyRows = rows.filter((row) => row.identifier === key);
    const status = statusForRows(keyRows, windowStart, now);
    if (status.locked) {
      retryAfterSeconds = Math.max(retryAfterSeconds, status.retryAfterSeconds);
    }
  }

  return retryAfterSeconds > 0
    ? { locked: true, retryAfterSeconds }
    : { locked: false, retryAfterSeconds: 0 };
}

/** Single-key convenience wrapper around {@link getLockStatusForKeys}. */
export function getLockStatus(
  db: Database,
  identifier: string,
  now: Date = new Date(),
): Promise<LockStatus> {
  return getLockStatusForKeys(db, [identifier], now);
}

export interface RecordLoginAttemptInput {
  identifier: string;
  succeeded: boolean;
  userId?: string | null;
  now?: Date;
}

/**
 * Records the attempt for every lockout key. Callers pass the result of
 * {@link accountLockKeys}, so an alias and its account key stay in step.
 */
export async function recordLoginAttempts(
  db: Database,
  inputs: readonly RecordLoginAttemptInput[],
): Promise<void> {
  if (inputs.length === 0) return;

  await db.insert(loginAttempts).values(
    inputs.map((input) => ({
      identifier: input.identifier.slice(0, MAX_IDENTIFIER_LENGTH),
      succeeded: input.succeeded,
      userId: input.userId ?? null,
      attemptedAt: input.now ?? new Date(),
    })),
  );
}

export async function recordLoginAttempt(
  db: Database,
  input: RecordLoginAttemptInput,
): Promise<void> {
  await recordLoginAttempts(db, [input]);
}

/**
 * Deletes attempt rows for the touched keys once they are older than the
 * retention window. Called in the same transaction as the attempt write.
 */
export async function pruneLoginAttempts(
  db: Database,
  keys: readonly string[],
  now: Date = new Date(),
): Promise<number> {
  const keyList = [...new Set(keys)].filter((key) => key.length > 0);
  if (keyList.length === 0) return 0;

  const cutoff = new Date(now.getTime() - RETENTION_MS);
  const deleted = await db
    .delete(loginAttempts)
    .where(
      and(
        inArray(loginAttempts.identifier, keyList),
        lt(loginAttempts.attemptedAt, cutoff),
      ),
    )
    .returning({ id: loginAttempts.id });

  return deleted.length;
}

/**
 * Deletes every attempt row older than the retention window, in bounded
 * batches. Keys that are never attempted again would otherwise keep their rows
 * forever, so this runs independently of {@link pruneLoginAttempts}.
 */
export async function pruneExpiredLoginAttempts(
  db: Database,
  now: Date = new Date(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - RETENTION_MS);
  const expired = db
    .select({ id: loginAttempts.id })
    .from(loginAttempts)
    .where(lt(loginAttempts.attemptedAt, cutoff))
    .limit(GLOBAL_PRUNE_BATCH);

  const deleted = await db
    .delete(loginAttempts)
    .where(inArray(loginAttempts.id, expired))
    .returning({ id: loginAttempts.id });

  return deleted.length;
}

/**
 * Opportunistic global prune, at most once per process-hour and never
 * concurrent with itself. The caller decides how to surface a failure; the
 * login path logs it and continues.
 */
export function maybePruneExpiredLoginAttempts(
  db: Database,
  now: Date = new Date(),
): Promise<number> {
  if (globalPruneInFlight) return globalPruneInFlight;
  if (Date.now() - lastGlobalPruneAt < GLOBAL_PRUNE_INTERVAL_MS) {
    return Promise.resolve(0);
  }

  lastGlobalPruneAt = Date.now();
  globalPruneInFlight = pruneExpiredLoginAttempts(db, now).finally(() => {
    globalPruneInFlight = null;
  });
  return globalPruneInFlight;
}
