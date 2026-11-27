import type { SyncResult } from "@workshop-pos/contracts";

import { ApiError, NetworkError } from "@/src/api/client";
import {
  countQueue,
  getQueueItem,
  listQueue,
  migrate,
  markConflict,
  type OutboxState,
} from "@/src/db/repository";
import { commitLocalSale } from "@/src/domain/commit-sale";
import { cartPricing, planPayments } from "@/src/domain/sale";
import { createSyncEngine, type SyncEngine } from "@/src/sync/engine";
import { backoffDelayMs } from "@/src/sync/backoff";
import { createNodeSqlDatabase } from "./helpers/node-sqlite";
import { ac31Cart, TEST_OUTLET_ID, testSession, testSettings } from "./helpers/fixtures";

function appliedResult(clientKey: string, orderNumber = "INV-1"): SyncResult {
  return {
    clientKey,
    state: "APPLIED",
    conflict: null,
    notices: [],
    order: null,
    orderId: `order-${clientKey}`,
    attemptCount: 1,
    deviceRecordedAt: "2026-11-27T02:00:00.000Z",
    appliedAt: "2026-11-27T02:01:00.000Z",
    resolvedAt: null,
    resolution: null,
  };
}

function conflictResult(clientKey: string): SyncResult {
  return {
    clientKey,
    state: "CONFLICT",
    conflict: {
      code: "STOCK_INSUFFICIENT",
      blocking: true,
      message: "Stok Kampas rem depan tidak mencukupi: lokal 1, server 0.",
      productId: "22222222-2222-4222-8222-222222222222",
      productName: "Kampas rem depan",
      localQuantity: 1,
      serverQuantity: 0,
    },
    notices: [],
    order: null,
    orderId: null,
    attemptCount: 1,
    deviceRecordedAt: "2026-11-27T02:00:00.000Z",
    appliedAt: null,
    resolvedAt: null,
    resolution: null,
  };
}

async function seed(db: Awaited<ReturnType<typeof createNodeSqlDatabase>>, keys: string[]) {
  const cart = ac31Cart();
  const pricing = cartPricing(cart, 11);
  const plan = planPayments(pricing.total, [{ method: "CASH", tendered: 300_000n }]);
  for (const key of keys) {
    await commitLocalSale(db, {
      cart,
      settings: testSettings(),
      session: testSession(),
      outletName: "Outlet A",
      payments: plan.payments,
      clientKey: key,
      now: new Date("2026-11-27T02:00:00.000Z"),
    });
  }
}

interface Harness {
  db: Awaited<ReturnType<typeof createNodeSqlDatabase>>;
  engine: SyncEngine;
  appliedPayloads: string[];
  calls: string[];
  setNow: (value: string) => void;
  unauthorised: { count: number };
}

function harness(
  responses: (() => Promise<SyncResult>)[] | (Error | (() => Promise<SyncResult>))[],
  resolveResponse?: () => Promise<SyncResult>,
): Harness {
  const db = createNodeSqlDatabase();
  const calls: string[] = [];
  const appliedPayloads: string[] = [];
  const unauthorised = { count: 0 };
  let current = new Date("2026-11-27T02:00:00.000Z");
  let index = 0;

  const engine = createSyncEngine({
    db,
    now: () => current,
    random: () => 0.5,
    onUnauthorised: () => {
      unauthorised.count += 1;
    },
    endpoints: {
      async applySync(request) {
        calls.push(request.clientKey);
        appliedPayloads.push(JSON.stringify(request));
        const response = responses[index];
        index += 1;
        if (!response) throw new Error("Unexpected sync call");
        if (response instanceof Error) throw response;
        return response();
      },
      async resolveSync(_clientKey) {
        const response = resolveResponse;
        if (!response) throw new Error("Unexpected resolve call");
        return response();
      },
    },
  });

  return {
    db,
    engine,
    appliedPayloads,
    calls,
    setNow: (value) => {
      current = new Date(value);
    },
    unauthorised,
  };
}

describe("outbox sync engine (AC14.2–AC14.5)", () => {
  it("applies a queued sale once and records the server order", async () => {
    const test = harness([() => Promise.resolve(appliedResult("sale-test-000001"))]);
    await migrate(test.db);
    await seed(test.db, ["sale-test-000001"]);

    const summary = await test.engine.run();
    expect(summary).toMatchObject({ attempted: 1, applied: 1, conflicts: 0, retries: 0, failed: 0 });
    const row = await getQueueItem(test.db, "sale-test-000001");
    expect(row?.state).toBe("APPLIED");
    expect(row?.serverOrderId).toBe("order-sale-test-000001");
    await test.db.close();
  });

  it("keeps a server conflict visible and never retries it silently", async () => {
    const test = harness([() => Promise.resolve(conflictResult("sale-test-000001"))]);
    await migrate(test.db);
    await seed(test.db, ["sale-test-000001"]);

    await test.engine.run();
    const first = await getQueueItem(test.db, "sale-test-000001");
    expect(first?.state).toBe("CONFLICT");
    expect(first?.conflict?.code).toBe("STOCK_INSUFFICIENT");
    expect(first?.conflict?.localQuantity).toBe(1);
    expect(first?.conflict?.serverQuantity).toBe(0);

    const second = await test.engine.run();
    expect(second.attempted).toBe(0);
    const after = await getQueueItem(test.db, "sale-test-000001");
    expect(after?.state).toBe("CONFLICT");
    expect(test.calls).toHaveLength(1);
    await test.db.close();
  });

  it("backs off a network failure and retries the same client key", async () => {
    const test = harness([
      new NetworkError(),
      () => Promise.resolve(appliedResult("sale-test-000001")),
    ]);
    await migrate(test.db);
    await seed(test.db, ["sale-test-000001"]);

    const first = await test.engine.run();
    expect(first.retries).toBe(1);
    const retry = await getQueueItem(test.db, "sale-test-000001");
    expect(retry?.state).toBe("RETRY");
    expect(retry?.nextAttemptAt).toBe("2026-11-27T02:00:02.000Z");

    // Not due yet: no request is sent before the backoff expires.
    const early = await test.engine.run();
    expect(early.attempted).toBe(0);
    expect(test.calls).toHaveLength(1);

    test.setNow("2026-11-27T02:01:00.000Z");
    await test.engine.run();
    expect(test.calls).toEqual(["sale-test-000001", "sale-test-000001"]);
    expect(test.appliedPayloads[0]).toBe(test.appliedPayloads[1]);
    const applied = await getQueueItem(test.db, "sale-test-000001");
    expect(applied?.state).toBe("APPLIED");
    expect(applied?.attemptCount).toBe(2);
    await test.db.close();
  });

  it("does not let one failing sale block the next (AC14.5)", async () => {
    const test = harness([
      () => Promise.reject(new NetworkError()),
      () => Promise.resolve(appliedResult("sale-test-000002")),
    ]);
    await migrate(test.db);
    await seed(test.db, ["sale-test-000001", "sale-test-000002"]);

    await test.engine.run();
    const queue = await listQueue(test.db);
    expect(queue.map((row) => row.state)).toEqual(["RETRY", "APPLIED"]);
    expect(test.calls).toEqual(["sale-test-000001", "sale-test-000002"]);
    await test.db.close();
  });

  it("treats an in-flight 409 as retryable, not permanent", async () => {
    const test = harness([
      new ApiError({ status: 409, code: "CONFLICT", message: "Sedang diproses." }),
      () => Promise.resolve(appliedResult("sale-test-000001")),
    ]);
    await migrate(test.db);
    await seed(test.db, ["sale-test-000001"]);

    await test.engine.run();
    expect((await getQueueItem(test.db, "sale-test-000001"))?.state).toBe("RETRY");

    test.setNow("2026-11-27T02:05:00.000Z");
    await test.engine.run();
    expect((await getQueueItem(test.db, "sale-test-000001"))?.state).toBe("APPLIED");
    await test.db.close();
  });

  it("marks a permanent validation failure and continues", async () => {
    const test = harness([
      new ApiError({ status: 400, code: "VALIDATION_ERROR", message: "Data tidak valid." }),
      () => Promise.resolve(appliedResult("sale-test-000002")),
    ]);
    await migrate(test.db);
    await seed(test.db, ["sale-test-000001", "sale-test-000002"]);

    await test.engine.run();
    const queue = await listQueue(test.db);
    expect(queue.map((row) => row.state)).toEqual(["FAILED", "APPLIED"]);
    expect(queue[0]?.lastError).toBe("Data tidak valid.");
    await test.db.close();
  });

  it("fails closed on an APPLIED-less conflict payload instead of hiding the sale", async () => {
    const test = harness([
      () =>
        Promise.resolve({
          ...conflictResult("sale-test-000001"),
          conflict: null,
        }),
    ]);
    await migrate(test.db);
    await seed(test.db, ["sale-test-000001"]);

    await test.engine.run();
    const row = await getQueueItem(test.db, "sale-test-000001");
    expect(row?.state).toBe("FAILED");
    expect(row?.lastError).toContain("tidak dikenali");
    await test.db.close();
  });

  it("stops on an expired session and leaves the queue intact", async () => {
    const test = harness([
      new ApiError({ status: 401, code: "SESSION_EXPIRED", message: "Sesi berakhir." }),
    ]);
    await migrate(test.db);
    await seed(test.db, ["sale-test-000001", "sale-test-000002"]);

    const summary = await test.engine.run();
    expect(summary.unauthorised).toBe(true);
    expect(test.unauthorised.count).toBe(1);
    expect(test.calls).toEqual(["sale-test-000001"]);
    const queue = await listQueue(test.db);
    expect(queue.map((row) => row.state)).toEqual(["QUEUED", "QUEUED"]);
    expect((await countQueue(test.db)).ALL).toBe(2);
    await test.db.close();
  });

  it("orders requests by local creation and is single-flight", async () => {
    const test = harness([
      () => Promise.resolve(appliedResult("sale-test-000001")),
      () => Promise.resolve(appliedResult("sale-test-000002")),
    ]);
    await migrate(test.db);
    await seed(test.db, ["sale-test-000001", "sale-test-000002"]);

    const [a, b] = await Promise.all([test.engine.run(), test.engine.run()]);
    expect(a).toBe(b);
    expect(test.calls).toEqual(["sale-test-000001", "sale-test-000002"]);
    await test.db.close();
  });

  it("manual sync makes a backing-off sale due immediately", async () => {
    const test = harness([
      new NetworkError(),
      () => Promise.resolve(appliedResult("sale-test-000001")),
    ]);
    await migrate(test.db);
    await seed(test.db, ["sale-test-000001"]);
    await test.engine.run();
    expect((await getQueueItem(test.db, "sale-test-000001"))?.state).toBe("RETRY");

    await test.engine.run({ manual: true });
    expect((await getQueueItem(test.db, "sale-test-000001"))?.state).toBe("APPLIED");
    await test.db.close();
  });

  it("resolves a conflict with an explicit void or override only", async () => {
    const test = harness(
      [() => Promise.resolve(conflictResult("sale-test-000001"))],
      () =>
        Promise.resolve({
          ...conflictResult("sale-test-000001"),
          state: "RESOLVED",
          resolution: "VOID",
          orderId: "order-voided",
          appliedAt: null,
          resolvedAt: "2026-11-27T02:10:00.000Z",
        }),
    );
    await migrate(test.db);
    await seed(test.db, ["sale-test-000001"]);
    await test.engine.run();
    await markConflict(test.db, conflictResult("sale-test-000001"), "2026-11-27T02:01:00.000Z");

    const resolved = await test.engine.resolve(
      "sale-test-000001",
      "VOID",
      "Pelanggan membatalkan karena stok habis.",
    );
    expect(resolved.resolution).toBe("VOID");
    const row = await getQueueItem(test.db, "sale-test-000001");
    expect(row?.state).toBe<OutboxState>("VOIDED");
    expect(row?.resolution).toBe("VOID");
    expect(row?.resolvedAt).toBe("2026-11-27T02:10:00.000Z");
    await test.db.close();
  });
});

describe("outlet scoping and resolve recovery", () => {
  it("only uploads sales for the active outlet", async () => {
    const test = harness([() => Promise.resolve(appliedResult("sale-test-000001"))]);
    await migrate(test.db);
    await seed(test.db, ["sale-test-000001"]);
    const otherOutlet = "44444444-4444-4444-8444-444444444444";
    const cart = ac31Cart();
    const pricing = cartPricing(cart, 11);
    const plan = planPayments(pricing.total, [{ method: "CASH", tendered: 300_000n }]);
    await commitLocalSale(test.db, {
      cart,
      settings: testSettings({ outletId: otherOutlet }),
      session: testSession({ activeOutletId: otherOutlet }),
      outletName: "Outlet B",
      payments: plan.payments,
      clientKey: "sale-test-000002",
      now: new Date("2026-11-27T02:00:00.000Z"),
    });

    await test.engine.run({ outletId: TEST_OUTLET_ID });
    expect(test.calls).toEqual(["sale-test-000001"]);
    expect((await getQueueItem(test.db, "sale-test-000002"))?.state).toBe("QUEUED");
    await test.db.close();
  });

  it("recovers a lost resolve response by replaying the stored key", async () => {
    const test = harness(
      [
        () => Promise.resolve(conflictResult("sale-test-000001")),
        () =>
          Promise.resolve({
            ...conflictResult("sale-test-000001"),
            state: "RESOLVED" as const,
            conflict: null,
            resolution: "OVERRIDE" as const,
            orderId: "order-resolved",
            appliedAt: "2026-11-27T02:11:00.000Z",
            resolvedAt: "2026-11-27T02:10:00.000Z",
          }),
      ],
      () =>
        Promise.reject(
          new ApiError({ status: 409, code: "CONFLICT", message: "Konflik ini sudah diselesaikan." }),
        ),
    );
    await migrate(test.db);
    await seed(test.db, ["sale-test-000001"]);
    await test.engine.run();

    const result = await test.engine.resolve(
      "sale-test-000001",
      "OVERRIDE",
      "Stok sudah dihitung ulang oleh Admin.",
    );
    expect(result.state).toBe("RESOLVED");
    expect(result.resolution).toBe("OVERRIDE");
    const row = await getQueueItem(test.db, "sale-test-000001");
    expect(row?.state).toBe("APPLIED");
    expect(row?.serverOrderId).toBe("order-resolved");
    await test.db.close();
  });
});

describe("retry backoff", () => {
  it("grows exponentially with a cap and jitter", () => {
    expect(backoffDelayMs(1, () => 0.5)).toBe(2_000);
    expect(backoffDelayMs(2, () => 0.5)).toBe(4_000);
    expect(backoffDelayMs(3, () => 0.5)).toBe(8_000);
    expect(backoffDelayMs(20, () => 0.5)).toBe(300_000);
    expect(backoffDelayMs(1, () => 0)).toBe(1_600);
    expect(backoffDelayMs(1, () => 1)).toBe(2_400);
  });
});
