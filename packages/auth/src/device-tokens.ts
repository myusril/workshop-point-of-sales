import { randomBytes, createHash } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";

import type { StaffRole } from "@workshop-pos/contracts";
import {
  deviceTokens,
  user as userTable,
  type Database,
} from "@workshop-pos/db";

import { POLICY } from "./rbac.ts";

const TOKEN_BYTES = 32;
const TOKEN_TTL_MS = POLICY.deviceTokenTtlDays * 24 * 60 * 60 * 1000;
const LAST_USED_TOUCH_MS = POLICY.sessionTouchIntervalMs;
const MAX_TOKEN_LENGTH = 512;

/** A 256-bit random bearer token, base64url encoded. Returned only once. */
export function generateDeviceToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** SHA-256 lowercase hex; the only form ever persisted. */
export function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export interface IssueDeviceTokenInput {
  userId: string;
  outletId: string | null;
  label?: string | null;
  now?: Date;
}

export interface IssuedDeviceToken {
  token: string;
  expiresAt: Date;
}

/**
 * Stores the digest of a new mobile token. The raw token is never persisted or
 * logged; the caller is responsible for returning it to the client exactly once.
 */
export async function issueDeviceToken(
  db: Database,
  input: IssueDeviceTokenInput,
): Promise<IssuedDeviceToken> {
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + TOKEN_TTL_MS);
  const token = generateDeviceToken();

  await db.insert(deviceTokens).values({
    userId: input.userId,
    outletId: input.outletId,
    tokenHash: hashDeviceToken(token),
    label: input.label ?? null,
    expiresAt,
  });

  return { token, expiresAt };
}

export interface DeviceTokenResolution {
  tokenId: string;
  userId: string;
  outletId: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  lastUsedAt: Date | null;
  user: {
    id: string;
    name: string;
    email: string;
    username: string | null;
    phone: string;
    role: StaffRole;
    businessId: string;
    deactivatedAt: Date | null;
  };
}

/**
 * Resolves a raw bearer token to its user and token row. Rejects unknown,
 * revoked, expired, or deactivated-user tokens.
 *
 * Resolution is read-only: it never writes `last_used_at`, so the caller can
 * compare `lastUsedAt ?? createdAt` against the outlet idle timeout *before*
 * any touch. A request that arrives outside the idle window must be refused,
 * never allowed to renew the credential.
 */
export async function resolveDeviceToken(
  db: Database,
  token: string,
  now: Date = new Date(),
): Promise<DeviceTokenResolution | null> {
  const trimmed = token.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_TOKEN_LENGTH) return null;

  const tokenHash = hashDeviceToken(trimmed);
  const [row] = await db
    .select({
      tokenId: deviceTokens.id,
      userId: deviceTokens.userId,
      outletId: deviceTokens.outletId,
      expiresAt: deviceTokens.expiresAt,
      revokedAt: deviceTokens.revokedAt,
      createdAt: deviceTokens.createdAt,
      lastUsedAt: deviceTokens.lastUsedAt,
      userName: userTable.name,
      userEmail: userTable.email,
      userUsername: userTable.username,
      userPhone: userTable.phone,
      userRole: userTable.role,
      userBusinessId: userTable.businessId,
      userDeactivatedAt: userTable.deactivatedAt,
    })
    .from(deviceTokens)
    .innerJoin(userTable, eq(deviceTokens.userId, userTable.id))
    .where(eq(deviceTokens.tokenHash, tokenHash))
    .limit(1);

  if (!row) return null;
  if (row.revokedAt !== null) return null;
  if (row.expiresAt !== null && row.expiresAt.getTime() <= now.getTime()) return null;

  if (row.userDeactivatedAt !== null) {
    // A deactivated account must not keep a usable device credential.
    await db
      .update(deviceTokens)
      .set({ revokedAt: now })
      .where(and(eq(deviceTokens.id, row.tokenId), isNull(deviceTokens.revokedAt)));
    return null;
  }

  return {
    tokenId: row.tokenId,
    userId: row.userId,
    outletId: row.outletId,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    user: {
      id: row.userId,
      name: row.userName,
      email: row.userEmail,
      username: row.userUsername,
      phone: row.userPhone,
      role: row.userRole,
      businessId: row.userBusinessId,
      deactivatedAt: row.userDeactivatedAt,
    },
  };
}

/**
 * Records activity for an already-authorised token at most once per touch
 * interval, so a busy device does not write on every request. Called only
 * after the idle check has passed.
 */
export async function touchDeviceToken(
  db: Database,
  tokenId: string,
  now: Date = new Date(),
  lastUsedAt: Date | null = null,
): Promise<boolean> {
  if (
    lastUsedAt !== null &&
    now.getTime() - lastUsedAt.getTime() < LAST_USED_TOUCH_MS
  ) {
    return false;
  }

  const rows = await db
    .update(deviceTokens)
    .set({ lastUsedAt: now })
    .where(and(eq(deviceTokens.id, tokenId), isNull(deviceTokens.revokedAt)))
    .returning({ id: deviceTokens.id });

  return rows.length > 0;
}

/** Revokes one token by raw value. Returns true when an active row was revoked. */
export async function revokeDeviceToken(
  db: Database,
  token: string,
  now: Date = new Date(),
): Promise<boolean> {
  const trimmed = token.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_TOKEN_LENGTH) return false;

  const rows = await db
    .update(deviceTokens)
    .set({ revokedAt: now })
    .where(
      and(
        eq(deviceTokens.tokenHash, hashDeviceToken(trimmed)),
        isNull(deviceTokens.revokedAt),
      ),
    )
    .returning({ id: deviceTokens.id });

  return rows.length > 0;
}

/** Revokes every active token for a user (logout-all / deactivation). */
export async function revokeUserDeviceTokens(
  db: Database,
  userId: string,
  now: Date = new Date(),
): Promise<number> {
  const rows = await db
    .update(deviceTokens)
    .set({ revokedAt: now })
    .where(and(eq(deviceTokens.userId, userId), isNull(deviceTokens.revokedAt)))
    .returning({ id: deviceTokens.id });
  return rows.length;
}

/** Revokes one token by row id (server-side logout with an already-hashed id). */
export async function revokeDeviceTokenById(
  db: Database,
  tokenId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const rows = await db
    .update(deviceTokens)
    .set({ revokedAt: now })
    .where(and(eq(deviceTokens.id, tokenId), isNull(deviceTokens.revokedAt)))
    .returning({ id: deviceTokens.id });
  return rows.length > 0;
}

/** Updates the active outlet pinned on a device token. */
export async function pinDeviceTokenOutlet(
  db: Database,
  tokenId: string,
  outletId: string | null,
): Promise<void> {
  await db
    .update(deviceTokens)
    .set({ outletId })
    .where(eq(deviceTokens.id, tokenId));
}
