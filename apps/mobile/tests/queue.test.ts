import { syncApplyRequestSchema } from "@workshop-pos/contracts";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  clearPersonalCaches,
  countQueue,
  getOutletSettings,
  cacheOrderDetail,
  cacheOrders,
  getCachedOrder,
  getReceiptSnapshot,
  getVehicleHistory,
  learnSettingsFromSync,
  listCatalog,
  listCustomers,
  listDueQueue,
  listQueue,
  markSending,
  migrate,
  purgeLocalData,
  countPendingForOutlet,
  replaceCatalog,
  replaceCustomers,
  replaceVehicles,
  resetStaleSending,
  saveLocalSale,
  saveOutletSettings,
  saveVehicleHistory,
} from "@/src/db/repository";
import { cartPricing, planPayments } from "@/src/domain/sale";
import { commitLocalSale } from "@/src/domain/commit-sale";
import { createNodeSqlDatabase } from "./helpers/node-sqlite";
import {
  ac31Cart,
  line,
  testReceipt,
  testSession,
  testSettings,
  TEST_OUTLET_ID,
  TEST_PRODUCT_ID,
} from "./helpers/fixtures";

async function committedSale(db: Awaited<ReturnType<typeof createNodeSqlDatabase>>, key = "sale-test-000001") {
  const cart = ac31Cart();
  const pricing = cartPricing(cart, 11);
  const plan = planPayments(pricing.total, [{ method: "CASH", tendered: 300_000n }]);
  return commitLocalSale(db, {
    cart,
    settings: testSettings(),
    session: testSession(),
    outletName: "Outlet A",
    payments: plan.payments,
    clientKey: key,
    now: new Date("2026-11-27T02:00:00.000Z"),
  });
}

describe("local sale commit and outbox (AC14.1, AC14.5)", () => {
  it("writes the order and its outbox row in one transaction", async () => {
    const db = createNodeSqlDatabase();
    await migrate(db);
    const result = await committedSale(db);

    expect(result.pricing.total).toBe(299_700n);
    expect(result.display.localNumber).toMatch(/^LOKAL-/);

    const queue = await listQueue(db);
    expect(queue).toHaveLength(1);
    expect(queue[0]?.state).toBe("QUEUED");
    expect(queue[0]?.payload.order.total).toBe("299700");
    expect(syncApplyRequestSchema.safeParse(queue[0]?.payload).success).toBe(true);

    expect(await countPendingForOutlet(db, TEST_OUTLET_ID)).toBe(1);
    const receipt = await getReceiptSnapshot(db, result.clientKey);
    expect(receipt?.total).toBe("299700");
    expect(receipt?.paperWidth).toBe(58);
    expect(receipt?.payments[0]).toEqual({
      method: "CASH",
      amount: "299700",
      changeAmount: "300",
    });
    await db.close();
  });

  it("keeps queue order deterministic and survives an app restart", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wpos-queue-"));
    const path = join(dir, "queue.db");
    const first = createNodeSqlDatabase(path);
    await migrate(first);
    await committedSale(first, "sale-test-000001");
    await committedSale(first, "sale-test-000002");
    await committedSale(first, "sale-test-000003");
    await first.close();

    const reopened = createNodeSqlDatabase(path);
    await migrate(reopened);
    const queue = await listQueue(reopened);
    expect(queue.map((row) => row.clientKey)).toEqual([
      "sale-test-000001",
      "sale-test-000002",
      "sale-test-000003",
    ]);
    expect(queue.map((row) => row.seq)).toEqual([...queue.map((row) => row.seq)].sort((a, b) => a - b));
    await reopened.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("recovers a sale left in SENDING by a force-kill", async () => {
    const db = createNodeSqlDatabase();
    await migrate(db);
    await committedSale(db);
    await markSending(db, "sale-test-000001", "2026-11-27T02:01:00.000Z");
    expect((await countQueue(db)).SENDING).toBe(1);

    const reset = await resetStaleSending(db, "2026-11-27T02:02:00.000Z");
    expect(reset).toBe(1);
    const due = await listDueQueue(db, "2026-11-27T02:02:00.000Z");
    expect(due.map((row) => row.clientKey)).toEqual(["sale-test-000001"]);
    await db.close();
  });

  it("refuses a sale when the role lacks create_sale", async () => {
    const db = createNodeSqlDatabase();
    await migrate(db);
    const cart = ac31Cart();
    const pricing = cartPricing(cart, 11);
    const plan = planPayments(pricing.total, [{ method: "CASH", tendered: 300_000n }]);
    await expect(
      commitLocalSale(db, {
        cart,
        settings: testSettings(),
        session: testSession({ allowedActions: ["manage_catalog"] }),
        outletName: "Outlet A",
        payments: plan.payments,
        clientKey: "sale-test-000011",
      }),
    ).rejects.toThrow("tidak dapat membuat penjualan");
    expect((await countQueue(db)).ALL).toBe(0);
    await db.close();
  });

  it("enforces the cashier discount cap before the sale is recorded", async () => {
    const db = createNodeSqlDatabase();
    await migrate(db);
    const cart = ac31Cart();
    const pricing = cartPricing(cart, 11);
    const plan = planPayments(pricing.total, [{ method: "CASH", tendered: 300_000n }]);
    await expect(
      commitLocalSale(db, {
        cart,
        settings: testSettings({ cashierDiscountCapPercent: 0 }),
        session: testSession(),
        outletName: "Outlet A",
        payments: plan.payments,
        clientKey: "sale-test-000009",
      }),
    ).rejects.toThrow("memerlukan persetujuan");
    expect(await countQueue(db)).toMatchObject({ ALL: 0 });
    await db.close();
  });
});

describe("offline cache scoping and erasure (PD-04, AC14.4)", () => {
  it("stores product stock provisionally and reads it back", async () => {
    const db = createNodeSqlDatabase();
    await migrate(db);
    await replaceCatalog(
      db,
      TEST_OUTLET_ID,
      [
        {
          itemType: "PRODUCT",
          id: TEST_PRODUCT_ID,
          outletId: TEST_OUTLET_ID,
          name: "Kampas rem depan",
          code: "BRK-001",
          price: "250000",
          unit: "pcs",
          stockOnHand: 20,
          lowStockThreshold: 5,
          isLowStock: false,
          isActive: true,
          durationMinutes: null,
          updatedAt: "2026-11-27T01:00:00.000Z",
        },
      ],
      "2026-11-27T02:00:00.000Z",
    );
    const items = await listCatalog(db, TEST_OUTLET_ID, { query: "kampas" });
    expect(items[0]?.stockOnHand).toBe(20);
    expect(items[0]?.price).toBe("250000");
    await db.close();
  });

  it("caches only masked customer phones and cached history survives offline", async () => {
    const db = createNodeSqlDatabase();
    await migrate(db);
    await replaceCustomers(
      db,
      TEST_OUTLET_ID,
      [
        {
          id: "customer-1",
          name: "Budi",
          phoneMasked: "+628••••••0000",
          vehicleCount: 1,
          updatedAt: "2026-11-27T01:00:00.000Z",
        },
      ],
      "2026-11-27T02:00:00.000Z",
    );
    await replaceVehicles(
      db,
      TEST_OUTLET_ID,
      [
        {
          id: "vehicle-1",
          plate: "B1234XYZ",
          brand: "Honda",
          model: "Beat",
          customerId: "customer-1",
          customerName: "Budi",
          updatedAt: "2026-11-27T01:00:00.000Z",
        },
      ],
      "2026-11-27T02:00:00.000Z",
    );
    await saveVehicleHistory(
      db,
      TEST_OUTLET_ID,
      "vehicle-1",
      { vehicle: { normalizedPlate: "B1234XYZ" }, items: [] },
      "2026-11-27T02:00:00.000Z",
    );

    const customers = await listCustomers(db, TEST_OUTLET_ID);
    expect(customers[0]?.phoneMasked).not.toMatch(/^\+6281200/);
    const history = await getVehicleHistory(db, "vehicle-1");
    expect(history).not.toBeNull();

    await clearPersonalCaches(db);
    expect(await listCustomers(db, TEST_OUTLET_ID)).toEqual([]);
    expect(await getVehicleHistory(db, "vehicle-1")).toBeNull();
    await db.close();
  });

  it("keeps a previously opened order detail across list refreshes", async () => {
    const db = createNodeSqlDatabase();
    await migrate(db);
    await cacheOrders(
      db,
      TEST_OUTLET_ID,
      [{ id: "order-1", payload: { id: "order-1", orderNumber: "INV-1" } }],
      "2026-11-27T02:00:00.000Z",
    );
    await cacheOrderDetail(
      db,
      TEST_OUTLET_ID,
      "order-1",
      { id: "order-1", orderNumber: "INV-1", lines: [{ description: "Kampas" }] },
      "2026-11-27T02:01:00.000Z",
    );

    await cacheOrders(
      db,
      TEST_OUTLET_ID,
      [
        { id: "order-1", payload: { id: "order-1", orderNumber: "INV-1" } },
        { id: "order-2", payload: { id: "order-2", orderNumber: "INV-2" } },
      ],
      "2026-11-27T02:02:00.000Z",
    );

    const detail = (await getCachedOrder(db, "order-1")) as {
      lines?: { description: string }[];
    } | null;
    expect(detail?.lines?.[0]?.description).toBe("Kampas");
    expect(await getCachedOrder(db, "order-2")).not.toBeNull();
    await db.close();
  });

  it("purges queue and personal cache on sign-out", async () => {
    const db = createNodeSqlDatabase();
    await migrate(db);
    const sale = await committedSale(db);
    await saveVehicleHistory(db, TEST_OUTLET_ID, "vehicle-1", { items: [] }, "2026-11-27T02:00:00.000Z");
    await purgeLocalData(db);
    expect(await countQueue(db)).toMatchObject({ ALL: 0 });
    expect(await getReceiptSnapshot(db, sale.clientKey)).toBeNull();
    expect(await getVehicleHistory(db, "vehicle-1")).toBeNull();
    await db.close();
  });
});

describe("outlet settings source", () => {
  it("uses documented server defaults until the first applied sale", async () => {
    const db = createNodeSqlDatabase();
    await migrate(db);
    const settings = await getOutletSettings(db, TEST_OUTLET_ID, "2026-11-27T02:00:00.000Z");
    expect(settings).toMatchObject({
      taxRate: 11,
      paperWidth: 58,
      cashierDiscountCapPercent: 0,
      voidReasonMinLength: 10,
      source: "DEFAULT",
    });
    await db.close();
  });

  it("learns the server snapshot and keeps the header text", async () => {
    const db = createNodeSqlDatabase();
    await migrate(db);
    await saveOutletSettings(db, testSettings({ headerText: "Bengkel Jaya", source: "SERVER" }));
    await learnSettingsFromSync(
      db,
      {
        clientKey: "sale-test-000001",
        state: "APPLIED",
        conflict: null,
        notices: [],
        orderId: "order-1",
        attemptCount: 1,
        deviceRecordedAt: "2026-11-27T02:00:00.000Z",
        appliedAt: "2026-11-27T02:05:00.000Z",
        resolvedAt: null,
        resolution: null,
        order: {
          settings: { paperWidth: 80, taxRate: 12, cashierDiscountCapPercent: 5, voidReasonMinLength: 12 },
          outletId: TEST_OUTLET_ID,
        } as never,
      },
      TEST_OUTLET_ID,
      "2026-11-27T02:05:00.000Z",
    );
    const learned = await getOutletSettings(db, TEST_OUTLET_ID, "2026-11-27T02:05:00.000Z");
    expect(learned).toMatchObject({
      taxRate: 12,
      paperWidth: 80,
      cashierDiscountCapPercent: 5,
      voidReasonMinLength: 12,
      headerText: "Bengkel Jaya",
      source: "SERVER",
    });
    await db.close();
  });
});

describe("local mutation guard", () => {
  it("refuses a sale without a single line", async () => {
    const db = createNodeSqlDatabase();
    await migrate(db);
    await expect(
      commitLocalSale(db, {
        cart: { lines: [], discountPercent: null, discountAmount: 0n },
        settings: testSettings(),
        session: testSession(),
        outletName: "Outlet A",
        payments: [],
        clientKey: "sale-test-000010",
      }),
    ).rejects.toThrow("Tambahkan minimal satu item");
    await db.close();
  });

  it("does not duplicate a replay of the same client key locally", async () => {
    const db = createNodeSqlDatabase();
    await migrate(db);
    const sale = await committedSale(db);
    const cart = ac31Cart();
    const pricing = cartPricing(cart, 11);
    const plan = planPayments(pricing.total, [{ method: "CASH", tendered: 300_000n }]);
    await expect(
      saveLocalSale(db, {
        payload: sale.payload,
        receipt: testReceipt(),
        display: sale.display,
        createdAt: "2026-11-27T02:00:00.000Z",
      }),
    ).rejects.toThrow();
    expect((await countQueue(db)).ALL).toBe(1);
    expect(plan.payments).toHaveLength(1);
    expect(line().quantity).toBe(1);
    await db.close();
  });
});
