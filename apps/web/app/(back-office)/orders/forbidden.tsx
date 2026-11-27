import type { Metadata } from "next";

import { PermissionDenied } from "@/components/auth/PermissionDenied";

export const metadata: Metadata = {
  title: "Akses ditolak — Workshop POS",
};

/** Rendered by `forbidden()` for a role/outlet outside the order scope. */
export default function OrdersForbidden() {
  return (
    <main className="bo-page">
      <header className="bo-page-header">
        <div className="bo-page-header__text">
          <h1 className="bo-page-header__title">Akses ditolak</h1>
          <p className="bo-page-header__description">
            Anda tidak memiliki akses ke transaksi atau outlet ini.
          </p>
        </div>
      </header>
      <div className="bo-stack">
        <PermissionDenied
          title="Transaksi ini di luar akses Anda."
          message="Kasir dan Mekanik hanya dapat membuka transaksi pada outlet yang ditugaskan; Mekanik hanya melihat pekerjaan yang ditugaskan kepadanya."
          hint="Minta Admin atau Pemilik meninjau penugasan outlet Anda. Setiap percobaan akses lintas outlet dicatat di log audit."
        />
      </div>
    </main>
  );
}
