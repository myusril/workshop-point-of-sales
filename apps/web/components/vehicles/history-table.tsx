"use client";

import type { HistoryOrder } from "@workshop-pos/contracts";
import type { ReactNode } from "react";

import { DataTable, type DataTableColumn } from "@/components/back-office/data-table";
import { StatusChip } from "@/components/back-office/status-chip";
import { formatIdr, formatWibDate } from "@/lib/format";

import { ORDER_KIND_LABELS, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_TONES } from "./labels";

/** Lines shown before the row collapses behind a disclosure. */
const VISIBLE_LINES = 3;

function OrderLines({ order }: { order: HistoryOrder }) {
  if (order.lines.length === 0) return <span aria-hidden="true">—</span>;

  const visible = order.lines.slice(0, VISIBLE_LINES);
  const hidden = order.lines.slice(VISIBLE_LINES);

  return (
    <>
      <ul>
        {visible.map((line, index) => (
          <li className="bo-cell-sub" key={`${order.id}-${index}`}>
            {line.quantity} × {line.description} ({formatIdr(line.lineTotal)})
          </li>
        ))}
      </ul>
      {hidden.length > 0 ? (
        <details className="mt-1">
          <summary className="cursor-pointer text-accent-ink">+{hidden.length} item lainnya</summary>
          <ul className="mt-1">
            {hidden.map((line, index) => (
              <li className="bo-cell-sub" key={`${order.id}-rest-${index}`}>
                {line.quantity} × {line.description} ({formatIdr(line.lineTotal)})
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}

const columns: DataTableColumn<HistoryOrder>[] = [
  {
    id: "date",
    header: "Tanggal",
    cell: (order) => (
      <div className="bo-cell-name">
        <span className="bo-nowrap">{formatWibDate(order.createdAt)}</span>
        <span className="bo-cell-sub">{order.outletName}</span>
      </div>
    ),
  },
  {
    id: "payment",
    header: "Pembayaran",
    cell: (order) => (
      <StatusChip tone={PAYMENT_STATUS_TONES[order.paymentStatus]}>
        {PAYMENT_STATUS_LABELS[order.paymentStatus]}
      </StatusChip>
    ),
  },
  {
    id: "kind",
    header: "Jenis",
    cell: (order) => (
      <div className="bo-cell-name">
        <span>{ORDER_KIND_LABELS[order.kind]}</span>
        {order.orderNumber ? <span className="bo-cell-sub bo-mono">{order.orderNumber}</span> : null}
      </div>
    ),
  },
  {
    id: "lines",
    header: "Rincian",
    className: "bo-cell-wrap",
    cell: (order) => <OrderLines order={order} />,
  },
  {
    id: "odometer",
    header: "Odometer",
    numeric: true,
    cell: (order) => (
      <span className="bo-nowrap">
        {order.odometer === null ? "—" : `${order.odometer.toLocaleString("id-ID")} km`}
      </span>
    ),
  },
  {
    id: "total",
    header: "Total",
    numeric: true,
    cell: (order) => <span className="bo-nowrap">{formatIdr(order.total)}</span>,
  },
  {
    id: "balance",
    header: "Sisa tagihan",
    numeric: true,
    cell: (order) => (
      <span className="bo-nowrap">
        {order.paymentStatus === "VOID" ? "—" : formatIdr(order.balanceDue)}
      </span>
    ),
  },
];

interface VehicleHistoryTableProps {
  orders: HistoryOrder[];
  empty?: ReactNode;
}

/**
 * Reverse-chronological history (§9.9, state matrix 2.7). Voided orders stay
 * visible and labelled but show no balance; unpaid orders carry the text
 * "Belum lunas" next to the remaining amount. Long line lists collapse behind
 * a keyboard-reachable disclosure so one order never pushes the rest away.
 */
export function VehicleHistoryTable({ orders, empty }: VehicleHistoryTableProps) {
  return (
    <DataTable
      caption="Riwayat servis kendaraan"
      columns={columns}
      data={orders}
      getRowKey={(order) => order.id}
      empty={empty}
    />
  );
}
