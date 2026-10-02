import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const organizationId = "10000000-0000-0000-0000-000000000001";
const patientId = "40000000-0000-0000-0000-000000000001";
const practitionerRoleId = "30000000-0000-0000-0000-000000000101";
const secondPractitionerRoleId = "30000000-0000-0000-0000-000000000109";
const startAt = "2040-01-15T09:00:00.000Z";
const endAt = "2040-01-15T09:30:00.000Z";
const clinicAppointmentIds = Array.from(
  { length: 50 },
  (_, index) => `d1000000-0000-0000-0000-${String(index + 1).padStart(12, "0")}`,
);
const perPractitionerAppointmentIds = Array.from(
  { length: 50 },
  (_, index) => `d2000000-0000-0000-0000-${String(index + 1).padStart(12, "0")}`,
);
const clients = Array.from(
  { length: 50 },
  () => createClient(url, serviceRoleKey, { auth: { persistSession: false } }),
);

const cleanupClient = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});

await cleanupClient.from("appointments").delete().in("id", [...clinicAppointmentIds, ...perPractitionerAppointmentIds]);

try {
  const results = await Promise.all(
    clients.map((client, index) =>
      client
        .from("appointments")
        .insert({
          id: clinicAppointmentIds[index],
          organization_id: organizationId,
          patient_id: patientId,
          practitioner_role_id: practitionerRoleId,
          status: "booked",
          service_type: "Loop D queue concurrency test",
          start_at: startAt,
          end_at: endAt,
          delivery_mode: "in_person",
        })
        .select("id, queue_number")
        .single(),
    ),
  );

  const failures = results.filter((result) => result.error !== null);
  assert.equal(failures.length, 0, failures.map((result) => result.error?.message).join("; "));

  const queueNumbers = results.map((result) => result.data.queue_number);
  const uniqueQueueNumbers = new Set(queueNumbers);
  console.log(
    `50 parallel appointment inserts: ${uniqueQueueNumbers.size} unique queue numbers; duplicates: ${50 - uniqueQueueNumbers.size}`,
  );

  if (process.env.EXPECT_UNIQUE_QUEUE_NUMBERS === "true") {
    assert.equal(uniqueQueueNumbers.size, 50, "all 50 queue numbers must be unique");
  }

  const { error: clinicCleanupError } = await cleanupClient
    .from("appointments")
    .delete()
    .in("id", clinicAppointmentIds);
  assert.equal(clinicCleanupError, null, clinicCleanupError?.message);

  const { error: modeError } = await cleanupClient
    .from("organization_settings")
    .update({ queue_mode: "per_practitioner" })
    .eq("organization_id", organizationId);
  assert.equal(modeError, null, modeError?.message);
  const { error: prefixError } = await cleanupClient
    .from("practitioner_roles")
    .update({ queue_prefix: null })
    .in("id", [practitionerRoleId, secondPractitionerRoleId]);
  assert.equal(prefixError, null, prefixError?.message);

  const perPractitionerResults = await Promise.all(
    perPractitionerAppointmentIds.map((id, index) => {
      const roleId = index < 25 ? practitionerRoleId : secondPractitionerRoleId;
      return cleanupClient
        .from("appointments")
        .insert({
          id,
          organization_id: organizationId,
          patient_id: patientId,
          practitioner_role_id: roleId,
          status: "booked",
          service_type: "Loop D per-practitioner queue test",
          start_at: startAt,
          end_at: endAt,
          delivery_mode: "in_person",
        })
        .select("id, practitioner_role_id, queue_number, queue_label")
        .single();
    }),
  );
  const perPractitionerFailures = perPractitionerResults.filter((result) => result.error !== null);
  assert.equal(perPractitionerFailures.length, 0, perPractitionerFailures.map((result) => result.error?.message).join("; "));
  for (const roleId of [practitionerRoleId, secondPractitionerRoleId]) {
    const numbers = perPractitionerResults
      .filter((result) => result.data.practitioner_role_id === roleId)
      .map((result) => result.data.queue_number)
      .sort((a, b) => a - b);
    assert.deepEqual(numbers, Array.from({ length: 25 }, (_, index) => index + 1));
  }
  const labels = perPractitionerResults.map((result) => result.data.queue_label);
  assert.equal(new Set(labels).size, 50, "per-practitioner labels must be unique");
  console.log("50 parallel per-practitioner inserts: two independent 1..25 sequences; 50 unique labels");
} finally {
  await cleanupClient
    .from("organization_settings")
    .update({ queue_mode: "clinic_wide" })
    .eq("organization_id", organizationId);
  await cleanupClient
    .from("practitioner_roles")
    .update({ queue_prefix: null })
    .in("id", [practitionerRoleId, secondPractitionerRoleId]);
  const { error } = await cleanupClient.from("appointments").delete().in("id", [...clinicAppointmentIds, ...perPractitionerAppointmentIds]);
  assert.equal(error, null, error?.message);
}
