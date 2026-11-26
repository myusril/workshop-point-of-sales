import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { authTimestamps, uuidPrimaryKey } from "./columns.ts";
import { staffRole } from "./enums.ts";
import { businesses, outlets } from "./tenancy.ts";

const utcTimestamp = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" });

/**
 * Better Auth identity tables. Column names, camelCase, and singular table
 * names follow the Better Auth default Drizzle schema and must not be
 * "normalized" to the domain convention: the adapter reads them as-is.
 */
export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("emailVerified").notNull().default(false),
    image: text("image"),
    ...authTimestamps(),
    /** Required by WP3's database hooks; every staff member belongs to the business. */
    businessId: uuid("businessId").notNull(),
    role: staffRole("role").notNull(),
    username: text("username"),
    /** Better Auth username-plugin default column. */
    displayUsername: text("displayUsername"),
    phone: text("phone").notNull(),
    deactivatedAt: utcTimestamp("deactivatedAt"),
    anonymizedAt: utcTimestamp("anonymizedAt"),
  },
  (t) => [
    unique("user_email_unique").on(t.email),
    unique("user_username_unique").on(t.username),
    foreignKey({
      name: "user_businessId_businesses_id_fk",
      columns: [t.businessId],
      foreignColumns: [businesses.id],
    }).onDelete("restrict"),
  ],
);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: utcTimestamp("expiresAt").notNull(),
    token: text("token").notNull(),
    ...authTimestamps(),
    ipAddress: text("ipAddress"),
    userAgent: text("userAgent"),
    userId: text("userId").notNull(),
    activeOutletId: uuid("activeOutletId"),
  },
  (t) => [
    unique("session_token_unique").on(t.token),
    foreignKey({
      name: "session_userId_user_id_fk",
      columns: [t.userId],
      foreignColumns: [user.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "session_activeOutletId_outlets_id_fk",
      columns: [t.activeOutletId],
      foreignColumns: [outlets.id],
    }).onDelete("set null"),
    index("session_user_id_idx").on(t.userId),
  ],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("accountId").notNull(),
    providerId: text("providerId").notNull(),
    userId: text("userId").notNull(),
    accessToken: text("accessToken"),
    refreshToken: text("refreshToken"),
    idToken: text("idToken"),
    accessTokenExpiresAt: utcTimestamp("accessTokenExpiresAt"),
    refreshTokenExpiresAt: utcTimestamp("refreshTokenExpiresAt"),
    scope: text("scope"),
    /** Better Auth password hash only. Plaintext is never written here. */
    password: text("password"),
    ...authTimestamps(),
  },
  (t) => [
    unique("account_provider_id_account_id_unique").on(t.providerId, t.accountId),
    foreignKey({
      name: "account_userId_user_id_fk",
      columns: [t.userId],
      foreignColumns: [user.id],
    }).onDelete("cascade"),
  ],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: utcTimestamp("expiresAt").notNull(),
    ...authTimestamps(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

export const staffOutlets = pgTable(
  "staff_outlets",
  {
    id: uuidPrimaryKey(),
    userId: text("user_id").notNull(),
    outletId: uuid("outlet_id").notNull(),
    createdAt: utcTimestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique("staff_outlets_user_id_outlet_id_unique").on(t.userId, t.outletId),
    foreignKey({
      name: "staff_outlets_user_id_user_id_fk",
      columns: [t.userId],
      foreignColumns: [user.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "staff_outlets_outlet_id_outlets_id_fk",
      columns: [t.outletId],
      foreignColumns: [outlets.id],
    }).onDelete("restrict"),
    index("staff_outlets_outlet_id_idx").on(t.outletId),
  ],
);

export const deviceTokens = pgTable(
  "device_tokens",
  {
    id: uuidPrimaryKey(),
    userId: text("user_id").notNull(),
    outletId: uuid("outlet_id"),
    /** SHA-256 hex digest only; the raw bearer token is never stored. */
    tokenHash: text("token_hash").notNull(),
    label: text("label"),
    expiresAt: utcTimestamp("expires_at"),
    lastUsedAt: utcTimestamp("last_used_at"),
    revokedAt: utcTimestamp("revoked_at"),
    createdAt: utcTimestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique("device_tokens_token_hash_unique").on(t.tokenHash),
    foreignKey({
      name: "device_tokens_user_id_user_id_fk",
      columns: [t.userId],
      foreignColumns: [user.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "device_tokens_outlet_id_outlets_id_fk",
      columns: [t.outletId],
      foreignColumns: [outlets.id],
    }).onDelete("set null"),
    check(
      "device_tokens_token_hash_sha256_hex",
      sql`${t.tokenHash} ~ '^[0-9a-f]{64}$'`,
    ),
    index("device_tokens_user_id_revoked_at_idx").on(t.userId, t.revokedAt),
  ],
);

/**
 * Login-attempt counters for WP3 rate limiting. Mutable operational data,
 * not a ledger: it stores the normalized identifier only and never a password
 * or token. Retention is owned by WP3/ops.
 */
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: uuidPrimaryKey(),
    identifier: text("identifier").notNull(),
    succeeded: boolean("succeeded").notNull().default(false),
    attemptedAt: utcTimestamp("attempted_at").notNull().defaultNow(),
    userId: text("user_id"),
  },
  (t) => [
    foreignKey({
      name: "login_attempts_user_id_user_id_fk",
      columns: [t.userId],
      foreignColumns: [user.id],
    }).onDelete("set null"),
    index("login_attempts_identifier_attempted_at_idx").on(t.identifier, t.attemptedAt),
  ],
);
