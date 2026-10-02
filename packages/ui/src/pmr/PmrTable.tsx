import React from "react";

export interface PmrColumn<T> {
  header: string;
  accessor?: keyof T | ((row: T) => React.ReactNode);
  className?: string;
  width?: string | number;
}

export interface PmrTableProps<T> {
  columns: Array<PmrColumn<T>>;
  data: T[];
  emptyMessage?: string;
  caption?: string;
}

export function PmrTable<T>({
  columns,
  data,
  emptyMessage = "No records documented.",
  caption,
}: PmrTableProps<T>) {
  if (data.length === 0) {
    return (
      <p style={{ margin: "4px 0 8px", fontStyle: "italic", fontSize: "8.5pt", color: "#555" }}>
        {emptyMessage}
      </p>
    );
  }

  return (
    <table className="pmr-table">
      {caption && <caption className="sr-only">{caption}</caption>}
      <thead>
        <tr>
          {columns.map((col, idx) => (
            <th key={idx} className={col.className} style={{ width: col.width }}>
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((row, rowIdx) => {
          const rowKey =
            typeof row === "object" && row !== null && "id" in row
              ? String((row as { id: unknown }).id)
              : rowIdx;
          return (
            <tr key={rowKey} className="pmr-row-avoid">
              {columns.map((col, colIdx) => {
                const value =
                  typeof col.accessor === "function"
                    ? col.accessor(row)
                    : col.accessor
                    ? (row[col.accessor] as React.ReactNode)
                    : null;
                return (
                  <td key={colIdx} className={col.className}>
                    {value}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
