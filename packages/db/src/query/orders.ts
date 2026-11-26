import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import type { Database } from "../client.ts";
import { orderStatusEvents, orders, user } from "../schema/index.ts";
import {
  normalizeScope,
  outletScoped,
  ScopeViolationError,
  type OutletScope,
} from "./scope.ts";

export type OrderStatusValue = (typeof orders.status.enumValues)[number];

export interface ListOrdersFilters {
  status?: OrderStatusValue;
  /** Inclusive lower bound on `created_at` (UTC). */
  from?: Date;
  /** Inclusive upper bound on `created_at` (UTC). */
  to?: Date;
  limit?: number;
  offset?: number;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError("limit must be a positive integer");
  }
  return Math.min(limit, MAX_LIMIT);
}

function normalizeOffset(offset: number | undefined): number {
  if (offset === undefined) return 0;
  if (!Number.isInteger(offset) || offset < 0) {
    throw new RangeError("offset must be a non-negative integer");
  }
  return offset;
}

export function listOrders(
  db: Database,
  scope: OutletScope,
  filters: ListOrdersFilters = {},
) {
  const { businessId, outletIds } = normalizeScope(scope);
  const predicates = [outletScoped(orders, { businessId, outletIds })];

  if (filters.status !== undefined) {
    predicates.push(eq(orders.status, filters.status));
  }
  if (filters.from !== undefined) {
    predicates.push(gte(orders.createdAt, filters.from));
  }
  if (filters.to !== undefined) {
    predicates.push(lte(orders.createdAt, filters.to));
  }

  return db
    .select()
    .from(orders)
    .where(and(...predicates))
    .orderBy(desc(orders.createdAt), asc(orders.id))
    .limit(normalizeLimit(filters.limit))
    .offset(normalizeOffset(filters.offset));
}

export interface AppendOrderStatusEventInput {
  orderId: string;
  fromStatus?: OrderStatusValue | null;
  toStatus: OrderStatusValue;
  actorId: string;
  reason?: string | null;
}

/**
 * Appends a staff-visible timeline entry (FR-049) after proving the order is in
 * the requested outlet scope and the actor belongs to the scoped business.
 * `created_at` is assigned by the server trigger, never by the caller.
 */
export async function appendOrderStatusEvent(
  db: Database,
  scope: OutletScope,
  input: AppendOrderStatusEventInput,
) {
  const { businessId, outletIds } = normalizeScope(scope);
  const orderId = input.orderId.trim();
  const actorId = input.actorId.trim();

  if (orderId.length === 0) {
    throw new ScopeViolationError("Order status event requires an order id");
  }
  if (actorId.length === 0) {
    throw new ScopeViolationError("Order status event requires an actor id");
  }

  return db.transaction(async (tx) => {
    const [order] = await tx
      .select({ id: orders.id })
      .from(orders)
      .where(
        and(
          eq(orders.id, orderId),
          eq(orders.businessId, businessId),
          inArray(orders.outletId, outletIds),
        ),
      )
      .limit(1);
    if (!order) {
      throw new ScopeViolationError(
        `Order ${orderId} is not in the requested outlet scope`,
      );
    }

    const [actor] = await tx
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.id, actorId), eq(user.businessId, businessId)))
      .limit(1);
    if (!actor) {
      throw new ScopeViolationError(
        `Actor ${actorId} does not belong to business ${businessId}`,
      );
    }

    const [event] = await tx
      .insert(orderStatusEvents)
      .values({
        orderId: order.id,
        fromStatus: input.fromStatus ?? null,
        toStatus: input.toStatus,
        actorId: actor.id,
        reason: input.reason ?? null,
      })
      .returning();

    if (!event) {
      throw new Error("Order status event insert returned no row");
    }
    return event;
  });
}
