import { AuthError, can, type AuthContext } from "@workshop-pos/auth";
import {
  CUSTOMER_PAGE_SIZES,
  customerListQuerySchema,
  type CustomerListQuery,
  type CustomerListResponse,
} from "@workshop-pos/contracts";
import type { Metadata } from "next";
import { Suspense } from "react";

import { listCustomers } from "@/app/api/v1/customers/_lib/customer-service";
import { PageHeader } from "@/components/back-office/page-header";
import { Pagination } from "@/components/back-office/pagination";
import { TableSkeleton } from "@/components/back-office/table-skeleton";
import { CustomerCreateAction } from "@/components/customers/customer-dialogs";
import { CustomerFilter } from "@/components/customers/customer-filter";
import {
  CustomersEmptyState,
  CustomersErrorPanel,
  CustomersFilteredEmptyState,
  CustomersOutOfRangeState,
} from "@/components/customers/customer-states";
import { CustomersTable } from "@/components/customers/customers-table";
import { getAuthRuntime, getSessionPayload, requirePageAuthContext } from "@/lib/auth/server";
import { buildQueryHref } from "@/lib/query";

export const metadata: Metadata = {
  title: "Pelanggan — Workshop POS",
};

export const dynamic = "force-dynamic";

interface CustomersPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export default async function CustomersPage({ searchParams }: CustomersPageProps) {
  const params = await searchParams;
  // The guard explains an idle-timeout sign-out (reason=expired) on /login.
  const authContext = await requirePageAuthContext();
  const session = await getSessionPayload(authContext);

  // Reads are open to every authenticated role. Writes and personal-data
  // actions are gated per control, never by hiding the whole page.
  const canManageCustomers = can(session.user.role, "manage_customers");
  const canManagePersonalData = can(session.user.role, "manage_personal_data");

  const parsedQuery = customerListQuerySchema.safeParse({
    q: firstValue(params.q)?.trim() || undefined,
    page: firstValue(params.page),
    pageSize: firstValue(params.pageSize),
    sort: firstValue(params.sort),
    dir: firstValue(params.dir),
  });
  const query: CustomerListQuery = parsedQuery.success
    ? parsedQuery.data
    : customerListQuerySchema.parse({});

  const filterState = {
    q: query.q,
    sort: query.sort === "name" ? undefined : query.sort,
    dir: query.dir === "asc" ? undefined : query.dir,
    pageSize: query.pageSize === 25 ? undefined : String(query.pageSize),
  };
  const resetHref = buildQueryHref("/customers", filterState, { q: undefined, page: undefined });
  const hasSearch = Boolean(query.q);

  return (
    <main className="bo-page">
      <PageHeader
        title="Pelanggan"
        description="Cari pelanggan berdasarkan nama atau nomor HP. Nomor HP disamarkan di daftar."
        actions={canManageCustomers ? <CustomerCreateAction /> : undefined}
      />

      <div className="bo-stack">
        {!canManageCustomers ? (
          <p className="bo-notice">
            Hanya Pemilik, Admin, atau Kasir yang dapat menambah atau mengubah pelanggan. Daftar ini
            hanya dapat dilihat.
          </p>
        ) : null}
        {!canManagePersonalData ? (
          <p className="bo-notice">
            Ekspor dan anonimisasi data pribadi hanya dapat dilakukan oleh Pemilik. Hubungi Pemilik bila
            data pelanggan harus dihapus.
          </p>
        ) : null}

        <Suspense fallback={<TableSkeleton label="Memuat pelanggan…" testId="customers-loading" />}>
          <CustomersData
            authContext={authContext}
            query={query}
            hasSearch={hasSearch}
            resetHref={resetHref}
            canManageCustomers={canManageCustomers}
            canManagePersonalData={canManagePersonalData}
          />
        </Suspense>
      </div>
    </main>
  );
}

interface CustomersDataProps {
  authContext: AuthContext;
  query: CustomerListQuery;
  hasSearch: boolean;
  resetHref: string;
  canManageCustomers: boolean;
  canManagePersonalData: boolean;
}

async function CustomersData({
  authContext,
  query,
  hasSearch,
  resetHref,
  canManageCustomers,
  canManagePersonalData,
}: CustomersDataProps) {
  let data: CustomerListResponse | null = null;
  let loadError: string | null = null;

  try {
    data = await listCustomers(getAuthRuntime().db, authContext, query);
  } catch (error) {
    loadError =
      error instanceof AuthError
        ? error.message
        : "Data pelanggan gagal dimuat. Periksa koneksi, lalu coba lagi.";
  }

  const retryHref = buildQueryHref("/customers", {
    q: query.q,
    sort: query.sort === "name" ? undefined : query.sort,
    dir: query.dir === "asc" ? undefined : query.dir,
    pageSize: query.pageSize === 25 ? undefined : String(query.pageSize),
    page: query.page > 1 ? query.page : undefined,
  });

  // Page 1 keeps the active search: the rows are on an earlier page, not gone.
  const pageOneHref = buildQueryHref("/customers", {
    q: query.q,
    sort: query.sort === "name" ? undefined : query.sort,
    dir: query.dir === "asc" ? undefined : query.dir,
    pageSize: query.pageSize === 25 ? undefined : String(query.pageSize),
  });

  return (
    <section className="bo-panel" aria-labelledby="customers-list-title">
      <div className="bo-panel__header">
        <h2 className="bo-panel__title" id="customers-list-title">
          Daftar pelanggan
        </h2>
        {data ? <span className="bo-panel__meta">{data.total} pelanggan</span> : null}
      </div>

      <CustomerFilter query={query} hasSearch={hasSearch} resetHref={resetHref} />

      {!data ? (
        <div className="bo-panel__body">
          <CustomersErrorPanel
            message={loadError ?? "Data pelanggan gagal dimuat. Periksa koneksi, lalu coba lagi."}
            retryHref={retryHref}
          />
        </div>
      ) : (
        <>
          <CustomersTable
            items={data.items}
            canManageCustomers={canManageCustomers}
            canManagePersonalData={canManagePersonalData}
            empty={
              <div className="bo-panel__body">
                {data.total > 0 ? (
                  <CustomersOutOfRangeState total={data.total} pageOneHref={pageOneHref} />
                ) : hasSearch ? (
                  <CustomersFilteredEmptyState query={query.q ?? ""} resetHref={resetHref} />
                ) : (
                  <CustomersEmptyState
                    canManage={canManageCustomers}
                    createAction={
                      canManageCustomers ? (
                        <CustomerCreateAction label="Tambahkan pelanggan" variant="secondary" />
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
              basePath="/customers"
              query={{
                q: query.q,
                sort: query.sort === "name" ? undefined : query.sort,
                dir: query.dir === "asc" ? undefined : query.dir,
              }}
              label="pelanggan"
              pageSizes={CUSTOMER_PAGE_SIZES}
            />
          ) : null}
        </>
      )}
    </section>
  );
}
