import Link from "next/link";
import type { ReactNode } from "react";

import { EmptyState, ErrorState } from "@/components/back-office/state-block";
import { buttonVariants } from "@/components/ui/button";

interface CustomersEmptyStateProps {
  /** Create control rendered by the page so this module stays action-free. */
  createAction?: ReactNode;
  /** A read-only role is never told to do something it cannot do. */
  canManage: boolean;
}

/** A successful read with no customers at all: true zero, not a failed read. */
export function CustomersEmptyState({ createAction, canManage }: CustomersEmptyStateProps) {
  return (
    <EmptyState title="Belum ada pelanggan." actions={createAction}>
      {canManage
        ? "Tambahkan pelanggan pertama saat kendaraan datang untuk servis. Nama dan nomor HP dipakai untuk menemukan kendaraan; catatan bebas tidak perlu memuat data pribadi."
        : "Belum ada pelanggan pada bisnis ini. Hanya Pemilik, Admin, atau Kasir yang dapat menambahkan pelanggan."}
    </EmptyState>
  );
}

interface CustomersFilteredEmptyStateProps {
  /** The submitted search, echoed so the user sees what was searched. */
  query: string;
  resetHref: string;
}

/** A successful read where the search matched nothing. */
export function CustomersFilteredEmptyState({ query, resetHref }: CustomersFilteredEmptyStateProps) {
  return (
    <EmptyState
      title={query.length > 0 ? `Tidak ada pelanggan untuk "${query}".` : "Tidak ada pelanggan yang cocok."}
      actions={
        <Link className={buttonVariants({ variant: "secondary" })} href={resetHref}>
          Hapus pencarian
        </Link>
      }
    >
      Pencarian berhasil dijalankan, tetapi tidak ada pelanggan yang cocok. Periksa ejaan nama atau
      nomor HP, lalu coba lagi.
    </EmptyState>
  );
}

interface CustomersOutOfRangeStateProps {
  /** Total rows that exist, so the page never pretends the list is empty. */
  total: number;
  /** Page 1 with the current filters, not a bare list. */
  pageOneHref: string;
}

/**
 * A page number beyond the result set: the rows are missing, the data is not.
 * Rendering the true-zero empty state beside a non-zero count is misleading,
 * so this state names the page and links back to the first page.
 */
export function CustomersOutOfRangeState({ total, pageOneHref }: CustomersOutOfRangeStateProps) {
  return (
    <EmptyState
      title="Halaman ini tidak berisi pelanggan."
      actions={
        <Link className={buttonVariants({ variant: "secondary" })} href={pageOneHref}>
          Ke halaman pertama
        </Link>
      }
    >
      Daftar berisi {total} pelanggan. Kembali ke halaman pertama untuk melihatnya.
    </EmptyState>
  );
}

interface CustomersErrorPanelProps {
  message: string;
  retryHref: string;
}

/** A failed read: no rows, no counts, and never a fabricated zero. */
export function CustomersErrorPanel({ message, retryHref }: CustomersErrorPanelProps) {
  return (
    <ErrorState
      title="Data pelanggan gagal dimuat."
      actions={
        <Link className={buttonVariants({ variant: "secondary" })} href={retryHref}>
          Coba lagi
        </Link>
      }
    >
      {message} Daftar dan jumlah pelanggan tidak ditampilkan agar tidak menyesatkan.
    </ErrorState>
  );
}
