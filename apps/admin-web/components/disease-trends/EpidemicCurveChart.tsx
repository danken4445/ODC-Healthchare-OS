"use client";

import type { EpidemicCurvePoint } from "@odyssey/types";
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function EpidemicCurveChart({ diseaseName, points }: { diseaseName: string | null; points: readonly EpidemicCurvePoint[] }) {
  const data = points.map((point) => ({ ...point, label: `W${point.epiWeek}`, cases: point.caseCount, endemicChannel: point.movingAverage5Week, alertThreshold: point.alertThreshold }));
  return <section className="chart-panel" aria-labelledby="epidemic-curve-title">
    <div className="panel-heading"><div><h2 id="epidemic-curve-title">Epidemic curve</h2><p>{diseaseName ? `${diseaseName}: current season against the endemic channel and alert threshold.` : "Select a reported condition to view its weekly curve."}</p></div><span className="chart-unit">Weekly cases</span></div>
    <div className="chart-canvas" role="img" aria-label={diseaseName ? `Epidemic curve for ${diseaseName}` : "No disease selected"}>
      {!data.length ? <div className="chart-empty">No weekly aggregate data is available for this period.</div> : <ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{ left: -14, right: 8, top: 12 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" axisLine={false} fontSize={11} tickLine={false} />
        <YAxis axisLine={false} fontSize={11} tickLine={false} allowDecimals={false} />
        <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }} />
        <Legend iconType="line" wrapperStyle={{ fontSize: 12 }} />
        <Area dataKey="cases" name="Current season" type="monotone" stroke="var(--chart-primary)" strokeWidth={2} fill="var(--chart-primary-soft)" />
        <Area dataKey="endemicChannel" name="Endemic channel (5-week average)" type="monotone" stroke="var(--chart-secondary)" strokeDasharray="5 4" fill="transparent" />
        <Area dataKey="alertThreshold" name="Alert threshold" type="monotone" stroke="var(--chart-danger)" strokeDasharray="2 3" fill="transparent" />
      </AreaChart></ResponsiveContainer>}
    </div>
  </section>;
}
