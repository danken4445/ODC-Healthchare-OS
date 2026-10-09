-- Inventory visibility is organization-wide and read-only for every
-- non-patient role. Department assignment continues to govern mutations.

insert into public.role_permissions (role_id, organization_id, permission)
select role.id, null, 'can_view_inventory'
from public.roles role
where role.name <> 'patient'
on conflict (role_id, organization_id, permission) do nothing;

insert into public.clinic_role_permission_overrides (organization_id, role_code, permission)
select organization.id, role.name, 'can_view_inventory'
from public.organizations organization
cross join public.roles role
where role.name <> 'patient'
on conflict (organization_id, role_code, permission) do nothing;

insert into public.clinic_role_permission_overrides (organization_id, role_code, permission)
select definition.organization_id, definition.code, 'can_view_inventory'
from public.clinic_role_definitions definition
on conflict (organization_id, role_code, permission) do nothing;
