import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  integer,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth.ts";
import { timestamps, uuidPrimaryKey } from "./columns.ts";
import { businesses, outlets } from "./tenancy.ts";

/**
 * Per-outlet settings (FR-070). `business_id` is stored alongside the outlet
 * so every scoped read uses the same `(business_id, outlet_id)` shape.
 */
export const settings = pgTable(
  "settings",
  {
    id: uuidPrimaryKey(),
    businessId: uuid("business_id").notNull(),
    outletId: uuid("outlet_id").notNull(),
    taxRate: integer("tax_rate").notNull().default(11),
    cashierDiscountCapPercent: integer("cashier_discount_cap_percent")
      .notNull()
      .default(0),
    idleTimeoutMinutes: integer("idle_timeout_minutes").notNull().default(30),
    receiptPaperWidth: integer("receipt_paper_width").notNull().default(58),
    voidReasonMinLength: integer("void_reason_min_length").notNull().default(10),
    receiptPrefix: text("receipt_prefix").notNull().default(""),
    receiptHeaderText: text("receipt_header_text"),
    receiptFooterText: text("receipt_footer_text"),
    updatedBy: text("updated_by"),
    ...timestamps(),
  },
  (t) => [
    foreignKey({
      name: "settings_business_id_businesses_id_fk",
      columns: [t.businessId],
      foreignColumns: [businesses.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "settings_outlet_id_outlets_id_fk",
      columns: [t.outletId],
      foreignColumns: [outlets.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "settings_updated_by_user_id_fk",
      columns: [t.updatedBy],
      foreignColumns: [user.id],
    }).onDelete("restrict"),
    check("settings_tax_rate_range", sql`${t.taxRate} >= 0 and ${t.taxRate} <= 100`),
    check(
      "settings_cashier_discount_cap_range",
      sql`${t.cashierDiscountCapPercent} >= 0 and ${t.cashierDiscountCapPercent} <= 100`,
    ),
    check("settings_idle_timeout_minutes_positive", sql`${t.idleTimeoutMinutes} >= 1`),
    check(
      "settings_receipt_paper_width_supported",
      sql`${t.receiptPaperWidth} in (58, 80)`,
    ),
    check("settings_void_reason_min_length_positive", sql`${t.voidReasonMinLength} >= 1`),
    unique("settings_outlet_id_unique").on(t.outletId),
  ],
);
