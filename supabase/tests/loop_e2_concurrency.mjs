import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
if (!url || !anonKey) throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required.");

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for fixture setup.");

const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
const encounterId = "e2000000-0000-0000-0000-000000000020";
const appointmentId = "e2100000-0000-0000-0000-000000000020";
const organizationId = "10000000-0000-0000-0000-000000000001";
const patientId = "40000000-0000-0000-0000-000000000001";
const practitionerRoleId = "30000000-0000-0000-0000-000000000101";

await admin.from("encounters").delete().eq("id", encounterId);
await admin.from("appointments").delete().eq("id", appointmentId);
const { error: appointmentError } = await admin.from("appointments").insert({
  id: appointmentId,
  organization_id: organizationId,
  patient_id: patientId,
  practitioner_role_id: practitionerRoleId,
  status: "arrived",
  service_type: "E-2 concurrency test",
  delivery_mode: "in_person",
  start_at: "2040-01-20T09:00:00Z",
  end_at: "2040-01-20T09:30:00Z",
});
assert.equal(appointmentError, null, appointmentError?.message);
const { error: encounterError } = await admin.from("encounters").insert({
  id: encounterId,
  organization_id: organizationId,
  patient_id: patientId,
  appointment_id: appointmentId,
  practitioner_role_id: practitionerRoleId,
  status: "in_progress",
  version: 1,
  period_start: "2040-01-20T09:00:00Z",
});
assert.equal(encounterError, null, encounterError?.message);

try {
  const clients = Array.from({ length: 20 }, () => createClient(url, anonKey));
  await Promise.all(clients.map(async (client) => {
    const { error } = await client.auth.signInWithPassword({
      email: "doctor@synthetic.odyssey.test",
      password: "LocalOnly-2026!",
    });
    assert.equal(error, null, error?.message);
  }));
  const results = await Promise.all(clients.map((client, index) => client.rpc("add_soap_note", {
    p_encounter_id: encounterId,
    p_text: `parallel writer ${index}`,
    p_supersedes_id: null,
    p_expected_version: 1,
  })));
  const successes = results.filter(({ error }) => error === null);
  const conflicts = results.filter(({ error }) => error?.message === "ENCOUNTER_VERSION_CONFLICT" || error?.details === "ENCOUNTER_VERSION_CONFLICT");
  assert.equal(successes.length, 1, "exactly one writer must succeed");
  assert.equal(conflicts.length, 19, "the other 19 writers must receive ENCOUNTER_VERSION_CONFLICT");

  const { data, error } = await admin.from("encounters").select("version").eq("id", encounterId).single();
  assert.equal(error, null, error?.message);
  assert.equal(data.version, 2, "the version increments exactly once");
  console.log("20 parallel chart writes: 1 success, 19 ENCOUNTER_VERSION_CONFLICT, version 2");
} finally {
  await admin.from("encounters").delete().eq("id", encounterId);
  await admin.from("appointments").delete().eq("id", appointmentId);
}
