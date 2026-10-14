"use client";

import type { ClinicOperationsLogEntry } from "@odyssey/supabase-client";
import { Eye, FileClock, History, Info, ShieldCheck, User } from "lucide-react";
import { useState } from "react";
import { useAdminData } from "../../../components/admin-data-context";
import { AdminSignIn } from "../../../components/admin-sign-in";
import { PageHeader } from "../../../components/page-header";
import { SummaryStrip } from "../../../components/summary-strip";
import { Button } from "../../../components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";
import {
  formatDatePst,
  useOperationsLogs,
} from "../../../hooks/use-operations-logs";
import { LogDetailDrawer } from "./components/log-detail-drawer";
import { LogFilterToolbar } from "./components/log-filter-toolbar";

function ModuleBadge({ module }: { module: string }) {
  const labelMap: Record<string, string> = {
    billing: "Billing & POS",
    appointments: "Appointments",
    pharmacy: "Pharmacy",
    clinical: "Clinical EHR",
    diagnostics: "Diagnostics",
    inventory: "Inventory",
    governance: "Governance",
  };

  return (
    <span className={`ops-badge ops-badge--module-${module}`}>
      {labelMap[module] ?? module}
    </span>
  );
}

function ActionBadge({ action }: { action: string }) {
  const normalized = action.toLowerCase();
  let tone = "neutral";
  if (normalized === "insert") tone = "insert";
  else if (normalized === "update") tone = "update";
  else if (normalized === "delete") tone = "delete";

  const label =
    normalized === "insert"
      ? "Create"
      : normalized === "update"
      ? "Update"
      : normalized === "delete"
      ? "Delete"
      : action;

  return <span className={`ops-badge ops-badge--action-${tone}`}>{label}</span>;
}

export default function OperationsLogPage() {
  const { email, loading: authLoading } = useAdminData();
  const {
    filters,
    setFilters,
    logs,
    loading,
    error,
    staffList,
    summaries,
    refresh,
    exportCsv,
  } = useOperationsLogs();

  const [selectedLog, setSelectedLog] = useState<ClinicOperationsLogEntry | null>(null);

  if (!authLoading && !email) return <AdminSignIn />;

  return (
    <div className="operations-log-page">
      <PageHeader
        eyebrow="Analytics & Governance"
        title="Operations Log"
        description="Authoritative, clinic-wide audit trail of operational movements, financial transactions, clinical care events, and administrative activities."
      />

      <SummaryStrip items={summaries} />

      <LogFilterToolbar
        filters={filters}
        setFilters={setFilters}
        staffList={staffList}
        onRefresh={refresh}
        onExportCsv={exportCsv}
        loading={loading}
      />

      {error ? (
        <div className="data-error-banner" role="alert" style={{ margin: "1rem 0" }}>
          <strong>Error loading operations log:</strong> {error}
        </div>
      ) : null}

      <section className="data-table mt-4" aria-label="Operations Log Table">
        <div className="table-frame">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead style={{ minWidth: "170px" }}>Timestamp (PST)</TableHead>
                <TableHead style={{ minWidth: "130px" }}>Domain / Module</TableHead>
                <TableHead style={{ minWidth: "100px" }}>Action</TableHead>
                <TableHead style={{ minWidth: "260px" }}>Movement Description</TableHead>
                <TableHead style={{ minWidth: "180px" }}>Operator / Actor</TableHead>
                <TableHead style={{ minWidth: "140px" }}>Target Record</TableHead>
                <TableHead style={{ width: "90px", textAlign: "right" }}>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && !logs.length ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted">
                    <div className="flex items-center justify-center gap-2">
                      <span className="loading-spinner" aria-hidden="true" />
                      <span>Loading operations log movements…</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : !logs.length ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <FileClock size={28} className="text-muted-foreground opacity-60" />
                      <p className="font-medium">No operations logs match the selected filters.</p>
                      <small className="text-muted-foreground">
                        Try adjusting your date range, module, or search keywords.
                      </small>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow
                    key={log.id}
                    className="cursor-pointer hover:bg-muted/40 transition-colors"
                    onClick={() => setSelectedLog(log)}
                  >
                    <TableCell className="font-mono text-xs whitespace-nowrap">
                      {formatDatePst(log.occurredAt)}
                    </TableCell>
                    <TableCell>
                      <ModuleBadge module={log.module} />
                    </TableCell>
                    <TableCell>
                      <ActionBadge action={log.action} />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-foreground">{log.description}</div>
                      <span className="text-xs text-muted-foreground font-mono">
                        {log.tableName}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <User size={13} className="text-muted-foreground shrink-0" />
                        <span className="truncate max-w-[170px]" title={log.actorName}>
                          {log.actorName}
                        </span>
                      </div>
                      <span className="text-[11px] text-muted-foreground capitalize">
                        {log.actorType.replace("_", " ")}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {log.recordId ? (
                        <span title={log.recordId}>
                          {log.recordId.slice(0, 8)}…{log.recordId.slice(-4)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell style={{ textAlign: "right" }}>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedLog(log);
                        }}
                        title="Inspect movement payload"
                        className="h-8 px-2"
                      >
                        <Eye size={14} aria-hidden="true" />
                        <span className="sr-only">Inspect</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* Slide-over Detail Inspector Drawer */}
      <LogDetailDrawer log={selectedLog} onClose={() => setSelectedLog(null)} />
    </div>
  );
}
