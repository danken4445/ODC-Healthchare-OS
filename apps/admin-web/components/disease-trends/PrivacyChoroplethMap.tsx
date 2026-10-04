"use client";

import { AlertCircle, FlaskConical, MapPinned, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getBarangayChoroplethData } from "@odyssey/supabase-client";
import type { BarangayChoroplethData, SpatialChoroplethFeature } from "@odyssey/types";
import { useAdminData } from "../admin-data-context";
import { Button } from "../ui/button";

const MAX_ZOOM = 13;
const MIN_ZOOM = 10;
const EMPTY: BarangayChoroplethData = { type: "FeatureCollection", features: [] };
const SENSITIVE = /\b(?:hiv|aids|mental|psychiatr|substance|drug use|reproductive|pregnan|abortion|sti|sexually transmitted)\b/i;
const IS_DEVELOPMENT = process.env.NODE_ENV === "development";

type RegionalBoundary = {
  geometry: SpatialChoroplethFeature["geometry"];
  properties?: Record<string, unknown>;
};

type RegionalBoundaryCollection = { features: RegionalBoundary[] };
type DrillLevel = "region" | "province" | "municipality";
type DrillFeature = SpatialChoroplethFeature & { drill: { level: DrillLevel; psgc: number; name: string } };

function isDrillFeature(feature: SpatialChoroplethFeature | DrillFeature): feature is DrillFeature {
  return "drill" in feature;
}

const REGIONAL_RATES = [2.2, 6.8, 16.4, 9.1, 4.9, 10.6, 18.1, 3.7, 7.2, 12.4, 13.8, 22.6, 2.8, 5.4, 8.7, 11.3, 4.1, 17.2] as const;

function boundaryName(properties: Record<string, unknown> | undefined, level: DrillLevel): string {
  const key = level === "region" ? "adm1_en" : level === "province" ? "adm2_en" : "adm3_en";
  return typeof properties?.[key] === "string" ? properties[key] as string : "Philippines area";
}

function boundaryPsgc(properties: Record<string, unknown> | undefined, level: DrillLevel): number | null {
  const key = level === "region" ? "adm1_psgc" : level === "province" ? "adm2_psgc" : "adm3_psgc";
  return typeof properties?.[key] === "number" ? properties[key] as number : null;
}

/**
 * Development-only aggregate fixture based on the reference repo's real
 * PSGC-aligned national boundaries. The rates are synthetic and never leave
 * the browser or enter the surveillance service.
 */
function toDrillFeatures(collection: RegionalBoundaryCollection, level: DrillLevel, rateOffset = 0): DrillFeature[] {
  return collection.features.flatMap((feature, index): DrillFeature[] => {
      const psgc = boundaryPsgc(feature.properties, level);
      if (psgc === null) return [];
      const rate = REGIONAL_RATES[(index + rateOffset) % REGIONAL_RATES.length] ?? 0;
      const isSuppressed = index === 3 || index === 16;
      return [{
        type: "Feature",
        geometry: feature.geometry,
        properties: {
          municipality: boundaryName(feature.properties, level),
          barangay: null,
          caseCount: isSuppressed ? null : Math.round(rate * 1.8),
          incidenceRatePer10000: isSuppressed ? null : rate,
          isSuppressed,
        },
        drill: { level, psgc, name: boundaryName(feature.properties, level) },
      }];
    });
}

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

function collectRings(value: unknown, rings: Array<Array<[number, number]>> = []): Array<Array<[number, number]>> {
  if (!Array.isArray(value)) return rings;
  const isRing = value.length > 2 && value.every((point) => Array.isArray(point) && typeof point[0] === "number" && typeof point[1] === "number");
  if (isRing) rings.push(value as Array<[number, number]>);
  else value.forEach((child) => collectRings(child, rings));
  return rings;
}

function pathFor(feature: SpatialChoroplethFeature, bounds: { minX: number; maxX: number; minY: number; maxY: number }): string {
  const scale = Math.min(700 / Math.max(bounds.maxX - bounds.minX, 0.00001), 420 / Math.max(bounds.maxY - bounds.minY, 0.00001));
  const offsetX = (740 - (bounds.maxX - bounds.minX) * scale) / 2;
  const offsetY = (460 - (bounds.maxY - bounds.minY) * scale) / 2;
  return collectRings(feature.geometry.coordinates).map((points) => {
    return points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${(x - bounds.minX) * scale + offsetX} ${460 - ((y - bounds.minY) * scale + offsetY)}`).join(" ") + " Z";
  }).join(" ");
}

function drillLevelLabel(level: DrillLevel): string {
  return level === "region" ? "Regions" : level === "province" ? "Provinces / Districts" : "Cities / Municipalities";
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
  const [showMockData, setShowMockData] = useState(IS_DEVELOPMENT);
  const [regionalPreview, setRegionalPreview] = useState<DrillFeature[]>([]);
  const [drillFeatures, setDrillFeatures] = useState<DrillFeature[]>([]);
  const [drillHistory, setDrillHistory] = useState<Array<{ level: DrillLevel; name: string; features: DrillFeature[] }>>([]);
  const [drillLevel, setDrillLevel] = useState<DrillLevel>("region");
  const [drillName, setDrillName] = useState("Philippines");
  const [drillLoading, setDrillLoading] = useState(false);
  const isSensitive = SENSITIVE.test(`${icd10Code ?? ""} ${diseaseName ?? ""}`);
  const disabled = isSensitive || (!icd10Code && !IS_DEVELOPMENT);
  const isMockPreview = IS_DEVELOPMENT && showMockData;
  const mapData = isMockPreview ? (drillFeatures.length ? drillFeatures : regionalPreview) : data.features;
  const displayError = isMockPreview ? null : error;
  const diseaseLabel = diseaseName ?? icd10Code ?? "Selected disease";

  useEffect(() => {
    if (!IS_DEVELOPMENT) return;
    let active = true;
    void fetch("/maps/philippines-regions.json")
      .then((response) => { if (!response.ok) throw new Error("Regional boundary asset unavailable"); return response.json() as Promise<RegionalBoundaryCollection>; })
      .then((collection) => { if (active) { const features = toDrillFeatures(collection, "region"); setRegionalPreview(features); setDrillFeatures(features); } })
      .catch(() => { if (active) { setRegionalPreview([]); setDrillFeatures([]); } });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setSelected(null);
    setZoom(MIN_ZOOM);
    setZoomWarning(false);
    setDrillFeatures([]);
    setDrillHistory([]);
    setDrillLevel("region");
    setDrillName("Philippines");
    if (disabled || !organization || !icd10Code) { setData(EMPTY); setError(null); return () => { active = false; }; }
    void getBarangayChoroplethData(client, { organizationId: organization.id, icd10Code, epiYear, epiWeek })
      .then((next) => { if (active) { setData(next); setError(null); } })
      .catch(() => { if (active) { setData(EMPTY); setError("Barangay boundaries could not be loaded from the privacy-safe aggregate service."); } });
    return () => { active = false; };
  }, [client, disabled, epiWeek, epiYear, icd10Code, organization]);

  const bounds = useMemo(() => {
    const pairs = mapData.flatMap((feature) => flattenPairs(feature.geometry.coordinates));
    if (!pairs.length) return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
    return { minX: Math.min(...pairs.map(([x]) => x)), maxX: Math.max(...pairs.map(([x]) => x)), minY: Math.min(...pairs.map(([, y]) => y)), maxY: Math.max(...pairs.map(([, y]) => y)) };
  }, [mapData]);
  const drillInto = async (feature: DrillFeature) => {
    setSelected(feature);
    if (!isMockPreview || feature.drill.level === "municipality") return;
    const nextLevel: DrillLevel = feature.drill.level === "region" ? "province" : "municipality";
    const fileName = feature.drill.level === "region"
      ? `provdists-region-${feature.drill.psgc}.0.001.json`
      : `municities-provdist-${feature.drill.psgc}.0.001.json`;
    setDrillLoading(true);
    try {
      const response = await fetch(`/maps/philippines/lowres/${fileName}`);
      if (!response.ok) throw new Error("Boundary level unavailable");
      const collection = await response.json() as RegionalBoundaryCollection;
      const nextFeatures = toDrillFeatures(collection, nextLevel, drillHistory.length * 3);
      setDrillHistory((current) => [...current, { level: drillLevel, name: drillName, features: mapData as DrillFeature[] }]);
      setDrillFeatures(nextFeatures);
      setDrillLevel(nextLevel);
      setDrillName(feature.drill.name);
      setSelected(null);
      setZoom(MIN_ZOOM);
    } catch {
      setError(`The ${nextLevel} boundaries for ${feature.drill.name} could not be loaded.`);
    } finally {
      setDrillLoading(false);
    }
  };
  const drillBack = () => {
    const previous = drillHistory.at(-1);
    if (!previous) return;
    setDrillFeatures(previous.features);
    setDrillLevel(previous.level);
    setDrillName(previous.name);
    setDrillHistory((current) => current.slice(0, -1));
    setSelected(null);
    setError(null);
    setZoom(MIN_ZOOM);
  };
  const requestZoom = (next: number) => {
    if (next > MAX_ZOOM) { setZoom(MAX_ZOOM); setZoomWarning(true); return; }
    setZoom(Math.max(MIN_ZOOM, next));
    setZoomWarning(false);
  };

  return <section className="panel-section" aria-labelledby="choropleth-title">
    <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "start", flexWrap: "wrap" }}>
      <div><p className="page-eyebrow">Spatial surveillance</p><h2 id="choropleth-title" style={{ margin: 0 }}>{isMockPreview ? `${drillName} · ${drillLevelLabel(drillLevel)}` : "Barangay attack rate map"}</h2><p className="page-description">{isMockPreview ? "Official Philippine boundaries with synthetic rates for visual QA only; these values are not surveillance data." : "Official barangay boundaries only. Rates are per 10,000 residents; patient home coordinates are never requested."}</p><p style={diseaseStyle}>Currently showing: <strong>{diseaseLabel}</strong>{icd10Code ? ` (${icd10Code})` : ""}</p></div>
      <div aria-label="Map controls" style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {IS_DEVELOPMENT ? <Button variant="outline" aria-pressed={showMockData} onClick={() => { setShowMockData((current) => !current); setDrillFeatures(regionalPreview); setDrillHistory([]); setDrillLevel("region"); setDrillName("Philippines"); setSelected(null); }} disabled={disabled}><FlaskConical aria-hidden="true" size={16} />{showMockData ? "Use live data" : "Preview Philippines map"}</Button> : null}
        {isMockPreview && drillHistory.length ? <Button variant="outline" onClick={drillBack} disabled={drillLoading}>← Back</Button> : null}
        <Button variant="outline" aria-label="Reset map zoom" onClick={() => requestZoom(MIN_ZOOM)} disabled={disabled || zoom <= MIN_ZOOM}><RotateCcw aria-hidden="true" size={16} /></Button><Button variant="outline" aria-label="Zoom out" onClick={() => requestZoom(zoom - 1)} disabled={disabled || zoom <= MIN_ZOOM}><ZoomOut aria-hidden="true" size={16} /></Button><Button variant="outline" aria-label="Zoom in" onClick={() => requestZoom(zoom + 1)} disabled={disabled}><ZoomIn aria-hidden="true" size={16} /></Button>
      </div>
    </div>
    {disabled ? <div role="alert" style={noticeStyle}><AlertCircle aria-hidden="true" size={18} /><span>Spatial display is unavailable for sensitive health categories.</span></div> : null}
    {zoomWarning ? <div role="alert" style={noticeStyle}><AlertCircle aria-hidden="true" size={18} /><span>Privacy zoom limit reached. Street-level inspection is not available.</span></div> : null}
    {isMockPreview ? <div role="status" style={noticeStyle}><FlaskConical aria-hidden="true" size={18} /><span>{drillLoading ? "Loading the next geographic level…" : `Development preview: PSGC-aligned ${drillLevelLabel(drillLevel).toLowerCase()} boundaries with synthetic aggregate rates. Click a ${drillLevel === "region" ? "region" : drillLevel === "province" ? "province" : "municipality"} to drill down.`}</span></div> : null}
    {displayError ? <p role="alert" className="page-description">{displayError}</p> : null}
    {!disabled && !displayError ? <div style={{ overflow: "hidden", border: "1px solid var(--border)", borderRadius: "var(--radius)", marginTop: "0.8rem", background: "var(--surface-muted)" }}>
      <svg viewBox="0 0 740 460" preserveAspectRatio="xMidYMid meet" role="img" aria-label={`${isMockPreview ? "Synthetic development preview" : "Barangay attack-rate choropleth"} for ${diseaseLabel}`} style={{ display: "block", width: "100%", height: "clamp(22rem, 55vw, 34rem)" }}>
        <defs><pattern id="suppressed-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#94a3b8" /><line x1="0" y1="0" x2="0" y2="8" stroke="#475569" strokeWidth="3" /></pattern></defs>
        <g transform={`translate(370 230) scale(${1 + (zoom - MIN_ZOOM) * 0.08}) translate(-370 -230)`}>{mapData.map((feature, index) => { const drillable = isDrillFeature(feature); return <path key={`${feature.properties.barangay ?? feature.properties.municipality ?? "area"}-${index}`} d={pathFor(feature, bounds)} fill={colorFor(feature)} stroke={selected === feature ? "var(--foreground, #102a43)" : "var(--surface)"} strokeWidth={selected === feature ? 2.5 : 1} tabIndex={0} role="button" aria-label={`${featureLabel(feature)}${drillable && feature.drill.level !== "municipality" ? ". Activate to drill down." : ""}`} style={{ cursor: "pointer", outline: "none" }} onClick={() => drillable ? void drillInto(feature) : setSelected(feature)} onMouseEnter={() => setSelected(feature)} onFocus={() => setSelected(feature)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); if (drillable) void drillInto(feature); else setSelected(feature); } }} />; })}</g>
      </svg>
      <div aria-live="polite" style={{ minHeight: "2.5rem", padding: "0.65rem 0.8rem", fontSize: "0.82rem", borderTop: "1px solid var(--border)" }}>{selected ? featureLabel(selected) : `Select a ${isMockPreview ? drillLevel === "region" ? "region" : drillLevel === "province" ? "province" : "municipality" : "barangay boundary"} to inspect its privacy-safe rate.`}</div>
    </div> : null}
    <div aria-label="Map legend" style={{ display: "flex", flexWrap: "wrap", gap: "0.8rem", marginTop: "0.8rem", fontSize: "0.78rem" }}>
      <span><i aria-hidden="true" style={{ ...swatchStyle, background: "var(--status-success, #067647)" }} />Normal: below 5.0</span><span><i aria-hidden="true" style={{ ...swatchStyle, background: "var(--status-warning, #b54708)" }} />Alert: 5.0–15.0</span><span><i aria-hidden="true" style={{ ...swatchStyle, background: "var(--status-danger, #b42318)" }} />Epidemic: above 15.0</span><span><i aria-hidden="true" style={{ ...swatchStyle, background: "repeating-linear-gradient(45deg, #475569 0 3px, #94a3b8 3px 6px)" }} />Hatched: &lt;5 cases (suppressed)</span>
    </div>
    <p style={{ display: "flex", alignItems: "center", gap: "0.4rem", margin: "0.75rem 0 0", color: "var(--muted-foreground)", fontSize: "0.75rem" }}><MapPinned aria-hidden="true" size={14} />Maximum map zoom: {MAX_ZOOM}. Labels and hatch patterns provide a non-color cue.</p>
  </section>;
}

const noticeStyle = { display: "flex", alignItems: "center", gap: "0.55rem", marginTop: "0.75rem", padding: "0.7rem", borderRadius: "var(--radius)", background: "var(--status-warning-bg)", color: "var(--notice-foreground)", fontSize: "0.8rem" } as const;
const diseaseStyle = { margin: "0.45rem 0 0", color: "var(--foreground)", fontSize: "0.86rem" } as const;
const swatchStyle = { display: "inline-block", width: "1rem", height: "1rem", marginRight: "0.35rem", verticalAlign: "middle", border: "1px solid var(--border)" } as const;
