"use client";

import { tableFeatures, useTable, type ColumnDef, type RowData } from "@tanstack/react-table";
import { useMemo, type ReactNode } from "react";

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** One rendered column. Cell renderers stay in the feature module. */
export interface DataTableColumn<TRow> {
  id: string;
  header: ReactNode;
  cell: (row: TRow) => ReactNode;
  /** Omit for non-sortable columns. */
  ariaSort?: "ascending" | "descending" | "none";
  numeric?: boolean;
  /** Pin the cell at the right edge (row actions). */
  sticky?: boolean;
  className?: string;
}

interface DataTableProps<TRow> {
  /** Accessible caption; rendered visually hidden. */
  caption: string;
  columns: DataTableColumn<TRow>[];
  data: TRow[];
  getRowKey: (row: TRow) => string;
  /** Rendered below the header when there are no rows. */
  empty?: ReactNode;
}

const features = tableFeatures({});

/**
 * Ruled data table built on TanStack Table (§6.7): `<caption>`, `scope="col"`
 * headers, `aria-sort` on sortable columns, 44 px rows, and an internal
 * horizontal scroll container so the page itself never overflows.
 */
export function DataTable<TRow extends RowData>({ caption, columns, data, getRowKey, empty }: DataTableProps<TRow>) {
  const tableColumns = useMemo(
    () =>
      columns.map(
        (column): ColumnDef<typeof features, TRow> => ({
          id: column.id,
          accessorFn: (row) => row,
          header: () => column.header,
          cell: (context) => column.cell(context.row.original as TRow),
        }),
      ),
    [columns],
  );

  const table = useTable({ features, columns: tableColumns, data });
  const columnById = new Map(columns.map((column) => [column.id, column]));

  return (
    <>
      <Table containerLabel={caption}>
        <TableCaption>{caption}</TableCaption>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="hover:bg-transparent">
              {headerGroup.headers.map((header) => {
                const column = columnById.get(header.column.id);
                return (
                  <TableHead
                    key={header.id}
                    aria-sort={column?.ariaSort}
                    className={[
                      column?.numeric ? "bo-cell-num" : "",
                      column?.sticky ? "bo-cell-sticky" : "",
                      column?.className ?? "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={getRowKey(row.original)}>
              {row.getAllCells().map((cell) => {
                const column = columnById.get(cell.column.id);
                return (
                  <TableCell
                    key={cell.id}
                    className={[
                      column?.numeric ? "bo-cell-num" : "",
                      column?.sticky ? "bo-cell-sticky" : "",
                      column?.className ?? "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <table.FlexRender cell={cell} />
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {data.length === 0 && empty ? empty : null}
    </>
  );
}
