import type { SyncResult, SyncResolveAction } from "@workshop-pos/contracts";

import { ApiError, NetworkError } from "@/src/api/client";
import type { MobileEndpoints } from "@/src/api/endpoints";
import {
  learnSettingsFromSync,
  getQueueItem,
  listDueQueue,
  makeQueueDue,
  markApplied,
  markConflict,
  markFailed,
  markResolved,
  markRetry,
  markSending,
  resetStaleSending,
  restoreQueued,
  type QueueRow,
} from "@/src/db/repository";
import type { SqlDatabase } from "@/src/db/executor";
import { backoffDelayMs } from "@/src/sync/backoff";

/**
 * Deterministic outbox runner (FR-042, AC14.2–AC14.5).
 *
 * Rows upload in local creation order (`outbox.seq`), each in its own request
 * and transaction outcome. A transient failure schedules a jittered retry and
 * the next row still runs; only an authentication refusal stops the whole run,
 * because every later request would fail the same way.
 */

export interface SyncRunSummary {
  attempted: number;
  applied: number;
  conflicts: number;
  retries: number;
  failed: number;
  skipped: number;
  unauthorised: boolean;
}

type FailureKind = "auth" | "transient" | "permanent";

function classifyFailure(error: unknown): FailureKind {
  if (error instanceof ApiError) {
    if (error.status === 401) return "auth";
    if (error.status === 403) return "permanent";
    if (error.status === 408 || error.status === 409 || error.status === 429 || error.status >= 500) {
      // 409 is also the server's "this key is still being processed" answer to
      // a retry after the client timed out. Retrying the same bytes/key is the
      // documented recovery, so it must not become a permanent failure.
      return "transient";
    }
    if (error.status >= 400 && error.status < 500) return "permanent";
    return "transient";
  }
  if (error instanceof NetworkError) return "transient";
  // A contract parse failure is permanent: retrying the same bytes cannot help.
  if (error instanceof Error && error.name === "ZodError") return "permanent";
  return "transient";
}

function failureMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return "Sinkronisasi gagal. Coba lagi.";
}

export interface SyncEngine {
  run(options?: { manual?: boolean; outletId?: string | null }): Promise<SyncRunSummary>;
  resolve(
    clientKey: string,
    action: SyncResolveAction,
    reason: string,
  ): Promise<SyncResult>;
  isRunning(): boolean;
}

export interface SyncEngineOptions {
  db: SqlDatabase;
  endpoints: Pick<MobileEndpoints, "applySync" | "resolveSync">;
  now?: () => Date;
  random?: () => number;
  onResult?: (clientKey: string, result: SyncResult) => void;
  onUnauthorised?: () => void | Promise<void>;
}

function emptySummary(): SyncRunSummary {
  return {
    attempted: 0,
    applied: 0,
    conflicts: 0,
    retries: 0,
    failed: 0,
    skipped: 0,
    unauthorised: false,
  };
}

export function createSyncEngine(options: SyncEngineOptions): SyncEngine {
  const now = options.now ?? (() => new Date());
  const random = options.random ?? Math.random;
  let running: Promise<SyncRunSummary> | null = null;

  async function applyRow(row: QueueRow, summary: SyncRunSummary): Promise<void> {
    const stamp = now().toISOString();
    const changed = await markSending(options.db, row.clientKey, stamp);
    if (changed === 0) {
      summary.skipped += 1;
      return;
    }
    summary.attempted += 1;

    try {
      const result = await options.endpoints.applySync(row.payload);
      const appliedAt = result.appliedAt ?? now().toISOString();
      if (result.state === "CONFLICT" && result.conflict) {
        await markConflict(options.db, result, stamp);
        summary.conflicts += 1;
      } else if (result.state === "RESOLVED") {
        await markResolved(options.db, result, stamp);
        summary.applied += 1;
      } else if (result.state === "APPLIED") {
        await markApplied(options.db, result, stamp);
        await learnSettingsFromSync(options.db, result, row.outletId, appliedAt);
        summary.applied += 1;
      } else {
        // CONFLICT without detail, or an unexpected QUEUED, must never be
        // treated as applied: that would hide a paid sale from review.
        await markFailed(
          options.db,
          row.clientKey,
          "Server mengembalikan status sinkronisasi yang tidak dikenali. Tinjau transaksi ini.",
          now().toISOString(),
        );
        summary.failed += 1;
        return;
      }
      options.onResult?.(row.clientKey, result);
    } catch (error) {
      const kind = classifyFailure(error);
      if (kind === "auth") {
        await restoreQueued(options.db, row.clientKey, now().toISOString());
        summary.unauthorised = true;
        throw error;
      }
      if (kind === "transient") {
        const attempt = row.attemptCount + 1;
        const delay = backoffDelayMs(attempt, random);
        const nextAttemptAt = new Date(now().getTime() + delay).toISOString();
        await markRetry(options.db, row.clientKey, nextAttemptAt, failureMessage(error), now().toISOString());
        summary.retries += 1;
        return;
      }
      await markFailed(options.db, row.clientKey, failureMessage(error), now().toISOString());
      summary.failed += 1;
    }
  }

  async function runOnce(manual: boolean, outletId?: string | null): Promise<SyncRunSummary> {
    const summary = emptySummary();
    const stamp = now().toISOString();
    await resetStaleSending(options.db, stamp);
    if (manual) await makeQueueDue(options.db, stamp);

    // New sales can be committed while a slow request is in flight; take up to
    // three fresh snapshots instead of waiting for an unrelated screen trigger.
    for (let pass = 0; pass < 3; pass += 1) {
      let rows: QueueRow[];
      try {
        rows = await listDueQueue(options.db, now().toISOString(), outletId ?? null);
      } catch {
        break;
      }
      if (rows.length === 0) break;

      for (const row of rows) {
        try {
          await applyRow(row, summary);
        } catch (error) {
          if (classifyFailure(error) === "auth") {
            await options.onUnauthorised?.();
            return summary;
          }
          // Any other unexpected error keeps the queue alive for the next row.
          summary.retries += 1;
        }
      }
    }
    return summary;
  }

  return {
    async run(runOptions) {
      if (running) return running;
      running = runOnce(runOptions?.manual ?? false, runOptions?.outletId).finally(() => {
        running = null;
      });
      return running;
    },
    async resolve(clientKey, action, reason) {
      let result: SyncResult;
      try {
        result = await options.endpoints.resolveSync(clientKey, { action, reason });
      } catch (error) {
        // The server may have committed the resolution and lost the response
        // (or the app died before writing it locally). A re-apply with the same
        // key returns the stored envelope; never dead-end the conflict.
        if (error instanceof ApiError && (error.status === 404 || error.status === 409)) {
          const stored = await getQueueItem(options.db, clientKey);
          if (!stored) throw error;
          const replay = await options.endpoints.applySync(stored.payload);
          if (replay.state === "RESOLVED" || replay.state === "APPLIED") {
            await markResolved(options.db, replay, now().toISOString());
            options.onResult?.(clientKey, replay);
            return replay;
          }
          if (replay.state === "CONFLICT") {
            await markConflict(options.db, replay, now().toISOString());
            options.onResult?.(clientKey, replay);
            return replay;
          }
        }
        throw error;
      }
      const stamp = now().toISOString();
      if (result.state === "RESOLVED" || result.state === "APPLIED") {
        await markResolved(options.db, result, stamp);
        if (result.order) {
          await learnSettingsFromSync(options.db, result, result.order.outletId, stamp);
        }
      } else if (result.state === "CONFLICT") {
        await markConflict(options.db, result, stamp);
      }
      options.onResult?.(clientKey, result);
      return result;
    },
    isRunning() {
      return running !== null;
    },
  };
}
