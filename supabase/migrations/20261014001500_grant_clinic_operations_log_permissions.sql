-- Rollback: remove only the can_view_audit_log default grants introduced here;
-- retain any clinic-specific grants subsequently configured through the Roles CMS.
-- Grant clinic operations log access to clinic administrators and owner roles.
-- Backfill the permission key without granting access to synthetic accounts.

-- 1. Insert can_view_audit_log into public.role_permissions for admin and owner
insert into public.role_permissions (role_id, organization_id, permission)
select role.id, null, 'can_view_audit_log'
from public.roles role
where role.name in ('admin', 'owner')
on conflict (role_id, organization_id, permission) do nothing;

-- 2. Insert can_view_audit_log into public.clinic_role_permission_overrides across all existing clinics
insert into public.clinic_role_permission_overrides (organization_id, role_code, permission)
select organization.id, grant_row.role_code, 'can_view_audit_log'
from public.organizations organization
cross join (values ('admin'), ('owner')) as grant_row(role_code)
on conflict (organization_id, role_code, permission) do nothing;
