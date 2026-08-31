import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TableHTMLAttributes,
} from "react";
import type { AppointmentStatus } from "@odyssey/types";

export function cn(
  ...values: Array<string | false | null | undefined>
): string {
  return values.filter(Boolean).join(" ");
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: "default" | "sm";
  variant?: "default" | "secondary" | "outline" | "ghost" | "destructive";
}

/** A shadcn-compatible button API using the shared CSS variable theme. */
export function Button({
  className,
  size = "default",
  type = "button",
  variant = "default",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "odyssey-button",
        `odyssey-button--${variant}`,
        `odyssey-button--${size}`,
        className,
      )}
      type={type}
      {...props}
    />
  );
}

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("odyssey-input", className)} {...props} />;
}

export interface FieldProps {
  children: ReactNode;
  className?: string;
  hint?: ReactNode;
  label: ReactNode;
}

export function Field({ children, className, hint, label }: FieldProps) {
  return (
    <label className={cn("odyssey-field", className)}>
      <span>{label}</span>
      {children}
      {hint ? <small className="odyssey-field__hint">{hint}</small> : null}
    </label>
  );
}

export interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className }: CardProps) {
  return (
    <section className={cn("odyssey-card", className)}>{children}</section>
  );
}

export interface DataTableColumn<Row> {
  cell: (row: Row) => ReactNode;
  className?: string;
  header: ReactNode;
  id: string;
}

export interface DataTableProps<
  Row,
> extends TableHTMLAttributes<HTMLTableElement> {
  caption: string;
  columns: Array<DataTableColumn<Row>>;
  data: Row[];
  emptyMessage?: string;
  getRowId: (row: Row, index: number) => string;
}

export function DataTable<Row>({
  caption,
  className,
  columns,
  data,
  emptyMessage = "No records to display.",
  getRowId,
  ...props
}: DataTableProps<Row>) {
  return (
    <div className="odyssey-table-scroll">
      <table className={cn("odyssey-table", className)} {...props}>
        <caption>{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.id} scope="col">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length ? (
            data.map((row, index) => (
              <tr key={getRowId(row, index)}>
                {columns.map((column) => (
                  <td className={column.className} key={column.id}>
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td className="odyssey-table__empty" colSpan={columns.length}>
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

const appointmentStatusLabels: Record<AppointmentStatus, string> = {
  proposed: "Proposed",
  pending: "Pending",
  booked: "Booked",
  arrived: "Arrived",
  fulfilled: "Fulfilled",
  cancelled: "Cancelled",
  noshow: "No show",
};

export function AppointmentStatusBadge({
  status,
}: {
  status: AppointmentStatus;
}) {
  return (
    <span
      className={cn("odyssey-status-badge", `odyssey-status-badge--${status}`)}
    >
      {appointmentStatusLabels[status]}
    </span>
  );
}
