import type { LifecycleTone } from "@/src/theme/theme";

/** Shared Bahasa Indonesia labels for the queue, chip, and conflict badge. */

export interface StatusLabel {
  label: string;
  tone: LifecycleTone;
}

export function outboxStatusLabel(state: string): StatusLabel {
  switch (state) {
    case "SENDING":
      return { label: "Mengirim", tone: "sending" };
    case "RETRY":
    case "FAILED":
      return { label: "Gagal sinkron", tone: "syncFailed" };
    case "CONFLICT":
      return { label: "Perlu tinjauan", tone: "needsReview" };
    case "APPLIED":
      return { label: "Tersinkron", tone: "synced" };
    case "VOIDED":
      return { label: "Dibatalkan", tone: "void" };
    case "QUEUED":
    default:
      return { label: "Menunggu sinkron", tone: "pendingSync" };
  }
}

export interface SyncChipInput {
  online: boolean;
  syncing: boolean;
  queued: number;
  conflicts: number;
  failed: number;
}

/** DESIGN §7.5: icon plus text, never colour alone. */
export function syncChipLabel(input: SyncChipInput): string {
  if (input.syncing) return "Mengirim…";
  if (input.conflicts > 0) {
    return `${input.conflicts} perlu tinjauan`;
  }
  if (!input.online) {
    return input.queued > 0 ? `Offline: ${input.queued} menunggu` : "Offline";
  }
  if (input.failed > 0) return "Gagal sinkron";
  if (input.queued > 0) return `${input.queued} menunggu`;
  return "Online";
}

export function conflictTitle(code: string | null): string {
  switch (code) {
    case "STOCK_INSUFFICIENT":
      return "Stok tidak mencukupi";
    case "PRICE_CHANGED":
      return "Harga berubah";
    case "PLATE_REASSIGNED":
      return "Kendaraan sudah pindah pemilik";
    case "CASH_REPORTING":
      return "Perlu rekonsiliasi kas";
    default:
      return "Perlu tinjauan";
  }
}

export function conflictCodeExplanation(code: string | null): string {
  switch (code) {
    case "STOCK_INSUFFICIENT":
      return "Stok di server lebih kecil daripada jumlah yang terjual. Uang yang sudah diterima tetap sah; pilih override dengan alasan atau batalkan transaksi.";
    case "PRICE_CHANGED":
      return "Harga katalog berubah setelah transaksi dibuat. Pelanggan tetap membayar harga lokal yang tercatat.";
    case "PLATE_REASSIGNED":
      return "Nomor polisi ini sekarang terhubung ke pelanggan lain. Pemilik atau Admin perlu menautkan ulang secara eksplisit.";
    case "CASH_REPORTING":
      return "Transaksi tercatat pada tanggal usaha sebelumnya. Tidak memblokir penjualan, tetapi ditandai untuk laporan harian.";
    default:
      return "Transaksi menunggu keputusan eksplisit sebelum masuk laporan.";
  }
}
