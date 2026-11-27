import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/back-office/state-block";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Struk tidak ditemukan — Workshop POS",
};

export default function PrintReceiptNotFound() {
  return (
    <main className="bo-page">
      <header className="bo-page-header">
        <div className="bo-page-header__text">
          <h1 className="bo-page-header__title">Struk tidak ditemukan</h1>
          <p className="bo-page-header__description">
            Transaksi ini tidak ada atau berada di luar outlet Anda.
          </p>
        </div>
      </header>
      <EmptyState
        title="Tidak ada dokumen untuk dicetak."
        actions={
          <Link className={buttonVariants({ variant: "primary" })} href="/orders">
            Kembali ke daftar transaksi
          </Link>
        }
      >
        <p>Buka transaksi dari daftar, lalu pilih cetak ulang.</p>
      </EmptyState>
    </main>
  );
}
