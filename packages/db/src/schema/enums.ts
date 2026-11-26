import { pgEnum } from "drizzle-orm/pg-core";

export const staffRole = pgEnum("staff_role", [
  "OWNER",
  "ADMIN",
  "CASHIER",
  "MECHANIC",
]);

export const orderStatus = pgEnum("order_status", [
  "DRAFT",
  "ESTIMATED",
  "APPROVED",
  "IN_PROGRESS",
  "COMPLETED",
  "PAID",
  "VOID",
]);

export const orderKind = pgEnum("order_kind", ["SALE", "SERVICE"]);

export const orderLineType = pgEnum("order_line_type", ["PRODUCT", "SERVICE"]);

export const paymentMethod = pgEnum("payment_method", ["CASH", "TRANSFER", "QRIS"]);

export const ledgerEntryType = pgEnum("ledger_entry_type", [
  "STOCK_IN",
  "ADJUSTMENT",
  "SALE_DECREMENT",
  "SALE_REVERSAL",
]);

export const ledgerSourceType = pgEnum("ledger_source_type", [
  "ORDER",
  "STOCK_IN",
  "ADJUSTMENT",
  "CYCLE_COUNT",
]);

export const syncState = pgEnum("sync_state", ["QUEUED", "APPLIED", "CONFLICT"]);

export const syncConflictCode = pgEnum("sync_conflict_code", [
  "STOCK_INSUFFICIENT",
  "PRICE_CHANGED",
  "PLATE_REASSIGNED",
  "CASH_REPORTING",
]);
