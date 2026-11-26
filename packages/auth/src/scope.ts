import { and, eq, inArray } from "drizzle-orm";

import type { OutletSummary, StaffRole } from "@workshop-pos/contracts";
import {
  getSettings,
  outlets,
  staffOutlets,
  type Database,
} from "@workshop-pos/db";

import { POLICY } from "./rbac.ts";
import type { ScopedOutlets } from "./types.ts";

interface ScopeUser {
  id: string;
  businessId: string;
  role: StaffRole;
}

/**
 * Outlet scope resolution (FR-004, BR-012):
 * - OWNER/ADMIN see every active outlet of the business.
 * - CASHIER/MECHANIC see only the active outlets they are assigned to.
 */
export async function getOutletScope(
  db: Database,
  user: ScopeUser,
): Promise<ScopedOutlets> {
  if (user.role === "OWNER" || user.role === "ADMIN") {
    const rows = await db
      .select({
        id: outlets.id,
        name: outlets.name,
        isActive: outlets.isActive,
      })
      .from(outlets)
      .where(
        and(eq(outlets.businessId, user.businessId), eq(outlets.isActive, true)),
      )
      .orderBy(outlets.name);

    return toScopedOutlets(rows);
  }

  const rows = await db
    .select({
      id: outlets.id,
      name: outlets.name,
      isActive: outlets.isActive,
    })
    .from(staffOutlets)
    .innerJoin(outlets, eq(staffOutlets.outletId, outlets.id))
    .where(
      and(
        eq(staffOutlets.userId, user.id),
        eq(outlets.businessId, user.businessId),
        eq(outlets.isActive, true),
      ),
    )
    .orderBy(outlets.name);

  return toScopedOutlets(rows);
}

function toScopedOutlets(rows: OutletSummary[]): ScopedOutlets {
  return {
    outlets: rows.map((row) => ({
      id: row.id,
      name: row.name,
      isActive: row.isActive,
    })),
    outletIds: rows.map((row) => row.id),
  };
}

/**
 * Per-outlet idle timeout (FR-070). A missing settings row falls back to the
 * product default rather than locking anyone out.
 */
export async function resolveIdleTimeoutMinutes(
  db: Database,
  businessId: string,
  outletIds: readonly string[],
  outletId: string | null,
): Promise<number> {
  if (!outletId || !outletIds.includes(outletId)) {
    return POLICY.defaultIdleTimeoutMinutes;
  }

  try {
    const row = await getSettings(db, { businessId, outletIds }, outletId);
    if (row && row.idleTimeoutMinutes > 0) return row.idleTimeoutMinutes;
    return POLICY.defaultIdleTimeoutMinutes;
  } catch {
    // ScopeViolationError from the WP2 helper means the outlet moved out of
    // scope between resolution and lookup; the safe timeout still applies.
    return POLICY.defaultIdleTimeoutMinutes;
  }
}

/** Active outlets of a business (management views include inactive ones). */
export async function listActiveOutletIds(
  db: Database,
  businessId: string,
): Promise<string[]> {
  const rows = await db
    .select({ id: outlets.id })
    .from(outlets)
    .where(and(eq(outlets.businessId, businessId), eq(outlets.isActive, true)));
  return rows.map((row) => row.id);
}

/** Validates that every supplied outlet belongs to the business and is active. */
export async function findInvalidOutletIds(
  db: Database,
  businessId: string,
  outletIds: readonly string[],
): Promise<string[]> {
  const unique = [...new Set(outletIds)];
  if (unique.length === 0) return [];

  const rows = await db
    .select({ id: outlets.id })
    .from(outlets)
    .where(
      and(
        eq(outlets.businessId, businessId),
        eq(outlets.isActive, true),
        inArray(outlets.id, unique),
      ),
    );

  const valid = new Set(rows.map((row) => row.id));
  return unique.filter((id) => !valid.has(id));
}
