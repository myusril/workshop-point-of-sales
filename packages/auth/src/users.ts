import {
  and,
  asc,
  count,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  ne,
  or,
  type SQL,
} from "drizzle-orm";

import {
  type CreateUserRequest,
  type ListUsersQuery,
  type UpdateUserRequest,
  type UserListResponse,
  type UserSummary,
} from "@workshop-pos/contracts";
import {
  account,
  appendAuditEntry,
  deviceTokens,
  loginAttempts,
  session as sessionTable,
  staffOutlets,
  user as userTable,
  type Database,
} from "@workshop-pos/db";
import type { Auth } from "better-auth";
import { randomUUID } from "node:crypto";

import { asDatabase } from "./db-locks.ts";
import { AuthError, uniqueViolationConstraint } from "./errors.ts";
import {
  assertOutletAccessAudited,
  assertPermission,
  auditDenial,
} from "./guard.ts";
import { normalizeIdentifier } from "./login-attempts.ts";
import { can, denialMessage } from "./rbac.ts";
import { findInvalidOutletIds } from "./scope.ts";
import type { AuthContext } from "./types.ts";

export interface UserWriteDeps {
  db: Database;
  auth: Auth;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  username: string | null;
  phone: string;
  role: "OWNER" | "ADMIN" | "CASHIER" | "MECHANIC";
  businessId: string;
  deactivatedAt: Date | null;
  createdAt: Date;
}

const USER_COLUMNS = {
  id: userTable.id,
  name: userTable.name,
  email: userTable.email,
  username: userTable.username,
  phone: userTable.phone,
  role: userTable.role,
  businessId: userTable.businessId,
  deactivatedAt: userTable.deactivatedAt,
  createdAt: userTable.createdAt,
} as const;

/**
 * Usernames share the login identifier namespace with phone numbers. An
 * all-digit username would shadow (or be shadowed by) a phone number during
 * identifier resolution; the contract rejects it, and this guard keeps the
 * invariant for internal callers too.
 */
function assertUsernameResolvable(username: string | null | undefined): void {
  if (!username) return;
  if (/^[0-9]+$/.test(username)) {
    throw AuthError.validation({
      username: ["Nama pengguna tidak boleh hanya berisi angka."],
    });
  }
}

async function assertOutletsAssignable(
  db: Database,
  businessId: string,
  outletIds: readonly string[],
): Promise<void> {
  const invalid = await findInvalidOutletIds(db, businessId, outletIds);
  if (invalid.length > 0) {
    throw AuthError.validation({
      outletIds: ["Outlet tidak ditemukan atau tidak aktif."],
    });
  }
}

async function assertIdentityAvailable(
  db: Database,
  businessId: string,
  values: { email: string; username?: string | null; phone: string },
  excludeUserId?: string,
): Promise<void> {
  const scope = excludeUserId
    ? and(eq(userTable.businessId, businessId), ne(userTable.id, excludeUserId))
    : eq(userTable.businessId, businessId);

  const [emailOwner] = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(and(scope, eq(userTable.email, values.email)))
    .limit(1);
  if (emailOwner) {
    throw AuthError.conflict("Email sudah digunakan pengguna lain.", {
      email: ["Email sudah digunakan pengguna lain."],
    });
  }

  if (values.username) {
    const [usernameOwner] = await db
      .select({ id: userTable.id })
      .from(userTable)
      .where(and(scope, eq(userTable.username, values.username)))
      .limit(1);
    if (usernameOwner) {
      throw AuthError.conflict("Nama pengguna sudah digunakan pengguna lain.", {
        username: ["Nama pengguna sudah digunakan pengguna lain."],
      });
    }
  }

  const [phoneOwner] = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(and(scope, eq(userTable.phone, values.phone)))
    .limit(1);
  if (phoneOwner) {
    throw AuthError.conflict("Nomor HP sudah digunakan pengguna lain.", {
      phone: ["Nomor HP sudah digunakan pengguna lain."],
    });
  }
}

async function outletIdsForUsers(
  db: Database,
  userIds: readonly string[],
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (userIds.length === 0) return result;

  const rows = await db
    .select({ userId: staffOutlets.userId, outletId: staffOutlets.outletId })
    .from(staffOutlets)
    .where(inArray(staffOutlets.userId, [...userIds]));

  for (const row of rows) {
    const existing = result.get(row.userId);
    if (existing) existing.push(row.outletId);
    else result.set(row.userId, [row.outletId]);
  }
  return result;
}

function toUserSummary(row: UserRow, outletIds: readonly string[]): UserSummary {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    username: row.username,
    phone: row.phone,
    role: row.role,
    outletIds: [...outletIds],
    isActive: row.deactivatedAt === null,
    deactivatedAt: row.deactivatedAt ? row.deactivatedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Staff list with search, role, outlet, status filters and pagination (FR-008). */
export async function listStaffUsers(
  db: Database,
  context: AuthContext,
  query: ListUsersQuery,
): Promise<UserListResponse> {
  assertPermission(context, "manage_users");

  const businessId = context.user.businessId;
  const conditions: SQL[] = [eq(userTable.businessId, businessId)];

  if (query.search) {
    const term = `%${query.search.replace(/[%_\\]/g, (character) => `\\${character}`)}%`;
    const searchClause = or(
      ilike(userTable.name, term),
      ilike(userTable.phone, term),
      ilike(userTable.email, term),
      ilike(userTable.username, term),
    );
    if (searchClause) conditions.push(searchClause);
  }
  if (query.role) conditions.push(eq(userTable.role, query.role));
  if (query.status === "active") {
    conditions.push(isNull(userTable.deactivatedAt));
  }
  if (query.status === "inactive") {
    conditions.push(isNotNull(userTable.deactivatedAt));
  }

  if (query.outletId) {
    await assertOutletAccessAudited(db, context, query.outletId, "manage_users", {
      entityType: "outlet",
      entityId: query.outletId,
    });
    const assignedUserIds = db
      .select({ userId: staffOutlets.userId })
      .from(staffOutlets)
      .where(eq(staffOutlets.outletId, query.outletId));
    conditions.push(inArray(userTable.id, assignedUserIds));
  }

  const where = and(...conditions);
  const [totalRow] = await db
    .select({ value: count() })
    .from(userTable)
    .where(where);

  const rows = await db
    .select(USER_COLUMNS)
    .from(userTable)
    .where(where)
    .orderBy(asc(userTable.name))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);

  const outletsByUser = await outletIdsForUsers(
    db,
    rows.map((row) => row.id),
  );

  return {
    items: rows.map((row) => toUserSummary(row, outletsByUser.get(row.id) ?? [])),
    page: query.page,
    pageSize: query.pageSize,
    total: totalRow?.value ?? 0,
  };
}

/**
 * Creates a staff member with a credential account. The Owner role can never
 * be created here (founder decision, 2026-11-26).
 */
export async function createStaffUser(
  deps: UserWriteDeps,
  context: AuthContext,
  input: CreateUserRequest,
): Promise<UserSummary> {
  assertPermission(context, "manage_users");
  // The contract type excludes OWNER, but the service also enforces it at
  // runtime so an internal caller cannot escalate privilege by casting.
  if ((input.role as string) === "OWNER") {
    throw AuthError.forbidden("Peran Pemilik tidak dapat dibuat melalui layanan ini.");
  }
  assertUsernameResolvable(input.username);
  if (
    (input.role === "CASHIER" || input.role === "MECHANIC") &&
    input.outletIds.length === 0
  ) {
    throw AuthError.validation({
      outletIds: ["Kasir dan mekanik harus ditugaskan ke minimal satu outlet."],
    });
  }
  const businessId = context.user.businessId;
  await assertOutletsAssignable(deps.db, businessId, input.outletIds);
  await assertIdentityAvailable(deps.db, businessId, {
    email: input.email,
    username: input.username ?? null,
    phone: input.phone,
  });

  const authContext = await deps.auth.$context;
  const passwordHash = await authContext.password.hash(input.password);
  const userId = randomUUID();
  const now = new Date();
  const outletIds = [...new Set(input.outletIds)];

  try {
    const created = await deps.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(userTable)
        .values({
          id: userId,
          name: input.name,
          email: input.email,
          businessId,
          role: input.role,
          username: input.username ?? null,
          displayUsername: input.username ?? null,
          phone: input.phone,
          updatedAt: now,
        })
        .returning(USER_COLUMNS);

      if (!row) throw new Error("User insert returned no row");

      await tx.insert(account).values({
        id: randomUUID(),
        accountId: userId,
        providerId: "credential",
        userId,
        password: passwordHash,
        updatedAt: now,
      });

      if (outletIds.length > 0) {
        await tx.insert(staffOutlets).values(
          outletIds.map((outletId) => ({ userId, outletId })),
        );
      }

      await appendAuditEntry(asDatabase(tx), {
        businessId,
        outletIds:
          context.outletIds.length > 0 ? context.outletIds : outletIds,
      }, {
        action: "user.created",
        entityType: "user",
        entityId: userId,
        actorId: context.user.id,
        outletId: context.activeOutletId,
        after: {
          name: row.name,
          email: row.email,
          username: row.username,
          phone: row.phone,
          role: row.role,
          outletIds,
        },
      });

      return row;
    });

    return toUserSummary(created, outletIds);
  } catch (error) {
    const constraint = uniqueViolationConstraint(error);
    if (constraint === "user_email_unique") {
      throw AuthError.conflict("Email sudah digunakan pengguna lain.", {
        email: ["Email sudah digunakan pengguna lain."],
      });
    }
    if (constraint === "user_username_unique") {
      throw AuthError.conflict("Nama pengguna sudah digunakan pengguna lain.", {
        username: ["Nama pengguna sudah digunakan pengguna lain."],
      });
    }
    throw error;
  }
}

/**
 * Edits a staff member. The Owner row may only have identity fields edited;
 * its role and outlet assignments are provisioned, not managed here.
 */
export async function updateStaffUser(
  db: Database,
  context: AuthContext,
  userId: string,
  input: UpdateUserRequest,
): Promise<UserSummary> {
  assertPermission(context, "manage_users");
  // Runtime guard mirrors the contract: OWNER is provisioned, never granted.
  if ((input.role as string | undefined) === "OWNER") {
    throw AuthError.forbidden("Peran Pemilik tidak dapat diberikan.");
  }
  assertUsernameResolvable(input.username);
  const businessId = context.user.businessId;

  const [target] = await db
    .select(USER_COLUMNS)
    .from(userTable)
    .where(and(eq(userTable.id, userId), eq(userTable.businessId, businessId)))
    .limit(1);

  if (!target) throw AuthError.notFound("Pengguna tidak ditemukan.");

  if (target.role === "OWNER") {
    if (input.role !== undefined) {
      throw AuthError.forbidden("Peran Pemilik tidak dapat diubah.");
    }
    if (input.outletIds !== undefined) {
      throw AuthError.forbidden("Penugasan outlet Pemilik tidak dapat diubah.");
    }
  }

  const resultingRole = input.role ?? target.role;
  const previousOutletIds =
    (await outletIdsForUsers(db, [target.id])).get(target.id) ?? [];
  const nextOutletIds =
    input.outletIds !== undefined
      ? [...new Set(input.outletIds)]
      : previousOutletIds;

  if (
    (resultingRole === "CASHIER" || resultingRole === "MECHANIC") &&
    nextOutletIds.length === 0
  ) {
    throw AuthError.validation({
      outletIds: ["Kasir dan mekanik harus ditugaskan ke minimal satu outlet."],
    });
  }
  if (input.outletIds !== undefined) {
    await assertOutletsAssignable(db, businessId, nextOutletIds);
  }

  const nextEmail = input.email ?? target.email;
  const nextUsername =
    input.username === undefined ? target.username : input.username;
  const nextPhone = input.phone ?? target.phone;
  if (
    nextEmail !== target.email ||
    nextUsername !== target.username ||
    nextPhone !== target.phone
  ) {
    await assertIdentityAvailable(
      db,
      businessId,
      { email: nextEmail, username: nextUsername, phone: nextPhone },
      target.id,
    );
  }

  const hasChanges =
    (input.name !== undefined && input.name !== target.name) ||
    nextEmail !== target.email ||
    nextUsername !== target.username ||
    nextPhone !== target.phone ||
    resultingRole !== target.role ||
    input.outletIds !== undefined;

  if (!hasChanges) {
    return toUserSummary(target, nextOutletIds);
  }

  try {
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(userTable)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(nextEmail !== target.email ? { email: nextEmail } : {}),
          ...(nextUsername !== target.username
            ? { username: nextUsername, displayUsername: nextUsername }
            : {}),
          ...(nextPhone !== target.phone ? { phone: nextPhone } : {}),
          ...(resultingRole !== target.role ? { role: resultingRole } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(userTable.id, target.id), eq(userTable.businessId, businessId)))
        .returning(USER_COLUMNS);

      if (!row) throw new Error("User update returned no row");

      if (input.outletIds !== undefined) {
        await tx.delete(staffOutlets).where(eq(staffOutlets.userId, target.id));
        if (nextOutletIds.length > 0) {
          await tx.insert(staffOutlets).values(
            nextOutletIds.map((outletId) => ({ userId: target.id, outletId })),
          );
        }
      }

      await appendAuditEntry(asDatabase(tx), {
        businessId,
        outletIds:
          context.outletIds.length > 0 ? context.outletIds : nextOutletIds,
      }, {
        action: "user.updated",
        entityType: "user",
        entityId: target.id,
        actorId: context.user.id,
        outletId: context.activeOutletId,
        before: {
          name: target.name,
          email: target.email,
          username: target.username,
          phone: target.phone,
          role: target.role,
          outletIds: previousOutletIds,
        },
        after: {
          name: row.name,
          email: row.email,
          username: row.username,
          phone: row.phone,
          role: row.role,
          outletIds: nextOutletIds,
        },
      });

      return row;
    });

    return toUserSummary(updated, nextOutletIds);
  } catch (error) {
    const constraint = uniqueViolationConstraint(error);
    if (constraint === "user_email_unique") {
      throw AuthError.conflict("Email sudah digunakan pengguna lain.", {
        email: ["Email sudah digunakan pengguna lain."],
      });
    }
    if (constraint === "user_username_unique") {
      throw AuthError.conflict("Nama pengguna sudah digunakan pengguna lain.", {
        username: ["Nama pengguna sudah digunakan pengguna lain."],
      });
    }
    throw error;
  }
}

/**
 * Deactivates a staff member: keeps the user row and all history, deletes every
 * session, and revokes every device token in the same transaction.
 */
export async function deactivateStaffUser(
  db: Database,
  context: AuthContext,
  userId: string,
  reason: string,
): Promise<UserSummary> {
  assertPermission(context, "manage_users");
  const businessId = context.user.businessId;
  const [target] = await db
    .select(USER_COLUMNS)
    .from(userTable)
    .where(and(eq(userTable.id, userId), eq(userTable.businessId, businessId)))
    .limit(1);

  if (!target) throw AuthError.notFound("Pengguna tidak ditemukan.");
  if (target.role === "OWNER") {
    throw AuthError.forbidden("Akun Pemilik tidak dapat dinonaktifkan.");
  }
  if (target.id === context.user.id) {
    throw AuthError.forbidden("Anda tidak dapat menonaktifkan akun sendiri.");
  }

  const outletIds = (await outletIdsForUsers(db, [target.id])).get(target.id) ?? [];
  if (target.deactivatedAt !== null) {
    return toUserSummary(target, outletIds);
  }

  const now = new Date();
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(userTable)
      .set({ deactivatedAt: now, updatedAt: now })
      .where(and(eq(userTable.id, target.id), eq(userTable.businessId, businessId)))
      .returning(USER_COLUMNS);

    if (!row) throw new Error("User deactivation returned no row");

    await tx.delete(sessionTable).where(eq(sessionTable.userId, target.id));
    await tx
      .update(deviceTokens)
      .set({ revokedAt: now })
      .where(and(eq(deviceTokens.userId, target.id), isNull(deviceTokens.revokedAt)));

    await appendAuditEntry(asDatabase(tx), {
      businessId,
      outletIds: context.outletIds.length > 0 ? context.outletIds : outletIds,
    }, {
      action: "user.deactivated",
      entityType: "user",
      entityId: target.id,
      actorId: context.user.id,
      outletId: context.activeOutletId,
      reason,
      before: {
        name: target.name,
        email: target.email,
        role: target.role,
        isActive: true,
      },
      after: { isActive: false },
    });

    return row;
  });

  return toUserSummary(updated, outletIds);
}

export interface UnlockStaffUserOptions {
  /** Recorded on the audit row; free text, never logged. */
  reason?: string | null;
}

export interface UnlockStaffUserResult {
  /** True when at least one recorded login attempt was cleared. */
  unlocked: boolean;
}

/**
 * Owner-only lockout recovery (DEC-0007). Clears every login-attempt key an
 * account can be locked under — each alias plus `user:<id>` — so a forgotten
 * password cannot lock a business out of its own console for 15 minutes per
 * alias. The deletion and its audit row share one transaction.
 */
export async function unlockStaffUser(
  db: Database,
  context: AuthContext,
  userId: string,
  options: UnlockStaffUserOptions = {},
): Promise<UnlockStaffUserResult> {
  if (!can(context.user.role, "manage_users")) {
    // Denied unlock attempts are audited: an attacker probing this endpoint is
    // as interesting as one probing the users list.
    await auditDenial(db, context, {
      action: "manage_users",
      entityType: "user",
      entityId: userId,
      outletId: context.activeOutletId,
      reason: "unlock requires manage_users",
    });
    throw AuthError.forbidden(denialMessage("manage_users"));
  }

  const businessId = context.user.businessId;
  const [target] = await db
    .select(USER_COLUMNS)
    .from(userTable)
    .where(and(eq(userTable.id, userId), eq(userTable.businessId, businessId)))
    .limit(1);

  if (!target) throw AuthError.notFound("Pengguna tidak ditemukan.");

  const keys = new Set<string>([`user:${target.id}`]);
  for (const alias of [target.email, target.username, target.phone]) {
    if (alias) keys.add(normalizeIdentifier(alias));
  }
  const identifiers = [...keys].filter((key) => key.length > 0);

  return db.transaction(async (tx) => {
    const store = asDatabase(tx);
    const cleared = await store
      .delete(loginAttempts)
      .where(inArray(loginAttempts.identifier, identifiers))
      .returning({ id: loginAttempts.id });

    await appendAuditEntry(store, {
      businessId,
      outletIds: context.outletIds,
    }, {
      action: "user.login_unlocked",
      entityType: "user",
      entityId: target.id,
      actorId: context.user.id,
      outletId: context.activeOutletId,
      reason: options.reason ?? null,
      // Count only: identifiers are personal data and stay out of the log.
      after: { attemptsCleared: cleared.length },
    });

    return { unlocked: cleared.length > 0 };
  });
}

