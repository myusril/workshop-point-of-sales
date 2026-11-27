import { describe, expect, it } from "vitest";

import { syncApplyRequestSchema } from "@workshop-pos/contracts";
import type { SyncApplyRequest } from "@workshop-pos/contracts";

import { syncRequestHash } from "../app/api/v1/sync/_lib/sync-idempotency";

/**
 * The sync apply hash must be stable for an identical payload and must change
 * for a different actor or client key; otherwise a replay would either be
 * rejected as a different transaction or silently apply a second sale.
 */

const PRODUCT_ID = "22222222-2222-4222-8222-222222222222";
const OUTLET_ID = "44444444-4444-4444-8444-444444444444";

function payload(): SyncApplyRequest {
  const parsed = syncApplyRequestSchema.parse({
    clientKey: "offline-sale-hash-0001",
    outletId: OUTLET_ID,
    order: {
      kind: "SALE",
      taxRate: 11,
      subtotal: "200000",
      discountTotal: "0",
      taxTotal: "22000",
      total: "222000",
      deviceRecordedAt: "2026-11-27T03:05:00+07:00",
      lines: [
        {
          lineType: "PRODUCT",
          catalogItemId: PRODUCT_ID,
          description: "Kampas rem depan",
          quantity: 1,
          unitPrice: "200000",
          taxAmount: "22000",
          lineTotal: "200000",
        },
      ],
      payments: [{ method: "CASH", amount: "222000", changeAmount: "0" }],
    },
  });
  return parsed;
}

function hash(actorId: string, input: SyncApplyRequest): string {
  return syncRequestHash(actorId, input);
}

describe("sync idempotency hash", () => {
  it("is stable for the same actor and payload", () => {
    expect(hash("cashier-a", payload())).toBe(hash("cashier-a", payload()));
  });

  it("changes when the actor or the client key changes", () => {
    const base = hash("cashier-a", payload());
    expect(hash("admin-a", payload())).not.toBe(base);

    const otherKey = payload();
    otherKey.clientKey = "offline-sale-hash-0002";
    expect(hash("cashier-a", otherKey)).not.toBe(base);
  });

  it("changes when local money changes", () => {
    const base = hash("cashier-a", payload());
    const repriced = payload();
    Object.assign(repriced.order.lines[0] ?? {}, { unitPrice: "210000" });
    expect(hash("cashier-a", repriced)).not.toBe(base);
  });
});
