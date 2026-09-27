"use client";

import { useEffect, useState } from "react";
import { useAdminData } from "../components/admin-data-context";

// ─── Shape types ─────────────────────────────────────────────────────────────

export interface KpiCard {
  label: string;
  value: string;
  delta: string;
  deltaPositive: boolean;
  footnote?: string;
}

export interface ChartPoint {
  label: string;
  encounters: number;
  revenue: number;
}

export interface AttentionClinic {
  id: string;
  name: string;
  issue: "low-inventory" | "high-rejection" | "pending-admin" | "inactive";
  issueLabel: string;
  stat: string;
}

export interface ActivityRow {
  id: string;
  entity: string;
  actor: string;
  refId: string;
  occurredAt: string;
  status: "resolved" | "pending" | "rejected" | "info";
  statusLabel: string;
}

export interface TopClinic {
  id: string;
  name: string;
  type: string;
  volume: number;
  volumeLabel: string;
}

export interface SuperadminDashboardState {
  kpis: KpiCard[];
  chartPoints: ChartPoint[];
  attentionClinics: AttentionClinic[];
  activityRows: ActivityRow[];
  topClinics: TopClinic[];
  loading: boolean;
  error: string | null;
  alertLine: string;
}

// ─── Formatter ───────────────────────────────────────────────────────────────

const dayLabel = (d: Date) =>
  new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", timeZone: "Asia/Manila" }).format(d);

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSuperadminDashboard(): SuperadminDashboardState {
  const { client, email, error: accessError, isSuperadmin, loading: accessLoading, readCache, writeCache } = useAdminData();

  const [state, setState] = useState<SuperadminDashboardState>({
    kpis: [],
    chartPoints: [],
    attentionClinics: [],
    activityRows: [],
    topClinics: [],
    loading: true,
    error: null,
    alertLine: "Loading network status…",
  });

  useEffect(() => {
    let current = true;

    async function load() {
      if (accessLoading) return;
      if (!email || accessError) {
        setState((s) => ({ ...s, error: accessError ?? "Sign-in required.", loading: false }));
        return;
      }
      if (!isSuperadmin) {
        setState((s) => ({ ...s, error: "Superadmin access is required to view this dashboard.", loading: false }));
        return;
      }

      const cacheKey = "superadmin:dashboard:v2";
      const cached = readCache<SuperadminDashboardState>(cacheKey, 60_000);
      if (cached) { setState(cached); return; }

      try {
        // ── Parallel queries ──────────────────────────────────────────────
        const since30 = new Date();
        since30.setDate(since30.getDate() - 29);
        since30.setHours(0, 0, 0, 0);

        const since7 = new Date();
        since7.setDate(since7.getDate() - 6);
        since7.setHours(0, 0, 0, 0);

        const prev30 = new Date(since30);
        prev30.setDate(prev30.getDate() - 30);

        // ── Parallel queries using only typed schema tables ───────────────
        const [orgsResult, auditResult, encountersResult, coveragesResult, inventoryResult] = await Promise.all([
          client.from("organizations").select("id, name, active, created_at"),
          client.from("audit_log").select("id, occurred_at, organization_id, actor_id, actor_type, action, table_name, record_id, metadata").order("occurred_at", { ascending: false }).limit(50),
          client
            .from("encounters")
            .select("period_end, organization_id, status")
            .gte("period_end", prev30.toISOString())
            .eq("status", "finished"),
          // Coverages approximate claims pipeline: active = approved, inactive = expired/rejected
          client
            .from("coverages")
            .select("id, organization_id, status, coverage_type")
            .gte("period_start", since30.toISOString()),
          // Low stock: department_stock rows with critically low quantity (< 5 units)
          // Full cross-column comparison requires an RPC; this is a conservative dashboard proxy
          client
            .from("department_stock")
            .select("id, organization_id, quantity")
            .lt("quantity", 5),
        ]);

        const firstError =
          orgsResult.error ?? auditResult.error ?? encountersResult.error ??
          coveragesResult.error ?? inventoryResult.error;
        if (firstError) throw new Error(firstError.message);

        const orgs = orgsResult.data ?? [];
        const audit = auditResult.data ?? [];
        const encounters = encountersResult.data ?? [];
        const coverages = coveragesResult.data ?? [];
        const lowStockItems = inventoryResult.data ?? [];

        // ── KPI derivations ───────────────────────────────────────────────
        const activeOrgs = orgs.filter((o) => o.active);
        const newThisMonth = orgs.filter((o) => new Date(o.created_at) >= since30).length;

        const encounters30 = encounters.filter((e) => e.period_end && new Date(e.period_end) >= since30);
        const encountersPrev30 = encounters.filter((e) => e.period_end && new Date(e.period_end) < since30);
        const encounterDelta = encountersPrev30.length
          ? Math.round(((encounters30.length - encountersPrev30.length) / encountersPrev30.length) * 100)
          : 0;

        // Claims approximation: use coverages as proxy for PhilHealth/HMO pipeline
        const totalCoverages = coverages.length;
        const activeCoverages = coverages.filter((c) => c.status === "active").length;
        const reimbursementRate = totalCoverages ? Math.round((activeCoverages / totalCoverages) * 100) : 0;

        // Clinics with at least one low-stock item
        const lowStockOrgIds = new Set(lowStockItems.map((i) => i.organization_id));

        const kpis: KpiCard[] = [
          {
            label: "Active Clinics / Tenants",
            value: activeOrgs.length.toLocaleString("en-PH"),
            delta: newThisMonth > 0 ? `+${newThisMonth} this period` : "No new clinics",
            deltaPositive: newThisMonth > 0,
          },
          {
            label: "Network Patient Volume",
            value: encounters30.length.toLocaleString("en-PH"),
            delta: `${encounterDelta >= 0 ? "+" : ""}${encounterDelta}% vs prior period`,
            deltaPositive: encounterDelta >= 0,
          },
          {
            label: "Claims / Coverage Rate",
            value: `${reimbursementRate}%`,
            delta: `${activeCoverages} of ${totalCoverages} coverages active`,
            deltaPositive: reimbursementRate >= 80,
          },
          {
            label: "Outstanding Billing",
            value: "See Analytics",
            delta: "Per-clinic in Platform Analytics",
            deltaPositive: true,
            footnote: "NBB government facilities excluded",
          },
          {
            label: "Inventory Risk Index",
            value: lowStockOrgIds.size.toLocaleString("en-PH"),
            delta: lowStockOrgIds.size > 0 ? `${lowStockItems.length} items below safety stock` : "All clinics within range",
            deltaPositive: lowStockOrgIds.size === 0,
          },
        ];

        // ── Chart points: 7-day encounters per day ────────────────────────
        const chartPoints: ChartPoint[] = Array.from({ length: 7 }, (_, i) => {
          const point = new Date(since7);
          point.setDate(point.getDate() + i);
          const key = point.toISOString().slice(0, 10);
          const dayEncounters = encounters.filter(
            (e) => e.period_end && e.period_end.slice(0, 10) === key,
          ).length;
          // Coverage activations per day used as claims-pipeline proxy
          const dayCoverages = coverages.filter(
            (c) => c.status === "active",
          ).length;
          return { label: dayLabel(point), encounters: dayEncounters, revenue: dayCoverages };
        });

        // ── Attention clinics ─────────────────────────────────────────────
        const attentionClinics: AttentionClinic[] = [];

        // Low inventory
        for (const orgId of lowStockOrgIds) {
          const org = orgs.find((o) => o.id === orgId);
          if (!org) continue;
          const count = lowStockItems.filter((i) => i.organization_id === orgId).length;
          attentionClinics.push({
            id: orgId,
            name: org.name,
            issue: "low-inventory",
            issueLabel: "Low inventory",
            stat: `${count} item${count !== 1 ? "s" : ""} below safety stock`,
          });
        }

        // Inactive orgs
        for (const org of orgs.filter((o) => !o.active).slice(0, 3)) {
          if (attentionClinics.some((a) => a.id === org.id)) continue;
          attentionClinics.push({
            id: org.id,
            name: org.name,
            issue: "inactive",
            issueLabel: "Inactive",
            stat: "Clinic access suspended",
          });
        }

        // ── Activity rows from audit log ──────────────────────────────────
        const activityRows: ActivityRow[] = audit.slice(0, 12).map((row, index) => {
          const action = String(row.action ?? "").replace(/_/g, " ");
          const status = deriveStatus(String(row.action ?? ""));
          // Build a readable actor label from actor_id/actor_type
          const actorLabel = row.actor_type === "system" ? "System" : String(row.actor_id ?? "—").slice(0, 12);
          return {
            // The audit record id is unique; record_id identifies the affected
            // entity and can legitimately repeat across separate events.
            id: String(row.id ?? `${row.record_id ?? "audit"}-${row.occurred_at}-${index}`),
            entity: capitalize(action),
            actor: actorLabel,
            refId: String(row.record_id ?? "—").slice(0, 8),
            occurredAt: new Intl.DateTimeFormat("en-PH", {
              month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
              timeZone: "Asia/Manila",
            }).format(new Date(row.occurred_at)),
            status,
            statusLabel: statusLabel(status),
          };
        });

        // ── Top clinics by encounter volume ───────────────────────────────
        const volumeByOrg = new Map<string, number>();
        for (const e of encounters30) {
          if (!e.organization_id) continue;
          volumeByOrg.set(e.organization_id, (volumeByOrg.get(e.organization_id) ?? 0) + 1);
        }
        const topClinics: TopClinic[] = Array.from(volumeByOrg.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([orgId, vol]) => {
            const org = orgs.find((o) => o.id === orgId);
            return {
              id: orgId,
              name: org?.name ?? "Unknown",
              type: "Clinic",
              volume: vol,
              volumeLabel: `${vol.toLocaleString("en-PH")} encounters`,
            };
          });

        // ── Alert headline ────────────────────────────────────────────────
        const issues: string[] = [];
        if (lowStockOrgIds.size > 0) issues.push(`${lowStockOrgIds.size} clinic${lowStockOrgIds.size !== 1 ? "s" : ""} with inventory risk`);
        if (reimbursementRate < 80) issues.push(`claim approval rate at ${reimbursementRate}%`);
        if (orgs.some((o) => !o.active)) issues.push(`${orgs.filter((o) => !o.active).length} inactive tenant${orgs.filter((o) => !o.active).length !== 1 ? "s" : ""}`);
        const alertLine = issues.length
          ? `Attention needed: ${issues.join(" · ")}.`
          : `Network is healthy — ${activeOrgs.length} active clinic${activeOrgs.length !== 1 ? "s" : ""}, no critical flags.`;

        const nextState: SuperadminDashboardState = {
          kpis, chartPoints, attentionClinics, activityRows, topClinics, loading: false, error: null, alertLine,
        };

        writeCache(cacheKey, nextState);
        if (current) setState(nextState);
      } catch (err) {
        if (current) {
          setState((s) => ({
            ...s,
            error: err instanceof Error ? err.message : "Dashboard data could not be loaded.",
            loading: false,
          }));
        }
      }
    }

    void load();
    return () => { current = false; };
  }, [accessError, accessLoading, client, email, isSuperadmin, readCache, writeCache]);

  return state;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function deriveStatus(action: string): ActivityRow["status"] {
  const lower = action.toLowerCase();
  if (lower.includes("reject") || lower.includes("fail") || lower.includes("delete") || lower.includes("suspend")) return "rejected";
  if (lower.includes("pending") || lower.includes("submit") || lower.includes("request")) return "pending";
  if (lower.includes("create") || lower.includes("approve") || lower.includes("onboard") || lower.includes("activate")) return "resolved";
  return "info";
}

function statusLabel(status: ActivityRow["status"]) {
  const map: Record<ActivityRow["status"], string> = {
    resolved: "Resolved",
    pending: "Pending",
    rejected: "Rejected",
    info: "Logged",
  };
  return map[status];
}
