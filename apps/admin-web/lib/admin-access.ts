import type { ClinicRolePermission } from "@odyssey/types";

export interface AdminAccessRule {
  allowAuthenticated?: boolean;
  allowSuperadmin?: boolean;
  anyOf?: readonly ClinicRolePermission[];
  public?: boolean;
  superadminOnly?: boolean;
}

export interface AdminDestination extends AdminAccessRule {
  href: string;
}

const routeRules: readonly AdminDestination[] = [
  { href: "/superadmin", superadminOnly: true },
  { href: "/profile", allowAuthenticated: true },
  { href: "/patients/audit", anyOf: ["can_view_audit_log"] },
  { href: "/patients/import", anyOf: ["can_manage_patients"] },
  { href: "/patients/register", anyOf: ["can_manage_patients"] },
  { href: "/patients", anyOf: ["can_manage_patients"] },
  { href: "/patient-lookup", anyOf: ["can_identify_patients"] },
  { href: "/appointments", anyOf: ["can_manage_appointments"] },
  { href: "/queue", anyOf: ["can_view_clinic_queue", "can_manage_appointments", "can_record_triage"] },
  { href: "/calendar", anyOf: ["can_view_clinic_queue"] },
  { href: "/doctors", anyOf: ["can_manage_services", "can_manage_staff_roles", "can_manage_rooms", "can_manage_provider_schedule"] },
  { href: "/teleconsult", anyOf: ["can_start_consultation", "can_record_triage", "can_manage_appointments"] },
  { href: "/soap-notes", anyOf: ["can_start_consultation", "can_record_triage", "can_manage_patients"] },
  { href: "/referrals", anyOf: ["can_view_referrals", "can_order_diagnostics", "can_manage_patients"] },
  { href: "/prescriptions", anyOf: ["can_start_consultation", "can_manage_patients", "can_view_inventory", "can_manage_inventory", "can_manage_pos"] },
  { href: "/support", anyOf: ["can_manage_staff_roles", "can_manage_clinic_branding", "can_view_audit_log"] },
  { href: "/billing/claims", anyOf: ["can_view_claims", "can_manage_claims"] },
  { href: "/billing", anyOf: ["can_view_billing", "can_manage_billing", "can_manage_pos"] },
  { href: "/fees", anyOf: ["can_manage_services", "can_manage_professional_fees"] },
  { href: "/companies", anyOf: ["can_view_billing", "can_manage_billing", "can_view_claims", "can_manage_claims"] },
  { href: "/pos", anyOf: ["can_manage_pos"] },
  { href: "/payouts", anyOf: ["can_view_payouts", "can_manage_payouts"] },
  { href: "/inventory", anyOf: ["can_view_inventory", "can_manage_inventory", "can_tag_inventory_usage"] },
  { href: "/laboratory-services", anyOf: ["can_manage_laboratory_services"] },
  { href: "/staff", allowSuperadmin: true, anyOf: ["can_manage_staff_roles"] },
  { href: "/departments", allowSuperadmin: true, anyOf: ["can_manage_staff_roles", "can_manage_inventory"] },
  { href: "/roles", allowSuperadmin: true, anyOf: ["can_manage_staff_roles"] },
  { href: "/settings/departments", allowSuperadmin: true, anyOf: ["can_manage_staff_roles", "can_manage_inventory"] },
  { href: "/settings/roles", allowSuperadmin: true, anyOf: ["can_manage_staff_roles"] },
  { href: "/settings/services", allowSuperadmin: true, anyOf: ["can_manage_service_catalog"] },
  { href: "/settings/templates", allowSuperadmin: true, anyOf: ["can_manage_document_templates"] },
  { href: "/settings/branding", allowSuperadmin: true, anyOf: ["can_manage_clinic_branding"] },
  { href: "/settings/facility", allowSuperadmin: true, anyOf: ["can_manage_clinic_branding", "can_manage_staff_roles"] },
  { href: "/settings/queue", anyOf: ["can_manage_appointments"] },
  { href: "/rooms", anyOf: ["can_manage_rooms"] },
  { href: "/analytics/disease-trends", anyOf: ["can_view_analytics"] },
  { href: "/settings/features", allowSuperadmin: true, anyOf: ["can_manage_feature_modules"] },
  { href: "/waiting-room", public: true },
  { href: "/governance", anyOf: ["can_manage_patients"] },
  { href: "/", anyOf: ["can_manage_appointments", "can_manage_patients", "can_record_triage", "can_start_consultation", "can_manage_staff_roles", "can_view_analytics", "can_view_clinic_queue"] },
];

export function canAccessAdminDestination(
  rule: AdminAccessRule,
  permissions: readonly ClinicRolePermission[],
  isSuperadmin: boolean,
): boolean {
  if (rule.public) return true;
  if (rule.superadminOnly) return isSuperadmin;
  if (isSuperadmin) return true;
  return Boolean(rule.anyOf?.some((permission) => permissions.includes(permission)));
}

export function getAdminRouteRule(pathname: string): AdminAccessRule | null {
  return routeRules.find((rule) => rule.href === "/"
    ? pathname === "/"
    : pathname === rule.href || pathname.startsWith(`${rule.href}/`)) ?? null;
}
