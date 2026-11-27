import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import {
  auditDenial,
  AuthError,
  can,
  CROSS_OUTLET_MESSAGE,
  denialMessage,
  uniqueViolationConstraint,
  type AuthContext,
  type RbacAction,
} from "@workshop-pos/auth";
import type {
  SyncApplyRequest,
  SyncConflictDetail,
  SyncConflictItem,
  SyncConflictListResponse,
  SyncResolveRequest,
  SyncResult,
} from "@workshop-pos/contracts";
import {
  syncApplyRequestSchema,
  syncResultSchema,
} from "@workshop-pos/contracts";
import {
  appendAuditEntry,
  idempotencyKeys,
  syncKeys,
  type Database,
  type OutletScope,
} from "@workshop-pos/db";

import {
  applyOfflineSale,
  OfflineSaleConflictError,
  type OfflineSaleOutcome,
} from "@/lib/order-service";

import {
  SYNC_OPERATION,
  syncIdempotencyKey,
  syncRequestHash,
} from "./sync-idempotency";

/**
 * Server-side offline sync seam (WP6.1, PRD US-14/US-15, ADR-0001 §3.6).
 *
 * One client key maps to one `sync_keys` row and one stored result. The row,
 * the idempotency response, the order, its payments, and any stock-ledger rows
 * commit in a single transaction, so a retry after a lost response returns the
 * original result and a crash leaves nothing half-written. Conflicts are stored
 * results, not exceptions: they stay listable until an explicit resolution.
 */

type TransactionHandle = Parameters<Parameters<Database["transaction"]>[0]>[0];

function asDatabase(tx: TransactionHandle): Database {
  return tx as unknown as Database;
}

function scopeOfOutlet(context: AuthContext, outletId: string): OutletScope {
  return { businessId: context.user.businessId, outletIds: [outletId] };
}

/** Raised when a concurrent claim reveals a key owned by a different outlet. */
class SyncOutletMismatchError extends Error {
  readonly outletId: string;

  constructor(outletId: string) {
    super("sync key belongs to another outlet");
    this.name = "SyncOutletMismatchError";
    this.outletId = outletId;
  }
}

async function readSyncKeyRow(
  db: Database,
  businessId: string,
  clientKey: string,
): Promise<typeof syncKeys.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(syncKeys)
    .where(
      and(eq(syncKeys.businessId, businessId), eq(syncKeys.clientKey, clientKey)),
    )
    .limit(1);
  return row ?? null;
}

/**
 * The original request is kept next to the response because an unresolved
 * conflict must be resumable from the server alone: the resolve call carries
 * only an action and a reason, and `sync_keys` has no payload column.
 */
const storedSyncEnvelopeSchema = z.object({
  /** The user who captured the sale; resolution keeps the sale attributed. */
  actorId: z.string().min(1),
  request: syncApplyRequestSchema,
  result: syncResultSchema,
});

interface StoredSyncEnvelope {
  actorId: string;
  request: SyncApplyRequest;
  result: SyncResult;
}

async function requireSyncAction(
  db: Database,
  context: AuthContext,
  action: RbacAction,
  clientKey: string,
  outletId: string,
): Promise<void> {
  if (can(context.user.role, action)) return;
  await auditDenial(db, context, {
    action,
    entityType: "sync_key",
    entityId: clientKey,
    outletId,
  });
  throw AuthError.forbidden(denialMessage(action));
}

/**
 * The request's outlet must be in the session scope. A bearer token is pinned
 * to one outlet, so a device cannot upload into a sibling outlet merely because
 * its signed-in user has access to both.
 */
async function resolveSyncOutlet(
  db: Database,
  context: AuthContext,
  outletId: string,
  action: RbacAction,
  clientKey: string,
): Promise<void> {
  const inScope = context.outletIds.includes(outletId);
  const pinnedMismatch =
    context.method === "bearer" &&
    context.activeOutletId !== null &&
    context.activeOutletId !== outletId;

  if (inScope && !pinnedMismatch) return;

  await auditDenial(db, context, {
    action,
    entityType: "sync_key",
    entityId: clientKey,
    outletId,
    crossOutlet: true,
    reason: pinnedMismatch
      ? "device token is pinned to another outlet"
      : "outlet outside the caller's assigned scope",
  });
  throw AuthError.forbidden(CROSS_OUTLET_MESSAGE);
}

async function readStoredSyncEnvelope(
  db: Database,
  businessId: string,
  clientKey: string,
): Promise<{
  row: typeof idempotencyKeys.$inferSelect | null;
  envelope: StoredSyncEnvelope | null;
}> {
  const [row] = await db
    .select()
    .from(idempotencyKeys)
    .where(
      and(
        eq(idempotencyKeys.businessId, businessId),
        eq(idempotencyKeys.key, syncIdempotencyKey(clientKey)),
      ),
    )
    .limit(1);

  if (!row || !row.completedAt || row.responseBody === null) {
    return { row: row ?? null, envelope: null };
  }

  const parsed = storedSyncEnvelopeSchema.safeParse(row.responseBody);
  if (!parsed.success) {
    throw AuthError.internal("Data sinkronisasi tersimpan tidak terbaca.");
  }
  return { row, envelope: parsed.data };
}

async function writeStoredSyncEnvelope(
  tx: TransactionHandle,
  input: {
    businessId: string;
    actorId: string;
    requestHash: string;
    request: SyncApplyRequest;
    result: SyncResult;
    now: Date;
  },
): Promise<void> {
  const [row] = await tx
    .insert(idempotencyKeys)
    .values({
      businessId: input.businessId,
      key: syncIdempotencyKey(input.request.clientKey),
      operation: SYNC_OPERATION,
      requestHash: input.requestHash,
      orderId: input.result.orderId,
      responseStatus: 200,
      responseBody: {
        actorId: input.actorId,
        request: input.request,
        result: input.result,
      },
      completedAt: input.now,
    })
    .returning({ id: idempotencyKeys.id });
  if (!row) throw AuthError.internal("Hasil sinkronisasi gagal disimpan.");
}

function jakartaBusinessDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * A sale recorded on an earlier business date reached the server after the day
 * may already have been reconciled. It still applies (money is a fact) but is
 * flagged for the day report instead of disappearing from it.
 */
function cashReportingNotice(
  deviceRecordedAt: Date,
  syncedAt: Date,
): SyncConflictDetail | null {
  const recorded = jakartaBusinessDate(deviceRecordedAt);
  const synced = jakartaBusinessDate(syncedAt);
  if (recorded === synced) return null;
  return {
    code: "CASH_REPORTING",
    blocking: false,
    message: `Penjualan tercatat tanggal ${recorded} dan disinkronkan tanggal ${synced}; ditandai untuk rekonsiliasi laporan harian.`,
  };
}

function appliedResult(
  clientKey: string,
  deviceRecordedAt: string,
  outcome: OfflineSaleOutcome,
  notices: SyncConflictDetail[],
  now: Date,
  attemptCount = 1,
): SyncResult {
  return {
    clientKey,
    state: "APPLIED",
    conflict: null,
    notices,
    order: outcome.detail,
    orderId: outcome.detail.id,
    attemptCount,
    deviceRecordedAt,
    appliedAt: now.toISOString(),
    resolvedAt: null,
    resolution: null,
  };
}

function conflictResult(
  clientKey: string,
  conflict: SyncConflictDetail,
  deviceRecordedAt: string,
  now: Date,
  attemptCount = 1,
): SyncResult {
  return {
    clientKey,
    state: "CONFLICT",
    conflict,
    notices: [],
    order: null,
    orderId: null,
    attemptCount,
    deviceRecordedAt,
    appliedAt: null,
    resolvedAt: null,
    resolution: null,
  };
}

export async function applySyncSale(
  db: Database,
  context: AuthContext,
  input: SyncApplyRequest,
): Promise<SyncResult> {
  const outletId = input.outletId;
  await resolveSyncOutlet(db, context, outletId, "create_sale", input.clientKey);
  await requireSyncAction(db, context, "create_sale", input.clientKey, outletId);

  const scopedContext: AuthContext = {
    ...context,
    activeOutletId: outletId,
    outletIds: [outletId],
  };
  const scope = scopeOfOutlet(context, outletId);
  const requestHash = syncRequestHash(context.user.id, input);
  const deviceRecordedAt = new Date(input.order.deviceRecordedAt);
  const now = new Date();

  // A replay of an existing key is checked before the write transaction so an
  // out-of-scope denial is audited on the base connection, not rolled back.
  const existingKey = await readSyncKeyRow(db, scope.businessId, input.clientKey);
  if (existingKey) {
    await resolveSyncOutlet(
      db,
      context,
      existingKey.outletId,
      "create_sale",
      input.clientKey,
    );
  }

  try {
    return await db.transaction(async (tx) => {
    const handle = asDatabase(tx);
    const [claimed] = await tx
      .insert(syncKeys)
      .values({
        businessId: scope.businessId,
        outletId,
        deviceTokenId: context.tokenId ?? null,
        clientKey: input.clientKey,
        state: "QUEUED",
        deviceRecordedAt,
        attemptCount: 1,
        lastAttemptAt: now,
      })
      .onConflictDoNothing({
        target: [syncKeys.businessId, syncKeys.clientKey],
      })
      .returning();
    if (!claimed) {
      // The key already exists: a retry or a concurrent duplicate. A completed
      // stored result is returned verbatim; an unfinished one means in flight.
      const [existing] = await tx
        .select()
        .from(syncKeys)
        .where(
          and(
            eq(syncKeys.businessId, scope.businessId),
            eq(syncKeys.clientKey, input.clientKey),
          ),
        )
        .limit(1);
      if (!existing) throw AuthError.internal("Kunci sinkronisasi tidak ditemukan.");
      if (existing.outletId !== outletId) {
        throw new SyncOutletMismatchError(existing.outletId);
      }

      const { row, envelope } = await readStoredSyncEnvelope(
        handle,
        scope.businessId,
        input.clientKey,
      );
      if (!row) {
        throw AuthError.conflict(
          "Sinkronisasi dengan kunci ini sedang diproses. Tunggu sebentar lalu coba lagi.",
        );
      }
      if (row.requestHash !== requestHash) {
        throw AuthError.conflict(
          "Kunci sinkronisasi sudah dipakai untuk transaksi yang berbeda.",
        );
      }
      if (!envelope) {
        throw AuthError.conflict(
          "Sinkronisasi dengan kunci ini sedang diproses. Tunggu sebentar lalu coba lagi.",
        );
      }
      const nextAttempt = existing.attemptCount + 1;
      await tx
        .update(syncKeys)
        .set({ attemptCount: nextAttempt, lastAttemptAt: now, updatedAt: now })
        .where(eq(syncKeys.id, existing.id));
      return { ...envelope.result, attemptCount: nextAttempt };
    }

    try {
      const outcome = await applyOfflineSale(handle, scopedContext, input);
      const notices = [...outcome.notices];
      const cashNotice = cashReportingNotice(deviceRecordedAt, now);
      if (cashNotice) {
        notices.push(cashNotice);
        await appendAuditEntry(handle, scope, {
          action: "sync.cash_reporting_flagged",
          entityType: "order",
          entityId: outcome.detail.id,
          actorId: context.user.id,
          outletId,
          after: {
            clientKey: input.clientKey,
            deviceRecordedAt: deviceRecordedAt.toISOString(),
            syncedAt: now.toISOString(),
            businessDate: jakartaBusinessDate(deviceRecordedAt),
          },
        });
      }

      const result = appliedResult(
        input.clientKey,
        deviceRecordedAt.toISOString(),
        outcome,
        notices,
        now,
      );
      await writeStoredSyncEnvelope(tx, {
        businessId: scope.businessId,
        actorId: context.user.id,
        requestHash,
        request: input,
        result,
        now,
      });
      await tx
        .update(syncKeys)
        .set({
          state: "APPLIED",
          orderId: outcome.detail.id,
          appliedAt: now,
          attemptCount: 1,
          lastAttemptAt: now,
          deviceRecordedAt,
          deviceTokenId: context.tokenId ?? null,
          updatedAt: now,
        })
        .where(eq(syncKeys.id, claimed.id));
      return result;
    } catch (error) {
      if (!(error instanceof OfflineSaleConflictError)) throw error;

      // The nested sale transaction rolled back to its savepoint, so no order,
      // payment, or ledger row exists. Record the conflict and keep it visible.
      const result = conflictResult(
        input.clientKey,
        error.detail,
        deviceRecordedAt.toISOString(),
        now,
      );
      await writeStoredSyncEnvelope(tx, {
        businessId: scope.businessId,
        actorId: context.user.id,
        requestHash,
        request: input,
        result,
        now,
      });
      await tx
        .update(syncKeys)
        .set({
          state: "CONFLICT",
          conflictCode: error.detail.code,
          attemptCount: 1,
          lastAttemptAt: now,
          deviceRecordedAt,
          deviceTokenId: context.tokenId ?? null,
          updatedAt: now,
        })
        .where(eq(syncKeys.id, claimed.id));
      await appendAuditEntry(handle, scope, {
        action: "sync.conflict_raised",
        entityType: "sync_key",
        entityId: input.clientKey,
        actorId: context.user.id,
        outletId,
        after: {
          code: error.detail.code,
          productId: error.detail.productId ?? null,
          localQuantity: error.detail.localQuantity ?? null,
          serverQuantity: error.detail.serverQuantity ?? null,
          vehicleId: error.detail.vehicleId ?? null,
        },
      });
      return result;
    }
    });
  } catch (error) {
    if (error instanceof SyncOutletMismatchError) {
      await auditDenial(db, context, {
        action: "create_sale",
        entityType: "sync_key",
        entityId: input.clientKey,
        outletId: error.outletId,
        crossOutlet: !context.outletIds.includes(error.outletId),
        reason: "sync key belongs to another outlet",
      });
      throw AuthError.forbidden(CROSS_OUTLET_MESSAGE);
    }
    if (
      uniqueViolationConstraint(error) === "idempotency_keys_business_id_key_unique"
    ) {
      // An online order may have claimed the same namespaced key. Surface a
      // stable conflict instead of leaking a raw unique-violation 500.
      throw AuthError.conflict(
        "Kunci sinkronisasi bertabrakan dengan operasi lain. Buat kunci baru di perangkat.",
      );
    }
    throw error;
  }
}

export async function resolveSyncConflict(
  db: Database,
  context: AuthContext,
  clientKey: string,
  input: SyncResolveRequest,
): Promise<SyncResult> {
  const [existing] = await db
    .select()
    .from(syncKeys)
    .where(
      and(
        eq(syncKeys.businessId, context.user.businessId),
        eq(syncKeys.clientKey, clientKey),
      ),
    )
    .limit(1);
  if (!existing) throw AuthError.notFound("Sinkronisasi tidak ditemukan.");

  // AC15.3: a user without override permission may still void the queued sale
  // and record the refund; only the override needs the stock-override grant.
  const action: RbacAction =
    input.action === "OVERRIDE" ? "override_stock" : "create_sale";
  await resolveSyncOutlet(db, context, existing.outletId, action, clientKey);
  await requireSyncAction(db, context, action, clientKey, existing.outletId);

  const scopedContext: AuthContext = {
    ...context,
    activeOutletId: existing.outletId,
    outletIds: [existing.outletId],
  };
  const scope = scopeOfOutlet(context, existing.outletId);
  const now = new Date();

  return db.transaction(async (tx) => {
    const handle = asDatabase(tx);
    const [locked] = await tx
      .select()
      .from(syncKeys)
      .where(
        and(
          eq(syncKeys.businessId, scope.businessId),
          eq(syncKeys.clientKey, clientKey),
        ),
      )
      .limit(1)
      .for("update");
    if (!locked) throw AuthError.notFound("Sinkronisasi tidak ditemukan.");
    if (locked.resolvedAt !== null) {
      throw AuthError.conflict("Konflik ini sudah diselesaikan.");
    }
    if (locked.state !== "CONFLICT" || locked.conflictCode === null) {
      throw AuthError.conflict(
        "Sinkronisasi ini tidak memiliki konflik yang menunggu resolusi.",
      );
    }

    const { envelope } = await readStoredSyncEnvelope(
      handle,
      scope.businessId,
      clientKey,
    );
    if (!envelope) {
      throw AuthError.internal("Data konflik tidak lengkap; hubungi administrator.");
    }
    const original = envelope.request;
    if (original.outletId !== locked.outletId) {
      throw AuthError.internal("Data konflik tidak konsisten dengan kuncinya.");
    }

    let outcome: OfflineSaleOutcome;
    try {
      outcome = await applyOfflineSale(
        handle,
        scopedContext,
        original,
        input.action === "OVERRIDE"
          ? {
              // The override actor already holds `override_stock`; the ledger
              // flag is still computed per line, so only genuinely negative
              // lines are marked. Re-linking stays explicit to PLATE conflicts.
              stockOverrideReason: input.reason,
              ...(locked.conflictCode === "PLATE_REASSIGNED"
                ? { allowPlateReassignment: true }
                : {}),
              salesActorId: envelope.actorId,
            }
          : { voidReason: input.reason, salesActorId: envelope.actorId },
      );
    } catch (error) {
      if (!(error instanceof OfflineSaleConflictError)) throw error;
      // A new blocking condition appeared since the conflict was raised (for
      // example the vehicle moved again). Keep the key unresolved, record the
      // new code, and return it so the client can render a fresh decision.
      const retry = conflictResult(
        clientKey,
        error.detail,
        new Date(original.order.deviceRecordedAt).toISOString(),
        now,
        locked.attemptCount + 1,
      );
      await tx
        .update(idempotencyKeys)
        .set({
          responseStatus: 200,
          responseBody: {
            actorId: envelope.actorId,
            request: original,
            result: retry,
          },
          completedAt: now,
        })
        .where(
          and(
            eq(idempotencyKeys.businessId, scope.businessId),
            eq(idempotencyKeys.key, syncIdempotencyKey(clientKey)),
          ),
        );
      await tx
        .update(syncKeys)
        .set({
          state: "CONFLICT",
          conflictCode: error.detail.code,
          attemptCount: locked.attemptCount + 1,
          lastAttemptAt: now,
          updatedAt: now,
        })
        .where(eq(syncKeys.id, locked.id));
      await appendAuditEntry(handle, scope, {
        action: "sync.conflict_changed",
        entityType: "sync_key",
        entityId: clientKey,
        actorId: context.user.id,
        outletId: locked.outletId,
        reason: input.reason,
        before: { conflictCode: locked.conflictCode },
        after: {
          conflictCode: error.detail.code,
          resolution: input.action,
        },
      });
      return retry;
    }

    const notices = [...outcome.notices];
    const recordedAt = new Date(original.order.deviceRecordedAt);
    const cashNotice = cashReportingNotice(recordedAt, now);
    if (cashNotice) {
      notices.push(cashNotice);
      await appendAuditEntry(handle, scope, {
        action: "sync.cash_reporting_flagged",
        entityType: "order",
        entityId: outcome.detail.id,
        actorId: context.user.id,
        outletId: locked.outletId,
        after: {
          clientKey,
          deviceRecordedAt: recordedAt.toISOString(),
          syncedAt: now.toISOString(),
          businessDate: jakartaBusinessDate(recordedAt),
        },
      });
    }

    const resolved: SyncResult = {
      clientKey,
      state: "RESOLVED",
      conflict:
        envelope.result.conflict ?? {
          code: locked.conflictCode,
          blocking: true,
          message: "Konflik diselesaikan.",
        },
      notices,
      order: outcome.detail,
      orderId: outcome.detail.id,
      attemptCount: locked.attemptCount + 1,
      deviceRecordedAt: locked.deviceRecordedAt?.toISOString() ?? null,
      appliedAt:
        input.action === "OVERRIDE"
          ? now.toISOString()
          : (locked.appliedAt?.toISOString() ?? null),
      resolvedAt: now.toISOString(),
      resolution: input.action,
    };

    await tx
      .update(idempotencyKeys)
      .set({
        orderId: outcome.detail.id,
        responseStatus: 200,
        responseBody: {
          actorId: envelope.actorId,
          request: original,
          result: resolved,
        },
        completedAt: now,
      })
      .where(
        and(
          eq(idempotencyKeys.businessId, scope.businessId),
          eq(idempotencyKeys.key, syncIdempotencyKey(clientKey)),
        ),
      );

    await tx
      .update(syncKeys)
      .set({
        state: input.action === "OVERRIDE" ? "APPLIED" : "CONFLICT",
        orderId: outcome.detail.id,
        appliedAt:
          input.action === "OVERRIDE" ? now : (locked.appliedAt ?? null),
        resolvedAt: now,
        resolvedBy: context.user.id,
        attemptCount: locked.attemptCount + 1,
        lastAttemptAt: now,
        updatedAt: now,
      })
      .where(eq(syncKeys.id, locked.id));

    await appendAuditEntry(handle, scope, {
      action:
        input.action === "OVERRIDE"
          ? "sync.conflict_resolved_override"
          : "sync.conflict_resolved_void",
      entityType: "sync_key",
      entityId: clientKey,
      actorId: context.user.id,
      outletId: locked.outletId,
      reason: input.reason,
      before: { state: locked.state, conflictCode: locked.conflictCode },
      after: {
        state: resolved.state,
        orderId: outcome.detail.id,
        orderNumber: outcome.detail.orderNumber,
        resolution: input.action,
      },
    });

    return resolved;
  });
}

export async function listSyncConflicts(
  db: Database,
  context: AuthContext,
): Promise<SyncConflictListResponse> {
  if (context.outletIds.length === 0) {
    return { items: [] };
  }

  await requireSyncAction(
    db,
    context,
    "create_sale",
    "sync.conflicts",
    context.activeOutletId ?? context.outletIds[0] ?? "",
  );

  // A bearer device sees only its pinned outlet; a web session sees its scope.
  const visibleOutletIds =
    context.method === "bearer" && context.activeOutletId !== null
      ? [context.activeOutletId]
      : [...context.outletIds];

  const rows = await db
    .select()
    .from(syncKeys)
    .where(
      and(
        eq(syncKeys.businessId, context.user.businessId),
        eq(syncKeys.state, "CONFLICT"),
        isNull(syncKeys.resolvedAt),
        inArray(syncKeys.outletId, visibleOutletIds),
      ),
    )
    .orderBy(asc(syncKeys.createdAt), asc(syncKeys.clientKey));

  const items: SyncConflictItem[] = [];
  for (const row of rows) {
    let envelope: StoredSyncEnvelope | null = null;
    try {
      envelope = (
        await readStoredSyncEnvelope(db, context.user.businessId, row.clientKey)
      ).envelope;
    } catch {
      // One unreadable historical envelope must not hide every other conflict.
    }
    const conflict = envelope?.result.conflict ?? {
      code: row.conflictCode ?? "STOCK_INSUFFICIENT",
      blocking: true,
      message: "Konflik sinkronisasi memerlukan penyelesaian.",
    };
    items.push({
      clientKey: row.clientKey,
      outletId: row.outletId,
      state: "CONFLICT",
      conflict,
      orderId: row.orderId,
      deviceRecordedAt: row.deviceRecordedAt?.toISOString() ?? null,
      attemptCount: row.attemptCount,
      lastAttemptAt: row.lastAttemptAt?.toISOString() ?? null,
    });
  }
  return { items };
}
