import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AgeBracket,
  BarangayChoroplethData,
  Database,
  DemographicBreakdownCell,
  DiseaseCategory,
  EpidemicCurvePoint,
  MorbidityTrend,
  SpatialChoroplethFeature,
} from "@odyssey/types";
import { detectSensitiveCategory } from "./pmr-builder";

type Client = SupabaseClient<Database>;
type SafeRollupRow = {
  organization_id: string;
  epi_year: number;
  epi_week: number;
  icd10_code: string;
  disease_name: string;
  doh_category: DiseaseCategory;
  age_bracket: AgeBracket;
  gender: "male" | "female" | "other" | "unknown";
  case_count: number | null;
  is_suppressed: boolean;
};

type ChoroplethRpcRow = {
  geometry: unknown;
  barangay_name: string | null;
  municipality_name: string | null;
  case_count: number | null;
  rate_per_10k: number | null;
  is_suppressed: boolean;
};

export class SurveillanceError extends Error {
  readonly code: string = "SURVEILLANCE_ERROR";
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.cause = cause;
    this.name = "SurveillanceError";
  }
}

export class PrivacyRejectionError extends SurveillanceError {
  readonly code = "PRIVACY_REJECTED" as const;
  readonly icd10Code: string;

  constructor(icd10Code: string) {
    super(`ICD-10 code ${icd10Code} is excluded from operational surveillance.`);
    this.icd10Code = icd10Code;
    this.name = "PrivacyRejectionError";
  }
}

export function assertNonSensitiveIcd10(code: string): void {
  if (detectSensitiveCategory(code)) throw new PrivacyRejectionError(code);
}

export interface SuppressionCell {
  readonly key: string;
  readonly caseCount: number | null;
  readonly isSuppressed: boolean;
}

/** Suppresses the smallest visible sibling when one cell is derivable by differencing. */
export function applyComplementarySuppression(
  cells: readonly SuppressionCell[],
  visibleTotal: number | null,
): SuppressionCell[] {
  if (visibleTotal === null || !cells.some((cell) => cell.isSuppressed)) return [...cells];
  const visible = cells.filter((cell) => !cell.isSuppressed && cell.caseCount !== null);
  if (visible.length < 2) return [...cells];
  const visibleSum = visible.reduce((sum, cell) => sum + (cell.caseCount ?? 0), 0);
  if (visibleSum <= visibleTotal) {
    const next = visible.reduce((smallest, cell) =>
      (smallest === null || (cell.caseCount ?? 0) < (smallest.caseCount ?? 0) ? cell : smallest), null as SuppressionCell | null);
    if (next) return cells.map((cell) => cell.key === next.key ? { ...cell, caseCount: null, isSuppressed: true } : cell);
  }
  return [...cells];
}

async function readSafeRollups(client: Client, filters: (query: SafeQuery) => SafeQuery): Promise<SafeRollupRow[]> {
  const query = filters(client
    .from("disease_surveillance_rollups_safe" as never)
    .select("organization_id, epi_year, epi_week, icd10_code, disease_name, doh_category, age_bracket, gender, case_count, is_suppressed") as unknown as SafeQuery);
  const result = await query;
  if (result.error) throw new SurveillanceError(result.error.message, result.error);
  return (result.data ?? []) as unknown as SafeRollupRow[];
}

type SafeQuery = {
  eq(column: string, value: string | number): SafeQuery;
  order(column: string, options?: { ascending?: boolean }): SafeQuery;
  limit(count: number): SafeQuery;
  then<TResult1 = { data: unknown; error: { message: string } | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2>;
};

const sumVisible = (rows: readonly SafeRollupRow[]): number => rows.reduce((sum, row) => sum + (row.is_suppressed || row.case_count === null ? 0 : row.case_count), 0);
const weekKey = (year: number, week: number): string => `${year}-${String(week).padStart(2, "0")}`;

export async function getMorbidityTrends(client: Client, options: { organizationId: string; epiYear: number; limit?: number }): Promise<MorbidityTrend[]> {
  const rows = await readSafeRollups(client, (query) => query.eq("organization_id", options.organizationId).eq("epi_year", options.epiYear));
  const byDisease = new Map<string, SafeRollupRow[]>();
  for (const row of rows) byDisease.set(row.icd10_code, [...(byDisease.get(row.icd10_code) ?? []), row]);
  const latestWeek = Math.max(...rows.map((row) => row.epi_week), 0);
  return [...byDisease.entries()].map(([icd10Code, diseaseRows]) => {
    const current = sumVisible(diseaseRows.filter((row) => row.epi_week === latestWeek));
    const previous = sumVisible(diseaseRows.filter((row) => row.epi_week === latestWeek - 1));
    const velocity = previous === 0 ? (current > 0 ? 1 : 0) : (current - previous) / previous;
    const trend: MorbidityTrend["trend"] = velocity > 0.05 ? "Rising" : velocity < -0.05 ? "Declining" : "Stable";
    return { icd10Code, diseaseName: diseaseRows[0]?.disease_name ?? "Unknown", caseCount: current, previousWeekCaseCount: previous, growthVelocity: velocity, trend };
  }).sort((a, b) => (b.caseCount ?? 0) - (a.caseCount ?? 0)).slice(0, options.limit ?? 10);
}

export async function getEpidemicCurve(client: Client, options: { organizationId: string; icd10Code: string; weeks?: number }): Promise<EpidemicCurvePoint[]> {
  assertNonSensitiveIcd10(options.icd10Code);
  const rows = await readSafeRollups(client, (query) => query.eq("organization_id", options.organizationId).eq("icd10_code", options.icd10Code).order("epi_year", { ascending: true }).order("epi_week", { ascending: true }));
  const grouped = new Map<string, { epiYear: number; epiWeek: number; caseCount: number | null }>();
  for (const row of rows) { const key = weekKey(row.epi_year, row.epi_week); const current = grouped.get(key); grouped.set(key, { epiYear: row.epi_year, epiWeek: row.epi_week, caseCount: current?.caseCount === null || row.case_count === null ? null : (current?.caseCount ?? 0) + row.case_count }); }
  const points = [...grouped.values()].slice(-(options.weeks ?? 12));
  const baseline = points.map((point) => point.caseCount).filter((count): count is number => count !== null);
  const mean = baseline.length ? baseline.reduce((sum, count) => sum + count, 0) / baseline.length : null;
  const sd = mean === null ? null : Math.sqrt(baseline.reduce((sum, count) => sum + (count - mean) ** 2, 0) / baseline.length);
  return points.map((point, index) => { const window = points.slice(Math.max(0, index - 4), index + 1).map((item) => item.caseCount).filter((count): count is number => count !== null); return { ...point, movingAverage5Week: window.length ? window.reduce((sum, count) => sum + count, 0) / window.length : null, alertThreshold: mean === null || sd === null ? null : mean + 2 * sd }; });
}

export async function getDemographicBreakdown(client: Client, options: { organizationId: string; icd10Code: string }): Promise<DemographicBreakdownCell[]> {
  assertNonSensitiveIcd10(options.icd10Code);
  const rows = await readSafeRollups(client, (query) => query.eq("organization_id", options.organizationId).eq("icd10_code", options.icd10Code));
  const cells = new Map<string, DemographicBreakdownCell>();
  for (const row of rows) { const key = `${row.age_bracket}:${row.gender}`; const prior = cells.get(key); cells.set(key, { ageBracket: row.age_bracket, gender: row.gender, caseCount: prior?.caseCount === null || row.case_count === null ? null : (prior?.caseCount ?? 0) + row.case_count, isSuppressed: prior?.isSuppressed === true || row.is_suppressed }); }
  return [...cells.values()].map((cell) => cell.isSuppressed || (cell.caseCount ?? 0) < 5 ? { ...cell, caseCount: null, isSuppressed: true } : cell);
}

export async function getBarangayChoroplethData(client: Client, options: { organizationId: string; icd10Code: string; epiYear: number; epiWeek: number }): Promise<BarangayChoroplethData> {
  assertNonSensitiveIcd10(options.icd10Code);
  const result = await client.rpc("get_barangay_choropleth" as never, { p_organization_id: options.organizationId, p_icd10_code: options.icd10Code, p_epi_year: options.epiYear, p_epi_week: options.epiWeek } as never);
  if (result.error) throw new SurveillanceError(result.error.message, result.error);
  const features = ((result.data ?? []) as unknown as ChoroplethRpcRow[]).map((row): SpatialChoroplethFeature => ({ type: "Feature", geometry: { type: geometryType(row.geometry), coordinates: geometryCoordinates(row.geometry) }, properties: { municipality: row.municipality_name, barangay: row.barangay_name, caseCount: row.is_suppressed ? null : row.case_count, incidenceRatePer10000: row.is_suppressed ? null : row.rate_per_10k, isSuppressed: row.is_suppressed } }));
  return { type: "FeatureCollection", features };
}

function geometryType(geometry: unknown): "Polygon" | "MultiPolygon" { const value = geometry as { type?: unknown } | null; if (value?.type === "Polygon" || value?.type === "MultiPolygon") return value.type; throw new SurveillanceError("Choropleth RPC returned a non-polygon geometry."); }
function geometryCoordinates(geometry: unknown): readonly unknown[] { const value = geometry as { coordinates?: unknown } | null; if (!Array.isArray(value?.coordinates)) throw new SurveillanceError("Choropleth RPC returned invalid geometry coordinates."); return value.coordinates; }
