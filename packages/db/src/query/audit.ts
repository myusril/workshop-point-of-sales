import { and, eq } from "drizzle-orm";
import type { Database } from "../client.ts";
import { auditLog, outlets, user } from "../schema/index.ts";
import {
  normalizeScope,
  ScopeViolationError,
  type OutletScope,
} from "./scope.ts";

export interface AppendAuditInput {
  action: string;
  entityType: string;
  entityId: string;
  actorId?: string | null;
  outletId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

/**
 * Audit payloads go through `jsonb`, so `bigint` money and `Date` values would
 * otherwise throw from `JSON.stringify`. Bigints become decimal strings (never
 * floats) and dates become ISO-8601 strings; arrays and plain objects recurse.
 */
function toJsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = toJsonSafe(entry);
    }
    return result;
  }
  return value;
}

/**
 * Appends an audit row. The business always comes from the scope; an outlet id
 * is accepted only when that outlet actually belongs to the scoped business,
 * and an actor id only when that user belongs to the scoped business.
 *
 * Callers must invoke this inside the same transaction as the mutation being
 * audited, otherwise a crash can commit the mutation without its audit row.
 */
export async function appendAuditEntry(
  db: Database,
  scope: OutletScope,
  input: AppendAuditInput,
) {
  const { businessId, outletIds } = normalizeScope(scope);
  const outletId = input.outletId?.trim() ?? null;
  const actorId = input.actorId?.trim() ?? null;

  if (outletId !== null) {
    if (outletId.length === 0) {
      throw new ScopeViolationError("Audit outlet id must not be blank");
    }
    if (!outletIds.includes(outletId)) {
      throw new ScopeViolationError(
        `Outlet ${outletId} is not in the requested outlet scope`,
      );
    }

    const [outlet] = await db
      .select({ id: outlets.id })
      .from(outlets)
      .where(and(eq(outlets.id, outletId), eq(outlets.businessId, businessId)))
      .limit(1);
    if (!outlet) {
      throw new ScopeViolationError(
        `Outlet ${outletId} does not belong to business ${businessId}`,
      );
    }
  }

  if (actorId !== null) {
    if (actorId.length === 0) {
      throw new ScopeViolationError("Audit actor id must not be blank");
    }

    const [actor] = await db
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.id, actorId), eq(user.businessId, businessId)))
      .limit(1);
    if (!actor) {
      throw new ScopeViolationError(
        `Actor ${actorId} does not belong to business ${businessId}`,
      );
    }
  }

  const [entry] = await db
    .insert(auditLog)
    .values({
      businessId,
      outletId,
      actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      before: input.before === undefined ? null : toJsonSafe(input.before),
      after: input.after === undefined ? null : toJsonSafe(input.after),
      reason: input.reason ?? null,
    })
    .returning();

  if (!entry) {
    throw new Error("Audit log insert returned no row");
  }
  return entry;
}
