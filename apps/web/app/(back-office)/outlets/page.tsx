import { AuthError, can, listOutlets, type AuthContext } from "@workshop-pos/auth";
import type { Outlet } from "@workshop-pos/contracts";
import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";
import { Suspense } from "react";

import { AppBar } from "@/components/auth/AppBar";
import { PageSkeleton } from "@/components/back-office/PageSkeleton";
import { getAuthRuntime, getSessionPayload, requirePageAuthContext } from "@/lib/auth/server";

import { OutletCreateForm } from "./outlet-create-form";
import { OutletsTable } from "./outlets-table";

export const metadata: Metadata = {
  title: "Outlet — Workshop POS",
};

export const dynamic = "force-dynamic";

export default async function OutletsPage() {
  // The guard explains an idle-timeout sign-out (reason=expired) on /login.
  const authContext = await requirePageAuthContext();
  const session = await getSessionPayload(authContext);

  // A direct URL outside the role's permissions renders forbidden.tsx in this
  // segment with an HTTP 403 status, never a 200 page that only looks denied.
  // Nothing below may stream before this check runs.
  if (!can(session.user.role, "manage_outlets")) forbidden();

  return (
    <>
      <AppBar session={session} current="outlets" />
      <main className="wp3-page">
        <header className="wp3-page__header">
          <div>
            <h1 className="wp3-page__title">Outlet</h1>
            <p className="wp3-page__lead">
              Kelola outlet bengkel. Penugasan staf dan transaksi mengikuti outlet yang aktif.
            </p>
          </div>
        </header>

        <div className="wp3-page__body">
          {/* Suspense sits after the permission check: a denied role still gets
              a real 403 instead of a streamed 200. */}
          <Suspense fallback={<PageSkeleton label="Memuat outlet…" testId="outlets-loading" />}>
            <OutletsData authContext={authContext} />
          </Suspense>
        </div>
      </main>
    </>
  );
}

async function OutletsData({ authContext }: { authContext: AuthContext }) {
  let outlets: Outlet[] | null = null;
  let loadError: string | null = null;

  try {
    outlets = (await listOutlets(getAuthRuntime().db, authContext)).items;
  } catch (error) {
    loadError =
      error instanceof AuthError
        ? error.message
        : "Data outlet gagal dimuat. Periksa koneksi, lalu coba lagi.";
  }

  if (loadError || !outlets) {
    return (
      <section
        className="wp3-state"
        role="alert"
        aria-labelledby="outlets-error-title"
        data-testid="outlets-load-error"
      >
        <h2 className="wp3-state__title" id="outlets-error-title">
          Data outlet gagal dimuat.
        </h2>
        <p className="wp3-state__body">
          {loadError ?? "Data outlet gagal dimuat."} Daftar outlet tidak ditampilkan agar tidak
          menyesatkan.
        </p>
        <div className="wp3-state__actions">
          <Link className="wp3-btn" href="/outlets">
            Coba lagi
          </Link>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="wp3-panel" aria-labelledby="outlets-list-title">
        <div className="wp3-panel__header">
          <h2 className="wp3-panel__title" id="outlets-list-title">
            Daftar outlet
          </h2>
          <span className="wp3-panel__meta">{outlets.length} outlet</span>
        </div>

        {outlets.length === 0 ? (
          <div className="wp3-state wp3-panel__body" data-testid="outlets-empty">
            <h3 className="wp3-state__title">Belum ada outlet.</h3>
            <p className="wp3-state__body">
              Buat outlet pertama untuk menugaskan staf dan mencatat penjualan per lokasi.
            </p>
            <div className="wp3-state__actions">
              <a className="wp3-btn wp3-btn--primary" href="#tambah-outlet">
                Buat outlet
              </a>
            </div>
          </div>
        ) : (
          <OutletsTable outlets={outlets} />
        )}
      </section>

      <OutletCreateForm outletCount={outlets.length} />
    </>
  );
}
