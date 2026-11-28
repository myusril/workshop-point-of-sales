import { act, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import JualScreen from "@/app/(tabs)/index";
import { createCacheRefresher, type CacheRefresher } from "@/src/cache/refresh";
import type { StoredSession } from "@/src/auth/session-store";
import { listCatalog, migrate } from "@/src/db/repository";
import type { SqlDatabase } from "@/src/db/executor";
import { SyncProvider } from "@/src/providers/SyncProvider";
import { ThemeProvider } from "@/src/theme/ThemeProvider";
import { createNodeSqlDatabase } from "./helpers/node-sqlite";
import { TEST_OUTLET_ID, TEST_PRODUCT_ID, testSession } from "./helpers/fixtures";

/**
 * A fresh install signs in with an empty outbox. The counter must still pull
 * the catalog for the active outlet, because the Jual tab only reads SQLite.
 */

const product = {
  itemType: "PRODUCT" as const,
  id: TEST_PRODUCT_ID,
  outletId: TEST_OUTLET_ID,
  outletName: "Outlet Pusat",
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

interface MockEndpoints {
  listCatalog: jest.Mock;
  listCustomers: jest.Mock;
  listVehicles: jest.Mock;
  listOrders: jest.Mock;
  orderDetail: jest.Mock;
  vehicleHistory: jest.Mock;
}

interface MockRuntime {
  db: SqlDatabase;
  refresher: CacheRefresher;
  engine: { run: jest.Mock };
  events: { onQueueChanged?: () => void | Promise<void> };
}

const mockNetState: {
  connected: boolean;
  listeners: ((state: { isConnected: boolean }) => void)[];
} = { connected: true, listeners: [] };

jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: {
    fetch: async () => ({ isConnected: mockNetState.connected }),
    addEventListener: (listener: (state: { isConnected: boolean }) => void) => {
      mockNetState.listeners.push(listener);
      return () => {
        mockNetState.listeners = mockNetState.listeners.filter((entry) => entry !== listener);
      };
    },
  },
}));

const mockAuth: { status: "signedIn"; session: StoredSession } = {
  status: "signedIn",
  session: testSession(),
};

jest.mock("@/src/providers/AuthProvider", () => ({
  useAuth: () => mockAuth,
}));

const mockSale = {
  cart: { lines: [], discountPercent: null as number | null },
  outletName: "Outlet Pusat",
  settings: null,
  customer: null,
  vehicle: null,
  pricing: null,
  pricingError: null,
  productSubtotal: 0n,
  serviceSubtotal: 0n,
  discountBlocked: false,
  discountBlockReason: null,
  addItem: jest.fn(),
  setQuantity: jest.fn(),
  removeLine: jest.fn(),
  restoreLine: jest.fn(),
  setOrderDiscountPercent: jest.fn(),
  clearCart: jest.fn(),
};

jest.mock("@/src/providers/SaleProvider", () => ({
  useSale: () => mockSale,
}));

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), back: jest.fn() }),
}));

let mockRuntime: MockRuntime;

jest.mock("@/src/providers/runtime", () => ({
  getRuntime: () => mockRuntime,
}));

let endpoints: MockEndpoints;
let db: SqlDatabase;

function buildRuntime(catalog: (typeof product)[]): void {
  endpoints = {
    listCatalog: jest.fn(async () => catalog),
    listCustomers: jest.fn(async () => []),
    listVehicles: jest.fn(async () => []),
    listOrders: jest.fn(async () => ({ items: [] })),
    orderDetail: jest.fn(),
    vehicleHistory: jest.fn(),
  };
  mockRuntime = {
    db,
    refresher: createCacheRefresher({
      db,
      endpoints: endpoints as never,
      now: () => new Date(),
    }),
    engine: {
      run: jest.fn(async () => ({
        attempted: 0,
        applied: 0,
        conflicted: 0,
        failed: 0,
        unauthorised: false,
      })),
    },
    events: {},
  };
}

async function renderJual() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <ThemeProvider mode="light">
        <SyncProvider>
          <JualScreen />
        </SyncProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

describe("initial catalog refresh on sign-in (offline-sale prerequisite)", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockNetState.connected = true;
    mockNetState.listeners = [];
    mockAuth.session = testSession({
      user: {
        id: "user-owner",
        name: "Sari",
        email: "sari@example.com",
        username: "sari",
        phone: "",
        role: "OWNER",
      },
    });
    db = createNodeSqlDatabase();
    await migrate(db);
  });

  afterEach(async () => {
    await db.close();
  });

  it("shows the server catalog after sign-in with an empty queue", async () => {
    buildRuntime([product]);
    await renderJual();

    expect(await screen.findByText("Kampas rem depan")).toBeOnTheScreen();
    expect(screen.getByText("BRK-001 · stok 20")).toBeOnTheScreen();
    expect(await screen.findByText(/Stok server/)).toBeOnTheScreen();
    expect(endpoints.listCatalog).toHaveBeenCalledTimes(1);
  });

  it("refreshes once when connectivity returns after an offline sign-in", async () => {
    mockNetState.connected = false;
    buildRuntime([product]);
    await renderJual();

    await waitFor(() => expect(mockNetState.listeners.length).toBeGreaterThan(0));
    expect(screen.queryByText("Kampas rem depan")).not.toBeOnTheScreen();
    expect(endpoints.listCatalog).not.toHaveBeenCalled();

    await act(async () => {
      for (const listener of [...mockNetState.listeners]) listener({ isConnected: true });
    });

    expect(await screen.findByText("Kampas rem depan")).toBeOnTheScreen();
    expect(endpoints.listCatalog).toHaveBeenCalledTimes(1);
  });

  it("re-fetches after an overlapping bootstrap snapshot so stock follows the sale", async () => {
    let stockOnHand = 20;
    let releaseFirstFetch: () => void = () => undefined;
    const firstFetchHeld = new Promise<void>((resolve) => {
      releaseFirstFetch = resolve;
    });
    let catalogFetches = 0;

    buildRuntime([]);
    endpoints.listCatalog = jest.fn(async () => {
      catalogFetches += 1;
      if (catalogFetches === 1) await firstFetchHeld;
      return [{ ...product, stockOnHand }];
    });
    mockRuntime.refresher = createCacheRefresher({
      db,
      endpoints: endpoints as never,
      now: () => new Date(),
    });
    // The upload commits while the bootstrap GETs are still in flight.
    mockRuntime.engine.run = jest.fn(async () => {
      stockOnHand = 19;
      return { attempted: 1, applied: 1, conflicted: 0, failed: 0, unauthorised: false };
    });

    await renderJual();
    await waitFor(() => expect(endpoints.listCatalog).toHaveBeenCalledTimes(1));

    await act(async () => releaseFirstFetch());

    expect(await screen.findByText("BRK-001 · stok 19")).toBeOnTheScreen();
    expect(endpoints.listCatalog).toHaveBeenCalledTimes(2);
    await waitFor(async () => {
      const rows = await listCatalog(db, TEST_OUTLET_ID, { itemType: "PRODUCT" });
      expect(rows[0]?.stockOnHand).toBe(19);
    });
  });

  it("keeps the true-empty outlet copy when the server has no items", async () => {
    buildRuntime([]);
    await renderJual();

    await waitFor(() => expect(endpoints.listCatalog).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Belum ada data")).toBeOnTheScreen();
    expect(await screen.findByText(/Stok server/)).toBeOnTheScreen();
  });
});
