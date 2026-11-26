import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
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
import { timestamps, uuidPrimaryKey } from "./columns.ts";
import { businesses, outlets } from "./tenancy.ts";

/**
 * Stock-on-hand is intentionally absent: it is derived from `stock_ledger`
 * (FR-018/FR-050, BR-005). Never add a mutable stock column here.
 */
export const products = pgTable(
  "products",
  {
    id: uuidPrimaryKey(),
    businessId: uuid("business_id").notNull(),
    outletId: uuid("outlet_id").notNull(),
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    unit: text("unit").notNull().default("pcs"),
    cost: bigint("cost", { mode: "bigint" }).notNull(),
    price: bigint("price", { mode: "bigint" }).notNull(),
    lowStockThreshold: integer("low_stock_threshold"),
    isActive: boolean("is_active").notNull().default(true),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
    ...timestamps(),
  },
  (t) => [
    foreignKey({
      name: "products_business_id_businesses_id_fk",
      columns: [t.businessId],
      foreignColumns: [businesses.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "products_outlet_id_outlets_id_fk",
      columns: [t.outletId],
      foreignColumns: [outlets.id],
    }).onDelete("restrict"),
    check("products_cost_non_negative", sql`${t.cost} >= 0`),
    check("products_price_non_negative", sql`${t.price} >= 0`),
    check(
      "products_low_stock_threshold_non_negative",
      sql`${t.lowStockThreshold} is null or ${t.lowStockThreshold} >= 0`,
    ),
    check(
      "products_soft_delete_implies_inactive",
      sql`${t.deletedAt} is null or ${t.isActive} = false`,
    ),
    unique("products_outlet_id_sku_unique").on(t.outletId, t.sku),
    index("products_outlet_id_is_active_idx").on(t.outletId, t.isActive),
    index("products_business_id_idx").on(t.businessId),
  ],
);

export const services = pgTable(
  "services",
  {
    id: uuidPrimaryKey(),
    businessId: uuid("business_id").notNull(),
    outletId: uuid("outlet_id").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    price: bigint("price", { mode: "bigint" }).notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
    ...timestamps(),
  },
  (t) => [
    foreignKey({
      name: "services_business_id_businesses_id_fk",
      columns: [t.businessId],
      foreignColumns: [businesses.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "services_outlet_id_outlets_id_fk",
      columns: [t.outletId],
      foreignColumns: [outlets.id],
    }).onDelete("restrict"),
    check("services_price_non_negative", sql`${t.price} >= 0`),
    check("services_duration_minutes_positive", sql`${t.durationMinutes} > 0`),
    check(
      "services_soft_delete_implies_inactive",
      sql`${t.deletedAt} is null or ${t.isActive} = false`,
    ),
    unique("services_outlet_id_code_unique").on(t.outletId, t.code),
    index("services_outlet_id_is_active_idx").on(t.outletId, t.isActive),
  ],
);
