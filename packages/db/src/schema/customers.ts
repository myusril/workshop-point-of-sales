import { sql } from "drizzle-orm";
import {
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
import { businesses } from "./tenancy.ts";

export const customers = pgTable(
  "customers",
  {
    id: uuidPrimaryKey(),
    businessId: uuid("business_id").notNull(),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    address: text("address"),
    notes: text("notes"),
    anonymizedAt: timestamp("anonymized_at", { withTimezone: true, mode: "date" }),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
    ...timestamps(),
  },
  (t) => [
    foreignKey({
      name: "customers_business_id_businesses_id_fk",
      columns: [t.businessId],
      foreignColumns: [businesses.id],
    }).onDelete("restrict"),
    index("customers_business_id_phone_idx").on(t.businessId, t.phone),
    index("customers_business_id_name_idx").on(t.businessId, t.name),
  ],
);

/**
 * Vehicles are keyed by normalized plate: uppercase A-Z/0-9 only, whitespace
 * stripped, unique per business (BR-006).
 */
export const vehicles = pgTable(
  "vehicles",
  {
    id: uuidPrimaryKey(),
    businessId: uuid("business_id").notNull(),
    customerId: uuid("customer_id").notNull(),
    normalizedPlate: text("normalized_plate").notNull(),
    brand: text("brand").notNull(),
    model: text("model").notNull(),
    year: integer("year"),
    color: text("color"),
    odometer: integer("odometer"),
    vin: text("vin"),
    notes: text("notes"),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
    ...timestamps(),
  },
  (t) => [
    foreignKey({
      name: "vehicles_business_id_businesses_id_fk",
      columns: [t.businessId],
      foreignColumns: [businesses.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "vehicles_customer_id_customers_id_fk",
      columns: [t.customerId],
      foreignColumns: [customers.id],
    }).onDelete("restrict"),
    check(
      "vehicles_normalized_plate_format",
      sql`${t.normalizedPlate} ~ '^[A-Z0-9]+$'`,
    ),
    check(
      "vehicles_year_range",
      sql`${t.year} is null or (${t.year} >= 1886 and ${t.year} <= 2200)`,
    ),
    check(
      "vehicles_odometer_non_negative",
      sql`${t.odometer} is null or ${t.odometer} >= 0`,
    ),
    unique("vehicles_business_id_normalized_plate_unique").on(
      t.businessId,
      t.normalizedPlate,
    ),
    index("vehicles_customer_id_idx").on(t.customerId),
  ],
);
