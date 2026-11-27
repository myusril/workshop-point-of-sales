import { can, listOutlets, type AuthContext } from "@workshop-pos/auth";
import type {
  Branding,
  OutletSettings,
  OutletSummary,
} from "@workshop-pos/contracts";
import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";

import { PageHeader } from "@/components/back-office/page-header";
import { ErrorState } from "@/components/back-office/state-block";
import { BrandingForm } from "@/components/settings/branding-form";
import { SettingsForm } from "@/components/settings/settings-form";
import { buttonVariants } from "@/components/ui/button";
import {
  getAuthRuntime,
  getSessionPayload,
  requirePageAuthContext,
} from "@/lib/auth/server";
import { getBranding, getOutletSettings } from "@/lib/settings-service";

export const metadata: Metadata = {
  title: "Pengaturan — Workshop POS",
};

export const dynamic = "force-dynamic";

interface SettingsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function chooseOutlet(
  outlets: readonly OutletSummary[],
  activeOutletId: string | null,
  requested: string | undefined,
): OutletSummary | null {
  if (requested) {
    const requestedOutlet = outlets.find((outlet) => outlet.id === requested);
    if (requestedOutlet) return requestedOutlet;
  }
  const active = outlets.find((outlet) => outlet.id === activeOutletId);
  return active ?? outlets[0] ?? null;
}

type LoadedSettings =
  | {
      ok: true;
      outlets: OutletSummary[];
      outlet: OutletSummary | null;
      settings: OutletSettings | null;
      branding: Branding | null;
    }
  | { ok: false };

async function loadSettings(
  context: AuthContext,
  requestedOutletId: string | undefined,
): Promise<LoadedSettings> {
  const db = getAuthRuntime().db;
  try {
    const { items: outlets } = await listOutlets(db, context);
    const outlet = chooseOutlet(outlets, context.activeOutletId, requestedOutletId);
    if (!outlet) {
      return { ok: true, outlets, outlet: null, settings: null, branding: null };
    }
    const [settings, branding] = await Promise.all([
      getOutletSettings(db, context, outlet.id),
      getBranding(db, context),
    ]);
    return { ok: true, outlets, outlet, settings, branding };
  } catch {
    return { ok: false };
  }
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const params = await searchParams;
  const authContext = await requirePageAuthContext();
  const session = await getSessionPayload(authContext);
  if (!can(session.user.role, "manage_settings")) forbidden();

  const result = await loadSettings(authContext, firstValue(params.outletId));

  if (!result.ok) {
    return (
      <main className="bo-page">
        <PageHeader title="Pengaturan" />
        <ErrorState
          title="Pengaturan gagal dimuat."
          actions={
            <Link className={buttonVariants({ variant: "secondary" })} href="/settings">
              Coba lagi
            </Link>
          }
        >
          Periksa koneksi, lalu coba lagi. Nilai yang gagal dimuat tidak ditampilkan agar tidak menyesatkan.
        </ErrorState>
      </main>
    );
  }

  if (!result.outlet || !result.settings || !result.branding) {
    return (
      <main className="bo-page">
        <PageHeader title="Pengaturan" />
        <ErrorState title="Belum ada outlet.">
          Buat outlet terlebih dahulu sebelum mengubah pengaturan.
        </ErrorState>
      </main>
    );
  }

  return (
    <main className="bo-page">
      <PageHeader
        title="Pengaturan"
        description="Pengaturan per outlet dan merek produk. Setiap perubahan dicatat di log audit dan tidak mengubah transaksi yang sudah ada."
      />

      <div className="bo-stack">
        {result.outlets.length > 1 ? (
          <nav className="bo-chips" aria-label="Pilih outlet">
            {result.outlets.map((item) => (
              <Link
                key={item.id}
                className="bo-chip-link"
                href={`/settings?outletId=${encodeURIComponent(item.id)}`}
                aria-current={item.id === result.outlet?.id ? "page" : undefined}
              >
                {item.name}
              </Link>
            ))}
          </nav>
        ) : null}

        <SettingsForm settings={result.settings} />
        <BrandingForm branding={result.branding} />
      </div>
    </main>
  );
}
