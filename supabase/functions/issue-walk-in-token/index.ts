import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { SignJWT } from "npm:jose@5.9.6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const tokenLifetimeSeconds = 15 * 60;

type TokenRequest = {
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

Deno.serve(async (request) => {
  if (request.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST")
    return response({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  // SUPABASE_* names are reserved by hosted Supabase and cannot be added as
  // project secrets. Store the project signing secret under this custom name.
  const jwtSecret = Deno.env.get("PROJECT_JWT_SECRET");
  if (!supabaseUrl || !serviceRoleKey || !jwtSecret) {
    console.error(
      "Walk-in token function is missing required server configuration.",
    );
    return response({ error: "Walk-in sign-in is unavailable." }, 503);
  }

  let body: TokenRequest;
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
  const { data: patientId, error } = await admin.rpc("verify_walk_in_patient", {
    p_organization_id: body.organization_id,
    p_walk_in_id: body.walk_in_id,
    p_pin: body.pin,
  });

  if (error) {
    // Never log the submitted PIN or return database details to the browser.
    console.error("Walk-in verification RPC failed:", error.code, error.message);
    return response({ error: "Walk-in verification is temporarily unavailable." }, 503);
  }
  if (!patientId)
    return response({ error: "Invalid walk-in credentials." }, 401);

  const now = Math.floor(Date.now() / 1000);
  const accessToken = await new SignJWT({
    role: "authenticated",
    walk_in_access: true,
    patient_id: patientId,
    organization_id: body.organization_id,
    walk_in_id: body.walk_in_id,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(`${supabaseUrl}/auth/v1`)
    .setAudience("authenticated")
    .setSubject(patientId)
    .setIssuedAt(now)
    .setExpirationTime(now + tokenLifetimeSeconds)
    .sign(new TextEncoder().encode(jwtSecret));

  return response(
    {
      access_token: accessToken,
      token_type: "bearer",
      expires_in: tokenLifetimeSeconds,
    },
    200,
  );
});
