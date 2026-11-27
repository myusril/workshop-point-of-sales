import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import type { ZodType } from "zod";

import type {
  OrderDetail,
  OrderListItem,
  OrderLine,
  OrderListQuery,
  OrderListResponse,
  OrderPayment,
  OrderResponse,
  OrderTechnicianListResponse,
  OrderTimelineEvent,
  RecordPaymentRequest,
  RecordPaymentResponse,
  UpdateOrderLineRequest,
  UpdateOrderRequest,
  CreateOrderRequest,
  TransitionOrderRequest,
  VoidOrderRequest,
  CorrectPaymentRequest,
  OrderTransitionTarget,
  SyncApplyRequest,
  SyncConflictDetail,
} from "@workshop-pos/contracts";
import {
  orderDetailSchema,
  orderResponseSchema,
  recordPaymentResponseSchema,
} from "@workshop-pos/contracts";
import {
  auditDenial,
  AuthError,
  can,
  CROSS_OUTLET_MESSAGE,
  denialMessage,
  uniqueViolationConstraint,
  type AuthContext,
  type RbacAction,
} from "@workshop-pos/auth";
import {
  assertCanAcceptPayment,
  assertCanVoid,
  assertTransition,
  canAcceptPayment,
  canRevertEstimate,
  canVoid,
  DEFAULT_TAX_RATE_PERCENT,
  formatIdr,
  idrToString,
  isHeaderEditable,
  isLineEditable,
  normalizeVoidReason,
  normalizePlate,
  OrderLifecycleError,
  parseIdr,
  requiresRevertApproval,
  sumIdr,
} from "@workshop-pos/core";
import {
  appendAuditEntry,
  auditLog,
  customers,
  idempotencyKeys,
  orderLines,
  orders,
  orderStatusEvents,
  outlets,
  outletScoped,
  payments,
  products,
  refunds,
  services,
  settings,
  staffOutlets,
  stockLedger,
  user,
  vehicles,
  type Database,
  type OutletScope,
} from "@workshop-pos/db";

import { applyStockMovement } from "@/app/api/v1/inventory/_lib/inventory-service";

import {
  orderCreateRequestHash,
  paymentRecordRequestHash,
} from "./order-idempotency";
import {
  isDiscountAboveCap,
  priceOrder,
  PricingError,
  type OrderPricing,
  type PricingLineInput,
} from "./order-pricing";
import { balanceDueOf } from "./vehicle-history";

/**
 * Order, payment, and void services (PRD FR-030–FR-039, FR-044–FR-049,
 * FR-051, FR-059; BR-003–BR-009, BR-011).
 *
 * Every figure written here is recomputed from line snapshots and the outlet's
 * tax rate; a client total is never trusted. Sensitive outcomes (discount
 * overrides, denials, estimate events, payment corrections, voids) go to the
 * append-only audit log, and the staff-visible timeline records each status
 * change. Stock settlement reuses WP4's `applyStockMovement`, whose unique
 * `(order_line_id, entry_type)` index makes a retried completion or void a
 * replay rather than a duplicate ledger row.
 */

type TransactionHandle = Parameters<Parameters<Database["transaction"]>[0]>[0];
type OrderRow = typeof orders.$inferSelect;
type LineRow = typeof orderLines.$inferSelect;
type PaymentRow = typeof payments.$inferSelect;
type SettingsRow = typeof settings.$inferSelect;

interface ResolvedLine {
  lineType: "PRODUCT" | "SERVICE";
  productId: string | null;
  serviceId: string | null;
  description: string;
  unitPrice: bigint;
  quantity: number;
  discountPercent: number | null;
  discountAmount: bigint;
  technicianId: string | null;
}

const DEFAULT_SETTINGS = {
  taxRate: DEFAULT_TAX_RATE_PERCENT,
  cashierDiscountCapPercent: 0,
  receiptPaperWidth: 58,
  voidReasonMinLength: 10,
  receiptPrefix: "",
  receiptHeaderText: null,
  receiptFooterText: null,
} as const;

function asDatabase(tx: TransactionHandle): Database {
  return tx as unknown as Database;
}

function scopeOf(context: AuthContext): OutletScope {
  if (context.outletIds.length === 0) {
    throw AuthError.forbidden(CROSS_OUTLET_MESSAGE);
  }
  return { businessId: context.user.businessId, outletIds: context.outletIds };
}

async function requireAction(
  db: Database,
  context: AuthContext,
  action: RbacAction,
  entityId: string,
  outletId: string | null = null,
): Promise<void> {
  if (can(context.user.role, action)) return;
  await auditDenial(db, context, {
    action,
    entityType: "order",
    entityId,
    outletId: outletId ?? context.activeOutletId,
  });
  throw AuthError.forbidden(denialMessage(action));
}

function parseMoney(value: string, field: string): bigint {
  try {
    return parseIdr(value);
  } catch {
    throw AuthError.validation({ [field]: ["Jumlah uang harus angka rupiah bulat."] });
  }
}

function pricingToAuthError(error: unknown): never {
  if (!(error instanceof PricingError)) throw error;
  switch (error.code) {
    case "EMPTY_ORDER":
      throw AuthError.validation({ lines: [error.message] });
    case "INVALID_QUANTITY":
    case "INVALID_UNIT_PRICE":
      throw AuthError.validation({ lines: [error.message] });
    case "ZERO_TOTAL":
      throw AuthError.validation({ discountPercent: [error.message] });
    case "INVALID_DISCOUNT":
    case "DISCOUNT_TOO_LARGE":
      throw AuthError.validation({ discountAmount: [error.message] });
  }
}

function lifecycleToAuthError(error: unknown): never {
  if (!(error instanceof OrderLifecycleError)) throw error;
  if (error.code === "REASON_REQUIRED") {
    throw AuthError.validation({ reason: [error.message] });
  }
  if (error.code === "ROLE_FORBIDDEN") {
    throw AuthError.forbidden(error.message);
  }
  throw AuthError.conflict(error.message);
}

async function readIdempotencyRow(
  db: Database,
  businessId: string,
  key: string,
): Promise<typeof idempotencyKeys.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(idempotencyKeys)
    .where(
      and(eq(idempotencyKeys.businessId, businessId), eq(idempotencyKeys.key, key)),
    )
    .limit(1);
  return row ?? null;
}

/**
 * A key already used with this exact request returns its original response; a
 * key reused with different content, or one still in flight, is a conflict.
 */
async function replayIdempotent<T>(
  db: Database,
  businessId: string,
  key: string,
  requestHash: string,
  schema: ZodType<T>,
): Promise<T> {
  const row = await readIdempotencyRow(db, businessId, key);
  if (!row) {
    throw AuthError.conflict(
      "Permintaan dengan kunci ini sedang diproses. Tunggu sebentar lalu coba lagi.",
    );
  }
  if (row.requestHash !== requestHash) {
    throw AuthError.conflict(
      "Kunci idempotensi sudah dipakai untuk permintaan yang berbeda.",
    );
  }
  if (!row.completedAt || row.responseBody === null) {
    throw AuthError.conflict(
      "Permintaan dengan kunci ini sedang diproses. Tunggu sebentar lalu coba lagi.",
    );
  }

  const parsed = schema.safeParse(row.responseBody);
  if (!parsed.success) {
    throw AuthError.internal("Respons idempotensi tersimpan tidak terbaca.");
  }
  return parsed.data;
}

async function claimIdempotency(
  tx: TransactionHandle,
  input: {
    businessId: string;
    key: string;
    operation: string;
    requestHash: string;
  },
) {
  const [row] = await tx
    .insert(idempotencyKeys)
    .values({
      businessId: input.businessId,
      key: input.key,
      operation: input.operation,
      requestHash: input.requestHash,
    })
    .returning();
  if (!row) throw AuthError.internal("Gagal mencatat kunci idempotensi.");
  return row;
}

function settingsFallback(row: SettingsRow | undefined) {
  return {
    taxRate: row?.taxRate ?? DEFAULT_SETTINGS.taxRate,
    cashierDiscountCapPercent:
      row?.cashierDiscountCapPercent ?? DEFAULT_SETTINGS.cashierDiscountCapPercent,
    receiptPaperWidth:
      row?.receiptPaperWidth === 80
        ? (80 as const)
        : (DEFAULT_SETTINGS.receiptPaperWidth as 58),
    voidReasonMinLength:
      row?.voidReasonMinLength ?? DEFAULT_SETTINGS.voidReasonMinLength,
    receiptPrefix: row?.receiptPrefix ?? DEFAULT_SETTINGS.receiptPrefix,
    receiptHeaderText: row?.receiptHeaderText ?? DEFAULT_SETTINGS.receiptHeaderText,
    receiptFooterText: row?.receiptFooterText ?? DEFAULT_SETTINGS.receiptFooterText,
  };
}

async function loadSettingsRow(
  db: Database,
  businessId: string,
  outletId: string,
): Promise<SettingsRow | undefined> {
  const [row] = await db
    .select()
    .from(settings)
    .where(and(eq(settings.businessId, businessId), eq(settings.outletId, outletId)))
    .limit(1);
  return row;
}

/**
 * Loads one order inside the caller's outlet scope. A row that exists for the
 * business but outside the scope is a cross-outlet denial recorded in the audit
 * log; a Mechanic may only open an order assigned to them (FR-045, AC6.3).
 */
async function loadScopedOrder(
  db: Database,
  context: AuthContext,
  orderId: string,
): Promise<OrderRow> {
  const scope = scopeOf(context);
  const [row] = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.id, orderId),
        eq(orders.businessId, scope.businessId),
        inArray(orders.outletId, [...scope.outletIds]),
      ),
    )
    .limit(1);

  if (!row) {
    const [foreign] = await db
      .select({ outletId: orders.outletId })
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.businessId, scope.businessId)))
      .limit(1);

    if (foreign) {
      await auditDenial(db, context, {
        action: "view_vehicle_history",
        entityType: "order",
        entityId: orderId,
        outletId: foreign.outletId,
        crossOutlet: true,
      });
      throw AuthError.forbidden(CROSS_OUTLET_MESSAGE);
    }
    throw AuthError.notFound("Transaksi tidak ditemukan.");
  }

  if (context.user.role === "MECHANIC" && row.technicianId !== context.user.id) {
    await auditDenial(db, context, {
      action: "manage_work",
      entityType: "order",
      entityId: orderId,
      outletId: row.outletId,
      reason: "mechanic is not assigned to this order",
    });
    throw AuthError.forbidden(
      "Mekanik hanya dapat membuka transaksi yang ditugaskan kepadanya.",
    );
  }

  return row;
}

async function lockOrder(
  tx: TransactionHandle,
  scope: OutletScope,
  orderId: string,
): Promise<OrderRow> {
  const [row] = await tx
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.id, orderId),
        eq(orders.businessId, scope.businessId),
        inArray(orders.outletId, [...scope.outletIds]),
      ),
    )
    .limit(1)
    .for("update");
  if (!row) throw AuthError.notFound("Transaksi tidak ditemukan.");
  return row;
}

async function resolveOutletId(
  db: Database,
  context: AuthContext,
  requested: string | undefined,
  entityId: string,
): Promise<string> {
  const candidate = (
    requested ??
    context.activeOutletId ??
    context.outletIds[0] ??
    ""
  ).trim();

  if (candidate.length === 0 || !context.outletIds.includes(candidate)) {
    await auditDenial(db, context, {
      action: "create_sale",
      entityType: "order",
      entityId,
      outletId: candidate.length > 0 ? candidate : context.activeOutletId,
      crossOutlet: true,
    });
    throw AuthError.forbidden(CROSS_OUTLET_MESSAGE);
  }
  return candidate;
}

async function requireTechnician(
  db: Database,
  businessId: string,
  technicianId: string,
  field: string,
): Promise<void> {
  const [row] = await db
    .select({ id: user.id })
    .from(user)
    .where(
      and(
        eq(user.id, technicianId),
        eq(user.businessId, businessId),
        eq(user.role, "MECHANIC"),
        isNull(user.deactivatedAt),
      ),
    )
    .limit(1);
  if (!row) {
    throw AuthError.validation({ [field]: ["Teknisi tidak ditemukan di bisnis ini."] });
  }
}

async function requireCustomer(
  db: Database,
  businessId: string,
  customerId: string,
): Promise<void> {
  const [row] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.businessId, businessId)))
    .limit(1);
  if (!row) {
    throw AuthError.validation({ customerId: ["Pelanggan tidak ditemukan."] });
  }
}

async function requireVehicle(
  db: Database,
  businessId: string,
  vehicleId: string,
): Promise<{ customerId: string }> {
  const [row] = await db
    .select({ id: vehicles.id, customerId: vehicles.customerId })
    .from(vehicles)
    .where(and(eq(vehicles.id, vehicleId), eq(vehicles.businessId, businessId)))
    .limit(1);
  if (!row) {
    throw AuthError.validation({ vehicleId: ["Kendaraan tidak ditemukan."] });
  }
  return { customerId: row.customerId };
}

async function resolveOrderLines(
  db: Database,
  businessId: string,
  outletId: string,
  lines: CreateOrderRequest["lines"],
  defaultTechnicianId: string | null,
): Promise<ResolvedLine[]> {
  const resolved: ResolvedLine[] = [];

  for (const [index, line] of lines.entries()) {
    const field = `lines.${index}.catalogItemId`;
    const discountPercent = line.discountPercent ?? null;
    const discountAmount = line.discountAmount
      ? parseMoney(line.discountAmount, `lines.${index}.discountAmount`)
      : 0n;
    const technicianId = line.technicianId ?? defaultTechnicianId;
    if (technicianId) {
      await requireTechnician(db, businessId, technicianId, `lines.${index}.technicianId`);
    }

    if (line.lineType === "PRODUCT") {
      const [product] = await db
        .select({
          id: products.id,
          name: products.name,
          price: products.price,
        })
        .from(products)
        .where(
          and(
            eq(products.id, line.catalogItemId),
            eq(products.businessId, businessId),
            eq(products.outletId, outletId),
            eq(products.isActive, true),
            isNull(products.deletedAt),
          ),
        )
        .limit(1);
      if (!product) {
        throw AuthError.validation({
          [field]: ["Produk tidak ditemukan atau tidak aktif di outlet ini."],
        });
      }
      resolved.push({
        lineType: "PRODUCT",
        productId: product.id,
        serviceId: null,
        description: product.name,
        unitPrice: product.price,
        quantity: line.quantity,
        discountPercent,
        discountAmount,
        technicianId,
      });
      continue;
    }

    const [service] = await db
      .select({
        id: services.id,
        name: services.name,
        price: services.price,
      })
      .from(services)
      .where(
        and(
          eq(services.id, line.catalogItemId),
          eq(services.businessId, businessId),
          eq(services.outletId, outletId),
          eq(services.isActive, true),
          isNull(services.deletedAt),
        ),
      )
      .limit(1);
    if (!service) {
      throw AuthError.validation({
        [field]: ["Jasa tidak ditemukan atau tidak aktif di outlet ini."],
      });
    }
    resolved.push({
      lineType: "SERVICE",
      productId: null,
      serviceId: service.id,
      description: service.name,
      unitPrice: service.price,
      quantity: line.quantity,
      discountPercent,
      discountAmount,
      technicianId,
    });
  }

  return resolved;
}

function pricingInputsFromLines(lines: readonly ResolvedLine[]): PricingLineInput[] {
  return lines.map((line) => ({
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    discountPercent: line.discountPercent,
    discountAmount: line.discountAmount,
  }));
}

function pricingInputsFromRows(lines: readonly LineRow[]): PricingLineInput[] {
  return lines.map((line) => ({
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    // A percent line stores its computed rupiah amount for display and for the
    // order-level derivation; feed only one shape back into the calculator.
    discountPercent: line.discountPercent,
    discountAmount: line.discountPercent === null ? line.discountAmount : null,
  }));
}

/**
 * Enforces the discount cap: a role without `override_discount` is denied and
 * the attempt is audited even though the order is never written; an authorised
 * override records the actor, reason, and amounts in the same transaction as
 * the order change.
 */
async function assertDiscountAllowed(
  db: Database,
  scope: OutletScope,
  context: AuthContext,
  input: {
    entityId: string;
    outletId: string;
    subtotal: bigint;
    discountTotal: bigint;
    capPercent: number;
    reason?: string | null;
  },
): Promise<string | null> {
  if (
    !isDiscountAboveCap(input.subtotal, input.discountTotal, input.capPercent)
  ) {
    return null;
  }

  const effectivePercent =
    input.subtotal > 0n ? Number((input.discountTotal * 100n) / input.subtotal) : 0;

  if (!can(context.user.role, "override_discount")) {
    await appendAuditEntry(db, scope, {
      action: "order.discount_denied",
      entityType: "order",
      entityId: input.entityId,
      actorId: context.user.id,
      outletId: input.outletId,
      reason: "discount above the cashier cap",
      after: {
        subtotal: idrToString(input.subtotal),
        discountTotal: idrToString(input.discountTotal),
        capPercent: input.capPercent,
      },
    });
    throw AuthError.forbidden(
      `Diskon ${effectivePercent}% melebihi batas kasir ${input.capPercent}%. Minta persetujuan Admin atau Pemilik.`,
    );
  }

  const reason = input.reason?.trim() ?? "";
  if (reason.length < 3) {
    throw AuthError.validation({
      discountReason: ["Alasan diskon wajib diisi minimal 3 karakter untuk persetujuan."],
    });
  }

  return reason;
}

function writeDiscountAudit(
  tx: TransactionHandle,
  scope: OutletScope,
  context: AuthContext,
  input: {
    orderId: string;
    outletId: string;
    reason: string;
    subtotal: bigint;
    discountTotal: bigint;
    capPercent: number;
  },
): Promise<unknown> {
  return appendAuditEntry(asDatabase(tx), scope, {
    action: "order.discount_override",
    entityType: "order",
    entityId: input.orderId,
    actorId: context.user.id,
    outletId: input.outletId,
    reason: input.reason,
    after: {
      subtotal: idrToString(input.subtotal),
      discountTotal: idrToString(input.discountTotal),
      capPercent: input.capPercent,
    },
  });
}

async function assertTotalCoversPayments(
  tx: TransactionHandle,
  orderId: string,
  total: bigint,
): Promise<void> {
  const rows = await tx
    .select({ amount: payments.amount })
    .from(payments)
    .where(eq(payments.orderId, orderId));
  const paidTotal = sumIdr(rows.map((row) => row.amount));
  if (total < paidTotal) {
    throw AuthError.conflict(
      "Total transaksi tidak boleh lebih kecil dari pembayaran yang sudah tercatat. Koreksi atau hapus pembayaran terlebih dahulu.",
    );
  }
}

async function nextOrderNumber(
  tx: TransactionHandle,
  outletId: string,
  kind: "SALE" | "SERVICE",
  prefix: string,
): Promise<string> {
  // Numbering must be gap-free per outlet even under two concurrent counters:
  // the advisory lock serializes the read-count-insert sequence.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${outletId}::text, 0))`);

  const [row] = await tx
    .select({ value: count() })
    .from(orders)
    .where(eq(orders.outletId, outletId));

  const sequence = Number(row?.value ?? 0) + 1;
  const year = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
  }).format(new Date());
  const code = kind === "SERVICE" ? "SRV" : "INV";
  const base = `${code}/${year}/${String(sequence).padStart(6, "0")}`;
  const trimmedPrefix = prefix.trim();
  return trimmedPrefix.length > 0 ? `${trimmedPrefix}/${base}` : base;
}

function toLineContract(
  row: LineRow,
  technicianName: string | null,
): OrderLine {
  return {
    id: row.id,
    lineType: row.lineType,
    productId: row.productId,
    serviceId: row.serviceId,
    description: row.description,
    quantity: row.quantity,
    unitPrice: idrToString(row.unitPrice),
    discountPercent: row.discountPercent,
    discountAmount: idrToString(row.discountAmount),
    taxAmount: idrToString(row.taxAmount),
    lineTotal: idrToString(row.lineTotal),
    technicianId: row.technicianId,
    technicianName,
  };
}

function toPaymentContract(row: PaymentRow, createdByName: string): OrderPayment {
  return {
    id: row.id,
    method: row.method,
    amount: idrToString(row.amount),
    changeAmount: idrToString(row.changeAmount),
    referenceNote: row.referenceNote,
    receivedAt: row.receivedAt.toISOString(),
    createdByName,
  };
}

async function loadPrintCount(
  db: Database,
  businessId: string,
  orderId: string,
  documentKind: "RECEIPT" | "ESTIMATE",
): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.businessId, businessId),
        eq(auditLog.action, "receipt.printed"),
        eq(auditLog.entityType, "order"),
        eq(auditLog.entityId, orderId),
        sql`${auditLog.after}->>'documentKind' = ${documentKind}`,
      ),
    );
  return Number(row?.value ?? 0);
}

/** Receiver-side helper for the receipt service's estimate documents. */
export async function countDocumentPrints(
  db: Database,
  businessId: string,
  orderId: string,
  documentKind: "RECEIPT" | "ESTIMATE",
): Promise<number> {
  return loadPrintCount(db, businessId, orderId, documentKind);
}

async function buildOrderDetail(
  db: Database,
  context: AuthContext,
  orderId: string,
): Promise<OrderDetail> {
  const scope = scopeOf(context);
  const order = await loadScopedOrder(db, context, orderId);

  const [outletRow] = await db
    .select({ name: outlets.name })
    .from(outlets)
    .where(eq(outlets.id, order.outletId))
    .limit(1);

  const [creatorRow] = await db
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, order.createdBy))
    .limit(1);

  const customerRow = order.customerId
    ? (
        await db
          .select({ id: customers.id, name: customers.name })
          .from(customers)
          .where(eq(customers.id, order.customerId))
          .limit(1)
      )[0]
    : undefined;

  const vehicleRow = order.vehicleId
    ? (
        await db
          .select({
            id: vehicles.id,
            plate: vehicles.normalizedPlate,
            brand: vehicles.brand,
            model: vehicles.model,
          })
          .from(vehicles)
          .where(eq(vehicles.id, order.vehicleId))
          .limit(1)
      )[0]
    : undefined;

  const technicianRow = order.technicianId
    ? (
        await db
          .select({ id: user.id, name: user.name })
          .from(user)
          .where(eq(user.id, order.technicianId))
          .limit(1)
      )[0]
    : undefined;

  const lineRows = await db
    .select({ line: orderLines, technicianName: user.name })
    .from(orderLines)
    .leftJoin(user, eq(user.id, orderLines.technicianId))
    .where(eq(orderLines.orderId, order.id))
    .orderBy(asc(orderLines.sortOrder), asc(orderLines.createdAt));

  const paymentRows = await db
    .select({ payment: payments, createdByName: user.name })
    .from(payments)
    .leftJoin(user, eq(user.id, payments.createdBy))
    .where(eq(payments.orderId, order.id))
    .orderBy(asc(payments.receivedAt), asc(payments.id));

  const refundRows = await db
    .select()
    .from(refunds)
    .where(eq(refunds.orderId, order.id))
    .orderBy(asc(refunds.refundedAt), asc(refunds.id));

  const eventRows = await db
    .select({ event: orderStatusEvents, actorName: user.name })
    .from(orderStatusEvents)
    .leftJoin(user, eq(user.id, orderStatusEvents.actorId))
    .where(eq(orderStatusEvents.orderId, order.id))
    .orderBy(
      asc(orderStatusEvents.createdAt),
      sql`${orderStatusEvents.fromStatus} asc nulls first`,
      asc(orderStatusEvents.id),
    );

  const settingsRow = await loadSettingsRow(db, scope.businessId, order.outletId);
  const operational = settingsFallback(settingsRow);
  const printCount = await loadPrintCount(db, scope.businessId, order.id, "RECEIPT");

  const paymentList = paymentRows.map((row) =>
    toPaymentContract(row.payment, row.createdByName ?? "—"),
  );
  const paidTotal = sumIdr(paymentRows.map((row) => row.payment.amount));
  const changeTotal = sumIdr(paymentRows.map((row) => row.payment.changeAmount));
  const remaining = balanceDueOf(order.total, paidTotal);
  const balanceDue = order.status === "VOID" ? 0n : remaining;
  const receiptAvailable =
    order.status === "PAID" || (order.status === "VOID" && paymentRows.length > 0);

  const lineDiscountTotal = sumIdr(lineRows.map((row) => row.line.discountAmount));
  const orderDiscountAmount = order.discountTotal - lineDiscountTotal;

  const permissions = {
    canEditLines:
      isLineEditable(order.status) &&
      can(
        context.user.role,
        order.kind === "SALE" ? "create_sale" : "service_intake",
      ),
    canEditHeader:
      isHeaderEditable(order.status) &&
      can(
        context.user.role,
        order.kind === "SALE" ? "create_sale" : "service_intake",
      ),
    canIssueEstimate:
      order.status === "DRAFT" && can(context.user.role, "manage_estimates"),
    canApprove:
      order.status === "ESTIMATED" && can(context.user.role, "manage_estimates"),
    canRevertEstimate:
      order.status === "ESTIMATED" && canRevertEstimate(context.user.role),
    canStartWork:
      order.status === "APPROVED" && can(context.user.role, "manage_work"),
    canComplete:
      order.status === "IN_PROGRESS" && can(context.user.role, "manage_work"),
    canRecordPayment:
      canAcceptPayment(order.status, order.kind) &&
      can(context.user.role, "record_payment"),
    canCorrectPayment:
      order.status !== "PAID" &&
      order.status !== "VOID" &&
      paymentRows.length > 0 &&
      (context.user.role === "OWNER" || context.user.role === "ADMIN"),
    canVoid: canVoid(order.status, context.user.role),
    canPrintReceipt: receiptAvailable,
    canPrintEstimate:
      lineRows.length > 0
        ? order.status === "DRAFT" ||
          order.status === "ESTIMATED" ||
          order.status === "APPROVED" ||
          order.status === "IN_PROGRESS"
        : false,
  };

  const detail: OrderDetail = {
    id: order.id,
    orderNumber: order.orderNumber,
    kind: order.kind,
    status: order.status,
    outletId: order.outletId,
    outletName: outletRow?.name ?? "—",
    createdByName: creatorRow?.name ?? "—",
    customer: customerRow ?? null,
    vehicle: vehicleRow ?? null,
    technician: technicianRow ?? null,
    odometer: order.odometer,
    notes: order.notes,
    taxRate: order.taxRate,
    subtotal: idrToString(order.subtotal),
    discountTotal: idrToString(order.discountTotal),
    discountPercent: null,
    discountAmount: idrToString(orderDiscountAmount),
    taxTotal: idrToString(order.taxTotal),
    total: idrToString(order.total),
    paidTotal: idrToString(paidTotal),
    balanceDue: idrToString(balanceDue),
    changeTotal: idrToString(changeTotal),
    voidReason: order.voidReason,
    voidedAt: order.voidedAt?.toISOString() ?? null,
    completedAt: order.completedAt?.toISOString() ?? null,
    paidAt: order.paidAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    lines: lineRows.map((row) => toLineContract(row.line, row.technicianName)),
    payments: paymentList,
    refunds: refundRows.map((row) => ({
      id: row.id,
      method: row.method,
      amount: idrToString(row.amount),
      reason: row.reason,
      refundedAt: row.refundedAt.toISOString(),
    })),
    timeline: eventRows.map(
      (row): OrderTimelineEvent => ({
        id: row.event.id,
        fromStatus: row.event.fromStatus,
        toStatus: row.event.toStatus,
        actorName: row.actorName ?? "—",
        reason: row.event.reason,
        createdAt: row.event.createdAt.toISOString(),
      }),
    ),
    permissions,
    settings: {
      paperWidth: operational.receiptPaperWidth,
      taxRate: operational.taxRate,
      cashierDiscountCapPercent: operational.cashierDiscountCapPercent,
      voidReasonMinLength: operational.voidReasonMinLength,
    },
    receiptAvailable,
    printCount,
  };

  return orderDetailSchema.parse(detail);
}

export async function getOrderDetail(
  db: Database,
  context: AuthContext,
  orderId: string,
): Promise<OrderResponse> {
  return { item: await buildOrderDetail(db, context, orderId) };
}

async function insertStatusEvent(
  tx: TransactionHandle,
  orderId: string,
  fromStatus: OrderRow["status"] | null,
  toStatus: OrderRow["status"],
  actorId: string,
  reason: string | null,
  scope: OutletScope,
): Promise<void> {
  const [order] = await tx
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.id, orderId),
        eq(orders.businessId, scope.businessId),
        inArray(orders.outletId, [...scope.outletIds]),
      ),
    )
    .limit(1);
  if (!order) throw AuthError.notFound("Transaksi tidak ditemukan.");

  const [actor] = await tx
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.id, actorId), eq(user.businessId, scope.businessId)))
    .limit(1);
  if (!actor) throw AuthError.internal("Aktor status tidak ditemukan.");

  await tx.insert(orderStatusEvents).values({
    orderId: order.id,
    fromStatus,
    toStatus,
    actorId: actor.id,
    reason,
  });
}

/**
 * Decrements every product line exactly once (BR-005/FR-051). WP4's helper owns
 * the product lock and the unique ledger index; it is called with the caller's
 * transaction so a failure on a later line rolls the whole settlement back
 * (the helper's own `transaction` nests as a savepoint).
 */
async function settleOrderStock(
  db: Database,
  context: AuthContext,
  order: OrderRow,
  lines: readonly LineRow[],
  options: {
    override?: boolean | ((line: LineRow) => boolean);
    reason?: string | null;
  } = {},
): Promise<void> {
  // WP4's helper resolves the product against the caller's first active
  // outlet; the order's own outlet is already proven in scope, so narrow the
  // context to exactly that outlet for the ledger write.
  const outletContext: AuthContext = {
    ...context,
    activeOutletId: order.outletId,
    outletIds: [order.outletId],
  };
  for (const line of lines) {
    if (line.lineType !== "PRODUCT" || line.productId === null) continue;
    const override =
      typeof options.override === "function"
        ? options.override(line)
        : options.override === true;
    await applyStockMovement(db, outletContext, {
      productId: line.productId,
      orderLineId: line.id,
      sourceId: order.id,
      entryType: "SALE_DECREMENT",
      quantity: line.quantity,
      override,
      reason: override ? (options.reason ?? null) : null,
      sourceRef: order.orderNumber ?? order.id,
    });
  }
}

/**
 * Reverses exactly the decrements that exist for this order's lines. Lines that
 * never decremented stock produce no reversal row (FR-059).
 */
async function reverseOrderStock(
  db: Database,
  context: AuthContext,
  order: OrderRow,
): Promise<number> {
  const scope = scopeOf(context);
  const outletContext: AuthContext = {
    ...context,
    activeOutletId: order.outletId,
    outletIds: [order.outletId],
  };
  const decrements = await db
    .select({
      orderLineId: stockLedger.orderLineId,
      quantityBefore: stockLedger.quantityBefore,
      quantityAfter: stockLedger.quantityAfter,
    })
    .from(stockLedger)
    .where(
      and(
        outletScoped(stockLedger, scope),
        eq(stockLedger.sourceId, order.id),
        eq(stockLedger.entryType, "SALE_DECREMENT"),
      ),
    );

  let reversed = 0;
  for (const decrement of decrements) {
    if (decrement.orderLineId === null) continue;
    const quantity = decrement.quantityBefore - decrement.quantityAfter;
    if (quantity <= 0) continue;

    const [line] = await db
      .select({ productId: orderLines.productId })
      .from(orderLines)
      .where(eq(orderLines.id, decrement.orderLineId))
      .limit(1);
    if (!line?.productId) continue;

    await applyStockMovement(db, outletContext, {
      productId: line.productId,
      orderLineId: decrement.orderLineId,
      sourceId: order.id,
      entryType: "SALE_REVERSAL",
      quantity,
      reason: order.voidReason,
      sourceRef: order.orderNumber ?? order.id,
    });
    reversed += 1;
  }
  return reversed;
}

export async function createOrder(
  db: Database,
  context: AuthContext,
  input: CreateOrderRequest,
): Promise<OrderResponse> {
  const action: RbacAction =
    input.kind === "SALE" ? "create_sale" : "service_intake";
  await requireAction(db, context, action, input.idempotencyKey);

  const outletId = await resolveOutletId(db, context, input.outletId, input.idempotencyKey);
  const scope: OutletScope = { businessId: context.user.businessId, outletIds: [outletId] };
  const requestHash = orderCreateRequestHash(context.user.id, input);
  const hasServiceLine = input.lines.some((line) => line.lineType === "SERVICE");

  if (hasServiceLine && !input.vehicleId) {
    throw AuthError.validation({
      vehicleId: ["Baris jasa memerlukan kendaraan."],
    });
  }

  const technicianId =
    input.technicianId?.trim() ??
    (context.user.role === "MECHANIC" ? context.user.id : null);
  if (technicianId) {
    await requireTechnician(db, context.user.businessId, technicianId, "technicianId");
  }

  const resolvedVehicleId = input.vehicleId ?? null;
  let resolvedCustomerId = input.customerId ?? null;
  if (resolvedVehicleId) {
    const vehicle = await requireVehicle(db, context.user.businessId, resolvedVehicleId);
    resolvedCustomerId = resolvedCustomerId ?? vehicle.customerId;
  }
  if (resolvedCustomerId) {
    await requireCustomer(db, context.user.businessId, resolvedCustomerId);
  }

  try {
    return await db.transaction(async (tx) => {
      const claim = await claimIdempotency(tx, {
        businessId: context.user.businessId,
        key: input.idempotencyKey,
        operation: "order.create",
        requestHash,
      });

      const settingsRow = await loadSettingsRow(asDatabase(tx), scope.businessId, outletId);
      const operational = settingsFallback(settingsRow);

      const resolvedLines = await resolveOrderLines(
        asDatabase(tx),
        scope.businessId,
        outletId,
        input.lines,
        technicianId,
      );

      const orderDiscountAmount = input.discountAmount
        ? parseMoney(input.discountAmount, "discountAmount")
        : null;

      let pricing: OrderPricing;
      try {
        pricing = priceOrder({
          lines: pricingInputsFromLines(resolvedLines),
          taxRatePercent: operational.taxRate,
          orderDiscountPercent: input.discountPercent ?? null,
          orderDiscountAmount,
        });
      } catch (error) {
        pricingToAuthError(error);
      }

      const overrideReason = await assertDiscountAllowed(
        db,
        scope,
        context,
        {
          entityId: input.idempotencyKey,
          outletId,
          subtotal: pricing.subtotal,
          discountTotal: pricing.discountTotal,
          capPercent: operational.cashierDiscountCapPercent,
          reason: input.discountReason ?? null,
        },
      );

      const orderNumber = await nextOrderNumber(
        tx,
        outletId,
        input.kind,
        operational.receiptPrefix,
      );

      const [order] = await tx
        .insert(orders)
        .values({
          businessId: scope.businessId,
          outletId,
          kind: input.kind,
          status: "DRAFT",
          customerId: resolvedCustomerId,
          vehicleId: resolvedVehicleId,
          technicianId,
          odometer: input.odometer ?? null,
          orderNumber,
          taxRate: operational.taxRate,
          subtotal: pricing.subtotal,
          discountTotal: pricing.discountTotal,
          taxTotal: pricing.taxTotal,
          total: pricing.total,
          notes: input.notes?.trim() ? input.notes.trim() : null,
          createdBy: context.user.id,
        })
        .returning();
      if (!order) throw AuthError.internal("Transaksi gagal disimpan.");

      await tx.insert(orderLines).values(
        resolvedLines.map((line, index) => ({
          orderId: order.id,
          lineType: line.lineType,
          productId: line.productId,
          serviceId: line.serviceId,
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discountPercent: line.discountPercent,
          discountAmount: pricing.lines[index]?.discountAmount ?? 0n,
          taxAmount: pricing.lines[index]?.taxAmount ?? 0n,
          lineTotal: pricing.lines[index]?.lineTotal ?? 0n,
          technicianId: line.technicianId,
          sortOrder: index,
        })),
      );

      await insertStatusEvent(tx, order.id, null, "DRAFT", context.user.id, null, scope);

      if (overrideReason !== null) {
        await writeDiscountAudit(tx, scope, context, {
          orderId: order.id,
          outletId,
          reason: overrideReason,
          subtotal: pricing.subtotal,
          discountTotal: pricing.discountTotal,
          capPercent: operational.cashierDiscountCapPercent,
        });
      }

      const detail = await buildOrderDetail(asDatabase(tx), context, order.id);
      const response: OrderResponse = { item: detail };

      await tx
        .update(idempotencyKeys)
        .set({
          orderId: order.id,
          responseStatus: 201,
          responseBody: response,
          completedAt: new Date(),
        })
        .where(eq(idempotencyKeys.id, claim.id));

      return response;
    });
  } catch (error) {
    if (
      uniqueViolationConstraint(error) === "idempotency_keys_business_id_key_unique"
    ) {
      return replayIdempotent(
        db,
        context.user.businessId,
        input.idempotencyKey,
        requestHash,
        orderResponseSchema,
      );
    }
    throw error;
  }
}

export async function updateOrderHeader(
  db: Database,
  context: AuthContext,
  orderId: string,
  input: UpdateOrderRequest,
): Promise<OrderResponse> {
  const existing = await loadScopedOrder(db, context, orderId);
  const action: RbacAction =
    existing.kind === "SALE" ? "create_sale" : "service_intake";
  await requireAction(db, context, action, orderId, existing.outletId);

  if (!isHeaderEditable(existing.status)) {
    throw AuthError.conflict(
      `Transaksi berstatus ${existing.status} tidak dapat diubah.`,
    );
  }

  const scope = scopeOf(context);

  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, scope, orderId);
    if (!isHeaderEditable(order.status)) {
      throw AuthError.conflict(`Transaksi berstatus ${order.status} tidak dapat diubah.`);
    }

    const lines = await tx
      .select()
      .from(orderLines)
      .where(eq(orderLines.orderId, order.id))
      .orderBy(asc(orderLines.sortOrder));

    let customerId = order.customerId;
    let vehicleId = order.vehicleId;

    if (input.vehicleId !== undefined) {
      if (input.vehicleId === null) {
        vehicleId = null;
      } else {
        const vehicle = await requireVehicle(db, scope.businessId, input.vehicleId);
        vehicleId = input.vehicleId;
        if (input.customerId === undefined) customerId = vehicle.customerId;
      }
    }
    if (input.customerId !== undefined) {
      if (input.customerId !== null) {
        await requireCustomer(db, scope.businessId, input.customerId);
      }
      customerId = input.customerId;
    }

    const hasServiceLine = lines.some((line) => line.lineType === "SERVICE");
    if (hasServiceLine && vehicleId === null) {
      throw AuthError.validation({ vehicleId: ["Baris jasa memerlukan kendaraan."] });
    }

    const technicianId =
      input.technicianId === undefined
        ? order.technicianId
        : input.technicianId?.trim() ?? null;
    if (technicianId) {
      await requireTechnician(db, scope.businessId, technicianId, "technicianId");
    }

    const lineDiscountTotal = sumIdr(lines.map((line) => line.discountAmount));
    const existingOrderDiscount = order.discountTotal - lineDiscountTotal;

    // `null` on either discount shape clears the order-level discount; an
    // omitted field keeps whatever the order already had.
    let orderDiscountPercent: number | null = null;
    let orderDiscountAmount: bigint | null = existingOrderDiscount;
    if (input.discountPercent !== undefined) {
      orderDiscountPercent = input.discountPercent;
      orderDiscountAmount = null;
    } else if (input.discountAmount !== undefined) {
      orderDiscountAmount =
        input.discountAmount === null ? 0n : parseMoney(input.discountAmount, "discountAmount");
    }

    let pricing: OrderPricing;
    try {
      pricing = priceOrder({
        lines: pricingInputsFromRows(lines),
        taxRatePercent: order.taxRate,
        orderDiscountPercent,
        orderDiscountAmount,
      });
    } catch (error) {
      pricingToAuthError(error);
    }

    const settingsRow = await loadSettingsRow(db, scope.businessId, order.outletId);
    const operational = settingsFallback(settingsRow);

    const discountRequested =
      input.discountPercent !== undefined || input.discountAmount !== undefined;
    const discountChanged =
      discountRequested && pricing.orderDiscountTotal !== existingOrderDiscount;
    const overrideReason = discountChanged
      ? await assertDiscountAllowed(db, scope, context, {
          entityId: order.id,
          outletId: order.outletId,
          subtotal: pricing.subtotal,
          discountTotal: pricing.discountTotal,
          capPercent: operational.cashierDiscountCapPercent,
          reason: input.discountReason ?? null,
        })
      : null;

    await assertTotalCoversPayments(tx, order.id, pricing.total);

    await tx
      .update(orders)
      .set({
        customerId,
        vehicleId,
        technicianId,
        odometer: input.odometer === undefined ? order.odometer : input.odometer,
        notes:
          input.notes === undefined
            ? order.notes
            : input.notes?.trim()
              ? input.notes.trim()
              : null,
        subtotal: pricing.subtotal,
        discountTotal: pricing.discountTotal,
        taxTotal: pricing.taxTotal,
        total: pricing.total,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id));

    await writeLineTaxes(tx, order.id, lines, pricing);

    if (overrideReason !== null) {
      await writeDiscountAudit(tx, scope, context, {
        orderId: order.id,
        outletId: order.outletId,
        reason: overrideReason,
        subtotal: pricing.subtotal,
        discountTotal: pricing.discountTotal,
        capPercent: operational.cashierDiscountCapPercent,
      });
    }

    return { item: await buildOrderDetail(asDatabase(tx), context, order.id) };
  });
}

async function writeLineTaxes(
  tx: TransactionHandle,
  orderId: string,
  lines: readonly LineRow[],
  pricing: OrderPricing,
): Promise<void> {
  for (const [index, line] of lines.entries()) {
    const priced = pricing.lines[index];
    if (!priced) continue;
    await tx
      .update(orderLines)
      .set({ taxAmount: priced.taxAmount, lineTotal: priced.lineTotal })
      .where(and(eq(orderLines.id, line.id), eq(orderLines.orderId, orderId)));
  }
}

export async function addOrderLine(
  db: Database,
  context: AuthContext,
  orderId: string,
  input: CreateOrderRequest["lines"][number],
): Promise<OrderResponse> {
  const existing = await loadScopedOrder(db, context, orderId);
  const action: RbacAction =
    existing.kind === "SALE" ? "create_sale" : "service_intake";
  await requireAction(db, context, action, orderId, existing.outletId);

  const scope = scopeOf(context);

  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, scope, orderId);
    if (!isLineEditable(order.status)) {
      throw AuthError.conflict(
        `Baris tidak dapat diubah saat transaksi berstatus ${order.status}.`,
      );
    }

    const lines = await tx
      .select()
      .from(orderLines)
      .where(eq(orderLines.orderId, order.id))
      .orderBy(asc(orderLines.sortOrder));

    const [resolved] = await resolveOrderLines(
      asDatabase(tx),
      scope.businessId,
      order.outletId,
      [input],
      order.technicianId,
    );
    if (!resolved) throw AuthError.validation({ lines: ["Baris tidak valid."] });

    if (resolved.lineType === "SERVICE" && order.vehicleId === null) {
      throw AuthError.validation({ vehicleId: ["Baris jasa memerlukan kendaraan."] });
    }

    const lineDiscountTotal = sumIdr(lines.map((line) => line.discountAmount));
    const orderDiscount = order.discountTotal - lineDiscountTotal;

    let pricing: OrderPricing;
    try {
      pricing = priceOrder({
        lines: [
          ...pricingInputsFromRows(lines),
          ...pricingInputsFromLines([resolved]),
        ],
        taxRatePercent: order.taxRate,
        orderDiscountAmount: orderDiscount,
      });
    } catch (error) {
      pricingToAuthError(error);
    }

    const settingsRow = await loadSettingsRow(db, scope.businessId, order.outletId);
    const operational = settingsFallback(settingsRow);
    const overrideReason = await assertDiscountAllowed(db, scope, context, {
      entityId: order.id,
      outletId: order.outletId,
      subtotal: pricing.subtotal,
      discountTotal: pricing.discountTotal,
      capPercent: operational.cashierDiscountCapPercent,
      reason: input.discountReason ?? null,
    });

    await assertTotalCoversPayments(tx, order.id, pricing.total);

    const sortOrder = lines.length;
    const [inserted] = await tx
      .insert(orderLines)
      .values({
        orderId: order.id,
        lineType: resolved.lineType,
        productId: resolved.productId,
        serviceId: resolved.serviceId,
        description: resolved.description,
        quantity: resolved.quantity,
        unitPrice: resolved.unitPrice,
        discountPercent: resolved.discountPercent,
        discountAmount: pricing.lines[sortOrder]?.discountAmount ?? 0n,
        taxAmount: pricing.lines[sortOrder]?.taxAmount ?? 0n,
        lineTotal: pricing.lines[sortOrder]?.lineTotal ?? 0n,
        technicianId: resolved.technicianId,
        sortOrder,
      })
      .returning();
    if (!inserted) throw AuthError.internal("Baris transaksi gagal disimpan.");

    await tx
      .update(orders)
      .set({
        subtotal: pricing.subtotal,
        discountTotal: pricing.discountTotal,
        taxTotal: pricing.taxTotal,
        total: pricing.total,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id));

    await writeLineTaxes(tx, order.id, lines, pricing);

    if (overrideReason !== null) {
      await writeDiscountAudit(tx, scope, context, {
        orderId: order.id,
        outletId: order.outletId,
        reason: overrideReason,
        subtotal: pricing.subtotal,
        discountTotal: pricing.discountTotal,
        capPercent: operational.cashierDiscountCapPercent,
      });
    }

    return { item: await buildOrderDetail(asDatabase(tx), context, order.id) };
  });
}

export async function updateOrderLine(
  db: Database,
  context: AuthContext,
  orderId: string,
  lineId: string,
  input: UpdateOrderLineRequest,
): Promise<OrderResponse> {
  const existing = await loadScopedOrder(db, context, orderId);
  const action: RbacAction =
    existing.kind === "SALE" ? "create_sale" : "service_intake";
  await requireAction(db, context, action, orderId, existing.outletId);

  const scope = scopeOf(context);

  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, scope, orderId);
    if (!isLineEditable(order.status)) {
      throw AuthError.conflict(
        `Baris tidak dapat diubah saat transaksi berstatus ${order.status}.`,
      );
    }

    const lines = await tx
      .select()
      .from(orderLines)
      .where(eq(orderLines.orderId, order.id))
      .orderBy(asc(orderLines.sortOrder));

    const targetIndex = lines.findIndex((line) => line.id === lineId);
    const target = lines[targetIndex];
    if (!target) throw AuthError.notFound("Baris transaksi tidak ditemukan.");

    const technicianId =
      input.technicianId === undefined
        ? target.technicianId
        : input.technicianId?.trim() ?? null;
    if (technicianId) {
      await requireTechnician(db, scope.businessId, technicianId, "technicianId");
    }

    const discountPercent =
      input.discountPercent === undefined
        ? input.discountAmount === undefined
          ? target.discountPercent
          : null
        : input.discountPercent;
    const discountAmount =
      input.discountAmount !== undefined
        ? input.discountAmount === null
          ? 0n
          : parseMoney(input.discountAmount, "discountAmount")
        : input.discountPercent !== undefined
          ? 0n
          : target.discountAmount;

    const nextQuantity = input.quantity ?? target.quantity;
    const updatedLines = lines.map((line, index) =>
      index === targetIndex
        ? { ...line, quantity: nextQuantity, discountPercent, discountAmount, technicianId }
        : line,
    );

    const lineDiscountTotal = sumIdr(lines.map((line) => line.discountAmount));
    const existingOrderDiscount = order.discountTotal - lineDiscountTotal;

    let pricing: OrderPricing;
    try {
      pricing = priceOrder({
        lines: pricingInputsFromRows(updatedLines),
        taxRatePercent: order.taxRate,
        orderDiscountAmount: existingOrderDiscount,
      });
    } catch (error) {
      pricingToAuthError(error);
    }

    const settingsRow = await loadSettingsRow(db, scope.businessId, order.outletId);
    const operational = settingsFallback(settingsRow);
    const overrideReason = await assertDiscountAllowed(db, scope, context, {
      entityId: order.id,
      outletId: order.outletId,
      subtotal: pricing.subtotal,
      discountTotal: pricing.discountTotal,
      capPercent: operational.cashierDiscountCapPercent,
      reason: input.discountReason ?? null,
    });

    await assertTotalCoversPayments(tx, order.id, pricing.total);

    await tx
      .update(orderLines)
      .set({
        quantity: nextQuantity,
        discountPercent,
        discountAmount: pricing.lines[targetIndex]?.discountAmount ?? 0n,
        taxAmount: pricing.lines[targetIndex]?.taxAmount ?? 0n,
        lineTotal: pricing.lines[targetIndex]?.lineTotal ?? 0n,
        technicianId,
      })
      .where(and(eq(orderLines.id, target.id), eq(orderLines.orderId, order.id)));

    await tx
      .update(orders)
      .set({
        subtotal: pricing.subtotal,
        discountTotal: pricing.discountTotal,
        taxTotal: pricing.taxTotal,
        total: pricing.total,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id));

    await writeLineTaxes(tx, order.id, updatedLines, pricing);

    if (overrideReason !== null) {
      await writeDiscountAudit(tx, scope, context, {
        orderId: order.id,
        outletId: order.outletId,
        reason: overrideReason,
        subtotal: pricing.subtotal,
        discountTotal: pricing.discountTotal,
        capPercent: operational.cashierDiscountCapPercent,
      });
    }

    return { item: await buildOrderDetail(asDatabase(tx), context, order.id) };
  });
}

export async function removeOrderLine(
  db: Database,
  context: AuthContext,
  orderId: string,
  lineId: string,
): Promise<OrderResponse> {
  const existing = await loadScopedOrder(db, context, orderId);
  const action: RbacAction =
    existing.kind === "SALE" ? "create_sale" : "service_intake";
  await requireAction(db, context, action, orderId, existing.outletId);

  const scope = scopeOf(context);

  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, scope, orderId);
    if (!isLineEditable(order.status)) {
      throw AuthError.conflict(
        `Baris tidak dapat diubah saat transaksi berstatus ${order.status}.`,
      );
    }

    const lines = await tx
      .select()
      .from(orderLines)
      .where(eq(orderLines.orderId, order.id))
      .orderBy(asc(orderLines.sortOrder));

    const target = lines.find((line) => line.id === lineId);
    if (!target) throw AuthError.notFound("Baris transaksi tidak ditemukan.");
    if (lines.length <= 1) {
      throw AuthError.validation({ lines: ["Tambahkan minimal satu item."] });
    }

    await tx
      .delete(orderLines)
      .where(and(eq(orderLines.id, target.id), eq(orderLines.orderId, order.id)));

    const remaining = lines.filter((line) => line.id !== target.id);
    const existingOrderDiscount =
      order.discountTotal - sumIdr(lines.map((line) => line.discountAmount));

    let pricing: OrderPricing;
    try {
      pricing = priceOrder({
        lines: pricingInputsFromRows(remaining),
        taxRatePercent: order.taxRate,
        orderDiscountAmount: existingOrderDiscount,
      });
    } catch (error) {
      pricingToAuthError(error);
    }

    await assertTotalCoversPayments(tx, order.id, pricing.total);

    await tx
      .update(orders)
      .set({
        subtotal: pricing.subtotal,
        discountTotal: pricing.discountTotal,
        taxTotal: pricing.taxTotal,
        total: pricing.total,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id));

    await writeLineTaxes(tx, order.id, remaining, pricing);

    return { item: await buildOrderDetail(asDatabase(tx), context, order.id) };
  });
}

export async function transitionOrder(
  db: Database,
  context: AuthContext,
  orderId: string,
  input: TransitionOrderRequest,
): Promise<OrderResponse> {
  const existing = await loadScopedOrder(db, context, orderId);
  const scope = scopeOf(context);
  const target = input.to;

  const requiredAction: Record<OrderTransitionTarget, RbacAction | null> = {
    ESTIMATED: "manage_estimates",
    APPROVED: "manage_estimates",
    DRAFT: "manage_estimates",
    IN_PROGRESS: "manage_work",
    COMPLETED: "manage_work",
  };

  if (requiresRevertApproval(existing.status, target)) {
    if (!canRevertEstimate(context.user.role)) {
      await auditDenial(db, context, {
        action: "manage_estimates",
        entityType: "order",
        entityId: orderId,
        outletId: existing.outletId,
        reason: "estimate revert requires Admin or Owner",
      });
      throw AuthError.forbidden(
        "Hanya Admin atau Pemilik yang dapat mengembalikan estimasi ke draf.",
      );
    }
    if ((input.reason?.trim().length ?? 0) < 3) {
      throw AuthError.validation({
        reason: ["Alasan pengembalian ke draf wajib diisi minimal 3 karakter."],
      });
    }
  } else {
    const action = requiredAction[target];
    if (action) {
      await requireAction(db, context, action, orderId, existing.outletId);
    }
  }

  try {
    assertTransition(existing.status, target);
  } catch (error) {
    lifecycleToAuthError(error);
  }

  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, scope, orderId);
    if (order.status !== existing.status) {
      throw AuthError.conflict(
        "Status transaksi berubah oleh pengguna lain. Muat ulang lalu coba lagi.",
      );
    }
    try {
      assertTransition(order.status, target);
    } catch (error) {
      lifecycleToAuthError(error);
    }

    if (target === "COMPLETED") {
      const lines = await tx
        .select()
        .from(orderLines)
        .where(eq(orderLines.orderId, order.id))
        .orderBy(asc(orderLines.sortOrder), asc(orderLines.id));
      await settleOrderStock(asDatabase(tx), context, order, lines);
    }

    const now = new Date();
    await tx
      .update(orders)
      .set({
        status: target,
        completedAt: target === "COMPLETED" ? now : order.completedAt,
        updatedAt: now,
      })
      .where(eq(orders.id, order.id));

    const reason = input.reason?.trim() ? input.reason.trim() : null;
    await insertStatusEvent(tx, order.id, order.status, target, context.user.id, reason, scope);

    if (target === "ESTIMATED") {
      await appendAuditEntry(asDatabase(tx), scope, {
        action: "order.estimate_issued",
        entityType: "order",
        entityId: order.id,
        actorId: context.user.id,
        outletId: order.outletId,
        before: { status: order.status },
        after: { status: target },
      });
    }
    if (target === "APPROVED") {
      await appendAuditEntry(asDatabase(tx), scope, {
        action: "order.estimate_approved",
        entityType: "order",
        entityId: order.id,
        actorId: context.user.id,
        outletId: order.outletId,
        before: { status: order.status },
        after: { status: target },
      });
    }
    if (target === "DRAFT" && order.status === "ESTIMATED") {
      await appendAuditEntry(asDatabase(tx), scope, {
        action: "order.estimate_reverted",
        entityType: "order",
        entityId: order.id,
        actorId: context.user.id,
        outletId: order.outletId,
        reason,
        before: { status: order.status },
        after: { status: target },
      });
    }

    return { item: await buildOrderDetail(asDatabase(tx), context, order.id) };
  });
}

interface SettlementPlan {
  /** Amount applied to the balance: never more than what was still owed. */
  applied: bigint;
  /** Cash returned to the customer; zero for non-cash rows. */
  change: bigint;
  settles: boolean;
}

/**
 * BR-009 / AC7.4: a cash tender above the balance stores the *applied* amount
 * and records the difference as change, so `sum(payments) = total` when settled
 * and a whole-order refund reverses exactly the money retained. Printing shows
 * the tendered amount again (`applied + change`).
 */
function planPayment(
  total: bigint,
  paidTotal: bigint,
  tendered: bigint,
  method: "CASH" | "TRANSFER" | "QRIS",
): SettlementPlan {
  const balance = balanceDueOf(total, paidTotal);
  if (method !== "CASH" && tendered > balance) {
    throw AuthError.validation({
      amount: [
        `${method === "TRANSFER" ? "Transfer" : "QRIS"} tidak boleh melebihi sisa tagihan ${formatIdr(balance)}.`,
      ],
    });
  }
  const applied = tendered > balance ? balance : tendered;
  if (applied === 0n) {
    throw AuthError.conflict("Tidak ada sisa tagihan pada transaksi ini.");
  }
  const change = tendered - applied;
  return { applied, change, settles: paidTotal + applied >= total };
}

function requireReference(
  method: "CASH" | "TRANSFER" | "QRIS",
  referenceNote: string | null,
): string | null {
  const reference = referenceNote?.trim() ?? "";
  if (method === "CASH") return reference.length > 0 ? reference : null;
  if (reference.length === 0) {
    throw AuthError.validation({
      referenceNote: ["Referensi wajib diisi untuk pembayaran non-tunai."],
    });
  }
  return reference;
}

export async function listTechnicians(
  db: Database,
  context: AuthContext,
): Promise<OrderTechnicianListResponse> {
  const rows = await db
    .selectDistinct({ id: user.id, name: user.name })
    .from(user)
    .innerJoin(staffOutlets, eq(staffOutlets.userId, user.id))
    .where(
      and(
        eq(user.businessId, context.user.businessId),
        eq(user.role, "MECHANIC"),
        isNull(user.deactivatedAt),
        inArray(staffOutlets.outletId, [...context.outletIds]),
      ),
    )
    .orderBy(asc(user.name));
  return { items: rows };
}

export async function recordPayment(
  db: Database,
  context: AuthContext,
  input: RecordPaymentRequest,
): Promise<RecordPaymentResponse> {
  const existing = await loadScopedOrder(db, context, input.orderId);
  await requireAction(db, context, "record_payment", input.orderId, existing.outletId);

  try {
    assertCanAcceptPayment(existing.status, existing.kind);
  } catch (error) {
    lifecycleToAuthError(error);
  }

  const amount = parseMoney(input.amount, "amount");
  if (amount <= 0n) {
    throw AuthError.validation({ amount: ["Jumlah pembayaran harus lebih dari nol."] });
  }
  const reference = requireReference(input.method, input.referenceNote ?? null);
  const requestHash = paymentRecordRequestHash(context.user.id, input);

  try {
    return await db.transaction(async (tx) => {
      const claim = await claimIdempotency(tx, {
        businessId: context.user.businessId,
        key: input.idempotencyKey,
        operation: "payment.record",
        requestHash,
      });

      const scope = scopeOf(context);
      const order = await lockOrder(tx, scope, input.orderId);

      try {
        assertCanAcceptPayment(order.status, order.kind);
      } catch (error) {
        lifecycleToAuthError(error);
      }

      const paidRows = await tx
        .select({ amount: payments.amount })
        .from(payments)
        .where(eq(payments.orderId, order.id));
      const paidTotal = sumIdr(paidRows.map((row) => row.amount));
      const plan = planPayment(order.total, paidTotal, amount, input.method);

      if (plan.settles) {
        const lines = await tx
          .select()
          .from(orderLines)
          .where(eq(orderLines.orderId, order.id))
          .orderBy(asc(orderLines.sortOrder), asc(orderLines.id));
        await settleOrderStock(asDatabase(tx), context, order, lines);
      }

      const [payment] = await tx
        .insert(payments)
        .values({
          orderId: order.id,
          method: input.method,
          amount: plan.applied,
          changeAmount: plan.change,
          referenceNote: reference,
          createdBy: context.user.id,
        })
        .returning();
      if (!payment) throw AuthError.internal("Pembayaran gagal disimpan.");

      if (plan.settles) {
        await tx
          .update(orders)
          .set({ status: "PAID", paidAt: new Date(), updatedAt: new Date() })
          .where(eq(orders.id, order.id));
        await insertStatusEvent(tx, order.id, order.status, "PAID", context.user.id, null, scope);
      }

      const detail = await buildOrderDetail(asDatabase(tx), context, order.id);
      const response: RecordPaymentResponse = {
        item: detail,
        payment: {
          id: payment.id,
          method: payment.method,
          amount: idrToString(payment.amount),
          changeAmount: idrToString(payment.changeAmount),
          referenceNote: payment.referenceNote,
          receivedAt: payment.receivedAt.toISOString(),
          createdByName: context.user.name,
        },
      };

      await tx
        .update(idempotencyKeys)
        .set({
          orderId: order.id,
          responseStatus: 201,
          responseBody: response,
          completedAt: new Date(),
        })
        .where(eq(idempotencyKeys.id, claim.id));

      return response;
    });
  } catch (error) {
    if (uniqueViolationConstraint(error) === "idempotency_keys_business_id_key_unique") {
      return replayIdempotent(
        db,
        context.user.businessId,
        input.idempotencyKey,
        requestHash,
        recordPaymentResponseSchema,
      );
    }
    throw error;
  }
}

async function loadPaymentInScope(
  db: Database,
  context: AuthContext,
  paymentId: string,
): Promise<{ payment: PaymentRow; order: OrderRow }> {
  const scope = scopeOf(context);
  const [row] = await db
    .select({ payment: payments, order: orders })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .where(
      and(
        eq(payments.id, paymentId),
        eq(orders.businessId, scope.businessId),
        inArray(orders.outletId, [...scope.outletIds]),
      ),
    )
    .limit(1);

  if (!row) throw AuthError.notFound("Pembayaran tidak ditemukan.");
  return row;
}

function assertPaymentCorrectable(order: OrderRow): void {
  if (order.status === "PAID" || order.status === "VOID") {
    throw AuthError.conflict(
      "Pembayaran pada transaksi yang sudah dibayar atau dibatalkan tidak dapat diubah. Gunakan pembatalan transaksi.",
    );
  }
}

export async function correctPayment(
  db: Database,
  context: AuthContext,
  paymentId: string,
  input: CorrectPaymentRequest,
): Promise<RecordPaymentResponse> {
  if (context.user.role !== "OWNER" && context.user.role !== "ADMIN") {
    await auditDenial(db, context, {
      action: "record_payment",
      entityType: "payment",
      entityId: paymentId,
      outletId: context.activeOutletId,
      reason: "payment correction requires Admin or Owner",
    });
    throw AuthError.forbidden(
      "Hanya Admin atau Pemilik yang dapat mengoreksi pembayaran.",
    );
  }

  const scope = scopeOf(context);

  return db.transaction(async (tx) => {
    const existing = await loadPaymentInScope(asDatabase(tx), context, paymentId);
    assertPaymentCorrectable(existing.order);

    const order = await lockOrder(tx, scope, existing.order.id);
    assertPaymentCorrectable(order);

    const others = await tx
      .select({ amount: payments.amount })
      .from(payments)
      .where(and(eq(payments.orderId, order.id), sql`${payments.id} <> ${paymentId}`));
    const otherPaid = sumIdr(others.map((row) => row.amount));

    const method = input.method ?? existing.payment.method;
    const amount =
      input.amount === undefined
        ? existing.payment.amount
        : parseMoney(input.amount, "amount");
    if (amount <= 0n) {
      throw AuthError.validation({ amount: ["Jumlah pembayaran harus lebih dari nol."] });
    }

    const reference =
      input.referenceNote === undefined
        ? existing.payment.referenceNote
        : requireReference(method, input.referenceNote);
    if (input.method !== undefined && input.referenceNote === undefined) {
      requireReference(method, existing.payment.referenceNote);
    }

    const plan = planPayment(order.total, otherPaid, amount, method);

    const [updated] = await tx
      .update(payments)
      .set({
        method,
        amount: plan.applied,
        changeAmount: plan.change,
        referenceNote: reference,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, existing.payment.id))
      .returning();
    if (!updated) throw AuthError.internal("Koreksi pembayaran gagal disimpan.");

    if (otherPaid + plan.applied >= order.total) {
      const lines = await tx
        .select()
        .from(orderLines)
        .where(eq(orderLines.orderId, order.id))
        .orderBy(asc(orderLines.sortOrder), asc(orderLines.id));
      await settleOrderStock(asDatabase(tx), context, order, lines);
      await tx
        .update(orders)
        .set({ status: "PAID", paidAt: new Date(), updatedAt: new Date() })
        .where(eq(orders.id, order.id));
      await insertStatusEvent(
        tx,
        order.id,
        order.status,
        "PAID",
        context.user.id,
        null,
        scope,
      );
    }

    await appendAuditEntry(asDatabase(tx), scope, {
      action: "order.payment_corrected",
      entityType: "payment",
      entityId: updated.id,
      actorId: context.user.id,
      outletId: order.outletId,
      reason: input.reason.trim(),
      before: {
        orderId: order.id,
        method: existing.payment.method,
        amount: idrToString(existing.payment.amount),
        changeAmount: idrToString(existing.payment.changeAmount),
        referenceNote: existing.payment.referenceNote,
      },
      after: {
        orderId: order.id,
        method: updated.method,
        amount: idrToString(updated.amount),
        changeAmount: idrToString(updated.changeAmount),
        referenceNote: updated.referenceNote,
      },
    });

    return {
      item: await buildOrderDetail(asDatabase(tx), context, order.id),
      payment: toPaymentContract(updated, context.user.name),
    };
  });
}

export async function deletePayment(
  db: Database,
  context: AuthContext,
  paymentId: string,
  reason: string,
): Promise<OrderResponse> {
  if (context.user.role !== "OWNER" && context.user.role !== "ADMIN") {
    await auditDenial(db, context, {
      action: "record_payment",
      entityType: "payment",
      entityId: paymentId,
      outletId: context.activeOutletId,
      reason: "payment deletion requires Admin or Owner",
    });
    throw AuthError.forbidden(
      "Hanya Admin atau Pemilik yang dapat menghapus pembayaran.",
    );
  }

  const scope = scopeOf(context);

  return db.transaction(async (tx) => {
    const existing = await loadPaymentInScope(asDatabase(tx), context, paymentId);
    assertPaymentCorrectable(existing.order);
    const order = await lockOrder(tx, scope, existing.order.id);
    assertPaymentCorrectable(order);

    await tx.delete(payments).where(eq(payments.id, existing.payment.id));

    await appendAuditEntry(asDatabase(tx), scope, {
      action: "order.payment_deleted",
      entityType: "payment",
      entityId: existing.payment.id,
      actorId: context.user.id,
      outletId: order.outletId,
      reason: reason.trim(),
      before: {
        orderId: order.id,
        method: existing.payment.method,
        amount: idrToString(existing.payment.amount),
        changeAmount: idrToString(existing.payment.changeAmount),
        referenceNote: existing.payment.referenceNote,
      },
    });

    return { item: await buildOrderDetail(asDatabase(tx), context, order.id) };
  });
}

export async function voidOrder(
  db: Database,
  context: AuthContext,
  orderId: string,
  input: VoidOrderRequest,
  verifyOwnerPassword?: (password: string) => Promise<boolean>,
): Promise<OrderResponse> {
  const existing = await loadScopedOrder(db, context, orderId);
  const scope = scopeOf(context);
  const settingsRow = await loadSettingsRow(db, scope.businessId, existing.outletId);
  const operational = settingsFallback(settingsRow);

  try {
    assertCanVoid(existing.status, context.user.role);
  } catch (error) {
    if (error instanceof OrderLifecycleError && error.code === "ROLE_FORBIDDEN") {
      await auditDenial(db, context, {
        action: existing.status === "PAID" ? "void_paid" : "void_unpaid",
        entityType: "order",
        entityId: orderId,
        outletId: existing.outletId,
      });
    }
    lifecycleToAuthError(error);
  }

  let reason: string;
  try {
    reason = normalizeVoidReason(input.reason, operational.voidReasonMinLength);
  } catch (error) {
    lifecycleToAuthError(error);
  }

  if (existing.status === "PAID") {
    const password = input.password?.trim() ?? "";
    if (password.length === 0) {
      throw AuthError.validation({
        password: ["Kata sandi Pemilik wajib diisi untuk membatalkan transaksi yang sudah dibayar."],
      });
    }
    if (!verifyOwnerPassword) {
      throw AuthError.internal("Verifikasi kata sandi Pemilik tidak tersedia.");
    }
    const matches = await verifyOwnerPassword(password);
    if (!matches) {
      await appendAuditEntry(db, scope, {
        action: "order.void_reauth_denied",
        entityType: "order",
        entityId: orderId,
        actorId: context.user.id,
        outletId: existing.outletId,
        reason: "owner password verification failed",
      });
      throw AuthError.forbidden("Kata sandi Pemilik tidak cocok.");
    }
  }

  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, scope, orderId);
    try {
      assertCanVoid(order.status, context.user.role);
    } catch (error) {
      if (error instanceof OrderLifecycleError && error.code === "ROLE_FORBIDDEN") {
        await auditDenial(db, context, {
          action: order.status === "PAID" ? "void_paid" : "void_unpaid",
          entityType: "order",
          entityId: orderId,
          outletId: order.outletId,
        });
      }
      lifecycleToAuthError(error);
    }
    const storedReason = normalizeVoidReason(reason, operational.voidReasonMinLength);

    const paymentRows = await tx
      .select()
      .from(payments)
      .where(eq(payments.orderId, order.id));

    const reversed = await reverseOrderStock(asDatabase(tx), context, {
      ...order,
      voidReason: storedReason,
    });

    const now = new Date();
    // A partially paid order that is voided still returns money the customer
    // handed over; every recorded tender gets its full per-method refund row.
    if (paymentRows.length > 0) {
      for (const payment of paymentRows) {
        await tx.insert(refunds).values({
          orderId: order.id,
          paymentId: payment.id,
          method: payment.method,
          amount: payment.amount,
          reason: storedReason,
          createdBy: context.user.id,
        });
      }
    }

    await tx
      .update(orders)
      .set({
        status: "VOID",
        voidedAt: now,
        voidReason: storedReason,
        updatedAt: now,
      })
      .where(eq(orders.id, order.id));

    await insertStatusEvent(
      tx,
      order.id,
      order.status,
      "VOID",
      context.user.id,
      storedReason,
      scope,
    );

    await appendAuditEntry(asDatabase(tx), scope, {
      action: order.status === "PAID" ? "order.void_paid" : "order.void_unpaid",
      entityType: "order",
      entityId: order.id,
      actorId: context.user.id,
      outletId: order.outletId,
      reason: storedReason,
      before: { status: order.status },
      after: {
        status: "VOID",
        refunds: paymentRows.length,
        stockLinesReversed: reversed,
      },
    });

    return { item: await buildOrderDetail(asDatabase(tx), context, order.id) };
  });
}

export async function listOrders(
  db: Database,
  context: AuthContext,
  query: OrderListQuery,
): Promise<OrderListResponse> {
  const scope = scopeOf(context);
  const conditions = [outletScoped(orders, scope)];

  if (query.status) conditions.push(eq(orders.status, query.status));
  if (context.user.role === "MECHANIC") {
    conditions.push(eq(orders.technicianId, context.user.id));
  }
  if (query.from) {
    conditions.push(
      sql`${orders.createdAt} >= (${query.from}::date)::timestamp AT TIME ZONE 'Asia/Jakarta'`,
    );
  }
  if (query.to) {
    conditions.push(
      sql`${orders.createdAt} < ((${query.to}::date + interval '1 day')::timestamp AT TIME ZONE 'Asia/Jakarta')`,
    );
  }
  if (query.q) {
    const pattern = `%${query.q.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
    const plate = normalizePlate(query.q);
    const predicates = [
      ilike(orders.orderNumber, pattern),
      ilike(customers.name, pattern),
      ilike(vehicles.normalizedPlate, pattern),
    ];
    if (plate.length > 0) {
      predicates.push(ilike(vehicles.normalizedPlate, `%${plate}%`));
    }
    const search = or(...predicates);
    if (search) conditions.push(search);
  }

  const where = and(...conditions);
  const offset = (query.page - 1) * query.pageSize;

  const [countRow] = await db
    .select({ value: count() })
    .from(orders)
    .leftJoin(customers, eq(customers.id, orders.customerId))
    .leftJoin(vehicles, eq(vehicles.id, orders.vehicleId))
    .where(where);

  const total = Number(countRow?.value ?? 0);

  const rows = await db
    .select({
      order: orders,
      outletName: outlets.name,
      customerName: customers.name,
      vehiclePlate: vehicles.normalizedPlate,
      technicianName: user.name,
    })
    .from(orders)
    .innerJoin(outlets, eq(outlets.id, orders.outletId))
    .leftJoin(customers, eq(customers.id, orders.customerId))
    .leftJoin(vehicles, eq(vehicles.id, orders.vehicleId))
    .leftJoin(user, eq(user.id, orders.technicianId))
    .where(where)
    .orderBy(desc(orders.createdAt), asc(orders.id))
    .limit(query.pageSize)
    .offset(offset);

  const ids = rows.map((row) => row.order.id);
  const lineCounts = new Map<string, number>();
  const paidTotals = new Map<string, bigint>();

  if (ids.length > 0) {
    const lineRows = await db
      .select({ orderId: orderLines.orderId, value: count() })
      .from(orderLines)
      .where(inArray(orderLines.orderId, ids))
      .groupBy(orderLines.orderId);
    for (const row of lineRows) lineCounts.set(row.orderId, Number(row.value));

    const paidRows = await db
      .select({
        orderId: payments.orderId,
        value: sql<string>`coalesce(sum(${payments.amount}), 0)`,
      })
      .from(payments)
      .where(inArray(payments.orderId, ids))
      .groupBy(payments.orderId);
    for (const row of paidRows) paidTotals.set(row.orderId, BigInt(row.value));
  }

  const items: OrderListItem[] = rows.map((row) => {
    const paidTotal = paidTotals.get(row.order.id) ?? 0n;
    const balance = row.order.status === "VOID" ? 0n : balanceDueOf(row.order.total, paidTotal);
    return {
      id: row.order.id,
      orderNumber: row.order.orderNumber,
      kind: row.order.kind,
      status: row.order.status,
      outletId: row.order.outletId,
      outletName: row.outletName,
      customerName: row.customerName,
      vehiclePlate: row.vehiclePlate,
      technicianName: row.technicianName,
      lineCount: lineCounts.get(row.order.id) ?? 0,
      total: idrToString(row.order.total),
      paidTotal: idrToString(paidTotal),
      balanceDue: idrToString(balance),
      createdAt: row.order.createdAt.toISOString(),
    };
  });

  return {
    items,
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
  };
}

/** Exposed for the receipt service: one place builds the canonical detail. */
export async function loadOrderForDocument(
  db: Database,
  context: AuthContext,
  orderId: string,
): Promise<OrderDetail> {
  return buildOrderDetail(db, context, orderId);
}

/** Used by the receipt service to append the print audit row. */
export async function recordReceiptPrint(
  db: Database,
  context: AuthContext,
  detail: OrderDetail,
  documentKind: "RECEIPT" | "ESTIMATE",
): Promise<number> {
  const scope = scopeOf(context);
  const previous = await loadPrintCount(db, scope.businessId, detail.id, documentKind);
  const next = previous + 1;

  await appendAuditEntry(db, scope, {
    action: "receipt.printed",
    entityType: "order",
    entityId: detail.id,
    actorId: context.user.id,
    outletId: detail.outletId,
    after: { documentKind, printCount: next, orderNumber: detail.orderNumber },
  });

  return next;
}

/**
 * Offline sale application (WP6.1, PRD US-14/US-15, ADR-0001 §3.6).
 *
 * The money is the local record: unit prices, discounts, tax rate, and tenders
 * are persisted exactly as the device printed them, after the server verifies
 * their arithmetic. Stock is the server's: the ledger decides whether the sale
 * fits, and a shortage raises a conflict instead of writing a partial order.
 * The function participates in the caller's transaction (a nested call becomes
 * a savepoint), so a sync key and its stored result commit atomically with the
 * order, payments, and ledger rows.
 */
export interface OfflineSaleOptions {
  /** Admin/Owner resolution: allow a negative balance and flag ledger rows. */
  stockOverrideReason?: string;
  /** Admin/Owner resolution: accept the vehicle's current owner. */
  allowPlateReassignment?: boolean;
  /** Admin/Owner resolution: record the sale as VOID with full refunds and no stock movement. */
  voidReason?: string;
  /**
   * The user who captured the sale offline. A resolving Admin is the actor for
   * the override audit and ledger row, but the sale itself stays attributed to
   * the cashier who took the money.
   */
  salesActorId?: string;
}

export interface OfflineSaleOutcome {
  detail: OrderDetail;
  /** Non-blocking catalog-price differences; the sale keeps its local money. */
  notices: SyncConflictDetail[];
  stockOverridden: boolean;
}

/** A blocking conflict: the sale was not written and needs explicit resolution. */
export class OfflineSaleConflictError extends Error {
  readonly detail: SyncConflictDetail;

  constructor(detail: SyncConflictDetail) {
    super(detail.message);
    this.name = "OfflineSaleConflictError";
    this.detail = detail;
  }
}

interface OfflineProductRow {
  id: string;
  name: string;
  price: bigint;
  deletedAt: Date | null;
}

interface OfflineServiceRow {
  id: string;
  name: string;
  price: bigint;
}

interface PricedOfflinePayment {
  method: "CASH" | "TRANSFER" | "QRIS";
  amount: bigint;
  changeAmount: bigint;
  referenceNote: string | null;
}

function offlineConflict(detail: SyncConflictDetail): OfflineSaleConflictError {
  return new OfflineSaleConflictError(detail);
}

function parseRecordedAt(value: string): Date {
  const recordedAt = new Date(value);
  if (Number.isNaN(recordedAt.getTime())) {
    throw AuthError.validation({
      deviceRecordedAt: ["Waktu pencatatan perangkat tidak valid."],
    });
  }
  // Report timestamps come from the server; the device time is only retained
  // as the local sale record, so a skewed device clock must not block a sale.
  return recordedAt;
}

async function offlineStockOnHand(
  tx: TransactionHandle,
  scope: OutletScope,
  productId: string,
): Promise<number> {
  const [row] = await tx
    .select({
      value: sql<string>`coalesce(sum(${stockLedger.quantityAfter} - ${stockLedger.quantityBefore}), 0)`,
    })
    .from(stockLedger)
    .where(
      and(outletScoped(stockLedger, scope), eq(stockLedger.productId, productId)),
    );
  return Number(row?.value ?? "0");
}

function assertLocalMoney(
  field: string,
  actual: bigint,
  recorded: string,
  label: string,
): void {
  if (actual !== parseMoney(recorded, field)) {
    throw AuthError.validation({
      [field]: [
        `${label} tidak cocok dengan perhitungan ulang. Periksa data lokal sebelum sinkron.`,
      ],
    });
  }
}

export async function applyOfflineSale(
  database: Database,
  context: AuthContext,
  input: SyncApplyRequest,
  options: OfflineSaleOptions = {},
): Promise<OfflineSaleOutcome> {
  const scope = scopeOf(context);
  const outletId = input.outletId;
  if (!context.outletIds.includes(outletId) || context.activeOutletId !== outletId) {
    throw AuthError.forbidden(CROSS_OUTLET_MESSAGE);
  }
  if (options.stockOverrideReason !== undefined && options.voidReason !== undefined) {
    throw AuthError.internal("Resolusi konflik tidak boleh menggabungkan override dan void.");
  }

  await requireAction(database, context, "create_sale", input.clientKey, outletId);
  const stockOverridden = options.stockOverrideReason !== undefined;
  if (stockOverridden) {
    await requireAction(database, context, "override_stock", input.clientKey, outletId);
  }

  const deviceRecordedAt = parseRecordedAt(input.order.deviceRecordedAt);
  const hasServiceLine = input.order.lines.some((line) => line.lineType === "SERVICE");
  if (hasServiceLine && !input.order.vehicleId) {
    throw AuthError.validation({
      "order.vehicleId": ["Baris jasa memerlukan kendaraan."],
    });
  }

  const overrideReason = options.stockOverrideReason?.trim() ?? "";
  if (stockOverridden && overrideReason.length < 3) {
    throw AuthError.validation({
      reason: ["Alasan override wajib diisi minimal 3 karakter."],
    });
  }

  return database.transaction(async (tx) => {
    const handle = asDatabase(tx);
    const settingsRow = await loadSettingsRow(handle, scope.businessId, outletId);
    const operational = settingsFallback(settingsRow);

    let voidReason: string | null = null;
    if (options.voidReason !== undefined) {
      try {
        voidReason = normalizeVoidReason(
          options.voidReason,
          operational.voidReasonMinLength,
        );
      } catch (error) {
        lifecycleToAuthError(error);
      }
    }

    // Resolve the catalog rows without repricing: the local unit price is what
    // the customer paid. Product rows are locked in id order to serialize the
    // stock decision against online completions.
    const productLines = input.order.lines
      .map((line, index) => ({ line, index }))
      .filter((entry) => entry.line.lineType === "PRODUCT");
    const serviceLines = input.order.lines
      .map((line, index) => ({ line, index }))
      .filter((entry) => entry.line.lineType === "SERVICE");
    const productIds = [
      ...new Set(productLines.map((entry) => entry.line.catalogItemId)),
    ].sort();
    const serviceIds = [
      ...new Set(serviceLines.map((entry) => entry.line.catalogItemId)),
    ].sort();

    const productRows = productIds.length
      ? await tx
          .select({
            id: products.id,
            name: products.name,
            price: products.price,
            deletedAt: products.deletedAt,
          })
          .from(products)
          .where(
            and(
              eq(products.businessId, scope.businessId),
              eq(products.outletId, outletId),
              inArray(products.id, productIds),
            ),
          )
          .orderBy(asc(products.id))
          .for("update")
      : [];
    const serviceRows = serviceIds.length
      ? await tx
          .select({
            id: services.id,
            name: services.name,
            price: services.price,
          })
          .from(services)
          .where(
            and(
              eq(services.businessId, scope.businessId),
              eq(services.outletId, outletId),
              inArray(services.id, serviceIds),
            ),
          )
      : [];

    const productsById = new Map<string, OfflineProductRow>(
      productRows.map((row) => [row.id, row]),
    );
    const servicesById = new Map<string, OfflineServiceRow>(
      serviceRows.map((row) => [row.id, row]),
    );

    const notices: SyncConflictDetail[] = [];
    const noticed = new Set<string>();
    function noticePriceChange(
      key: string,
      detail: SyncConflictDetail,
    ): void {
      if (noticed.has(key)) return;
      noticed.add(key);
      notices.push(detail);
    }

    const resolvedLines: ResolvedLine[] = input.order.lines.map((line, index) => {
      const field = `order.lines.${index}.catalogItemId`;
      const discountPercent = line.discountPercent ?? null;
      const discountAmount = line.discountAmount
        ? parseMoney(line.discountAmount, `order.lines.${index}.discountAmount`)
        : 0n;
      const unitPrice = parseMoney(line.unitPrice, `order.lines.${index}.unitPrice`);
      const technicianId = line.technicianId ?? input.order.technicianId ?? null;

      if (line.lineType === "PRODUCT") {
        const product = productsById.get(line.catalogItemId);
        if (!product) {
          throw AuthError.validation({
            [field]: ["Produk tidak ditemukan di outlet ini."],
          });
        }
        if (product.deletedAt !== null && voidReason === null) {
          throw AuthError.validation({
            [field]: ["Produk sudah dihapus; penjualan tidak dapat diterapkan."],
          });
        }
        if (product.price !== unitPrice) {
          noticePriceChange(`PRODUCT:${product.id}`, {
            code: "PRICE_CHANGED",
            blocking: false,
            message: `Harga ${product.name} berubah dari ${formatIdr(unitPrice)} menjadi ${formatIdr(product.price)}; transaksi tetap memakai harga lokal.`,
            productId: product.id,
            productName: product.name,
          });
        }
        return {
          lineType: "PRODUCT",
          productId: product.id,
          serviceId: null,
          description: line.description,
          unitPrice,
          quantity: line.quantity,
          discountPercent,
          discountAmount,
          technicianId,
        };
      }

      const service = servicesById.get(line.catalogItemId);
      if (!service) {
        throw AuthError.validation({
          [field]: ["Layanan tidak ditemukan di outlet ini."],
        });
      }
      if (service.price !== unitPrice) {
        noticePriceChange(`SERVICE:${service.id}`, {
          code: "PRICE_CHANGED",
          blocking: false,
          message: `Harga ${service.name} berubah dari ${formatIdr(unitPrice)} menjadi ${formatIdr(service.price)}; transaksi tetap memakai harga lokal.`,
          productName: service.name,
        });
      }
      return {
        lineType: "SERVICE",
        productId: null,
        serviceId: service.id,
        description: line.description,
        unitPrice,
        quantity: line.quantity,
        discountPercent,
        discountAmount,
        technicianId,
      };
    });

    let pricing: OrderPricing;
    try {
      pricing = priceOrder({
        lines: pricingInputsFromLines(resolvedLines),
        taxRatePercent: input.order.taxRate,
        orderDiscountPercent: input.order.discountPercent ?? null,
        orderDiscountAmount: input.order.discountAmount
          ? parseMoney(input.order.discountAmount, "order.discountAmount")
          : null,
      });
    } catch (error) {
      pricingToAuthError(error);
    }

    assertLocalMoney("order.subtotal", pricing.subtotal, input.order.subtotal, "Subtotal lokal");
    assertLocalMoney(
      "order.discountTotal",
      pricing.discountTotal,
      input.order.discountTotal,
      "Total diskon lokal",
    );
    assertLocalMoney("order.taxTotal", pricing.taxTotal, input.order.taxTotal, "Total pajak lokal");
    assertLocalMoney("order.total", pricing.total, input.order.total, "Total lokal");
    const discountAboveCap = isDiscountAboveCap(
      pricing.subtotal,
      pricing.discountTotal,
      operational.cashierDiscountCapPercent,
    );
    const taxRateMismatch = input.order.taxRate !== operational.taxRate;

    input.order.lines.forEach((line, index) => {
      const priced = pricing.lines[index];
      assertLocalMoney(
        `order.lines.${index}.lineTotal`,
        priced?.lineTotal ?? 0n,
        line.lineTotal,
        "Nilai baris lokal",
      );
      assertLocalMoney(
        `order.lines.${index}.taxAmount`,
        priced?.taxAmount ?? 0n,
        line.taxAmount,
        "Pajak baris lokal",
      );
    });

    const tenders: PricedOfflinePayment[] = input.order.payments.map(
      (payment, index) => {
        const amount = parseMoney(payment.amount, `order.payments.${index}.amount`);
        const changeAmount = payment.changeAmount
          ? parseMoney(payment.changeAmount, `order.payments.${index}.changeAmount`)
          : 0n;
        if (payment.method !== "CASH" && changeAmount !== 0n) {
          throw AuthError.validation({
            [`order.payments.${index}.changeAmount`]: [
              "Hanya pembayaran tunai yang boleh memiliki kembalian.",
            ],
          });
        }
        return {
          method: payment.method,
          amount,
          changeAmount,
          referenceNote: requireReference(
            payment.method,
            payment.referenceNote ?? null,
          ),
        };
      },
    );
    const paidTotal = sumIdr(tenders.map((payment) => payment.amount));
    if (paidTotal !== pricing.total) {
      throw AuthError.validation({
        "order.payments": [
          `Total pembayaran ${formatIdr(paidTotal)} tidak sama dengan total transaksi ${formatIdr(pricing.total)}.`,
        ],
      });
    }

    const technicianIds = [
      ...new Set(
        resolvedLines
          .map((line) => line.technicianId)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      ),
    ];
    if (voidReason === null) {
      for (const technicianId of technicianIds) {
        await requireTechnician(
          handle,
          scope.businessId,
          technicianId,
          "order.technicianId",
        );
      }
    }

    let resolvedCustomerId = input.order.customerId ?? null;
    if (input.order.vehicleId) {
      const [vehicle] = await tx
        .select({
          id: vehicles.id,
          customerId: vehicles.customerId,
          plate: vehicles.normalizedPlate,
        })
        .from(vehicles)
        .where(
          and(
            eq(vehicles.id, input.order.vehicleId),
            eq(vehicles.businessId, scope.businessId),
          ),
        )
        .limit(1);
      if (!vehicle) {
        throw AuthError.validation({
          "order.vehicleId": ["Kendaraan tidak ditemukan."],
        });
      }
      // A void keeps the locally recorded customer: no re-link happens while
      // reversing an already-paid offline sale.
      if (
        voidReason === null &&
        resolvedCustomerId !== null &&
        resolvedCustomerId !== vehicle.customerId
      ) {
        if (!options.allowPlateReassignment) {
          throw offlineConflict({
            code: "PLATE_REASSIGNED",
            blocking: true,
            message: `Kendaraan ${vehicle.plate} sudah terhubung ke pelanggan lain. Pemilik atau Admin harus menautkan ulang.`,
            vehicleId: vehicle.id,
            plate: vehicle.plate,
          });
        }
        // Explicit re-link: the order follows the vehicle's current owner; the
        // vehicle record itself is untouched.
        resolvedCustomerId = vehicle.customerId;
      }
      resolvedCustomerId = resolvedCustomerId ?? vehicle.customerId;
    }
    if (resolvedCustomerId) {
      await requireCustomer(handle, scope.businessId, resolvedCustomerId);
    }

    // Server-authoritative stock: every product line is checked against the
    // locked ledger before a single row is written.
    const requestedByProduct = new Map<string, number>();
    for (const line of resolvedLines) {
      if (line.lineType !== "PRODUCT" || line.productId === null) continue;
      requestedByProduct.set(
        line.productId,
        (requestedByProduct.get(line.productId) ?? 0) + line.quantity,
      );
    }
    const shortageProducts = new Set<string>();
    const serverStockByProduct = new Map<string, number>();
    for (const productId of [...requestedByProduct.keys()].sort()) {
      const localQuantity = requestedByProduct.get(productId) ?? 0;
      const serverQuantity = await offlineStockOnHand(tx, scope, productId);
      serverStockByProduct.set(productId, serverQuantity);
      if (voidReason !== null || serverQuantity >= localQuantity) continue;
      if (!stockOverridden) {
        const product = productsById.get(productId);
        throw offlineConflict({
          code: "STOCK_INSUFFICIENT",
          blocking: true,
          message: `Stok ${product?.name ?? "produk"} tidak mencukupi: lokal ${localQuantity}, server ${serverQuantity}.`,
          productId,
          productName: product?.name ?? null,
          localQuantity,
          serverQuantity,
        });
      }
      shortageProducts.add(productId);
    }

    const orderNumber = await nextOrderNumber(
      tx,
      outletId,
      input.order.kind,
      operational.receiptPrefix,
    );
    const salesActorId = options.salesActorId ?? context.user.id;
    const now = new Date();
    const [order] = await tx
      .insert(orders)
      .values({
        businessId: scope.businessId,
        outletId,
        kind: input.order.kind,
        status: "DRAFT",
        customerId: resolvedCustomerId,
        vehicleId: input.order.vehicleId ?? null,
        technicianId: input.order.technicianId ?? null,
        odometer: input.order.odometer ?? null,
        orderNumber,
        taxRate: input.order.taxRate,
        subtotal: pricing.subtotal,
        discountTotal: pricing.discountTotal,
        taxTotal: pricing.taxTotal,
        total: pricing.total,
        notes: input.order.notes?.trim() ? input.order.notes.trim() : null,
        paidAt: now,
        createdBy: salesActorId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    if (!order) throw AuthError.internal("Transaksi gagal disimpan.");

    // Offline money stays local, but a discount above the cashier cap and a
    // client-chosen tax rate are control-relevant; record them even though the
    // already-paid sale is not blocked.
    if (discountAboveCap) {
      await appendAuditEntry(handle, scope, {
        action: "sync.discount_above_cap",
        entityType: "order",
        entityId: order.id,
        actorId: context.user.id,
        outletId,
        after: {
          clientKey: input.clientKey,
          capPercent: operational.cashierDiscountCapPercent,
          subtotal: idrToString(pricing.subtotal),
          discountTotal: idrToString(pricing.discountTotal),
          authorized: can(context.user.role, "override_discount"),
        },
      });
    }
    if (taxRateMismatch) {
      await appendAuditEntry(handle, scope, {
        action: "sync.tax_rate_mismatch",
        entityType: "order",
        entityId: order.id,
        actorId: context.user.id,
        outletId,
        after: {
          clientKey: input.clientKey,
          deviceRate: input.order.taxRate,
          settingRate: operational.taxRate,
          total: idrToString(pricing.total),
        },
      });
    }

    const lineRows = await tx
      .insert(orderLines)
      .values(
        resolvedLines.map((line, index) => ({
          orderId: order.id,
          lineType: line.lineType,
          productId: line.productId,
          serviceId: line.serviceId,
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discountPercent: line.discountPercent,
          discountAmount: pricing.lines[index]?.discountAmount ?? 0n,
          taxAmount: pricing.lines[index]?.taxAmount ?? 0n,
          lineTotal: pricing.lines[index]?.lineTotal ?? 0n,
          technicianId: line.technicianId,
          sortOrder: index,
        })),
      )
      .returning();
    if (lineRows.length !== resolvedLines.length) {
      throw AuthError.internal("Baris transaksi gagal disimpan.");
    }

    await insertStatusEvent(
      tx,
      order.id,
      null,
      "DRAFT",
      salesActorId,
      null,
      scope,
    );

    if (voidReason === null) {
      // Duplicate product lines settle in insertion order; only the line that
      // actually drives the balance negative carries the override flag.
      const overrideLineIds = new Set<string>();
      if (stockOverridden && shortageProducts.size > 0) {
        const remaining = new Map(serverStockByProduct);
        for (const line of [...lineRows].sort((a, b) => a.sortOrder - b.sortOrder)) {
          if (line.lineType !== "PRODUCT" || line.productId === null) continue;
          const before = remaining.get(line.productId) ?? 0;
          const after = before - line.quantity;
          if (after < 0) overrideLineIds.add(line.id);
          remaining.set(line.productId, after);
        }
      }
      await settleOrderStock(
        handle,
        context,
        order,
        [...lineRows].sort((a, b) => a.sortOrder - b.sortOrder),
        {
          override: (line) => overrideLineIds.has(line.id),
          reason: stockOverridden ? overrideReason : null,
        },
      );
    }

    const paymentRows = await tx
      .insert(payments)
      .values(
        tenders.map((payment) => ({
          orderId: order.id,
          method: payment.method,
          amount: payment.amount,
          changeAmount: payment.changeAmount,
          referenceNote: payment.referenceNote,
          receivedAt: now,
          createdBy: salesActorId,
        })),
      )
      .returning();
    if (paymentRows.length !== tenders.length) {
      throw AuthError.internal("Pembayaran gagal disimpan.");
    }

    if (voidReason === null) {
      await tx
        .update(orders)
        .set({ status: "PAID", paidAt: now, updatedAt: now })
        .where(eq(orders.id, order.id));
      await insertStatusEvent(
        tx,
        order.id,
        "DRAFT",
        "PAID",
        context.user.id,
        null,
        scope,
      );
    } else {
      await tx.insert(refunds).values(
        paymentRows.map((payment) => ({
          orderId: order.id,
          paymentId: payment.id,
          method: payment.method,
          amount: payment.amount,
          reason: voidReason,
          createdBy: context.user.id,
          refundedAt: now,
        })),
      );
      // The financial-history guard makes a VOID order terminal, so the status
      // flips only after its lines, payment rows, and refunds exist.
      await tx
        .update(orders)
        .set({
          status: "VOID",
          voidedAt: now,
          voidReason,
          updatedAt: now,
        })
        .where(eq(orders.id, order.id));
      await insertStatusEvent(
        tx,
        order.id,
        "DRAFT",
        "VOID",
        context.user.id,
        voidReason,
        scope,
      );
    }

    await appendAuditEntry(handle, scope, {
      action:
        voidReason !== null
          ? "sync.conflict_void"
          : stockOverridden
            ? "sync.conflict_override"
            : "sync.sale_applied",
      entityType: "order",
      entityId: order.id,
      actorId: context.user.id,
      outletId,
      reason: voidReason ?? (stockOverridden ? overrideReason : null),
      after: {
        clientKey: input.clientKey,
        orderNumber,
        total: idrToString(pricing.total),
        deviceRecordedAt: deviceRecordedAt.toISOString(),
        priceChanges: notices.length,
        stockOverridden,
        refunds: voidReason === null ? 0 : paymentRows.length,
      },
    });

    return {
      detail: await buildOrderDetail(handle, context, order.id),
      notices,
      stockOverridden,
    };
  });
}
