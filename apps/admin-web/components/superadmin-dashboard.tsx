"use client";

import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronUp,
  ChevronDown,
  ClipboardCheck,
  Clock,
  Info,
  PackageX,
  Plus,
  TrendingUp,
  UserCog,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useSuperadminDashboard } from "../hooks/use-superadmin-dashboard";
import type { ActivityRow, AttentionClinic, TopClinic } from "../hooks/use-superadmin-dashboard";
import { AdminSignIn } from "./admin-sign-in";
import { useAdminData } from "./admin-data-context";

// ─── Tooltip style shared with existing charts ────────────────────────────────
const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  fontSize: 12,
};

// ─── Status pill helpers ──────────────────────────────────────────────────────
function ActivityStatusPill({ status, label }: { status: ActivityRow["status"]; label: string }) {
  const cls: Record<ActivityRow["status"], string> = {
    resolved: "status-badge status-badge--success",
    pending: "status-badge status-badge--warning",
    rejected: "status-badge status-badge--danger",
    info: "status-badge status-badge--info",
  };
  const Icon: Record<ActivityRow["status"], typeof CheckCircle2> = {
    resolved: CheckCircle2,
    pending: Clock,
    rejected: XCircle,
    info: Info,
  };
  const Ic = Icon[status];
  return (
    <span className={cls[status]}>
      <Ic aria-hidden="true" size={11} />
      {label}
    </span>
  );
}

function IssueIcon({ issue }: { issue: AttentionClinic["issue"] }) {
  if (issue === "low-inventory") return <PackageX aria-hidden="true" size={15} className="sa-attention__issue-icon sa-attention__issue-icon--warning" />;
  if (issue === "high-rejection") return <ClipboardCheck aria-hidden="true" size={15} className="sa-attention__issue-icon sa-attention__issue-icon--danger" />;
  if (issue === "pending-admin") return <UserCog aria-hidden="true" size={15} className="sa-attention__issue-icon sa-attention__issue-icon--info" />;
  return <AlertTriangle aria-hidden="true" size={15} className="sa-attention__issue-icon sa-attention__issue-icon--neutral" />;
}

// ─── Clinic avatar (initials-based) ──────────────────────────────────────────
function ClinicAvatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return <span className="sa-clinic-avatar" aria-hidden="true">{initials}</span>;
}

// ─── Main component ───────────────────────────────────────────────────────────
export function SuperadminDashboard() {
  const { email, loading: authLoading } = useAdminData();
  const { kpis, chartPoints, attentionClinics, activityRows, topClinics, loading, error, alertLine } =
    useSuperadminDashboard();

  if (!authLoading && !email) return <AdminSignIn />;

  const today = new Date();
  const periodStart = new Date(today);
  periodStart.setDate(periodStart.getDate() - 29);
  const periodLabel = `${new Intl.DateTimeFormat("en-PH", { day: "2-digit", month: "short" }).format(periodStart)} – ${new Intl.DateTimeFormat("en-PH", { day: "2-digit", month: "short", year: "numeric" }).format(today)}`;

  return (
    <div className="sa-dashboard">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="sa-header">
        <div className="sa-header__left">
          <p className="page-eyebrow">Platform Superadmin</p>
          <h1 className="sa-header__title">Network Overview</h1>
          {!loading && !error && (
            <p className="sa-header__alert-line">
              <Activity aria-hidden="true" size={13} />
              {alertLine}
            </p>
          )}
        </div>
        <div className="sa-header__actions">
          <button className="ui-button ui-button--outline sa-period-btn" type="button" disabled>
            <span className="sa-period-btn__icon" aria-hidden="true">📅</span>
            {periodLabel}
          </button>
          <Link href="/superadmin/clinics/new" className="ui-button sa-onboard-btn">
            <Plus aria-hidden="true" size={15} />
            Onboard Clinic
          </Link>
        </div>
      </header>

      {/* ── Error state ─────────────────────────────────────────────────── */}
      {error && (
        <section className="data-error" role="alert">
          <strong>Dashboard could not be loaded.</strong>
          <p>{error}</p>
        </section>
      )}

      {/* ── KPI Cards ───────────────────────────────────────────────────── */}
      {!error && (
        <>
          <section className="sa-kpi-row" aria-label="Network KPIs">
            {loading
              ? Array.from({ length: 5 }).map((_, i) => <div key={i} className="sa-kpi-card sa-kpi-card--skeleton" aria-hidden="true" />)
              : kpis.map((kpi) => (
                  <div key={kpi.label} className="sa-kpi-card">
                    <span className="sa-kpi-card__label">{kpi.label}</span>
                    <strong className="sa-kpi-card__value">{kpi.value}</strong>
                    <span className={`sa-kpi-card__delta ${kpi.deltaPositive ? "sa-kpi-card__delta--up" : "sa-kpi-card__delta--down"}`}>
                      {kpi.deltaPositive ? <ChevronUp aria-hidden="true" size={13} /> : <ChevronDown aria-hidden="true" size={13} />}
                      {kpi.delta}
                    </span>
                    {kpi.footnote && <small className="sa-kpi-card__footnote">{kpi.footnote}</small>}
                  </div>
                ))}
          </section>

          {/* ── Chart + Attention Panel ─────────────────────────────────── */}
          <div className="sa-mid-row">
            {/* Chart panel */}
            <section className="sa-chart-panel chart-panel" aria-label="Encounters and revenue trend">
              <div className="panel-heading">
                <div>
                  <h2>Encounters vs. Active Coverages</h2>
                  <p>
                    <TrendingUp aria-hidden="true" size={13} />
                    Daily encounters (left axis) and active HMO/PhilHealth coverages (right axis) over the last 7 days.
                  </p>
                </div>
                <span className="chart-unit">7-day trend</span>
              </div>
              <div className="chart-canvas">
                {loading ? (
                  <div className="chart-empty">Loading chart data…</div>
                ) : !chartPoints.length ? (
                  <div className="chart-empty">No activity data for this period.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartPoints} margin={{ left: -14, right: 8, top: 12 }}>
                      <defs>
                        <linearGradient id="enc-grad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--chart-primary)" stopOpacity={0.18} />
                          <stop offset="95%" stopColor="var(--chart-primary)" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="rev-grad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                      <XAxis axisLine={false} dataKey="label" fontSize={11} tickLine={false} />
                      <YAxis axisLine={false} fontSize={11} tickLine={false} yAxisId="left" />
                      <YAxis axisLine={false} fontSize={11} tickLine={false} yAxisId="right" orientation="right" />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend iconType="line" wrapperStyle={{ fontSize: 12 }} />
                      <Area
                        yAxisId="left"
                        dataKey="encounters"
                        name="Encounters"
                        stroke="var(--chart-primary)"
                        strokeWidth={2.5}
                        fill="url(#enc-grad)"
                        type="monotone"
                        dot={false}
                        activeDot={{ r: 5 }}
                      />
                      <Area
                        yAxisId="right"
                        dataKey="revenue"
                        name="Active Coverages"
                        stroke="#10b981"
                        strokeWidth={2}
                        fill="url(#rev-grad)"
                        strokeDasharray="5 4"
                        type="monotone"
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>

            {/* Clinics Needing Attention */}
            <section className="sa-attention-panel chart-panel" aria-label="Clinics needing attention">
              <div className="panel-heading">
                <div>
                  <h2>Clinics Needing Attention</h2>
                  <p>Flagged for inventory, claims, or access issues.</p>
                </div>
                <Link href="/superadmin/clinics" className="sa-panel-link">
                  View all
                  <ArrowRight aria-hidden="true" size={13} />
                </Link>
              </div>

              {loading ? (
                <div className="chart-empty">Loading…</div>
              ) : !attentionClinics.length ? (
                <div className="sa-attention-empty">
                  <CheckCircle2 aria-hidden="true" size={28} className="sa-attention-empty__icon" />
                  <span>No clinics flagged right now.</span>
                </div>
              ) : (
                <ul className="sa-attention-list" aria-label="Flagged clinics">
                  {attentionClinics.map((clinic) => (
                    <li key={clinic.id} className="sa-attention-item">
                      <ClinicAvatar name={clinic.name} />
                      <div className="sa-attention-item__body">
                        <strong className="sa-attention-item__name">{clinic.name}</strong>
                        <span className="sa-attention-item__stat">{clinic.stat}</span>
                      </div>
                      <div className="sa-attention-item__badge-col">
                        <span className={`sa-issue-badge sa-issue-badge--${clinic.issue}`}>
                          <IssueIcon issue={clinic.issue} />
                          {clinic.issueLabel}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* ── Activity Table + Top Clinics ────────────────────────────── */}
          <div className="sa-bottom-row">
            {/* Recent Network Activity */}
            <section className="sa-activity-panel panel-section" aria-label="Recent network activity">
              <div className="panel-heading">
                <div>
                  <h2>Recent Network Activity</h2>
                  <p>Cross-tenant events from the platform audit log. PII-free.</p>
                </div>
                <Link href="/superadmin/audit" className="sa-panel-link">
                  Full audit log
                  <ArrowRight aria-hidden="true" size={13} />
                </Link>
              </div>

              {loading ? (
                <div className="data-loading">Loading activity…</div>
              ) : (
                <div className="table-frame">
                  <table className="ui-table" aria-label="Recent network activity">
                    <caption className="sr-only">Recent cross-tenant audit events</caption>
                    <thead>
                      <tr>
                        <th scope="col">Event</th>
                        <th scope="col">Actor</th>
                        <th scope="col">Ref ID</th>
                        <th scope="col">Date / Time</th>
                        <th scope="col">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!activityRows.length ? (
                        <tr>
                          <td colSpan={5} className="table-empty">No recent activity found.</td>
                        </tr>
                      ) : (
                        activityRows.map((row) => (
                          <tr key={row.id}>
                            <td>
                              <span className="sa-event-label">{row.entity}</span>
                            </td>
                            <td>
                              <span className="sa-actor">{row.actor}</span>
                            </td>
                            <td>
                              <code className="sa-ref-id">{row.refId}</code>
                            </td>
                            <td className="sa-timestamp">{row.occurredAt}</td>
                            <td>
                              <ActivityStatusPill status={row.status} label={row.statusLabel} />
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Top Clinics by Volume */}
            <section className="sa-top-clinics-panel chart-panel" aria-label="Top clinics by encounter volume">
              <div className="panel-heading">
                <div>
                  <h2>Top Clinics by Volume</h2>
                  <p>Ranked by encounters this period.</p>
                </div>
              </div>

              {loading ? (
                <div className="chart-empty">Loading…</div>
              ) : !topClinics.length ? (
                <div className="chart-empty">No encounter data for this period.</div>
              ) : (
                <ul className="sa-top-list" aria-label="Top clinics by encounter volume">
                  {topClinics.map((clinic, index) => (
                    <li key={clinic.id} className="sa-top-item">
                      <span className="sa-top-item__rank" aria-label={`Rank ${index + 1}`}>{index + 1}</span>
                      <ClinicAvatar name={clinic.name} />
                      <div className="sa-top-item__body">
                        <strong className="sa-top-item__name">{clinic.name}</strong>
                        <span className="sa-top-item__stat">{clinic.volumeLabel}</span>
                      </div>
                      <Link
                        href={`/superadmin/clinics?highlight=${clinic.id}`}
                        className="ui-button ui-button--outline ui-button--sm sa-top-item__view"
                        aria-label={`View ${clinic.name}`}
                      >
                        View
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
