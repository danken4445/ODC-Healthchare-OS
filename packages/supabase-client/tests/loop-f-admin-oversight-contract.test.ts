import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@odyssey/types";
import { getClinicCalendar, getDoctorManagement } from "../src/index.ts";

function asClient(value: object): SupabaseClient<Database> {
  return value as unknown as SupabaseClient<Database>;
}

const organizationId = "22222222-2222-4222-8222-222222222222";

test("admin oversight wrappers call organization-scoped read RPCs", async () => {
  const calls: Array<{ name: string; args: unknown }> = [];
  const client = asClient({
    rpc: async (name: string, args: unknown) => {
      calls.push({ name, args });
      return { data: [], error: null };
    },
  });

  const calendar = await getClinicCalendar(client, {
    organizationId,
    weekStart: "2026-10-04",
    doctorRoleId: null,
    clinicServiceId: null,
  });
  const doctors = await getDoctorManagement(client, organizationId, "2026-10-02");

  assert.equal(calendar.error, null);
  assert.equal(doctors.error, null);
  assert.deepEqual(calls, [
    {
      name: "list_clinic_calendar",
      args: {
        p_organization_id: organizationId,
        p_week_start: "2026-10-04",
        p_doctor_role_id: undefined,
        p_clinic_service_id: undefined,
      },
    },
    {
      name: "list_doctor_management",
      args: { p_organization_id: organizationId, p_date: "2026-10-02" },
    },
  ]);
});

test("admin oversight wrappers reject malformed dates before RPC", async () => {
  let called = false;
  const client = asClient({ rpc: async () => { called = true; return { data: [], error: null }; } });
  const result = await getDoctorManagement(client, organizationId, "02-10-2026");
  assert.match(result.error?.message ?? "", /YYYY-MM-DD/);
  assert.equal(called, false);
});
