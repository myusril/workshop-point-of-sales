import { AuthError, can, type AuthContext } from "@workshop-pos/auth";
import {
  ledgerListQuerySchema,
  type InventoryProduct,
  type LedgerListQuery,
  type LedgerListResponse,
  type LowStockResponse,
} from "@workshop-pos/contracts";
import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";
import { Suspense } from "react";

import {
  listInventoryProducts,
  listLedger,
  listLowStock,
} from "@/app/api/v1/inventory/_lib/inventory-service";
import { PageHeader } from "@/components/back-office/page-header";
import { Pagination } from "@/components/back-office/pagination";
import { EmptyState, ErrorState } from "@/components/back-office/state-block";
import { StatusChip } from "@/components/back-office/status-chip";
import { TableSkeleton } from "@/components/back-office/table-skeleton";
import { AdjustmentForm } from "@/components/inventory/adjustment-form";
import { LedgerFilter } from "@/components/inventory/ledger-filter";
import { LedgerTable } from "@/components/inventory/ledger-table";
import { StockInForm } from "@/components/inventory/stock-in-form";
import { buttonVariants } from "@/components/ui/button";
import { getAuthRuntime, getSessionPayload, requirePageAuthContext } from "@/lib/auth/server";
import { formatStockQuantity } from "@/lib/format";
import { LEDGER_ENTRY_TYPE_LABELS } from "@/lib/inventory-labels";
import { buildQueryHref } from "@/lib/query";

export const metadata: Metadata = {
  title: "Stok — Workshop POS",
};

export const dynamic = "force-dynamic";

interface InventoryPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export default async function InventoryPage({ searchParams }: InventoryPageProps) {
  const params = await searchParams;
  // The guard explains an idle-timeout sign-out (reason=expired) on /login.
  const authContext = await requirePageAuthContext();
  const session = await getSessionPayload(authContext);

  // A direct URL outside the role's permissions renders forbidden.tsx in this
  // segment with an HTTP 403 status, never a 200 page that only looks denied.
  if (!can(session.user.role, "manage_stock")) forbidden();

  const parsedQuery = ledgerListQuerySchema.safeParse({
    productId: firstValue(params.productId) || undefined,
    entryType: firstValue(params.entryType) || undefined,
    from: firstValue(params.from) || undefined,
    to: firstValue(params.to) || undefined,
    page: firstValue(params.page) || undefined,
    pageSize: firstValue(params.pageSize) || undefined,
  });
  const ledgerQuery: LedgerListQuery = parsedQuery.success
    ? parsedQuery.data
    : ledgerListQuerySchema.parse({});

  const hasLedgerFilters = Boolean(
    ledgerQuery.productId || ledgerQuery.entryType || ledgerQuery.from || ledgerQuery.to,
  );
  const ledgerFilterState = {
    productId: ledgerQuery.productId,
    entryType: ledgerQuery.entryType,
    from: ledgerQuery.from,
    to: ledgerQuery.to,
    pageSize: ledgerQuery.pageSize === 25 ? undefined : String(ledgerQuery.pageSize),
  };
  const ledgerResetHref = buildQueryHref("/inventory", ledgerFilterState, {
    productId: undefined,
    entryType: undefined,
    from: undefined,
    to: undefined,
    page: undefined,
  });
  const ledgerChips = [
    ledgerQuery.productId
      ? {
          key: "productId",
          label: "Produk dipilih",
          removeHref: buildQueryHref("/inventory", ledgerFilterState, { productId: undefined, page: undefined }),
        }
      : null,
    ledgerQuery.entryType
      ? {
          key: "entryType",
          label: `Jenis: ${LEDGER_ENTRY_TYPE_LABELS[ledgerQuery.entryType]}`,
          removeHref: buildQueryHref("/inventory", ledgerFilterState, { entryType: undefined, page: undefined }),
        }
      : null,
    ledgerQuery.from
      ? {
          key: "from",
          label: `Dari: ${ledgerQuery.from}`,
          removeHref: buildQueryHref("/inventory", ledgerFilterState, { from: undefined, page: undefined }),
        }
      : null,
    ledgerQuery.to
      ? {
          key: "to",
          label: `Sampai: ${ledgerQuery.to}`,
          removeHref: buildQueryHref("/inventory", ledgerFilterState, { to: undefined, page: undefined }),
        }
      : null,
  ].filter((chip): chip is { key: string; label: string; removeHref: string } => chip !== null);

  const canOverride = can(session.user.role, "override_stock");

  return (
    <main className="bo-page">
      <PageHeader
        title="Stok"
        description="Stok dihitung dari buku besar, bukan diubah langsung. Setiap stok masuk dan penyesuaian menyimpan pelaku, waktu, alasan, dan referensi."
      />

      <div className="bo-stack">
        <Suspense
          fallback={
            <div className="bo-stack">
              <TableSkeleton label="Memuat stok menipis…" testId="inventory-loading" withFilterBar={false} />
              <TableSkeleton label="Memuat buku besar stok…" testId="inventory-ledger-loading" />
            </div>
          }
        >
          <InventoryData
            authContext={authContext}
            ledgerQuery={ledgerQuery}
            canOverride={canOverride}
            hasLedgerFilters={hasLedgerFilters}
            ledgerResetHref={ledgerResetHref}
            ledgerChips={ledgerChips}
          />
        </Suspense>
      </div>
    </main>
  );
}

interface InventoryDataProps {
  authContext: AuthContext;
  ledgerQuery: LedgerListQuery;
  canOverride: boolean;
  hasLedgerFilters: boolean;
  ledgerResetHref: string;
  ledgerChips: { key: string; label: string; removeHref: string }[];
}

async function InventoryData({
  authContext,
  ledgerQuery,
  canOverride,
  hasLedgerFilters,
  ledgerResetHref,
  ledgerChips,
}: InventoryDataProps) {
  const db = getAuthRuntime().db;

  let products: InventoryProduct[] | null = null;
  let productsError: string | null = null;

  try {
    products = await listInventoryProducts(db, authContext);
  } catch (error) {
    productsError =
      error instanceof AuthError
        ? error.message
        : "Data produk gagal dimuat. Periksa koneksi, lalu coba lagi.";
  }

  if (!products) {
    return (
      <section className="bo-panel" aria-labelledby="inventory-error-title">
        <div className="bo-panel__header">
          <h2 className="bo-panel__title" id="inventory-error-title">
            Data stok
          </h2>
        </div>
        <div className="bo-panel__body">
          <ErrorState
            title="Data stok gagal dimuat."
            actions={
              <Link
                className={buttonVariants({ variant: "secondary" })}
                href={buildQueryHref("/inventory", {})}
              >
                Coba lagi
              </Link>
            }
          >
            {productsError ?? "Data stok gagal dimuat. Periksa koneksi, lalu coba lagi."} Stok dan buku besar
            tidak ditampilkan agar tidak menyesatkan.
          </ErrorState>
        </div>
      </section>
    );
  }

  const [lowStockResult, ledgerResult] = await Promise.allSettled([
    listLowStock(db, authContext),
    listLedger(db, authContext, ledgerQuery),
  ]);

  let lowStock: LowStockResponse | null = null;
  let lowStockError: string | null = null;
  if (lowStockResult.status === "fulfilled") {
    lowStock = lowStockResult.value;
  } else {
    lowStockError =
      lowStockResult.reason instanceof AuthError
        ? lowStockResult.reason.message
        : "Daftar stok menipis gagal dimuat. Periksa koneksi, lalu coba lagi.";
  }

  let ledger: LedgerListResponse | null = null;
  let ledgerError: string | null = null;
  if (ledgerResult.status === "fulfilled") {
    ledger = ledgerResult.value;
  } else {
    ledgerError =
      ledgerResult.reason instanceof AuthError
        ? ledgerResult.reason.message
        : "Buku besar stok gagal dimuat. Periksa koneksi, lalu coba lagi.";
  }

  const retryHref = buildQueryHref("/inventory", {
    productId: ledgerQuery.productId,
    entryType: ledgerQuery.entryType,
    from: ledgerQuery.from,
    to: ledgerQuery.to,
    pageSize: ledgerQuery.pageSize === 25 ? undefined : String(ledgerQuery.pageSize),
  });

  return (
    <>
      <section className="bo-panel" aria-labelledby="low-stock-title">
        <div className="bo-panel__header">
          <h2 className="bo-panel__title" id="low-stock-title">
            Stok menipis
          </h2>
          {lowStock ? <span className="bo-panel__meta">{lowStock.items.length} item</span> : null}
        </div>

        {lowStockError ? (
          <div className="bo-panel__body">
            <ErrorState
              title="Daftar stok menipis gagal dimuat."
              actions={
                <Link className={buttonVariants({ variant: "secondary" })} href={retryHref}>
                  Coba lagi
                </Link>
              }
            >
              {lowStockError} Daftar tidak ditampilkan agar tidak menyesatkan.
            </ErrorState>
          </div>
        ) : lowStock ? (
          lowStock.items.length === 0 ? (
            <div className="bo-panel__body">
              <EmptyState title="Tidak ada stok menipis.">
                Semua produk berada di atas batas stok menipisnya. Daftar ini memperbarui diri setelah stok
                masuk atau penjualan dicatat.
              </EmptyState>
            </div>
          ) : (
            <ul className="bo-lowstock">
              {lowStock.items.map((item) => (
                <li className="bo-lowstock__item" key={item.productId}>
                  <div className="bo-lowstock__identity">
                    <span className="bo-lowstock__name">{item.name}</span>
                    <span className="bo-lowstock__meta">
                      {item.sku} · batas {formatStockQuantity(item.lowStockThreshold)} {item.unit}
                    </span>
                  </div>
                  <div className="bo-lowstock__numbers">
                    <span>Stok {formatStockQuantity(item.stockOnHand)}</span>
                    <StatusChip tone="warning">Kurangi {formatStockQuantity(item.shortfall)} unit</StatusChip>
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </section>

      {products.length === 0 ? (
        <section className="bo-panel" aria-labelledby="inventory-setup-title">
          <div className="bo-panel__header">
            <h2 className="bo-panel__title" id="inventory-setup-title">
              Pergerakan stok
            </h2>
          </div>
          <div className="bo-panel__body">
            <EmptyState
              title="Belum ada produk."
              actions={
                <Link className={buttonVariants({ variant: "primary" })} href="/catalog">
                  Buka Produk &amp; Jasa
                </Link>
              }
            >
              Tambahkan produk terlebih dahulu untuk mencatat stok masuk atau penyesuaian. Jasa tidak memiliki
              stok.
            </EmptyState>
          </div>
        </section>
      ) : (
        <>
          <section className="bo-panel" aria-labelledby="stock-in-title">
            <div className="bo-panel__header">
              <h2 className="bo-panel__title" id="stock-in-title">
                Stok masuk
              </h2>
              <span className="bo-panel__meta">Menambah stok dari pembelian</span>
            </div>
            <StockInForm products={products} />
          </section>

          <section className="bo-panel" aria-labelledby="adjustment-title">
            <div className="bo-panel__header">
              <h2 className="bo-panel__title" id="adjustment-title">
                Penyesuaian stok
              </h2>
              <span className="bo-panel__meta">Alasan wajib dicatat</span>
            </div>
            <AdjustmentForm products={products} canOverride={canOverride} />
          </section>
        </>
      )}

      <section className="bo-panel" aria-labelledby="ledger-title">
        <div className="bo-panel__header">
          <h2 className="bo-panel__title" id="ledger-title">
            Buku besar stok
          </h2>
          {ledger ? <span className="bo-panel__meta">{ledger.total} baris</span> : null}
        </div>

        <LedgerFilter
          products={products}
          query={ledgerQuery}
          hasFilters={hasLedgerFilters}
          resetHref={ledgerResetHref}
        />

        {ledgerChips.length > 0 ? (
          <div className="bo-chips" aria-label="Filter buku besar aktif">
            {ledgerChips.map((chip) => (
              <Link key={chip.key} className="bo-chip-link" href={chip.removeHref} aria-label={`Hapus filter ${chip.label}`}>
                {chip.label}
                <span aria-hidden="true">×</span>
              </Link>
            ))}
          </div>
        ) : null}

        {ledgerError ? (
          <div className="bo-panel__body">
            <ErrorState
              title="Buku besar stok gagal dimuat."
              actions={
                <Link className={buttonVariants({ variant: "secondary" })} href={retryHref}>
                  Coba lagi
                </Link>
              }
            >
              {ledgerError} Baris buku besar tidak ditampilkan agar tidak menyesatkan, dan tidak ada baris
              yang diubah.
            </ErrorState>
          </div>
        ) : ledger ? (
          <>
            <LedgerTable
              entries={ledger.items}
              empty={
                <div className="bo-panel__body">
                  {hasLedgerFilters ? (
                    <EmptyState
                      title="Tidak ada pergerakan yang cocok."
                      actions={
                        <Link className={buttonVariants({ variant: "secondary" })} href={ledgerResetHref}>
                          Hapus semua filter
                        </Link>
                      }
                    >
                      Buku besar berhasil dibaca tetapi tidak ada baris untuk filter ini. Hapus filter atau
                      ubah rentang tanggal.
                    </EmptyState>
                  ) : (
                    <EmptyState title="Belum ada pergerakan stok.">
                      Stok masuk, penyesuaian, dan penjualan akan muncul di sini. Setiap baris bersifat
                      permanen: tidak ada ubah atau hapus, koreksi dilakukan dengan pergerakan baru.
                    </EmptyState>
                  )}
                </div>
              }
            />

            {ledger.items.length > 0 ? (
              <Pagination
                page={ledger.page}
                pageSize={ledger.pageSize}
                total={ledger.total}
                totalPages={ledger.totalPages}
                basePath="/inventory"
                query={{
                  productId: ledgerQuery.productId,
                  entryType: ledgerQuery.entryType,
                  from: ledgerQuery.from,
                  to: ledgerQuery.to,
                }}
                label="pergerakan stok"
              />
            ) : null}
          </>
        ) : null}
      </section>
    </>
  );
}
