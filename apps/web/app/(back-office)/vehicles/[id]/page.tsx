import { AuthError } from "@workshop-pos/auth";
import {
  HISTORY_PAGE_SIZES,
  vehicleHistoryQuerySchema,
  type VehicleHistoryQuery,
  type VehicleHistoryResponse,
} from "@workshop-pos/contracts";
import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";

import { getVehicleHistory } from "@/app/api/v1/vehicles/_lib/vehicle-service";
import { PageHeader } from "@/components/back-office/page-header";
import { Pagination } from "@/components/back-office/pagination";
import { ErrorState } from "@/components/back-office/state-block";
import { VehicleHistoryTable } from "@/components/vehicles/history-table";
import {
  VehicleHistoryEmptyState,
  VehicleHistoryErrorPanel,
  VehicleHistoryOutOfRangeState,
} from "@/components/vehicles/vehicle-states";
import { buttonVariants } from "@/components/ui/button";
import { getAuthRuntime, requirePageAuthContext } from "@/lib/auth/server";
import { formatIdr } from "@/lib/format";
import { buildQueryHref } from "@/lib/query";

export const metadata: Metadata = {
  title: "Riwayat kendaraan — Workshop POS",
};

export const dynamic = "force-dynamic";

interface VehicleHistoryPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export default async function VehicleHistoryPage({ params, searchParams }: VehicleHistoryPageProps) {
  const { id } = await params;
  const rawSearchParams = await searchParams;
  // The guard explains an idle-timeout sign-out (reason=expired) on /login.
  const authContext = await requirePageAuthContext();

  const parsedQuery = vehicleHistoryQuerySchema.safeParse({
    page: firstValue(rawSearchParams.page),
    pageSize: firstValue(rawSearchParams.pageSize),
    outletId: firstValue(rawSearchParams.outletId) || undefined,
  });
  const query: VehicleHistoryQuery = parsedQuery.success
    ? parsedQuery.data
    : vehicleHistoryQuerySchema.parse({});

  let data: VehicleHistoryResponse | null = null;
  // The service seam expects a UUID; a malformed URL never reaches the database.
  let failure: { status: number; message: string } | null = z.uuid().safeParse(id).success
    ? null
    : { status: 404, message: "Kendaraan tidak ditemukan." };

  if (!failure) {
    try {
      data = await getVehicleHistory(getAuthRuntime().db, authContext, id, query);
    } catch (error) {
      failure =
        error instanceof AuthError
          ? { status: error.status, message: error.message }
          : {
              status: 500,
              message: "Riwayat gagal dimuat. Periksa koneksi, lalu coba lagi.",
            };
    }
  }

  const retryHref = buildQueryHref(`/vehicles/${id}`, {
    page: query.page > 1 ? query.page : undefined,
    pageSize: query.pageSize === 25 ? undefined : String(query.pageSize),
    outletId: query.outletId,
  });

  // Page 1 keeps the outlet scope: the rows are on an earlier page, not gone.
  const pageOneHref = buildQueryHref(`/vehicles/${id}`, {
    pageSize: query.pageSize === 25 ? undefined : String(query.pageSize),
    outletId: query.outletId,
  });

  if (!data) {
    return (
      <main className="bo-page">
        <PageHeader
          title="Riwayat kendaraan"
          backLink={{ href: "/vehicles", label: "Kembali ke daftar" }}
        />
        <div className="bo-stack">
          {failure?.status === 403 ? (
            <section className="bo-panel">
              <div className="bo-panel__body">
                <ErrorState
                  title="Anda tidak memiliki akses ke riwayat kendaraan ini."
                  actions={
                    <Link className={buttonVariants({ variant: "secondary" })} href="/vehicles">
                      Kembali ke daftar kendaraan
                    </Link>
                  }
                >
                  {failure.message} Minta Pemilik atau Admin membuka riwayat dari outlet lain bila
                  kendaraan ini pernah diservis di sana. Permintaan ini tercatat di log audit.
                </ErrorState>
              </div>
            </section>
          ) : failure?.status === 404 ? (
            <section className="bo-panel">
              <div className="bo-panel__body">
                <ErrorState
                  title="Kendaraan tidak ditemukan."
                  actions={
                    <Link className={buttonVariants({ variant: "secondary" })} href="/vehicles">
                      Kembali ke daftar kendaraan
                    </Link>
                  }
                >
                  Kendaraan dengan tautan ini tidak ada di data bisnis Anda. Periksa kembali tautan
                  atau cari kendaraan lewat nomor polisinya.
                </ErrorState>
              </div>
            </section>
          ) : (
            <section className="bo-panel">
              <div className="bo-panel__body">
                <VehicleHistoryErrorPanel
                  message={failure?.message ?? "Riwayat gagal dimuat. Periksa koneksi, lalu coba lagi."}
                  retryHref={retryHref}
                />
              </div>
            </section>
          )}
        </div>
      </main>
    );
  }

  const { vehicle, totals, scope } = data;
  const identity = [
    `${vehicle.brand} ${vehicle.model}`,
    vehicle.year === null ? null : `tahun ${vehicle.year}`,
    vehicle.color === null ? null : `warna ${vehicle.color}`,
  ]
    .filter((part): part is string => part !== null)
    .join(", ");

  return (
    <main className="bo-page">
      <header className="bo-page-header">
        <div className="bo-page-header__text">
          <Link className="bo-back-link" href="/vehicles">
            Kembali ke daftar
          </Link>
          <h1 className="bo-page-header__title bo-mono">{vehicle.normalizedPlate}</h1>
          <p className="bo-page-header__description">
            {identity}. Pelanggan: {vehicle.customerName}.
          </p>
        </div>
      </header>

      <div className="bo-stack">
        <p className="bo-notice">Riwayat hanya-baca sampai modul transaksi tersedia.</p>
        <p className="bo-muted">
          {scope.allOutlets
            ? "Menampilkan riwayat semua outlet."
            : `Hanya outlet ${scope.outletName ?? "—"}.`}
        </p>

        <section className="bo-panel" aria-labelledby="vehicle-history-totals-title">
          <div className="bo-panel__header">
            <h2 className="bo-panel__title" id="vehicle-history-totals-title">
              Ringkasan kunjungan
            </h2>
            <span className="bo-panel__meta">
              {scope.allOutlets ? "Semua outlet" : `Outlet ${scope.outletName ?? "—"}`}
            </span>
          </div>
          <div className="bo-panel__body">
            <dl className="bo-lowstock">
              <div className="bo-lowstock__item">
                <dt className="bo-lowstock__meta">Kunjungan</dt>
                <dd className="bo-lowstock__name bo-nowrap">{totals.visits}</dd>
              </div>
              <div className="bo-lowstock__item">
                <dt className="bo-lowstock__meta">Total belanja</dt>
                <dd className="bo-lowstock__name bo-nowrap">{formatIdr(totals.totalSpent)}</dd>
              </div>
              <div className="bo-lowstock__item">
                <dt className="bo-lowstock__meta">Sisa tagihan</dt>
                <dd className="bo-lowstock__name bo-nowrap">{formatIdr(totals.outstanding)}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="bo-panel" aria-labelledby="vehicle-history-list-title">
          <div className="bo-panel__header">
            <h2 className="bo-panel__title" id="vehicle-history-list-title">
              Riwayat servis
            </h2>
            <span className="bo-panel__meta">{data.total} transaksi</span>
          </div>

          <VehicleHistoryTable
            orders={data.orders}
            empty={
              <div className="bo-panel__body">
                {data.total > 0 ? (
                  <VehicleHistoryOutOfRangeState total={data.total} pageOneHref={pageOneHref} />
                ) : (
                  <VehicleHistoryEmptyState plate={vehicle.normalizedPlate} />
                )}
              </div>
            }
          />

          {data.total > 0 ? (
            <Pagination
              page={data.page}
              pageSize={data.pageSize}
              total={data.total}
              totalPages={data.totalPages}
              basePath={`/vehicles/${vehicle.id}`}
              query={{ outletId: query.outletId }}
              label="transaksi"
              pageSizes={HISTORY_PAGE_SIZES}
            />
          ) : null}
        </section>
      </div>
    </main>
  );
}
