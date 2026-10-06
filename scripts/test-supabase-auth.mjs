import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://pjpkutapkwpvvmholjyq.supabase.co";
const supabaseAnonKey = "sb_publishable_HU3SMxXb_PcBOic5Ck7vjA_tCI_DLkP";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testAuth() {
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: "doctor@synthetic.odyssey.test",
    password: "LocalOnly-2026!",
  });

  if (authError) {
    console.error("Auth error:", authError);
    return;
  }

  console.log("Logged in user:", authData.user.id, authData.user.email);

  const { data: encounters, error: encError } = await supabase
    .from("encounters")
    .select("id, status, patient_id, service_type, period_start")
    .limit(5);

  console.log("Encounters:", encError || encounters);

  const { data: appointments, error: appError } = await supabase
    .from("appointments")
    .select("id, status, patient_id, encounter_id, practitioner_role_id")
    .limit(10);

  console.log("Appointments:", appError || appointments);

  const { data: specialists, error: specError } = await supabase
    .from("practitioner_roles")
    .select("id, practitioner_id, organization_id, role_code")
    .eq("role_code", "specialist")
    .limit(10);

  console.log("Specialists:", specError || specialists);
}

testAuth();
