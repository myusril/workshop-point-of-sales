import { can, isAuthError } from "@workshop-pos/auth";
import { orderListQuerySchema, type OrderListQuery } from "@workshop-pos/contracts";
import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";

import { PageHeader } from "@/components/back-office/page-header";
import { Pagination } from "@/components/back-office/pagination";
import { EmptyState, ErrorState } from "@/components/back-office/state-block";
import { OrderFilter } from "@/components/orders/order-filter";
import { OrdersTable } from "@/components/orders/orders-table";
import { buttonVariants } from "@/components/ui/button";
import { getAuthRuntime, getSessionPayload, requirePageAuthContext } from "@/lib/auth/server";
import { listOrders } from "@/lib/order-service";
import { buildQueryHref } from "@/lib/query";

export const metadata: Metadata = {
  title: "Transaksi — Workshop POS",
};

export const dynamic = "force-dynamic";

interface OrdersPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const params = await searchParams;
  const authContext = await requirePageAuthContext();
  const session = await getSessionPayload(authContext);

  if (authContext.outletIds.length === 0) forbidden();

  const parsed = orderListQuerySchema.safeParse({
    q: firstValue(params.q),
    status: firstValue(params.status),
    from: firstValue(params.from),
    to: firstValue(params.to),
    page: firstValue(params.page),
    pageSize: firstValue(params.pageSize),
  });
  const query: OrderListQuery = parsed.success
    ? parsed.data
    : orderListQuerySchema.parse({});

  const hasFilters = Boolean(query.q || query.status || query.from || query.to);
  const queryForLinks = {
    q: query.q,
    status: query.status,
    from: query.from,
    to: query.to,
    pageSize: query.pageSize === 25 ? undefined : String(query.pageSize),
  };

  const canCreate =
    can(session.user.role, "create_sale") || can(session.user.role, "service_intake");

  let result: Awaited<ReturnType<typeof listOrders>> | null = null;
  let failure: string | null = null;
  try {
    result = await listOrders(getAuthRuntime().db, authContext, query);
  } catch (error) {
    if (!isAuthError(error)) throw error;
    if (error.status === 403) forbidden();
    failure = error.message;
  }

  return (
    <div className="bo-page bo-stack">
      <PageHeader
        title="Transaksi"
        description="Penjualan dan nota servis di outlet yang dapat Anda akses."
        backLink={{ href: "/", label: "Kembali ke beranda" }}
        actions={
          canCreate ? (
            <Link className={buttonVariants({ variant: "primary" })} href="/orders/new">
              Transaksi baru
            </Link>
          ) : undefined
        }
      />

      <OrderFilter
        query={{
          q: query.q,
          status: query.status,
          from: query.from,
          to: query.to,
        }}
        hasFilters={hasFilters}
      />

      {failure ? (
        <ErrorState
          title="Transaksi gagal dimuat."
          actions={
            <Link className={buttonVariants({ variant: "secondary" })} href="/orders">
              Coba lagi
            </Link>
          }
        >
          <p>{failure}</p>
          <p>Angka tidak ditampilkan; tidak ada data yang berubah.</p>
        </ErrorState>
      ) : result ? (
        <>
          {result.items.length === 0 ? (
            <EmptyState
              title={hasFilters ? "Tidak ada hasil untuk filter ini." : "Belum ada transaksi."}
            >
              {hasFilters ? (
                <p>Ubah kata kunci, status, atau rentang tanggal, lalu terapkan filter kembali.</p>
              ) : (
                <p>Transaksi pertama akan muncul di sini setelah dibuat di kasir.</p>
              )}
            </EmptyState>
          ) : (
            <OrdersTable items={result.items} />
          )}
          <Pagination
            page={query.page}
            pageSize={query.pageSize}
            total={result.total}
            totalPages={result.totalPages}
            basePath="/orders"
            query={queryForLinks}
            label="transaksi"
          />
        </>
      ) : (
        <EmptyState title="Belum ada transaksi.">
          <p>Transaksi pertama akan muncul di sini setelah dibuat di kasir.</p>
        </EmptyState>
      )}

      {hasFilters ? (
        <p className="text-sm">
          <Link className="bo-back-link" href={buildQueryHref("/orders", {})}>
            Hapus semua filter
          </Link>
        </p>
      ) : null}
    </div>
  );
}
