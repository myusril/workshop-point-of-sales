import { DEFAULT_TAX_RATE_PERCENT } from "@workshop-pos/core";
import type { SyncApplyRequest, SyncConflictDetail, SyncResult } from "@workshop-pos/contracts";

import type { SqlDatabase, SqlParam } from "./executor";
import { PERSONAL_DATA_TABLES, SCHEMA_STATEMENTS } from "./schema";

/** Local persistence for the offline cache and the sync outbox. */

export interface CachedCatalogItem {
  itemType: "PRODUCT" | "SERVICE";
  id: string;
  outletId: string;
  name: string;
  code: string | null;
  price: string;
  unit: string | null;
  stockOnHand: number | null;
  lowStockThreshold: number | null;
  isLowStock: boolean;
  isActive: boolean;
  durationMinutes: number | null;
  updatedAt: string;
}

export interface CachedCustomer {
  id: string;
  name: string;
  phoneMasked: string;
  vehicleCount: number;
  updatedAt: string;
}

export interface CachedVehicle {
  id: string;
  plate: string;
  brand: string;
  model: string;
  customerId: string;
  customerName: string;
  updatedAt: string;
}

export interface OutletSettings {
  outletId: string;
  taxRate: number;
  paperWidth: 58 | 80;
  cashierDiscountCapPercent: number;
  voidReasonMinLength: number;
  headerText: string | null;
  footerText: string | null;
  /** `SERVER` means it came from a server order snapshot; `DEFAULT` is the documented default. */
  source: "SERVER" | "DEFAULT";
  cachedAt: string;
}

export interface ReceiptLineSnapshot {
  lineType: "PRODUCT" | "SERVICE";
  description: string;
  quantity: number;
  unitPrice: string;
  discountAmount: string;
  lineTotal: string;
}

export interface ReceiptPaymentSnapshot {
  method: "CASH" | "TRANSFER" | "QRIS";
  amount: string;
  changeAmount: string;
}

export interface ReceiptSnapshot {
  paperWidth: 58 | 80;
  outletName: string;
  headerText: string | null;
  footerText: string | null;
  localNumber: string;
  deviceRecordedAt: string;
  cashierName: string;
  customerName: string | null;
  vehiclePlate: string | null;
  vehicleLabel: string | null;
  technicianName: string | null;
  lines: ReceiptLineSnapshot[];
  subtotal: string;
  discountTotal: string;
  taxRatePercent: number;
  taxTotal: string;
  total: string;
  payments: ReceiptPaymentSnapshot[];
  changeTotal: string;
}

export interface LocalOrderDisplay {
  localNumber: string;
  total: string;
  changeTotal: string;
  lineCount: number;
  customerName: string | null;
  vehiclePlate: string | null;
}

export type OutboxState =
  | "QUEUED"
  | "SENDING"
  | "RETRY"
  | "CONFLICT"
  | "APPLIED"
  | "FAILED"
  | "VOIDED";

export interface QueueRow {
  seq: number;
  clientKey: string;
  outletId: string;
  state: OutboxState;
  attemptCount: number;
  nextAttemptAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  serverOrderId: string | null;
  serverOrderNumber: string | null;
  appliedAt: string | null;
  conflictCode: string | null;
  conflict: SyncConflictDetail | null;
  notices: SyncConflictDetail[];
  resolvedAt: string | null;
  resolution: "OVERRIDE" | "VOID" | null;
  deviceRecordedAt: string;
  createdAt: string;
  printCount: number;
  display: LocalOrderDisplay;
  payload: SyncApplyRequest;
}

interface OutboxDbRow {
  seq: number;
  client_key: string;
  outlet_id: string;
  state: OutboxState;
  attempt_count: number;
  next_attempt_at: string | null;
  last_attempt_at: string | null;
  last_error: string | null;
  server_order_id: string | null;
  server_order_number: string | null;
  applied_at: string | null;
  conflict_code: string | null;
  conflict_json: string | null;
  notices_json: string | null;
  resolved_at: string | null;
  resolution: "OVERRIDE" | "VOID" | null;
  device_recorded_at: string;
  created_at: string;
  print_count: number;
  display_json: string;
  payload_json: string;
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (value === null) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export async function migrate(db: SqlDatabase): Promise<void> {
  for (const statement of SCHEMA_STATEMENTS) {
    await db.exec(statement);
  }
}

export async function getMeta(db: SqlDatabase, key: string): Promise<string | null> {
  const rows = await db.all<{ value: string }>("SELECT value FROM meta WHERE key = ?", [key]);
  return rows[0]?.value ?? null;
}

export async function setMeta(db: SqlDatabase, key: string, value: string): Promise<void> {
  await db.run(
    "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
    [key, value],
  );
}

export async function markCacheRefreshed(
  db: SqlDatabase,
  key: string,
  outletId: string,
  cachedAt: string,
): Promise<void> {
  await db.run(
    "INSERT INTO cache_state (key, outlet_id, cached_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET outlet_id = excluded.outlet_id, cached_at = excluded.cached_at",
    [key, outletId, cachedAt],
  );
}

export async function getCacheRefreshed(
  db: SqlDatabase,
  key: string,
): Promise<{ outletId: string; cachedAt: string } | null> {
  const rows = await db.all<{ outlet_id: string; cached_at: string }>(
    "SELECT outlet_id, cached_at FROM cache_state WHERE key = ?",
    [key],
  );
  const row = rows[0];
  return row ? { outletId: row.outlet_id, cachedAt: row.cached_at } : null;
}

export async function replaceCatalog(
  db: SqlDatabase,
  outletId: string,
  items: readonly CachedCatalogItem[],
  cachedAt: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.run("DELETE FROM cached_catalog WHERE outlet_id = ?", [outletId]);
    for (const item of items) {
      await tx.run(
        `INSERT INTO cached_catalog
          (id, outlet_id, item_type, name, code, price, unit, stock_on_hand,
           low_stock_threshold, is_low_stock, is_active, duration_minutes, payload, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          item.id,
          outletId,
          item.itemType,
          item.name,
          item.code,
          item.price,
          item.unit,
          item.stockOnHand,
          item.lowStockThreshold,
          item.isLowStock ? 1 : 0,
          item.isActive ? 1 : 0,
          item.durationMinutes,
          JSON.stringify(item),
          item.updatedAt,
        ],
      );
    }
    await markCacheRefreshed(tx, "catalog", outletId, cachedAt);
  });
}

export async function listCatalog(
  db: SqlDatabase,
  outletId: string,
  options: { query?: string; itemType?: "PRODUCT" | "SERVICE" } = {},
): Promise<CachedCatalogItem[]> {
  const clauses = ["outlet_id = ?", "is_active = 1"];
  const params: SqlParam[] = [outletId];
  if (options.itemType) {
    clauses.push("item_type = ?");
    params.push(options.itemType);
  }
  const query = options.query?.trim();
  if (query) {
    clauses.push("(name LIKE ? OR code LIKE ?)");
    params.push(`%${query}%`, `%${query}%`);
  }
  const rows = await db.all<{ payload: string }>(
    `SELECT payload FROM cached_catalog WHERE ${clauses.join(" AND ")} ORDER BY name ASC LIMIT 200`,
    params,
  );
  return rows.map((row) => parseJson<CachedCatalogItem>(row.payload, {} as CachedCatalogItem));
}

export async function getCatalogItem(
  db: SqlDatabase,
  id: string,
): Promise<CachedCatalogItem | null> {
  const rows = await db.all<{ payload: string }>(
    "SELECT payload FROM cached_catalog WHERE id = ?",
    [id],
  );
  return rows[0] ? parseJson<CachedCatalogItem>(rows[0].payload, {} as CachedCatalogItem) : null;
}

export async function replaceCustomers(
  db: SqlDatabase,
  outletId: string,
  items: readonly CachedCustomer[],
  cachedAt: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.run("DELETE FROM cached_customers WHERE outlet_id = ?", [outletId]);
    for (const item of items) {
      await tx.run(
        `INSERT INTO cached_customers
          (id, outlet_id, name, phone_masked, vehicle_count, payload, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          item.id,
          outletId,
          item.name,
          item.phoneMasked,
          item.vehicleCount,
          JSON.stringify(item),
          item.updatedAt,
        ],
      );
    }
    await markCacheRefreshed(tx, "customers", outletId, cachedAt);
  });
}

export async function listCustomers(
  db: SqlDatabase,
  outletId: string,
  query?: string,
): Promise<CachedCustomer[]> {
  const clauses = ["outlet_id = ?"];
  const params: SqlParam[] = [outletId];
  const term = query?.trim();
  if (term) {
    clauses.push("name LIKE ?");
    params.push(`%${term}%`);
  }
  const rows = await db.all<{ payload: string }>(
    `SELECT payload FROM cached_customers WHERE ${clauses.join(" AND ")} ORDER BY name ASC LIMIT 200`,
    params,
  );
  return rows.map((row) => parseJson<CachedCustomer>(row.payload, {} as CachedCustomer));
}

export async function replaceVehicles(
  db: SqlDatabase,
  outletId: string,
  items: readonly CachedVehicle[],
  cachedAt: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.run("DELETE FROM cached_vehicles WHERE outlet_id = ?", [outletId]);
    for (const item of items) {
      await tx.run(
        `INSERT INTO cached_vehicles
          (id, outlet_id, plate, brand, model, customer_id, customer_name, payload, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          item.id,
          outletId,
          item.plate,
          item.brand,
          item.model,
          item.customerId,
          item.customerName,
          JSON.stringify(item),
          item.updatedAt,
        ],
      );
    }
    await markCacheRefreshed(tx, "vehicles", outletId, cachedAt);
  });
}

export async function listVehicles(
  db: SqlDatabase,
  outletId: string,
  query?: string,
): Promise<CachedVehicle[]> {
  const clauses = ["outlet_id = ?"];
  const params: SqlParam[] = [outletId];
  const term = query?.trim();
  if (term) {
    clauses.push("(plate LIKE ? OR brand LIKE ? OR model LIKE ?)");
    params.push(`%${term}%`, `%${term}%`, `%${term}%`);
  }
  const rows = await db.all<{ payload: string }>(
    `SELECT payload FROM cached_vehicles WHERE ${clauses.join(" AND ")} ORDER BY plate ASC LIMIT 200`,
    params,
  );
  return rows.map((row) => parseJson<CachedVehicle>(row.payload, {} as CachedVehicle));
}

export async function getVehicle(
  db: SqlDatabase,
  id: string,
): Promise<CachedVehicle | null> {
  const rows = await db.all<{ payload: string }>(
    "SELECT payload FROM cached_vehicles WHERE id = ?",
    [id],
  );
  return rows[0] ? parseJson<CachedVehicle>(rows[0].payload, {} as CachedVehicle) : null;
}

export async function saveVehicleHistory(
  db: SqlDatabase,
  outletId: string,
  vehicleId: string,
  payload: unknown,
  cachedAt: string,
): Promise<void> {
  await db.run(
    `INSERT INTO cached_vehicle_history (vehicle_id, outlet_id, payload, cached_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (vehicle_id) DO UPDATE SET
       outlet_id = excluded.outlet_id,
       payload = excluded.payload,
       cached_at = excluded.cached_at`,
    [vehicleId, outletId, JSON.stringify(payload), cachedAt],
  );
}

export async function getVehicleHistory(
  db: SqlDatabase,
  vehicleId: string,
): Promise<{ payload: unknown; cachedAt: string } | null> {
  const rows = await db.all<{ payload: string; cached_at: string }>(
    "SELECT payload, cached_at FROM cached_vehicle_history WHERE vehicle_id = ?",
    [vehicleId],
  );
  const row = rows[0];
  return row ? { payload: parseJson<unknown>(row.payload, null), cachedAt: row.cached_at } : null;
}

export async function saveOutletSettings(
  db: SqlDatabase,
  settings: OutletSettings,
): Promise<void> {
  await db.run(
    `INSERT INTO outlet_settings
      (outlet_id, tax_rate, paper_width, cashier_discount_cap_percent,
       void_reason_min_length, receipt_header_text, receipt_footer_text, source, cached_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (outlet_id) DO UPDATE SET
       tax_rate = excluded.tax_rate,
       paper_width = excluded.paper_width,
       cashier_discount_cap_percent = excluded.cashier_discount_cap_percent,
       void_reason_min_length = excluded.void_reason_min_length,
       receipt_header_text = excluded.receipt_header_text,
       receipt_footer_text = excluded.receipt_footer_text,
       source = excluded.source,
       cached_at = excluded.cached_at`,
    [
      settings.outletId,
      settings.taxRate,
      settings.paperWidth,
      settings.cashierDiscountCapPercent,
      settings.voidReasonMinLength,
      settings.headerText,
      settings.footerText,
      settings.source,
      settings.cachedAt,
    ],
  );
}

/**
 * Outlet settings are not exposed by a mobile endpoint; the device learns them
 * from the `settings` snapshot every applied order carries and falls back to the
 * documented server defaults until the first sync (tax 11%, 58 mm, cashier cap
 * 0%, void reason 10). The sale screen states which source is in use.
 */
export async function getOutletSettings(
  db: SqlDatabase,
  outletId: string,
  now: string,
): Promise<OutletSettings> {
  const rows = await db.all<{
    outlet_id: string;
    tax_rate: number;
    paper_width: 58 | 80;
    cashier_discount_cap_percent: number;
    void_reason_min_length: number;
    receipt_header_text: string | null;
    receipt_footer_text: string | null;
    source: "SERVER" | "DEFAULT";
    cached_at: string;
  }>("SELECT * FROM outlet_settings WHERE outlet_id = ?", [outletId]);
  const row = rows[0];
  if (row) {
    return {
      outletId: row.outlet_id,
      taxRate: row.tax_rate,
      paperWidth: row.paper_width === 80 ? 80 : 58,
      cashierDiscountCapPercent: row.cashier_discount_cap_percent,
      voidReasonMinLength: row.void_reason_min_length,
      headerText: row.receipt_header_text,
      footerText: row.receipt_footer_text,
      source: row.source,
      cachedAt: row.cached_at,
    };
  }
  return {
    outletId,
    taxRate: DEFAULT_TAX_RATE_PERCENT,
    paperWidth: 58,
    cashierDiscountCapPercent: 0,
    voidReasonMinLength: 10,
    headerText: null,
    footerText: null,
    source: "DEFAULT",
    cachedAt: now,
  };
}

/** Learns outlet policy from a server order snapshot without touching money. */
export async function learnSettingsFromSync(
  db: SqlDatabase,
  result: SyncResult,
  outletId: string,
  cachedAt: string,
): Promise<void> {
  const order = result.order;
  if (!order) return;
  const existing = await getOutletSettings(db, outletId, cachedAt);
  await saveOutletSettings(db, {
    outletId,
    taxRate: order.settings.taxRate,
    paperWidth: order.settings.paperWidth,
    cashierDiscountCapPercent: order.settings.cashierDiscountCapPercent,
    voidReasonMinLength: order.settings.voidReasonMinLength,
    headerText: existing.source === "SERVER" ? existing.headerText : null,
    footerText: existing.source === "SERVER" ? existing.footerText : null,
    source: "SERVER",
    cachedAt,
  });
}

export async function saveLocalSale(
  db: SqlDatabase,
  input: {
    payload: SyncApplyRequest;
    receipt: ReceiptSnapshot;
    display: LocalOrderDisplay;
    createdAt: string;
  },
): Promise<void> {
  const { payload } = input;
  await db.transaction(async (tx) => {
    await tx.run(
      `INSERT INTO local_orders
        (client_key, outlet_id, payload, receipt, display, device_recorded_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.clientKey,
        payload.outletId,
        JSON.stringify(payload),
        JSON.stringify(input.receipt),
        JSON.stringify(input.display),
        payload.order.deviceRecordedAt,
        input.createdAt,
      ],
    );
    await tx.run(
      `INSERT INTO outbox (client_key, state, attempt_count, updated_at)
       VALUES (?, 'QUEUED', 0, ?)`,
      [payload.clientKey, input.createdAt],
    );
  });
}

const QUEUE_SELECT = `
  SELECT o.seq, o.client_key, o.state, o.attempt_count, o.next_attempt_at,
         o.last_attempt_at, o.last_error, o.server_order_id, o.server_order_number,
         o.applied_at, o.conflict_code, o.conflict_json, o.notices_json,
         o.resolved_at, o.resolution,
         l.outlet_id, l.device_recorded_at, l.created_at, l.print_count,
         l.display AS display_json,
         l.payload AS payload_json
    FROM outbox o
    JOIN local_orders l ON l.client_key = o.client_key
`;

function mapQueueRow(row: OutboxDbRow): QueueRow {
  return {
    seq: row.seq,
    clientKey: row.client_key,
    outletId: row.outlet_id,
    state: row.state,
    attemptCount: row.attempt_count,
    nextAttemptAt: row.next_attempt_at,
    lastAttemptAt: row.last_attempt_at,
    lastError: row.last_error,
    serverOrderId: row.server_order_id,
    serverOrderNumber: row.server_order_number,
    appliedAt: row.applied_at,
    conflictCode: row.conflict_code,
    conflict: parseJson<SyncConflictDetail | null>(row.conflict_json, null),
    notices: parseJson<SyncConflictDetail[]>(row.notices_json, []),
    resolvedAt: row.resolved_at,
    resolution: row.resolution,
    deviceRecordedAt: row.device_recorded_at,
    createdAt: row.created_at,
    printCount: row.print_count ?? 0,
    display: parseJson<LocalOrderDisplay>(row.display_json, {
      localNumber: row.client_key,
      total: "0",
      changeTotal: "0",
      lineCount: 0,
      customerName: null,
      vehiclePlate: null,
    }),
    payload: parseJson<SyncApplyRequest>(row.payload_json, {} as SyncApplyRequest),
  };
}

export async function listQueue(
  db: SqlDatabase,
  options: { states?: readonly OutboxState[] } = {},
): Promise<QueueRow[]> {
  const states = options.states;
  if (!states || states.length === 0) {
    const rows = await db.all<OutboxDbRow>(`${QUEUE_SELECT} ORDER BY o.seq ASC`);
    return rows.map(mapQueueRow);
  }
  const placeholders = states.map(() => "?").join(", ");
  const rows = await db.all<OutboxDbRow>(
    `${QUEUE_SELECT} WHERE o.state IN (${placeholders}) ORDER BY o.seq ASC`,
    states,
  );
  return rows.map(mapQueueRow);
}

export async function getQueueItem(
  db: SqlDatabase,
  clientKey: string,
): Promise<QueueRow | null> {
  const rows = await db.all<OutboxDbRow>(`${QUEUE_SELECT} WHERE o.client_key = ?`, [clientKey]);
  return rows[0] ? mapQueueRow(rows[0]) : null;
}

export async function listDueQueue(
  db: SqlDatabase,
  now: string,
  outletId?: string | null,
): Promise<QueueRow[]> {
  const outletClause = outletId ? " AND l.outlet_id = ?" : "";
  const params = outletId ? [now, outletId] : [now];
  const rows = await db.all<OutboxDbRow>(
    `${QUEUE_SELECT}
     WHERE o.state IN ('QUEUED', 'RETRY')
       AND (o.next_attempt_at IS NULL OR o.next_attempt_at <= ?)${outletClause}
     ORDER BY o.seq ASC`,
    params,
  );
  return rows.map(mapQueueRow);
}

/** Pending work for one outlet; used to guard an outlet switch. */
export async function countPendingForOutlet(
  db: SqlDatabase,
  outletId: string,
): Promise<number> {
  const rows = await db.all<{ count: number }>(
    `SELECT COUNT(*) AS count
       FROM outbox o
       JOIN local_orders l ON l.client_key = o.client_key
      WHERE l.outlet_id = ?
        AND o.state IN ('QUEUED', 'SENDING', 'RETRY', 'CONFLICT', 'FAILED')`,
    [outletId],
  );
  return rows[0]?.count ?? 0;
}

export async function countQueue(db: SqlDatabase): Promise<Record<OutboxState | "ALL", number>> {
  const rows = await db.all<{ state: OutboxState; count: number }>(
    "SELECT state, COUNT(*) AS count FROM outbox GROUP BY state",
  );
  const counts: Record<OutboxState | "ALL", number> = {
    ALL: 0,
    QUEUED: 0,
    SENDING: 0,
    RETRY: 0,
    CONFLICT: 0,
    APPLIED: 0,
    FAILED: 0,
    VOIDED: 0,
  };
  for (const row of rows) {
    counts[row.state] = row.count;
    counts.ALL += row.count;
  }
  return counts;
}

/** A crash or force-kill mid-flight must not strand a sale in `SENDING`. */
export async function resetStaleSending(db: SqlDatabase, now: string): Promise<number> {
  const result = await db.run(
    `UPDATE outbox SET state = 'QUEUED', updated_at = ?
     WHERE state = 'SENDING'`,
    [now],
  );
  return result.changes;
}

export async function markSending(
  db: SqlDatabase,
  clientKey: string,
  now: string,
): Promise<number> {
  const result = await db.run(
    `UPDATE outbox
        SET state = 'SENDING', attempt_count = attempt_count + 1,
            last_attempt_at = ?, updated_at = ?
      WHERE client_key = ? AND state IN ('QUEUED', 'RETRY')`,
    [now, now, clientKey],
  );
  return result.changes;
}

/** Restores a pre-request state after an auth refusal; no attempt is counted. */
export async function restoreQueued(db: SqlDatabase, clientKey: string, now: string): Promise<void> {
  await db.run(
    `UPDATE outbox SET state = 'QUEUED', updated_at = ?
     WHERE client_key = ? AND state = 'SENDING'`,
    [now, clientKey],
  );
}

export async function markApplied(
  db: SqlDatabase,
  result: SyncResult,
  now: string,
): Promise<void> {
  await db.run(
    `UPDATE outbox
        SET state = 'APPLIED', server_order_id = ?, server_order_number = ?,
            applied_at = ?, conflict_code = NULL, conflict_json = NULL,
            notices_json = ?, last_error = NULL, next_attempt_at = NULL,
            resolved_at = ?, resolution = ?, updated_at = ?
      WHERE client_key = ?`,
    [
      result.orderId,
      result.order?.orderNumber ?? null,
      result.appliedAt ?? now,
      JSON.stringify(result.notices),
      result.resolvedAt,
      result.resolution,
      now,
      result.clientKey,
    ],
  );
}

export async function markConflict(
  db: SqlDatabase,
  result: SyncResult,
  now: string,
): Promise<void> {
  await db.run(
    `UPDATE outbox
        SET state = 'CONFLICT', conflict_code = ?, conflict_json = ?,
            notices_json = ?, next_attempt_at = NULL, last_error = NULL, updated_at = ?
      WHERE client_key = ?`,
    [
      result.conflict?.code ?? null,
      JSON.stringify(result.conflict),
      JSON.stringify(result.notices),
      now,
      result.clientKey,
    ],
  );
}

export async function markRetry(
  db: SqlDatabase,
  clientKey: string,
  nextAttemptAt: string,
  message: string,
  now: string,
): Promise<void> {
  await db.run(
    `UPDATE outbox
        SET state = 'RETRY', next_attempt_at = ?, last_error = ?, updated_at = ?
      WHERE client_key = ?`,
    [nextAttemptAt, message, now, clientKey],
  );
}

export async function markFailed(
  db: SqlDatabase,
  clientKey: string,
  message: string,
  now: string,
): Promise<void> {
  await db.run(
    `UPDATE outbox
        SET state = 'FAILED', last_error = ?, next_attempt_at = NULL, updated_at = ?
      WHERE client_key = ?`,
    [message, now, clientKey],
  );
}

export async function markResolved(
  db: SqlDatabase,
  result: SyncResult,
  now: string,
): Promise<void> {
  const voided = result.resolution === "VOID";
  await db.run(
    `UPDATE outbox
        SET state = ?, server_order_id = ?, server_order_number = ?,
            applied_at = ?, conflict_json = ?, notices_json = ?,
            resolved_at = ?, resolution = ?, next_attempt_at = NULL,
            last_error = NULL, updated_at = ?
      WHERE client_key = ?`,
    [
      voided ? "VOIDED" : "APPLIED",
      result.orderId,
      result.order?.orderNumber ?? null,
      result.appliedAt,
      JSON.stringify(result.conflict),
      JSON.stringify(result.notices),
      result.resolvedAt ?? now,
      result.resolution,
      now,
      result.clientKey,
    ],
  );
}

/** Manual "Sinkronkan sekarang" clears backoff without changing the queue order. */
export async function makeQueueDue(db: SqlDatabase, now: string): Promise<void> {
  await db.run(
    `UPDATE outbox SET next_attempt_at = ?, updated_at = ?
     WHERE state = 'RETRY'`,
    [now, now],
  );
}

/** Counts an actual output so a later copy is stamped `SALINAN`. */
export async function markPrinted(db: SqlDatabase, clientKey: string): Promise<number> {
  await db.run(
    "UPDATE local_orders SET print_count = print_count + 1 WHERE client_key = ?",
    [clientKey],
  );
  const rows = await db.all<{ print_count: number }>(
    "SELECT print_count FROM local_orders WHERE client_key = ?",
    [clientKey],
  );
  return rows[0]?.print_count ?? 0;
}

export async function makeItemDue(
  db: SqlDatabase,
  clientKey: string,
  now: string,
): Promise<void> {
  await db.run(
    "UPDATE outbox SET next_attempt_at = ?, updated_at = ? WHERE client_key = ?",
    [now, now, clientKey],
  );
}

/** Explicit per-item retry after a permanent failure; the server re-validates. */
export async function requeueItem(
  db: SqlDatabase,
  clientKey: string,
  now: string,
): Promise<number> {
  const result = await db.run(
    `UPDATE outbox
        SET state = 'QUEUED', next_attempt_at = NULL, last_error = NULL, updated_at = ?
      WHERE client_key = ? AND state IN ('RETRY', 'FAILED')`,
    [now, clientKey],
  );
  return result.changes;
}

export async function getReceiptSnapshot(
  db: SqlDatabase,
  clientKey: string,
): Promise<ReceiptSnapshot | null> {
  const rows = await db.all<{ receipt: string }>(
    "SELECT receipt FROM local_orders WHERE client_key = ?",
    [clientKey],
  );
  return rows[0] ? parseJson<ReceiptSnapshot | null>(rows[0].receipt, null) : null;
}

export async function cacheOrders(
  db: SqlDatabase,
  outletId: string,
  orders: readonly { id: string; payload: unknown }[],
  cachedAt: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    // Upsert list rows without replacing a cached detail: a previously opened
    // order must stay readable offline after the list refreshes.
    for (const order of orders) {
      await tx.run(
        `INSERT INTO cached_orders (id, outlet_id, payload, detail, cached_at)
         VALUES (?, ?, ?, 0, ?)
         ON CONFLICT (id) DO UPDATE SET
           payload = excluded.payload,
           cached_at = excluded.cached_at
         WHERE cached_orders.detail = 0`,
        [order.id, outletId, JSON.stringify(order.payload), cachedAt],
      );
    }
    await markCacheRefreshed(tx, "orders", outletId, cachedAt);
  });
}

export async function cacheOrderDetail(
  db: SqlDatabase,
  outletId: string,
  id: string,
  payload: unknown,
  cachedAt: string,
): Promise<void> {
  await db.run(
    `INSERT INTO cached_orders (id, outlet_id, payload, detail, cached_at)
     VALUES (?, ?, ?, 1, ?)
     ON CONFLICT (id) DO UPDATE SET
       outlet_id = excluded.outlet_id,
       payload = excluded.payload,
       detail = 1,
       cached_at = excluded.cached_at`,
    [id, outletId, JSON.stringify(payload), cachedAt],
  );
}

export async function getCachedOrder(
  db: SqlDatabase,
  id: string,
): Promise<unknown | null> {
  const rows = await db.all<{ payload: string }>(
    "SELECT payload FROM cached_orders WHERE id = ?",
    [id],
  );
  return rows[0] ? parseJson<unknown>(rows[0].payload, null) : null;
}

export async function listCachedOrders(
  db: SqlDatabase,
  outletId: string,
  limit = 50,
): Promise<unknown[]> {
  const rows = await db.all<{ payload: string }>(
    "SELECT payload FROM cached_orders WHERE outlet_id = ? ORDER BY cached_at DESC LIMIT ?",
    [outletId, limit],
  );
  return rows.map((row) => parseJson<unknown>(row.payload, null));
}

export async function purgeLocalData(db: SqlDatabase): Promise<void> {
  await db.transaction(async (tx) => {
    for (const table of PERSONAL_DATA_TABLES) {
      await tx.run(`DELETE FROM ${table}`);
    }
  });
}

/** Keeps the unsynced queue while dropping customer/vehicle caches. */
export async function clearPersonalCaches(db: SqlDatabase): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.run("DELETE FROM cached_customers");
    await tx.run("DELETE FROM cached_vehicles");
    await tx.run("DELETE FROM cached_vehicle_history");
    await tx.run("DELETE FROM cached_orders");
    await tx.run("DELETE FROM cache_state");
  });
}
