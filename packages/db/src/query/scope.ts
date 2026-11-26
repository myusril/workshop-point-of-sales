import { and, eq, inArray } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

/**
 * Every read/write helper takes a scope. There is intentionally no helper that
 * accepts a bare outlet id: scoping is deny-by-default and helper-enforced
 * (no row-level security in this design).
 */
export interface OutletScope {
  businessId: string;
  outletIds: readonly string[];
}

export interface NormalizedOutletScope {
  businessId: string;
  outletIds: string[];
}

export interface OutletScopedColumns {
  businessId: PgColumn;
  outletId: PgColumn;
}

export class ScopeViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScopeViolationError";
  }
}

/**
 * Validates and normalizes a scope: trims ids, drops blank entries, and
 * collapses duplicates so a repeated outlet id cannot weaken the predicate.
 */
export function normalizeScope(scope: OutletScope): NormalizedOutletScope {
  const businessId = scope.businessId.trim();
  if (businessId.length === 0) {
    throw new ScopeViolationError("Outlet scope requires a non-blank business id");
  }

  const outletIds = [
    ...new Set(
      scope.outletIds.map((outletId) => outletId.trim()).filter((id) => id.length > 0),
    ),
  ];
  if (outletIds.length === 0) {
    throw new ScopeViolationError(
      "Outlet scope requires at least one non-blank outlet id",
    );
  }

  return { businessId, outletIds };
}

export function assertScope(scope: OutletScope): void {
  normalizeScope(scope);
}

/**
 * The uniform scope predicate for outlet-owned tables:
 * `business_id = :businessId AND outlet_id IN (:outletIds)`.
 */
export function outletScoped(table: OutletScopedColumns, scope: OutletScope): SQL {
  const { businessId, outletIds } = normalizeScope(scope);
  const predicate = and(
    eq(table.businessId, businessId),
    inArray(table.outletId, outletIds),
  );
  if (!predicate) {
    throw new ScopeViolationError("Outlet scope requires at least one outlet id");
  }
  return predicate;
}
