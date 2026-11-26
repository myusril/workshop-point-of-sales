import type { Metadata } from "next";

import { PermissionDenied } from "@/components/auth/PermissionDenied";

export const metadata: Metadata = {
  title: "Akses ditolak — Workshop POS",
};

/**
 * Rendered by `forbidden()` when a direct /outlets URL is opened by a role
 * without `manage_outlets`. The permission check runs in the page before Next
 * streams, so the response status is a real 403.
 */
export default function OutletsForbidden() {
  return (
    <main className="wp3-page">
      <header className="wp3-page__header">
        <div>
          <h1 className="wp3-page__title">Akses ditolak</h1>
          <p className="wp3-page__lead">Halaman outlet hanya dapat dibuka oleh Pemilik.</p>
        </div>
      </header>
      <div className="wp3-page__body">
        <PermissionDenied
          title="Hanya Pemilik yang dapat mengelola outlet."
          message="Peran Anda tidak dapat melihat, menambah, atau mengubah outlet."
          hint="Minta Pemilik menambah outlet baru atau mengubah status outlet yang sudah ada."
        />
      </div>
    </main>
  );
}
