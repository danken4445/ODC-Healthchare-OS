"use client";

import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type LegacyColumnDef,
  useLegacyTable,
} from "@tanstack/react-table/legacy";
import { flexRender } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown, Download, Search } from "lucide-react";
import { ReactNode, useMemo, useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

export type DataRow = Record<string, string | number | ReactNode>;

export interface DataColumn {
  key: string;
  label: string;
  numeric?: boolean;
  render?: (row: DataRow) => ReactNode;
}

function SortIcon({ direction }: { direction: false | "asc" | "desc" }) {
  if (direction === "asc") return <ArrowUp aria-hidden="true" size={13} />;
  if (direction === "desc") return <ArrowDown aria-hidden="true" size={13} />;
  return <ChevronsUpDown aria-hidden="true" size={13} />;
}

export function DataTable({
  caption,
  columns,
  data,
  emptyMessage = "No records match the current filters.",
  exportLabel = "Export CSV",
  searchPlaceholder = "Search records",
  rowActions,
}: {
  caption: string;
  columns: DataColumn[];
  data: DataRow[];
  emptyMessage?: string;
  exportLabel?: string;
  searchPlaceholder?: string;
  rowActions?: (row: DataRow) => ReactNode;
}) {
  const [globalFilter, setGlobalFilter] = useState("");
  const tableColumns = useMemo<LegacyColumnDef<DataRow>[]>(
    () => [
      ...columns.map((column) => ({
        accessorKey: column.key,
        cell: ({ row }: { row: { original: DataRow } }) => column.render ? column.render(row.original) : row.original[column.key],
        header: column.label,
        id: column.key,
        meta: { numeric: column.numeric },
      })),
      ...(rowActions ? [{ id: "__actions", header: "Actions", cell: ({ row }: { row: { original: DataRow } }) => rowActions(row.original) }] : []),
    ],
    [columns, rowActions],
  );
  const table = useLegacyTable({
    columns: tableColumns,
    data,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onGlobalFilterChange: setGlobalFilter,
    state: { globalFilter },
  });

  function exportCsv() {
    const rows = table.getFilteredRowModel().rows.map((row) => row.original);
    const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csv = [
      columns.map((column) => escape(column.label)).join(","),
      ...rows.map((row) => columns.map((column) => escape(row[column.key])).join(",")),
    ].join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    link.download = `${caption.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <section className="data-table" aria-label={caption}>
      <div className="data-table__toolbar">
        <label className="search-field">
          <Search aria-hidden="true" size={16} />
          <span className="sr-only">{searchPlaceholder}</span>
          <Input value={globalFilter} onChange={(event) => setGlobalFilter(event.target.value)} placeholder={searchPlaceholder} />
        </label>
        <Button variant="outline" size="sm" onClick={exportCsv}><Download aria-hidden="true" size={15} />{exportLabel}</Button>
      </div>
      <div className="table-frame">
        <Table>
          <caption className="sr-only">{caption}</caption>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const numeric = (header.column.columnDef.meta as { numeric?: boolean } | undefined)?.numeric;
                  return (
                    <TableHead
                      aria-sort={header.column.getIsSorted() === "asc" ? "ascending" : header.column.getIsSorted() === "desc" ? "descending" : "none"}
                      className={numeric ? "cell-number" : ""}
                      key={header.id}
                    >
                      {header.isPlaceholder ? null : (
                        <button className="sort-button" onClick={header.column.getToggleSortingHandler()} type="button">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <SortIcon direction={header.column.getIsSorted()} />
                        </button>
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => {
                  const numeric = (cell.column.columnDef.meta as { numeric?: boolean } | undefined)?.numeric;
                  return <TableCell className={numeric ? "cell-number" : ""} key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>;
                })}
              </TableRow>
            )) : (
              <TableRow><TableCell className="table-empty" colSpan={columns.length + (rowActions ? 1 : 0)}>{emptyMessage}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <footer className="data-table__footer">
        <span>{table.getFilteredRowModel().rows.length} records</span>
        <div>
          <Button size="sm" variant="outline" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>Previous</Button>
          <span>Page {table.getState().pagination.pageIndex + 1} of {Math.max(table.getPageCount(), 1)}</span>
          <Button size="sm" variant="outline" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>Next</Button>
        </div>
      </footer>
    </section>
  );
}
