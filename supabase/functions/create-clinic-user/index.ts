import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const assignableRoles = [
  "admin",
  "doctor",
  "nurse",
  "lab_staff",
  "specialist",
  "front_desk",
] as const;

type AssignableRole = (typeof assignableRoles)[number];

type CreateClinicUserRequest = {
  display_name?: unknown;
  email?: unknown;
  organization_id?: unknown;
  password?: unknown;
  role_code?: unknown;
};

function response(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isAssignableRole(value: unknown): value is AssignableRole {
  return typeof value === "string" && assignableRoles.includes(value as AssignableRole);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST")
    return response({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization");
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization) {
    return response({ error: "Account administration is unavailable." }, 503);
  }

  const token = authorization.replace(/^Bearer\s+/i, "");
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: callerIdentity, error: callerError } = await admin.auth.getUser(token);
  if (callerError || !callerIdentity.user)
    return response({ error: "Authentication is required." }, 401);

  let body: CreateClinicUserRequest;
  try {
    body = await request.json();
  } catch {
    return response({ error: "Invalid request." }, 400);
  }

  const displayName = typeof body.display_name === "string" ? body.display_name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (
    typeof body.organization_id !== "string" ||
    !isAssignableRole(body.role_code) ||
    displayName.length < 2 ||
    displayName.length > 120 ||
    !/^\S+@\S+\.\S+$/.test(email) ||
    password.length < 8 ||
    password.length > 128
  ) {
    return response({ error: "Enter a valid clinic account." }, 400);
  }

  // Use the caller's JWT, not the service key, for the authorization decision.
  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: canManage, error: authorizationError } = await caller.rpc(
    "can_manage_organization_accounts",
    { p_organization_id: body.organization_id },
  );
  if (authorizationError || !canManage)
    return response({ error: "You cannot manage accounts for this clinic." }, 403);

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });
  if (createError || !created.user) {
    const status = createError?.message.toLowerCase().includes("already") ? 409 : 503;
    return response({ error: status === 409 ? "An account with that email already exists." : "Unable to create the account." }, status);
  }

  let assignmentError: { message: string } | null = null;
  if (body.role_code === "admin") {
    const { data: role, error: roleError } = await admin
      .from("roles")
      .select("id")
      .eq("name", "admin")
      .single();
    if (roleError || !role) assignmentError = { message: "Admin role is unavailable." };
    else {
      const { error } = await admin.from("user_roles").insert({
        organization_id: body.organization_id,
        role_id: role.id,
        user_id: created.user.id,
      });
      if (error) assignmentError = { message: "Could not assign the admin role." };
    }
  } else {
    const { data: practitioner, error: practitionerError } = await admin
      .from("practitioners")
      .insert({
        organization_id: body.organization_id,
        auth_user_id: created.user.id,
        name: { text: displayName },
      })
      .select("id")
      .single();
    if (practitionerError || !practitioner) assignmentError = { message: "Could not create the staff profile." };
    else {
      const { error } = await admin.from("practitioner_roles").insert({
        organization_id: body.organization_id,
        practitioner_id: practitioner.id,
        role_code: body.role_code,
      });
      if (error) assignmentError = { message: "Could not assign the staff role." };
    }
  }

  if (assignmentError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return response({ error: assignmentError.message }, 503);
  }

  return response(
    { id: created.user.id, email: created.user.email, role_code: body.role_code },
    201,
  );
});
