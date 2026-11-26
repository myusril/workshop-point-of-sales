import { timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Domain tables use UTC `timestamptz` columns with snake_case names.
 * A function (not a shared object) so every table owns its own column builders.
 */
export function timestamps() {
  return {
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  };
}

/**
 * Better Auth owns camelCase timestamps on its own tables. Keep that naming:
 * the auth adapter reads these column names directly.
 */
export function authTimestamps() {
  return {
    createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  };
}

export function uuidPrimaryKey() {
  return uuid("id").primaryKey().defaultRandom();
}
