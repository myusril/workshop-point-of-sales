import { createCacheRefresher } from "@/src/cache/refresh";
import {
  getCacheRefreshed,
  getOutletSettings,
  listCatalog,
  listCustomers,
  migrate,
} from "@/src/db/repository";
import { createNodeSqlDatabase } from "./helpers/node-sqlite";
import { TEST_OUTLET_ID, TEST_PRODUCT_ID } from "./helpers/fixtures";

const product = {
  itemType: "PRODUCT" as const,
  id: TEST_PRODUCT_ID,
  outletId: TEST_OUTLET_ID,
  outletName: "Outlet A",
  sku: "BRK-001",
  name: "Kampas rem depan",
  unit: "pcs",
  price: "250000",
  lowStockThreshold: 5,
  stockOnHand: 20,
  isLowStock: false,
  isActive: true,
  updatedAt: "2026-11-27T01:00:00.000Z",
};

const secondProduct = { ...product, id: "55555555-5555-4555-8555-555555555555", sku: "BRK-002", name: "Filter oli" };

const customer = {
  id: "customer-1",
  name: "Budi",
  phoneMasked: "+628••••0000",
  vehicleCount: 1,
  anonymizedAt: null,
  createdAt: "2026-11-27T01:00:00.000Z",
  updatedAt: "2026-11-27T01:00:00.000Z",
};

const vehicle = {
  id: "vehicle-1",
  normalizedPlate: "B1234XYZ",
  brand: "Honda",
  model: "Beat",
  year: 2021,
  color: "Hitam",
  odometer: 12450,
  customerId: "customer-1",
  customerName: "Budi",
  customerAnonymized: false,
  createdAt: "2026-11-27T01:00:00.000Z",
  updatedAt: "2026-11-27T01:00:00.000Z",
};

const orderListItem = {
  id: "order-1",
  orderNumber: "INV-1",
  kind: "SALE" as const,
  status: "PAID" as const,
  outletId: TEST_OUTLET_ID,
  outletName: "Outlet A",
  customerName: "Budi",
  vehiclePlate: "B1234XYZ",
  technicianName: null,
  lineCount: 1,
  total: "299700",
  paidTotal: "299700",
  balanceDue: "0",
  createdAt: "2026-11-27T01:00:00.000Z",
};

function endpoints(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    listCatalog: jest.fn(async () => [product]),
    listCustomers: jest.fn(async () => [customer]),
    listVehicles: jest.fn(async () => [vehicle]),
    listOrders: jest.fn(async () => ({ items: [orderListItem] })),
    orderDetail: jest.fn(async () => ({
      id: "order-1",
      outletId: TEST_OUTLET_ID,
      settings: { taxRate: 12, paperWidth: 80, cashierDiscountCapPercent: 5, voidReasonMinLength: 12 },
    })),
    vehicleHistory: jest.fn(async () => ({
      vehicle,
      orders: [],
      page: 1,
      pageSize: 50,
      total: 0,
      totalPages: 0,
      totals: { visits: 0, totalSpent: "0", outstanding: "0" },
      scope: { allOutlets: false, outletId: TEST_OUTLET_ID, outletName: "Outlet A" },
    })),
    ...overrides,
  } as never;
}

describe("offline cache refresh (AC14.4, DESIGN §7.5)", () => {
  it("replaces the outlet snapshot and learns policy from the newest order", async () => {
    const db = createNodeSqlDatabase();
    await migrate(db);
    const refresher = createCacheRefresher({
      db,
      endpoints: endpoints(),
      now: () => new Date("2026-11-27T02:00:00.000Z"),
    });

    const result = await refresher.refreshAll(TEST_OUTLET_ID);
    expect(result).toMatchObject({ catalog: 1, customers: 1, vehicles: 1, orders: 1 });

    const catalog = await listCatalog(db, TEST_OUTLET_ID);
    expect(catalog[0]?.name).toBe("Kampas rem depan");
    expect(catalog[0]?.stockOnHand).toBe(20);
    expect((await listCustomers(db, TEST_OUTLET_ID))[0]?.phoneMasked).toBe("+628••••0000");

    const settings = await getOutletSettings(db, TEST_OUTLET_ID, "2026-11-27T02:00:00.000Z");
    expect(settings).toMatchObject({
      taxRate: 12,
      paperWidth: 80,
      cashierDiscountCapPercent: 5,
      voidReasonMinLength: 12,
      source: "SERVER",
    });
    expect((await getCacheRefreshed(db, "catalog"))?.cachedAt).toBe("2026-11-27T02:00:00.000Z");

    const refreshed = createCacheRefresher({
      db,
      endpoints: endpoints({ listCatalog: jest.fn(async () => [secondProduct]) }),
      now: () => new Date("2026-11-27T02:10:00.000Z"),
    });
    await refreshed.refreshAll(TEST_OUTLET_ID);
    const replaced = await listCatalog(db, TEST_OUTLET_ID);
    expect(replaced.map((row) => row.name)).toEqual(["Filter oli"]);
    await db.close();
  });

  it("aborts the write when the session generation changed mid-refresh", async () => {
    const db = createNodeSqlDatabase();
    await migrate(db);
    const generation = { current: 0 };
    const refresher = createCacheRefresher({
      db,
      generation,
      endpoints: endpoints({
        listCatalog: jest.fn(async () => {
          generation.current += 1;
          return [product];
        }),
      }),
      now: () => new Date("2026-11-27T02:00:00.000Z"),
    });
    await expect(refresher.refreshAll(TEST_OUTLET_ID)).rejects.toThrow("dibatalkan");
    expect(await listCatalog(db, TEST_OUTLET_ID)).toEqual([]);
    await db.close();
  });

  it("keeps the previous snapshot when a refresh fails", async () => {
    const db = createNodeSqlDatabase();
    await migrate(db);
    await createCacheRefresher({
      db,
      endpoints: endpoints(),
      now: () => new Date("2026-11-27T02:00:00.000Z"),
    }).refreshAll(TEST_OUTLET_ID);

    const failing = createCacheRefresher({
      db,
      endpoints: endpoints({
        listCatalog: jest.fn(async () => {
          throw new Error("offline");
        }),
      }),
      now: () => new Date("2026-11-27T02:05:00.000Z"),
    });
    await expect(failing.refreshAll(TEST_OUTLET_ID)).rejects.toThrow("offline");

    expect((await listCatalog(db, TEST_OUTLET_ID))[0]?.name).toBe("Kampas rem depan");
    expect((await getCacheRefreshed(db, "catalog"))?.cachedAt).toBe("2026-11-27T02:00:00.000Z");
    await db.close();
  });
});
