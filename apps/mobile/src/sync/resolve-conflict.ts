import type { SyncResolveAction, SyncResult } from "@workshop-pos/contracts";

import { canOverrideStock, type StoredSession } from "@/src/auth/session-store";
import type { OutletSettings, QueueRow } from "@/src/db/repository";
import type { SyncEngine } from "@/src/sync/engine";

/** Explicit conflict resolution rules (AC15.2, AC15.3, AC15.5). */

export class ResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResolutionError";
  }
}

export interface ResolveConflictInput {
  engine: Pick<SyncEngine, "resolve">;
  row: QueueRow;
  action: SyncResolveAction;
  reason: string;
  session: StoredSession;
  settings: Pick<OutletSettings, "voidReasonMinLength">;
}

export async function resolveQueuedConflict(
  input: ResolveConflictInput,
): Promise<SyncResult> {
  if (input.row.state !== "CONFLICT") {
    throw new ResolutionError("Transaksi ini tidak sedang menunggu keputusan.");
  }
  const reason = input.reason.trim();
  const minimum = Math.max(1, input.settings.voidReasonMinLength);
  if (reason.length < minimum) {
    throw new ResolutionError(`Alasan minimal ${minimum} karakter.`);
  }

  if (input.action === "OVERRIDE") {
    if (!canOverrideStock(input.session)) {
      throw new ResolutionError(
        "Hanya Admin atau Pemilik yang boleh menyetujui transaksi dengan override stok.",
      );
    }
  }

  return input.engine.resolve(input.row.clientKey, input.action, reason);
}

export function conflictCashRefund(row: QueueRow): bigint {
  return row.payload.order.payments.reduce(
    (sum, payment) => sum + BigInt(payment.amount),
    0n,
  );
}
