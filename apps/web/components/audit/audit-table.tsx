import type { AuditEntry } from "@workshop-pos/contracts";

import { auditActionLabel } from "@/components/audit/audit-labels";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatWibDateTime } from "@/lib/format";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function displayValue(value: unknown): string {
  if (value === undefined || value === null) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function DiffTable({ entry }: { entry: AuditEntry }) {
  const before = asRecord(entry.before);
  const after = asRecord(entry.after);

  if (!before && !after) {
    return (
      <p className="bo-muted">
        {entry.before === null && entry.after === null
          ? "Aksi ini tidak menyimpan nilai sebelum/sesudah."
          : `Sebelum: ${displayValue(entry.before)} · Sesudah: ${displayValue(entry.after)}`}
      </p>
    );
  }

  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].sort();

  return (
    <Table containerLabel={`Perubahan untuk ${entry.action}`}>
      <TableCaption>Nilai sebelum dan sesudah untuk aksi ini.</TableCaption>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead scope="col">Field</TableHead>
          <TableHead scope="col">Sebelum</TableHead>
          <TableHead scope="col">Sesudah</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {keys.map((key) => (
          <TableRow key={key}>
            <TableCell>{key}</TableCell>
            <TableCell>{displayValue(before?.[key])}</TableCell>
            <TableCell>{displayValue(after?.[key])}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function AuditTable({ items }: { items: readonly AuditEntry[] }) {
  if (items.length === 0) {
    return (
      <p className="bo-muted">
        Tidak ada entri audit untuk filter ini. Coba perluas rentang tanggal atau hapus filter.
      </p>
    );
  }

  return (
    <Table containerLabel="Log audit">
      <TableCaption>Log audit tindakan sensitif, terbaru lebih dulu.</TableCaption>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead scope="col">Waktu</TableHead>
          <TableHead scope="col">Pelaku</TableHead>
          <TableHead scope="col">Aksi</TableHead>
          <TableHead scope="col">Target</TableHead>
          <TableHead scope="col">Outlet</TableHead>
          <TableHead scope="col">Alasan</TableHead>
          <TableHead scope="col">Perubahan</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((entry) => (
          <TableRow key={entry.id}>
            <TableCell>
              <time dateTime={entry.createdAt}>{formatWibDateTime(entry.createdAt)}</time>
            </TableCell>
            <TableCell>{entry.actorName ?? entry.actorId ?? "Sistem"}</TableCell>
            <TableCell>{auditActionLabel(entry.action)}</TableCell>
            <TableCell>
              {entry.entityType} · {entry.entityId}
            </TableCell>
            <TableCell>{entry.outletName ?? "—"}</TableCell>
            <TableCell>{entry.reason ?? "—"}</TableCell>
            <TableCell>
              <details>
                <summary>Lihat perubahan</summary>
                <DiffTable entry={entry} />
              </details>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
