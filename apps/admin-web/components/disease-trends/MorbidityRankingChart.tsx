"use client";

import type { MorbidityTrend } from "@odyssey/types";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";

const trendStyle = {
  Declining: { Icon: TrendingDown, label: "Declining", tone: "var(--status-success)" },
  Rising: { Icon: TrendingUp, label: "Rising", tone: "var(--status-danger)" },
  Stable: { Icon: Minus, label: "Stable", tone: "var(--status-neutral)" },
} as const;

export function MorbidityRankingChart({ onSelect, selectedCode, trends }: {
  onSelect: (icd10Code: string) => void;
  selectedCode: string | null;
  trends: readonly MorbidityTrend[];
}) {
  const total = trends.reduce((sum, trend) => sum + (trend.caseCount ?? 0), 0);
  const largest = Math.max(...trends.map((trend) => trend.caseCount ?? 0), 1);
  return <section className="chart-panel" aria-labelledby="morbidity-ranking-title">
    <div className="panel-heading"><div><h2 id="morbidity-ranking-title">Morbidity ranking</h2><p>Top reported conditions in the selected epidemiological year.</p></div><span className="chart-unit">Top 10</span></div>
    {trends.length === 0 ? <div className="chart-empty">No reportable morbidity trends are available.</div> : <ol style={{ display: "grid", gap: "0.55rem", margin: 0, padding: "0.25rem 0 0", listStyle: "none" }}>
      {trends.map((trend, index) => {
        const count = trend.caseCount ?? 0;
        const share = total ? Math.round((count / total) * 100) : 0;
        const status = trendStyle[trend.trend];
        const StatusIcon = status.Icon;
        return <li key={trend.icd10Code}>
          <button type="button" onClick={() => onSelect(trend.icd10Code)} aria-pressed={selectedCode === trend.icd10Code} aria-label={`View trend detail for ${trend.diseaseName}`} style={{ width: "100%", display: "grid", gridTemplateColumns: "2rem minmax(8rem, 1fr) minmax(6rem, 2fr) auto", alignItems: "center", gap: "0.6rem", padding: "0.45rem", color: "var(--foreground)", background: selectedCode === trend.icd10Code ? "var(--muted)" : "transparent", border: "1px solid var(--border)", borderRadius: "var(--radius)", cursor: "pointer", textAlign: "left" }}>
            <span aria-hidden="true" style={{ color: "var(--muted-foreground)", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{index + 1}</span>
            <span style={{ minWidth: 0 }}><strong style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "0.78rem" }}>{trend.diseaseName}</strong><span style={{ color: "var(--muted-foreground)", fontSize: "0.68rem" }}>{trend.icd10Code}</span></span>
            <span aria-hidden="true" style={{ height: "0.65rem", overflow: "hidden", background: "var(--muted)", borderRadius: "999px" }}><span style={{ display: "block", width: `${(count / largest) * 100}%`, height: "100%", background: "var(--chart-primary)", borderRadius: "inherit", backgroundImage: "repeating-linear-gradient(135deg, transparent 0 5px, rgba(255,255,255,.24) 5px 7px)" }} /></span>
            <span style={{ display: "grid", justifyItems: "end", gap: "0.12rem", fontVariantNumeric: "tabular-nums" }}><strong>{count}</strong><span style={{ color: "var(--muted-foreground)", fontSize: "0.68rem" }}>{share}% share</span><span style={{ display: "inline-flex", alignItems: "center", gap: "0.2rem", color: status.tone, fontSize: "0.66rem", fontWeight: 700 }}><StatusIcon aria-hidden="true" size={13} />{status.label}</span></span>
          </button>
        </li>;
      })}
    </ol>}
  </section>;
}
