import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@odyssey/types";
import {
  assignServicePractitioners,
  servicePractitionerAssignmentInputSchema,
  unassignServicePractitioners,
} from "../src/index.ts";

function asClient(value: object): SupabaseClient<Database> {
  return value as unknown as SupabaseClient<Database>;
}

const organizationId = "11111111-1111-4111-8111-111111111111";
const serviceId = "22222222-2222-4222-8222-222222222222";
const practitionerRoleId = "33333333-3333-4333-8333-333333333333";

test("assignment input requires valid organization, service, and practitioner role ids", () => {
  assert.equal(
    servicePractitionerAssignmentInputSchema.safeParse({
      organizationId,
      clinicServiceId: serviceId,
      practitionerRoleIds: [practitionerRoleId],
      durationMinutesOverride: 30,
    }).success,
    true,
  );
  assert.equal(
    servicePractitionerAssignmentInputSchema.safeParse({
      organizationId: "not-a-uuid",
      clinicServiceId: serviceId,
      practitionerRoleIds: [],
    }).success,
    false,
  );
});

test("assignServicePractitioners validates input and maps B4 RPC arguments", async () => {
  const calls: Array<{ name: string; args: unknown }> = [];
  const row = {
    id: "44444444-4444-4444-8444-444444444444",
    organization_id: organizationId,
    clinic_service_id: serviceId,
    practitioner_role_id: practitionerRoleId,
    is_active: true,
    duration_minutes_override: null,
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
  };
  const client = asClient({
    rpc: async (name: string, args: unknown) => {
      calls.push({ name, args });
      return { data: [row], error: null };
    },
  });

  const result = await assignServicePractitioners(client, {
    organizationId,
    clinicServiceId: serviceId,
    practitionerRoleIds: [practitionerRoleId],
  });

  assert.deepEqual(result, { data: [row], error: null });
  assert.deepEqual(calls, [
    {
      name: "assign_service_practitioners",
      args: {
        p_organization_id: organizationId,
        p_clinic_service_id: serviceId,
        p_practitioner_role_ids: [practitionerRoleId],
        p_duration_minutes_override: null,
      },
    },
  ]);
});

test("unassignServicePractitioners returns the validated affected count", async () => {
  const client = asClient({
    rpc: async () => ({ data: 1, error: null }),
  });

  const result = await unassignServicePractitioners(client, {
    organizationId,
    clinicServiceId: serviceId,
    practitionerRoleIds: [practitionerRoleId],
  });

  assert.deepEqual(result, { data: 1, error: null });
});
