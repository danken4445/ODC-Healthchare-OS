"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ChartPoint } from "../hooks/use-admin-analytics";

const tooltipStyle = { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 };

export function DashboardCharts({ activity, comparison, network }: { activity: ChartPoint[]; comparison: ChartPoint[]; network: boolean }) {
  return (
    <div className="chart-grid">
      <section className="chart-panel">
        <div className="panel-heading"><div><h2>{network ? "Network audit activity" : "Completed encounters"}</h2><p>{network ? "Recorded audit events during the last seven days." : "Daily volume against the preceding seven-day period."}</p></div><span className="chart-unit">{network ? "Events" : "Encounters"}</span></div>
        <div className="chart-canvas">
          {!activity.length ? <div className="chart-empty">No activity was recorded for this period.</div> : <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={activity} margin={{ left: -14, right: 8, top: 12 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis axisLine={false} dataKey="label" fontSize={11} tickLine={false} />
              <YAxis axisLine={false} fontSize={11} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend iconType="line" wrapperStyle={{ fontSize: 12 }} />
              <Area dataKey="primary" fill="var(--chart-primary-soft)" name={network ? "Audit events" : "Current period"} stroke="var(--chart-primary)" strokeWidth={2} type="monotone" />
              {!network ? <Area dataKey="secondary" fill="transparent" name="Previous period" stroke="var(--chart-secondary)" strokeDasharray="5 4" strokeWidth={2} type="monotone" /> : null}
            </AreaChart>
          </ResponsiveContainer>}
        </div>
      </section>
      <section className="chart-panel">
        <div className="panel-heading"><div><h2>{network ? "Organizations by state" : "Clinic snapshot"}</h2><p>{network ? "Current organization activation state." : "Current patient, staff, appointment, and waiting-room counts."}</p></div><span className="chart-unit">{network ? "Organizations" : "Records"}</span></div>
        <div className="chart-canvas">
          {!comparison.length ? <div className="chart-empty">No comparison data is available for this period.</div> : <ResponsiveContainer width="100%" height="100%">
            <BarChart data={comparison} layout="vertical" margin={{ left: 12, right: 8, top: 12 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
              <XAxis axisLine={false} fontSize={11} tickLine={false} type="number" />
              <YAxis axisLine={false} dataKey="label" fontSize={11} tickLine={false} type="category" width={68} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="primary" fill="var(--chart-primary)" name={network ? "Organizations" : "Count"} radius={[0, 2, 2, 0]} stackId="a" />
            </BarChart>
          </ResponsiveContainer>}
        </div>
      </section>
    </div>
  );
}
