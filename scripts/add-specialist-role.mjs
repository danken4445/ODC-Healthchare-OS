import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://pjpkutapkwpvvmholjyq.supabase.co";
const supabaseAnonKey = "sb_publishable_HU3SMxXb_PcBOic5Ck7vjA_tCI_DLkP";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function addSpecialist() {
  await supabase.auth.signInWithPassword({
    email: "doctor@synthetic.odyssey.test",
    password: "LocalOnly-2026!",
  });

  // Check if admin can insert or update
  const { data: pracs } = await supabase.from("practitioners").select("id, name");
  console.log("Practitioners:", pracs);

  // Let's create or update a practitioner role with role_code = 'specialist'
  const targetPractitioner = pracs?.find(p => p.name?.text?.includes("TEST")) ?? pracs?.[0];
  if (targetPractitioner) {
    const { data, error } = await supabase.from("practitioner_roles").insert({
      organization_id: "10000000-0000-0000-0000-000000000001",
      practitioner_id: targetPractitioner.id,
      role_code: "specialist",
      active: true,
      specialty_codes: ["cardiology", "interventional_cardiology"],
    }).select();

    console.log("Insert specialist result:", error || data);
  }

  const { data: specData, error: specErr } = await supabase.rpc("get_specialist_options", {
    p_organization_id: "10000000-0000-0000-0000-000000000001",
  });
  console.log("Specialist options now:", specErr || specData);
}

addSpecialist();
