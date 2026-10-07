-- IT Administrator Role & Access Governance
-- Adds the built-in 'it_admin' role with access to account administration,
-- department management, and inventory operations, while strictly excluding
-- clinical/provider and financial/billing modules.

-- 1. Extend roles check constraint to include 'it_admin'
alter table public.roles drop constraint if exists roles_name_check;
alter table public.roles add constraint roles_name_check check (name in (
  'patient', 'doctor', 'nurse', 'lab_staff', 'specialist', 'front_desk',
  'inventory_staff', 'admin', 'owner', 'disease_surveillance_officer', 'it_admin'
));

-- 2. Insert 'it_admin' into public.roles catalog
insert into public.roles (name)
select 'it_admin'
where not exists (select 1 from public.roles where name = 'it_admin');

-- 3. Update is_active_staff() to recognize 'it_admin' user memberships
create or replace function public.is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.practitioner_roles practitioner_role
    join public.practitioners practitioner on practitioner.id = practitioner_role.practitioner_id
    where practitioner_role.active
      and practitioner.active
      and practitioner.auth_user_id = auth.uid()
  ) or exists (
    select 1
    from public.user_roles membership
    join public.roles role on role.id = membership.role_id
    where membership.user_id = auth.uid()
      and role.name in ('admin', 'owner', 'it_admin')
  );
$$;

revoke all on function public.is_active_staff() from public;
grant execute on function public.is_active_staff() to authenticated;

-- 4. Update has_organization_role() to recognize 'it_admin' in user_roles
create or replace function public.has_organization_role(target_organization_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select not exists (
    select 1 from public.clinic_user_access_status status
    where status.organization_id = target_organization_id
      and status.user_id = auth.uid() and not status.active
  ) and (
    exists (
      select 1 from public.practitioner_roles practitioner_role
      join public.practitioners practitioner on practitioner.id = practitioner_role.practitioner_id
      where practitioner_role.organization_id = target_organization_id
        and practitioner_role.active and practitioner.active
        and practitioner.auth_user_id = auth.uid()
        and practitioner_role.role_code = any(allowed_roles)
    ) or exists (
      select 1 from public.user_roles membership
      join public.roles role on role.id = membership.role_id
      where membership.organization_id = target_organization_id
        and membership.user_id = auth.uid()
        and role.name in ('admin', 'owner', 'it_admin') and role.name = any(allowed_roles)
    )
  );
$$;

revoke all on function public.has_organization_role(uuid, text[]) from public;
grant execute on function public.has_organization_role(uuid, text[]) to authenticated;

-- 5. Update user_roles_select policy so staff administrators can inspect memberships
drop policy if exists user_roles_select on public.user_roles;
create policy user_roles_select on public.user_roles for select to authenticated
  using (
    public.is_superadmin()
    or user_id = auth.uid()
    or public.has_organization_role(organization_id, array['admin', 'owner'])
    or public.has_organization_permission(organization_id, 'can_manage_staff_roles')
  );

-- 6. Insert global default permissions for 'it_admin' in public.role_permissions
insert into public.role_permissions (role_id, organization_id, permission)
select role.id, null, defaults.permission
from public.roles role
cross join (values
  ('can_access_admin_portal'),
  ('can_manage_staff_roles'),
  ('can_view_inventory'),
  ('can_manage_inventory'),
  ('can_tag_inventory_usage')
) as defaults(permission)
where role.name = 'it_admin'
  and not exists (
    select 1
    from public.role_permissions existing
    where existing.role_id = role.id
      and existing.organization_id is null
      and existing.permission = defaults.permission
  );

-- 7. Seed clinic_role_permission_overrides for all organizations so override resolution finds it_admin
insert into public.clinic_role_permission_overrides (organization_id, role_code, permission)
select organization.id, 'it_admin', defaults.permission
from public.organizations organization
cross join (values
  ('can_access_admin_portal'),
  ('can_manage_staff_roles'),
  ('can_view_inventory'),
  ('can_manage_inventory'),
  ('can_tag_inventory_usage'),
  ('role_permissions_configured')
) as defaults(permission)
on conflict (organization_id, role_code, permission) do nothing;

-- 8. Update list_clinic_role_definitions with canonical display name for 'it_admin'
create or replace function public.list_clinic_role_definitions(p_organization_id uuid)
returns table (code text, name text, is_custom boolean, permissions text[])
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.can_manage_organization_accounts(p_organization_id) then
    raise exception 'Role management permission is required.' using errcode = '42501';
  end if;
  return query
  with catalog as (
    select role.name as role_code,
      case
        when role.name = 'it_admin' then 'IT Administrator'
        when role.name = 'disease_surveillance_officer' then 'Disease Surveillance Officer'
        else initcap(replace(role.name, '_', ' '))
      end as role_name,
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

revoke all on function public.list_clinic_role_definitions(uuid) from public, anon;
grant execute on function public.list_clinic_role_definitions(uuid) to authenticated;
