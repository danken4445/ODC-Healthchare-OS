"use client";

import {
  listClinicOperationsLogs,
  getStaffAdministration,
  type ClinicOperationsLogEntry,
  type ClinicOperationsLogFilters,
} from "@odyssey/supabase-client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdminData } from "../components/admin-data-context";
import type { SummaryItem } from "../components/summary-strip";

export type DatePreset = "today" | "7d" | "30d" | "custom";

export interface OperationsLogFiltersState {
  datePreset: DatePreset;
  startDate: string;
  endDate: string;
  module: string;
  action: string;
  actorId: string;
  search: string;
}

export function formatDatePst(value: string | null | undefined, withTime = true) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("en-PH", {
      dateStyle: "medium",
      ...(withTime ? { timeStyle: "medium" } : {}),
      timeZone: "Asia/Manila",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function useOperationsLogs() {
  const { client, organization, permissions, isSuperadmin, isOrganizationAdmin, permissionsLoading } = useAdminData();
  const organizationId = organization?.id ?? null;
  const canView = isSuperadmin || isOrganizationAdmin || permissions.includes("can_view_audit_log");

  const [filters, setFilters] = useState<OperationsLogFiltersState>({
    datePreset: "today",
    startDate: "",
    endDate: "",
    module: "all",
    action: "all",
    actorId: "all",
    search: "",
  });

  const [logs, setLogs] = useState<ClinicOperationsLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [staffList, setStaffList] = useState<Array<{ id: string; name: string }>>([]);
  const [revision, setRevision] = useState(0);

  const refresh = useCallback(() => setRevision((r) => r + 1), []);

  // Fetch staff list for the actor filter dropdown
  useEffect(() => {
    if (!client || !organizationId || !canView) return;
    let isMounted = true;
    getStaffAdministration(client, organizationId)
      .then((res) => {
        if (!isMounted) return;
        if (!res.error && res.data) {
          const seen = new Set<string>();
          const list: Array<{ id: string; name: string }> = [];
          for (const s of res.data.staff) {
            if (s.userId && !seen.has(s.userId)) {
              seen.add(s.userId);
              list.push({
                id: s.userId,
                name: s.displayName || s.email || s.userId,
              });
            }
          }
          setStaffList(list);
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [client, organizationId, canView]);

  // Compute time bounds based on active preset
  const { startTime, endTime } = useMemo(() => {
    const now = new Date();
    if (filters.datePreset === "today") {
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      return { startTime: todayStart.toISOString(), endTime: now.toISOString() };
    }
    if (filters.datePreset === "7d") {
      const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { startTime: start.toISOString(), endTime: now.toISOString() };
    }
    if (filters.datePreset === "30d") {
      const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { startTime: start.toISOString(), endTime: now.toISOString() };
    }
    if (filters.datePreset === "custom") {
      const start = filters.startDate ? new Date(`${filters.startDate}T00:00:00+08:00`).toISOString() : undefined;
      const end = filters.endDate ? new Date(`${filters.endDate}T23:59:59.999+08:00`).toISOString() : undefined;
      return { startTime: start, endTime: end };
    }
    return { startTime: undefined, endTime: undefined };
  }, [filters.datePreset, filters.startDate, filters.endDate]);

  // Fetch operations logs
  useEffect(() => {
    if (!client || !organizationId || permissionsLoading) {
      if (!permissionsLoading) setLoading(false);
      return;
    }

    if (!canView) {
      setLoading(false);
      setError("Administrator access or audit permissions (can_view_audit_log) required to view clinic operations logs.");
      setLogs([]);
      return;
    }

    let isCancelled = false;
    setLoading(true);
    setError(null);

    const queryFilters: ClinicOperationsLogFilters = {
      module: filters.module !== "all" ? filters.module : undefined,
      action: filters.action !== "all" ? filters.action : undefined,
      actorId: filters.actorId !== "all" ? filters.actorId : undefined,
      startTime,
      endTime,
      search: filters.search.trim() ? filters.search.trim() : undefined,
      limit: 300,
    };

    listClinicOperationsLogs(client, organizationId, queryFilters)
      .then((res) => {
        if (isCancelled) return;
        if (res.error) {
          setError(res.error.message);
          setLogs([]);
        } else {
          setLogs(res.data);
        }
      })
      .catch((err) => {
        if (isCancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load clinic operations logs.");
        setLogs([]);
      })
      .finally(() => {
        if (!isCancelled) setLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [client, organizationId, canView, permissionsLoading, filters.module, filters.action, filters.actorId, filters.search, startTime, endTime, revision]);

  // Calculate summary statistics
  const summaries = useMemo<SummaryItem[]>(() => {
    const total = logs.length;
    const financialCount = logs.filter((l) => l.module === "billing").length;
    const clinicalQueueCount = logs.filter((l) => l.module === "clinical" || l.module === "appointments").length;
    const uniqueActors = new Set(logs.map((l) => l.actorName).filter(Boolean)).size;

    return [
      {
        label: "Total movements",
        value: total.toLocaleString(),
        detail: filters.datePreset === "today" ? "Recorded today" : "In filtered range",
      },
      {
        label: "Financial & POS",
        value: financialCount.toLocaleString(),
        detail: "Invoices, payments, receipts",
      },
      {
        label: "Clinical & Queue",
        value: clinicalQueueCount.toLocaleString(),
        detail: "Appointments, notes, vitals",
      },
      {
        label: "Active operators",
        value: uniqueActors.toLocaleString(),
        detail: "Staff & system actors",
      },
    ];
  }, [logs, filters.datePreset]);

  // Export CSV helper
  const exportCsv = useCallback(() => {
    if (!logs.length) return;
    const headers = ["Timestamp (PST)", "Module", "Action", "Description", "Actor", "Actor Type", "Record ID", "Table Name"];
    const rows = logs.map((log) => [
      `"${formatDatePst(log.occurredAt)}"`,
      `"${log.module}"`,
      `"${log.action}"`,
      `"${log.description.replaceAll('"', '""')}"`,
      `"${log.actorName.replaceAll('"', '""')}"`,
      `"${log.actorType}"`,
      `"${log.recordId ?? ""}"`,
      `"${log.tableName}"`,
    ]);
    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `clinic-operations-log-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [logs]);

  return {
    filters,
    setFilters,
    logs,
    loading,
    error,
    staffList,
    summaries,
    refresh,
    exportCsv,
  };
}
