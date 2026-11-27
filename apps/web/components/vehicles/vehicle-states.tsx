import Link from "next/link";
import type { ReactNode } from "react";

import { EmptyState, ErrorState } from "@/components/back-office/state-block";
import { buttonVariants } from "@/components/ui/button";

interface VehiclesEmptyStateProps {
  /** Create control rendered by the page so this module stays action-free. */
  createAction?: ReactNode;
  /** A read-only role is never told to do something it cannot do. */
  canManage: boolean;
}

/** A successful read with no vehicles at all: true zero. */
export function VehiclesEmptyState({ createAction, canManage }: VehiclesEmptyStateProps) {
  return (
    <EmptyState title="Belum ada kendaraan." actions={createAction}>
      {canManage
        ? "Tambahkan kendaraan pertama bersama pelanggannya. Plat disimpan dalam bentuk kanonik, dan plat yang sudah terdaftar dipakai kembali alih-alih membuat data ganda."
        : "Belum ada kendaraan pada bisnis ini. Hanya Pemilik, Admin, atau Kasir yang dapat menambahkan kendaraan."}
    </EmptyState>
  );
}

interface VehiclesFilteredEmptyStateProps {
  /** The submitted search, echoed so the user sees what was searched. */
  query: string;
  resetHref: string;
  /** A drill-down from the customer list is a different empty state. */
  customerFiltered?: boolean;
}

/** A successful read where the search matched nothing. */
export function VehiclesFilteredEmptyState({
  query,
  resetHref,
  customerFiltered = false,
}: VehiclesFilteredEmptyStateProps) {
  if (customerFiltered) {
    return (
      <EmptyState
        title="Tidak ada kendaraan untuk pelanggan ini."
        actions={
          <Link className={buttonVariants({ variant: "secondary" })} href={resetHref}>
            Hapus filter
          </Link>
        }
      >
        {query.length > 0
          ? `Filter pelanggan aktif dan pencarian "${query}" tidak menemukan kendaraan untuknya. Hapus filter untuk melihat semua kendaraan.`
          : "Filter pelanggan aktif, tetapi belum ada kendaraan yang terdaftar untuk pelanggan ini. Hapus filter untuk melihat semua kendaraan."}
      </EmptyState>
    );
  }

  return (
    <EmptyState
      title={query.length > 0 ? `Tidak ada kendaraan untuk "${query}".` : "Tidak ada kendaraan yang cocok."}
      actions={
        <Link className={buttonVariants({ variant: "secondary" })} href={resetHref}>
          Hapus pencarian
        </Link>
      }
    >
      Pencarian berhasil dijalankan, tetapi tidak ada kendaraan yang cocok. Coba nomor polisi tanpa
      spasi, sebagian plat, nama pelanggan, atau merek kendaraan.
    </EmptyState>
  );
}

interface VehiclesOutOfRangeStateProps {
  /** Total rows that exist, so the page never pretends the list is empty. */
  total: number;
  /** Page 1 with the current filters, not a bare list. */
  pageOneHref: string;
}

/** A page number beyond the result set: the rows are missing, the data is not. */
export function VehiclesOutOfRangeState({ total, pageOneHref }: VehiclesOutOfRangeStateProps) {
  return (
    <EmptyState
      title="Halaman ini tidak berisi kendaraan."
      actions={
        <Link className={buttonVariants({ variant: "secondary" })} href={pageOneHref}>
          Ke halaman pertama
        </Link>
      }
    >
      Daftar berisi {total} kendaraan. Kembali ke halaman pertama untuk melihatnya.
    </EmptyState>
  );
}

interface VehicleHistoryOutOfRangeStateProps {
  /** Total transactions that exist, so the page never pretends there are none. */
  total: number;
  pageOneHref: string;
}

/** A history page number beyond the result set. */
export function VehicleHistoryOutOfRangeState({
  total,
  pageOneHref,
}: VehicleHistoryOutOfRangeStateProps) {
  return (
    <EmptyState
      title="Halaman ini tidak berisi transaksi."
      actions={
        <Link className={buttonVariants({ variant: "secondary" })} href={pageOneHref}>
          Ke halaman pertama
        </Link>
      }
    >
      Riwayat berisi {total} transaksi. Kembali ke halaman pertama untuk melihatnya.
    </EmptyState>
  );
}

interface VehiclesErrorPanelProps {
  message: string;
  retryHref: string;
}

/** A failed read: no rows and no counts, never a fabricated zero. */
export function VehiclesErrorPanel({ message, retryHref }: VehiclesErrorPanelProps) {
  return (
    <ErrorState
      title="Data kendaraan gagal dimuat."
      actions={
        <Link className={buttonVariants({ variant: "secondary" })} href={retryHref}>
          Coba lagi
        </Link>
      }
    >
      {message} Daftar dan jumlah kendaraan tidak ditampilkan agar tidak menyesatkan.
    </ErrorState>
  );
}

interface VehicleHistoryEmptyStateProps {
  plate: string;
}

/**
 * A successful history read with no orders. WP6 owns order creation, so there
 * is no fake intake action here; the copy says transactions come later.
 */
export function VehicleHistoryEmptyState({ plate }: VehicleHistoryEmptyStateProps) {
  return (
    <EmptyState title="Belum ada riwayat untuk plat ini.">
      Transaksi untuk {plate} akan muncul di sini setelah modul transaksi mencatat servis pertama.
      Riwayat hanya-baca sampai modul transaksi tersedia.
    </EmptyState>
  );
}

interface VehicleHistoryErrorPanelProps {
  message: string;
  retryHref: string;
}

/** A failed history read: visit counts and money stay hidden, not zeroed. */
export function VehicleHistoryErrorPanel({ message, retryHref }: VehicleHistoryErrorPanelProps) {
  return (
    <ErrorState
      title="Riwayat gagal dimuat."
      actions={
        <Link className={buttonVariants({ variant: "secondary" })} href={retryHref}>
          Coba lagi
        </Link>
      }
    >
      {message} Kunjungan, total belanja, dan sisa tagihan tidak ditampilkan agar tidak menyesatkan.
    </ErrorState>
  );
}
