"use client";

import { AlertCircle, MapPinned, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getBarangayChoroplethData } from "@odyssey/supabase-client";
import type { BarangayChoroplethData, SpatialChoroplethFeature } from "@odyssey/types";
import { useAdminData } from "../admin-data-context";
import { Button } from "../ui/button";

const MAX_ZOOM = 13;
const MIN_ZOOM = 10;
const EMPTY: BarangayChoroplethData = { type: "FeatureCollection", features: [] };
const SENSITIVE = /\b(?:hiv|aids|mental|psychiatr|substance|drug use|reproductive|pregnan|abortion|sti|sexually transmitted)\b/i;

function colorFor(feature: SpatialChoroplethFeature): string {
  if (feature.properties.isSuppressed) return "url(#suppressed-hatch)";
  const rate = feature.properties.incidenceRatePer10000 ?? 0;
  return rate > 15 ? "var(--status-danger, #b42318)" : rate >= 5 ? "var(--status-warning, #b54708)" : "var(--status-success, #067647)";
}

function flattenPairs(value: unknown, pairs: Array<[number, number]> = []): Array<[number, number]> {
  if (!Array.isArray(value)) return pairs;
  if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") pairs.push([value[0], value[1]]);
  else value.forEach((child) => flattenPairs(child, pairs));
  return pairs;
}

function pathFor(feature: SpatialChoroplethFeature, bounds: { minX: number; maxX: number; minY: number; maxY: number }): string {
  const scaleX = 700 / Math.max(bounds.maxX - bounds.minX, 0.00001);
  const scaleY = 420 / Math.max(bounds.maxY - bounds.minY, 0.00001);
  const rings = feature.geometry.type === "Polygon" ? feature.geometry.coordinates : feature.geometry.coordinates.flat(1);
  return (rings as unknown[]).map((ring) => {
    const points = flattenPairs(ring);
    return points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${(x - bounds.minX) * scaleX + 20} ${440 - (y - bounds.minY) * scaleY}`).join(" ") + " Z";
  }).join(" ");
}

function featureLabel(feature: SpatialChoroplethFeature): string {
  const place = [feature.properties.barangay, feature.properties.municipality].filter(Boolean).join(", ") || "Barangay";
  if (feature.properties.isSuppressed) return `${place}: < 5 cases, suppressed for privacy`;
  return `${place}: ${feature.properties.incidenceRatePer10000?.toFixed(1) ?? "No denominator"} cases per 10,000`;
}

export function PrivacyChoroplethMap({ epiYear, epiWeek, icd10Code, diseaseName }: { epiYear: number; epiWeek: number; icd10Code: string | null; diseaseName: string | null }) {
  const { client, organization } = useAdminData();
  const [data, setData] = useState<BarangayChoroplethData>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SpatialChoroplethFeature | null>(null);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [zoomWarning, setZoomWarning] = useState(false);
  const disabled = !icd10Code || SENSITIVE.test(`${icd10Code} ${diseaseName ?? ""}`);

  useEffect(() => {
    let active = true;
    setSelected(null);
    setZoom(MIN_ZOOM);
    setZoomWarning(false);
    if (disabled || !organization || !icd10Code) { setData(EMPTY); setError(null); return () => { active = false; }; }
    void getBarangayChoroplethData(client, { organizationId: organization.id, icd10Code, epiYear, epiWeek })
      .then((next) => { if (active) { setData(next); setError(null); } })
      .catch(() => { if (active) { setData(EMPTY); setError("Barangay boundaries could not be loaded from the privacy-safe aggregate service."); } });
    return () => { active = false; };
  }, [client, disabled, epiWeek, epiYear, icd10Code, organization]);

  const bounds = useMemo(() => {
    const pairs = data.features.flatMap((feature) => flattenPairs(feature.geometry.coordinates));
    return { minX: Math.min(...pairs.map(([x]) => x), 0), maxX: Math.max(...pairs.map(([x]) => x), 1), minY: Math.min(...pairs.map(([, y]) => y), 0), maxY: Math.max(...pairs.map(([, y]) => y), 1) };
  }, [data]);
  const requestZoom = (next: number) => {
    if (next > MAX_ZOOM) { setZoom(MAX_ZOOM); setZoomWarning(true); return; }
    setZoom(Math.max(MIN_ZOOM, next));
    setZoomWarning(false);
  };

  return <section className="panel-section" aria-labelledby="choropleth-title">
    <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "start", flexWrap: "wrap" }}>
      <div><p className="page-eyebrow">Spatial surveillance</p><h2 id="choropleth-title" style={{ margin: 0 }}>Barangay attack rate map</h2><p className="page-description">Official barangay boundaries only. Rates are per 10,000 residents; patient home coordinates are never requested.</p></div>
      <div aria-label="Map zoom controls" style={{ display: "flex", gap: "0.5rem" }}><Button variant="outline" aria-label="Zoom out" onClick={() => requestZoom(zoom - 1)} disabled={disabled || zoom <= MIN_ZOOM}><ZoomOut aria-hidden="true" size={16} /></Button><Button variant="outline" aria-label="Zoom in" onClick={() => requestZoom(zoom + 1)} disabled={disabled}><ZoomIn aria-hidden="true" size={16} /></Button></div>
    </div>
    {disabled ? <div role="alert" style={noticeStyle}><AlertCircle aria-hidden="true" size={18} /><span>Spatial display is unavailable for sensitive health categories.</span></div> : null}
    {zoomWarning ? <div role="alert" style={noticeStyle}><AlertCircle aria-hidden="true" size={18} /><span>Privacy zoom limit reached. Street-level inspection is not available.</span></div> : null}
    {error ? <p role="alert" className="page-description">{error}</p> : null}
    {!disabled && !error ? <div style={{ overflow: "hidden", border: "1px solid var(--border)", borderRadius: "var(--radius)", marginTop: "0.8rem", background: "var(--surface-muted)" }}>
      <svg viewBox="0 0 740 460" role="img" aria-label={`Barangay attack-rate choropleth for ${diseaseName ?? "the selected disease"}`} style={{ display: "block", width: "100%", minHeight: "17rem" }}>
        <defs><pattern id="suppressed-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#94a3b8" /><line x1="0" y1="0" x2="0" y2="8" stroke="#475569" strokeWidth="3" /></pattern></defs>
        <g transform={`translate(370 230) scale(${1 + (zoom - MIN_ZOOM) * 0.08}) translate(-370 -230)`}>{data.features.map((feature, index) => <path key={`${feature.properties.barangay ?? "barangay"}-${index}`} d={pathFor(feature, bounds)} fill={colorFor(feature)} stroke="var(--surface)" strokeWidth="1" tabIndex={0} role="button" aria-label={featureLabel(feature)} onClick={() => setSelected(feature)} onFocus={() => setSelected(feature)} />)}</g>
      </svg>
      <div aria-live="polite" style={{ minHeight: "2.5rem", padding: "0.65rem 0.8rem", fontSize: "0.82rem", borderTop: "1px solid var(--border)" }}>{selected ? featureLabel(selected) : "Select a barangay boundary to inspect its privacy-safe rate."}</div>
    </div> : null}
    <div aria-label="Map legend" style={{ display: "flex", flexWrap: "wrap", gap: "0.8rem", marginTop: "0.8rem", fontSize: "0.78rem" }}>
      <span><i aria-hidden="true" style={{ ...swatchStyle, background: "var(--status-success, #067647)" }} />Normal: below 5.0</span><span><i aria-hidden="true" style={{ ...swatchStyle, background: "var(--status-warning, #b54708)" }} />Alert: 5.0–15.0</span><span><i aria-hidden="true" style={{ ...swatchStyle, background: "var(--status-danger, #b42318)" }} />Epidemic: above 15.0</span><span><i aria-hidden="true" style={{ ...swatchStyle, background: "repeating-linear-gradient(45deg, #475569 0 3px, #94a3b8 3px 6px)" }} />Hatched: &lt;5 cases (suppressed)</span>
    </div>
    <p style={{ display: "flex", alignItems: "center", gap: "0.4rem", margin: "0.75rem 0 0", color: "var(--muted-foreground)", fontSize: "0.75rem" }}><MapPinned aria-hidden="true" size={14} />Maximum map zoom: {MAX_ZOOM}. Labels and hatch patterns provide a non-color cue.</p>
  </section>;
}

const noticeStyle = { display: "flex", alignItems: "center", gap: "0.55rem", marginTop: "0.75rem", padding: "0.7rem", borderRadius: "var(--radius)", background: "var(--status-warning-bg)", color: "var(--notice-foreground)", fontSize: "0.8rem" } as const;
const swatchStyle = { display: "inline-block", width: "1rem", height: "1rem", marginRight: "0.35rem", verticalAlign: "middle", border: "1px solid var(--border)" } as const;
