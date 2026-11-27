import { AuthError, can, type AuthContext } from "@workshop-pos/auth";
import {
  VEHICLE_PAGE_SIZES,
  vehicleListQuerySchema,
  type VehicleListQuery,
  type VehicleListResponse,
} from "@workshop-pos/contracts";
import type { Metadata } from "next";
import { Suspense } from "react";

import { listVehicles } from "@/app/api/v1/vehicles/_lib/vehicle-service";
import { PageHeader } from "@/components/back-office/page-header";
import { Pagination } from "@/components/back-office/pagination";
import { TableSkeleton } from "@/components/back-office/table-skeleton";
import { VehicleCreateAction } from "@/components/vehicles/vehicle-create";
import { VehicleFilter } from "@/components/vehicles/vehicle-filter";
import {
  VehiclesEmptyState,
  VehiclesErrorPanel,
  VehiclesFilteredEmptyState,
  VehiclesOutOfRangeState,
} from "@/components/vehicles/vehicle-states";
import { VehiclesTable } from "@/components/vehicles/vehicles-table";
import { getAuthRuntime, getSessionPayload, requirePageAuthContext } from "@/lib/auth/server";
import { buildQueryHref } from "@/lib/query";

export const metadata: Metadata = {
  title: "Kendaraan — Workshop POS",
};

export const dynamic = "force-dynamic";

interface VehiclesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export default async function VehiclesPage({ searchParams }: VehiclesPageProps) {
  const params = await searchParams;
  // The guard explains an idle-timeout sign-out (reason=expired) on /login.
  const authContext = await requirePageAuthContext();
  const session = await getSessionPayload(authContext);

  // Every authenticated role may read vehicles; create/update needs
  // `manage_customers`, so the controls are absent rather than dead for others.
  const canManageVehicles = can(session.user.role, "manage_customers");

  const parsedQuery = vehicleListQuerySchema.safeParse({
    q: firstValue(params.q)?.trim() || undefined,
    customerId: firstValue(params.customerId) || undefined,
    page: firstValue(params.page),
    pageSize: firstValue(params.pageSize),
    sort: firstValue(params.sort),
    dir: firstValue(params.dir),
  });
  const query: VehicleListQuery = parsedQuery.success
    ? parsedQuery.data
    : vehicleListQuerySchema.parse({});

  const filterState = {
    q: query.q,
    customerId: query.customerId,
    sort: query.sort === "plate" ? undefined : query.sort,
    dir: query.dir === "asc" ? undefined : query.dir,
    pageSize: query.pageSize === 25 ? undefined : String(query.pageSize),
  };
  const resetHref = buildQueryHref("/vehicles", filterState, {
    q: undefined,
    customerId: undefined,
    page: undefined,
  });
  const removeCustomerHref = buildQueryHref("/vehicles", filterState, {
    customerId: undefined,
    page: undefined,
  });
  const hasSearch = Boolean(query.q);

  return (
    <main className="bo-page">
      <PageHeader
        title="Kendaraan"
        description="Cari kendaraan lewat nomor polisi, pelanggan, atau merek."
        actions={canManageVehicles ? <VehicleCreateAction /> : undefined}
      />

      <div className="bo-stack">
        {!canManageVehicles ? (
          <p className="bo-notice">
            Hanya Pemilik, Admin, atau Kasir yang dapat menambah atau mengubah kendaraan. Riwayat
            kendaraan tetap dapat dibuka.
          </p>
        ) : null}

        <Suspense fallback={<TableSkeleton label="Memuat kendaraan…" testId="vehicles-loading" />}>
          <VehiclesData
            authContext={authContext}
            query={query}
            hasSearch={hasSearch}
            resetHref={resetHref}
            removeCustomerHref={removeCustomerHref}
            canManageVehicles={canManageVehicles}
          />
        </Suspense>
      </div>
    </main>
  );
}

interface VehiclesDataProps {
  authContext: AuthContext;
  query: VehicleListQuery;
  hasSearch: boolean;
  resetHref: string;
  removeCustomerHref: string;
  canManageVehicles: boolean;
}

async function VehiclesData({
  authContext,
  query,
  hasSearch,
  resetHref,
  removeCustomerHref,
  canManageVehicles,
}: VehiclesDataProps) {
  let data: VehicleListResponse | null = null;
  let loadError: string | null = null;

  try {
    data = await listVehicles(getAuthRuntime().db, authContext, query);
  } catch (error) {
    loadError =
      error instanceof AuthError
        ? error.message
        : "Data kendaraan gagal dimuat. Periksa koneksi, lalu coba lagi.";
  }

  const retryHref = buildQueryHref("/vehicles", {
    q: query.q,
    customerId: query.customerId,
    sort: query.sort === "plate" ? undefined : query.sort,
    dir: query.dir === "asc" ? undefined : query.dir,
    pageSize: query.pageSize === 25 ? undefined : String(query.pageSize),
    page: query.page > 1 ? query.page : undefined,
  });

  // Page 1 keeps the active search and drill-down: the rows are on an earlier
  // page, not gone.
  const pageOneHref = buildQueryHref("/vehicles", {
    q: query.q,
    customerId: query.customerId,
    sort: query.sort === "plate" ? undefined : query.sort,
    dir: query.dir === "asc" ? undefined : query.dir,
    pageSize: query.pageSize === 25 ? undefined : String(query.pageSize),
  });
  const hasFilter = Boolean(query.q) || Boolean(query.customerId);

  return (
    <section className="bo-panel" aria-labelledby="vehicles-list-title">
      <div className="bo-panel__header">
        <h2 className="bo-panel__title" id="vehicles-list-title">
          Daftar kendaraan
        </h2>
        {data ? <span className="bo-panel__meta">{data.total} kendaraan</span> : null}
      </div>

      <VehicleFilter
        query={query}
        hasSearch={hasSearch}
        resetHref={resetHref}
        removeCustomerHref={removeCustomerHref}
      />

      {!data ? (
        <div className="bo-panel__body">
          <VehiclesErrorPanel
            message={loadError ?? "Data kendaraan gagal dimuat. Periksa koneksi, lalu coba lagi."}
            retryHref={retryHref}
          />
        </div>
      ) : (
        <>
          <VehiclesTable
            items={data.items}
            canManageVehicles={canManageVehicles}
            empty={
              <div className="bo-panel__body">
                {data.total > 0 ? (
                  <VehiclesOutOfRangeState total={data.total} pageOneHref={pageOneHref} />
                ) : hasFilter ? (
                  <VehiclesFilteredEmptyState
                    query={query.q ?? ""}
                    resetHref={resetHref}
                    customerFiltered={Boolean(query.customerId)}
                  />
                ) : (
                  <VehiclesEmptyState
                    canManage={canManageVehicles}
                    createAction={
                      canManageVehicles ? (
                        <VehicleCreateAction label="Tambahkan kendaraan" variant="secondary" />
                      ) : undefined
                    }
                  />
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
              basePath="/vehicles"
              query={{
                q: query.q,
                customerId: query.customerId,
                sort: query.sort === "plate" ? undefined : query.sort,
                dir: query.dir === "asc" ? undefined : query.dir,
              }}
              label="kendaraan"
              pageSizes={VEHICLE_PAGE_SIZES}
            />
          ) : null}
        </>
      )}
    </section>
  );
}
