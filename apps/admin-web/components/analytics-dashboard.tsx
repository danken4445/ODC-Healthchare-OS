"use client";

import { CalendarDays, Download } from "lucide-react";
import { useAdminAnalytics } from "../hooks/use-admin-analytics";
import { AdminSignIn } from "./admin-sign-in";
import { useAdminData } from "./admin-data-context";
import { DashboardCharts } from "./dashboard-charts";
import { DataTable } from "./data-table";
import { PageHeader } from "./page-header";
import { StatusBadge } from "./status-badge";
import { SummaryStrip } from "./summary-strip";
import { Button } from "./ui/button";

export function AnalyticsDashboard({ network = false }: { network?: boolean }) {
  const { email } = useAdminData();
  const { activity, comparison, error, exceptions, loading, summaries } = useAdminAnalytics(network);
  const today = new Date();
  const periodStart = new Date(today);
  periodStart.setDate(periodStart.getDate() - 29);
  const periodLabel = `${new Intl.DateTimeFormat("en-PH", { day: "2-digit", month: "short" }).format(periodStart)} - ${new Intl.DateTimeFormat("en-PH", { day: "2-digit", month: "short", year: "numeric" }).format(today)}`;

  if (!email && error) return <AdminSignIn />;

  return (
    <>
      <PageHeader
        eyebrow={network ? "Platform oversight" : "Operational analytics"}
        title={network ? "Network analytics" : "Clinic performance"}
        description={network ? "Network-wide activity and operational exceptions across every organization." : "Clinical activity, revenue collection, and operational exceptions for the selected clinic."}
        actions={<><Button variant="outline" disabled><CalendarDays aria-hidden="true" size={16} />{periodLabel}</Button><Button variant="outline" onClick={() => window.print()}><Download aria-hidden="true" size={16} />Export report</Button></>}
      />
      {error ? <section className="data-error" role="alert"><strong>Analytics could not be loaded.</strong><p>{error}</p></section> : loading ? <section className="data-loading">Loading database analytics...</section> : <><SummaryStrip items={summaries} /><DashboardCharts activity={activity} comparison={comparison} network={network} /></>}
      <section className="panel-section">
        <div className="panel-heading"><div><h2>Operational exceptions</h2><p>Items that require accountable follow-up. This is not a complete activity feed.</p></div></div>
        {!loading && !error ? <DataTable caption="Operational exceptions" columns={[
          { key: "item", label: "Exception" }, { key: "owner", label: "Responsible owner" }, { key: "detail", label: "Current position" },
          { key: "status", label: "Status", render: (row) => <StatusBadge label={String(row.status)} /> },
        ]} data={exceptions} emptyMessage="No operational exceptions are open." /> : null}
      </section>
    </>
  );
}
