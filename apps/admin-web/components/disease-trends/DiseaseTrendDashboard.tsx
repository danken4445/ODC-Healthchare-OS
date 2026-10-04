"use client";

import { AlertCircle, Download, RefreshCw, ShieldCheck } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { useDiseaseSurveillance } from "../../hooks/use-disease-surveillance";
import { Button } from "../ui/button";
import { DemographicDistributionChart } from "./DemographicDistributionChart";
import { DohPidsrExportModal } from "./DohPidsrExportModal";
import { EpidemicCurveChart } from "./EpidemicCurveChart";
import { MorbidityRankingChart } from "./MorbidityRankingChart";
import { PrivacyChoroplethMap } from "./PrivacyChoroplethMap";
import { SyndromicSurveillancePanel } from "./SyndromicSurveillancePanel";

class DashboardErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } { return { failed: true }; }
  componentDidCatch(_error: Error, _info: ErrorInfo) { /* Do not log clinical analytics client-side. */ }
  render() {
    if (this.state.failed) return <section className="data-error" role="alert"><strong>Surveillance dashboard could not be rendered.</strong><p>Retry to reload the privacy-safe aggregate view.</p><Button variant="outline" onClick={() => this.setState({ failed: false })}><RefreshCw aria-hidden="true" size={16} />Retry dashboard</Button></section>;
    return this.props.children;
  }
}

function DashboardSkeleton() {
  return <div className="route-skeleton" aria-busy="true" aria-label="Loading surveillance dashboard"><div className="route-skeleton__header" /><div className="route-skeleton__grid"><div className="route-skeleton__card" /><div className="route-skeleton__card" /><div className="route-skeleton__card" /></div><div className="route-skeleton__grid"><div className="route-skeleton__card" /><div className="route-skeleton__card" /><div className="route-skeleton__card" /></div></div>;
}

export function DiseaseTrendDashboard() {
  const surveillance = useDiseaseSurveillance();
  const years = Array.from({ length: 4 }, (_, index) => new Date().getFullYear() - index);
  const weeks = Array.from({ length: 53 }, (_, index) => index + 1);
  const printReport = () => window.print();
  return <DashboardErrorBoundary><main aria-labelledby="disease-trends-title">
    <nav aria-label="Breadcrumb" style={{ marginBottom: "0.75rem", color: "var(--muted-foreground)", fontSize: "0.76rem" }}>Analytics &amp; governance <span aria-hidden="true">/</span> Disease trends</nav>
    <header className="page-header"><div><p className="page-eyebrow">Privacy-safe surveillance</p><h1 id="disease-trends-title">Disease trend analytics</h1><p className="page-description">Aggregated clinical surveillance for operational awareness. This dashboard does not contain patient-level records.</p></div><div className="page-actions"><Button variant="outline" onClick={printReport} disabled={surveillance.loading || Boolean(surveillance.error)} aria-label="Export the currently displayed aggregate surveillance report as PDF"><Download aria-hidden="true" size={16} />Export PDF</Button><DohPidsrExportModal epiYear={surveillance.epiYear} epiWeek={surveillance.epiWeek} /></div></header>
    <section className="panel-section" aria-label="Epidemiological period filters" style={{ marginTop: 0, display: "flex", flexWrap: "wrap", alignItems: "end", gap: "0.75rem" }}>
      <div><label htmlFor="surveillance-year" style={labelStyle}>Epidemiological year</label><select id="surveillance-year" className="ui-input" value={surveillance.epiYear} onChange={(event) => surveillance.setPeriod(Number(event.target.value), surveillance.epiWeek)} style={{ width: "10rem" }}>{years.map((year) => <option key={year} value={year}>{year}</option>)}</select></div>
      <div><label htmlFor="surveillance-week" style={labelStyle}>Epidemiological week</label><select id="surveillance-week" className="ui-input" value={surveillance.epiWeek} onChange={(event) => surveillance.setPeriod(surveillance.epiYear, Number(event.target.value))} style={{ width: "10rem" }}>{weeks.map((week) => <option key={week} value={week}>Week {week}</option>)}</select></div>
      {surveillance.activeDisease ? <p style={{ margin: "0 0 0.45rem", color: "var(--muted-foreground)", fontSize: "0.76rem" }}>Detail condition: <strong style={{ color: "var(--foreground)" }}>{surveillance.activeDisease.diseaseName}</strong></p> : null}
    </section>
    <aside role="note" aria-label="Privacy notice" style={{ display: "flex", gap: "0.65rem", margin: "1rem 0", padding: "0.75rem 0.9rem", color: "var(--notice-foreground)", background: "var(--status-info-bg)", border: "1px solid var(--status-info-border)", borderRadius: "var(--radius)", fontSize: "0.78rem" }}><ShieldCheck aria-hidden="true" size={18} style={{ flex: "0 0 auto" }} /><span><strong>Privacy protection:</strong> this view uses pre-aggregated, tenant-scoped data only. Cells under five cases are suppressed and shown as <strong>&lt;5</strong>; no patient identifiers are requested or displayed.</span></aside>
    {surveillance.loading ? <DashboardSkeleton /> : surveillance.error ? <section className="data-error" role="alert"><AlertCircle aria-hidden="true" size={18} /><div><strong>Surveillance analytics could not be loaded.</strong><p>{surveillance.error}</p><Button variant="outline" onClick={surveillance.retry}><RefreshCw aria-hidden="true" size={16} />Retry</Button></div></section> : surveillance.empty ? <><section className="panel-section" aria-live="polite"><h2>No reportable trends for this period</h2><p className="page-description">No aggregate morbidity rollups are available for the selected epidemiological period. Suppressed cohorts remain protected and are not represented as zero.</p></section>{process.env.NODE_ENV === "development" ? <PrivacyChoroplethMap epiYear={surveillance.epiYear} epiWeek={surveillance.epiWeek} icd10Code={surveillance.activeDiseaseCode} diseaseName={surveillance.activeDisease?.diseaseName ?? null} /> : null}</> : <div style={{ display: "grid", gap: "1rem" }}>
      <SyndromicSurveillancePanel trends={surveillance.data.morbidity} />
      <div className="chart-grid"><MorbidityRankingChart trends={surveillance.data.morbidity} selectedCode={surveillance.activeDiseaseCode} onSelect={surveillance.setActiveDiseaseCode} /><EpidemicCurveChart diseaseName={surveillance.activeDisease?.diseaseName ?? null} points={surveillance.data.epidemicCurve} /></div>
      <DemographicDistributionChart diseaseName={surveillance.activeDisease?.diseaseName ?? null} cells={surveillance.data.demographics} />
      <PrivacyChoroplethMap epiYear={surveillance.epiYear} epiWeek={surveillance.epiWeek} icd10Code={surveillance.activeDiseaseCode} diseaseName={surveillance.activeDisease?.diseaseName ?? null} />
    </div>}
  </main></DashboardErrorBoundary>;
}

const labelStyle = { display: "block", marginBottom: "0.3rem", color: "var(--muted-foreground)", fontSize: "0.7rem", fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase" } as const;
