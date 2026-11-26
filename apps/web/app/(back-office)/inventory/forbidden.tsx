import type { Metadata } from "next";

import { PermissionDenied } from "@/components/auth/PermissionDenied";

export const metadata: Metadata = {
  title: "Akses ditolak — Workshop POS",
};

/**
 * Rendered by `forbidden()` when a direct /inventory URL is opened by a role
 * without `manage_stock` (Cashier/Mechanic). The permission check runs before
 * Next streams, so the response status is a real 403.
 */
export default function InventoryForbidden() {
  return (
    <main className="bo-page">
      <header className="bo-page-header">
        <div className="bo-page-header__text">
          <h1 className="bo-page-header__title">Akses ditolak</h1>
          <p className="bo-page-header__description">Halaman stok hanya dapat dibuka oleh Admin atau Pemilik.</p>
        </div>
      </header>
      <div className="bo-stack">
        <PermissionDenied
          title="Hanya Admin atau Pemilik yang dapat menyesuaikan stok."
          message="Peran Anda tidak dapat mencatat stok masuk, penyesuaian, atau melihat buku besar."
          hint="Minta Admin atau Pemilik mencatat pergerakan stok. Setiap perubahan stok dicatat di log audit."
        />
      </div>
    </main>
  );
}
