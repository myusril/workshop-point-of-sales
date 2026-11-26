import { and, eq } from "drizzle-orm";
import type { Database } from "../client.ts";
import { settings } from "../schema/index.ts";
import {
  normalizeScope,
  ScopeViolationError,
  type OutletScope,
} from "./scope.ts";

export async function getSettings(
  db: Database,
  scope: OutletScope,
  outletId: string,
) {
  const { businessId, outletIds } = normalizeScope(scope);
  const requestedOutletId = outletId.trim();
  if (!outletIds.includes(requestedOutletId)) {
    throw new ScopeViolationError(
      `Outlet ${outletId} is not in the requested outlet scope`,
    );
  }

  const [row] = await db
    .select()
    .from(settings)
    .where(
      and(
        eq(settings.businessId, businessId),
        eq(settings.outletId, requestedOutletId),
      ),
    )
    .limit(1);
  return row;
}
