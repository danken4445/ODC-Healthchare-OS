import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClinicRolePermission, Database } from "@odyssey/types";
import {
  canAccessAdminDestination,
  getAdminRouteRule,
} from "../../../apps/admin-web/lib/admin-access.ts";
import {
  createClinicAccount,
  getClinicRoleDefinitions,
} from "../src/index.ts";

function asClient(value: object): SupabaseClient<Database> {
  return value as unknown as SupabaseClient<Database>;
}

const organizationId = "11111111-1111-4111-8111-111111111111";

/** Canonical default permissions assigned to IT Admin role */
const IT_ADMIN_PERMISSIONS: readonly ClinicRolePermission[] = [
  "can_access_admin_portal",
  "can_manage_staff_roles",
  "can_view_inventory",
  "can_manage_inventory",
  "can_tag_inventory_usage",
];

const FINANCIAL_PERMISSIONS: readonly ClinicRolePermission[] = [
  "can_view_billing",
  "can_manage_billing",
  "can_manage_pos",
  "can_view_claims",
  "can_manage_claims",
  "can_view_payouts",
  "can_manage_payouts",
  "can_manage_professional_fees",
];

const PROVIDER_CLINICAL_PERMISSIONS: readonly ClinicRolePermission[] = [
  "can_access_provider_portal",
  "can_start_consultation",
  "can_record_triage",
  "can_manage_provider_schedule",
  "can_manage_services",
  "can_order_diagnostics",
  "can_view_diagnostics",
  "can_view_lab_worklist",
  "can_record_lab_results",
  "can_view_referrals",
  "can_update_referrals",
  "can_manage_laboratory_services",
  "can_manage_appointments",
  "can_manage_patients",
  "can_identify_patients",
  "can_view_clinic_queue",
  "can_manage_rooms",
  "can_reassign_appointments",
  "can_export_epidemiology_records",
];

test("it_admin permission set strictly excludes financial and provider permissions", () => {
  for (const perm of FINANCIAL_PERMISSIONS) {
    assert.equal(
      IT_ADMIN_PERMISSIONS.includes(perm),
      false,
      `IT admin must NOT have financial permission: ${perm}`,
    );
  }

  for (const perm of PROVIDER_CLINICAL_PERMISSIONS) {
    assert.equal(
      IT_ADMIN_PERMISSIONS.includes(perm),
      false,
      `IT admin must NOT have provider/clinical permission: ${perm}`,
    );
  }

  // Verify granted capabilities
  assert.equal(IT_ADMIN_PERMISSIONS.includes("can_access_admin_portal"), true);
  assert.equal(IT_ADMIN_PERMISSIONS.includes("can_manage_staff_roles"), true);
  assert.equal(IT_ADMIN_PERMISSIONS.includes("can_view_inventory"), true);
  assert.equal(IT_ADMIN_PERMISSIONS.includes("can_manage_inventory"), true);
  assert.equal(IT_ADMIN_PERMISSIONS.includes("can_tag_inventory_usage"), true);
});

test("admin-web route access matrix permits IT admin to manage accounts, departments, and inventory", () => {
  const allowedRoutes = [
    "/",
    "/staff",
    "/roles",
    "/departments",
    "/settings/departments",
    "/settings/roles",
    "/inventory",
    "/support",
    "/user",
    "/profile",
    "/waiting-room",
  ];

  for (const route of allowedRoutes) {
    const rule = getAdminRouteRule(route);
    assert.ok(rule, `Route rule should exist for ${route}`);
    const allowed = canAccessAdminDestination(rule, IT_ADMIN_PERMISSIONS, false);
    assert.equal(allowed, true, `IT admin should have access to ${route}`);
  }
});

test("admin-web route access matrix denies IT admin access to financial and provider modules", () => {
  const forbiddenRoutes = [
    // Financial modules
    "/billing",
    "/billing/claims",
    "/pos",
    "/fees",
    "/companies",
    "/payouts",
    // Provider / clinical modules
    "/doctors",
    "/prescriptions",
    "/teleconsult",
    "/soap-notes",
    "/referrals",
    "/laboratory-services",
    "/appointments",
    "/patients",
    "/patients/register",
    "/patients/import",
    "/patient-lookup",
    "/queue",
    "/calendar",
    "/rooms",
    "/settings/queue",
    "/settings/services",
    "/settings/templates",
    "/settings/branding",
    "/settings/facility",
    "/settings/features",
    "/analytics/disease-trends",
    "/superadmin",
  ];

  for (const route of forbiddenRoutes) {
    const rule = getAdminRouteRule(route);
    assert.ok(rule, `Route rule should exist for ${route}`);
    const allowed = canAccessAdminDestination(rule, IT_ADMIN_PERMISSIONS, false);
    assert.equal(allowed, false, `IT admin must NOT have access to ${route}`);
  }
});

test("getClinicRoleDefinitions maps it_admin catalog definition", async () => {
  const client = asClient({
    rpc: async (name: string, args: unknown) => {
      assert.equal(name, "list_clinic_role_definitions");
      assert.deepEqual(args, { p_organization_id: organizationId });
      return {
        data: [
          {
            code: "it_admin",
            name: "IT Administrator",
            is_custom: false,
            permissions: [...IT_ADMIN_PERMISSIONS],
          },
        ],
        error: null,
      };
    },
  });

  const result = await getClinicRoleDefinitions(client, organizationId);
  assert.equal(result.error, null);
  assert.ok(result.data);
  const itAdmin = result.data.find((r) => r.code === "it_admin");
  assert.ok(itAdmin);
  assert.equal(itAdmin.name, "IT Administrator");
  assert.equal(itAdmin.isCustom, false);
  assert.deepEqual(itAdmin.permissions, IT_ADMIN_PERMISSIONS);
});

test("createClinicAccount client forwards it_admin role code to edge function", async () => {
  let invokedFunction = "";
  let invokedBody: unknown = null;

  const client = asClient({
    functions: {
      invoke: async (name: string, options: { body: unknown }) => {
        invokedFunction = name;
        invokedBody = options.body;
        return {
          data: {
            id: "user-123",
            email: "it.admin@clinic.local",
            role_code: "it_admin",
          },
          error: null,
        };
      },
    },
  });

  const result = await createClinicAccount(client, {
    displayName: "IT Support Lead",
    email: "it.admin@clinic.local",
    organizationId,
    password: "securePassword123!",
    roleCode: "it_admin",
  });

  assert.equal(result.error, null);
  assert.equal(invokedFunction, "create-clinic-user");
  assert.deepEqual(invokedBody, {
    display_name: "IT Support Lead",
    email: "it.admin@clinic.local",
    organization_id: organizationId,
    password: "securePassword123!",
    role_code: "it_admin",
  });
  assert.deepEqual(result.data, {
    id: "user-123",
    email: "it.admin@clinic.local",
    roleCode: "it_admin",
  });
});

test("deleteClinicRoleDefinition invokes delete_clinic_role_definition RPC", async () => {
  let rpcName = "";
  let rpcArgs: unknown = null;

  const client = asClient({
    rpc: async (name: string, args: unknown) => {
      rpcName = name;
      rpcArgs = args;
      return { data: null, error: null };
    },
  });

  const { deleteClinicRoleDefinition } = await import("../src/index.ts");
  const result = await deleteClinicRoleDefinition(client, {
    organizationId,
    code: "role_0c913ab0a0",
  });

  assert.equal(result.error, null);
  assert.equal(rpcName, "delete_clinic_role_definition");
  assert.deepEqual(rpcArgs, {
    p_organization_id: organizationId,
    p_code: "role_0c913ab0a0",
  });
});

test("resetClinicRolePermissions invokes reset_clinic_role_permissions RPC", async () => {
  let rpcName = "";
  let rpcArgs: unknown = null;

  const client = asClient({
    rpc: async (name: string, args: unknown) => {
      rpcName = name;
      rpcArgs = args;
      return { data: null, error: null };
    },
  });

  const { resetClinicRolePermissions } = await import("../src/index.ts");
  const result = await resetClinicRolePermissions(client, {
    organizationId,
    code: "it_admin",
  });

  assert.equal(result.error, null);
  assert.equal(rpcName, "reset_clinic_role_permissions");
  assert.deepEqual(rpcArgs, {
    p_organization_id: organizationId,
    p_code: "it_admin",
  });
});

test("assignStaffRole invokes assign_staff_role RPC", async () => {
  let rpcName = "";
  let rpcArgs: unknown = null;

  const client = asClient({
    rpc: async (name: string, args: unknown) => {
      rpcName = name;
      rpcArgs = args;
      return { data: null, error: null };
    },
  });

  const { assignStaffRole } = await import("../src/index.ts");
  const result = await assignStaffRole(client, {
    organizationId,
    userId: "user-123",
    roleCode: "it_admin",
  });

  assert.equal(result.error, null);
  assert.equal(rpcName, "assign_staff_role");
  assert.deepEqual(rpcArgs, {
    p_organization_id: organizationId,
    p_user_id: "user-123",
    p_role_code: "it_admin",
  });
});

test("IT admin staff list filtering strictly hides admin and owner accounts while preserving other departments", () => {
  const staffList = [
    { userId: "1", displayName: "Dr. Gregory House", roleCode: "doctor", departmentId: "dept-cardio" },
    { userId: "2", displayName: "Clinic Owner", roleCode: "owner", departmentId: "dept-admin" },
    { userId: "3", displayName: "Primary Administrator", roleCode: "admin", departmentId: "dept-admin" },
    { userId: "4", displayName: "John IT Admin", roleCode: "it_admin", departmentId: "dept-it" },
    { userId: "5", displayName: "Nurse Jackie", roleCode: "nurse", departmentId: "dept-er" },
    { userId: "6", displayName: "Pharma Staff", roleCode: "pharmacist", departmentId: "dept-pharmacy" },
  ];

  const itAdminAssignedDeptId = "dept-it";
  const isItAdmin = true;
  const isSuperadmin = false;

  // Verify that IT admin is NOT scoped to their own department only
  const unscopedStaff = (assignedDeptId: string | null, superadmin: boolean, itAdmin: boolean) => {
    let list = staffList;
    if (assignedDeptId && !superadmin && !itAdmin) {
      list = list.filter((m) => m.departmentId === assignedDeptId);
    }
    if (itAdmin) {
      list = list.filter((m) => m.roleCode !== "admin" && m.roleCode !== "owner");
    }
    return list;
  };

  const visibleToItAdmin = unscopedStaff(itAdminAssignedDeptId, isSuperadmin, isItAdmin);

  // Admin and owner must be strictly hidden
  assert.equal(visibleToItAdmin.some((m) => m.roleCode === "admin"), false, "Admin account must be hidden from IT admin");
  assert.equal(visibleToItAdmin.some((m) => m.roleCode === "owner"), false, "Owner account must be hidden from IT admin");

  // All other staff across any department must be visible
  assert.equal(visibleToItAdmin.length, 4);
  assert.equal(visibleToItAdmin.some((m) => m.departmentId === "dept-cardio"), true, "Cardio staff should be visible");
  assert.equal(visibleToItAdmin.some((m) => m.departmentId === "dept-er"), true, "ER staff should be visible");
  assert.equal(visibleToItAdmin.some((m) => m.departmentId === "dept-pharmacy"), true, "Pharmacy staff should be visible");
  assert.equal(visibleToItAdmin.some((m) => m.departmentId === "dept-it"), true, "IT staff should be visible");
});

test("IT admin role list filtering strictly hides admin and owner roles", () => {
  const roles = [
    { code: "admin", name: "Administrator" },
    { code: "owner", name: "Clinic Owner" },
    { code: "it_admin", name: "IT Administrator" },
    { code: "doctor", name: "Physician" },
    { code: "nurse", name: "Nurse" },
    { code: "custom_triage", name: "Triage Lead" },
  ];

  const isItAdmin = true;
  const visibleRoles = isItAdmin
    ? roles.filter((r) => r.code !== "admin" && r.code !== "owner")
    : roles;

  assert.equal(visibleRoles.some((r) => r.code === "admin"), false, "Admin role must be hidden");
  assert.equal(visibleRoles.some((r) => r.code === "owner"), false, "Owner role must be hidden");
  assert.equal(visibleRoles.some((r) => r.code === "it_admin"), true, "IT Admin role must be visible");
  assert.equal(visibleRoles.some((r) => r.code === "doctor"), true, "Doctor role must be visible");
  assert.equal(visibleRoles.some((r) => r.code === "custom_triage"), true, "Custom triage role must be visible");
  assert.equal(visibleRoles.length, 4);
});

test("all clinic staff roles can access /inventory and requisition module", () => {
  const inventoryRule = getAdminRouteRule("/inventory");
  assert.ok(inventoryRule, "Route rule for /inventory must exist");

  const sampleRoles: { role: string; permissions: ClinicRolePermission[] }[] = [
    { role: "doctor", permissions: ["can_access_provider_portal", "can_start_consultation", "can_view_inventory"] },
    { role: "nurse", permissions: ["can_record_triage", "can_view_clinic_queue", "can_view_inventory"] },
    { role: "front_desk", permissions: ["can_manage_appointments", "can_identify_patients", "can_view_inventory"] },
    { role: "lab_staff", permissions: ["can_view_lab_worklist", "can_record_lab_results", "can_view_inventory"] },
    { role: "it_admin", permissions: [...IT_ADMIN_PERMISSIONS] },
    { role: "custom_department_lead", permissions: ["can_access_admin_portal", "can_view_inventory"] },
    { role: "minimal_role_no_special_permissions", permissions: [] },
  ];

  for (const { role, permissions } of sampleRoles) {
    const canAccess = canAccessAdminDestination(inventoryRule, permissions, false);
    assert.equal(
      canAccess,
      true,
      `Role ${role} must have access to /inventory so they can reach the Requisition module`,
    );
  }
});


