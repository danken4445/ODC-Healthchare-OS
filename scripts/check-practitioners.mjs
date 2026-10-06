import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://pjpkutapkwpvvmholjyq.supabase.co";
const supabaseAnonKey = "sb_publishable_HU3SMxXb_PcBOic5Ck7vjA_tCI_DLkP";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkPractitioners() {
  await supabase.auth.signInWithPassword({
    email: "doctor@synthetic.odyssey.test",
    password: "LocalOnly-2026!",
  });

  const { data: roles, error: rolesErr } = await supabase
    .from("practitioner_roles")
    .select("id, role_code, practitioner_id, organization_id");

  console.log("All practitioner roles:", rolesErr || roles);

  const { data: practitioners, error: pracErr } = await supabase
    .from("practitioners")
    .select("id, name");

  console.log("Practitioners:", pracErr || practitioners);

  const { data: orgs, error: orgErr } = await supabase
    .from("organizations")
    .select("id, name");

  console.log("Organizations:", orgErr || orgs);
}

checkPractitioners();
