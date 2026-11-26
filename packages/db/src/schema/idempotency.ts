import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { timestamps, uuidPrimaryKey } from "./columns.ts";
import { orders } from "./orders.ts";
import { businesses } from "./tenancy.ts";

/**
 * Idempotency registry (BR-011). `key` is unique per business; a replay
 * returns the stored response and creates no duplicate order/payment/ledger
 * row. `request_hash` is a SHA-256 hex digest of the canonical request.
 */
export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: uuidPrimaryKey(),
    businessId: uuid("business_id").notNull(),
    key: text("key").notNull(),
    operation: text("operation").notNull(),
    requestHash: text("request_hash").notNull(),
    orderId: uuid("order_id"),
    responseStatus: integer("response_status"),
    responseBody: jsonb("response_body"),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    ...timestamps(),
  },
  (t) => [
    foreignKey({
      name: "idempotency_keys_business_id_businesses_id_fk",
      columns: [t.businessId],
      foreignColumns: [businesses.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "idempotency_keys_order_id_orders_id_fk",
      columns: [t.orderId],
      foreignColumns: [orders.id],
    }).onDelete("restrict"),
    unique("idempotency_keys_business_id_key_unique").on(t.businessId, t.key),
    check(
      "idempotency_keys_request_hash_sha256_hex",
      sql`${t.requestHash} ~ '^[0-9a-f]{64}$'`,
    ),
    index("idempotency_keys_business_id_created_at_idx").on(
      t.businessId,
      t.createdAt,
    ),
  ],
);
