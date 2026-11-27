/**
 * Local SQLite schema (expo-sqlite on device, node:sqlite in tests).
 *
 * Money is stored as canonical integer-rupiah strings, never REAL. The outbox
 * row is created in the same transaction as its local order, so a crash can
 * never leave a paid sale without its sync work item (FR-041).
 */
export const SCHEMA_VERSION = 1;

export const SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS cache_state (
    key TEXT PRIMARY KEY,
    outlet_id TEXT NOT NULL,
    cached_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS cached_catalog (
    id TEXT PRIMARY KEY,
    outlet_id TEXT NOT NULL,
    item_type TEXT NOT NULL CHECK (item_type IN ('PRODUCT', 'SERVICE')),
    name TEXT NOT NULL,
    code TEXT,
    price TEXT NOT NULL,
    unit TEXT,
    stock_on_hand INTEGER,
    low_stock_threshold INTEGER,
    is_low_stock INTEGER,
    is_active INTEGER NOT NULL,
    duration_minutes INTEGER,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS cached_catalog_outlet_idx
    ON cached_catalog (outlet_id, item_type, name)`,
  `CREATE TABLE IF NOT EXISTS cached_customers (
    id TEXT PRIMARY KEY,
    outlet_id TEXT NOT NULL,
    name TEXT NOT NULL,
    phone_masked TEXT NOT NULL,
    vehicle_count INTEGER NOT NULL,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS cached_customers_outlet_idx
    ON cached_customers (outlet_id, name)`,
  `CREATE TABLE IF NOT EXISTS cached_vehicles (
    id TEXT PRIMARY KEY,
    outlet_id TEXT NOT NULL,
    plate TEXT NOT NULL,
    brand TEXT NOT NULL,
    model TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS cached_vehicles_outlet_idx
    ON cached_vehicles (outlet_id, plate)`,
  `CREATE TABLE IF NOT EXISTS cached_vehicle_history (
    vehicle_id TEXT PRIMARY KEY,
    outlet_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    cached_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS outlet_settings (
    outlet_id TEXT PRIMARY KEY,
    tax_rate INTEGER NOT NULL,
    paper_width INTEGER NOT NULL CHECK (paper_width IN (58, 80)),
    cashier_discount_cap_percent INTEGER NOT NULL,
    void_reason_min_length INTEGER NOT NULL,
    receipt_header_text TEXT,
    receipt_footer_text TEXT,
    source TEXT NOT NULL,
    cached_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS local_orders (
    client_key TEXT PRIMARY KEY,
    outlet_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    receipt TEXT NOT NULL,
    display TEXT NOT NULL,
    device_recorded_at TEXT NOT NULL,
    print_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS outbox (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    client_key TEXT NOT NULL UNIQUE REFERENCES local_orders (client_key) ON DELETE CASCADE,
    state TEXT NOT NULL CHECK (
      state IN ('QUEUED', 'SENDING', 'RETRY', 'CONFLICT', 'APPLIED', 'FAILED', 'VOIDED')
    ),
    attempt_count INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TEXT,
    last_attempt_at TEXT,
    last_error TEXT,
    server_order_id TEXT,
    server_order_number TEXT,
    applied_at TEXT,
    conflict_code TEXT,
    conflict_json TEXT,
    notices_json TEXT,
    resolved_at TEXT,
    resolution TEXT,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS outbox_state_idx ON outbox (state, seq)`,
  `CREATE TABLE IF NOT EXISTS cached_orders (
    id TEXT PRIMARY KEY,
    outlet_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    detail INTEGER NOT NULL DEFAULT 0,
    cached_at TEXT NOT NULL
  )`,
];

export const PERSONAL_DATA_TABLES: readonly string[] = [
  "cached_customers",
  "cached_vehicles",
  "cached_vehicle_history",
  "cached_orders",
  "local_orders",
  "outbox",
  "cache_state",
  "outlet_settings",
];
