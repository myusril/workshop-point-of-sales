import { AuthError, can, type AuthContext } from "@workshop-pos/auth";
import {
  catalogListQuerySchema,
  type CatalogListQuery,
  type CatalogListResponse,
} from "@workshop-pos/contracts";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { listCatalog } from "@/app/api/v1/catalog/_lib/catalog-service";
import { PageHeader } from "@/components/back-office/page-header";
import { Pagination } from "@/components/back-office/pagination";
import { EmptyState, ErrorState } from "@/components/back-office/state-block";
import { TableSkeleton } from "@/components/back-office/table-skeleton";
import { buttonVariants } from "@/components/ui/button";
import { CatalogCreateActions } from "@/components/catalog/catalog-create";
import { CatalogFilter } from "@/components/catalog/catalog-filter";
import { CatalogTable, type CatalogSortColumn } from "@/components/catalog/catalog-table";
import { getAuthRuntime, getSessionPayload, requirePageAuthContext } from "@/lib/auth/server";
import { buildQueryHref } from "@/lib/query";

export const metadata: Metadata = {
  title: "Produk & Jasa — Workshop POS",
};

export const dynamic = "force-dynamic";

interface CatalogPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export default async function CatalogPage({ searchParams }: CatalogPageProps) {
  const params = await searchParams;
  // The guard explains an idle-timeout sign-out (reason=expired) on /login.
  const authContext = await requirePageAuthContext();
  const session = await getSessionPayload(authContext);

  // Reading the catalog is allowed to every authenticated role; cost is
  // omitted from the payload unless the role may manage the catalog, and the
  // mutation controls are not rendered at all for Cashier/Mechanic.
  const canManageCatalog = can(session.user.role, "manage_catalog");

  const parsedQuery = catalogListQuerySchema.safeParse({
    q: firstValue(params.q),
    type: firstValue(params.type),
    status: firstValue(params.status),
    page: firstValue(params.page),
    pageSize: firstValue(params.pageSize),
    sort: firstValue(params.sort),
    dir: firstValue(params.dir),
  });
  const query: CatalogListQuery = parsedQuery.success
    ? parsedQuery.data
    : catalogListQuerySchema.parse({});

  const hasFilters = Boolean(query.q) || query.type !== "all" || query.status !== "all";
  const filterState = {
    q: query.q,
    type: query.type === "all" ? undefined : query.type,
    status: query.status === "all" ? undefined : query.status,
    pageSize: query.pageSize === 25 ? undefined : String(query.pageSize),
    sort: query.sort === "name" ? undefined : query.sort,
    dir: query.dir === "asc" ? undefined : query.dir,
  };
  const resetHref = buildQueryHref("/catalog", filterState, {
    q: undefined,
    type: undefined,
    status: undefined,
    page: undefined,
  });

  const chips = [
    query.q
      ? {
          key: "q",
          label: `Cari: "${query.q}"`,
          removeHref: buildQueryHref("/catalog", filterState, { q: undefined, page: undefined }),
        }
      : null,
    query.type !== "all"
      ? {
          key: "type",
          label: `Jenis: ${query.type === "product" ? "Produk" : "Jasa"}`,
          removeHref: buildQueryHref("/catalog", filterState, { type: undefined, page: undefined }),
        }
      : null,
    query.status !== "all"
      ? {
          key: "status",
          label: `Status: ${query.status === "active" ? "Aktif" : "Nonaktif"}`,
          removeHref: buildQueryHref("/catalog", filterState, { status: undefined, page: undefined }),
        }
      : null,
  ].filter((chip): chip is { key: string; label: string; removeHref: string } => chip !== null);

  function sortLink(column: CatalogSortColumn): string {
    const nextDir = query.sort === column && query.dir === "asc" ? "desc" : "asc";
    return buildQueryHref("/catalog", filterState, { sort: column, dir: nextDir });
  }

  const sortLinks: Record<CatalogSortColumn, string> = {
    name: sortLink("name"),
    sku: sortLink("sku"),
    price: sortLink("price"),
    stock: sortLink("stock"),
  };

  return (
    <main className="bo-page">
      <PageHeader
        title="Produk & Jasa"
        description="Kelola spare part dan jasa bengkel. Harga dan biaya mengikuti peran Anda; setiap perubahan harga atau biaya dicatat di log audit."
        actions={canManageCatalog ? <CatalogCreateActions /> : undefined}
      />

      <div className="bo-stack">
        {!canManageCatalog ? (
          <p className="bo-notice">
            Hanya Admin atau Pemilik yang dapat membuat atau mengubah produk dan jasa. Biaya modal tidak
            ditampilkan untuk peran Anda, dan katalog hanya dapat dilihat.
          </p>
        ) : null}

        <Suspense
          fallback={<TableSkeleton label="Memuat produk dan jasa…" testId="catalog-loading" />}
        >
          <CatalogData
            authContext={authContext}
            query={query}
            canManageCatalog={canManageCatalog}
            hasFilters={hasFilters}
            resetHref={resetHref}
            chips={chips}
            sortLinks={sortLinks}
          />
        </Suspense>
      </div>
    </main>
  );
}

interface CatalogDataProps {
  authContext: AuthContext;
  query: CatalogListQuery;
  canManageCatalog: boolean;
  hasFilters: boolean;
  resetHref: string;
  chips: { key: string; label: string; removeHref: string }[];
  sortLinks: Record<CatalogSortColumn, string>;
}

async function CatalogData({
  authContext,
  query,
  canManageCatalog,
  hasFilters,
  resetHref,
  chips,
  sortLinks,
}: CatalogDataProps) {
  let data: CatalogListResponse | null = null;
  let loadError: string | null = null;

  try {
    data = await listCatalog(getAuthRuntime().db, authContext, query);
  } catch (error) {
    loadError =
      error instanceof AuthError
        ? error.message
        : "Data katalog gagal dimuat. Periksa koneksi, lalu coba lagi.";
  }

  const filterBar = (
    <CatalogFilter query={query} hasFilters={hasFilters} chips={chips} resetHref={resetHref} />
  );

  if (!data) {
    return (
      <section className="bo-panel" aria-labelledby="catalog-list-title">
        <div className="bo-panel__header">
          <h2 className="bo-panel__title" id="catalog-list-title">
            Daftar produk dan jasa
          </h2>
        </div>
        {filterBar}
        <div className="bo-panel__body">
          <ErrorState
            title="Data katalog gagal dimuat."
            actions={
              <Link className={buttonVariants({ variant: "secondary" })} href={buildQueryHref("/catalog", {})}>
                Coba lagi
              </Link>
            }
          >
            {loadError ?? "Data katalog gagal dimuat. Periksa koneksi, lalu coba lagi."} Jumlah dan harga tidak
            ditampilkan agar tidak menyesatkan.
          </ErrorState>
        </div>
      </section>
    );
  }

  const emptyState =
    data.items.length === 0 ? (
      hasFilters ? (
        <div className="bo-panel__body">
          <EmptyState
            title={query.q ? `Tidak ada hasil untuk "${query.q}".` : "Tidak ada hasil untuk filter ini."}
            actions={
              <Link className={buttonVariants({ variant: "secondary" })} href={resetHref}>
                Hapus semua filter
              </Link>
            }
          >
            Katalog berhasil dibaca tetapi tidak ada item yang cocok dengan filter saat ini. Hapus filter
            atau coba kata kunci lain.
          </EmptyState>
        </div>
      ) : (
        <div className="bo-panel__body">
          <EmptyState title="Belum ada produk atau jasa.">
            {canManageCatalog
              ? "Tambahkan produk pertama untuk mulai berjualan. Gunakan tombol Produk baru di atas; stok awal di atas nol otomatis dicatat sebagai stok masuk."
              : "Belum ada produk atau jasa pada outlet ini. Hanya Admin atau Pemilik yang dapat menambahkannya."}
          </EmptyState>
        </div>
      )
    ) : null;

  return (
    <section className="bo-panel" aria-labelledby="catalog-list-title">
      <div className="bo-panel__header">
        <h2 className="bo-panel__title" id="catalog-list-title">
          Daftar produk dan jasa
        </h2>
        <span className="bo-panel__meta">{data.total} item</span>
      </div>

      {filterBar}

      <CatalogTable
        items={data.items}
        canManageCatalog={canManageCatalog}
        sort={query.sort}
        dir={query.dir}
        sortLinks={sortLinks}
        empty={emptyState}
      />

      {data.items.length > 0 ? (
        <Pagination
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          totalPages={data.totalPages}
          basePath="/catalog"
          query={{
            q: query.q,
            type: query.type === "all" ? undefined : query.type,
            status: query.status === "all" ? undefined : query.status,
            sort: query.sort === "name" ? undefined : query.sort,
            dir: query.dir === "asc" ? undefined : query.dir,
          }}
          label="produk & jasa"
        />
      ) : null}
    </section>
  );
}
