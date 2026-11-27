import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { OrderDetail, OrderListItem, OrderTimelineEvent } from "@workshop-pos/contracts";

import { OrderFilter } from "../components/orders/order-filter";
import { OrderSummary } from "../components/orders/order-summary";
import { OrderTimeline } from "../components/orders/order-timeline";
import { OrdersTable } from "../components/orders/orders-table";
import { ReceiptPreview } from "../components/receipts/receipt-preview";
import { formatIdr } from "../lib/format";
import { orderPaymentStatusLabel } from "../lib/order-labels";

const ORDER_ID = "11111111-1111-4111-8111-111111111111";

function orderDetail(overrides: Partial<OrderDetail> = {}): OrderDetail {
  return {
    id: ORDER_ID,
    orderNumber: "INV/2026/000001",
    kind: "SALE",
    status: "PAID",
    outletId: "44444444-4444-4444-8444-444444444444",
    outletName: "Outlet Pusat",
    createdByName: "Dewi Lestari",
    customer: { id: "55555555-5555-4555-8555-555555555555", name: "Budi Santoso" },
    vehicle: {
      id: "66666666-6666-4666-8666-666666666666",
      plate: "B1234XYZ",
      brand: "Honda",
      model: "Beat 110",
    },
    technician: null,
    odometer: 12450,
    notes: null,
    taxRate: 11,
    subtotal: "300000",
    discountTotal: "30000",
    discountPercent: null,
    discountAmount: "30000",
    taxTotal: "29700",
    total: "299700",
    paidTotal: "299700",
    balanceDue: "0",
    changeTotal: "300",
    voidReason: null,
    voidedAt: null,
    completedAt: null,
    paidAt: "2026-11-27T07:05:00.000Z",
    createdAt: "2026-11-27T07:00:00.000Z",
    updatedAt: "2026-11-27T07:05:00.000Z",
    lines: [],
    payments: [],
    refunds: [],
    timeline: [],
    permissions: {
      canEditLines: false,
      canEditHeader: false,
      canIssueEstimate: false,
      canApprove: false,
      canRevertEstimate: false,
      canStartWork: false,
      canComplete: false,
      canRecordPayment: false,
      canCorrectPayment: false,
      canVoid: false,
      canPrintReceipt: true,
      canPrintEstimate: false,
    },
    settings: {
      paperWidth: 58,
      taxRate: 11,
      cashierDiscountCapPercent: 0,
      voidReasonMinLength: 10,
    },
    receiptAvailable: true,
    printCount: 0,
    ...overrides,
  };
}

const ROWS = [
  "        BENGKEL CONTOH JAYA",
  "-----------------------------------",
  "               STRUK",
  "               SALINAN",
  "-----------------------------------",
  "Kampas rem depan",
  "1 x Rp 250.000           Rp 250.000",
  "Ganti oli mesin",
  "1 x Rp 50.000             Rp 50.000",
  "-----------------------------------",
  "Subtotal                 Rp 300.000",
  "Diskon                    Rp 30.000",
  "PPN 11%                   Rp 29.700",
  "TOTAL                    Rp 299.700",
  "-----------------------------------",
  "Tunai                    Rp 300.000",
  "Kembali                      Rp 300",
];

describe("ReceiptPreview", () => {
  it("renders the exact monospace rows on white paper with a labelled region", () => {
    const html = renderToStaticMarkup(
      <ReceiptPreview
        document={{
          paperWidth: 58,
          rows: ROWS,
          title: "STRUK",
          orderNumber: "INV/2026/000001",
        }}
      />,
    );

    expect(html).toContain("<pre");
    expect(html).toContain("INV/2026/000001");
    expect(html).toContain("Tunai");
    expect(html).toContain("Rp 300");
    expect(html).toContain("SALINAN");
    expect(html).toContain("Pratinjau struk INV/2026/000001");
  });

  it("uses the 80 mm width class for an 80 mm document", () => {
    const html = renderToStaticMarkup(
      <ReceiptPreview
        document={{ paperWidth: 80, rows: ROWS, title: "STRUK", orderNumber: "" }}
      />,
    );
    expect(html).toMatch(/paper80/);
    expect(html).toContain("Pratinjau struk");
    expect(html).not.toContain("Pratinjau struk ");
  });
});

describe("OrderSummary", () => {
  it("shows every figure, including the change, from the server payload", () => {
    const html = renderToStaticMarkup(<OrderSummary detail={orderDetail()} />);

    expect(html).toContain("Subtotal");
    expect(html).toContain(formatIdr("300000"));
    expect(html).toContain("Diskon transaksi");
    expect(html).toContain("PPN 11%");
    expect(html).toContain(formatIdr("29700"));
    expect(html).toContain(formatIdr("299700"));
    expect(html).toContain("Sisa tagihan");
    expect(html).toContain("Kembalian");
    expect(html).toContain(formatIdr("300"));
  });

  it("omits the change and discount rows when they are zero", () => {
    const html = renderToStaticMarkup(
      <OrderSummary
        detail={orderDetail({
          discountTotal: "0",
          discountAmount: "0",
          changeTotal: "0",
          taxTotal: "0",
          total: "300000",
          paidTotal: "0",
          balanceDue: "300000",
          status: "COMPLETED",
        })}
      />,
    );
    expect(html).not.toContain("Kembalian");
    expect(html).not.toContain("Diskon transaksi");
    expect(html).not.toContain("Diskon baris");
  });
});

describe("OrderTimeline", () => {
  it("renders transitions, actor, time, and reason", () => {
    const events: OrderTimelineEvent[] = [
      {
        id: "e1",
        fromStatus: null,
        toStatus: "DRAFT",
        actorName: "Dewi Lestari",
        reason: null,
        createdAt: "2026-11-27T07:00:00.000Z",
      },
      {
        id: "e2",
        fromStatus: "DRAFT",
        toStatus: "ESTIMATED",
        actorName: "Andi Pratama",
        reason: "Estimasi awal",
        createdAt: "2026-11-27T07:10:00.000Z",
      },
    ];

    const html = renderToStaticMarkup(<OrderTimeline events={events} />);
    expect(html).toContain("Draf");
    expect(html).toContain("Draf → Estimasi");
    expect(html).toContain("Andi Pratama");
    expect(html).toContain("Alasan: Estimasi awal");
  });

  it("has an explicit empty state", () => {
    const html = renderToStaticMarkup(<OrderTimeline events={[]} />);
    expect(html).toContain("Belum ada perubahan status.");
  });
});

describe("OrdersTable", () => {
  it("links the order number and exposes figures and status as text", () => {
    const item: OrderListItem = {
      id: ORDER_ID,
      orderNumber: "INV/2026/000001",
      kind: "SALE",
      status: "PAID",
      outletId: "44444444-4444-4444-8444-444444444444",
      outletName: "Outlet Pusat",
      customerName: "Budi Santoso",
      vehiclePlate: "B1234XYZ",
      technicianName: null,
      lineCount: 2,
      total: "299700",
      paidTotal: "299700",
      balanceDue: "0",
      createdAt: "2026-11-27T07:00:00.000Z",
    };

    const html = renderToStaticMarkup(<OrdersTable items={[item]} />);
    expect(html).toContain(`/orders/${ORDER_ID}`);
    expect(html).toContain("INV/2026/000001");
    expect(html).toContain("B1234XYZ");
    expect(html).toContain("Budi Santoso");
    expect(html).toContain("Dibayar");
    expect(html).toContain(formatIdr("299700"));
    expect(html).toContain("Daftar transaksi");
  });
});

describe("OrderFilter", () => {
  it("lists every status label and keeps the typed values", () => {
    const html = renderToStaticMarkup(
      <OrderFilter query={{ q: "B1234XYZ", status: "PAID" }} hasFilters />,
    );
    expect(html).toContain("Semua status");
    expect(html).toContain("Estimasi");
    expect(html).toContain("Dibatalkan");
    expect(html).toContain('value="B1234XYZ"');
    expect(html).toContain("Hapus filter");
    expect(html).toContain('action="/orders"');
  });

  it("hides the reset link when no filter is active", () => {
    const html = renderToStaticMarkup(<OrderFilter query={{}} hasFilters={false} />);
    expect(html).not.toContain("Hapus filter");
  });
});

describe("payment status copy", () => {
  it("reports voided and paid orders before the balance", () => {
    expect(orderPaymentStatusLabel("VOID", 0n)).toBe("Dibatalkan");
    expect(orderPaymentStatusLabel("PAID", 0n)).toBe("Lunas");
    expect(orderPaymentStatusLabel("COMPLETED", 45_000n)).toBe("Belum lunas");
    expect(orderPaymentStatusLabel("COMPLETED", 0n)).toBe("Lunas");
  });
});
