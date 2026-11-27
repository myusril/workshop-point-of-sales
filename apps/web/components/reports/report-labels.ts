import type { ReportKind } from "@workshop-pos/contracts";

export const REPORT_LABELS: Record<ReportKind, string> = {
  "daily-sales": "Penjualan harian",
  "payment-mix": "Komposisi pembayaran",
  "service-product": "Jasa vs produk",
  "technician-productivity": "Produktivitas teknisi",
  "stock-valuation": "Valuasi stok",
  "end-of-day": "Akhir hari",
};

export const REPORT_DESCRIPTIONS: Record<ReportKind, string> = {
  "daily-sales":
    "Jumlah transaksi menurut status, penjualan bruto, diskon, pajak, dan penjualan neto per tanggal bisnis Asia/Jakarta.",
  "payment-mix":
    "Total pembayaran dan pengembalian per metode, dengan kas diharapkan dan kembalian tunai.",
  "service-product":
    "Pendapatan jasa dan produk setelah seluruh diskon dan pajak; jumlahnya sama dengan penjualan neto.",
  "technician-productivity":
    "Transaksi selesai, baris yang dikerjakan, dan nilai jasa per teknisi.",
  "stock-valuation":
    "Stok pada akhir tanggal valuasi dikalikan biaya tercatat, dalam rupiah bulat.",
  "end-of-day":
    "Ringkasan satu hari: status transaksi, penjualan, kas diharapkan, dan transaksi batal beserta alasan.",
};
