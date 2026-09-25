"use client";

import { getGovernanceDashboard } from "@odyssey/supabase-client";
import { useEffect, useState } from "react";
import { useAdminData } from "../components/admin-data-context";
import type { DataRow } from "../components/data-table";
import type { SummaryItem } from "../components/summary-strip";
import { php } from "../lib/admin-data";

export interface ChartPoint { label: string; primary: number; secondary: number; }
interface AnalyticsState { activity: ChartPoint[]; comparison: ChartPoint[]; error: string | null; exceptions: DataRow[]; loading: boolean; summaries: SummaryItem[]; }

const dayKey = (value: Date) => value.toISOString().slice(0, 10);
const dayLabel = (value: Date) => new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", timeZone: "Asia/Manila" }).format(value);

export function useAdminAnalytics(network: boolean): AnalyticsState {
  const { client, email, error: accessError, isSuperadmin, loading: accessLoading, organization, readCache, writeCache } = useAdminData();
  const [state, setState] = useState<AnalyticsState>({ activity: [], comparison: [], error: null, exceptions: [], loading: true, summaries: [] });
  useEffect(() => {
    let current = true;
    async function load() {
      if (accessLoading) return;
      if (!email || accessError) { setState((value) => ({ ...value, error: accessError ?? "Administrative sign-in is required.", loading: false })); return; }
      const cacheKey = `analytics:${network ? "network" : organization?.id ?? "none"}`;
      const cached = readCache<AnalyticsState>(cacheKey);
      if (cached) { setState(cached); return; }
      try {
        if (network) {
          if (!isSuperadmin) throw new Error("Network analytics requires a platform administrator account.");
          const since = new Date(); since.setDate(since.getDate() - 6); since.setHours(0, 0, 0, 0);
          const [organizationsResult, auditResult, adminsResult] = await Promise.all([
            client.from("organizations").select("id, name, active, created_at"),
            client.from("audit_log").select("occurred_at, organization_id, action").gte("occurred_at", since.toISOString()),
            client.from("platform_admins").select("user_id"),
          ]);
          const firstError = organizationsResult.error ?? auditResult.error ?? adminsResult.error;
          if (firstError) throw new Error(firstError.message);
          const organizations = organizationsResult.data ?? [];
          const audit = auditResult.data ?? [];
          const activity: ChartPoint[] = Array.from({ length: 7 }, (_, index) => { const point = new Date(since); point.setDate(point.getDate() + index); const key = dayKey(point); return { label: dayLabel(point), primary: audit.filter((event) => dayKey(new Date(event.occurred_at)) === key).length, secondary: 0 }; });
          const active = organizations.filter((item) => item.active).length;
          const comparison = [{ label: "Active", primary: active, secondary: 0 }, { label: "Inactive", primary: organizations.length - active, secondary: 0 }];
          const exceptions: DataRow[] = organizations.filter((item) => !item.active).map((item) => ({ item: "Inactive organization", owner: item.name, detail: "Organization access is disabled", status: "Review" }));
          if (current) {
            const nextState = { activity, comparison, error: null, exceptions, loading: false, summaries: [{ label: "Organizations", value: organizations.length.toLocaleString(), detail: `${active} active` }, { label: "Audit events (7 days)", value: audit.length.toLocaleString(), detail: "Network-wide database log" }, { label: "Platform administrators", value: (adminsResult.data ?? []).length.toLocaleString(), detail: "Privileged accounts" }] };
            writeCache(cacheKey, nextState);
            setState(nextState);
          }
          return;
        }
        if (!organization) throw new Error("Select a clinic organization to load analytics.");
        const since = new Date(); since.setDate(since.getDate() - 6); since.setHours(0, 0, 0, 0);
        const previousSince = new Date(since); previousSince.setDate(previousSince.getDate() - 7);
        const [dashboard, encountersResult] = await Promise.all([
          getGovernanceDashboard(client, organization.id),
          client.from("encounters").select("period_end, status").eq("organization_id", organization.id).gte("period_end", previousSince.toISOString()).eq("status", "finished"),
        ]);
        const firstError = dashboard.error ?? encountersResult.error;
        if (firstError) throw new Error(firstError.message);
        if (!dashboard.data) throw new Error("Analytics data was not returned by the database.");
        const encounters = encountersResult.data ?? [];
        const activity: ChartPoint[] = Array.from({ length: 7 }, (_, index) => { const point = new Date(since); point.setDate(point.getDate() + index); const previous = new Date(point); previous.setDate(previous.getDate() - 7); return { label: dayLabel(point), primary: encounters.filter((event) => event.period_end && dayKey(new Date(event.period_end)) === dayKey(point)).length, secondary: encounters.filter((event) => event.period_end && dayKey(new Date(event.period_end)) === dayKey(previous)).length }; });
        const comparison = [
          { label: "Patients", primary: dashboard.data.activePatients, secondary: 0 },
          { label: "Staff", primary: dashboard.data.activeStaff, secondary: 0 },
          { label: "Today", primary: dashboard.data.appointmentsToday, secondary: 0 },
          { label: "Waiting", primary: dashboard.data.waitingNow, secondary: 0 },
        ];
        const exceptions: DataRow[] = [
          ...(dashboard.data.outstandingInvoices ? [{ item: "Outstanding invoices", owner: "Revenue operations", detail: `${dashboard.data.outstandingInvoices} invoices / ${php.format(dashboard.data.outstandingBalance)}`, status: "Review" }] : []),
        ];
        if (current) {
          const nextState = { activity, comparison, error: null, exceptions, loading: false, summaries: [{ label: "Completed encounters (30 days)", value: dashboard.data.completedEncounters30d.toLocaleString(), detail: `${dashboard.data.appointmentsToday} appointments today` }, { label: "Confirmed revenue (30 days)", value: php.format(dashboard.data.confirmedRevenue30d), detail: "Database-confirmed payments" }, { label: "Outstanding balance", value: php.format(dashboard.data.outstandingBalance), detail: `${dashboard.data.outstandingInvoices} open invoices` }] };
          writeCache(cacheKey, nextState);
          setState(nextState);
        }
      } catch (error) { if (current) setState({ activity: [], comparison: [], error: error instanceof Error ? error.message : "Analytics could not be loaded.", exceptions: [], loading: false, summaries: [] }); }
    }
    void load();
    return () => { current = false; };
  }, [accessError, accessLoading, client, email, isSuperadmin, network, organization, readCache, writeCache]);
  return state;
}
