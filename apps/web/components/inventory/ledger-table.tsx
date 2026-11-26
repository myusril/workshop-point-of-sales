"use client";

import type { LedgerEntry, LedgerEntryType } from "@workshop-pos/contracts";
import type { ReactNode } from "react";

import { DataTable, type DataTableColumn } from "@/components/back-office/data-table";
import { StatusChip } from "@/components/back-office/status-chip";
import { Badge } from "@/components/ui/badge";
import { formatStockDelta, formatStockQuantity, formatWibDateTime } from "@/lib/format";
import {
  LEDGER_ENTRY_TYPE_LABELS as ENTRY_TYPE_LABELS,
  LEDGER_SOURCE_TYPE_LABELS as SOURCE_TYPE_LABELS,
} from "@/lib/inventory-labels";

const ENTRY_TONES: Record<LedgerEntryType, "success" | "warning" | "info" | "neutral"> = {
  STOCK_IN: "success",
  ADJUSTMENT: "warning",
  SALE_DECREMENT: "neutral",
  SALE_REVERSAL: "info",
};

const LEDGER_COLUMNS: DataTableColumn<LedgerEntry>[] = [
  {
    id: "createdAt",
    header: "Waktu",
    className: "bo-nowrap",
    cell: (entry) => <span className="bo-nowrap">{formatWibDateTime(entry.createdAt)}</span>,
  },
  {
    id: "product",
    header: "Produk",
    cell: (entry) => (
      <div className="bo-cell-name">
        <span className="bo-cell-name__primary">{entry.productName}</span>
        <span className="bo-cell-sub bo-cell-mono">{entry.productSku}</span>
      </div>
    ),
  },
  {
    id: "entryType",
    header: "Jenis",
    cell: (entry) => <Badge tone={ENTRY_TONES[entry.entryType]}>{ENTRY_TYPE_LABELS[entry.entryType]}</Badge>,
  },
  {
    id: "delta",
    header: "Perubahan",
    numeric: true,
    cell: (entry) => <span className="bo-nowrap">{formatStockDelta(entry.quantityDelta)}</span>,
  },
  {
    id: "stock",
    header: "Stok (sebelum → sesudah)",
    numeric: true,
    cell: (entry) => (
      <span className="bo-nowrap">
        {formatStockQuantity(entry.quantityBefore)} → {formatStockQuantity(entry.quantityAfter)}
      </span>
    ),
  },
  {
    id: "source",
    header: "Sumber",
    cell: (entry) => (
      <div className="bo-cell-name">
        <Badge tone="neutral">{SOURCE_TYPE_LABELS[entry.sourceType]}</Badge>
        {entry.sourceRef ? <span className="bo-cell-sub bo-cell-mono">{entry.sourceRef}</span> : null}
      </div>
    ),
  },
  {
    id: "reason",
    header: "Alasan",
    className: "bo-cell-reason",
    cell: (entry) => <span className="bo-cell-wrap">{entry.reason && entry.reason.length > 0 ? entry.reason : "—"}</span>,
  },
  {
    id: "actor",
    header: "Pelaku",
    className: "bo-cell-actor",
    cell: (entry) => <span className="bo-cell-wrap">{entry.actorName}</span>,
  },
  {
    id: "override",
    header: "Override",
    cell: (entry) =>
      entry.override ? <StatusChip tone="danger">Override</StatusChip> : <span aria-hidden="true">—</span>,
  },
];

interface LedgerTableProps {
  entries: LedgerEntry[];
  empty?: ReactNode;
}

/**
 * Append-only ledger view. There is deliberately no edit, delete, or undo
 * action: corrections are new movements, and the actor, reason, and source
 * are always visible.
 */
export function LedgerTable({ entries, empty }: LedgerTableProps) {
  return (
    <DataTable
      caption="Buku besar pergerakan stok"
      columns={LEDGER_COLUMNS}
      data={entries}
      getRowKey={(entry) => entry.id}
      empty={empty}
    />
  );
}
