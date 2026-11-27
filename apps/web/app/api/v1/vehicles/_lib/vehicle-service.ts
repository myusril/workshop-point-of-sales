import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

import type {
  CreateVehicleRequest,
  UpdateVehicleRequest,
  Vehicle,
  VehicleHistoryQuery,
  VehicleHistoryResponse,
  VehicleHistoryScope,
  VehicleListQuery,
  VehicleListResponse,
  VehicleResponse,
} from "@workshop-pos/contracts";
import {
  ANONYMIZED_CUSTOMER_NAME,
  createVehicleSchema,
  normalizePhoneNumber,
  updateVehicleSchema,
} from "@workshop-pos/contracts";
import {
  auditDenial,
  AuthError,
  can,
  CROSS_OUTLET_MESSAGE,
  denialMessage,
  uniqueViolationConstraint,
  type AuthContext,
} from "@workshop-pos/auth";
import { isValidPlate, normalizePlate, PLATE_MAX_LENGTH } from "@workshop-pos/core";
import {
  appendAuditEntry,
  customers,
  orderLines,
  orders,
  outlets,
  payments,
  vehicles,
  outletScoped,
  type Database,
  type OutletScope,
} from "@workshop-pos/db";

import { toHistoryOrder, type HistoryLineSource } from "@/lib/vehicle-history";

/**
 * Vehicle master data + per-plate service history (FR-021–FR-024, FR-026,
 * FR-028, BR-006, BR-012).
 *
 * Plates are normalized only through `@workshop-pos/core`; the stored form is
 * the identity, so a duplicate create answers "reused" instead of writing a
 * second row. History reads are outlet-filtered and every cross-outlet attempt
 * is audited before it is refused.
 */

/** Drizzle's transaction handle is narrower than `Database` but has the same reads/writes. */
type TransactionHandle = Parameters<Parameters<Database["transaction"]>[0]>[0];

function asDatabase(tx: TransactionHandle): Database {
  return tx as unknown as Database;
}

const VEHICLE_COLUMNS = {
  id: vehicles.id,
  normalizedPlate: vehicles.normalizedPlate,
  brand: vehicles.brand,
  model: vehicles.model,
  year: vehicles.year,
  color: vehicles.color,
  odometer: vehicles.odometer,
  vin: vehicles.vin,
  notes: vehicles.notes,
  customerId: vehicles.customerId,
  customerName: customers.name,
  customerAnonymizedAt: customers.anonymizedAt,
  createdAt: vehicles.createdAt,
  updatedAt: vehicles.updatedAt,
} as const;

/**
 * List projection: VIN and free-text notes are PD-03 fields no list column
 * renders, so they never leave the database for a list request. The edit dialog
 * reads the full record through the management-only detail read.
 */
const VEHICLE_LIST_COLUMNS = {
  id: vehicles.id,
  normalizedPlate: vehicles.normalizedPlate,
  brand: vehicles.brand,
  model: vehicles.model,
  year: vehicles.year,
  color: vehicles.color,
  odometer: vehicles.odometer,
  customerId: vehicles.customerId,
  customerName: customers.name,
  customerAnonymizedAt: customers.anonymizedAt,
  createdAt: vehicles.createdAt,
  updatedAt: vehicles.updatedAt,
} as const;

interface VehicleRow {
  id: string;
  normalizedPlate: string;
  brand: string;
  model: string;
  year: number | null;
  color: string | null;
  odometer: number | null;
  vin: string | null;
  notes: string | null;
  customerId: string;
  customerName: string;
  customerAnonymizedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** The list/history projection omits the PD-03 detail-only columns. */
type VehicleListRow = Omit<VehicleRow, "vin" | "notes">;

/**
 * Business-wide scope for audit writes. Vehicles have no outlet column, so the
 * audit row is stored without an outlet id; the outlet list only satisfies the
 * helper's business-membership guard.
 */
async function auditScope(
  db: Database,
  context: AuthContext,
): Promise<OutletScope> {
  const businessId = context.user.businessId;
  if (context.outletIds.length > 0) {
    return { businessId, outletIds: context.outletIds };
  }

  const rows = await db
    .select({ id: outlets.id })
    .from(outlets)
    .where(and(eq(outlets.businessId, businessId), eq(outlets.isActive, true)));

  return { businessId, outletIds: rows.map((row) => row.id) };
}

/** `%` and `_` are LIKE wildcards; a literal search term must not become one. */
function containsPattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

function fieldErrorsFrom(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of issues) {
    const key =
      issue.path
        .filter(
          (segment) =>
            typeof segment === "string" || typeof segment === "number",
        )
        .join(".") || "_root";
    const existing = fieldErrors[key];
    if (existing) existing.push(issue.message);
    else fieldErrors[key] = [issue.message];
  }
  return fieldErrors;
}

/** Re-validates at the service seam so direct callers get the same Bahasa errors. */
function parseInput<T>(
  schema: {
    safeParse: (value: unknown) =>
      | { success: true; data: T }
      | { success: false; error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] } };
  },
  value: unknown,
): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw AuthError.validation(fieldErrorsFrom(result.error.issues));
  }
  return result.data;
}

/**
 * BR-006 at the API boundary: raw input is accepted, the canonical plate is the
 * only stored form, and an empty or oversized result is a field error. The
 * contract already rejects a blank raw value, so an empty normalization means
 * the input held no letters or digits at all (`***`), not that it was missing.
 */
function canonicalPlate(raw: string): string {
  if (isValidPlate(raw)) return normalizePlate(raw);

  const normalized = normalizePlate(raw);
  throw AuthError.validation({
    plate: [
      normalized.length === 0
        ? "Nomor polisi hanya boleh huruf dan angka."
        : `Nomor polisi maksimal ${PLATE_MAX_LENGTH} karakter.`,
    ],
  });
}

/** Fields shared by the detail record, the list row, and the history vehicle. */
function toVehicleIdentity(row: VehicleListRow) {
  const customerAnonymized = row.customerAnonymizedAt !== null;
  return {
    id: row.id,
    normalizedPlate: row.normalizedPlate,
    brand: row.brand,
    model: row.model,
    year: row.year,
    color: row.color,
    odometer: row.odometer,
    customerId: row.customerId,
    customerName: customerAnonymized
      ? ANONYMIZED_CUSTOMER_NAME
      : row.customerName,
    customerAnonymized,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toVehicle(row: VehicleRow): Vehicle {
  return {
    ...toVehicleIdentity(row),
    vin: row.vin,
    notes: row.notes,
  };
}

function vehicleListConditions(
  businessId: string,
  query: VehicleListQuery,
): SQL[] {
  const conditions: SQL[] = [
    eq(vehicles.businessId, businessId),
    isNull(vehicles.deletedAt),
    // Every list/count query joins the owner, so a removed customer's vehicles
    // drop out of the list instead of rendering a dangling row.
    isNull(customers.deletedAt),
  ];

  if (query.customerId) {
    conditions.push(eq(vehicles.customerId, query.customerId));
  }

  const term = query.q?.trim();
  if (term) {
    const pattern = containsPattern(term);
    const normalized = normalizePlate(term);
    const normalizedPhone = normalizePhoneNumber(term);
    const matches: SQL[] = [
      ilike(vehicles.brand, pattern),
      ilike(vehicles.model, pattern),
      ilike(customers.name, pattern),
      ilike(customers.phone, pattern),
    ];
    // A raw plate ("b 1234 xyz") only matches after normalization.
    if (normalized.length > 0) {
      matches.unshift(ilike(vehicles.normalizedPlate, containsPattern(normalized)));
    }
    // A formatted phone ("+62 812-3456") only matches the canonical column
    // after normalization; the raw clause above still covers digit substrings.
    if (normalizedPhone.length > 0 && normalizedPhone !== term) {
      matches.push(ilike(customers.phone, containsPattern(normalizedPhone)));
    }
    const match = or(...matches);
    if (match) conditions.push(match);
  }

  return conditions;
}

export async function listVehicles(
  db: Database,
  context: AuthContext,
  query: VehicleListQuery,
): Promise<VehicleListResponse> {
  const conditions = vehicleListConditions(context.user.businessId, query);

  const [rows, countRows] = await Promise.all([
    db
      .select(VEHICLE_LIST_COLUMNS)
      .from(vehicles)
      .innerJoin(
        customers,
        and(
          eq(customers.id, vehicles.customerId),
          eq(customers.businessId, context.user.businessId),
        ),
      )
      .where(and(...conditions))
      .orderBy(
        query.dir === "asc"
          ? asc(
              query.sort === "plate"
                ? vehicles.normalizedPlate
                : query.sort === "brand"
                  ? vehicles.brand
                  : vehicles.updatedAt,
            )
          : desc(
              query.sort === "plate"
                ? vehicles.normalizedPlate
                : query.sort === "brand"
                  ? vehicles.brand
                  : vehicles.updatedAt,
            ),
        asc(vehicles.id),
      )
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(vehicles)
      .innerJoin(
        customers,
        and(
          eq(customers.id, vehicles.customerId),
          eq(customers.businessId, context.user.businessId),
        ),
      )
      .where(and(...conditions)),
  ]);

  const total = countRows[0]?.total ?? 0;

  return {
    items: rows.map(toVehicleIdentity),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.ceil(total / query.pageSize),
  };
}

async function loadVehicle(
  db: Database,
  businessId: string,
  id: string,
): Promise<VehicleRow | null> {
  const [row] = await db
    .select(VEHICLE_COLUMNS)
    .from(vehicles)
    .innerJoin(
      customers,
      and(
        eq(customers.id, vehicles.customerId),
        eq(customers.businessId, businessId),
      ),
    )
    .where(
      and(
        eq(vehicles.id, id),
        eq(vehicles.businessId, businessId),
        isNull(vehicles.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Full record, including VIN and notes, for the edit screen. Management-only
 * (PD-03): the list and the plate history already answer every read the floor
 * roles need, and a denial is audited like the other personal-data reads.
 */
export async function getVehicle(
  db: Database,
  context: AuthContext,
  id: string,
): Promise<Vehicle> {
  if (!can(context.user.role, "manage_customers")) {
    await auditDenial(db, context, {
      action: "manage_customers",
      entityType: "vehicle",
      entityId: id,
    });
    throw AuthError.forbidden(denialMessage("manage_customers"));
  }

  const row = await loadVehicle(db, context.user.businessId, id);
  if (!row) throw AuthError.notFound("Kendaraan tidak ditemukan.");
  return toVehicle(row);
}

/**
 * Reuse path (AC4.2): the unique constraint, not a prior SELECT, is the
 * authority, so two concurrent creates still produce exactly one row. The
 * existing vehicle is returned untouched; soft-deleted rows still own the
 * plate, which is why this read does not filter `deletedAt`.
 */
async function loadVehicleByPlate(
  db: Database,
  businessId: string,
  normalizedPlate: string,
): Promise<VehicleRow | null> {
  const [row] = await db
    .select(VEHICLE_COLUMNS)
    .from(vehicles)
    .innerJoin(
      customers,
      and(
        eq(customers.id, vehicles.customerId),
        eq(customers.businessId, businessId),
      ),
    )
    .where(
      and(
        eq(vehicles.businessId, businessId),
        eq(vehicles.normalizedPlate, normalizedPlate),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** A vehicle may only be attached to a live, non-anonymized customer. */
function requireAssignableCustomer(
  row: { id: string; name: string; anonymizedAt: Date | null } | undefined,
): { id: string; name: string; anonymizedAt: Date | null } {
  if (!row) {
    throw AuthError.validation({
      customerId: ["Pelanggan tidak ditemukan."],
    });
  }
  if (row.anonymizedAt !== null) {
    throw AuthError.validation({
      customerId: [
        "Pelanggan telah dianonimkan sehingga tidak dapat menerima kendaraan baru.",
      ],
    });
  }
  return row;
}

async function lockCustomer(
  tx: TransactionHandle,
  businessId: string,
  customerId: string,
): Promise<{ id: string; name: string; anonymizedAt: Date | null } | undefined> {
  const [row] = await tx
    .select({
      id: customers.id,
      name: customers.name,
      anonymizedAt: customers.anonymizedAt,
    })
    .from(customers)
    .where(
      and(
        eq(customers.id, customerId),
        eq(customers.businessId, businessId),
        isNull(customers.deletedAt),
      ),
    )
    .limit(1)
    .for("share");
  return row;
}

export async function createVehicle(
  db: Database,
  context: AuthContext,
  input: CreateVehicleRequest,
): Promise<VehicleResponse> {
  if (!can(context.user.role, "manage_customers")) {
    // No row exists yet, so the audit target is the attempted-create sentinel.
    await auditDenial(db, context, {
      action: "manage_customers",
      entityType: "vehicle",
      entityId: "new",
    });
    throw AuthError.forbidden(denialMessage("manage_customers"));
  }

  const parsed = parseInput(createVehicleSchema, input);
  const normalizedPlate = canonicalPlate(parsed.plate);
  const businessId = context.user.businessId;
  const fields = Object.keys(parsed).sort();

  try {
    const created = await db.transaction(async (tx) => {
      const customer = requireAssignableCustomer(
        await lockCustomer(tx, businessId, parsed.customerId),
      );

      const [vehicle] = await tx
        .insert(vehicles)
        .values({
          businessId,
          customerId: customer.id,
          normalizedPlate,
          brand: parsed.brand,
          model: parsed.model,
          year: parsed.year ?? null,
          color: parsed.color ?? null,
          odometer: parsed.odometer ?? null,
          vin: parsed.vin ?? null,
          notes: parsed.notes ?? null,
        })
        .returning();

      if (!vehicle) throw new Error("Vehicle insert returned no row");

      await appendAuditEntry(asDatabase(tx), await auditScope(asDatabase(tx), context), {
        action: "vehicle.created",
        entityType: "vehicle",
        entityId: vehicle.id,
        actorId: context.user.id,
        // Field names only: the plate and VIN are personal data (PD-02).
        after: { fields },
      });

      return toVehicle({
        ...vehicle,
        customerName: customer.name,
        customerAnonymizedAt: customer.anonymizedAt,
      });
    });

    return { item: created, reused: false };
  } catch (error) {
    if (
      uniqueViolationConstraint(error) ===
      "vehicles_business_id_normalized_plate_unique"
    ) {
      const existing = await loadVehicleByPlate(db, businessId, normalizedPlate);
      if (existing) return { item: toVehicle(existing), reused: true };
    }
    throw error;
  }
}

export async function updateVehicle(
  db: Database,
  context: AuthContext,
  id: string,
  input: UpdateVehicleRequest,
): Promise<Vehicle> {
  if (!can(context.user.role, "manage_customers")) {
    await auditDenial(db, context, {
      action: "manage_customers",
      entityType: "vehicle",
      entityId: id,
    });
    throw AuthError.forbidden(denialMessage("manage_customers"));
  }

  const parsed = parseInput(updateVehicleSchema, input);
  const normalizedPlate =
    parsed.plate === undefined ? undefined : canonicalPlate(parsed.plate);
  const businessId = context.user.businessId;

  try {
    return await db.transaction(async (tx) => {
      const [current] = await tx
        .select(VEHICLE_COLUMNS)
        .from(vehicles)
        .innerJoin(
          customers,
          and(
            eq(customers.id, vehicles.customerId),
            eq(customers.businessId, businessId),
          ),
        )
        .where(
          and(
            eq(vehicles.id, id),
            eq(vehicles.businessId, businessId),
            isNull(vehicles.deletedAt),
          ),
        )
        .limit(1)
        .for("update", { of: vehicles });

      if (!current) throw AuthError.notFound("Kendaraan tidak ditemukan.");

      const nextCustomer =
        parsed.customerId === undefined
          ? { id: current.customerId, name: current.customerName, anonymizedAt: current.customerAnonymizedAt }
          : requireAssignableCustomer(
              await lockCustomer(tx, businessId, parsed.customerId),
            );

      const nextPlate = normalizedPlate ?? current.normalizedPlate;
      const brand = parsed.brand ?? current.brand;
      const model = parsed.model ?? current.model;
      const year =
        parsed.year === undefined ? current.year : parsed.year;
      const color =
        parsed.color === undefined ? current.color : parsed.color;
      const odometer =
        parsed.odometer === undefined ? current.odometer : parsed.odometer;
      const vin = parsed.vin === undefined ? current.vin : parsed.vin;
      const notes =
        parsed.notes === undefined ? current.notes : parsed.notes;

      const fields: string[] = [];
      if (nextPlate !== current.normalizedPlate) fields.push("plate");
      if (nextCustomer.id !== current.customerId) fields.push("customerId");
      if (brand !== current.brand) fields.push("brand");
      if (model !== current.model) fields.push("model");
      if (year !== current.year) fields.push("year");
      if (color !== current.color) fields.push("color");
      if (odometer !== current.odometer) fields.push("odometer");
      if (vin !== current.vin) fields.push("vin");
      if (notes !== current.notes) fields.push("notes");

      if (fields.length === 0) return toVehicle(current);

      const [updated] = await tx
        .update(vehicles)
        .set({
          normalizedPlate: nextPlate,
          customerId: nextCustomer.id,
          brand,
          model,
          year,
          color,
          odometer,
          vin,
          notes,
          updatedAt: new Date(),
        })
        .where(
          and(eq(vehicles.id, current.id), eq(vehicles.businessId, businessId)),
        )
        .returning();

      if (!updated) throw new Error("Vehicle update returned no row");

      await appendAuditEntry(asDatabase(tx), await auditScope(asDatabase(tx), context), {
        action: "vehicle.updated",
        entityType: "vehicle",
        entityId: updated.id,
        actorId: context.user.id,
        before: { fields },
        after: { fields },
      });

      return toVehicle({
        ...updated,
        customerName: nextCustomer.name,
        customerAnonymizedAt: nextCustomer.anonymizedAt,
      });
    });
  } catch (error) {
    if (
      normalizedPlate !== undefined &&
      uniqueViolationConstraint(error) ===
        "vehicles_business_id_normalized_plate_unique"
    ) {
      const message = `Nomor polisi ${normalizedPlate} sudah digunakan kendaraan lain.`;
      throw AuthError.conflict(message, { plate: [message] });
    }
    throw error;
  }
}

function isScopedRole(role: AuthContext["user"]["role"]): boolean {
  return role === "CASHIER" || role === "MECHANIC";
}

function activeOutletIdOf(context: AuthContext): string | null {
  if (
    context.activeOutletId &&
    context.outletIds.includes(context.activeOutletId)
  ) {
    return context.activeOutletId;
  }
  return context.outletIds[0] ?? null;
}

async function outletNameOf(
  db: Database,
  businessId: string,
  outletId: string,
  context: AuthContext,
): Promise<string> {
  const known = context.outlets.find((outlet) => outlet.id === outletId);
  if (known) return known.name;

  const [row] = await db
    .select({ name: outlets.name })
    .from(outlets)
    .where(and(eq(outlets.id, outletId), eq(outlets.businessId, businessId)))
    .limit(1);

  return row?.name ?? "";
}

/**
 * Resolves the caller's effective history outlets (BR-012):
 * - Owner/Admin: the whole business; an explicit filter may name any active
 *   business outlet.
 * - Cashier/Mechanic: only the active outlet. Naming another outlet is a
 *   cross-outlet attempt, audited and refused instead of silently narrowed.
 */
async function resolveHistoryScope(
  db: Database,
  context: AuthContext,
  vehicleId: string,
  requestedOutletId: string | undefined,
): Promise<{ outletIds: string[]; scope: VehicleHistoryScope }> {
  const businessId = context.user.businessId;
  const scoped = isScopedRole(context.user.role);
  const activeOutletId = activeOutletIdOf(context);

  if (context.outletIds.length === 0 || (scoped && !activeOutletId)) {
    throw AuthError.forbidden(
      "Anda belum ditugaskan ke outlet mana pun.",
    );
  }

  if (requestedOutletId) {
    const [outlet] = await db
      .select({ id: outlets.id, name: outlets.name })
      .from(outlets)
      .where(
        and(
          eq(outlets.id, requestedOutletId),
          eq(outlets.businessId, businessId),
          eq(outlets.isActive, true),
        ),
      )
      .limit(1);

    if (!outlet) throw AuthError.notFound("Outlet tidak ditemukan.");

    if (scoped && outlet.id !== activeOutletId) {
      await auditDenial(db, context, {
        action: "view_vehicle_history",
        entityType: "vehicle",
        entityId: vehicleId,
        outletId: outlet.id,
        crossOutlet: true,
      });
      throw AuthError.forbidden(CROSS_OUTLET_MESSAGE);
    }

    return {
      outletIds: [outlet.id],
      scope: {
        allOutlets: false,
        outletId: outlet.id,
        outletName: outlet.name,
      },
    };
  }

  if (scoped && activeOutletId) {
    return {
      outletIds: [activeOutletId],
      scope: {
        allOutlets: false,
        outletId: activeOutletId,
        outletName: await outletNameOf(
          db,
          businessId,
          activeOutletId,
          context,
        ),
      },
    };
  }

  return {
    outletIds: [...context.outletIds],
    scope: { allOutlets: true, outletId: null, outletName: null },
  };
}

async function paidTotalsForOrders(
  db: Database,
  orderIds: readonly string[],
): Promise<Map<string, bigint>> {
  if (orderIds.length === 0) return new Map();

  const rows = await db
    .select({
      orderId: payments.orderId,
      paidTotal: sql<string>`coalesce(sum(${payments.amount} - ${payments.changeAmount}), 0)`,
    })
    .from(payments)
    .where(inArray(payments.orderId, [...orderIds]))
    .groupBy(payments.orderId);

  return new Map(rows.map((row) => [row.orderId, BigInt(row.paidTotal)]));
}

/**
 * One vehicle's service history, newest first, restricted to the caller's
 * outlets and rolled up over the whole scope (not only the current page).
 */
export async function getVehicleHistory(
  db: Database,
  context: AuthContext,
  id: string,
  query: VehicleHistoryQuery,
): Promise<VehicleHistoryResponse> {
  if (!can(context.user.role, "view_vehicle_history")) {
    await auditDenial(db, context, {
      action: "view_vehicle_history",
      entityType: "vehicle",
      entityId: id,
    });
    throw AuthError.forbidden(denialMessage("view_vehicle_history"));
  }

  const vehicleRow = await loadVehicle(db, context.user.businessId, id);
  if (!vehicleRow) throw AuthError.notFound("Kendaraan tidak ditemukan.");

  const { outletIds, scope } = await resolveHistoryScope(
    db,
    context,
    vehicleRow.id,
    query.outletId,
  );

  const conditions = [
    outletScoped(orders, {
      businessId: context.user.businessId,
      outletIds,
    }),
    eq(orders.vehicleId, vehicleRow.id),
  ];

  // Per-order paid total as a joinable subquery, so the scope roll-up stays a
  // single aggregate query instead of loading every historical order. The
  // orders join inside the subquery keeps other tenants' (and other vehicles')
  // payments out of this plate's totals.
  const paidByOrderTotals = db
    .select({
      orderId: payments.orderId,
      paidTotal:
        sql<string>`coalesce(sum(${payments.amount} - ${payments.changeAmount}), 0)`.as(
          "paid_total",
        ),
    })
    .from(payments)
    .innerJoin(
      orders,
      and(
        eq(orders.id, payments.orderId),
        outletScoped(orders, {
          businessId: context.user.businessId,
          outletIds,
        }),
        eq(orders.vehicleId, vehicleRow.id),
      ),
    )
    .groupBy(payments.orderId)
    .as("paid_by_order");

  const [orderRows, countRows, totalsRows] = await Promise.all([
    db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        kind: orders.kind,
        status: orders.status,
        createdAt: orders.createdAt,
        completedAt: orders.completedAt,
        paidAt: orders.paidAt,
        outletId: orders.outletId,
        outletName: outlets.name,
        odometer: orders.odometer,
        total: orders.total,
      })
      .from(orders)
      .innerJoin(
        outlets,
        and(
          eq(outlets.id, orders.outletId),
          eq(outlets.businessId, context.user.businessId),
        ),
      )
      .where(and(...conditions))
      .orderBy(desc(orders.createdAt), asc(orders.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(orders)
      .where(and(...conditions)),
    db
      .select({
        visits: sql<number>`count(*) filter (where ${orders.status} <> 'VOID')`.mapWith(
          Number,
        ),
        totalSpent: sql<string>`coalesce(sum(${orders.total}) filter (where ${orders.status} <> 'VOID'), 0)`,
        // Every non-void order owes its remaining balance, matching the
        // row-level rule in `@/lib/vehicle-history` (draft/estimated included).
        outstanding: sql<string>`coalesce(sum(greatest(${orders.total} - coalesce(${paidByOrderTotals.paidTotal}, 0), 0)) filter (where ${orders.status} <> 'VOID'), 0)`,
      })
      .from(orders)
      .leftJoin(
        paidByOrderTotals,
        eq(paidByOrderTotals.orderId, orders.id),
      )
      .where(and(...conditions)),
  ]);

  const total = countRows[0]?.total ?? 0;
  const totalsRow = totalsRows[0];

  const totals = {
    visits: totalsRow?.visits ?? 0,
    totalSpent: BigInt(totalsRow?.totalSpent ?? "0"),
    outstanding: BigInt(totalsRow?.outstanding ?? "0"),
  };

  const orderIds = orderRows.map((row) => row.id);
  const [lineRows, paidByOrder] = await Promise.all([
    orderIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            orderId: orderLines.orderId,
            lineType: orderLines.lineType,
            description: orderLines.description,
            quantity: orderLines.quantity,
            lineTotal: orderLines.lineTotal,
          })
          .from(orderLines)
          .where(inArray(orderLines.orderId, orderIds))
          .orderBy(
            asc(orderLines.sortOrder),
            asc(orderLines.createdAt),
            asc(orderLines.id),
          ),
    paidTotalsForOrders(db, orderIds),
  ]);

  const linesByOrder = new Map<string, HistoryLineSource[]>();
  for (const line of lineRows) {
    const lines = linesByOrder.get(line.orderId) ?? [];
    lines.push({
      lineType: line.lineType,
      description: line.description,
      quantity: line.quantity,
      lineTotal: line.lineTotal,
    });
    linesByOrder.set(line.orderId, lines);
  }

  const ordersOnPage = orderRows.map((row) =>
    toHistoryOrder({
      id: row.id,
      orderNumber: row.orderNumber,
      kind: row.kind,
      status: row.status,
      createdAt: row.createdAt,
      completedAt: row.completedAt,
      paidAt: row.paidAt,
      outletId: row.outletId,
      outletName: row.outletName,
      odometer: row.odometer,
      total: row.total,
      paidTotal: paidByOrder.get(row.id) ?? 0n,
      lines: linesByOrder.get(row.id) ?? [],
    }),
  );

  return {
    vehicle: toVehicleIdentity(vehicleRow),
    orders: ordersOnPage,
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.ceil(total / query.pageSize),
    totals: {
      visits: totals.visits,
      totalSpent: totals.totalSpent.toString(),
      outstanding: totals.outstanding.toString(),
    },
    scope,
  };
}
