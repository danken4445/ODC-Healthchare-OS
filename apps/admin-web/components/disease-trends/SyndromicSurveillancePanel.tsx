"use client";

import type { MorbidityTrend } from "@odyssey/types";
import { AlertTriangle, TrendingDown, TrendingUp, Minus } from "lucide-react";

const syndromes = [
  { label: "Acute febrile illness", matcher: /dengue|febrile|fever/i, short: "AFI" },
  { label: "Influenza-like illness", matcher: /influenza|respiratory|ili|pneumonia/i, short: "ILI" },
  { label: "Acute diarrhea", matcher: /diarr|gastroenteritis|acute gastro/i, short: "ADD" },
] as const;

export function SyndromicSurveillancePanel({ trends }: { trends: readonly MorbidityTrend[] }) {
  return <section className="panel-section" aria-labelledby="syndromic-title"><div className="panel-heading"><div><h2 id="syndromic-title">Syndromic surveillance</h2><p>Early signal screen derived from the same aggregate morbidity rollups.</p></div><span className="chart-unit">Signals</span></div><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem" }}>
    {syndromes.map((syndrome) => {
      const matches = trends.filter((trend) => syndrome.matcher.test(trend.diseaseName));
      const count = matches.reduce((sum, trend) => sum + (trend.caseCount ?? 0), 0);
      const rising = matches.some((trend) => trend.trend === "Rising");
      const declining = matches.length > 0 && matches.every((trend) => trend.trend === "Declining");
      const Icon = rising ? TrendingUp : declining ? TrendingDown : Minus;
      const label = rising ? "Spike signal" : declining ? "Declining" : "No spike signal";
      return <article key={syndrome.short} style={{ padding: "0.9rem", border: "1px solid var(--border)", borderLeft: `4px solid ${rising ? "var(--chart-danger)" : declining ? "var(--status-success)" : "var(--chart-secondary)"}`, borderRadius: "var(--radius)", background: "var(--card)" }}>
        <span style={{ color: "var(--muted-foreground)", fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.06em" }}>{syndrome.short}</span><h3 style={{ margin: "0.2rem 0", fontSize: "0.87rem" }}>{syndrome.label}</h3><strong style={{ display: "block", fontSize: "1.35rem", fontVariantNumeric: "tabular-nums" }}>{count}</strong><span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", marginTop: "0.3rem", color: rising ? "var(--status-danger)" : "var(--muted-foreground)", fontSize: "0.7rem", fontWeight: 700 }}><Icon aria-hidden="true" size={14} />{rising && <AlertTriangle aria-hidden="true" size={13} />}{label}</span>
      </article>;
    })}
  </div></section>;
}
