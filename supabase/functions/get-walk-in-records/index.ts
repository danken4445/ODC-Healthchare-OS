import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type WalkInRequest = {
  organization_id?: unknown;
  walk_in_id?: unknown;
  pin?: unknown;
};

function response(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Walk-in users do not have an auth.users account. This endpoint verifies the
// one-time ID/PIN server-side, then returns only that patient's records. The
// service key never leaves the Edge Function and no JWT is minted or persisted.
Deno.serve(async (request) => {
  if (request.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST")
    return response({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Walk-in records function is missing server configuration.");
    return response({ error: "Walk-in access is unavailable." }, 503);
  }

  let body: WalkInRequest;
  try {
    body = await request.json();
  } catch {
    return response({ error: "Invalid request." }, 400);
  }

  if (
    typeof body.organization_id !== "string" ||
    typeof body.walk_in_id !== "string" ||
    typeof body.pin !== "string" ||
    !/^WK-\d{4}-\d{6}$/.test(body.walk_in_id) ||
    !/^\d{4}$/.test(body.pin)
  ) {
    return response({ error: "Invalid walk-in credentials." }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: patientId, error: verificationError } = await admin.rpc(
    "verify_walk_in_patient",
    {
      p_organization_id: body.organization_id,
      p_walk_in_id: body.walk_in_id,
      p_pin: body.pin,
    },
  );

  if (verificationError) {
    console.error(
      "Walk-in verification RPC failed:",
      verificationError.code,
      verificationError.message,
    );
    return response(
      { error: "Walk-in access is temporarily unavailable." },
      503,
    );
  }
  if (!patientId)
    return response({ error: "Invalid walk-in credentials." }, 401);

  const [patient, appointments, encounters, observations] = await Promise.all([
    admin
      .from("patients")
      .select("id, name, walk_in_id")
      .eq("id", patientId)
      .eq("organization_id", body.organization_id)
      .maybeSingle(),
    admin
      .from("appointments")
      .select(
        "id, organization_id, patient_id, practitioner_role_id, status, service_type, appointment_type, start_at, end_at, minutes_duration, description, patient_instruction",
      )
      .eq("patient_id", patientId)
      .eq("organization_id", body.organization_id)
      .order("start_at", { ascending: true }),
    admin
      .from("encounters")
      .select("id, status, period_start")
      .eq("patient_id", patientId)
      .eq("organization_id", body.organization_id),
    admin
      .from("observations")
      .select("id, code, status, value")
      .eq("patient_id", patientId)
      .eq("organization_id", body.organization_id),
  ]);

  const recordError =
    patient.error ||
    appointments.error ||
    encounters.error ||
    observations.error;
  if (recordError || !patient.data) {
    console.error(
      "Walk-in record query failed:",
      recordError?.code ?? "patient_missing",
    );
    return response(
      { error: "Walk-in access is temporarily unavailable." },
      503,
    );
  }

  const { error: auditError } = await admin.from("audit_log").insert({
    organization_id: body.organization_id,
    actor_id: patientId,
    actor_type: "walk_in_patient",
    action: "read",
    table_name: "patients",
    record_id: patientId,
    metadata: { access_via: "walk_in_pin" },
  });
  if (auditError) {
    console.error("Walk-in access audit failed:", auditError.code);
    return response(
      { error: "Walk-in access is temporarily unavailable." },
      503,
    );
  }

  return response(
    {
      patients: [patient.data],
      appointments: appointments.data ?? [],
      encounters: encounters.data ?? [],
      observations: observations.data ?? [],
    },
    200,
  );
});
