import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/back-office/state-block";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Transaksi tidak ditemukan — Workshop POS",
};

/** Bahasa 404 for an unknown or out-of-scope order id. */
export default function OrderNotFound() {
  return (
    <main className="bo-page">
      <header className="bo-page-header">
        <div className="bo-page-header__text">
          <h1 className="bo-page-header__title">Transaksi tidak ditemukan</h1>
          <p className="bo-page-header__description">
            Nomor transaksi salah, sudah tidak tersedia, atau berada di outlet lain.
          </p>
        </div>
      </header>
      <EmptyState
        title="Tidak ada transaksi dengan alamat ini."
        actions={
          <Link className={buttonVariants({ variant: "primary" })} href="/orders">
            Kembali ke daftar transaksi
          </Link>
        }
      >
        <p>Periksa kembali tautan atau cari transaksi dari daftar.</p>
      </EmptyState>
    </main>
  );
}
