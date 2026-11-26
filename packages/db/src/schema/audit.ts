import {
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth.ts";
import { uuidPrimaryKey } from "./columns.ts";
import { businesses, outlets } from "./tenancy.ts";

/**
 * Append-only, Owner-only audit log (FR-069, AC20.2). No `updated_at`:
 * grants plus the append-only trigger make rows immutable.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuidPrimaryKey(),
    businessId: uuid("business_id").notNull(),
    outletId: uuid("outlet_id"),
    /** Null actor means a system-initiated action. */
    actorId: text("actor_id"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "audit_log_business_id_businesses_id_fk",
      columns: [t.businessId],
      foreignColumns: [businesses.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "audit_log_outlet_id_outlets_id_fk",
      columns: [t.outletId],
      foreignColumns: [outlets.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "audit_log_actor_id_user_id_fk",
      columns: [t.actorId],
      foreignColumns: [user.id],
    }).onDelete("restrict"),
    index("audit_log_business_id_created_at_idx").on(t.businessId, t.createdAt),
    index("audit_log_entity_type_entity_id_idx").on(t.entityType, t.entityId),
    index("audit_log_actor_id_created_at_idx").on(t.actorId, t.createdAt),
    index("audit_log_action_created_at_idx").on(t.action, t.createdAt),
    index("audit_log_outlet_id_created_at_idx").on(t.outletId, t.createdAt),
  ],
);
