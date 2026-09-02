-- The initial CMS migration runs before synthetic/hosted clinic rows are
-- provisioned. Keep built-in defaults global as a fallback, then materialize
-- them for clinics that already exist without overwriting administrator edits.

insert into public.role_permissions (role_id, organization_id, permission)
select role.id, null, defaults.permission
from public.roles role
join (values
  ('admin', 'can_access_admin_portal'),
  ('admin', 'can_manage_appointments'),
  ('admin', 'can_manage_staff_roles'),
  ('owner', 'can_access_admin_portal'),
  ('owner', 'can_manage_appointments'),
  ('owner', 'can_manage_staff_roles'),
  ('front_desk', 'can_access_admin_portal'),
  ('front_desk', 'can_manage_appointments'),
  ('nurse', 'can_access_provider_portal'),
  ('nurse', 'can_record_triage'),
  ('doctor', 'can_access_provider_portal'),
  ('doctor', 'can_start_consultation'),
  ('doctor', 'can_manage_provider_schedule'),
  ('specialist', 'can_access_provider_portal'),
  ('specialist', 'can_start_consultation'),
  ('specialist', 'can_manage_provider_schedule'),
  ('inventory_staff', 'can_access_admin_portal')
) as defaults(role_name, permission) on defaults.role_name = role.name
where not exists (
  select 1 from public.role_permissions existing
  where existing.role_id = role.id
    and existing.organization_id is null
    and existing.permission = defaults.permission
);

-- Materialize only untouched administrator roles. A role that has already been
-- edited (including an intentional all-off configuration) is left untouched.
insert into public.clinic_role_permission_overrides (organization_id, role_code, permission)
select organization.id, defaults.role_code, defaults.permission
from public.organizations organization
cross join (values
  ('admin', 'role_permissions_configured'),
  ('admin', 'can_access_admin_portal'),
  ('admin', 'can_manage_appointments'),
  ('admin', 'can_manage_staff_roles'),
  ('owner', 'role_permissions_configured'),
  ('owner', 'can_access_admin_portal'),
  ('owner', 'can_manage_appointments'),
  ('owner', 'can_manage_staff_roles')
) as defaults(role_code, permission)
where not exists (
  select 1 from public.clinic_role_permission_overrides configured
  where configured.organization_id = organization.id
    and configured.role_code = defaults.role_code
    and configured.permission = 'role_permissions_configured'
)
on conflict (organization_id, role_code, permission) do nothing;

create or replace function public.list_clinic_role_definitions(p_organization_id uuid)
returns table (code text, name text, is_custom boolean, permissions text[])
language plpgsql stable security definer set search_path = public, auth
as $$
begin
  if not public.can_manage_organization_accounts(p_organization_id) then
    raise exception 'Role management permission is required.' using errcode = '42501';
  end if;
  return query
  with catalog as (
    select role.name as role_code,
      initcap(replace(role.name, '_', ' ')) as role_name,
      false as custom_role
    from public.roles role where role.name <> 'patient'
    union all
    select definition.code, definition.name, true
    from public.clinic_role_definitions definition
    where definition.organization_id = p_organization_id and definition.active
  )
  select catalog.role_code, catalog.role_name, catalog.custom_role,
    case when exists (
      select 1 from public.clinic_role_permission_overrides configured
      where configured.organization_id = p_organization_id
        and configured.role_code = catalog.role_code
        and configured.permission = 'role_permissions_configured'
    ) then coalesce((select array_agg(role_override.permission order by role_override.permission)
      from public.clinic_role_permission_overrides role_override
      where role_override.organization_id = p_organization_id
        and role_override.role_code = catalog.role_code
        and role_override.permission <> 'role_permissions_configured'), '{}'::text[])
    else coalesce((select array_agg(permission.permission order by permission.permission)
      from public.role_permissions permission
      join public.roles global_role on global_role.id = permission.role_id
      where global_role.name = catalog.role_code
        and permission.organization_id is null), '{}'::text[])
    end
  from catalog order by catalog.custom_role, catalog.role_name;
end;
$$;
