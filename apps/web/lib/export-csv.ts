import { and, asc, eq, gte, lt } from "drizzle-orm";

import {
  assertOutletAccessAudited,
  assertPermission,
  AuthError,
  type AuthContext,
} from "@workshop-pos/auth";
import {
  type ExportLedgerQuery,
  type ExportReportKind,
  type ReportRangeQuery,
} from "@workshop-pos/contracts";
import {
  formatJakartaTimestamp,
  jakartaRangeUtc,
  todayBusinessDate,
} from "@workshop-pos/core";
import {
  appendAuditEntry,
  outlets,
  products,
  stockLedger,
  user,
  type Database,
} from "@workshop-pos/db";

import {
  getDailySalesReport,
  getEndOfDayReport,
  getPaymentMixReport,
  getServiceProductReport,
  getStockValuationReport,
  getTechnicianProductivityReport,
} from "./report-service";

/**
 * CSV export builder (PRD FR-066, AC19.1–AC19.4).
 *
 * One builder serves every report and the stock ledger. Output is UTF-8 with a
 * BOM, comma-separated with RFC 4180 quoting, Bahasa Indonesia headers, integer
 * money without separators, and Asia/Jakarta ISO 8601 timestamps. Text cells
 * that begin with a spreadsheet formula character are prefixed with an
 * apostrophe so an exported name can never execute as a formula.
 */

const BOM = "\uFEFF";

export const LEDGER_ENTRY_LABELS: Record<string, string> = {
  STOCK_IN: "Stok masuk",
  ADJUSTMENT: "Penyesuaian",
  SALE_DECREMENT: "Pengurangan penjualan",
  SALE_REVERSAL: "Pembalikan penjualan",
};

const STATUS_COLUMNS = [
  ["DRAFT", "Draf"],
  ["ESTIMATED", "Estimasi"],
  ["APPROVED", "Disetujui"],
  ["IN_PROGRESS", "Dikerjakan"],
  ["COMPLETED", "Selesai"],
  ["PAID", "Dibayar"],
  ["VOID", "Dibatalkan"],
] as const;

const METHOD_LABELS: Record<string, string> = {
  CASH: "Tunai",
  TRANSFER: "Transfer bank",
  QRIS: "QRIS",
};

function quoteCsv(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** A free-text cell: sanitized against formula injection, then RFC 4180 quoted. */
export function csvText(value: string | null | undefined): string {
  const text = value ?? "";
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return quoteCsv(safe);
}

/** A numeric/date cell that must never be reformatted by a spreadsheet. */
export function csvValue(value: string | number | bigint): string {
  return String(value);
}

export function buildCsv(rows: ReadonlyArray<ReadonlyArray<string>>): string {
  return `${BOM}${rows.map((row) => row.join(",")).join("\r\n")}\r\n`;
}

function reportFilename(kind: ExportReportKind, from: string, to: string): string {
  return `${kind}-${from}_${to}.csv`;
}

async function recordExport(
  db: Database,
  context: AuthContext,
  input: {
    kind: ExportReportKind | "stock-ledger";
    outletId: string | null;
    detail: Record<string, string | number>;
  },
): Promise<void> {
  await appendAuditEntry(
    db,
    { businessId: context.user.businessId, outletIds: context.outletIds },
    {
      action: input.kind === "stock-ledger" ? "ledger.exported" : "report.exported",
      entityType: input.kind === "stock-ledger" ? "stock_ledger" : "report",
      entityId: input.kind,
      actorId: context.user.id,
      outletId: input.outletId,
      after: input.detail,
    },
  );
}

export interface CsvExport {
  filename: string;
  content: string;
  rowCount: number;
}

export async function buildReportCsv(
  db: Database,
  context: AuthContext,
  kind: ExportReportKind,
  query: ReportRangeQuery,
): Promise<CsvExport> {
  assertPermission(context, "export_csv");

  switch (kind) {
    case "daily-sales": {
      const report = await getDailySalesReport(db, context, query);
      const rows: string[][] = [
        [
          "Tanggal",
          "Outlet",
          ...STATUS_COLUMNS.map(([, label]) => label),
          "Jumlah Transaksi",
          "Penjualan Bruto",
          "Diskon",
          "Pajak",
          "Penjualan Neto",
        ],
        ...report.days.map((day) => [
          csvValue(day.date),
          csvText(report.outlet.name),
          ...STATUS_COLUMNS.map(([status]) => csvValue(day.countsByStatus[status])),
          csvValue(day.figures.orderCount),
          csvValue(day.figures.grossSales),
          csvValue(day.figures.discounts),
          csvValue(day.figures.tax),
          csvValue(day.figures.netSales),
        ]),
      ];
      await recordExport(db, context, {
        kind,
        outletId: report.outlet.id,
        detail: { from: query.from, to: query.to, rows: report.days.length },
      });
      return {
        filename: reportFilename(kind, query.from, query.to),
        content: buildCsv(rows),
        rowCount: report.days.length,
      };
    }
    case "payment-mix": {
      const report = await getPaymentMixReport(db, context, query);
      const rows: string[][] = [
        ["Outlet", "Dari", "Sampai", "Metode", "Pembayaran", "Pengembalian", "Neto", "Kembalian"],
        ...report.methods.map((row) => [
          csvText(report.outlet.name),
          csvValue(report.from),
          csvValue(report.to),
          csvText(METHOD_LABELS[row.method] ?? row.method),
          csvValue(row.payments),
          csvValue(row.refunds),
          csvValue(row.net),
          csvValue(row.change),
        ]),
        [
          csvText(report.outlet.name),
          csvValue(report.from),
          csvValue(report.to),
          csvText("Kas diharapkan"),
          "",
          "",
          csvValue(report.expectedCash),
          csvValue(report.changeTotal),
        ],
      ];
      await recordExport(db, context, {
        kind,
        outletId: report.outlet.id,
        detail: { from: query.from, to: query.to, rows: report.methods.length },
      });
      return {
        filename: reportFilename(kind, query.from, query.to),
        content: buildCsv(rows),
        rowCount: report.methods.length,
      };
    }
    case "service-product": {
      const report = await getServiceProductReport(db, context, query);
      const rows: string[][] = [
        ["Outlet", "Dari", "Sampai", "Jenis Item", "Jumlah Baris", "Jumlah Unit", "Pendapatan"],
        [
          csvText(report.outlet.name),
          csvValue(report.from),
          csvValue(report.to),
          csvText("Produk"),
          csvValue(report.product.lineCount),
          csvValue(report.product.quantity),
          csvValue(report.product.revenue),
        ],
        [
          csvText(report.outlet.name),
          csvValue(report.from),
          csvValue(report.to),
          csvText("Jasa"),
          csvValue(report.service.lineCount),
          csvValue(report.service.quantity),
          csvValue(report.service.revenue),
        ],
        [
          csvText(report.outlet.name),
          csvValue(report.from),
          csvValue(report.to),
          csvText("Total"),
          "",
          "",
          csvValue(report.totalRevenue),
        ],
      ];
      await recordExport(db, context, {
        kind,
        outletId: report.outlet.id,
        detail: { from: query.from, to: query.to, rows: 2 },
      });
      return {
        filename: reportFilename(kind, query.from, query.to),
        content: buildCsv(rows),
        rowCount: 2,
      };
    }
    case "technician-productivity": {
      const report = await getTechnicianProductivityReport(db, context, query);
      const rows: string[][] = [
        ["Outlet", "Dari", "Sampai", "Teknisi", "Transaksi Selesai", "Baris Selesai", "Nilai Jasa"],
        ...report.technicians.map((row) => [
          csvText(report.outlet.name),
          csvValue(report.from),
          csvValue(report.to),
          csvText(row.technicianName),
          csvValue(row.completedOrders),
          csvValue(row.completedLines),
          csvValue(row.laborValue),
        ]),
      ];
      await recordExport(db, context, {
        kind,
        outletId: report.outlet.id,
        detail: { from: query.from, to: query.to, rows: report.technicians.length },
      });
      return {
        filename: reportFilename(kind, query.from, query.to),
        content: buildCsv(rows),
        rowCount: report.technicians.length,
      };
    }
    case "stock-valuation": {
      const report = await getStockValuationReport(db, context, {
        asOf: query.to,
        outletId: query.outletId,
      });
      const rows: string[][] = [
        ["Tanggal Valuasi", "Outlet", "SKU", "Produk", "Stok", "Biaya Satuan", "Nilai Persediaan"],
        ...report.items.map((item) => [
          csvValue(report.asOf),
          csvText(report.outlet.name),
          csvText(item.sku),
          csvText(item.name),
          csvValue(item.onHand),
          csvValue(item.unitCost),
          csvValue(item.value),
        ]),
        [
          csvValue(report.asOf),
          csvText(report.outlet.name),
          "",
          csvText("Total"),
          "",
          "",
          csvValue(report.totalValue),
        ],
      ];
      await recordExport(db, context, {
        kind,
        outletId: report.outlet.id,
        detail: { asOf: report.asOf, rows: report.items.length },
      });
      return {
        filename: reportFilename(kind, query.from, query.to),
        content: buildCsv(rows),
        rowCount: report.items.length,
      };
    }
    case "end-of-day": {
      const report = await getEndOfDayReport(db, context, {
        date: query.from,
        outletId: query.outletId,
      });
      const rows: string[][] = [
        ["Outlet", "Tanggal", "Bagian", "Metrik", "Kunci", "Nilai"],
        ...STATUS_COLUMNS.map(([status, label]) => [
          csvText(report.outlet.name),
          csvValue(report.date),
          csvText("Transaksi"),
          csvText(label),
          csvValue(status),
          csvValue(report.countsByStatus[status]),
        ]),
        ...[
          ["Penjualan bruto", report.figures.grossSales],
          ["Diskon", report.figures.discounts],
          ["Pajak", report.figures.tax],
          ["Penjualan neto", report.figures.netSales],
        ].map(([metric, value]) => [
          csvText(report.outlet.name),
          csvValue(report.date),
          csvText("Penjualan"),
          csvText(metric ?? ""),
          "",
          csvValue(value ?? "0"),
        ]),
        ...report.paymentMix.methods.map((row) => [
          csvText(report.outlet.name),
          csvValue(report.date),
          csvText("Pembayaran"),
          csvText(METHOD_LABELS[row.method] ?? row.method),
          csvValue(row.method),
          csvValue(row.net),
        ]),
        [
          csvText(report.outlet.name),
          csvValue(report.date),
          csvText("Kas"),
          csvText("Kas diharapkan"),
          "",
          csvValue(report.paymentMix.expectedCash),
        ],
        ...report.voids.map((voided) => [
          csvText(report.outlet.name),
          csvValue(report.date),
          csvText("Void"),
          csvText(voided.orderNumber ?? "Tanpa nomor"),
          csvText(voided.reason ?? ""),
          csvValue(voided.total),
        ]),
      ];
      await recordExport(db, context, {
        kind,
        outletId: report.outlet.id,
        detail: { date: report.date, rows: report.countsByStatus.PAID },
      });
      return {
        filename: reportFilename(kind, query.from, query.to),
        content: buildCsv(rows),
        rowCount: report.voids.length,
      };
    }
  }
}

export async function buildLedgerCsv(
  db: Database,
  context: AuthContext,
  query: ExportLedgerQuery,
): Promise<CsvExport> {
  assertPermission(context, "export_csv");

  const outletId =
    query.outletId ??
    (context.activeOutletId && context.outletIds.includes(context.activeOutletId)
      ? context.activeOutletId
      : context.outletIds.length === 1
        ? (context.outletIds[0] ?? null)
        : null);
  if (!outletId) {
    throw AuthError.validation({
      outletId: ["Pilih outlet terlebih dahulu untuk mengekspor buku besar stok."],
    });
  }
  if (!context.outletIds.includes(outletId)) {
    await assertOutletAccessAudited(db, context, outletId, "export_csv", {
      entityType: "stock_ledger",
      entityId: "export",
    });
    throw AuthError.forbidden("Anda tidak memiliki akses ke outlet tersebut.");
  }

  const [outlet] = await db
    .select({ id: outlets.id, name: outlets.name })
    .from(outlets)
    .where(and(eq(outlets.id, outletId), eq(outlets.businessId, context.user.businessId)))
    .limit(1);
  if (!outlet) throw AuthError.notFound("Outlet tidak ditemukan.");

  const from = query.from ?? todayBusinessDate();
  const to = query.to ?? from;
  const { start, endExclusive } = jakartaRangeUtc(from, to);

  const predicates = [
    eq(stockLedger.businessId, context.user.businessId),
    eq(stockLedger.outletId, outlet.id),
    gte(stockLedger.createdAt, start),
    lt(stockLedger.createdAt, endExclusive),
  ];
  if (query.productId) predicates.push(eq(stockLedger.productId, query.productId));
  if (query.entryType) predicates.push(eq(stockLedger.entryType, query.entryType));

  const rows = await db
    .select({
      createdAt: stockLedger.createdAt,
      outletName: outlets.name,
      sku: products.sku,
      productName: products.name,
      entryType: stockLedger.entryType,
      quantityBefore: stockLedger.quantityBefore,
      quantityAfter: stockLedger.quantityAfter,
      override: stockLedger.override,
      reason: stockLedger.reason,
      sourceType: stockLedger.sourceType,
      sourceRef: stockLedger.sourceRef,
      actorName: user.name,
    })
    .from(stockLedger)
    .innerJoin(outlets, eq(outlets.id, stockLedger.outletId))
    .innerJoin(products, eq(products.id, stockLedger.productId))
    .innerJoin(user, eq(user.id, stockLedger.createdBy))
    .where(and(...predicates))
    .orderBy(asc(stockLedger.createdAt), asc(stockLedger.id))
    .limit(100_001);

  if (rows.length > 100_000) {
    throw AuthError.validation(
      {},
      "Ekspor buku besar melebihi 100.000 baris. Persempit rentang tanggal atau produk.",
    );
  }

  const csvRows: string[][] = [
    [
      "Waktu",
      "Outlet",
      "SKU",
      "Produk",
      "Jenis",
      "Stok Sebelum",
      "Stok Sesudah",
      "Perubahan",
      "Override",
      "Alasan",
      "Sumber",
      "Referensi",
      "Pelaku",
    ],
    ...rows.map((row) => [
      csvValue(formatJakartaTimestamp(row.createdAt)),
      csvText(row.outletName),
      csvText(row.sku),
      csvText(row.productName),
      csvText(LEDGER_ENTRY_LABELS[row.entryType] ?? row.entryType),
      csvValue(row.quantityBefore),
      csvValue(row.quantityAfter),
      csvValue(row.quantityAfter - row.quantityBefore),
      csvText(row.override ? "Ya" : "Tidak"),
      csvText(row.reason ?? ""),
      csvText(row.sourceType),
      csvText(row.sourceRef ?? ""),
      csvText(row.actorName),
    ]),
  ];

  await recordExport(db, context, {
    kind: "stock-ledger",
    outletId: outlet.id,
    detail: { from, to, rows: rows.length },
  });

  return {
    filename: `buku-besar-stok-${from}_${to}.csv`,
    content: buildCsv(csvRows),
    rowCount: rows.length,
  };
}
