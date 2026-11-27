import type { ReactNode } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { render, screen, fireEvent } from "@testing-library/react-native";

import { ThemeProvider } from "@/src/theme/ThemeProvider";
import { NumericKeypad } from "@/src/components/NumericKeypad";
import { OfflineBanner, SyncChip } from "@/src/components/chrome";
import KonflikScreen from "@/app/konflik/[clientKey]";

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ clientKey: "sale-test-000001" }),
  useRouter: () => ({ back: jest.fn(), replace: jest.fn(), push: jest.fn() }),
}));

const mockAuth = {
  session: {
    user: { id: "u1", name: "Dewi", email: "dewi@example.com", username: "dewi", phone: "", role: "CASHIER" },
    activeOutletId: "11111111-1111-4111-8111-111111111111",
    outlets: [],
    allowedActions: ["create_sale"],
    idleTimeoutMinutes: 30,
    sessionExpiresAt: "2026-11-27T10:00:00.000Z",
    signedInAt: "2026-11-27T01:00:00.000Z",
    tokenExpiresAt: null,
  },
  canOverrideStock: false,
};

jest.mock("@/src/app/AuthProvider", () => ({
  useAuth: () => mockAuth,
}));

const conflictRow = {
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
    message: "Stok Kampas rem depan tidak mencukupi: lokal 1, server 0.",
    productId: "22222222-2222-4222-8222-222222222222",
    productName: "Kampas rem depan",
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
    customerName: "Budi",
    vehiclePlate: "B1234XYZ",
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
};

jest.mock("@/src/app/SyncProvider", () => ({
  useSync: () => ({
    queue: [conflictRow],
    online: true,
    reload: jest.fn(),
    pendingTotal: 1,
    conflicts: 1,
    failed: 0,
    syncing: false,
    cacheAt: null,
    refreshCache: jest.fn(),
    runNow: jest.fn(),
    lastError: null,
    lastSummary: null,
  }),
}));

const mockRuntime = {
  db: {},
  engine: { resolve: jest.fn() },
};

jest.mock("@/src/app/runtime", () => ({
  getRuntime: () => mockRuntime,
}));

jest.mock("@/src/db/repository", () => ({
  getQueueItem: jest.fn(async () => null),
  getOutletSettings: jest.fn(async () => ({ voidReasonMinLength: 10 })),
}));

function wrap(children: ReactNode) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <ThemeProvider mode="light">{children}</ThemeProvider>
    </SafeAreaProvider>
  );
}

describe("money keypad (DESIGN §7.3)", () => {
  it("appends digits and 000, backspaces one digit, and respects the limit", async () => {
    const onChange = jest.fn();
    const onLimit = jest.fn();
    await render(
      wrap(<NumericKeypad value="12" onChange={onChange} maxDigits={6} onLimit={onLimit} />),
    );

    await fireEvent.press(screen.getByLabelText("Tiga nol"));
    expect(onChange).toHaveBeenCalledWith("12000");

    await fireEvent.press(screen.getByLabelText("Hapus satu angka"));
    expect(onChange).toHaveBeenCalledWith("1");

    onChange.mockClear();
    await render(
      wrap(<NumericKeypad value="1234" onChange={onChange} maxDigits={4} onLimit={onLimit} />),
    );
    await fireEvent.press(screen.getByText("5"));
    expect(onLimit).toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("clears with a visible action rather than a long press", async () => {
    const onChange = jest.fn();
    await render(wrap(<NumericKeypad value="150000" onChange={onChange} />));
    await fireEvent.press(screen.getByLabelText("Hapus semua angka"));
    expect(onChange).toHaveBeenCalledWith("");
  });
});

describe("sync status copy (DESIGN §7.5)", () => {
  it("shows offline pending, conflict, and online states as text", async () => {
    const { rerender } = await render(
      wrap(
        <SyncChip online={false} syncing={false} queued={3} conflicts={0} failed={0} onPress={jest.fn()} />,
      ),
    );
    expect(screen.getByText("Offline: 3 menunggu")).toBeOnTheScreen();

    await rerender(
      wrap(
        <SyncChip online syncing={false} queued={2} conflicts={2} failed={0} onPress={jest.fn()} />,
      ),
    );
    expect(screen.getByText("2 perlu tinjauan")).toBeOnTheScreen();

    await rerender(
      wrap(<SyncChip online syncing={false} queued={0} conflicts={0} failed={0} onPress={jest.fn()} />),
    );
    expect(screen.getByText("Online")).toBeOnTheScreen();
  });

  it("keeps the offline banner non-dismissible and explicit", async () => {
    await render(wrap(<OfflineBanner queued={2} />));
    expect(
      screen.getByText(/Anda offline\. 2 transaksi menunggu sinkron/),
    ).toBeOnTheScreen();
  });
});

describe("conflict screen (AC15.1–AC15.3)", () => {
  it("shows product, local quantity, server stock, money, and no override for a Cashier", async () => {
    await render(wrap(<KonflikScreen />));
    expect(screen.getAllByText("Stok tidak mencukupi").length).toBeGreaterThan(0);
    expect(screen.getByText("Kampas rem depan")).toBeOnTheScreen();
    expect(screen.getByText("Jumlah lokal")).toBeOnTheScreen();
    expect(screen.getByText("Stok server")).toBeOnTheScreen();
    expect(screen.getByText("Override stok hanya untuk Admin atau Pemilik.")).toBeOnTheScreen();
    expect(screen.queryByText("Setujui dengan override")).toBeNull();
    expect(screen.getByText("Batalkan transaksi")).toBeOnTheScreen();
    expect(screen.getByText("Tinjau nanti")).toBeOnTheScreen();
  });

  it("offers an explicit override to an Admin and gates it on a reason", async () => {
    mockAuth.canOverrideStock = true;
    await render(wrap(<KonflikScreen />));
    await fireEvent.press(screen.getByText("Setujui dengan override"));
    expect(screen.getByText("Alasan override (wajib)")).toBeOnTheScreen();
    const submit = screen.getByRole("button", { name: "Setujui dengan override" });
    expect(submit).toBeDisabled();
    mockAuth.canOverrideStock = false;
  });
});
