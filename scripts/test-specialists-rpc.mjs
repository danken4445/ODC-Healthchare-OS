import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://pjpkutapkwpvvmholjyq.supabase.co";
const supabaseAnonKey = "sb_publishable_HU3SMxXb_PcBOic5Ck7vjA_tCI_DLkP";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testSpecialists() {
  await supabase.auth.signInWithPassword({
    email: "doctor@synthetic.odyssey.test",
    password: "LocalOnly-2026!",
  });

  const { data, error } = await supabase.rpc("get_specialist_options", {
    p_organization_id: "10000000-0000-0000-0000-000000000001",
  });

  console.log("RPC get_specialist_options result:", error || data);
}

testSpecialists();
