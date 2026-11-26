import { and, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";

import type {
  CatalogItem,
  CatalogListQuery,
  CatalogListResponse,
  CatalogSort,
  CreateProductRequest,
  CreateServiceRequest,
  ProductItem,
  ServiceItem,
  SortDirection,
  UpdateProductRequest,
  UpdateServiceRequest,
} from "@workshop-pos/contracts";
import {
  auditDenial,
  AuthError,
  can,
  CROSS_OUTLET_MESSAGE,
  uniqueViolationConstraint,
  type AuthContext,
} from "@workshop-pos/auth";
import { idrToString, isLowStock, parseIdr } from "@workshop-pos/core";
import {
  appendAuditEntry,
  outletScoped,
  outlets,
  products,
  services,
  stockLedger,
  type Database,
  type OutletScope,
} from "@workshop-pos/db";

/**
 * Catalog reads and writes (FR-010–FR-014).
 *
 * Every query is outlet-scoped from the session context; no route accepts an
 * outlet id from the client. Cost is serialized only for roles that may manage
 * the catalog (FR-014): the column is always read, the response field is
 * omitted.
 */

const PRODUCT_ROW_COLUMNS = {
  id: products.id,
  outletId: products.outletId,
  sku: products.sku,
  name: products.name,
  unit: products.unit,
  price: products.price,
  cost: products.cost,
  lowStockThreshold: products.lowStockThreshold,
  isActive: products.isActive,
  updatedAt: products.updatedAt,
} as const;

/** Joined read shape; `outlets.name` is only valid on SELECT, never RETURNING. */
const PRODUCT_COLUMNS = {
  ...PRODUCT_ROW_COLUMNS,
  outletName: outlets.name,
} as const;

const SERVICE_ROW_COLUMNS = {
  id: services.id,
  outletId: services.outletId,
  code: services.code,
  name: services.name,
  price: services.price,
  durationMinutes: services.durationMinutes,
  isActive: services.isActive,
  updatedAt: services.updatedAt,
} as const;

const SERVICE_COLUMNS = {
  ...SERVICE_ROW_COLUMNS,
  outletName: outlets.name,
} as const;

interface ProductRow {
  id: string;
  outletId: string;
  sku: string;
  name: string;
  unit: string;
  price: bigint;
  cost: bigint;
  lowStockThreshold: number | null;
  isActive: boolean;
  updatedAt: Date;
  outletName: string;
}

interface ServiceRow {
  id: string;
  outletId: string;
  code: string;
  name: string;
  price: bigint;
  durationMinutes: number;
  isActive: boolean;
  updatedAt: Date;
  outletName: string;
}

/** Drizzle's transaction handle is narrower than `Database` but has the same reads/writes. */
type TransactionHandle = Parameters<Parameters<Database["transaction"]>[0]>[0];

function asDatabase(tx: TransactionHandle): Database {
  return tx as unknown as Database;
}

/**
 * Reads the caller's active-outlet scope (FR-004/AC2.4). A multi-outlet user's
 * lists follow the selected outlet; assigned outlets remain available only for
 * cross-outlet denial auditing. An account with no assigned outlet cannot act.
 */
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

function outletIdForCreate(context: AuthContext): string {
  return scopeOf(context).outletIds[0] ?? "";
}

/**
 * The outlet display name for a write response. `RETURNING` cannot project a
 * joined `outlets.name`, so the name is read in the same transaction.
 */
async function outletNameById(
  db: Database,
  businessId: string,
  outletId: string,
): Promise<string> {
  const [row] = await db
    .select({ name: outlets.name })
    .from(outlets)
    .where(and(eq(outlets.id, outletId), eq(outlets.businessId, businessId)))
    .limit(1);
  if (!row) throw new Error("Outlet for catalog row not found");
  return row.name;
}

/** `%` and `_` are LIKE wildcards; a literal search term must not become one. */
function containsPattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

function toProductItem(
  row: ProductRow,
  stockOnHand: number,
  includeCost: boolean,
): ProductItem {
  return {
    itemType: "PRODUCT",
    id: row.id,
    outletId: row.outletId,
    outletName: row.outletName,
    sku: row.sku,
    name: row.name,
    unit: row.unit,
    price: idrToString(row.price),
    ...(includeCost ? { cost: idrToString(row.cost) } : {}),
    lowStockThreshold: row.lowStockThreshold,
    stockOnHand,
    isLowStock: isLowStock(stockOnHand, row.lowStockThreshold),
    isActive: row.isActive,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toServiceItem(row: ServiceRow): ServiceItem {
  return {
    itemType: "SERVICE",
    id: row.id,
    outletId: row.outletId,
    outletName: row.outletName,
    code: row.code,
    name: row.name,
    price: idrToString(row.price),
    durationMinutes: row.durationMinutes,
    isActive: row.isActive,
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function loadStockByProduct(
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

async function queryProductRows(
  db: Database,
  scope: OutletScope,
  query: CatalogListQuery,
): Promise<ProductRow[]> {
  const conditions = [outletScoped(products, scope), isNull(products.deletedAt)];

  if (query.status === "active") conditions.push(eq(products.isActive, true));
  if (query.status === "inactive") conditions.push(eq(products.isActive, false));

  const term = query.q?.trim();
  if (term) {
    const pattern = containsPattern(term);
    const match = or(ilike(products.name, pattern), ilike(products.sku, pattern));
    if (match) conditions.push(match);
  }

  return db
    .select(PRODUCT_COLUMNS)
    .from(products)
    .innerJoin(outlets, eq(outlets.id, products.outletId))
    .where(and(...conditions));
}

async function queryServiceRows(
  db: Database,
  scope: OutletScope,
  query: CatalogListQuery,
): Promise<ServiceRow[]> {
  const conditions = [outletScoped(services, scope), isNull(services.deletedAt)];

  if (query.status === "active") conditions.push(eq(services.isActive, true));
  if (query.status === "inactive") conditions.push(eq(services.isActive, false));

  const term = query.q?.trim();
  if (term) {
    const pattern = containsPattern(term);
    const match = or(ilike(services.name, pattern), ilike(services.code, pattern));
    if (match) conditions.push(match);
  }

  return db
    .select(SERVICE_COLUMNS)
    .from(services)
    .innerJoin(outlets, eq(outlets.id, services.outletId))
    .where(and(...conditions));
}

function sortValue(item: CatalogItem, sort: CatalogSort): string | number | bigint {
  switch (sort) {
    case "name":
      return item.name;
    case "sku":
      return item.itemType === "PRODUCT" ? item.sku : item.code;
    case "price":
      return BigInt(item.price);
    case "stock":
      return item.itemType === "PRODUCT" ? item.stockOnHand : 0;
    case "updatedAt":
      return item.updatedAt;
  }
}

function compareCatalogItems(
  left: CatalogItem,
  right: CatalogItem,
  sort: CatalogSort,
  direction: SortDirection,
): number {
  const leftValue = sortValue(left, sort);
  const rightValue = sortValue(right, sort);

  let comparison: number;
  if (typeof leftValue === "bigint" || typeof rightValue === "bigint") {
    const a = BigInt(leftValue);
    const b = BigInt(rightValue);
    comparison = a < b ? -1 : a > b ? 1 : 0;
  } else if (typeof leftValue === "number" || typeof rightValue === "number") {
    comparison = Number(leftValue) - Number(rightValue);
  } else {
    comparison = String(leftValue).localeCompare(String(rightValue), "id");
  }

  if (comparison === 0) comparison = left.id.localeCompare(right.id);
  return direction === "asc" ? comparison : -comparison;
}

/**
 * One merged, outlet-scoped catalog page for products and services.
 *
 * Both entity types are fetched scoped and merged in memory so a page can mix
 * them under the `all` filter and sort by derived stock. Catalog cardinality is
 * bounded by a workshop's SKU list, so this stays a single shallow pass.
 */
export async function listCatalog(
  db: Database,
  context: AuthContext,
  query: CatalogListQuery,
): Promise<CatalogListResponse> {
  const scope = scopeOf(context);
  const includeCost = can(context.user.role, "manage_catalog");

  const [productRows, serviceRows] = await Promise.all([
    query.type === "service" ? Promise.resolve([] as ProductRow[]) : queryProductRows(db, scope, query),
    query.type === "product" ? Promise.resolve([] as ServiceRow[]) : queryServiceRows(db, scope, query),
  ]);

  const stockByProduct = await loadStockByProduct(
    db,
    scope,
    productRows.map((row) => row.id),
  );

  const items: CatalogItem[] = [
    ...productRows.map((row) =>
      toProductItem(row, stockByProduct.get(row.id) ?? 0, includeCost),
    ),
    ...serviceRows.map(toServiceItem),
  ];

  items.sort((left, right) => compareCatalogItems(left, right, query.sort, query.dir));

  const total = items.length;
  const start = (query.page - 1) * query.pageSize;

  return {
    items: items.slice(start, start + query.pageSize),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.ceil(total / query.pageSize),
  };
}

async function findProductInBusiness(
  db: Database,
  businessId: string,
  productId: string,
): Promise<{ outletId: string } | null> {
  const [row] = await db
    .select({ outletId: products.outletId })
    .from(products)
    .where(
      and(
        eq(products.id, productId),
        eq(products.businessId, businessId),
        isNull(products.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function findServiceInBusiness(
  db: Database,
  businessId: string,
  serviceId: string,
): Promise<{ outletId: string } | null> {
  const [row] = await db
    .select({ outletId: services.outletId })
    .from(services)
    .where(
      and(
        eq(services.id, serviceId),
        eq(services.businessId, businessId),
        isNull(services.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * A row that exists in the business but outside the caller's outlets is a cross
 * -outlet attempt: it is audited and refused with 403. Anything else is 404.
 */
async function requireProductAccess(
  db: Database,
  context: AuthContext,
  productId: string,
): Promise<void> {
  const found = await findProductInBusiness(db, context.user.businessId, productId);
  if (!found) throw AuthError.notFound("Produk tidak ditemukan.");
  const activeOutletId = scopeOf(context).outletIds[0];
  if (found.outletId === activeOutletId) return;

  // Assigned to the caller but not the active context: it is not visible in
  // this screen, so answer as absent instead of implying a permission failure.
  if (context.outletIds.includes(found.outletId)) {
    throw AuthError.notFound("Produk tidak ditemukan pada outlet aktif.");
  }

  await auditDenial(db, context, {
    action: "manage_catalog",
    entityType: "product",
    entityId: productId,
    outletId: found.outletId,
    crossOutlet: true,
  });
  throw AuthError.forbidden(CROSS_OUTLET_MESSAGE);
}

async function requireServiceAccess(
  db: Database,
  context: AuthContext,
  serviceId: string,
): Promise<void> {
  const found = await findServiceInBusiness(db, context.user.businessId, serviceId);
  if (!found) throw AuthError.notFound("Layanan tidak ditemukan.");
  const activeOutletId = scopeOf(context).outletIds[0];
  if (found.outletId === activeOutletId) return;

  if (context.outletIds.includes(found.outletId)) {
    throw AuthError.notFound("Layanan tidak ditemukan pada outlet aktif.");
  }

  await auditDenial(db, context, {
    action: "manage_catalog",
    entityType: "service",
    entityId: serviceId,
    outletId: found.outletId,
    crossOutlet: true,
  });
  throw AuthError.forbidden(CROSS_OUTLET_MESSAGE);
}

export async function createProduct(
  db: Database,
  context: AuthContext,
  input: CreateProductRequest,
): Promise<ProductItem> {
  if (!can(context.user.role, "manage_catalog")) {
    throw AuthError.forbidden("Anda tidak memiliki izin untuk membuat produk.");
  }

  const scope = scopeOf(context);
  const outletId = outletIdForCreate(context);
  const price = parseIdr(input.price);
  const cost = parseIdr(input.cost);
  const openingStock = input.openingStock;

  try {
    const created = await db.transaction(async (tx) => {
      const [product] = await tx
        .insert(products)
        .values({
          businessId: scope.businessId,
          outletId,
          sku: input.sku,
          name: input.name,
          unit: input.unit,
          cost,
          price,
          lowStockThreshold: input.lowStockThreshold ?? null,
        })
        .returning(PRODUCT_ROW_COLUMNS);

      if (!product) throw new Error("Product insert returned no row");

      if (openingStock > 0) {
        // The opening balance is a ledger row, not a column: stock stays
        // derivable from the append-only ledger from the first unit.
        await tx.insert(stockLedger).values({
          businessId: scope.businessId,
          outletId,
          productId: product.id,
          entryType: "STOCK_IN",
          quantityBefore: 0,
          quantityAfter: openingStock,
          override: false,
          reason: input.openingStockNote ?? "Stok awal",
          sourceType: "STOCK_IN",
          createdBy: context.user.id,
        });
      }

      await appendAuditEntry(asDatabase(tx), scope, {
        action: "catalog.product.created",
        entityType: "product",
        entityId: product.id,
        actorId: context.user.id,
        outletId,
        after: {
          sku: product.sku,
          name: product.name,
          unit: product.unit,
          price: idrToString(product.price),
          cost: idrToString(product.cost),
          lowStockThreshold: product.lowStockThreshold,
          openingStock,
          isActive: product.isActive,
        },
      });

      return {
        product,
        outletName: await outletNameById(
          asDatabase(tx),
          scope.businessId,
          product.outletId,
        ),
      };
    });

    return toProductItem(
      { ...created.product, outletName: created.outletName },
      openingStock,
      true,
    );
  } catch (error) {
    if (uniqueViolationConstraint(error) === "products_outlet_id_sku_unique") {
      throw AuthError.conflict("SKU sudah digunakan di outlet ini.", {
        sku: ["SKU sudah digunakan di outlet ini."],
      });
    }
    throw error;
  }
}

export async function updateProduct(
  db: Database,
  context: AuthContext,
  productId: string,
  input: UpdateProductRequest,
): Promise<ProductItem> {
  if (!can(context.user.role, "manage_catalog")) {
    throw AuthError.forbidden("Anda tidak memiliki izin untuk mengubah produk.");
  }

  const scope = scopeOf(context);
  await requireProductAccess(db, context, productId);

  const nextPrice = input.price === undefined ? undefined : parseIdr(input.price);
  const nextCost = input.cost === undefined ? undefined : parseIdr(input.cost);

  const result = await db.transaction(async (tx) => {
    const [current] = await tx
      .select(PRODUCT_COLUMNS)
      .from(products)
      .innerJoin(outlets, eq(outlets.id, products.outletId))
      .where(
        and(
          eq(products.id, productId),
          outletScoped(products, scope),
          isNull(products.deletedAt),
        ),
      )
      .limit(1)
      .for("update", { of: products });

    if (!current) throw AuthError.notFound("Produk tidak ditemukan.");

    const name = input.name ?? current.name;
    const unit = input.unit ?? current.unit;
    const price = nextPrice ?? current.price;
    const cost = nextCost ?? current.cost;
    const lowStockThreshold =
      input.lowStockThreshold === undefined
        ? current.lowStockThreshold
        : input.lowStockThreshold;
    const isActive = input.isActive ?? current.isActive;

    const priceChanged = price !== current.price;
    const costChanged = cost !== current.cost;
    const activeChanged = isActive !== current.isActive;
    const detailsChanged =
      name !== current.name ||
      unit !== current.unit ||
      lowStockThreshold !== current.lowStockThreshold;

    if (!priceChanged && !costChanged && !activeChanged && !detailsChanged) {
      return { product: current, stockOnHand: await stockOnHandInTx(tx, scope, current.id) };
    }

    const [updated] = await tx
      .update(products)
      .set({ name, unit, price, cost, lowStockThreshold, isActive, updatedAt: new Date() })
      .where(and(eq(products.id, current.id), outletScoped(products, scope)))
      .returning(PRODUCT_ROW_COLUMNS);

    if (!updated) throw new Error("Product update returned no row");

    const audit = asDatabase(tx);
    const auditTarget = {
      entityType: "product",
      entityId: updated.id,
      actorId: context.user.id,
      outletId: updated.outletId,
    };

    if (costChanged) {
      await appendAuditEntry(audit, scope, {
        ...auditTarget,
        action: "catalog.product.cost_changed",
        before: { cost: idrToString(current.cost) },
        after: { cost: idrToString(updated.cost) },
      });
    }

    if (priceChanged) {
      await appendAuditEntry(audit, scope, {
        ...auditTarget,
        action: "catalog.product.price_changed",
        before: { price: idrToString(current.price) },
        after: { price: idrToString(updated.price) },
      });
    }

    if (detailsChanged) {
      await appendAuditEntry(audit, scope, {
        ...auditTarget,
        action: "catalog.product.updated",
        before: {
          name: current.name,
          unit: current.unit,
          lowStockThreshold: current.lowStockThreshold,
        },
        after: {
          name: updated.name,
          unit: updated.unit,
          lowStockThreshold: updated.lowStockThreshold,
        },
      });
    }

    if (activeChanged) {
      await appendAuditEntry(audit, scope, {
        ...auditTarget,
        action: updated.isActive
          ? "catalog.product.reactivated"
          : "catalog.product.deactivated",
        before: { isActive: current.isActive },
        after: { isActive: updated.isActive },
      });
    }

    return {
      product: { ...updated, outletName: current.outletName },
      stockOnHand: await stockOnHandInTx(tx, scope, updated.id),
    };
  });

  return toProductItem(result.product, result.stockOnHand, true);
}

export async function createService(
  db: Database,
  context: AuthContext,
  input: CreateServiceRequest,
): Promise<ServiceItem> {
  if (!can(context.user.role, "manage_catalog")) {
    throw AuthError.forbidden("Anda tidak memiliki izin untuk membuat layanan.");
  }

  const scope = scopeOf(context);
  const outletId = outletIdForCreate(context);

  try {
    const created = await db.transaction(async (tx) => {
      const [service] = await tx
        .insert(services)
        .values({
          businessId: scope.businessId,
          outletId,
          code: input.code,
          name: input.name,
          price: parseIdr(input.price),
          durationMinutes: input.durationMinutes,
        })
        .returning(SERVICE_ROW_COLUMNS);

      if (!service) throw new Error("Service insert returned no row");

      await appendAuditEntry(asDatabase(tx), scope, {
        action: "catalog.service.created",
        entityType: "service",
        entityId: service.id,
        actorId: context.user.id,
        outletId,
        after: {
          code: service.code,
          name: service.name,
          price: idrToString(service.price),
          durationMinutes: service.durationMinutes,
          isActive: service.isActive,
        },
      });

      return {
        service,
        outletName: await outletNameById(
          asDatabase(tx),
          scope.businessId,
          service.outletId,
        ),
      };
    });

    return toServiceItem({
      ...created.service,
      outletName: created.outletName,
    });
  } catch (error) {
    if (uniqueViolationConstraint(error) === "services_outlet_id_code_unique") {
      throw AuthError.conflict("Kode layanan sudah digunakan di outlet ini.", {
        code: ["Kode layanan sudah digunakan di outlet ini."],
      });
    }
    throw error;
  }
}

export async function updateService(
  db: Database,
  context: AuthContext,
  serviceId: string,
  input: UpdateServiceRequest,
): Promise<ServiceItem> {
  if (!can(context.user.role, "manage_catalog")) {
    throw AuthError.forbidden("Anda tidak memiliki izin untuk mengubah layanan.");
  }

  const scope = scopeOf(context);
  await requireServiceAccess(db, context, serviceId);

  const nextPrice = input.price === undefined ? undefined : parseIdr(input.price);

  const updated = await db.transaction(async (tx) => {
    const [current] = await tx
      .select(SERVICE_COLUMNS)
      .from(services)
      .innerJoin(outlets, eq(outlets.id, services.outletId))
      .where(
        and(
          eq(services.id, serviceId),
          outletScoped(services, scope),
          isNull(services.deletedAt),
        ),
      )
      .limit(1)
      .for("update", { of: services });

    if (!current) throw AuthError.notFound("Layanan tidak ditemukan.");

    const name = input.name ?? current.name;
    const price = nextPrice ?? current.price;
    const durationMinutes = input.durationMinutes ?? current.durationMinutes;
    const isActive = input.isActive ?? current.isActive;

    const priceChanged = price !== current.price;
    const activeChanged = isActive !== current.isActive;
    const detailsChanged =
      name !== current.name || durationMinutes !== current.durationMinutes;

    if (!priceChanged && !activeChanged && !detailsChanged) return current;

    const [row] = await tx
      .update(services)
      .set({ name, price, durationMinutes, isActive, updatedAt: new Date() })
      .where(and(eq(services.id, current.id), outletScoped(services, scope)))
      .returning(SERVICE_ROW_COLUMNS);

    if (!row) throw new Error("Service update returned no row");

    const audit = asDatabase(tx);
    const auditTarget = {
      entityType: "service",
      entityId: row.id,
      actorId: context.user.id,
      outletId: row.outletId,
    };

    if (priceChanged) {
      await appendAuditEntry(audit, scope, {
        ...auditTarget,
        action: "catalog.service.price_changed",
        before: { price: idrToString(current.price) },
        after: { price: idrToString(row.price) },
      });
    }

    if (detailsChanged) {
      await appendAuditEntry(audit, scope, {
        ...auditTarget,
        action: "catalog.service.updated",
        before: { name: current.name, durationMinutes: current.durationMinutes },
        after: { name: row.name, durationMinutes: row.durationMinutes },
      });
    }

    if (activeChanged) {
      await appendAuditEntry(audit, scope, {
        ...auditTarget,
        action: row.isActive
          ? "catalog.service.reactivated"
          : "catalog.service.deactivated",
        before: { isActive: current.isActive },
        after: { isActive: row.isActive },
      });
    }

    return { ...row, outletName: current.outletName };
  });

  return toServiceItem(updated);
}

async function stockOnHandInTx(
  tx: TransactionHandle,
  scope: OutletScope,
  productId: string,
): Promise<number> {
  const [row] = await tx
    .select({
      total: sql<string>`coalesce(sum(${stockLedger.quantityAfter} - ${stockLedger.quantityBefore}), 0)`,
    })
    .from(stockLedger)
    .where(
      and(outletScoped(stockLedger, scope), eq(stockLedger.productId, productId)),
    );
  return Number(row?.total ?? "0");
}
