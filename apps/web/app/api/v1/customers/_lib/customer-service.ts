import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";

import type {
  AnonymizeCustomerRequest,
  CreateCustomerRequest,
  Customer,
  CustomerExport,
  CustomerListItem,
  CustomerListQuery,
  CustomerListResponse,
  UpdateCustomerRequest,
} from "@workshop-pos/contracts";
import {
  ANONYMIZED_CUSTOMER_NAME,
  ANONYMIZED_CUSTOMER_PHONE,
  anonymizeCustomerSchema,
  createCustomerSchema,
  maskPhone,
  normalizePhoneNumber,
  updateCustomerSchema,
} from "@workshop-pos/contracts";
import {
  auditDenial,
  AuthError,
  can,
  denialMessage,
  type AuthContext,
} from "@workshop-pos/auth";
import { idrToString } from "@workshop-pos/core";
import {
  appendAuditEntry,
  customers,
  orders,
  outlets,
  payments,
  vehicles,
  type Database,
  type OutletScope,
} from "@workshop-pos/db";

import { balanceDueOf } from "@/lib/vehicle-history";

/**
 * Customer master data, anonymization, and personal-data export
 * (FR-020, FR-025, FR-027, FR-029, PD-02, PD-04).
 *
 * Customer rows are business-level, not outlet-owned: every query is scoped by
 * `businessId` and never by an outlet the client supplied. Personal values are
 * masked in list payloads, never copied into audit entries, and erased in place
 * on anonymization while the financial rows that reference the customer stay.
 */

/** Drizzle's transaction handle is narrower than `Database` but has the same reads/writes. */
type TransactionHandle = Parameters<Parameters<Database["transaction"]>[0]>[0];

function asDatabase(tx: TransactionHandle): Database {
  return tx as unknown as Database;
}

type CustomerRow = typeof customers.$inferSelect;

/**
 * List projection: the full phone stays for `maskPhone`, but address and notes
 * never leave the database for a list request (contract drops them).
 */
const LIST_CUSTOMER_COLUMNS = {
  id: customers.id,
  name: customers.name,
  phone: customers.phone,
  anonymizedAt: customers.anonymizedAt,
  createdAt: customers.createdAt,
  updatedAt: customers.updatedAt,
} as const;

/**
 * Business-wide scope for audit writes. Customer rows have no outlet, so the
 * audit row is stored without an outlet id; the outlet list only satisfies the
 * helper's business-membership guard (and always contains an active outlet for
 * a working tenant).
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

function toCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    address: row.address,
    notes: row.notes,
    anonymizedAt: row.anonymizedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

type CustomerListRow = Pick<
  CustomerRow,
  | "id"
  | "name"
  | "phone"
  | "anonymizedAt"
  | "createdAt"
  | "updatedAt"
>;

function toListItem(
  row: CustomerListRow,
  vehicleCount: number,
): CustomerListItem {
  return {
    id: row.id,
    name: row.name,
    phoneMasked: maskPhone(row.phone),
    anonymizedAt: row.anonymizedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    vehicleCount,
  };
}

function listConditions(
  businessId: string,
  query: CustomerListQuery,
) {
  const conditions = [
    eq(customers.businessId, businessId),
    isNull(customers.deletedAt),
  ];

  const term = query.q?.trim();
  if (term) {
    const pattern = containsPattern(term);
    // A formatted phone ("+62 812-3456") only matches the canonical column
    // after normalization; keep the raw clause for partial digit searches.
    const normalizedPhone = normalizePhoneNumber(term);
    const match = or(
      ilike(customers.name, pattern),
      ilike(customers.phone, pattern),
      normalizedPhone.length > 0 && normalizedPhone !== term
        ? ilike(customers.phone, containsPattern(normalizedPhone))
        : undefined,
    );
    if (match) conditions.push(match);
  }

  return conditions;
}

/** One business-scoped page; the response never carries a full phone number. */
export async function listCustomers(
  db: Database,
  context: AuthContext,
  query: CustomerListQuery,
): Promise<CustomerListResponse> {
  const businessId = context.user.businessId;
  const conditions = listConditions(businessId, query);

  const [rows, countRows] = await Promise.all([
    db
      .select({
        ...LIST_CUSTOMER_COLUMNS,
        vehicleCount: sql<number>`count(${vehicles.id})`.mapWith(Number),
      })
      .from(customers)
      .leftJoin(
        vehicles,
        and(
          eq(vehicles.customerId, customers.id),
          eq(vehicles.businessId, customers.businessId),
          isNull(vehicles.deletedAt),
        ),
      )
      .where(and(...conditions))
      .groupBy(customers.id)
      .orderBy(
        query.dir === "asc"
          ? asc(query.sort === "name" ? customers.name : customers.updatedAt)
          : desc(query.sort === "name" ? customers.name : customers.updatedAt),
        asc(customers.id),
      )
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(customers)
      .where(and(...conditions)),
  ]);

  const total = countRows[0]?.total ?? 0;

  return {
    items: rows.map((row) => toListItem(row, row.vehicleCount)),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.ceil(total / query.pageSize),
  };
}

/**
 * Full record, including the phone, for the edit screen. Management-only: the
 * list already answers every read the floor roles need, and an unredacted
 * personal profile is exactly the payload PD-02 keeps off their screens.
 */
export async function getCustomer(
  db: Database,
  context: AuthContext,
  id: string,
): Promise<Customer> {
  if (!can(context.user.role, "manage_customers")) {
    await auditDenial(db, context, {
      action: "manage_customers",
      entityType: "customer",
      entityId: id,
    });
    throw AuthError.forbidden(denialMessage("manage_customers"));
  }

  const [row] = await db
    .select()
    .from(customers)
    .where(
      and(
        eq(customers.id, id),
        eq(customers.businessId, context.user.businessId),
        isNull(customers.deletedAt),
      ),
    )
    .limit(1);

  if (!row) throw AuthError.notFound("Pelanggan tidak ditemukan.");
  return toCustomer(row);
}

export async function createCustomer(
  db: Database,
  context: AuthContext,
  input: CreateCustomerRequest,
): Promise<Customer> {
  if (!can(context.user.role, "manage_customers")) {
    // No row exists yet, so the audit target is the attempted-create sentinel.
    await auditDenial(db, context, {
      action: "manage_customers",
      entityType: "customer",
      entityId: "new",
    });
    throw AuthError.forbidden(denialMessage("manage_customers"));
  }

  const parsed = parseInput(createCustomerSchema, input);
  const businessId = context.user.businessId;
  const fields = Object.keys(parsed).sort();

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(customers)
      .values({
        businessId,
        name: parsed.name,
        phone: parsed.phone,
        address: parsed.address ?? null,
        notes: parsed.notes ?? null,
      })
      .returning();

    if (!created) throw new Error("Customer insert returned no row");

    await appendAuditEntry(asDatabase(tx), await auditScope(asDatabase(tx), context), {
      action: "customer.created",
      entityType: "customer",
      entityId: created.id,
      actorId: context.user.id,
      // Field names only: audit rows must never hold personal values (PD-02).
      after: { fields },
    });

    return toCustomer(created);
  });
}

export async function updateCustomer(
  db: Database,
  context: AuthContext,
  id: string,
  input: UpdateCustomerRequest,
): Promise<Customer> {
  if (!can(context.user.role, "manage_customers")) {
    await auditDenial(db, context, {
      action: "manage_customers",
      entityType: "customer",
      entityId: id,
    });
    throw AuthError.forbidden(denialMessage("manage_customers"));
  }

  const parsed = parseInput(updateCustomerSchema, input);
  const businessId = context.user.businessId;

  const result = await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.id, id),
          eq(customers.businessId, businessId),
          isNull(customers.deletedAt),
        ),
      )
      .limit(1)
      .for("update");

    if (!current) throw AuthError.notFound("Pelanggan tidak ditemukan.");
    if (current.anonymizedAt !== null) {
      throw AuthError.conflict(
        "Pelanggan sudah dianonimkan sehingga datanya tidak dapat diubah.",
      );
    }

    const name = parsed.name ?? current.name;
    const phone = parsed.phone ?? current.phone;
    const address =
      parsed.address === undefined ? current.address : parsed.address;
    const notes = parsed.notes === undefined ? current.notes : parsed.notes;

    const fields: string[] = [];
    if (name !== current.name) fields.push("name");
    if (phone !== current.phone) fields.push("phone");
    if (address !== current.address) fields.push("address");
    if (notes !== current.notes) fields.push("notes");

    if (fields.length === 0) return toCustomer(current);

    const [updated] = await tx
      .update(customers)
      .set({
        name,
        phone,
        address,
        notes,
        updatedAt: new Date(),
      })
      .where(
        and(eq(customers.id, current.id), eq(customers.businessId, businessId)),
      )
      .returning();

    if (!updated) throw new Error("Customer update returned no row");

    await appendAuditEntry(asDatabase(tx), await auditScope(asDatabase(tx), context), {
      action: "customer.updated",
      entityType: "customer",
      entityId: updated.id,
      actorId: context.user.id,
      before: { fields },
      after: { fields },
    });

    return toCustomer(updated);
  });

  return result;
}

/**
 * Irreversible erasure of the personal fields (PD-04). Vehicles and orders are
 * untouched, so financial history survives; the audit entry records only the
 * anonymized timestamp and the field names, never the erased values.
 */
export async function anonymizeCustomer(
  db: Database,
  context: AuthContext,
  id: string,
  input: AnonymizeCustomerRequest,
): Promise<Customer> {
  if (!can(context.user.role, "manage_personal_data")) {
    await auditDenial(db, context, {
      action: "manage_personal_data",
      entityType: "customer",
      entityId: id,
    });
    throw AuthError.forbidden(denialMessage("manage_personal_data"));
  }

  const { reason } = parseInput(anonymizeCustomerSchema, input);
  const businessId = context.user.businessId;

  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.id, id),
          eq(customers.businessId, businessId),
          isNull(customers.deletedAt),
        ),
      )
      .limit(1)
      .for("update");

    if (!current) throw AuthError.notFound("Pelanggan tidak ditemukan.");
    if (current.anonymizedAt !== null) {
      throw AuthError.conflict("Pelanggan sudah dianonimkan.");
    }

    const anonymizedAt = new Date();
    const [updated] = await tx
      .update(customers)
      .set({
        name: ANONYMIZED_CUSTOMER_NAME,
        phone: ANONYMIZED_CUSTOMER_PHONE,
        address: null,
        notes: null,
        anonymizedAt,
        updatedAt: anonymizedAt,
      })
      .where(
        and(eq(customers.id, current.id), eq(customers.businessId, businessId)),
      )
      .returning();

    if (!updated) throw new Error("Customer anonymization returned no row");

    await appendAuditEntry(asDatabase(tx), await auditScope(asDatabase(tx), context), {
      action: "customer.anonymized",
      entityType: "customer",
      entityId: updated.id,
      actorId: context.user.id,
      before: { anonymizedAt: null },
      after: {
        anonymizedAt: anonymizedAt.toISOString(),
        fields: ["name", "phone", "address", "notes"],
      },
      reason,
    });

    return toCustomer(updated);
  });
}

/**
 * Full personal-data export (FR-029): the customer, their vehicles, and every
 * order linked to the customer row, newest first. Orders are matched by
 * `customerId` only: a vehicle moved to another customer must not drag the
 * previous owner's financial rows into the new owner's export.
 * The audit entry stores only counts and the format version.
 */
export async function exportCustomerPersonalData(
  db: Database,
  context: AuthContext,
  id: string,
): Promise<CustomerExport> {
  if (!can(context.user.role, "manage_personal_data")) {
    await auditDenial(db, context, {
      action: "manage_personal_data",
      entityType: "customer",
      entityId: id,
    });
    throw AuthError.forbidden(denialMessage("manage_personal_data"));
  }

  const businessId = context.user.businessId;

  return db.transaction(async (tx) => {
    const [customer] = await tx
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.id, id),
          eq(customers.businessId, businessId),
          isNull(customers.deletedAt),
        ),
      )
      .limit(1);

    if (!customer) throw AuthError.notFound("Pelanggan tidak ditemukan.");

    const vehicleRows = await tx
      .select({
        id: vehicles.id,
        normalizedPlate: vehicles.normalizedPlate,
        brand: vehicles.brand,
        model: vehicles.model,
        year: vehicles.year,
        color: vehicles.color,
        odometer: vehicles.odometer,
        vin: vehicles.vin,
        notes: vehicles.notes,
      })
      .from(vehicles)
      .where(
        and(
          eq(vehicles.businessId, businessId),
          eq(vehicles.customerId, customer.id),
          isNull(vehicles.deletedAt),
        ),
      )
      .orderBy(asc(vehicles.normalizedPlate), asc(vehicles.id));

    // One aggregate join instead of a bind-parameter list of every order id, so
    // a long-lived customer exports without hitting the parameter ceiling.
    const paidByOrderTotals = tx
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
          eq(orders.businessId, businessId),
          eq(orders.customerId, customer.id),
        ),
      )
      .groupBy(payments.orderId)
      .as("paid_by_order");

    const orderRows = await tx
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        kind: orders.kind,
        status: orders.status,
        createdAt: orders.createdAt,
        completedAt: orders.completedAt,
        odometer: orders.odometer,
        total: orders.total,
        outletName: outlets.name,
        paidTotal: sql<string>`coalesce(${paidByOrderTotals.paidTotal}, 0)`,
      })
      .from(orders)
      .innerJoin(
        outlets,
        and(eq(outlets.id, orders.outletId), eq(outlets.businessId, businessId)),
      )
      .leftJoin(paidByOrderTotals, eq(paidByOrderTotals.orderId, orders.id))
      .where(
        and(
          eq(orders.businessId, businessId),
          eq(orders.customerId, customer.id),
        ),
      )
      .orderBy(desc(orders.createdAt), asc(orders.id));

    const exportedOrders = orderRows.map((row) => {
      const paidTotal = BigInt(row.paidTotal);
      const balanceDue =
        row.status === "VOID" ? 0n : balanceDueOf(row.total, paidTotal);

      return {
        id: row.id,
        orderNumber: row.orderNumber,
        kind: row.kind,
        status: row.status,
        outletName: row.outletName,
        createdAt: row.createdAt.toISOString(),
        completedAt: row.completedAt?.toISOString() ?? null,
        odometer: row.odometer,
        total: idrToString(row.total),
        balanceDue: idrToString(balanceDue),
      };
    });

    await appendAuditEntry(asDatabase(tx), await auditScope(asDatabase(tx), context), {
      action: "customer.exported",
      entityType: "customer",
      entityId: customer.id,
      actorId: context.user.id,
      after: {
        formatVersion: 1,
        vehicles: vehicleRows.length,
        orders: exportedOrders.length,
      },
    });

    return {
      formatVersion: 1 as const,
      exportedAt: new Date().toISOString(),
      customer: toCustomer(customer),
      vehicles: vehicleRows,
      orders: exportedOrders,
    };
  });
}
