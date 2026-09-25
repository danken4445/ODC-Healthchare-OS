-- Return the current user's effective clinic permissions in one request so
-- portal navigation can be permission-aware without issuing one RPC per item.
-- The result mirrors has_organization_permission, including account-disable
-- checks and the complete-set semantics of clinic role overrides.

create or replace function public.get_my_organization_permissions(
  p_organization_id uuid
)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  with enabled_caller as (
    select not exists (
      select 1
      from public.clinic_user_access_status status
      where status.organization_id = p_organization_id
        and status.user_id = auth.uid()
        and not status.active
    ) as active
  ), caller_roles as (
    select practitioner_role.role_code
    from public.practitioner_roles practitioner_role
    join public.practitioners practitioner
      on practitioner.id = practitioner_role.practitioner_id
    cross join enabled_caller
    where enabled_caller.active
      and practitioner.auth_user_id = auth.uid()
      and practitioner.active
      and practitioner_role.active
      and practitioner_role.organization_id = p_organization_id
    union
    select role.name
    from public.user_roles membership
    join public.roles role on role.id = membership.role_id
    cross join enabled_caller
    where enabled_caller.active
      and membership.user_id = auth.uid()
      and membership.organization_id = p_organization_id
  ), effective_permissions as (
    select role_override.permission
    from caller_roles caller_role
    join public.clinic_role_permission_overrides role_override
      on role_override.organization_id = p_organization_id
      and role_override.role_code = caller_role.role_code
    where role_override.permission <> 'role_permissions_configured'

    union

    select permission.permission
    from caller_roles caller_role
    join public.roles role on role.name = caller_role.role_code
    join public.role_permissions permission
      on permission.role_id = role.id
      and permission.organization_id is null
    where not exists (
      select 1
      from public.clinic_role_permission_overrides role_override
      where role_override.organization_id = p_organization_id
        and role_override.role_code = caller_role.role_code
    )
  )
  select coalesce(
    array_agg(distinct permission order by permission),
    '{}'::text[]
  )
  from effective_permissions;
$$;

revoke all on function public.get_my_organization_permissions(uuid)
  from public, anon, authenticated;
grant execute on function public.get_my_organization_permissions(uuid)
  to authenticated;
