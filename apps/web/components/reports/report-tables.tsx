import type {
  DailySalesReport,
  EndOfDayReport,
  OrderStatusCounts,
  PaymentMixReport,
  ServiceProductReport,
  StockValuationReport,
  TechnicianProductivityReport,
} from "@workshop-pos/contracts";

import { formatIdr as formatIdrCore } from "@workshop-pos/core";

import { EmptyState } from "@/components/back-office/state-block";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatIdr, formatWibDate, formatWibDateTime } from "@/lib/format";

const STATUS_LABELS: Record<keyof OrderStatusCounts, string> = {
  DRAFT: "Draf",
  ESTIMATED: "Estimasi",
  APPROVED: "Disetujui",
  IN_PROGRESS: "Dikerjakan",
  COMPLETED: "Selesai",
  PAID: "Dibayar",
  VOID: "Dibatalkan",
};

const METHOD_LABELS = {
  CASH: "Tunai",
  TRANSFER: "Transfer bank",
  QRIS: "QRIS",
} as const;

/** Net/expected-cash/valuation figures can be negative; never render a false zero. */
function formatSignedIdr(value: string): string {
  try {
    return formatIdrCore(BigInt(value));
  } catch {
    return "—";
  }
}

function StatusCountCells({ counts }: { counts: OrderStatusCounts }) {
  return (
    <>
      {(Object.keys(STATUS_LABELS) as (keyof OrderStatusCounts)[]).map((status) => (
        <TableCell key={status} className="bo-cell-num">
          {counts[status]}
        </TableCell>
      ))}
    </>
  );
}

export function DailySalesTable({ report }: { report: DailySalesReport }) {
  return (
    <Table containerLabel="Penjualan harian">
      <TableCaption>
        Penjualan harian per tanggal bisnis Asia/Jakarta, {formatWibDate(`${report.from}T00:00:00+07:00`)} sampai{" "}
        {formatWibDate(`${report.to}T00:00:00+07:00`)}.
      </TableCaption>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead scope="col">Tanggal</TableHead>
          {(Object.keys(STATUS_LABELS) as (keyof OrderStatusCounts)[]).map((status) => (
            <TableHead key={status} scope="col" className="bo-cell-num">
              {STATUS_LABELS[status]}
            </TableHead>
          ))}
          <TableHead scope="col" className="bo-cell-num">
            Transaksi dibayar
          </TableHead>
          <TableHead scope="col" className="bo-cell-num">
            Penjualan bruto
          </TableHead>
          <TableHead scope="col" className="bo-cell-num">
            Diskon
          </TableHead>
          <TableHead scope="col" className="bo-cell-num">
            Pajak
          </TableHead>
          <TableHead scope="col" className="bo-cell-num">
            Penjualan neto
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {report.days.map((day) => (
          <TableRow key={day.date}>
            <TableCell>{formatWibDate(`${day.date}T00:00:00+07:00`)}</TableCell>
            <StatusCountCells counts={day.countsByStatus} />
            <TableCell className="bo-cell-num">{day.figures.orderCount}</TableCell>
            <TableCell className="bo-cell-num">{formatIdr(day.figures.grossSales)}</TableCell>
            <TableCell className="bo-cell-num">{formatIdr(day.figures.discounts)}</TableCell>
            <TableCell className="bo-cell-num">{formatIdr(day.figures.tax)}</TableCell>
            <TableCell className="bo-cell-num">{formatIdr(day.figures.netSales)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell>Total</TableCell>
          <StatusCountCells counts={report.totals.countsByStatus} />
          <TableCell className="bo-cell-num">{report.totals.figures.orderCount}</TableCell>
          <TableCell className="bo-cell-num">{formatIdr(report.totals.figures.grossSales)}</TableCell>
          <TableCell className="bo-cell-num">{formatIdr(report.totals.figures.discounts)}</TableCell>
          <TableCell className="bo-cell-num">{formatIdr(report.totals.figures.tax)}</TableCell>
          <TableCell className="bo-cell-num">{formatIdr(report.totals.figures.netSales)}</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}

export function PaymentMixTable({ report }: { report: PaymentMixReport }) {
  return (
    <Table containerLabel="Komposisi pembayaran">
      <TableCaption>
        Pembayaran diterima dan pengembalian dibayar pada periode ini. Kas diharapkan = pembayaran tunai −
        pengembalian tunai; kembalian sudah termasuk di dalam baris tunai.
      </TableCaption>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead scope="col">Metode</TableHead>
          <TableHead scope="col" className="bo-cell-num">
            Pembayaran
          </TableHead>
          <TableHead scope="col" className="bo-cell-num">
            Pengembalian
          </TableHead>
          <TableHead scope="col" className="bo-cell-num">
            Neto
          </TableHead>
          <TableHead scope="col" className="bo-cell-num">
            Kembalian
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {report.methods.map((row) => (
          <TableRow key={row.method}>
            <TableCell>{METHOD_LABELS[row.method]}</TableCell>
            <TableCell className="bo-cell-num">{formatIdr(row.payments)}</TableCell>
            <TableCell className="bo-cell-num">{formatIdr(row.refunds)}</TableCell>
            <TableCell className="bo-cell-num">{formatSignedIdr(row.net)}</TableCell>
            <TableCell className="bo-cell-num">{formatIdr(row.change)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell>Total neto</TableCell>
          <TableCell className="bo-cell-num" colSpan={2}>
            Kas diharapkan {formatSignedIdr(report.expectedCash)}
          </TableCell>
          <TableCell className="bo-cell-num">{formatSignedIdr(report.totalNet)}</TableCell>
          <TableCell className="bo-cell-num">{formatIdr(report.changeTotal)}</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}

export function ServiceProductTable({ report }: { report: ServiceProductReport }) {
  const rows = [
    { key: "PRODUCT", label: "Produk", bucket: report.product },
    { key: "SERVICE", label: "Jasa", bucket: report.service },
  ];
  return (
    <Table containerLabel="Pendapatan jasa dan produk">
      <TableCaption>
        Pendapatan setelah seluruh diskon dan pajak. Jumlah kedua baris sama dengan penjualan neto.
      </TableCaption>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead scope="col">Jenis item</TableHead>
          <TableHead scope="col" className="bo-cell-num">
            Baris
          </TableHead>
          <TableHead scope="col" className="bo-cell-num">
            Unit
          </TableHead>
          <TableHead scope="col" className="bo-cell-num">
            Pendapatan
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.key}>
            <TableCell>{row.label}</TableCell>
            <TableCell className="bo-cell-num">{row.bucket.lineCount}</TableCell>
            <TableCell className="bo-cell-num">{row.bucket.quantity}</TableCell>
            <TableCell className="bo-cell-num">{formatIdr(row.bucket.revenue)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell>Total</TableCell>
          <TableCell className="bo-cell-num" colSpan={2}>
            Diskon {formatIdr(report.discountTotal)} · Pajak {formatIdr(report.taxTotal)}
          </TableCell>
          <TableCell className="bo-cell-num">{formatIdr(report.totalRevenue)}</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}

export function TechnicianTable({ report }: { report: TechnicianProductivityReport }) {
  if (report.technicians.length === 0) {
    return (
      <EmptyState title="Belum ada pekerjaan selesai pada periode ini.">
        Produktivitas teknisi dihitung dari transaksi yang selesai atau dibayar pada periode dan outlet ini.
      </EmptyState>
    );
  }

  return (
    <Table containerLabel="Produktivitas teknisi">
      <TableCaption>Transaksi selesai, baris yang dikerjakan, dan nilai jasa per teknisi.</TableCaption>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead scope="col">Teknisi</TableHead>
          <TableHead scope="col" className="bo-cell-num">
            Transaksi selesai
          </TableHead>
          <TableHead scope="col" className="bo-cell-num">
            Baris selesai
          </TableHead>
          <TableHead scope="col" className="bo-cell-num">
            Nilai jasa
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {report.technicians.map((technician) => (
          <TableRow key={technician.technicianId}>
            <TableCell>{technician.technicianName}</TableCell>
            <TableCell className="bo-cell-num">{technician.completedOrders}</TableCell>
            <TableCell className="bo-cell-num">{technician.completedLines}</TableCell>
            <TableCell className="bo-cell-num">{formatIdr(technician.laborValue)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function StockValuationTable({ report }: { report: StockValuationReport }) {
  return (
    <Table containerLabel="Valuasi stok">
      <TableCaption>
        Stok pada akhir tanggal valuasi dikalikan biaya tercatat per produk.
      </TableCaption>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead scope="col">SKU</TableHead>
          <TableHead scope="col">Produk</TableHead>
          <TableHead scope="col" className="bo-cell-num">
            Stok
          </TableHead>
          <TableHead scope="col" className="bo-cell-num">
            Biaya satuan
          </TableHead>
          <TableHead scope="col" className="bo-cell-num">
            Nilai persediaan
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {report.items.map((item) => (
          <TableRow key={item.productId}>
            <TableCell>{item.sku}</TableCell>
            <TableCell>{item.name}</TableCell>
            <TableCell className="bo-cell-num">{item.onHand}</TableCell>
            <TableCell className="bo-cell-num">{formatIdr(item.unitCost)}</TableCell>
            <TableCell className="bo-cell-num">{formatSignedIdr(item.value)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={4}>Total nilai persediaan</TableCell>
          <TableCell className="bo-cell-num">{formatSignedIdr(report.totalValue)}</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}

export function StatusCountsTable({
  counts,
  label = "Jumlah transaksi menurut status",
}: {
  counts: OrderStatusCounts;
  label?: string;
}) {
  return (
    <Table containerLabel={label}>
      <TableCaption>{label}</TableCaption>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead scope="col">Status</TableHead>
          <TableHead scope="col" className="bo-cell-num">
            Jumlah
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {(Object.keys(STATUS_LABELS) as (keyof OrderStatusCounts)[]).map((status) => (
          <TableRow key={status}>
            <TableCell>{STATUS_LABELS[status]}</TableCell>
            <TableCell className="bo-cell-num">{counts[status]}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function VoidsTable({ report }: { report: EndOfDayReport }) {
  if (report.voids.length === 0) {
    return (
      <EmptyState title="Tidak ada transaksi yang dibatalkan pada tanggal ini.">
        Transaksi batal akan muncul di sini beserta alasannya.
      </EmptyState>
    );
  }

  return (
    <Table containerLabel="Transaksi dibatalkan">
      <TableCaption>Transaksi batal pada tanggal bisnis ini beserta alasan dan nilainya.</TableCaption>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead scope="col">Nomor</TableHead>
          <TableHead scope="col">Waktu batal</TableHead>
          <TableHead scope="col">Alasan</TableHead>
          <TableHead scope="col" className="bo-cell-num">
            Nilai
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {report.voids.map((voided) => (
          <TableRow key={voided.orderId}>
            <TableCell>{voided.orderNumber ?? "—"}</TableCell>
            <TableCell>{formatWibDateTime(voided.voidedAt)}</TableCell>
            <TableCell>{voided.reason ?? "—"}</TableCell>
            <TableCell className="bo-cell-num">{formatIdr(voided.total)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function SalesFiguresSummary({ report }: { report: EndOfDayReport }) {
  return (
    <dl className="bo-summary">
      {[
        ["Transaksi dibayar", String(report.figures.orderCount)],
        ["Penjualan bruto", formatIdr(report.figures.grossSales)],
        ["Diskon", formatIdr(report.figures.discounts)],
        ["Pajak", formatIdr(report.figures.tax)],
        ["Penjualan neto", formatIdr(report.figures.netSales)],
        ["Kas diharapkan", formatSignedIdr(report.paymentMix.expectedCash)],
      ].map(([label, value]) => (
        <div key={label} className="bo-summary__item">
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
