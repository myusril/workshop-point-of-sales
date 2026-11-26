import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth.ts";
import { timestamps, uuidPrimaryKey } from "./columns.ts";
import { paymentMethod } from "./enums.ts";
import { orders } from "./orders.ts";

const utcTimestamp = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" });

export const payments = pgTable(
  "payments",
  {
    id: uuidPrimaryKey(),
    orderId: uuid("order_id").notNull(),
    method: paymentMethod("method").notNull(),
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    changeAmount: bigint("change_amount", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    referenceNote: text("reference_note"),
    receivedAt: utcTimestamp("received_at").notNull().defaultNow(),
    createdBy: text("created_by").notNull(),
    ...timestamps(),
  },
  (t) => [
    foreignKey({
      name: "payments_order_id_orders_id_fk",
      columns: [t.orderId],
      foreignColumns: [orders.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "payments_created_by_user_id_fk",
      columns: [t.createdBy],
      foreignColumns: [user.id],
    }).onDelete("restrict"),
    check("payments_amount_positive", sql`${t.amount} > 0`),
    check("payments_change_amount_non_negative", sql`${t.changeAmount} >= 0`),
    check(
      "payments_non_cash_has_no_change",
      sql`${t.method} = 'CASH' or ${t.changeAmount} = 0`,
    ),
    index("payments_order_id_idx").on(t.orderId),
    index("payments_method_received_at_idx").on(t.method, t.receivedAt),
    index("payments_received_at_idx").on(t.receivedAt),
  ],
);

/**
 * Whole-payment refunds only (BR-008). `payment_id` is required and unique, so
 * a refund always reverses one payment and a payment cannot be refunded twice.
 * The insert trigger additionally requires the amount, method, and order to
 * match the payment.
 */
export const refunds = pgTable(
  "refunds",
  {
    id: uuidPrimaryKey(),
    orderId: uuid("order_id").notNull(),
    paymentId: uuid("payment_id").notNull(),
    method: paymentMethod("method").notNull(),
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    reason: text("reason").notNull(),
    referenceNote: text("reference_note"),
    refundedAt: utcTimestamp("refunded_at").notNull().defaultNow(),
    createdBy: text("created_by").notNull(),
    createdAt: utcTimestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "refunds_order_id_orders_id_fk",
      columns: [t.orderId],
      foreignColumns: [orders.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "refunds_payment_id_payments_id_fk",
      columns: [t.paymentId],
      foreignColumns: [payments.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "refunds_created_by_user_id_fk",
      columns: [t.createdBy],
      foreignColumns: [user.id],
    }).onDelete("restrict"),
    check("refunds_amount_positive", sql`${t.amount} > 0`),
    unique("refunds_payment_id_unique").on(t.paymentId),
    index("refunds_order_id_idx").on(t.orderId),
  ],
);
