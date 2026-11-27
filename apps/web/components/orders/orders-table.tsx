"use client";

import type { OrderListItem } from "@workshop-pos/contracts";
import Link from "next/link";

import { DataTable, type DataTableColumn } from "@/components/back-office/data-table";
import { StatusChip } from "@/components/back-office/status-chip";
import { buttonVariants } from "@/components/ui/button";
import { formatIdr, formatWibDate } from "@/lib/format";
import {
  ORDER_KIND_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TONES,
} from "@/lib/order-labels";

interface OrdersTableProps {
  items: OrderListItem[];
}

/** Dense order list; the order number links to the detail screen (FR-046). */
export function OrdersTable({ items }: OrdersTableProps) {
  const columns: DataTableColumn<OrderListItem>[] = [
    {
      id: "order",
      header: "Nota",
      cell: (item) => (
        <div className="flex flex-col gap-0.5">
          <Link
            className="font-semibold text-accent-ink underline underline-offset-4"
            href={`/orders/${item.id}`}
          >
            {item.orderNumber ?? "—"}
          </Link>
          <span className="text-ink-muted">{formatWibDate(item.createdAt)}</span>
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (item) => (
        <StatusChip tone={ORDER_STATUS_TONES[item.status]}>
          {ORDER_STATUS_LABELS[item.status]}
        </StatusChip>
      ),
    },
    {
      id: "total",
      header: "Total",
      numeric: true,
      cell: (item) => formatIdr(item.total),
    },
    {
      id: "balance",
      header: "Sisa",
      numeric: true,
      cell: (item) => formatIdr(item.balanceDue),
    },
    {
      id: "customer",
      header: "Pelanggan / Kendaraan",
      cell: (item) => (
        <div className="flex flex-col gap-0.5">
          <span>{item.customerName ?? "Tanpa pelanggan"}</span>
          <span className="text-ink-muted">{item.vehiclePlate ?? "Tanpa kendaraan"}</span>
        </div>
      ),
    },
    {
      id: "kind",
      header: "Jenis",
      cell: (item) => ORDER_KIND_LABELS[item.kind],
    },
    {
      id: "outlet",
      header: "Outlet",
      cell: (item) => item.outletName,
    },
    {
      id: "open",
      header: "Aksi",
      sticky: true,
      cell: (item) => (
        <Link className={buttonVariants({ variant: "secondary", size: "sm" })} href={`/orders/${item.id}`}>
          Buka
        </Link>
      ),
    },
  ];

  return (
    <>
      {/* Below 640 px a stacked row keeps status and money on screen one; the
          dense table (WP4 `min-width`) would push both off-canvas. */}
      <ul className="flex flex-col gap-3 sm:hidden" aria-label="Daftar transaksi">
        {items.map((item) => (
          <li key={item.id} className="bo-panel">
            <div className="bo-panel__body flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link
                  className="font-semibold text-accent-ink underline underline-offset-4"
                  href={`/orders/${item.id}`}
                >
                  {item.orderNumber ?? "—"}
                </Link>
                <StatusChip tone={ORDER_STATUS_TONES[item.status]}>
                  {ORDER_STATUS_LABELS[item.status]}
                </StatusChip>
              </div>
              <div className="flex flex-wrap justify-between gap-2 text-sm">
                <span>
                  Total <strong className="tabular-nums">{formatIdr(item.total)}</strong>
                </span>
                <span className="text-ink-secondary">
                  Sisa <span className="tabular-nums">{formatIdr(item.balanceDue)}</span>
                </span>
              </div>
              <div className="flex flex-wrap justify-between gap-2 text-sm text-ink-muted">
                <span>
                  {item.customerName ?? "Tanpa pelanggan"} ·{" "}
                  {item.vehiclePlate ?? "Tanpa kendaraan"}
                </span>
                <span>{formatWibDate(item.createdAt)}</span>
              </div>
              <Link
                className={buttonVariants({ variant: "secondary", size: "sm" })}
                href={`/orders/${item.id}`}
              >
                Buka transaksi
              </Link>
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden min-w-0 sm:block">
        <DataTable
          caption="Daftar transaksi"
          columns={columns}
          data={items}
          getRowKey={(item) => item.id}
        />
      </div>
    </>
  );
}
