import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../client.ts";
import {
  ledgerEntryType,
  ledgerSourceType,
  orderLines,
  orders,
  products,
  stockLedger,
  user,
} from "../schema/index.ts";
import {
  normalizeScope,
  outletScoped,
  ScopeViolationError,
  type OutletScope,
} from "./scope.ts";

export type LedgerEntryTypeValue = (typeof ledgerEntryType.enumValues)[number];
export type LedgerSourceTypeValue = (typeof ledgerSourceType.enumValues)[number];

export interface AppendStockLedgerInput {
  productId: string;
  entryType: LedgerEntryTypeValue;
  quantityBefore: number;
  quantityAfter: number;
  sourceType: LedgerSourceTypeValue;
  createdBy: string;
  override?: boolean;
  reason?: string | null;
  sourceId?: string | null;
  sourceRef?: string | null;
  orderLineId?: string | null;
}

export function listStockLedger(
  db: Database,
  scope: OutletScope,
  filters: { productId: string },
) {
  normalizeScope(scope);
  return db
    .select()
    .from(stockLedger)
    .where(
      and(
        outletScoped(stockLedger, scope),
        eq(stockLedger.productId, filters.productId),
      ),
    )
    .orderBy(desc(stockLedger.createdAt), desc(stockLedger.id));
}

/** Stock-on-hand is always recomputed from the append-only ledger, in scope. */
export async function stockOnHand(
  db: Database,
  scope: OutletScope,
  productId: string,
): Promise<bigint> {
  normalizeScope(scope);
  const [row] = await db
    .select({
      total: sql<string>`coalesce(sum(${stockLedger.quantityAfter} - ${stockLedger.quantityBefore}), 0)`,
    })
    .from(stockLedger)
    .where(
      and(
        outletScoped(stockLedger, scope),
        eq(stockLedger.productId, productId),
      ),
    );
  return BigInt(row?.total ?? "0");
}

/**
 * Appends a ledger row only after proving the product, the acting user, the
 * order line, and the source order all belong to the scoped business (and, for
 * orders, an outlet in scope). The product lookup, the attribution checks, and
 * the insert share one transaction so a row can never reference out-of-scope
 * data.
 *
 * Stock continuity and per-product serialization (`SELECT ... FOR UPDATE`,
 * derived `quantity_before`) are WP4's responsibility; this helper validates
 * tenant provenance only.
 */
export async function appendStockLedgerEntry(
  db: Database,
  scope: OutletScope,
  input: AppendStockLedgerInput,
) {
  const { businessId, outletIds } = normalizeScope(scope);
  const orderLineId = input.orderLineId?.trim() ?? null;
  const sourceId = input.sourceId?.trim() ?? null;
  const createdBy = input.createdBy.trim();

  if (createdBy.length === 0) {
    throw new ScopeViolationError("Stock ledger createdBy must not be blank");
  }

  return db.transaction(async (tx) => {
    const [product] = await tx
      .select({
        id: products.id,
        businessId: products.businessId,
        outletId: products.outletId,
      })
      .from(products)
      .where(
        and(
          eq(products.id, input.productId),
          eq(products.businessId, businessId),
          inArray(products.outletId, outletIds),
        ),
      )
      .limit(1);

    if (!product) {
      throw new ScopeViolationError(
        `Product ${input.productId} is not in the requested outlet scope`,
      );
    }

    const [creator] = await tx
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.id, createdBy), eq(user.businessId, businessId)))
      .limit(1);
    if (!creator) {
      throw new ScopeViolationError(
        `User ${createdBy} does not belong to business ${businessId}`,
      );
    }

    if (orderLineId !== null) {
      const [line] = await tx
        .select({ id: orderLines.id })
        .from(orderLines)
        .innerJoin(orders, eq(orders.id, orderLines.orderId))
        .where(
          and(
            eq(orderLines.id, orderLineId),
            eq(orders.businessId, businessId),
            inArray(orders.outletId, outletIds),
          ),
        )
        .limit(1);
      if (!line) {
        throw new ScopeViolationError(
          `Order line ${orderLineId} is not in the requested outlet scope`,
        );
      }
    }

    if (input.sourceType === "ORDER" && sourceId !== null) {
      const [order] = await tx
        .select({ id: orders.id })
        .from(orders)
        .where(
          and(
            eq(orders.id, sourceId),
            eq(orders.businessId, businessId),
            inArray(orders.outletId, outletIds),
          ),
        )
        .limit(1);
      if (!order) {
        throw new ScopeViolationError(
          `Order ${sourceId} is not in the requested outlet scope`,
        );
      }
    }

    const [entry] = await tx
      .insert(stockLedger)
      .values({
        businessId: product.businessId,
        outletId: product.outletId,
        productId: product.id,
        entryType: input.entryType,
        quantityBefore: input.quantityBefore,
        quantityAfter: input.quantityAfter,
        override: input.override ?? false,
        reason: input.reason ?? null,
        sourceType: input.sourceType,
        sourceId,
        sourceRef: input.sourceRef ?? null,
        orderLineId,
        createdBy,
      })
      .returning();

    if (!entry) {
      throw new Error("Stock ledger insert returned no row");
    }
    return entry;
  });
}
