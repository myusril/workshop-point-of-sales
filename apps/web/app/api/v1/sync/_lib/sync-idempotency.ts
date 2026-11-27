import type { SyncApplyRequest } from "@workshop-pos/contracts";

import { canonicalRequestHash } from "@/lib/order-idempotency";

/**
 * The sync apply fingerprint. The operation name is part of the hash, so the
 * same payload under a different operation can never replay across features.
 */
export const SYNC_OPERATION = "sync.apply";

/** Namespaced to keep the sync result out of the online order/payment key space. */
export function syncIdempotencyKey(clientKey: string): string {
  return `sync:${clientKey}`;
}

export function syncRequestHash(
  actorId: string,
  input: SyncApplyRequest,
): string {
  return canonicalRequestHash({
    operation: SYNC_OPERATION,
    actorId,
    input,
  });
}
