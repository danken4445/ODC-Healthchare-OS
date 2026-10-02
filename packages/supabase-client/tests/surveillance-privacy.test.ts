import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@odyssey/types";
import { applyComplementarySuppression, getBarangayChoroplethData, getDemographicBreakdown, getEpidemicCurve, PrivacyRejectionError } from "../src/surveillance-service.ts";

type QueryResult = { data: unknown; error: { message: string } | null };
function mockClient(rows: unknown[], rpcRows: unknown[] = []): SupabaseClient<Database> {
  const query = { eq: () => query, order: () => query, limit: () => query, then: (resolve: (result: QueryResult) => unknown) => Promise.resolve(resolve({ data: rows, error: null })) };
  return { from: () => query, rpc: () => Promise.resolve({ data: rpcRows, error: null }) } as unknown as SupabaseClient<Database>;
}

test("suppresses small demographic cells", async () => {
  const result = await getDemographicBreakdown(mockClient([{ age_bracket: "school_5_to_14", gender: "female", case_count: 4, is_suppressed: false }]), { organizationId: "org", icd10Code: "A90" });
  assert.deepEqual(result[0], { ageBracket: "school_5_to_14", gender: "female", caseCount: null, isSuppressed: true });
});

test("complementary suppression closes differencing gap", () => {
  const result = applyComplementarySuppression([{ key: "a", caseCount: null, isSuppressed: true }, { key: "b", caseCount: 8, isSuppressed: false }, { key: "c", caseCount: 2, isSuppressed: false }], 10);
  assert.equal(result.find((cell) => cell.key === "c")?.isSuppressed, true);
  assert.equal(result.find((cell) => cell.key === "c")?.caseCount, null);
});

test("rejects sensitive ICD requests", async () => {
  await assert.rejects(() => getEpidemicCurve(mockClient([]), { organizationId: "org", icd10Code: "HIV" }), PrivacyRejectionError);
});

test("choropleth uses the RPC and emits polygons without point coordinates", async () => {
  const result = await getBarangayChoroplethData(mockClient([], [{ geometry: { type: "Polygon", coordinates: [[[121, 14], [122, 14], [122, 15], [121, 14]]] }, barangay_name: "B", municipality_name: "M", case_count: null, rate_per_10k: null, is_suppressed: true }]), { organizationId: "org", icd10Code: "A90", epiYear: 2026, epiWeek: 1 });
  const serialized = JSON.stringify(result);
  assert.equal(result.features[0]?.geometry.type, "Polygon");
  assert.equal(serialized.includes('"lat"'), false);
  assert.equal(serialized.includes('"lng"'), false);
  assert.equal(result.features[0]?.properties.caseCount, null);
});

test("tenant filters are applied to every rollup read", async () => {
  const filters: string[] = [];
  const query = { eq: (column: string, value: string | number) => { filters.push(`${column}=${value}`); return query; }, order: () => query, limit: () => query, then: (resolve: (result: QueryResult) => unknown) => Promise.resolve(resolve({ data: [], error: null })) };
  const client = { from: () => query } as unknown as SupabaseClient<Database>;
  await getEpidemicCurve(client, { organizationId: "org-1", icd10Code: "A90" });
  assert.ok(filters.includes("organization_id=org-1"));
});
