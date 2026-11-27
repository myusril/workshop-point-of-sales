import { isAuthError } from "@workshop-pos/auth";
import {
  catalogListQuerySchema,
  type ProductItem,
  type ServiceItem,
} from "@workshop-pos/contracts";
import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";
import { z } from "zod";

import { listCatalog } from "@/app/api/v1/catalog/_lib/catalog-service";
import { PageHeader } from "@/components/back-office/page-header";
import { StatusChip } from "@/components/back-office/status-chip";
import { OrderDetailActions } from "@/components/orders/order-detail-actions";
import { OrderHeaderEdit } from "@/components/orders/order-header-edit";
import { OrderLinesEditor } from "@/components/orders/order-lines-editor";
import { OrderPaymentsPanel } from "@/components/orders/order-payments-panel";
import { OrderSummary } from "@/components/orders/order-summary";
import { OrderTimeline } from "@/components/orders/order-timeline";
import { getAuthRuntime, requirePageAuthContext } from "@/lib/auth/server";
import { formatWibDateTime } from "@/lib/format";
import { ORDER_KIND_LABELS, ORDER_STATUS_LABELS, ORDER_STATUS_TONES } from "@/lib/order-labels";
import { getOrderDetail, listTechnicians } from "@/lib/order-service";

export const metadata: Metadata = {
  title: "Transaksi — Workshop POS",
};

export const dynamic = "force-dynamic";

interface OrderDetailPageProps {
  params: Promise<{ id: string }>;
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-secondary">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

export default async function OrderDetailPage({ params }: OrderDetailPageProps) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const authContext = await requirePageAuthContext();
  const db = getAuthRuntime().db;

  let order: Awaited<ReturnType<typeof getOrderDetail>>["item"];
  try {
    order = (await getOrderDetail(db, authContext, id)).item;
  } catch (error) {
    if (isAuthError(error)) {
      if (error.status === 403) forbidden();
      if (error.status === 404) notFound();
    }
    throw error;
  }

  let products: ProductItem[] = [];
  let services: ServiceItem[] = [];
  const technicians = order.permissions.canEditHeader
    ? (await listTechnicians(db, authContext)).items
    : [];
  if (order.permissions.canEditLines) {
    const context = {
      ...authContext,
      activeOutletId: order.outletId,
      outletIds: [order.outletId],
    };
    const [catalogProducts, catalogServices] = await Promise.all([
      listCatalog(
        db,
        context,
        catalogListQuerySchema.parse({
          type: "product",
          status: "active",
          page: 1,
          pageSize: 100,
          sort: "name",
          dir: "asc",
        }),
      ),
      listCatalog(
        db,
        context,
        catalogListQuerySchema.parse({
          type: "service",
          status: "active",
          page: 1,
          pageSize: 100,
          sort: "name",
          dir: "asc",
        }),
      ),
    ]);
    products = catalogProducts.items.filter(
      (item): item is ProductItem => item.itemType === "PRODUCT",
    );
    services = catalogServices.items.filter(
      (item): item is ServiceItem => item.itemType === "SERVICE",
    );
  }

  return (
    <div className="bo-page bo-stack">
      <PageHeader
        title={order.orderNumber ? `Nota ${order.orderNumber}` : "Transaksi"}
        description={`${ORDER_KIND_LABELS[order.kind]} · ${order.outletName} · ${formatWibDateTime(order.createdAt)}`}
        backLink={{ href: "/orders", label: "Kembali ke daftar transaksi" }}
        actions={
          <StatusChip tone={ORDER_STATUS_TONES[order.status]}>
            {ORDER_STATUS_LABELS[order.status]}
          </StatusChip>
        }
      />

      {order.status === "VOID" ? (
        <section className="bo-alert bo-alert--danger" aria-label="Transaksi dibatalkan">
          <p>
            <span className="font-semibold">Alasan pembatalan:</span>{" "}
            {order.voidReason ?? "Tidak tercatat."}
          </p>
          {order.payments.length > 0 ? (
            <p>Pengembalian dana penuh telah dicatat untuk setiap pembayaran.</p>
          ) : null}
          <p className="text-xs text-ink-muted">
            Dibatalkan {formatWibDateTime(order.voidedAt)}. Transaksi tetap tersimpan di riwayat.
          </p>
        </section>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="bo-stack">
          <OrderLinesEditor order={order} products={products} services={services} />
          <OrderPaymentsPanel order={order} />
          <OrderTimeline events={order.timeline} />
        </div>

        <aside className="bo-stack order-first xl:order-none">
          <OrderDetailActions order={order} />
          {order.permissions.canEditHeader ? (
            <OrderHeaderEdit order={order} technicians={technicians} />
          ) : null}
          <OrderSummary detail={order} />

          <section className="bo-panel" aria-label="Informasi transaksi">
            <div className="bo-panel__header">
              <h2 className="bo-panel__title">Informasi</h2>
            </div>
            <div className="bo-panel__body">
              <dl className="flex flex-col gap-2 text-sm">
                <MetaRow label="Pelanggan" value={order.customer?.name ?? "Tanpa pelanggan"} />
                <MetaRow
                  label="Kendaraan"
                  value={
                    order.vehicle
                      ? `${order.vehicle.plate} · ${order.vehicle.brand} ${order.vehicle.model}`
                      : "Tanpa kendaraan"
                  }
                />
                <MetaRow label="Teknisi" value={order.technician?.name ?? "Belum ditentukan"} />
                <MetaRow
                  label="Odometer"
                  value={order.odometer === null ? "—" : `${order.odometer} km`}
                />
                <MetaRow label="Dibuat oleh" value={order.createdByName} />
                <MetaRow label="Waktu selesai" value={formatWibDateTime(order.completedAt)} />
                <MetaRow label="Waktu dibayar" value={formatWibDateTime(order.paidAt)} />
                {order.notes ? <MetaRow label="Catatan" value={order.notes} /> : null}
              </dl>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
