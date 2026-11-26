import { and, count, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import type {
  AdjustmentRequest,
  InventoryProduct,
  LedgerEntry,
  LedgerEntryType,
  LedgerListQuery,
  LedgerListResponse,
  LedgerSourceType,
  LowStockItem,
  LowStockResponse,
  MovementResponse,
  StockInRequest,
} from "@workshop-pos/contracts";
import {
  assertPermission,
  auditDenial,
  AuthError,
  can,
  CROSS_OUTLET_MESSAGE,
  denialMessage,
  uniqueViolationConstraint,
  type AuthContext,
} from "@workshop-pos/auth";
import {
  isLowStock,
  lowStockShortfall,
  planStockMovement,
  StockRuleError,
  type StockMovementPlan,
} from "@workshop-pos/core";
import {
  appendAuditEntry,
  orderLines,
  orders,
  outletScoped,
  outlets,
  products,
  stockLedger,
  user,
  type Database,
  type OutletScope,
} from "@workshop-pos/db";

/**
 * Stock ledger operations (FR-050–FR-054, BR-005).
 *
 * Stock-on-hand is never stored: it is `sum(quantity_after - quantity_before)`
 * over the append-only ledger. Every mutation opens one transaction, locks the
 * product row (`SELECT … FOR UPDATE`), derives the balance and plans the
 * movement, then writes the ledger row and its audit row together. A rejected
 * movement writes neither.
 */

type TransactionHandle = Parameters<Parameters<Database["transaction"]>[0]>[0];

function asDatabase(tx: TransactionHandle): Database {
  return tx as unknown as Database;
}

const LEDGER_COLUMNS = {
  id: stockLedger.id,
  productId: stockLedger.productId,
  entryType: stockLedger.entryType,
  quantityBefore: stockLedger.quantityBefore,
  quantityAfter: stockLedger.quantityAfter,
  override: stockLedger.override,
  reason: stockLedger.reason,
  sourceType: stockLedger.sourceType,
  sourceId: stockLedger.sourceId,
  sourceRef: stockLedger.sourceRef,
  createdBy: stockLedger.createdBy,
  createdAt: stockLedger.createdAt,
} as const;

const PRODUCT_STOCK_COLUMNS = {
  id: products.id,
  outletId: products.outletId,
  sku: products.sku,
  name: products.name,
  unit: products.unit,
  lowStockThreshold: products.lowStockThreshold,
  isActive: products.isActive,
} as const;

interface LedgerRow {
  id: string;
  productId: string;
  entryType: LedgerEntryType;
  quantityBefore: number;
  quantityAfter: number;
  override: boolean;
  reason: string | null;
  sourceType: LedgerSourceType;
  sourceId: string | null;
  sourceRef: string | null;
  createdBy: string;
  createdAt: Date;
}

interface ProductStockRow {
  id: string;
  outletId: string;
  sku: string;
  name: string;
  unit: string;
  lowStockThreshold: number | null;
  isActive: boolean;
}

interface WrittenMovement {
  product: ProductStockRow;
  outletName: string;
  plan: StockMovementPlan;
  entry: LedgerRow;
}

function scopeOf(context: AuthContext): OutletScope {
  const active =
    context.activeOutletId && context.outletIds.includes(context.activeOutletId)
      ? context.activeOutletId
      : (context.outletIds[0] ?? null);
  if (!active) {
    throw AuthError.forbidden("Anda belum ditugaskan ke outlet mana pun.");
  }
  return { businessId: context.user.businessId, outletIds: [active] };
}

function toInventoryProduct(
  row: ProductStockRow,
  outletName: string,
  stockOnHand: number,
): InventoryProduct {
  return {
    id: row.id,
    outletId: row.outletId,
    outletName,
    sku: row.sku,
    name: row.name,
    unit: row.unit,
    stockOnHand,
    lowStockThreshold: row.lowStockThreshold,
    isLowStock: isLowStock(stockOnHand, row.lowStockThreshold),
    isActive: row.isActive,
  };
}

function toLedgerEntry(
  row: LedgerRow,
  product: { sku: string; name: string },
  actorName: string,
): LedgerEntry {
  return {
    id: row.id,
    productId: row.productId,
    productSku: product.sku,
    productName: product.name,
    entryType: row.entryType,
    quantityBefore: row.quantityBefore,
    quantityAfter: row.quantityAfter,
    quantityDelta: row.quantityAfter - row.quantityBefore,
    override: row.override,
    reason: row.reason,
    sourceType: row.sourceType,
    sourceRef: row.sourceRef,
    actorId: row.createdBy,
    actorName,
    createdAt: row.createdAt.toISOString(),
  };
}

function toMovementResponse(
  movement: WrittenMovement,
  actorName: string,
): MovementResponse {
  return {
    entry: toLedgerEntry(movement.entry, movement.product, actorName),
    product: toInventoryProduct(movement.product, movement.outletName, movement.plan.after),
    stockOnHand: movement.plan.after,
  };
}

/** Runs a stock query on either the pool or a transaction handle. */
async function stockOnHandInScope(
  db: Database,
  scope: OutletScope,
  productId: string,
): Promise<number> {
  const [row] = await db
    .select({
      total: sql<string>`coalesce(sum(${stockLedger.quantityAfter} - ${stockLedger.quantityBefore}), 0)`,
    })
    .from(stockLedger)
    .where(
      and(outletScoped(stockLedger, scope), eq(stockLedger.productId, productId)),
    );
  return Number(row?.total ?? "0");
}

async function stockByProduct(
  db: Database,
  scope: OutletScope,
  productIds: readonly string[],
): Promise<Map<string, number>> {
  if (productIds.length === 0) return new Map();

  const rows = await db
    .select({
      productId: stockLedger.productId,
      total: sql<string>`coalesce(sum(${stockLedger.quantityAfter} - ${stockLedger.quantityBefore}), 0)`,
    })
    .from(stockLedger)
    .where(
      and(
        outletScoped(stockLedger, scope),
        inArray(stockLedger.productId, [...productIds]),
      ),
    )
    .groupBy(stockLedger.productId);

  return new Map(rows.map((row) => [row.productId, Number(row.total)]));
}

/**
 * Confirms the product exists in the business, and refuses an outlet the caller
 * is not assigned to after auditing the attempt (cross-outlet is 403, unknown
 * is 404). Runs outside the mutation transaction so the denial audit commits.
 */
async function requireProductAccess(
  db: Database,
  context: AuthContext,
  productId: string,
): Promise<void> {
  const [found] = await db
    .select({ outletId: products.outletId })
    .from(products)
    .where(
      and(
        eq(products.id, productId),
        eq(products.businessId, context.user.businessId),
        isNull(products.deletedAt),
      ),
    )
    .limit(1);

  if (!found) throw AuthError.notFound("Produk tidak ditemukan.");
  const activeOutletId = scopeOf(context).outletIds[0];
  if (found.outletId === activeOutletId) return;

  if (context.outletIds.includes(found.outletId)) {
    throw AuthError.notFound("Produk tidak ditemukan pada outlet aktif.");
  }

  await auditDenial(db, context, {
    action: "manage_stock",
    entityType: "product",
    entityId: productId,
    outletId: found.outletId,
    crossOutlet: true,
  });
  throw AuthError.forbidden(CROSS_OUTLET_MESSAGE);
}

async function requireOverridePermission(
  db: Database,
  context: AuthContext,
  productId: string,
): Promise<void> {
  if (can(context.user.role, "override_stock")) return;

  await auditDenial(db, context, {
    action: "override_stock",
    entityType: "product",
    entityId: productId,
    outletId: context.activeOutletId,
  });
  throw AuthError.forbidden(denialMessage("override_stock"));
}

async function lockScopedProduct(
  tx: TransactionHandle,
  scope: OutletScope,
  productId: string,
): Promise<ProductStockRow> {
  const [row] = await tx
    .select(PRODUCT_STOCK_COLUMNS)
    .from(products)
    .where(
      and(
        eq(products.id, productId),
        eq(products.businessId, scope.businessId),
        inArray(products.outletId, [...scope.outletIds]),
        isNull(products.deletedAt),
      ),
    )
    .limit(1)
    .for("update");

  if (!row) throw AuthError.notFound("Produk tidak ditemukan.");
  return row;
}

async function outletNameOf(
  db: Database,
  businessId: string,
  outletId: string,
): Promise<string> {
  const [row] = await db
    .select({ name: outlets.name })
    .from(outlets)
    .where(and(eq(outlets.id, outletId), eq(outlets.businessId, businessId)))
    .limit(1);
  return row?.name ?? "";
}

/**
 * Plans a movement, translating a stock-rule rejection into the API error the
 * route returns. An insufficient balance is a 409 that names the product; any
 * other rule violation is a 400 (the contract normally prevents it).
 */
function planMovement(
  input: Parameters<typeof planStockMovement>[0],
  product: { name: string; sku: string },
): StockMovementPlan {
  try {
    return planStockMovement(input);
  } catch (error) {
    if (error instanceof StockRuleError) {
      if (error.code === "NEGATIVE_WITHOUT_OVERRIDE") {
        throw AuthError.conflict(
          `Stok ${product.name} (${product.sku}) tidak mencukupi. Tidak ada perubahan stok yang disimpan.`,
        );
      }
      throw AuthError.validation({}, error.message);
    }
    throw error;
  }
}

interface MovementIntent {
  productId: string;
  entryType: LedgerEntryType;
  delta: number;
  override: boolean;
  reason: string | null;
  sourceType: LedgerSourceType;
  sourceId?: string | null;
  sourceRef?: string | null;
  orderLineId?: string | null;
}

/**
 * The one write path for stock: lock, derive the balance, plan, append.
 * Callers add their audit row in the same transaction.
 */
async function writeMovement(
  tx: TransactionHandle,
  context: AuthContext,
  scope: OutletScope,
  intent: MovementIntent,
): Promise<WrittenMovement> {
  const product = await lockScopedProduct(tx, scope, intent.productId);
  const handle = asDatabase(tx);
  const before = await stockOnHandInScope(handle, scope, product.id);

  const plan = planMovement(
    {
      before,
      delta: intent.delta,
      entryType: intent.entryType,
      override: intent.override,
      reason: intent.reason,
    },
    product,
  );

  const [entry] = await tx
    .insert(stockLedger)
    .values({
      businessId: scope.businessId,
      outletId: product.outletId,
      productId: product.id,
      entryType: plan.entryType,
      quantityBefore: plan.before,
      quantityAfter: plan.after,
      override: plan.override,
      reason: plan.reason,
      sourceType: intent.sourceType,
      sourceId: intent.sourceId ?? null,
      sourceRef: intent.sourceRef ?? null,
      orderLineId: intent.orderLineId ?? null,
      createdBy: context.user.id,
    })
    .returning(LEDGER_COLUMNS);

  if (!entry) throw new Error("Stock ledger insert returned no row");

  return {
    product,
    outletName: await outletNameOf(handle, scope.businessId, product.outletId),
    plan,
    entry,
  };
}

export async function listInventoryProducts(
  db: Database,
  context: AuthContext,
): Promise<InventoryProduct[]> {
  assertPermission(context, "manage_stock");
  const scope = scopeOf(context);

  const rows = await db
    .select({
      ...PRODUCT_STOCK_COLUMNS,
      outletName: outlets.name,
    })
    .from(products)
    .innerJoin(outlets, eq(outlets.id, products.outletId))
    .where(and(outletScoped(products, scope), isNull(products.deletedAt)))
    .orderBy(products.name);

  const stock = await stockByProduct(
    db,
    scope,
    rows.map((row) => row.id),
  );

  return rows.map((row) =>
    toInventoryProduct(row, row.outletName, stock.get(row.id) ?? 0),
  );
}

/** Active products at or below their threshold, most urgent shortfall first. */
export async function listLowStock(
  db: Database,
  context: AuthContext,
): Promise<LowStockResponse> {
  assertPermission(context, "manage_stock");
  const scope = scopeOf(context);

  const rows = await db
    .select(PRODUCT_STOCK_COLUMNS)
    .from(products)
    .where(
      and(
        outletScoped(products, scope),
        isNull(products.deletedAt),
        eq(products.isActive, true),
        isNotNull(products.lowStockThreshold),
      ),
    );

  const stock = await stockByProduct(
    db,
    scope,
    rows.map((row) => row.id),
  );

  const items: LowStockItem[] = [];
  for (const row of rows) {
    const stockOnHand = stock.get(row.id) ?? 0;
    const threshold = row.lowStockThreshold;
    if (threshold === null || !isLowStock(stockOnHand, threshold)) continue;
    items.push({
      productId: row.id,
      sku: row.sku,
      name: row.name,
      unit: row.unit,
      stockOnHand,
      lowStockThreshold: threshold,
      shortfall: lowStockShortfall(stockOnHand, threshold),
    });
  }

  items.sort(
    (left, right) =>
      right.shortfall - left.shortfall || left.name.localeCompare(right.name, "id"),
  );

  return { items };
}

export async function listLedger(
  db: Database,
  context: AuthContext,
  query: LedgerListQuery,
): Promise<LedgerListResponse> {
  assertPermission(context, "manage_stock");
  const scope = scopeOf(context);

  if (query.from && query.to && query.from > query.to) {
    throw AuthError.validation({
      from: ["Tanggal awal tidak boleh setelah tanggal akhir."],
    });
  }

  const conditions = [outletScoped(stockLedger, scope)];
  if (query.productId) conditions.push(eq(stockLedger.productId, query.productId));
  if (query.entryType) conditions.push(eq(stockLedger.entryType, query.entryType));
  if (query.from) {
    conditions.push(
      sql`${stockLedger.createdAt} >= (${query.from}::date)::timestamp AT TIME ZONE 'Asia/Jakarta'`,
    );
  }
  if (query.to) {
    conditions.push(
      sql`${stockLedger.createdAt} < ((${query.to}::date + interval '1 day')::timestamp AT TIME ZONE 'Asia/Jakarta')`,
    );
  }

  const where = and(...conditions);
  const offset = (query.page - 1) * query.pageSize;

  const [totalRow, rows] = await Promise.all([
    db.select({ value: count() }).from(stockLedger).where(where),
    db
      .select({
        ...LEDGER_COLUMNS,
        productSku: products.sku,
        productName: products.name,
        actorName: user.name,
      })
      .from(stockLedger)
      .innerJoin(products, eq(products.id, stockLedger.productId))
      .innerJoin(user, eq(user.id, stockLedger.createdBy))
      .where(where)
      .orderBy(desc(stockLedger.createdAt), desc(stockLedger.id))
      .limit(query.pageSize)
      .offset(offset),
  ]);

  const total = totalRow[0]?.value ?? 0;

  return {
    items: rows.map((row) =>
      toLedgerEntry(
        row,
        { sku: row.productSku, name: row.productName },
        row.actorName,
      ),
    ),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.ceil(total / query.pageSize),
  };
}

export async function recordStockIn(
  db: Database,
  context: AuthContext,
  input: StockInRequest,
): Promise<MovementResponse> {
  assertPermission(context, "manage_stock");
  const scope = scopeOf(context);
  await requireProductAccess(db, context, input.productId);

  const movement = await db.transaction(async (tx) => {
    const written = await writeMovement(tx, context, scope, {
      productId: input.productId,
      entryType: "STOCK_IN",
      delta: input.quantity,
      override: false,
      reason: input.note ?? null,
      sourceType: "STOCK_IN",
      sourceRef: input.reference ?? null,
    });

    await appendAuditEntry(asDatabase(tx), scope, {
      action: "inventory.stock_in",
      entityType: "stock_ledger",
      entityId: written.entry.id,
      actorId: context.user.id,
      outletId: written.product.outletId,
      reason: input.note ?? null,
      before: { stockOnHand: written.plan.before },
      after: {
        stockOnHand: written.plan.after,
        quantityDelta: written.plan.delta,
        reference: input.reference ?? null,
      },
    });

    return written;
  });

  return toMovementResponse(movement, context.user.name);
}

export async function recordAdjustment(
  db: Database,
  context: AuthContext,
  input: AdjustmentRequest,
): Promise<MovementResponse> {
  assertPermission(context, "manage_stock");
  if (input.override) {
    await requireOverridePermission(db, context, input.productId);
  }

  const scope = scopeOf(context);
  await requireProductAccess(db, context, input.productId);

  const movement = await db.transaction(async (tx) => {
    const written = await writeMovement(tx, context, scope, {
      productId: input.productId,
      entryType: "ADJUSTMENT",
      delta: input.quantityDelta,
      override: input.override,
      reason: input.reason,
      sourceType: "ADJUSTMENT",
      sourceRef: input.reference ?? null,
    });

    await appendAuditEntry(asDatabase(tx), scope, {
      action: "inventory.adjustment",
      entityType: "stock_ledger",
      entityId: written.entry.id,
      actorId: context.user.id,
      outletId: written.product.outletId,
      reason: input.reason,
      before: { stockOnHand: written.plan.before },
      after: {
        stockOnHand: written.plan.after,
        quantityDelta: written.plan.delta,
        override: written.plan.override,
        reference: input.reference ?? null,
      },
    });

    return written;
  });

  return toMovementResponse(movement, context.user.name);
}

export interface ApplyStockMovementInput {
  productId: string;
  /** The order line this movement settles; with the entry type it is the idempotency key. */
  orderLineId: string;
  /** The order the line belongs to. */
  sourceId: string;
  entryType: "SALE_DECREMENT" | "SALE_REVERSAL";
  /** Positive whole-unit magnitude; direction comes from `entryType`. */
  quantity: number;
  override?: boolean;
  reason?: string | null;
  /** Human-readable order/nota reference persisted on the ledger row (FR-058). */
  sourceRef?: string | null;
}

async function findOrderLineEntry(
  db: Database,
  scope: OutletScope,
  orderLineId: string,
  entryType: "SALE_DECREMENT" | "SALE_REVERSAL",
): Promise<LedgerRow | null> {
  const [row] = await db
    .select(LEDGER_COLUMNS)
    .from(stockLedger)
    .where(
      and(
        outletScoped(stockLedger, scope),
        eq(stockLedger.orderLineId, orderLineId),
        eq(stockLedger.entryType, entryType),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Same lookup inside the product-lock transaction: after waiting on the lock,
 * a concurrent request sees the winner's committed row and replays it instead
 * of planning against a balance the winner already consumed.
 */
async function findOrderLineEntryInTx(
  tx: TransactionHandle,
  scope: OutletScope,
  orderLineId: string,
  entryType: "SALE_DECREMENT" | "SALE_REVERSAL",
): Promise<LedgerRow | null> {
  const [row] = await tx
    .select(LEDGER_COLUMNS)
    .from(stockLedger)
    .where(
      and(
        outletScoped(stockLedger, scope),
        eq(stockLedger.orderLineId, orderLineId),
        eq(stockLedger.entryType, entryType),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function movementForExistingEntry(
  db: Database,
  scope: OutletScope,
  entry: LedgerRow,
  actorName: string,
): Promise<MovementResponse> {
  const [product] = await db
    .select(PRODUCT_STOCK_COLUMNS)
    .from(products)
    .where(
      and(
        eq(products.id, entry.productId),
        eq(products.businessId, scope.businessId),
        inArray(products.outletId, [...scope.outletIds]),
      ),
    )
    .limit(1);

  if (!product) throw AuthError.notFound("Produk tidak ditemukan.");

  const stockOnHand = await stockOnHandInScope(db, scope, product.id);
  return {
    entry: toLedgerEntry(entry, product, actorName),
    product: toInventoryProduct(
      product,
      await outletNameOf(db, scope.businessId, product.outletId),
      stockOnHand,
    ),
    stockOnHand,
  };
}

/**
 * Verifies the order line belongs to the caller's outlet, this business, the
 * named order, and the product being moved. A line outside the outlet scope is
 * audited and refused; an unknown line is 404.
 */
async function assertOrderLineForMovement(
  db: Database,
  context: AuthContext,
  input: ApplyStockMovementInput,
): Promise<void> {
  const activeScope = scopeOf(context);
  const [line] = await db
    .select({
      productId: orderLines.productId,
      quantity: orderLines.quantity,
      outletId: orders.outletId,
      productOutletId: products.outletId,
    })
    .from(orderLines)
    .innerJoin(orders, eq(orders.id, orderLines.orderId))
    .innerJoin(products, eq(products.id, orderLines.productId))
    .where(
      and(
        eq(orderLines.id, input.orderLineId),
        eq(orders.id, input.sourceId),
        eq(orders.businessId, context.user.businessId),
        inArray(orders.outletId, [...activeScope.outletIds]),
      ),
    )
    .limit(1);

  if (!line) {
    const [foreign] = await db
      .select({ outletId: orders.outletId })
      .from(orderLines)
      .innerJoin(orders, eq(orders.id, orderLines.orderId))
      .where(
        and(
          eq(orderLines.id, input.orderLineId),
          eq(orders.businessId, context.user.businessId),
        ),
      )
      .limit(1);

    if (foreign && !context.outletIds.includes(foreign.outletId)) {
      await auditDenial(db, context, {
        action: "create_sale",
        entityType: "order_line",
        entityId: input.orderLineId,
        outletId: foreign.outletId,
        crossOutlet: true,
      });
      throw AuthError.forbidden(CROSS_OUTLET_MESSAGE);
    }

    throw AuthError.notFound("Baris order tidak ditemukan pada outlet aktif.");
  }

  if (line.productId !== input.productId) {
    throw AuthError.validation({
      productId: ["Produk tidak cocok dengan baris order."],
    });
  }

  if (line.quantity !== input.quantity) {
    throw AuthError.validation({
      quantity: ["Jumlah pergerakan stok harus sama dengan jumlah pada baris order."],
    });
  }

  if (line.productOutletId !== line.outletId) {
    throw AuthError.conflict("Produk dan order berada di outlet yang berbeda.");
  }
}

/**
 * Applies a sale decrement or reversal for one order line (WP6 entry point).
 *
 * Idempotency is the unique ledger index on `(order_line_id, entry_type)`: a
 * replay returns the original row instead of decrementing twice, and a race
 * that loses the insert is answered from the committed row.
 */
export async function applyStockMovement(
  db: Database,
  context: AuthContext,
  input: ApplyStockMovementInput,
): Promise<MovementResponse> {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw AuthError.validation({
      quantity: ["Jumlah harus bilangan bulat positif."],
    });
  }

  const scope = scopeOf(context);
  const existing = await findOrderLineEntry(
    db,
    scope,
    input.orderLineId,
    input.entryType,
  );
  if (existing) {
    return movementForExistingEntry(db, scope, existing, context.user.name);
  }

  if (input.override) {
    await requireOverridePermission(db, context, input.productId);
  }
  await requireProductAccess(db, context, input.productId);
  await assertOrderLineForMovement(db, context, input);

  const delta =
    input.entryType === "SALE_DECREMENT" ? -input.quantity : input.quantity;

  try {
    const outcome = await db.transaction(async (tx) => {
      // Serialize against the same product before planning. A concurrent
      // request for the same order line waits here, then replays the winner's
      // row instead of failing on the now-consumed balance.
      await lockScopedProduct(tx, scope, input.productId);

      const existingInTx = await findOrderLineEntryInTx(
        tx,
        scope,
        input.orderLineId,
        input.entryType,
      );
      if (existingInTx) return { existing: existingInTx, written: null };

      if (input.entryType === "SALE_REVERSAL") {
        const decrement = await findOrderLineEntryInTx(
          tx,
          scope,
          input.orderLineId,
          "SALE_DECREMENT",
        );
        if (!decrement) {
          throw AuthError.conflict(
            "Baris order ini tidak pernah mengurangi stok, jadi tidak ada pembalikan yang boleh dicatat.",
          );
        }
        if (decrement.quantityBefore - decrement.quantityAfter !== input.quantity) {
          throw AuthError.validation({
            quantity: ["Jumlah pembalikan harus sama dengan jumlah stok yang dikurangi."],
          });
        }
      }

      const written = await writeMovement(tx, context, scope, {
        productId: input.productId,
        entryType: input.entryType,
        delta,
        override: input.override === true,
        reason: input.reason ?? null,
        sourceType: "ORDER",
        sourceId: input.sourceId,
        sourceRef: input.sourceRef ?? null,
        orderLineId: input.orderLineId,
      });

      await appendAuditEntry(asDatabase(tx), scope, {
        action:
          input.entryType === "SALE_DECREMENT"
            ? "inventory.sale_decrement"
            : "inventory.sale_reversal",
        entityType: "stock_ledger",
        entityId: written.entry.id,
        actorId: context.user.id,
        outletId: written.product.outletId,
        reason: input.reason ?? null,
        before: { stockOnHand: written.plan.before },
        after: {
          stockOnHand: written.plan.after,
          quantityDelta: written.plan.delta,
          orderId: input.sourceId,
          orderLineId: input.orderLineId,
          reference: input.sourceRef ?? null,
          override: written.plan.override,
        },
      });

      return { existing: null, written };
    });

    if (outcome.existing) {
      return movementForExistingEntry(db, scope, outcome.existing, context.user.name);
    }
    if (!outcome.written) throw new Error("Stock movement transaction returned no row");
    return toMovementResponse(outcome.written, context.user.name);
  } catch (error) {
    if (uniqueViolationConstraint(error) === "stock_ledger_order_line_entry_unique") {
      const replay = await findOrderLineEntry(
        db,
        scope,
        input.orderLineId,
        input.entryType,
      );
      if (replay) {
        return movementForExistingEntry(db, scope, replay, context.user.name);
      }
      throw AuthError.conflict(
        "Pergerakan stok untuk baris order ini sudah tercatat.",
      );
    }
    throw error;
  }
}
