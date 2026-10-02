import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
if (!url || !anonKey) {
  throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required.");
}

const slotId = "51000000-0000-0000-0000-000000000006";
const clients = Array.from({ length: 20 }, () => createClient(url, anonKey));

await Promise.all(clients.map(async (client) => {
  const { error: signInError } = await client.auth.signInWithPassword({
    email: "patient@synthetic.odyssey.test",
    password: "LocalOnly-2026!",
  });
  assert.equal(signInError, null, signInError?.message);

  const { error: contextError } = await client.rpc("set_patient_clinic_context", {
    p_organization_id: "10000000-0000-0000-0000-000000000001",
  });
  assert.equal(contextError, null, contextError?.message);
}));

const results = await Promise.all(clients.map((client) => client.rpc("book_appointment", {
  p_slot_id: slotId,
  p_delivery_mode: "in_person",
})));
const successes = results.filter((result) => result.error === null);
const conflicts = results.filter((result) => result.error?.code === "PT409" && result.error.message === "SLOT_TAKEN");

assert.equal(successes.length, 1, "exactly one concurrent reservation must succeed");
assert.equal(conflicts.length, 19, "every remaining reservation must return SLOT_TAKEN");
console.log("20 parallel booking attempts: 1 success, 19 SLOT_TAKEN conflicts");
