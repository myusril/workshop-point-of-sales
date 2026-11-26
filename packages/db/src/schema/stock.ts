import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth.ts";
import { products } from "./catalog.ts";
import { uuidPrimaryKey } from "./columns.ts";
import { ledgerEntryType, ledgerSourceType } from "./enums.ts";
import { orderLines } from "./orders.ts";
import { businesses, outlets } from "./tenancy.ts";

/**
 * Append-only stock ledger. There is no `updated_at`: rows are immutable,
 * enforced by grants for `app_rw` and by a trigger for every role.
 * Stock-on-hand is always `sum(quantity_after - quantity_before)` in scope.
 */
export const stockLedger = pgTable(
  "stock_ledger",
  {
    id: uuidPrimaryKey(),
    businessId: uuid("business_id").notNull(),
    outletId: uuid("outlet_id").notNull(),
    productId: uuid("product_id").notNull(),
    entryType: ledgerEntryType("entry_type").notNull(),
    quantityBefore: integer("quantity_before").notNull(),
    quantityAfter: integer("quantity_after").notNull(),
    override: boolean("override").notNull().default(false),
    reason: text("reason"),
    sourceType: ledgerSourceType("source_type").notNull(),
    sourceId: uuid("source_id"),
    sourceRef: text("source_ref"),
    orderLineId: uuid("order_line_id"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "stock_ledger_business_id_businesses_id_fk",
      columns: [t.businessId],
      foreignColumns: [businesses.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "stock_ledger_outlet_id_outlets_id_fk",
      columns: [t.outletId],
      foreignColumns: [outlets.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "stock_ledger_product_id_products_id_fk",
      columns: [t.productId],
      foreignColumns: [products.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "stock_ledger_order_line_id_order_lines_id_fk",
      columns: [t.orderLineId],
      foreignColumns: [orderLines.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "stock_ledger_created_by_user_id_fk",
      columns: [t.createdBy],
      foreignColumns: [user.id],
    }).onDelete("restrict"),
    check(
      "stock_ledger_quantity_changed",
      sql`${t.quantityAfter} <> ${t.quantityBefore}`,
    ),
    check(
      "stock_ledger_override_requires_reason",
      sql`${t.override} = false or (${t.reason} is not null and length(btrim(${t.reason})) > 0)`,
    ),
    check(
      "stock_ledger_non_negative_without_override",
      sql`${t.override} = true or ${t.quantityAfter} >= 0`,
    ),
    check(
      "stock_ledger_stock_in_source_matches",
      sql`${t.entryType} <> 'STOCK_IN' or ${t.sourceType} = 'STOCK_IN'`,
    ),
    check(
      "stock_ledger_adjustment_source_matches",
      sql`${t.entryType} <> 'ADJUSTMENT' or ${t.sourceType} in ('ADJUSTMENT', 'CYCLE_COUNT')`,
    ),
    check(
      "stock_ledger_sale_requires_order_line",
      sql`${t.entryType} not in ('SALE_DECREMENT', 'SALE_REVERSAL') or (${t.sourceType} = 'ORDER' and ${t.orderLineId} is not null)`,
    ),
    check(
      "stock_ledger_order_source_requires_id",
      sql`${t.sourceType} <> 'ORDER' or ${t.sourceId} is not null`,
    ),
    uniqueIndex("stock_ledger_order_line_entry_unique")
      .on(t.orderLineId, t.entryType)
      .where(sql`${t.entryType} in ('SALE_DECREMENT', 'SALE_REVERSAL')`),
    index("stock_ledger_outlet_id_product_id_created_at_idx").on(
      t.outletId,
      t.productId,
      t.createdAt,
    ),
    index("stock_ledger_product_id_created_at_idx").on(t.productId, t.createdAt),
    index("stock_ledger_source_type_source_id_idx").on(t.sourceType, t.sourceId),
    index("stock_ledger_order_line_id_idx").on(t.orderLineId),
  ],
);
