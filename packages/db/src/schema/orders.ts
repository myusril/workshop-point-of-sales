import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth.ts";
import { products, services } from "./catalog.ts";
import { timestamps, uuidPrimaryKey } from "./columns.ts";
import { customers, vehicles } from "./customers.ts";
import { orderKind, orderLineType, orderStatus } from "./enums.ts";
import { businesses, outlets } from "./tenancy.ts";

export const orders = pgTable(
  "orders",
  {
    id: uuidPrimaryKey(),
    businessId: uuid("business_id").notNull(),
    outletId: uuid("outlet_id").notNull(),
    kind: orderKind("kind").notNull(),
    status: orderStatus("status").notNull().default("DRAFT"),
    customerId: uuid("customer_id"),
    vehicleId: uuid("vehicle_id"),
    technicianId: text("technician_id"),
    /** Odometer recorded at intake (nullable). */
    odometer: integer("odometer"),
    orderNumber: text("order_number"),
    taxRate: integer("tax_rate").notNull(),
    subtotal: bigint("subtotal", { mode: "bigint" }).notNull(),
    discountTotal: bigint("discount_total", { mode: "bigint" }).notNull(),
    taxTotal: bigint("tax_total", { mode: "bigint" }).notNull(),
    total: bigint("total", { mode: "bigint" }).notNull(),
    notes: text("notes"),
    paidAt: timestamp("paid_at", { withTimezone: true, mode: "date" }),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    voidedAt: timestamp("voided_at", { withTimezone: true, mode: "date" }),
    voidReason: text("void_reason"),
    createdBy: text("created_by").notNull(),
    ...timestamps(),
  },
  (t) => [
    foreignKey({
      name: "orders_business_id_businesses_id_fk",
      columns: [t.businessId],
      foreignColumns: [businesses.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "orders_outlet_id_outlets_id_fk",
      columns: [t.outletId],
      foreignColumns: [outlets.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "orders_customer_id_customers_id_fk",
      columns: [t.customerId],
      foreignColumns: [customers.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "orders_vehicle_id_vehicles_id_fk",
      columns: [t.vehicleId],
      foreignColumns: [vehicles.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "orders_technician_id_user_id_fk",
      columns: [t.technicianId],
      foreignColumns: [user.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "orders_created_by_user_id_fk",
      columns: [t.createdBy],
      foreignColumns: [user.id],
    }).onDelete("restrict"),
    check("orders_tax_rate_range", sql`${t.taxRate} >= 0 and ${t.taxRate} <= 100`),
    check("orders_odometer_non_negative", sql`${t.odometer} is null or ${t.odometer} >= 0`),
    check("orders_subtotal_non_negative", sql`${t.subtotal} >= 0`),
    check("orders_discount_total_non_negative", sql`${t.discountTotal} >= 0`),
    check("orders_tax_total_non_negative", sql`${t.taxTotal} >= 0`),
    check("orders_total_non_negative", sql`${t.total} >= 0`),
    check(
      "orders_service_requires_vehicle",
      sql`${t.kind} <> 'SERVICE' or ${t.vehicleId} is not null`,
    ),
    check(
      "orders_void_requires_timestamp_and_reason",
      sql`${t.status} <> 'VOID' or (${t.voidedAt} is not null and ${t.voidReason} is not null and length(btrim(${t.voidReason})) > 0)`,
    ),
    unique("orders_outlet_id_order_number_unique").on(t.outletId, t.orderNumber),
    index("orders_outlet_id_created_at_idx").on(t.outletId, t.createdAt),
    index("orders_outlet_id_status_created_at_idx").on(
      t.outletId,
      t.status,
      t.createdAt,
    ),
    index("orders_outlet_id_paid_at_idx").on(t.outletId, t.paidAt),
    index("orders_business_id_paid_at_idx").on(t.businessId, t.paidAt),
    index("orders_customer_id_idx").on(t.customerId),
    index("orders_vehicle_id_idx").on(t.vehicleId),
    index("orders_technician_id_status_idx").on(t.technicianId, t.status),
  ],
);

/**
 * Staff-visible order timeline (FR-049). Insert-only: no UPDATE/DELETE grants,
 * unlike the Owner-only `audit_log`.
 */
export const orderStatusEvents = pgTable(
  "order_status_events",
  {
    id: uuidPrimaryKey(),
    orderId: uuid("order_id").notNull(),
    fromStatus: orderStatus("from_status"),
    toStatus: orderStatus("to_status").notNull(),
    actorId: text("actor_id").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "order_status_events_order_id_orders_id_fk",
      columns: [t.orderId],
      foreignColumns: [orders.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "order_status_events_actor_id_user_id_fk",
      columns: [t.actorId],
      foreignColumns: [user.id],
    }).onDelete("restrict"),
    index("order_status_events_order_id_created_at_idx").on(t.orderId, t.createdAt),
  ],
);

export const orderLines = pgTable(
  "order_lines",
  {
    id: uuidPrimaryKey(),
    orderId: uuid("order_id").notNull(),
    lineType: orderLineType("line_type").notNull(),
    productId: uuid("product_id"),
    serviceId: uuid("service_id"),
    /** Snapshot of the description/price shown on the order (FR-016). */
    description: text("description").notNull(),
    quantity: integer("quantity").notNull(),
    unitPrice: bigint("unit_price", { mode: "bigint" }).notNull(),
    discountPercent: integer("discount_percent"),
    discountAmount: bigint("discount_amount", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    taxAmount: bigint("tax_amount", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    lineTotal: bigint("line_total", { mode: "bigint" }).notNull(),
    technicianId: text("technician_id"),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    foreignKey({
      name: "order_lines_order_id_orders_id_fk",
      columns: [t.orderId],
      foreignColumns: [orders.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "order_lines_product_id_products_id_fk",
      columns: [t.productId],
      foreignColumns: [products.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "order_lines_service_id_services_id_fk",
      columns: [t.serviceId],
      foreignColumns: [services.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "order_lines_technician_id_user_id_fk",
      columns: [t.technicianId],
      foreignColumns: [user.id],
    }).onDelete("restrict"),
    check("order_lines_quantity_positive", sql`${t.quantity} > 0`),
    check("order_lines_unit_price_non_negative", sql`${t.unitPrice} >= 0`),
    check("order_lines_line_total_non_negative", sql`${t.lineTotal} >= 0`),
    check("order_lines_discount_amount_non_negative", sql`${t.discountAmount} >= 0`),
    check("order_lines_tax_amount_non_negative", sql`${t.taxAmount} >= 0`),
    check(
      "order_lines_discount_percent_range",
      sql`${t.discountPercent} is null or (${t.discountPercent} >= 0 and ${t.discountPercent} <= 100)`,
    ),
    check(
      "order_lines_exactly_one_catalog_item",
      sql`(${t.lineType} = 'PRODUCT' and ${t.productId} is not null and ${t.serviceId} is null) or (${t.lineType} = 'SERVICE' and ${t.serviceId} is not null and ${t.productId} is null)`,
    ),
    check(
      "order_lines_discount_within_line_value",
      sql`${t.discountAmount} <= ${t.quantity} * ${t.unitPrice}`,
    ),
    index("order_lines_order_id_idx").on(t.orderId),
    index("order_lines_product_id_idx").on(t.productId),
    index("order_lines_service_id_idx").on(t.serviceId),
  ],
);
