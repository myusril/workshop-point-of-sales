import { and, asc, count, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";

import {
  assertPermission,
  assertOutletAccessAudited,
  AuthError,
  CROSS_OUTLET_MESSAGE,
  type AuthContext,
} from "@workshop-pos/auth";
import {
  type DailySalesReport,
  type EndOfDayReport,
  type OrderStatusCounts,
  type PaymentMixReport,
  type PaymentMixRow,
  type ReportRangeQuery,
  type SalesFigures,
  type ServiceProductReport,
  type StockValuationReport,
  type TechnicianProductivityReport,
} from "@workshop-pos/contracts";
import {
  jakartaDayEndExclusiveUtc,
  jakartaRangeUtc,
  listBusinessDates,
  todayBusinessDate,
} from "@workshop-pos/core";
import {
  orderLines,
  orders,
  outlets,
  payments,
  products,
  refunds,
  stockLedger,
  user,
  type Database,
} from "@workshop-pos/db";

import { allocateDiscount } from "./order-pricing";

/**
 * Report read models (PRD FR-060–FR-068).
 *
 * Every figure is recomputed from `orders`, `payments`, `refunds`,
 * `order_lines`, and `stock_ledger`; nothing is cached and no report row is
 * fabricated. Money stays `bigint` until it is serialized as a canonical
 * integer string.
 *
 * Day attribution (BR-010): an order or payment belongs to the Asia/Jakarta
 * calendar day of its payment. An order with no payment yet is counted in the
 * status counts on its creation day; paid figures always come from `paid_at`.
 */

type OutletSummary = { id: string; name: string };

const PAYMENT_METHOD_ORDER = ["CASH", "TRANSFER", "QRIS"] as const;
const REPORT_ENTITY = "report";

function money(value: bigint): string {
  if (value < 0n) {
    throw new Error("Report computed a negative non-negative money figure");
  }
  return value.toString();
}

function signedMoney(value: bigint): string {
  return value.toString();
}

function bigintOf(value: string | null | undefined): bigint {
  if (value === null || value === undefined || value.length === 0) return 0n;
  return BigInt(value);
}

function emptyStatusCounts(): OrderStatusCounts {
  return {
    DRAFT: 0,
    ESTIMATED: 0,
    APPROVED: 0,
    IN_PROGRESS: 0,
    COMPLETED: 0,
    PAID: 0,
    VOID: 0,
  };
}

function emptyFigures(): SalesFigures {
  return {
    orderCount: 0,
    grossSales: "0",
    discounts: "0",
    tax: "0",
    netSales: "0",
  };
}

function addFigures(target: SalesFigures, source: SalesFigures): void {
  target.orderCount += source.orderCount;
  target.grossSales = (bigintOf(target.grossSales) + bigintOf(source.grossSales)).toString();
  target.discounts = (bigintOf(target.discounts) + bigintOf(source.discounts)).toString();
  target.tax = (bigintOf(target.tax) + bigintOf(source.tax)).toString();
  target.netSales = (bigintOf(target.netSales) + bigintOf(source.netSales)).toString();
}

function addStatusCounts(target: OrderStatusCounts, source: OrderStatusCounts): void {
  for (const status of Object.keys(target) as (keyof OrderStatusCounts)[]) {
    target[status] += source[status];
  }
}

const businessInstantSql = sql`coalesce(${orders.paidAt}, ${orders.createdAt})`;
const businessDaySql = sql<string>`to_char((${businessInstantSql} at time zone 'Asia/Jakarta')::date, 'YYYY-MM-DD')`;

async function loadOutlet(
  db: Database,
  context: AuthContext,
  requestedOutletId: string | undefined,
  action: "view_reports" | "export_csv",
  entityId: string,
): Promise<OutletSummary> {
  assertPermission(context, action);

  const outletId =
    requestedOutletId ??
    (context.activeOutletId && context.outletIds.includes(context.activeOutletId)
      ? context.activeOutletId
      : context.outletIds.length === 1
        ? (context.outletIds[0] ?? null)
        : null);

  if (!outletId) {
    throw AuthError.validation({
      outletId: ["Pilih outlet terlebih dahulu untuk membuka laporan."],
    });
  }

  if (!context.outletIds.includes(outletId)) {
    await assertOutletAccessAudited(db, context, outletId, action, {
      entityType: REPORT_ENTITY,
      entityId,
    });
    throw AuthError.forbidden(CROSS_OUTLET_MESSAGE);
  }

  const [outlet] = await db
    .select({ id: outlets.id, name: outlets.name })
    .from(outlets)
    .where(
      and(eq(outlets.id, outletId), eq(outlets.businessId, context.user.businessId)),
    )
    .limit(1);
  if (!outlet) {
    throw AuthError.notFound("Outlet tidak ditemukan.");
  }
  return outlet;
}

async function paidFiguresByDay(
  db: Database,
  businessId: string,
  outletId: string,
  start: Date,
  endExclusive: Date,
): Promise<Map<string, SalesFigures>> {
  const rows = await db
    .select({
      day: businessDaySql,
      orderCount: count(),
      grossSales: sql<string>`coalesce(sum(${orders.subtotal}), 0)`,
      discounts: sql<string>`coalesce(sum(${orders.discountTotal}), 0)`,
      tax: sql<string>`coalesce(sum(${orders.taxTotal}), 0)`,
      netSales: sql<string>`coalesce(sum(${orders.total}), 0)`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.businessId, businessId),
        eq(orders.outletId, outletId),
        gte(orders.paidAt, start),
        lt(orders.paidAt, endExclusive),
        sql`${orders.status} <> 'VOID'`,
      ),
    )
    .groupBy(businessDaySql);

  const result = new Map<string, SalesFigures>();
  for (const row of rows) {
    result.set(row.day, {
      orderCount: Number(row.orderCount),
      grossSales: row.grossSales.toString(),
      discounts: row.discounts.toString(),
      tax: row.tax.toString(),
      netSales: row.netSales.toString(),
    });
  }
  return result;
}

async function statusCountsByDay(
  db: Database,
  businessId: string,
  outletId: string,
  start: Date,
  endExclusive: Date,
): Promise<Map<string, OrderStatusCounts>> {
  const rows = await db
    .select({
      day: businessDaySql,
      status: orders.status,
      total: count(),
    })
    .from(orders)
    .where(
      and(
        eq(orders.businessId, businessId),
        eq(orders.outletId, outletId),
        gte(sql`${businessInstantSql}`, start),
        lt(sql`${businessInstantSql}`, endExclusive),
      ),
    )
    .groupBy(businessDaySql, orders.status);

  const result = new Map<string, OrderStatusCounts>();
  for (const row of rows) {
    const counts = result.get(row.day) ?? emptyStatusCounts();
    counts[row.status] += Number(row.total);
    result.set(row.day, counts);
  }
  return result;
}

export async function getDailySalesReport(
  db: Database,
  context: AuthContext,
  query: ReportRangeQuery,
): Promise<DailySalesReport> {
  const outlet = await loadOutlet(db, context, query.outletId, "view_reports", query.from);
  const { start, endExclusive } = jakartaRangeUtc(query.from, query.to);

  const [figuresByDay, countsByDay] = await Promise.all([
    paidFiguresByDay(db, context.user.businessId, outlet.id, start, endExclusive),
    statusCountsByDay(db, context.user.businessId, outlet.id, start, endExclusive),
  ]);

  const totalsFigures = emptyFigures();
  const totalsCounts = emptyStatusCounts();

  const days = listBusinessDates(query.from, query.to).map((date) => {
    const figures = figuresByDay.get(date) ?? emptyFigures();
    const countsByStatus = countsByDay.get(date) ?? emptyStatusCounts();
    addFigures(totalsFigures, figures);
    addStatusCounts(totalsCounts, countsByStatus);
    return { date, countsByStatus, figures };
  });

  return {
    report: "daily-sales",
    outlet,
    from: query.from,
    to: query.to,
    generatedAt: new Date().toISOString(),
    days,
    totals: { countsByStatus: totalsCounts, figures: totalsFigures },
  };
}

export async function getPaymentMixReport(
  db: Database,
  context: AuthContext,
  query: ReportRangeQuery,
): Promise<PaymentMixReport> {
  const outlet = await loadOutlet(db, context, query.outletId, "view_reports", query.from);
  const { start, endExclusive } = jakartaRangeUtc(query.from, query.to);

  const [paymentRows, refundRows] = await Promise.all([
    db
      .select({
        method: payments.method,
        amount: sql<string>`coalesce(sum(${payments.amount}), 0)`,
        change: sql<string>`coalesce(sum(${payments.changeAmount}), 0)`,
      })
      .from(payments)
      .innerJoin(orders, eq(orders.id, payments.orderId))
      .where(
        and(
          eq(orders.businessId, context.user.businessId),
          eq(orders.outletId, outlet.id),
          gte(payments.receivedAt, start),
          lt(payments.receivedAt, endExclusive),
        ),
      )
      .groupBy(payments.method),
    db
      .select({
        method: refunds.method,
        amount: sql<string>`coalesce(sum(${refunds.amount}), 0)`,
      })
      .from(refunds)
      .innerJoin(orders, eq(orders.id, refunds.orderId))
      .where(
        and(
          eq(orders.businessId, context.user.businessId),
          eq(orders.outletId, outlet.id),
          gte(refunds.refundedAt, start),
          lt(refunds.refundedAt, endExclusive),
        ),
      )
      .groupBy(refunds.method),
  ]);

  const paymentByMethod = new Map(paymentRows.map((row) => [row.method, row]));
  const refundByMethod = new Map(refundRows.map((row) => [row.method, row]));

  const methods: PaymentMixRow[] = PAYMENT_METHOD_ORDER.map((method) => {
    const paid = bigintOf(paymentByMethod.get(method)?.amount);
    const refunded = bigintOf(refundByMethod.get(method)?.amount);
    return {
      method,
      payments: money(paid),
      refunds: money(refunded),
      net: signedMoney(paid - refunded),
      change: money(bigintOf(paymentByMethod.get(method)?.change)),
    };
  });

  const expectedCash = bigintOf(methods[0]?.net);
  const totalNet = methods.reduce((sum, row) => sum + bigintOf(row.net), 0n);
  const changeTotal = methods.reduce((sum, row) => sum + bigintOf(row.change), 0n);

  return {
    report: "payment-mix",
    outlet,
    from: query.from,
    to: query.to,
    generatedAt: new Date().toISOString(),
    methods,
    expectedCash: signedMoney(expectedCash),
    totalNet: signedMoney(totalNet),
    changeTotal: money(changeTotal),
  };
}

interface PaidLineRow {
  orderId: string;
  lineType: "PRODUCT" | "SERVICE";
  quantity: number;
  lineTotal: bigint;
  taxAmount: bigint;
  discountAmount: bigint;
  orderDiscountTotal: bigint;
  technicianId: string | null;
}

async function loadPaidOrderLines(
  db: Database,
  businessId: string,
  outletId: string,
  start: Date,
  endExclusive: Date,
): Promise<PaidLineRow[]> {
  return db
    .select({
      orderId: orderLines.orderId,
      lineType: orderLines.lineType,
      quantity: orderLines.quantity,
      lineTotal: orderLines.lineTotal,
      taxAmount: orderLines.taxAmount,
      discountAmount: orderLines.discountAmount,
      orderDiscountTotal: orders.discountTotal,
      technicianId: orderLines.technicianId,
    })
    .from(orderLines)
    .innerJoin(orders, eq(orders.id, orderLines.orderId))
    .where(
      and(
        eq(orders.businessId, businessId),
        eq(orders.outletId, outletId),
        gte(orders.paidAt, start),
        lt(orders.paidAt, endExclusive),
        sql`${orders.status} <> 'VOID'`,
      ),
    )
    .orderBy(asc(orders.paidAt), asc(orderLines.sortOrder), asc(orderLines.id));
}

interface AllocatedLine {
  line: PaidLineRow;
  netRevenue: bigint;
}

/**
 * Allocates each order-level discount across its lines, then returns the
 * after-discount, after-tax revenue per line. The shares sum to the order
 * total exactly, so {product + service} revenue reconciles with net sales.
 */
function allocateLineRevenue(rows: readonly PaidLineRow[]): AllocatedLine[] {
  const byOrder = new Map<string, PaidLineRow[]>();
  for (const row of rows) {
    const list = byOrder.get(row.orderId) ?? [];
    list.push(row);
    byOrder.set(row.orderId, list);
  }

  const result: AllocatedLine[] = [];
  for (const group of byOrder.values()) {
    const orderDiscountTotal =
      group[0]?.orderDiscountTotal ?? 0n;
    const lineDiscountTotal = group.reduce((sum, row) => sum + row.discountAmount, 0n);
    const orderDiscount = orderDiscountTotal - lineDiscountTotal;
    const weights = group.map((row) => row.lineTotal);

    if (orderDiscount < 0n) {
      throw new Error("Report found an order discount below its line discounts");
    }
    const shares =
      orderDiscount === 0n ? group.map(() => 0n) : allocateDiscount(orderDiscount, weights);

    group.forEach((row, index) => {
      const share = shares[index] ?? 0n;
      if (share > row.lineTotal) {
        throw new Error("Report found an order discount share above the line value");
      }
      result.push({
        line: row,
        netRevenue: row.lineTotal - share + row.taxAmount,
      });
    });
  }
  return result;
}

export async function getServiceProductReport(
  db: Database,
  context: AuthContext,
  query: ReportRangeQuery,
): Promise<ServiceProductReport> {
  const outlet = await loadOutlet(db, context, query.outletId, "view_reports", query.from);
  const { start, endExclusive } = jakartaRangeUtc(query.from, query.to);
  const rows = await loadPaidOrderLines(
    db,
    context.user.businessId,
    outlet.id,
    start,
    endExclusive,
  );
  const allocated = allocateLineRevenue(rows);

  const buckets = {
    PRODUCT: { lineCount: 0, quantity: 0, revenue: 0n },
    SERVICE: { lineCount: 0, quantity: 0, revenue: 0n },
  };
  let taxTotal = 0n;

  for (const { line, netRevenue } of allocated) {
    const bucket = buckets[line.lineType];
    bucket.lineCount += 1;
    bucket.quantity += line.quantity;
    bucket.revenue += netRevenue;
    taxTotal += line.taxAmount;
  }

  const orderDiscountTotal = new Map<string, bigint>();
  for (const row of rows) {
    orderDiscountTotal.set(row.orderId, row.orderDiscountTotal);
  }
  const discountTotal = [...orderDiscountTotal.values()].reduce((sum, value) => sum + value, 0n);
  const totalRevenue = buckets.PRODUCT.revenue + buckets.SERVICE.revenue;

  return {
    report: "service-product",
    outlet,
    from: query.from,
    to: query.to,
    generatedAt: new Date().toISOString(),
    product: {
      lineCount: buckets.PRODUCT.lineCount,
      quantity: buckets.PRODUCT.quantity,
      revenue: money(buckets.PRODUCT.revenue),
    },
    service: {
      lineCount: buckets.SERVICE.lineCount,
      quantity: buckets.SERVICE.quantity,
      revenue: money(buckets.SERVICE.revenue),
    },
    discountTotal: money(discountTotal),
    taxTotal: money(taxTotal),
    totalRevenue: money(totalRevenue),
  };
}

export async function getTechnicianProductivityReport(
  db: Database,
  context: AuthContext,
  query: ReportRangeQuery,
): Promise<TechnicianProductivityReport> {
  const outlet = await loadOutlet(db, context, query.outletId, "view_reports", query.from);
  const { start, endExclusive } = jakartaRangeUtc(query.from, query.to);

  const completedOrders = await db
    .select({
      id: orders.id,
      technicianId: orders.technicianId,
    })
    .from(orders)
    .where(
      and(
        eq(orders.businessId, context.user.businessId),
        eq(orders.outletId, outlet.id),
        gte(orders.completedAt, start),
        lt(orders.completedAt, endExclusive),
        inArray(orders.status, ["COMPLETED", "PAID"]),
      ),
    );

  const orderIds = completedOrders.map((order) => order.id);
  const orderTechnician = new Map(completedOrders.map((order) => [order.id, order.technicianId]));
  const rows = orderIds.length
    ? await loadPaidOrderLinesByIds(db, context.user.businessId, outlet.id, orderIds)
    : [];
  const allocated = allocateLineRevenue(rows);

  const perTechnician = new Map<
    string,
    { orders: Set<string>; lines: number; laborValue: bigint }
  >();
  const ensure = (id: string) => {
    const existing = perTechnician.get(id);
    if (existing) return existing;
    const created = { orders: new Set<string>(), lines: 0, laborValue: 0n };
    perTechnician.set(id, created);
    return created;
  };

  for (const [orderId, technicianId] of orderTechnician) {
    if (technicianId) ensure(technicianId).orders.add(orderId);
  }
  for (const { line, netRevenue } of allocated) {
    if (!line.technicianId) continue;
    const entry = ensure(line.technicianId);
    entry.orders.add(line.orderId);
    entry.lines += 1;
    if (line.lineType === "SERVICE") entry.laborValue += netRevenue;
  }

  const technicianIds = [...perTechnician.keys()];
  const names = new Map<string, string>();
  if (technicianIds.length > 0) {
    const users = await db
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(
        and(
          eq(user.businessId, context.user.businessId),
          inArray(user.id, technicianIds),
        ),
      );
    for (const row of users) names.set(row.id, row.name);
  }

  const technicians = [...perTechnician.entries()]
    .map(([technicianId, entry]) => ({
      technicianId,
      technicianName: names.get(technicianId) ?? "Teknisi tidak dikenal",
      completedOrders: entry.orders.size,
      completedLines: entry.lines,
      laborValue: money(entry.laborValue),
    }))
    .sort((left, right) => {
      const leftValue = bigintOf(left.laborValue);
      const rightValue = bigintOf(right.laborValue);
      if (leftValue !== rightValue) return rightValue > leftValue ? 1 : -1;
      return left.technicianName.localeCompare(right.technicianName, "id");
    });

  return {
    report: "technician-productivity",
    outlet,
    from: query.from,
    to: query.to,
    generatedAt: new Date().toISOString(),
    technicians,
  };
}

async function loadPaidOrderLinesByIds(
  db: Database,
  businessId: string,
  outletId: string,
  orderIds: readonly string[],
): Promise<PaidLineRow[]> {
  return db
    .select({
      orderId: orderLines.orderId,
      lineType: orderLines.lineType,
      quantity: orderLines.quantity,
      lineTotal: orderLines.lineTotal,
      taxAmount: orderLines.taxAmount,
      discountAmount: orderLines.discountAmount,
      orderDiscountTotal: orders.discountTotal,
      technicianId: orderLines.technicianId,
    })
    .from(orderLines)
    .innerJoin(orders, eq(orders.id, orderLines.orderId))
    .where(
      and(
        eq(orders.businessId, businessId),
        eq(orders.outletId, outletId),
        inArray(orders.id, [...orderIds]),
        sql`${orders.status} <> 'VOID'`,
      ),
    )
    .orderBy(asc(orderLines.sortOrder), asc(orderLines.id));
}

export async function getStockValuationReport(
  db: Database,
  context: AuthContext,
  query: { asOf?: string; outletId?: string },
): Promise<StockValuationReport> {
  const asOf = query.asOf ?? todayBusinessDate();
  const outlet = await loadOutlet(db, context, query.outletId, "view_reports", asOf);
  const endExclusive = jakartaDayEndExclusiveUtc(asOf);

  const [productRows, ledgerRows] = await Promise.all([
    db
      .select({
        id: products.id,
        sku: products.sku,
        name: products.name,
        cost: products.cost,
        isActive: products.isActive,
      })
      .from(products)
      .where(
        and(
          eq(products.businessId, context.user.businessId),
          eq(products.outletId, outlet.id),
          sql`${products.deletedAt} is null`,
        ),
      )
      .orderBy(asc(products.sku)),
    db
      .select({
        productId: stockLedger.productId,
        onHand: sql<string>`coalesce(sum(${stockLedger.quantityAfter} - ${stockLedger.quantityBefore}), 0)`,
      })
      .from(stockLedger)
      .where(
        and(
          eq(stockLedger.businessId, context.user.businessId),
          eq(stockLedger.outletId, outlet.id),
          lt(stockLedger.createdAt, endExclusive),
        ),
      )
      .groupBy(stockLedger.productId),
  ]);

  const onHandByProduct = new Map(
    ledgerRows.map((row) => [row.productId, bigintOf(row.onHand)]),
  );
  let totalValue = 0n;

  const items = productRows.map((product) => {
    const onHand = Number(onHandByProduct.get(product.id) ?? 0n);
    const value = BigInt(onHand) * product.cost;
    totalValue += value;
    return {
      productId: product.id,
      sku: product.sku,
      name: product.name,
      onHand,
      unitCost: money(product.cost),
      value: signedMoney(value),
    };
  });

  return {
    report: "stock-valuation",
    outlet,
    asOf,
    generatedAt: new Date().toISOString(),
    items,
    totalValue: signedMoney(totalValue),
  };
}

export async function getEndOfDayReport(
  db: Database,
  context: AuthContext,
  query: { date: string; outletId?: string },
): Promise<EndOfDayReport> {
  const outlet = await loadOutlet(db, context, query.outletId, "view_reports", query.date);
  const range = { from: query.date, to: query.date, outletId: outlet.id };
  const { start, endExclusive } = jakartaRangeUtc(query.date, query.date);

  const [daily, mix, voidRows] = await Promise.all([
    getDailySalesReport(db, context, range),
    getPaymentMixReport(db, context, range),
    db
      .select({
        orderId: orders.id,
        orderNumber: orders.orderNumber,
        voidedAt: orders.voidedAt,
        total: orders.total,
        reason: orders.voidReason,
      })
      .from(orders)
      .where(
        and(
          eq(orders.businessId, context.user.businessId),
          eq(orders.outletId, outlet.id),
          eq(orders.status, "VOID"),
          gte(orders.voidedAt, start),
          lt(orders.voidedAt, endExclusive),
        ),
      )
      .orderBy(desc(orders.voidedAt)),
  ]);

  const day = daily.days[0];
  if (!day) {
    throw new Error("End-of-day report produced no day row");
  }

  return {
    report: "end-of-day",
    outlet,
    date: query.date,
    generatedAt: new Date().toISOString(),
    countsByStatus: day.countsByStatus,
    figures: day.figures,
    paymentMix: {
      methods: mix.methods,
      expectedCash: mix.expectedCash,
      totalNet: mix.totalNet,
      changeTotal: mix.changeTotal,
    },
    voids: voidRows.map((row) => ({
      orderId: row.orderId,
      orderNumber: row.orderNumber,
      voidedAt: row.voidedAt ? row.voidedAt.toISOString() : null,
      total: money(row.total),
      reason: row.reason,
    })),
  };
}
