import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@odyssey/types";
import {
  markPractitionerAbsent,
  markPractitionerAbsentInputSchema,
  reassignAppointment,
  reassignmentInputSchema,
} from "../src/index.ts";

function asClient(value: object): SupabaseClient<Database> {
  return value as unknown as SupabaseClient<Database>;
}

const appointmentId = "11111111-1111-4111-8111-111111111111";
const practitionerRoleId = "22222222-2222-4222-8222-222222222222";
const replacementRoleId = "33333333-3333-4333-8333-333333333333";

test("reassignment contracts validate required ids and reason", () => {
  assert.equal(
    reassignmentInputSchema.safeParse({
      appointmentId,
      newPractitionerRoleId: replacementRoleId,
      reason: "Doctor unavailable",
    }).success,
    true,
  );
  assert.equal(
    reassignmentInputSchema.safeParse({
      appointmentId: "not-a-uuid",
      newPractitionerRoleId: replacementRoleId,
      reason: "x",
    }).success,
    false,
  );
  assert.equal(
    markPractitionerAbsentInputSchema.safeParse({
      practitionerRoleId,
      date: "2026-10-02",
      coveringPractitionerRoleId: replacementRoleId,
      reason: "Scheduled absence",
    }).success,
    true,
  );
});

test("reassignAppointment maps the permissioned RPC contract", async () => {
  const calls: Array<{ name: string; args: unknown }> = [];
  const client = asClient({
    rpc: async (name: string, args: unknown) => {
      calls.push({ name, args });
      return { data: appointmentId, error: null };
    },
  });
  const result = await reassignAppointment(client, {
    appointmentId,
    newPractitionerRoleId: replacementRoleId,
    reason: "Doctor unavailable",
  });
  assert.deepEqual(result, { data: appointmentId, error: null });
  assert.deepEqual(calls, [{
    name: "reassign_appointment",
    args: {
      p_appointment_id: appointmentId,
      p_new_practitioner_role_id: replacementRoleId,
      p_reason: "Doctor unavailable",
    },
  }]);
});

test("markPractitionerAbsent maps moved and not-movable counts", async () => {
  const client = asClient({
    rpc: async () => ({
      data: [{ moved_count: 2, not_movable_count: 1, results: [] }],
      error: null,
    }),
  });
  const result = await markPractitionerAbsent(client, {
    practitionerRoleId,
    date: "2026-10-02",
    coveringPractitionerRoleId: replacementRoleId,
    reason: "Scheduled absence",
  });
  assert.deepEqual(result, {
    data: { movedCount: 2, notMovableCount: 1, results: [] },
    error: null,
  });
});
