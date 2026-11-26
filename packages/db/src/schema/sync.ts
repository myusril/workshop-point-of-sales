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
import { deviceTokens, user } from "./auth.ts";
import { timestamps, uuidPrimaryKey } from "./columns.ts";
import { syncConflictCode, syncState } from "./enums.ts";
import { orders } from "./orders.ts";
import { businesses, outlets } from "./tenancy.ts";

/**
 * Offline sync-key registry (WP7 surfaces conflicts; this table records them).
 * `client_key` is unique per business, so a retried upload maps to one sale.
 */
export const syncKeys = pgTable(
  "sync_keys",
  {
    id: uuidPrimaryKey(),
    businessId: uuid("business_id").notNull(),
    outletId: uuid("outlet_id").notNull(),
    deviceTokenId: uuid("device_token_id"),
    clientKey: text("client_key").notNull(),
    orderId: uuid("order_id"),
    state: syncState("state").notNull().default("QUEUED"),
    conflictCode: syncConflictCode("conflict_code"),
    deviceRecordedAt: timestamp("device_recorded_at", {
      withTimezone: true,
      mode: "date",
    }),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true, mode: "date" }),
    appliedAt: timestamp("applied_at", { withTimezone: true, mode: "date" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "date" }),
    resolvedBy: text("resolved_by"),
    ...timestamps(),
  },
  (t) => [
    foreignKey({
      name: "sync_keys_business_id_businesses_id_fk",
      columns: [t.businessId],
      foreignColumns: [businesses.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "sync_keys_outlet_id_outlets_id_fk",
      columns: [t.outletId],
      foreignColumns: [outlets.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "sync_keys_device_token_id_device_tokens_id_fk",
      columns: [t.deviceTokenId],
      foreignColumns: [deviceTokens.id],
    }).onDelete("set null"),
    foreignKey({
      name: "sync_keys_order_id_orders_id_fk",
      columns: [t.orderId],
      foreignColumns: [orders.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "sync_keys_resolved_by_user_id_fk",
      columns: [t.resolvedBy],
      foreignColumns: [user.id],
    }).onDelete("restrict"),
    check("sync_keys_attempt_count_non_negative", sql`${t.attemptCount} >= 0`),
    check(
      "sync_keys_conflict_requires_code",
      sql`${t.state} <> 'CONFLICT' or ${t.conflictCode} is not null`,
    ),
    unique("sync_keys_business_id_client_key_unique").on(t.businessId, t.clientKey),
    index("sync_keys_business_id_state_idx").on(t.businessId, t.state),
    index("sync_keys_outlet_id_state_idx").on(t.outletId, t.state),
    index("sync_keys_device_token_id_idx").on(t.deviceTokenId),
  ],
);
