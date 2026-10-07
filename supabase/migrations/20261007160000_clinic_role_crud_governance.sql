-- Clinic Role CRUD Governance & Staff Reassignment
-- Enables full CRUD operations for clinic roles:
-- 1. Deleting custom clinic roles (safeguarded against deleting built-in roles or roles with assigned staff)
-- 2. Resetting built-in clinic role overrides back to system default permissions
-- 3. Reassigning staff members to another role (built-in or custom)

-- 1. Function to delete a custom clinic role
create or replace function public.delete_clinic_role_definition(
  p_organization_id uuid,
  p_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_normalized_code text := lower(btrim(p_code));
  v_assigned_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if not public.can_manage_organization_accounts(p_organization_id) then
    raise exception 'Role management permission is required.' using errcode = '42501';
  end if;

  -- Safeguard: Built-in catalog roles cannot be deleted
  if exists (select 1 from public.roles where name = v_normalized_code) then
    raise exception 'Built-in roles cannot be deleted.' using errcode = '42501';
  end if;

  -- Ensure custom role exists for this organization
  if not exists (
    select 1 from public.clinic_role_definitions
    where organization_id = p_organization_id and code = v_normalized_code
  ) then
    raise exception 'Role not found.' using errcode = 'P0002';
  end if;

  -- Check if any staff are actively assigned to this role
  select count(*) into v_assigned_count
  from public.practitioner_roles
  where organization_id = p_organization_id
    and role_code = v_normalized_code
    and active;

  if v_assigned_count > 0 then
    raise exception 'Cannot delete role with % active staff member(s) assigned. Reassign staff before deleting.', v_assigned_count using errcode = '23503';
  end if;

  -- Remove permission overrides
  delete from public.clinic_role_permission_overrides
  where organization_id = p_organization_id and role_code = v_normalized_code;

  -- Delete role definition
  delete from public.clinic_role_definitions
  where organization_id = p_organization_id and code = v_normalized_code;
end;
$$;

revoke all on function public.delete_clinic_role_definition(uuid, text) from public, anon;
grant execute on function public.delete_clinic_role_definition(uuid, text) to authenticated;

-- 2. Function to reset built-in role permissions back to global defaults
create or replace function public.reset_clinic_role_permissions(
  p_organization_id uuid,
  p_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_normalized_code text := lower(btrim(p_code));
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if not public.can_manage_organization_accounts(p_organization_id) then
    raise exception 'Role management permission is required.' using errcode = '42501';
  end if;

  -- Only built-in roles have global defaults to revert to
  if not exists (select 1 from public.roles where name = v_normalized_code) then
    raise exception 'Only built-in roles can be reset to default permissions.' using errcode = '22023';
  end if;

  -- Remove clinic overrides so list_clinic_role_definitions and has_organization_permission fall back to global role_permissions
  delete from public.clinic_role_permission_overrides
  where organization_id = p_organization_id and role_code = v_normalized_code;
end;
$$;

revoke all on function public.reset_clinic_role_permissions(uuid, text) from public, anon;
grant execute on function public.reset_clinic_role_permissions(uuid, text) to authenticated;

-- 3. Function to reassign a staff member's role
create or replace function public.assign_staff_role(
  p_organization_id uuid,
  p_user_id uuid,
  p_role_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_normalized_code text := lower(btrim(p_role_code));
  v_role_id uuid;
  v_practitioner_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if not public.can_manage_organization_accounts(p_organization_id) then
    raise exception 'Staff management permission is required.' using errcode = '42501';
  end if;

  -- Verify destination role exists and is active
  if not exists (select 1 from public.roles where name = v_normalized_code)
     and not exists (select 1 from public.clinic_role_definitions where organization_id = p_organization_id and code = v_normalized_code and active) then
    raise exception 'Role "%" not found or inactive.', v_normalized_code using errcode = '22023';
  end if;

  -- Admin roles (admin, owner, it_admin) live in user_roles
  if v_normalized_code in ('admin', 'owner', 'it_admin') then
    select id into v_role_id from public.roles where name = v_normalized_code;

    -- Deactivate any practitioner_roles for this organization
    update public.practitioner_roles pr
    set active = false
    from public.practitioners p
    where p.id = pr.practitioner_id
      and p.auth_user_id = p_user_id
      and pr.organization_id = p_organization_id;

    -- Upsert user_roles membership
    delete from public.user_roles
    where organization_id = p_organization_id and user_id = p_user_id;

    insert into public.user_roles (organization_id, user_id, role_id)
    values (p_organization_id, p_user_id, v_role_id);
  else
    -- Operational / clinical / custom roles live in practitioner_roles
    delete from public.user_roles
    where organization_id = p_organization_id and user_id = p_user_id;

    select id into v_practitioner_id
    from public.practitioners
    where organization_id = p_organization_id and auth_user_id = p_user_id;

    if v_practitioner_id is null then
      insert into public.practitioners (organization_id, auth_user_id, name)
      values (p_organization_id, p_user_id, jsonb_build_object('text', coalesce((select raw_user_meta_data->>'display_name' from auth.users where id = p_user_id), 'Staff')))
      returning id into v_practitioner_id;
    end if;

    if exists (
      select 1 from public.practitioner_roles
      where organization_id = p_organization_id and practitioner_id = v_practitioner_id
    ) then
      update public.practitioner_roles
      set role_code = v_normalized_code, active = true
      where organization_id = p_organization_id and practitioner_id = v_practitioner_id;
    else
      insert into public.practitioner_roles (organization_id, practitioner_id, role_code, active)
      values (p_organization_id, v_practitioner_id, v_normalized_code, true);
    end if;
  end if;
end;
$$;

revoke all on function public.assign_staff_role(uuid, uuid, text) from public, anon;
grant execute on function public.assign_staff_role(uuid, uuid, text) to authenticated;
