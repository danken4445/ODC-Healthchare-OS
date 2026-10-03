"use client";

import type { AgeBracket, DemographicBreakdownCell } from "@odyssey/types";
import type { CSSProperties } from "react";

const cohorts: ReadonlyArray<{ key: AgeBracket; label: string }> = [
  { key: "infant_under_1", label: "<1" }, { key: "child_1_to_4", label: "1–4" },
  { key: "school_5_to_14", label: "5–14" }, { key: "reproductive_15_to_49", label: "15–49" },
  { key: "middle_50_to_64", label: "50–64" }, { key: "senior_65_plus", label: "65+" },
];
const genders = ["male", "female", "other", "unknown"] as const;
const genderLabel = { female: "Female", male: "Male", other: "Other", unknown: "Not recorded" } as const;
const genderStyle = { female: { color: "#2563eb", pattern: "solid" }, male: { color: "#c2410c", pattern: "dots" }, other: { color: "#6d28d9", pattern: "stripe" }, unknown: { color: "#475569", pattern: "cross" } } as const;

export function DemographicDistributionChart({ cells, diseaseName }: { cells: readonly DemographicBreakdownCell[]; diseaseName: string | null }) {
  const byKey = new Map(cells.map((cell) => [`${cell.ageBracket}:${cell.gender}`, cell]));
  const max = Math.max(...cells.map((cell) => cell.isSuppressed ? 0 : cell.caseCount ?? 0), 1);
  return <section className="chart-panel" aria-labelledby="demographic-distribution-title">
    <div className="panel-heading"><div><h2 id="demographic-distribution-title">Demographic distribution</h2><p>{diseaseName ? `${diseaseName} by DOH age bracket and gender.` : "Choose a condition to view privacy-safe demographic aggregates."}</p></div><span className="chart-unit">Aggregated only</span></div>
    <div style={{ overflowX: "auto" }}><table style={{ width: "100%", minWidth: "560px", borderCollapse: "collapse" }}>
      <caption className="sr-only">Demographic distribution by age bracket and gender. Suppressed counts are displayed as less than five.</caption>
      <thead><tr><th scope="col" style={headerStyle}>Age</th>{genders.map((gender) => <th key={gender} scope="col" style={headerStyle}><span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}><span aria-hidden="true" style={{ width: "0.65rem", height: "0.65rem", display: "inline-block", background: genderStyle[gender].color, border: "1px solid currentColor", borderRadius: gender === "female" ? "50%" : "1px" }} />{genderLabel[gender]}</span></th>)}</tr></thead>
      <tbody>{cohorts.map(({ key, label }) => <tr key={key}><th scope="row" style={cellLabelStyle}>{label}</th>{genders.map((gender) => {
        const cell = byKey.get(`${key}:${gender}`);
        const suppressed = cell?.isSuppressed ?? false;
        const value = cell?.caseCount ?? 0;
        return <td key={gender} style={{ ...cellStyle, backgroundImage: suppressed ? "repeating-linear-gradient(135deg, transparent 0 4px, rgba(71,85,105,.22) 4px 6px)" : "none" }} aria-label={`${label}, ${genderLabel[gender]}: ${suppressed ? "suppressed, less than five" : value}`}>
          {suppressed ? <span style={{ fontWeight: 800 }}>&lt;5</span> : <span style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontVariantNumeric: "tabular-nums" }}><span aria-hidden="true" style={{ width: `${Math.max(5, (value / max) * 100)}%`, maxWidth: "4rem", height: "0.42rem", background: genderStyle[gender].color, backgroundImage: genderStyle[gender].pattern === "dots" ? "radial-gradient(rgba(255,255,255,.65) 1px, transparent 1px)" : genderStyle[gender].pattern === "stripe" ? "repeating-linear-gradient(135deg, transparent 0 3px, rgba(255,255,255,.6) 3px 5px)" : "none", backgroundSize: "5px 5px", borderRadius: "999px" }} />{value}</span>}
        </td>;
      })}</tr>)}</tbody>
    </table></div>
    <p style={{ margin: "0.75rem 0 0", color: "var(--muted-foreground)", fontSize: "0.72rem" }}><span aria-hidden="true" style={{ display: "inline-block", width: "0.8rem", height: "0.8rem", marginRight: "0.35rem", verticalAlign: "-0.12rem", backgroundImage: "repeating-linear-gradient(135deg, transparent 0 3px, rgba(71,85,105,.55) 3px 5px)", border: "1px solid var(--border-strong)" }} />Hatched cells are suppressed for privacy and always mean fewer than five cases.</p>
  </section>;
}

const headerStyle: CSSProperties = { padding: "0.55rem", color: "var(--table-heading)", background: "var(--surface-subtle)", borderBottom: "1px solid var(--border)", fontSize: "0.68rem", letterSpacing: "0.04em", textAlign: "left", textTransform: "uppercase" };
const cellLabelStyle: CSSProperties = { padding: "0.6rem 0.55rem", borderBottom: "1px solid var(--border)", fontSize: "0.76rem", fontWeight: 700 };
const cellStyle: CSSProperties = { padding: "0.6rem 0.55rem", borderBottom: "1px solid var(--border)", fontSize: "0.74rem" };
