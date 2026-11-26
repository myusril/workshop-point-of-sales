import { boolean, foreignKey, index, pgTable, text, uuid, unique } from "drizzle-orm/pg-core";
import { timestamps, uuidPrimaryKey } from "./columns.ts";

/**
 * Tenancy root. The product is installed for one business; a second business
 * tenant would reopen the scoping design (see packages/db/README.md).
 */
export const businesses = pgTable(
  "businesses",
  {
    id: uuidPrimaryKey(),
    name: text("name").notNull(),
    /** Buyer-configurable product branding (FR-071); no third-party brand assets. */
    productDisplayName: text("product_display_name"),
    timezone: text("timezone").notNull().default("Asia/Jakarta"),
    logoPath: text("logo_path"),
    ...timestamps(),
  },
  () => [],
);

export const outlets = pgTable(
  "outlets",
  {
    id: uuidPrimaryKey(),
    businessId: uuid("business_id").notNull(),
    name: text("name").notNull(),
    address: text("address"),
    phone: text("phone"),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps(),
  },
  (t) => [
    foreignKey({
      name: "outlets_business_id_businesses_id_fk",
      columns: [t.businessId],
      foreignColumns: [businesses.id],
    }).onDelete("restrict"),
    unique("outlets_business_id_name_unique").on(t.businessId, t.name),
    index("outlets_business_id_is_active_idx").on(t.businessId, t.isActive),
  ],
);
