import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://pjpkutapkwpvvmholjyq.supabase.co";
const supabaseAnonKey = "sb_publishable_HU3SMxXb_PcBOic5Ck7vjA_tCI_DLkP";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkAppointments() {
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email: "patient1@odc.com",
    password: "Test123!",
  });

  if (signInErr) {
    console.error("Sign in failed:", signInErr);
    return;
  }

  const { data: appts, error: apptErr } = await supabase
    .from("appointments")
    .select("id, status, service_type, delivery_mode, start_at");

  console.log("Appointments:", apptErr || appts);
}

checkAppointments();
