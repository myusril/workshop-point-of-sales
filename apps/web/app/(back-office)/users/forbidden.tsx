import type { Metadata } from "next";

import { PermissionDenied } from "@/components/auth/PermissionDenied";

export const metadata: Metadata = {
  title: "Akses ditolak — Workshop POS",
};

/**
 * Rendered by `forbidden()` when a direct /users URL is opened by a role
 * without `manage_users`. The permission check runs in the page before Next
 * streams, so the response status is a real 403.
 */
export default function UsersForbidden() {
  return (
    <main className="wp3-page">
      <header className="wp3-page__header">
        <div>
          <h1 className="wp3-page__title">Akses ditolak</h1>
          <p className="wp3-page__lead">Halaman pengguna hanya dapat dibuka oleh Pemilik.</p>
        </div>
      </header>
      <div className="wp3-page__body">
        <PermissionDenied
          title="Hanya Pemilik yang dapat mengelola pengguna."
          message="Peran Anda tidak memiliki akses ke daftar pengguna, pembuatan akun, atau perubahan peran."
          hint="Minta Pemilik menambah atau mengubah akses Anda. Perubahan akses hanya dapat dilakukan oleh akun Pemilik."
        />
      </div>
    </main>
  );
}
