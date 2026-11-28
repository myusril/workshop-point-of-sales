import { can } from "@workshop-pos/auth";
import type { Metadata } from "next";
import Link from "next/link";

import { ROLE_LABELS } from "@/components/auth/labels";
import {
  getAuthRuntime,
  getPageAuthContext,
  getSessionPayload,
  requirePageAuthContext,
} from "@/lib/auth/server";
import {
  DEFAULT_PRODUCT_NAME,
  getBrandingForBusiness,
} from "@/lib/settings-service";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const authContext = await getPageAuthContext();
  if (!authContext) return { title: `Beranda — ${DEFAULT_PRODUCT_NAME}` };

  const branding = await getBrandingForBusiness(
    getAuthRuntime().db,
    authContext.user.businessId,
  );
  return { title: `Beranda — ${branding.productName}` };
}

export default async function HomePage() {
  // The guard explains an idle-timeout sign-out (reason=expired) on /login.
  const authContext = await requirePageAuthContext();
  const session = await getSessionPayload(authContext);
  const branding = await getBrandingForBusiness(
    getAuthRuntime().db,
    authContext.user.businessId,
  );
  const roleLabel = ROLE_LABELS[session.user.role];
  const activeOutlet = session.outlets.find((outlet) => outlet.id === session.session.activeOutletId) ?? null;
  const canManageUsers = can(session.user.role, "manage_users");
  const canManageOutlets = can(session.user.role, "manage_outlets");
  const seesAllOutlets = session.user.role === "OWNER" || session.user.role === "ADMIN";

  return (
    <main className="wp3-page">
        <header className="wp3-page__header">
          <div>
            <h1 className="wp3-page__title wp3-page__title--brand">{branding.productName}</h1>
            <p className="wp3-page__lead">
              Masuk sebagai {session.user.name}, {roleLabel}
              {activeOutlet ? `, ${activeOutlet.name}` : ""}.
            </p>
          </div>
        </header>

        <div className="wp3-page__body">
          <section className="wp3-panel" aria-labelledby="home-access-title">
            <div className="wp3-panel__header">
              <h2 className="wp3-panel__title" id="home-access-title">
                Akses Anda
              </h2>
            </div>
            <div className="wp3-panel__body">
              <dl className="wp3-facts">
                <div className="wp3-facts__row">
                  <dt>Peran</dt>
                  <dd>{roleLabel}</dd>
                </div>
                <div className="wp3-facts__row">
                  <dt>Cakupan outlet</dt>
                  <dd>
                    {seesAllOutlets
                      ? "Semua outlet bisnis"
                      : session.outlets.map((outlet) => outlet.name).join(", ") || "Belum ada outlet yang ditugaskan"}
                  </dd>
                </div>
                <div className="wp3-facts__row">
                  <dt>Outlet aktif</dt>
                  <dd>{activeOutlet?.name ?? "Belum dipilih"}</dd>
                </div>
              </dl>
            </div>
          </section>

          <section className="wp3-panel" aria-labelledby="home-next-title">
            <div className="wp3-panel__header">
              <h2 className="wp3-panel__title" id="home-next-title">
                Pengelolaan back-office
              </h2>
            </div>
            <div className="wp3-panel__body">
              {canManageUsers || canManageOutlets ? (
                <>
                  <p className="wp3-state__body">
                    Kelola akses staf dan outlet dari halaman berikut. Setiap perubahan akses dicatat di log audit.
                  </p>
                  <div className="wp3-state__actions">
                    {canManageUsers ? (
                      <Link className="wp3-btn wp3-btn--primary" href="/users">
                        Kelola pengguna
                      </Link>
                    ) : null}
                    {canManageOutlets ? (
                      <Link className="wp3-btn" href="/outlets">
                        Kelola outlet
                      </Link>
                    ) : null}
                  </div>
                </>
              ) : (
                <p className="wp3-state__body">
                  Peran {roleLabel} tidak mengelola pengguna atau outlet. Pencatatan penjualan dan servis akan
                  tersedia di aplikasi mobile pada rilis berikutnya.
                </p>
              )}
            </div>
          </section>
        </div>
      </main>
  );
}
