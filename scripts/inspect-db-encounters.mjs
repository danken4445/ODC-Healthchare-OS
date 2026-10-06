import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTYxNDU5MjQwMCwiZXhwIjoxOTI5OTY4NDAwfQ.kb_t_h_W_local_service_key_placeholder";

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkEncounters() {
  const { data: encounters, error: encErr } = await supabase
    .from("encounters")
    .select("id, status, patient_id, service_type, period_start")
    .limit(10);

  console.log("Encounters:", encErr || encounters);

  const { data: appointments, error: appErr } = await supabase
    .from("appointments")
    .select("id, status, patient_id, encounter_id")
    .limit(10);

  console.log("Appointments:", appErr || appointments);

  const { data: specialists, error: specErr } = await supabase
    .from("practitioner_roles")
    .select("id, practitioner_id, organization_id, role_code")
    .limit(10);

  console.log("Specialist / Roles:", specErr || specialists);
}

checkEncounters();
