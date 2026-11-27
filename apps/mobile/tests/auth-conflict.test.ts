import { checkPin, createPinRecord, MAX_FREE_ATTEMPTS } from "@/src/auth/pin";
import { createSessionStore, sessionFromLogin, hasAction } from "@/src/auth/session-store";
import { createMemorySecretStore } from "@/src/auth/secret-store";
import { resolveQueuedConflict, ResolutionError } from "@/src/sync/resolve-conflict";
import type { QueueRow } from "@/src/db/repository";
import { testSettings, testSession } from "./helpers/fixtures";

jest.mock("expo-crypto", () => {
  const nodeCrypto = jest.requireActual<typeof import("node:crypto")>("node:crypto");
  return {
    CryptoDigestAlgorithm: { SHA256: "SHA-256" },
    getRandomBytes: (count: number) => new Uint8Array(nodeCrypto.randomBytes(count)),
    digestStringAsync: async (_algorithm: string, data: string) =>
      nodeCrypto.createHash("sha256").update(data, "utf8").digest("hex"),
  };
});

describe("device PIN (DESIGN §7.7)", () => {
  it("stores only a salted verifier and accepts the right PIN", async () => {
    const record = await createPinRecord("123456");
    expect(record.hash).not.toContain("123456");
    expect(record.salt).toHaveLength(32);

    const check = await checkPin("123456", record, new Date("2026-11-27T02:00:00.000Z"));
    expect(check.status).toBe("ok");
  });

  it("locks after five wrong attempts and reports the wait", async () => {
    let record = await createPinRecord("123456");
    const now = new Date("2026-11-27T02:00:00.000Z");
    for (let attempt = 1; attempt < MAX_FREE_ATTEMPTS; attempt += 1) {
      const check = await checkPin("000000", record, now);
      expect(check.status).toBe("wrong");
      record = check.next;
    }
    const locked = await checkPin("000000", record, now);
    if (locked.status !== "locked") throw new Error("Expected a locked PIN");
    expect(locked.waitSeconds).toBe(60);

    const duringLock = await checkPin("123456", locked.next, new Date(now.getTime() + 1_000));
    expect(duringLock.status).toBe("locked");

    const after = await checkPin("123456", locked.next, new Date(now.getTime() + 61_000));
    expect(after.status).toBe("ok");
  });
});

describe("session storage", () => {
  it("keeps the token in the secret store and clears it on sign-out", async () => {
    const secrets = createMemorySecretStore();
    const store = createSessionStore(secrets);
    await store.setToken("device-token-value");
    const session = sessionFromLogin(
      {
        user: {
          id: "user-1",
          name: "Dewi",
          email: "dewi@example.com",
          username: "dewi",
          phone: "+6281200000000",
          role: "CASHIER",
        },
        session: {
          activeOutletId: "11111111-1111-4111-8111-111111111111",
          outletIds: ["11111111-1111-4111-8111-111111111111"],
          idleTimeoutMinutes: 30,
          expiresAt: "2026-11-27T10:00:00.000Z",
        },
        outlets: [
          { id: "11111111-1111-4111-8111-111111111111", name: "Outlet A", isActive: true },
        ],
        allowedActions: ["create_sale"],
        token: "device-token-value",
      },
      new Date("2026-11-27T02:00:00.000Z"),
    );

    await store.save(session);
    expect((await store.load())?.user.name).toBe("Dewi");
    expect(hasAction(await store.load(), "create_sale")).toBe(true);

    await store.clear();
    expect(await store.load()).toBeNull();
    expect(await store.getToken()).toBeNull();
    expect(secrets.snapshot()).toEqual({});
  });
});

function conflictRow(overrides: Partial<QueueRow> = {}): QueueRow {
  return {
    seq: 1,
    clientKey: "sale-test-000001",
    outletId: "11111111-1111-4111-8111-111111111111",
    state: "CONFLICT",
    attemptCount: 1,
    nextAttemptAt: null,
    lastAttemptAt: "2026-11-27T02:00:00.000Z",
    lastError: null,
    serverOrderId: null,
    serverOrderNumber: null,
    appliedAt: null,
    conflictCode: "STOCK_INSUFFICIENT",
    conflict: {
      code: "STOCK_INSUFFICIENT",
      blocking: true,
      message: "Stok tidak mencukupi",
      localQuantity: 1,
      serverQuantity: 0,
    },
    notices: [],
    resolvedAt: null,
    resolution: null,
    deviceRecordedAt: "2026-11-27T02:00:00.000Z",
    createdAt: "2026-11-27T02:00:00.000Z",
    printCount: 0,
    display: {
      localNumber: "LOKAL-000001",
      total: "299700",
      changeTotal: "300",
      lineCount: 2,
      customerName: null,
      vehiclePlate: null,
    },
    payload: {
      clientKey: "sale-test-000001",
      outletId: "11111111-1111-4111-8111-111111111111",
      order: {
        kind: "SALE",
        taxRate: 11,
        subtotal: "300000",
        discountTotal: "30000",
        taxTotal: "29700",
        total: "299700",
        lines: [
          {
            lineType: "PRODUCT",
            catalogItemId: "22222222-2222-4222-8222-222222222222",
            description: "Kampas rem depan",
            quantity: 1,
            unitPrice: "250000",
            taxAmount: "24750",
            lineTotal: "250000",
          },
        ],
        payments: [{ method: "CASH", amount: "299700", changeAmount: "300" }],
        deviceRecordedAt: "2026-11-27T02:00:00.000Z",
      },
    },
    ...overrides,
  };
}

describe("conflict resolution permission and reasons (AC15.2, AC15.3, AC15.5)", () => {
  const engine = {
    resolve: jest.fn(async () => ({
      clientKey: "sale-test-000001",
      state: "RESOLVED" as const,
      conflict: null,
      notices: [],
      order: null,
      orderId: "order-1",
      attemptCount: 2,
      deviceRecordedAt: "2026-11-27T02:00:00.000Z",
      appliedAt: null,
      resolvedAt: "2026-11-27T02:10:00.000Z",
      resolution: "VOID" as const,
    })),
  };

  it("refuses an override for a Cashier", async () => {
    await expect(
      resolveQueuedConflict({
        engine,
        row: conflictRow(),
        action: "OVERRIDE",
        reason: "Stok sudah dihitung ulang",
        session: testSession(),
        settings: testSettings(),
      }),
    ).rejects.toBeInstanceOf(ResolutionError);
    expect(engine.resolve).not.toHaveBeenCalled();
  });

  it("allows a Cashier to void with a reason and records the refund server-side", async () => {
    const result = await resolveQueuedConflict({
      engine,
      row: conflictRow(),
      action: "VOID",
      reason: "Pelanggan membatalkan pembelian.",
      session: testSession(),
      settings: testSettings({ voidReasonMinLength: 10 }),
    });
    expect(result.resolution).toBe("VOID");
    expect(engine.resolve).toHaveBeenCalledWith(
      "sale-test-000001",
      "VOID",
      "Pelanggan membatalkan pembelian.",
    );
  });

  it("requires the outlet's minimum reason length", async () => {
    await expect(
      resolveQueuedConflict({
        engine,
        row: conflictRow(),
        action: "VOID",
        reason: "habis",
        session: testSession(),
        settings: testSettings({ voidReasonMinLength: 10 }),
      }),
    ).rejects.toThrow("minimal 10 karakter");
  });

  it("allows an Admin override with a reason", async () => {
    const admin = testSession({
      user: { ...testSession().user, role: "ADMIN" },
      allowedActions: ["create_sale", "override_stock"],
    });
    await resolveQueuedConflict({
      engine,
      row: conflictRow(),
      action: "OVERRIDE",
      reason: "Barang sudah dijual ke pelanggan lain.",
      session: admin,
      settings: testSettings(),
    });
    expect(engine.resolve).toHaveBeenCalled();
  });

  it("refuses to alter a sale that is not in conflict", async () => {
    await expect(
      resolveQueuedConflict({
        engine,
        row: conflictRow({ state: "QUEUED" }),
        action: "VOID",
        reason: "Pelanggan membatalkan pembelian.",
        session: testSession(),
        settings: testSettings(),
      }),
    ).rejects.toBeInstanceOf(ResolutionError);
  });
});
